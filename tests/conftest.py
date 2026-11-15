import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine.models import Leg, Route, Shipment  # noqa: E402


def make_leg(route_id="T-R1", mode="sea", region="open_ocean", km=10000, cost=1000.0, days=20.0,
             delay_prob=0.2, mean_delay=3.0, congestion=0.3, geo=0.2, leg_no=1, frm="A", to="B"):
    return Leg(route_id, leg_no, frm, to, mode, region, km, cost, days, delay_prob, mean_delay, congestion, geo)


def make_route(route_id="T-R1", name="Test", legs=None, **leg_kwargs):
    legs = legs or [make_leg(route_id=route_id, **leg_kwargs)]
    return Route(route_id, "T", name, tuple(legs))


def make_shipment(routes=(), profile="standard", value=100_000, deadline=30.0, penalty=500.0,
                  budget=None, hazardous=False, avoid=(), weight=1000, cargo="test goods"):
    return Shipment("T", "A", "B", cargo, profile, weight, value, deadline, penalty, budget,
                    hazardous, tuple(avoid), tuple(routes))


@pytest.fixture
def helpers():
    class H:
        leg = staticmethod(make_leg)
        route = staticmethod(make_route)
        shipment = staticmethod(make_shipment)
    return H
