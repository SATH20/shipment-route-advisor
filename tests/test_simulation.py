import numpy as np

from config import assumptions as A
from engine.simulation import simulate_route


def test_reproducible_with_fixed_seed(helpers):
    r = helpers.route()
    sh = helpers.shipment(routes=[r])
    a = simulate_route(r, sh, n=3000, keep_samples=True)
    b = simulate_route(r, sh, n=3000, keep_samples=True)
    assert np.array_equal(a.total_samples, b.total_samples)


def test_risk_free_route_costs_exactly_freight_plus_carbon(helpers):
    r = helpers.route(delay_prob=0.0, congestion=0.0, geo=0.0, days=10)
    sh = helpers.shipment(routes=[r], deadline=30)
    m = simulate_route(r, sh, n=2000)
    # only the tiny base disruption probability remains
    assert m.p_on_time > 0.99
    assert m.exp_late_cost == 0 or m.exp_late_cost < 1
    expected_floor = m.freight_usd + m.carbon_cost
    assert expected_floor <= m.exp_total <= expected_floor + sh.cargo_value_usd * A.LOSS_FRACTION_ON_DISRUPTION * 0.01


def test_common_random_numbers_make_results_monotonic(helpers):
    """More delay risk must never look better: same random draws, only the parameter changes."""
    sh = helpers.shipment(deadline=22)
    results = []
    for p in [0.1, 0.2, 0.3, 0.4, 0.5]:
        r = helpers.route(delay_prob=p, days=20)
        results.append(simulate_route(r, sh, n=3000))
    on_time = [m.p_on_time for m in results]
    costs = [m.exp_total for m in results]
    assert on_time == sorted(on_time, reverse=True)
    assert costs == sorted(costs)


def test_play_safe_cost_is_at_least_expected_cost(helpers):
    r = helpers.route(delay_prob=0.4, geo=0.7)
    sh = helpers.shipment(routes=[r])
    m = simulate_route(r, sh, n=3000)
    assert m.cvar_total >= m.exp_total


def test_air_emits_far_more_co2_than_sea(helpers):
    sh = helpers.shipment()
    air = simulate_route(helpers.route(mode="air", region="air"), sh, n=500)
    sea = simulate_route(helpers.route(route_id="T-R2", mode="sea"), sh, n=500)
    assert air.co2_tonnes > 30 * sea.co2_tonnes
