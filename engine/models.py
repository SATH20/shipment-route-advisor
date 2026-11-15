"""Core data structures: a Shipment has candidate Routes; a Route is a chain of Legs."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from config import assumptions as A


@dataclass(frozen=True)
class Leg:
    route_id: str
    leg_no: int
    from_hub: str
    to_hub: str
    mode: str               # sea | air | rail | road
    region: str             # e.g. red_sea, cape, open_ocean, rail_corridor, air
    distance_km: float
    cost_usd: float         # quoted freight for this shipment on this leg
    transit_days: float     # planned transit incl. handling
    delay_prob: float       # estimated P(leg is delayed)
    mean_delay_days: float  # estimated mean delay if delayed
    congestion: float       # 0..1
    geo_risk: float         # 0..1


@dataclass(frozen=True)
class Route:
    route_id: str
    shipment_id: str
    name: str
    legs: Tuple[Leg, ...]

    @property
    def freight_usd(self) -> float:
        return sum(l.cost_usd for l in self.legs)

    @property
    def planned_days(self) -> float:
        return sum(l.transit_days for l in self.legs)

    @property
    def modes(self) -> List[str]:
        return [l.mode for l in self.legs]

    @property
    def regions(self) -> List[str]:
        return [l.region for l in self.legs]

    @property
    def path(self) -> str:
        return " -> ".join([self.legs[0].from_hub] + [l.to_hub for l in self.legs])


@dataclass(frozen=True)
class Shipment:
    shipment_id: str
    origin: str
    destination: str
    cargo_type: str
    profile: str
    weight_kg: float
    cargo_value_usd: float
    deadline_days: float
    delay_penalty_usd_per_day: float
    budget_usd: Optional[float]
    hazardous: bool
    avoid_regions: Tuple[str, ...]
    routes: Tuple[Route, ...] = field(default_factory=tuple)

    @property
    def policy(self) -> dict:
        return A.PROFILES[self.profile]

    @property
    def min_on_time(self) -> float:
        return self.policy["min_on_time"]

    @property
    def risk_mode(self) -> str:
        return self.policy["risk_mode"]
