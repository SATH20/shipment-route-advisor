"""Constraint engine, applied in two stages.

Stage A - hard rules (before simulation). Things that are simply not allowed:
    cargo/mode compatibility, regions the customer excludes, freight budget,
    and a planned transit time that already misses the deadline.

Stage B - reliability rules (after simulation). Things that need the simulated
    distribution: e.g. express cargo must have >= 90% probability of arriving on time.

Keeping the stages separate distinguishes "this route can never work" from
"this route usually works, but not reliably enough for this cargo".
"""
from __future__ import annotations

from typing import List

from .models import Route, Shipment
from .simulation import RouteMetrics


def hard_rule_violations(shipment: Shipment, route: Route) -> List[str]:
    reasons = []
    if shipment.hazardous and "air" in route.modes:
        reasons.append(f"{shipment.cargo_type} are hazardous cargo and cannot travel by air")
    for region in shipment.avoid_regions:
        if region in route.regions:
            reasons.append(f"customer excludes the {region.replace('_', ' ').title()} region")
    if shipment.budget_usd is not None and route.freight_usd > shipment.budget_usd:
        reasons.append(f"freight ${route.freight_usd:,.0f} exceeds the ${shipment.budget_usd:,.0f} budget")
    if route.planned_days > shipment.deadline_days:
        reasons.append(f"planned transit {route.planned_days:.1f} days already misses the "
                       f"{shipment.deadline_days:g}-day deadline")
    return reasons


def reliability_violations(shipment: Shipment, metrics: RouteMetrics) -> List[str]:
    target = shipment.min_on_time
    if target > 0 and metrics.p_on_time < target:
        return [f"on-time probability {metrics.p_on_time:.0%} is below the {target:.0%} "
                f"target for {shipment.profile.replace('_', '-')} cargo"]
    return []
