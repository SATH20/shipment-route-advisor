"""Confidence engine: how stable is the recommendation if our estimates are wrong?

Delay probabilities, delay lengths, congestion and geopolitical risk are estimates.
We re-run the full decision CONFIDENCE_RUNS times, each time multiplying those estimates
by random lognormal noise (the same noise level we assume for real estimation error),
and count how often the same route wins.

    >= 80% agreement  -> High    (act on it)
    >= 60%            -> Medium  (reasonable, worth a glance)
    <  60%            -> Low     (close call - ask a human)
"""
from __future__ import annotations

import zlib
from collections import Counter
from dataclasses import dataclass, replace
from typing import Dict

import numpy as np

from config import assumptions as A
from .models import Shipment
from .optimizer import Recommendation, recommend


@dataclass
class Confidence:
    agreement: float               # share of re-decisions that picked the same route
    label: str                     # High / Medium / Low
    alternatives: Dict[str, float]  # other winners -> share
    runs: int


def perturb(shipment: Shipment, rng: np.random.Generator, sigma: float) -> Shipment:
    routes = []
    for r in shipment.routes:
        legs = []
        for l in r.legs:
            f = rng.lognormal(0.0, sigma, size=4)
            legs.append(replace(
                l,
                delay_prob=float(min(1.0, l.delay_prob * f[0])),
                mean_delay_days=float(l.mean_delay_days * f[1]),
                congestion=float(min(1.0, l.congestion * f[2])),
                geo_risk=float(min(1.0, l.geo_risk * f[3])),
            ))
        routes.append(replace(r, legs=tuple(legs)))
    return replace(shipment, routes=tuple(routes))


def label_for(agreement: float) -> str:
    if agreement >= A.CONFIDENCE_HIGH:
        return "High"
    if agreement >= A.CONFIDENCE_MEDIUM:
        return "Medium"
    return "Low"


def assess(rec: Recommendation, runs: int = A.CONFIDENCE_RUNS, n_sims: int = A.CONFIDENCE_SIMS,
           sigma: float = A.OBSERVATION_NOISE) -> Confidence:
    if rec.chosen is None:
        return Confidence(0.0, "Low", {}, 0)
    sh = rec.shipment
    rng = np.random.default_rng([A.SIM_SEED, zlib.crc32(sh.shipment_id.encode())])
    names = {r.route_id: r.name for r in sh.routes}
    winners = Counter()
    for _ in range(runs):
        alt = recommend(perturb(sh, rng, sigma), mode=rec.mode, n_sims=n_sims)
        winners[alt.chosen.route.route_id if alt.chosen else "none"] += 1
    chosen_id = rec.chosen.route.route_id
    agreement = winners[chosen_id] / runs
    others = {names.get(k, k): v / runs for k, v in winners.most_common() if k != chosen_id}
    return Confidence(agreement, label_for(agreement), others, runs)
