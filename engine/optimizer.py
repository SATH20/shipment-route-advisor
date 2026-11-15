"""Orchestrates the decision pipeline for one shipment.

  hard rules (A) -> simulation -> reliability rules (B) -> Pareto filter -> economic score -> pick

Every route ends with a status and a reason, so the explanation layer never has to guess.

CLI:  python -m engine.optimizer S001 [--mode expected|play_safe]
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from config import assumptions as A
from .constraints import hard_rule_violations, reliability_violations
from .models import Route, Shipment
from .pareto import pareto_filter
from .scoring import score
from .simulation import RouteMetrics, simulate_route

RECOMMENDED, CANDIDATE, DOMINATED, UNRELIABLE, NOT_ALLOWED = (
    "recommended", "candidate", "dominated", "fails reliability", "not allowed")


@dataclass
class RouteEvaluation:
    route: Route
    status: str
    reasons: List[str] = field(default_factory=list)
    metrics: Optional[RouteMetrics] = None
    score: Optional[float] = None


@dataclass
class Recommendation:
    shipment: Shipment
    mode: str
    evaluations: List[RouteEvaluation]
    chosen: Optional[RouteEvaluation]
    warnings: List[str] = field(default_factory=list)

    @property
    def ranked(self) -> List[RouteEvaluation]:
        """Eligible routes (recommended + candidates) best first."""
        el = [e for e in self.evaluations if e.status in (RECOMMENDED, CANDIDATE)]
        return sorted(el, key=lambda e: e.score)

    @property
    def runner_up(self) -> Optional[RouteEvaluation]:
        r = self.ranked
        return r[1] if len(r) > 1 else None

    def by_id(self, route_id: str) -> RouteEvaluation:
        return next(e for e in self.evaluations if e.route.route_id == route_id)


def recommend(shipment: Shipment, mode: Optional[str] = None, n_sims: int = A.N_SIMS,
              keep_samples: bool = False, carbon_price: float = A.CARBON_PRICE_USD_PER_TONNE,
              penalty_per_day: Optional[float] = None, cargo_value: Optional[float] = None,
              min_on_time: Optional[float] = None) -> Recommendation:
    mode = mode or shipment.risk_mode
    target = shipment.min_on_time if min_on_time is None else min_on_time
    evals: Dict[str, RouteEvaluation] = {}
    warnings: List[str] = []

    # Stage A: hard rules
    allowed: List[Route] = []
    for r in shipment.routes:
        v = hard_rule_violations(shipment, r)
        evals[r.route_id] = RouteEvaluation(r, NOT_ALLOWED, v) if v else RouteEvaluation(r, CANDIDATE)
        if not v:
            allowed.append(r)
    if not allowed:
        return Recommendation(shipment, mode, list(evals.values()), None,
                              ["No route satisfies the hard rules - manual planning required."])

    # Simulation (every allowed route)
    for r in allowed:
        m = simulate_route(r, shipment, n=n_sims, keep_samples=keep_samples, carbon_price=carbon_price,
                           penalty_per_day=penalty_per_day, cargo_value=cargo_value)
        evals[r.route_id].metrics = m
        evals[r.route_id].score = score(m, mode)

    # Stage B: reliability rules
    reliable = []
    for r in allowed:
        e = evals[r.route_id]
        if target > 0 and e.metrics.p_on_time < target:
            e.status = UNRELIABLE
            e.reasons = reliability_violations(shipment, e.metrics) if min_on_time is None else [
                f"on-time probability {e.metrics.p_on_time:.0%} is below the {target:.0%} target"]
        else:
            reliable.append(r)

    if not reliable:
        # nothing meets the reliability target: recommend the most reliable allowed route, flagged
        best = max(allowed, key=lambda r: (evals[r.route_id].metrics.p_on_time, -evals[r.route_id].score))
        evals[best.route_id].status = RECOMMENDED
        warnings.append(f"No allowed route reaches the {target:.0%} on-time target; recommending the most "
                        f"reliable option ({evals[best.route_id].metrics.p_on_time:.0%}). Flag for manual review.")
        return Recommendation(shipment, mode, list(evals.values()), evals[best.route_id], warnings)

    # Pareto filter among reliable routes
    front, dominated = pareto_filter([evals[r.route_id].metrics for r in reliable], mode)
    names = {r.route_id: r.name for r in shipment.routes}
    for rid, by in dominated.items():
        evals[rid].status = DOMINATED
        evals[rid].reasons = [f"{names[by]} is at least as good on cost, time, reliability, risk and CO2"]

    # Economic score picks the winner
    best_id = min(front, key=lambda rid: evals[rid].score)
    evals[best_id].status = RECOMMENDED
    return Recommendation(shipment, mode, list(evals.values()), evals[best_id], warnings)


# ---------------------------------------------------------------------------- CLI
def format_recommendation(rec: Recommendation) -> str:
    s = rec.shipment
    lines = [
        f"Shipment {s.shipment_id}: {s.origin} -> {s.destination} | {s.cargo_type} ({s.profile}) | "
        f"value ${s.cargo_value_usd:,.0f} | deadline {s.deadline_days:g} d | late day ${s.delay_penalty_usd_per_day:,.0f}",
        f"Mode: {rec.mode}" + (f" | budget ${s.budget_usd:,.0f}" if s.budget_usd else "")
        + (f" | avoid {', '.join(s.avoid_regions)}" if s.avoid_regions else "")
        + (" | HAZARDOUS" if s.hazardous else ""),
        "",
        f"{'Route':<9}{'Type':<15}{'Status':<19}{'Freight':>9}{'Days':>7}{'On-time':>9}{'Disrupt':>9}"
        f"{'CO2 t':>7}{'Exp. cost':>11}{'Worst10%':>11}",
    ]
    order = {RECOMMENDED: 0, CANDIDATE: 1, DOMINATED: 2, UNRELIABLE: 3, NOT_ALLOWED: 4}
    for e in sorted(rec.evaluations, key=lambda e: (order[e.status], e.score or 0)):
        m = e.metrics
        if m:
            lines.append(f"{e.route.route_id:<9}{e.route.name:<15}{e.status:<19}{m.freight_usd:>9,.0f}"
                         f"{m.mean_days:>7.1f}{m.p_on_time:>9.0%}{m.p_disruption:>9.1%}{m.co2_tonnes:>7.2f}"
                         f"{m.exp_total:>11,.0f}{m.cvar_total:>11,.0f}")
        else:
            lines.append(f"{e.route.route_id:<9}{e.route.name:<15}{e.status:<19}{e.route.freight_usd:>9,.0f}"
                         f"{e.route.planned_days:>7.1f}")
        for reason in e.reasons:
            lines.append(f"{'':<9}  - {reason}")
    lines.append("")
    if rec.chosen:
        lines.append(f"Recommended: {rec.chosen.route.route_id} {rec.chosen.route.name} ({rec.chosen.route.path})")
    for w in rec.warnings:
        lines.append(f"WARNING: {w}")
    return "\n".join(lines)


def main():
    from .dataset import load_shipments
    ap = argparse.ArgumentParser(description="Recommend a route for one shipment")
    ap.add_argument("shipment_id")
    ap.add_argument("--mode", choices=["expected", "play_safe"], default=None,
                    help="override the profile's risk mode")
    args = ap.parse_args()
    ships = load_shipments()
    print(format_recommendation(recommend(ships[args.shipment_id], mode=args.mode)))


if __name__ == "__main__":
    main()
