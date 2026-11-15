import os

import pytest

from evaluation.baselines import STRATEGIES, allowed_routes
from evaluation.evaluate import TRUTH_LEGS, load_truth
from evaluation.metrics import TruthCache, score_strategy
from evaluation.scenarios import run_scenario


@pytest.fixture(scope="module")
def truth():
    if not os.path.exists(TRUTH_LEGS):
        pytest.skip("run generate_dataset.py first")
    return load_truth()


def test_oracle_has_zero_regret(truth):
    ships, routes, legs, truth_ships = truth
    cache = TruthCache(truth_ships, n=1000)
    res = score_strategy("oracle", {sid: cache.oracle(sid) for sid in truth_ships}, cache)
    assert abs(res.avg_regret) < 1e-9 and res.oracle_match == 1.0


def test_every_strategy_respects_hard_rules(truth):
    _, _, _, truth_ships = truth
    for name in ("Always cheapest", "Always fastest", "Always safest", "Fixed weights"):
        for s in list(truth_ships.values())[:10]:
            rid = STRATEGIES[name](s)
            assert rid in {r.route_id for r in allowed_routes(s)}, (name, s.shipment_id)


def test_scenario_red_sea_reopens_never_increases_cost(truth):
    r = run_scenario("Red Sea reopens", n_sims=500)
    assert r.avg_cost_after <= r.avg_cost_before + 1
