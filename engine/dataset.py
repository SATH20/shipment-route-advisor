"""Load shipments, routes and legs from CSV into model objects.

The engine only ever loads from ``data/`` (estimates). The evaluation package passes a
different legs file explicitly when it needs the ground truth.
"""
from __future__ import annotations

import math
import os
from typing import Dict, Optional

import pandas as pd

from .models import Leg, Route, Shipment

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA_DIR = os.path.join(ROOT, "data")


def _opt_float(x) -> Optional[float]:
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else float(x)


def load_tables(data_dir: str = DEFAULT_DATA_DIR):
    return (pd.read_csv(os.path.join(data_dir, "shipments.csv")),
            pd.read_csv(os.path.join(data_dir, "routes.csv")),
            pd.read_csv(os.path.join(data_dir, "route_legs.csv")))


def load_shipments(data_dir: str = DEFAULT_DATA_DIR, legs_path: Optional[str] = None) -> Dict[str, Shipment]:
    ships, routes, legs = load_tables(data_dir)
    if legs_path:
        legs = pd.read_csv(legs_path)
    return build_shipments(ships, routes, legs)


def build_shipments(ships: pd.DataFrame, routes: pd.DataFrame, legs: pd.DataFrame) -> Dict[str, Shipment]:
    legs_by_route: Dict[str, list] = {}
    for row in legs.sort_values(["route_id", "leg_no"]).itertuples(index=False):
        legs_by_route.setdefault(row.route_id, []).append(Leg(**row._asdict()))

    routes_by_ship: Dict[str, list] = {}
    for r in routes.itertuples(index=False):
        routes_by_ship.setdefault(r.shipment_id, []).append(
            Route(route_id=r.route_id, shipment_id=r.shipment_id, name=r.route_name,
                  legs=tuple(legs_by_route[r.route_id])))

    out: Dict[str, Shipment] = {}
    for s in ships.itertuples(index=False):
        avoid = s.avoid_regions if isinstance(s.avoid_regions, str) else ""
        out[s.shipment_id] = Shipment(
            shipment_id=s.shipment_id, origin=s.origin, destination=s.destination,
            cargo_type=s.cargo_type, profile=s.profile, weight_kg=float(s.weight_kg),
            cargo_value_usd=float(s.cargo_value_usd), deadline_days=float(s.deadline_days),
            delay_penalty_usd_per_day=float(s.delay_penalty_usd_per_day),
            budget_usd=_opt_float(s.budget_usd), hazardous=bool(s.hazardous),
            avoid_regions=tuple(a for a in avoid.split(";") if a),
            routes=tuple(routes_by_ship.get(s.shipment_id, [])),
        )
    return out
