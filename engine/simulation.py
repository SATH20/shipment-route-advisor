"""Monte Carlo simulation of a route's outcomes.

For each run and each leg:
  * the leg is delayed with probability ``delay_prob``; the delay length is exponential
    with mean ``mean_delay_days``;
  * the leg is disrupted with a probability derived from its geopolitical risk and
    congestion (see config); a disruption adds extra days and destroys part of the cargo value.

From the simulated arrival times we get the late days, and from those the money:

  total cost = freight + late days x penalty per day + disruption loss + carbon cost

Common random numbers
---------------------
The random draws depend only on (SIM_SEED, route_id), never on the parameters. So when the
confidence or tipping-point engines re-run a route with slightly different parameters, any
change in the result comes from the parameters, not from simulation noise.
"""
from __future__ import annotations

import zlib
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from config import assumptions as A
from .models import Route, Shipment


@dataclass
class RouteMetrics:
    route_id: str
    freight_usd: float
    planned_days: float
    mean_days: float
    p90_days: float
    p_on_time: float
    p_disruption: float
    exp_late_days: float
    exp_late_cost: float
    exp_loss: float
    co2_tonnes: float
    carbon_cost: float
    exp_total: float          # expected all-in cost  (expected mode objective)
    cvar_total: float         # mean of worst (1 - CVAR_ALPHA) of totals  (play-safe objective)
    p90_total: float
    arrival_samples: Optional[np.ndarray] = field(default=None, repr=False)
    total_samples: Optional[np.ndarray] = field(default=None, repr=False)

    def objective(self, mode: str) -> float:
        return self.cvar_total if mode == "play_safe" else self.exp_total


def disruption_prob(geo_risk: np.ndarray, congestion: np.ndarray) -> np.ndarray:
    p = A.DISRUPTION_BASE + A.DISRUPTION_GEO_COEF * geo_risk ** 2 + A.DISRUPTION_CONGESTION_COEF * congestion
    return np.clip(p, 0.0, A.DISRUPTION_CAP)


def route_co2_tonnes(route: Route, weight_kg: float) -> float:
    return sum(A.EMISSION_FACTORS[l.mode] * (weight_kg / 1000) * l.distance_km for l in route.legs) / 1000


def _draws(route_id: str, n: int, n_legs: int, seed: int):
    rng = np.random.default_rng([seed, zlib.crc32(route_id.encode())])
    return rng.random((n, n_legs)), rng.random((n, n_legs)), rng.random((n, n_legs))


def simulate_route(route: Route, shipment: Shipment, n: int = A.N_SIMS, seed: int = A.SIM_SEED,
                   keep_samples: bool = False, carbon_price: float = A.CARBON_PRICE_USD_PER_TONNE,
                   penalty_per_day: Optional[float] = None, cargo_value: Optional[float] = None) -> RouteMetrics:
    legs = route.legs
    p_delay = np.array([l.delay_prob for l in legs])
    mean_delay = np.array([l.mean_delay_days for l in legs])
    p_dis = disruption_prob(np.array([l.geo_risk for l in legs]), np.array([l.congestion for l in legs]))

    u_delay, u_len, u_dis = _draws(route.route_id, n, len(legs), seed)
    delays = (u_delay < p_delay) * (-np.log1p(-u_len) * mean_delay)    # exponential via inverse CDF
    disrupted = u_dis < p_dis

    arrival = route.planned_days + delays.sum(axis=1) + A.DISRUPTION_EXTRA_DAYS * disrupted.sum(axis=1)
    late_days = np.maximum(0.0, arrival - shipment.deadline_days)

    penalty = shipment.delay_penalty_usd_per_day if penalty_per_day is None else penalty_per_day
    value = shipment.cargo_value_usd if cargo_value is None else cargo_value
    any_disruption = disrupted.any(axis=1)
    loss = value * A.LOSS_FRACTION_ON_DISRUPTION * any_disruption

    co2 = route_co2_tonnes(route, shipment.weight_kg)
    carbon = co2 * carbon_price
    total = route.freight_usd + penalty * late_days + loss + carbon

    k = max(1, int(round(n * (1 - A.CVAR_ALPHA))))
    worst = np.sort(total)[-k:]

    return RouteMetrics(
        route_id=route.route_id,
        freight_usd=float(route.freight_usd),
        planned_days=float(route.planned_days),
        mean_days=float(arrival.mean()),
        p90_days=float(np.percentile(arrival, 90)),
        p_on_time=float((late_days == 0).mean()),
        p_disruption=float(any_disruption.mean()),
        exp_late_days=float(late_days.mean()),
        exp_late_cost=float((penalty * late_days).mean()),
        exp_loss=float(loss.mean()),
        co2_tonnes=float(co2),
        carbon_cost=float(carbon),
        exp_total=float(total.mean()),
        cvar_total=float(worst.mean()),
        p90_total=float(np.percentile(total, 90)),
        arrival_samples=arrival if keep_samples else None,
        total_samples=total if keep_samples else None,
    )
