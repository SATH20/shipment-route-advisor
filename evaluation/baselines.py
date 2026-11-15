"""Decision strategies compared in the evaluation.

All strategies see the same ESTIMATED data and respect the same hard rules (fair comparison).
The oracle is the only one that sees the truth; it marks the best achievable result.
"""
from __future__ import annotations

from typing import Callable, Dict, List, Optional

import numpy as np

from engine.constraints import hard_rule_violations
from engine.models import Route, Shipment
from engine.optimizer import recommend
from engine.simulation import disruption_prob

Strategy = Callable[[Shipment], Optional[str]]


def allowed_routes(s: Shipment) -> List[Route]:
    return [r for r in s.routes if not hard_rule_violations(s, r)]


def _p_dis(r: Route) -> float:
    p = disruption_prob(np.array([l.geo_risk for l in r.legs]), np.array([l.congestion for l in r.legs]))
    return float(1 - np.prod(1 - p))


def _avg_delay(r: Route) -> float:
    return float(np.mean([l.delay_prob for l in r.legs]))


def cheapest(s: Shipment) -> Optional[str]:
    rs = allowed_routes(s)
    return min(rs, key=lambda r: r.freight_usd).route_id if rs else None


def fastest(s: Shipment) -> Optional[str]:
    rs = allowed_routes(s)
    return min(rs, key=lambda r: r.planned_days).route_id if rs else None


def safest(s: Shipment) -> Optional[str]:
    rs = allowed_routes(s)
    return min(rs, key=lambda r: (_p_dis(r), _avg_delay(r))).route_id if rs else None


def fixed_weights(s: Shipment, w=(0.4, 0.3, 0.15, 0.15)) -> Optional[str]:
    """Min-max normalised cost, time, delay and geo risk combined with fixed weights."""
    rs = allowed_routes(s)
    if not rs:
        return None
    feats = np.array([[r.freight_usd, r.planned_days, _avg_delay(r), max(l.geo_risk for l in r.legs)] for r in rs])
    span = feats.max(0) - feats.min(0)
    norm = np.where(span > 0, (feats - feats.min(0)) / np.where(span > 0, span, 1), 0.0)
    return rs[int(np.argmin(norm @ np.array(w)))].route_id


def advisor(mode: Optional[str] = None, n_sims: int = 2000) -> Strategy:
    def pick(s: Shipment) -> Optional[str]:
        rec = recommend(s, mode=mode, n_sims=n_sims)
        return rec.chosen.route.route_id if rec.chosen else None
    return pick


STRATEGIES: Dict[str, Strategy] = {
    "Always cheapest": cheapest,
    "Always fastest": fastest,
    "Always safest": safest,
    "Fixed weights": fixed_weights,
    "Advisor (profile rules)": advisor(None),
    "Advisor (expected cost only)": advisor("expected"),
    "Advisor (play-safe only)": advisor("play_safe"),
}
