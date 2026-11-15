"""Pareto filter: drop routes that another route beats or ties on every objective.

A rational planner never picks a dominated route, whatever their priorities, so we can
remove it before scoring and say exactly why ("X is cheaper, faster and safer").
All objectives are minimised.
"""
from __future__ import annotations

from typing import Callable, Dict, List, Sequence, Tuple

from .simulation import RouteMetrics

# (label, getter) - lower is better for every getter
OBJECTIVES_EXPECTED: List[Tuple[str, Callable[[RouteMetrics], float]]] = [
    ("cost", lambda m: m.freight_usd),
    ("time", lambda m: m.mean_days),
    ("late risk", lambda m: 1 - m.p_on_time),
    ("disruption risk", lambda m: m.p_disruption),
    ("CO2", lambda m: m.co2_tonnes),
]
# play-safe mode also protects routes that are only better in the worst case
OBJECTIVES_PLAY_SAFE = OBJECTIVES_EXPECTED + [("worst-case cost", lambda m: m.cvar_total)]


def objectives_for(mode: str):
    return OBJECTIVES_PLAY_SAFE if mode == "play_safe" else OBJECTIVES_EXPECTED


def dominates(a: RouteMetrics, b: RouteMetrics, objectives, tol: float = 1e-9) -> bool:
    """a dominates b: a is no worse on every objective and strictly better on at least one."""
    no_worse = all(f(a) <= f(b) + tol for _, f in objectives)
    better = any(f(a) < f(b) - tol for _, f in objectives)
    return no_worse and better


def pareto_filter(metrics: Sequence[RouteMetrics], mode: str = "expected") -> Tuple[List[str], Dict[str, str]]:
    """Return (non-dominated route ids, {dominated route id: id of a route that dominates it})."""
    objs = objectives_for(mode)
    front, dominated = [], {}
    for b in metrics:
        dom_by = next((a.route_id for a in metrics if a is not b and dominates(a, b, objs)), None)
        if dom_by:
            dominated[b.route_id] = dom_by
        else:
            front.append(b.route_id)
    return front, dominated
