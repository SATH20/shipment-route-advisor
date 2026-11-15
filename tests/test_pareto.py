from engine.pareto import pareto_filter
from engine.simulation import RouteMetrics


def m(rid, cost, days, p_on_time, p_dis, co2, cvar=None):
    return RouteMetrics(rid, cost, days, days, days, p_on_time, p_dis, 0, 0, 0, co2, 0,
                        cost, cvar if cvar is not None else cost, cost)


def test_route_worse_on_everything_is_removed():
    good = m("A", 100, 20, 0.95, 0.01, 1.0)
    bad = m("B", 120, 25, 0.90, 0.02, 1.2)
    front, dominated = pareto_filter([good, bad])
    assert front == ["A"] and dominated == {"B": "A"}


def test_trade_off_routes_both_survive():
    cheap_slow = m("A", 100, 30, 0.90, 0.01, 0.5)
    fast_pricey = m("B", 900, 3, 0.99, 0.01, 9.0)
    front, dominated = pareto_filter([cheap_slow, fast_pricey])
    assert set(front) == {"A", "B"} and not dominated


def test_identical_routes_do_not_eliminate_each_other():
    a, b = m("A", 100, 20, 0.9, 0.01, 1.0), m("B", 100, 20, 0.9, 0.01, 1.0)
    front, _ = pareto_filter([a, b])
    assert set(front) == {"A", "B"}


def test_play_safe_keeps_route_that_only_wins_on_worst_case():
    a = m("A", 100, 20, 0.95, 0.01, 1.0, cvar=5000)
    b = m("B", 110, 21, 0.94, 0.02, 1.1, cvar=900)   # worse on averages, far better worst case
    assert pareto_filter([a, b], "expected")[1] == {"B": "A"}
    assert set(pareto_filter([a, b], "play_safe")[0]) == {"A", "B"}
