"""Score decisions against the hidden ground truth.

A decision is made on estimates; its quality is measured by simulating the chosen route with
the TRUE parameters (and a different random seed from the one used to decide).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from config import assumptions as A
from engine.models import Shipment
from engine.simulation import RouteMetrics, simulate_route
from .baselines import allowed_routes

EVAL_SEED = A.SIM_SEED + 101


class TruthCache:
    """True outcome metrics per route, computed once."""

    def __init__(self, truth: Dict[str, Shipment], n: int = A.N_SIMS):
        self.truth, self.n, self._c, self._oracle = truth, n, {}, {}

    def metrics(self, shipment_id: str, route_id: str) -> RouteMetrics:
        key = (shipment_id, route_id)
        if key not in self._c:
            s = self.truth[shipment_id]
            r = next(r for r in s.routes if r.route_id == route_id)
            self._c[key] = simulate_route(r, s, n=self.n, seed=EVAL_SEED)
        return self._c[key]

    def objective(self, shipment_id: str, route_id: str) -> float:
        """The profile's own objective (expected or play-safe), measured on the truth."""
        return self.metrics(shipment_id, route_id).objective(self.truth[shipment_id].risk_mode)

    def oracle(self, shipment_id: str) -> Optional[str]:
        """Best decision under the SAME policy (hard rules, on-time target, risk mode) with perfect knowledge."""
        if shipment_id in self._oracle:
            return self._oracle[shipment_id]
        s = self.truth[shipment_id]
        rs = allowed_routes(s)
        if not rs:
            best = None
        else:
            ok = [r for r in rs if self.metrics(shipment_id, r.route_id).p_on_time >= s.min_on_time]
            if ok:
                best = min(ok, key=lambda r: self.objective(shipment_id, r.route_id)).route_id
            else:
                best = max(rs, key=lambda r: self.metrics(shipment_id, r.route_id).p_on_time).route_id
        self._oracle[shipment_id] = best
        return best


@dataclass
class StrategyResult:
    strategy: str
    avg_true_cost: float
    avg_regret: float
    oracle_match: float
    avg_on_time: float
    meets_target: float
    avg_worst10: float
    total_co2: float


def score_strategy(name: str, picks: Dict[str, Optional[str]], truth: TruthCache) -> StrategyResult:
    cost, regret, match, on_time, meets, worst, co2 = [], [], [], [], [], [], []
    for sid, rid in picks.items():
        if rid is None:
            continue
        m = truth.metrics(sid, rid)
        o = truth.oracle(sid)
        om = truth.metrics(sid, o)
        target = truth.truth[sid].min_on_time
        cost.append(m.exp_total)
        # regret on the profile's own objective (expected cost, or worst-10% cost for play-safe cargo)
        regret.append(truth.objective(sid, rid) - truth.objective(sid, o))
        match.append(rid == o)
        on_time.append(m.p_on_time)
        meets.append(m.p_on_time >= target)
        worst.append(m.cvar_total)
        co2.append(m.co2_tonnes)
    n = max(1, len(cost))
    return StrategyResult(name, sum(cost) / n, sum(regret) / n, sum(match) / n, sum(on_time) / n,
                          sum(meets) / n, sum(worst) / n, sum(co2))


def as_rows(results: List[StrategyResult]) -> List[Dict]:
    return [{
        "Strategy": r.strategy,
        "Avg true cost ($)": round(r.avg_true_cost),
        "Avg regret vs oracle ($)": round(r.avg_regret),
        "Matches oracle": f"{r.oracle_match:.0%}",
        "Avg on-time": f"{r.avg_on_time:.1%}",
        "Meets on-time target": f"{r.meets_target:.0%}",
        "Avg worst-10% cost ($)": round(r.avg_worst10),
        "Total CO2 (t)": round(r.total_co2, 1),
    } for r in results]
