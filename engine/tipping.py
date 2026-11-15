"""Tipping-point engine: what would have to change for a different route to win?

For one decision we vary a single input at a time and find the nearest value at which
the recommendation switches:

  * late-day penalty      (how much the customer cares about time)
  * deadline              (days earlier / later)
  * carbon price          (how much emissions are priced)
  * an alternative's risk (how much safer it would need to be to win)
  * the chosen route's risk (how wrong our risk estimate can be before we'd switch)

A coarse grid finds the flip, bisection refines it. Because the simulation uses common
random numbers, the decision changes only when the parameter changes, so the boundary is clean.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Callable, List, Optional, Tuple

import numpy as np

from config import assumptions as A
from .models import Route, Shipment
from .optimizer import CANDIDATE, DOMINATED, UNRELIABLE, Recommendation, recommend
from .simulation import disruption_prob


@dataclass
class TippingPoint:
    parameter: str
    current: float
    threshold: float
    new_route: str
    sentence: str
    distance: float      # relative distance from today's value (for ranking: smaller = more fragile)


def _winner(sh: Shipment, mode: str, n_sims: int = A.CONFIDENCE_SIMS, **kw) -> Optional[str]:
    rec = recommend(sh, mode=mode, n_sims=n_sims, **kw)
    return rec.chosen.route.route_id if rec.chosen else None


def _scan(values: np.ndarray, decide: Callable[[float], Optional[str]], base: str,
          refine: int = 6) -> Optional[Tuple[float, str]]:
    """Walk outward through ``values`` (ordered from the current value); return (threshold, new winner)."""
    prev = values[0]
    for v in values[1:]:
        w = decide(v)
        if w != base:
            lo, hi, new = prev, v, w
            for _ in range(refine):
                mid = (lo + hi) / 2
                wm = decide(mid)
                if wm == base:
                    lo = mid
                else:
                    hi, new = mid, wm
            return hi, new
        prev = v
    return None


def _scale_risk(route: Route, f: float) -> Route:
    legs = tuple(replace(l, delay_prob=min(1.0, l.delay_prob * f), geo_risk=min(1.0, l.geo_risk * f))
                 for l in route.legs)
    return replace(route, legs=legs)


def _with_route(sh: Shipment, new: Route) -> Shipment:
    return replace(sh, routes=tuple(new if r.route_id == new.route_id else r for r in sh.routes))


def _route_p_dis(route: Route) -> float:
    p = disruption_prob(np.array([l.geo_risk for l in route.legs]), np.array([l.congestion for l in route.legs]))
    return float(1 - np.prod(1 - p))


def find_tipping_points(rec: Recommendation) -> List[TippingPoint]:
    if rec.chosen is None:
        return []
    sh, mode = rec.shipment, rec.mode
    base = rec.chosen.route.route_id
    chosen_name = rec.chosen.route.name
    names = {r.route_id: r.name for r in sh.routes}
    out: List[TippingPoint] = []

    # The scans re-decide with fewer simulations to stay fast. On a close call that cheaper
    # re-decision can already disagree with the full decision at today's inputs, which would
    # report a "tipping point" at zero change. Use the full simulation count in that case.
    n = A.CONFIDENCE_SIMS if _winner(sh, mode) == base else A.N_SIMS

    def _win(s: Shipment, m: str, **kw) -> Optional[str]:
        r = recommend(s, mode=m, n_sims=n, **kw)
        return r.chosen.route.route_id if r.chosen else None

    def _label(rid: Optional[str]) -> str:
        return names.get(rid, rid) if rid else "no route"

    # 1) late-day penalty
    pen = sh.delay_penalty_usd_per_day
    if pen > 0:
        for grid in (pen * np.geomspace(1, 10, 25), pen * np.geomspace(1, 0.1, 25)):
            hit = _scan(grid, lambda v: _win(sh, mode, penalty_per_day=v), base)
            if hit:
                t, new = hit
                word = "rose above" if t > pen else "fell below"
                out.append(TippingPoint("late-day penalty", pen, t, _label(new),
                                        f"If a late day cost the customer more than ${t:,.0f} instead of ${pen:,.0f}, "
                                        f"{_label(new)} would win." if t > pen else
                                        f"If a late day cost less than ${t:,.0f} instead of ${pen:,.0f}, "
                                        f"{_label(new)} would win.", abs(np.log(t / pen))))

    # 2) deadline
    d0 = sh.deadline_days
    for grid in (d0 + np.arange(0, 10.5, 0.5), d0 - np.arange(0, 10.5, 0.5)):
        grid = grid[grid > 0]
        hit = _scan(grid, lambda v: _win(replace(sh, deadline_days=float(v)), mode), base)
        if hit:
            t, new = hit
            delta = t - d0
            out.append(TippingPoint("deadline", d0, t, _label(new),
                                    f"With a deadline {abs(delta):.1f} days {'later' if delta > 0 else 'earlier'} "
                                    f"({t:.1f} days), " + (f"{_label(new)} would win." if new else
                                                           "no route would pass the rules."), abs(delta) / d0))

    # 3) carbon price
    c0 = A.CARBON_PRICE_USD_PER_TONNE
    hit = _scan(np.linspace(c0, 1000, 30), lambda v: _win(sh, mode, carbon_price=v), base)
    if hit:
        t, new = hit
        out.append(TippingPoint("carbon price", c0, t, _label(new),
                                f"At a carbon price above ${t:,.0f}/tonne (now ${c0:,.0f}), {_label(new)} "
                                f"would win.", abs(np.log(t / c0))))

    # 4) closest alternative becoming safer
    best_alt = None
    for e in rec.evaluations:
        if e.route.route_id == base or e.status not in (CANDIDATE, DOMINATED, UNRELIABLE):
            continue
        route = e.route
        grid = np.linspace(1.0, 0.05, 20)
        hit = _scan(grid, lambda f: _win(_with_route(sh, _scale_risk(route, f)), mode), base)
        if hit and hit[1] == route.route_id and (best_alt is None or hit[0] > best_alt[1]):
            best_alt = (route, hit[0])
    if best_alt:
        route, f = best_alt
        p_now, p_new = _route_p_dis(route), _route_p_dis(_scale_risk(route, f))
        detail = f" (disruption chance {p_now:.1%} -> {p_new:.1%})" if f"{p_now:.1%}" != f"{p_new:.1%}" else ""
        out.append(TippingPoint(f"{route.name} risk", 1.0, f, route.name,
                                f"If {route.name}'s delay and disruption risk were {1 - f:.0%} lower"
                                f"{detail}, it would become the pick.", 1 - f))

    # 5) chosen route being riskier than estimated
    chosen = rec.chosen.route
    hit = _scan(np.linspace(1.0, 5.0, 25), lambda f: _win(_with_route(sh, _scale_risk(chosen, f)), mode), base)
    if hit:
        f, new = hit
        out.append(TippingPoint(f"{chosen_name} risk", 1.0, f, _label(new),
                                f"If {chosen_name}'s risk is underestimated by more than {f - 1:.0%}, "
                                f"{_label(new)} would take over.", f - 1))
    else:
        out.append(TippingPoint(f"{chosen_name} risk", 1.0, 5.0, chosen_name,
                                f"{chosen_name} stays the pick even if its risk is 5x higher than estimated.", 4.0))

    # a flip right at today's value is not a useful "what would change it" statement
    out = [t for t in out if t.distance > 1e-6]
    return sorted(out, key=lambda t: t.distance)
