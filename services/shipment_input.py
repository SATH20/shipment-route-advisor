"""A shipment described in JSON, turned into the engine's Shipment / Route / Leg objects.

Used by POST /api/recommend and by `python -m engine.optimizer --file ...`. This module only
validates and converts; the decision itself is the unchanged engine pipeline.

JSON shape (see examples/custom_shipment.json):

  {"origin": ..., "destination": ..., "cargo_type": ..., "profile": "express|standard|budget|high_value",
   "weight_kg": ..., "cargo_value_usd": ..., "deadline_days": ...,
   "delay_penalty_usd_per_day": optional (default: cargo value x the profile's share per late day),
   "budget_usd": optional, "hazardous": false, "avoid_regions": ["red_sea"],
   "routes": [{"name": optional, "legs": [{"from_hub", "to_hub", "mode", "region", "distance_km",
               "cost_usd", "transit_days", "delay_prob", "mean_delay_days", "congestion", "geo_risk"}]}]}
"""
from __future__ import annotations

import json
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from config import assumptions as A
from engine.models import Leg, Route, Shipment

Profile = Literal["express", "standard", "budget", "high_value"]
Mode = Literal["sea", "rail", "road", "air"]
# regions used by the dataset and the geography module
Region = Literal["open_ocean", "red_sea", "mediterranean", "cape", "rail_corridor", "air"]

assert set(Profile.__args__) == set(A.PROFILES), "Profile literal out of sync with config"
assert set(Mode.__args__) == set(A.EMISSION_FACTORS), "Mode literal out of sync with config"


class LegIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_hub: str = Field(min_length=1)
    to_hub: str = Field(min_length=1)
    mode: Mode
    region: Region
    distance_km: float = Field(gt=0, description="leg distance in km")
    cost_usd: float = Field(gt=0, description="quoted freight for this leg in USD")
    transit_days: float = Field(gt=0, description="planned transit including handling, in days")
    delay_prob: float = Field(ge=0, le=1, description="probability the leg is delayed (0-1)")
    mean_delay_days: float = Field(ge=0, description="average delay length if delayed, in days")
    congestion: float = Field(ge=0, le=1, description="congestion indicator (0-1)")
    geo_risk: float = Field(ge=0, le=1, description="geopolitical risk indicator (0-1)")


class RouteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, description="route type, e.g. 'Direct sea'; default 'Route k'")
    route_id: Optional[str] = Field(default=None, description="default '<shipment_id>-R<k>'")
    legs: List[LegIn] = Field(min_length=1, max_length=4)

    @model_validator(mode="after")
    def legs_form_a_chain(self):
        for a, b in zip(self.legs, self.legs[1:]):
            if a.to_hub != b.from_hub:
                raise ValueError(f"legs must form a chain: a leg ends at '{a.to_hub}' "
                                 f"but the next one starts at '{b.from_hub}'")
        return self


class ShipmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    shipment_id: str = Field(default="CUSTOM", min_length=1)
    origin: str = Field(min_length=1)
    destination: str = Field(min_length=1)
    cargo_type: str = Field(min_length=1)
    profile: Profile
    weight_kg: float = Field(gt=0)
    cargo_value_usd: float = Field(gt=0)
    deadline_days: float = Field(gt=0)
    delay_penalty_usd_per_day: Optional[float] = Field(
        default=None, ge=0, description="default: cargo value x the profile's late-day share, rounded to $10")
    budget_usd: Optional[float] = Field(default=None, gt=0)
    hazardous: bool = False
    avoid_regions: List[Region] = Field(default_factory=list)
    routes: List[RouteIn] = Field(min_length=1, max_length=6)

    @model_validator(mode="after")
    def routes_connect_origin_and_destination(self):
        ids = []
        for k, r in enumerate(self.routes, start=1):
            label = r.name or f"route {k}"
            if r.legs[0].from_hub != self.origin:
                raise ValueError(f"{label} starts at '{r.legs[0].from_hub}', not at the origin '{self.origin}'")
            if r.legs[-1].to_hub != self.destination:
                raise ValueError(f"{label} ends at '{r.legs[-1].to_hub}', not at the destination '{self.destination}'")
            ids.append(r.route_id or f"{self.shipment_id}-R{k}")
        if len(set(ids)) != len(ids):
            raise ValueError("route_id values must be unique")
        return self

    def to_shipment(self) -> Shipment:
        routes = []
        for k, r in enumerate(self.routes, start=1):
            rid = r.route_id or f"{self.shipment_id}-R{k}"
            legs = tuple(Leg(route_id=rid, leg_no=i, **leg.model_dump()) for i, leg in enumerate(r.legs, start=1))
            routes.append(Route(route_id=rid, shipment_id=self.shipment_id, name=r.name or f"Route {k}", legs=legs))
        penalty = self.delay_penalty_usd_per_day
        if penalty is None:  # same rule as generate_dataset.py
            penalty = round(self.cargo_value_usd * A.PROFILES[self.profile]["penalty_pct_per_day"], -1)
        return Shipment(
            shipment_id=self.shipment_id, origin=self.origin, destination=self.destination,
            cargo_type=self.cargo_type, profile=self.profile, weight_kg=float(self.weight_kg),
            cargo_value_usd=float(self.cargo_value_usd), deadline_days=float(self.deadline_days),
            delay_penalty_usd_per_day=float(penalty), budget_usd=self.budget_usd,
            hazardous=bool(self.hazardous), avoid_regions=tuple(self.avoid_regions), routes=tuple(routes),
        )


def load_shipment_file(path: str) -> Shipment:
    with open(path, encoding="utf-8") as f:
        return ShipmentIn.model_validate(json.load(f)).to_shipment()
