import os

import pytest

from engine.constraints import hard_rule_violations
from engine.dataset import load_shipments
from engine.optimizer import DOMINATED, NOT_ALLOWED, RECOMMENDED, recommend

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture(scope="module")
def shipments():
    if not os.path.exists(os.path.join(ROOT, "data", "shipments.csv")):
        pytest.skip("run generate_dataset.py first")
    return load_shipments()


def test_every_shipment_gets_a_legal_recommendation(shipments):
    for s in shipments.values():
        rec = recommend(s, n_sims=1000)
        assert rec.chosen is not None, s.shipment_id
        assert rec.chosen.status == RECOMMENDED
        assert hard_rule_violations(s, rec.chosen.route) == []
        assert sum(e.status == RECOMMENDED for e in rec.evaluations) == 1


def test_chosen_route_has_lowest_score_among_eligible(shipments):
    for s in list(shipments.values())[:10]:
        rec = recommend(s, n_sims=1000)
        assert rec.ranked[0].route.route_id == rec.chosen.route.route_id


def test_every_rejected_route_has_a_reason(shipments):
    for s in shipments.values():
        rec = recommend(s, n_sims=500)
        for e in rec.evaluations:
            if e.status in (NOT_ALLOWED, DOMINATED):
                assert e.reasons, (s.shipment_id, e.route.route_id)


def test_low_value_cargo_goes_cheap_high_value_cargo_goes_safe(helpers):
    cheap_risky = helpers.route("T-R1", "Risky sea", days=20, cost=500, geo=0.9, delay_prob=0.3)
    safe_pricey = helpers.route("T-R2", "Safe sea", days=22, cost=1500, geo=0.05, delay_prob=0.1)
    low = helpers.shipment(routes=[cheap_risky, safe_pricey], profile="budget", value=5_000, penalty=5, deadline=40)
    high = helpers.shipment(routes=[cheap_risky, safe_pricey], profile="standard", value=2_000_000,
                            penalty=500, deadline=40)
    assert recommend(low, n_sims=3000).chosen.route.name == "Risky sea"
    assert recommend(high, n_sims=3000).chosen.route.name == "Safe sea"


def test_falls_back_with_warning_when_nothing_is_reliable_enough(helpers):
    r1 = helpers.route("T-R1", days=29, delay_prob=0.7, mean_delay=6)
    r2 = helpers.route("T-R2", days=28, delay_prob=0.6, mean_delay=6)
    s = helpers.shipment(routes=[r1, r2], profile="express", deadline=30)
    rec = recommend(s, n_sims=2000)
    assert rec.chosen is not None and rec.warnings
