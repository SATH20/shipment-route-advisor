from engine.constraints import hard_rule_violations, reliability_violations
from engine.simulation import simulate_route


def test_hazardous_cargo_cannot_fly(helpers):
    air = helpers.route(mode="air", region="air", days=2)
    sea = helpers.route(route_id="T-R2", mode="sea", days=20)
    sh = helpers.shipment(hazardous=True, cargo="lithium batteries")
    assert any("air" in r for r in hard_rule_violations(sh, air))
    assert hard_rule_violations(sh, sea) == []


def test_avoided_region_is_rejected(helpers):
    suez = helpers.route(region="red_sea", days=15)
    sh = helpers.shipment(avoid=("red_sea",))
    assert any("Red Sea" in r for r in hard_rule_violations(sh, suez))


def test_budget_and_deadline(helpers):
    r = helpers.route(cost=5000, days=40)
    sh = helpers.shipment(budget=3000, deadline=30)
    reasons = hard_rule_violations(sh, r)
    assert any("budget" in x for x in reasons)
    assert any("deadline" in x for x in reasons)


def test_reliability_rule_uses_profile_target(helpers):
    # planned 29 days, deadline 30, frequent long delays -> poor on-time probability
    r = helpers.route(days=29, delay_prob=0.6, mean_delay=5)
    express = helpers.shipment(routes=[r], profile="express", deadline=30)
    budget = helpers.shipment(routes=[r], profile="budget", deadline=30)
    m = simulate_route(r, express, n=2000)
    assert m.p_on_time < 0.9
    assert reliability_violations(express, m)          # express needs 90%
    assert reliability_violations(budget, m) == []     # budget has no reliability target
