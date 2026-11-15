from engine.confidence import assess, label_for
from engine.optimizer import recommend
from engine.tipping import find_tipping_points


def test_labels():
    assert label_for(0.95) == "High" and label_for(0.7) == "Medium" and label_for(0.3) == "Low"


def test_obvious_choice_is_high_confidence(helpers):
    cheap_safe = helpers.route("T-R1", "Good", cost=500, days=15, delay_prob=0.05, geo=0.05)
    bad = helpers.route("T-R2", "Bad", cost=5000, days=25, delay_prob=0.5, geo=0.8)
    s = helpers.shipment(routes=[cheap_safe, bad], deadline=30)
    c = assess(recommend(s, n_sims=1000), runs=40, n_sims=500)
    assert c.label == "High" and c.agreement >= 0.95


def test_confidence_is_reproducible(helpers):
    a = helpers.route("T-R1", "A", cost=1000, days=20, delay_prob=0.3, geo=0.4)
    b = helpers.route("T-R2", "B", cost=1100, days=19, delay_prob=0.25, geo=0.35)
    s = helpers.shipment(routes=[a, b], deadline=24)
    rec = recommend(s, n_sims=1000)
    assert assess(rec, runs=30, n_sims=500).agreement == assess(rec, runs=30, n_sims=500).agreement


def test_higher_late_penalty_tips_towards_faster_route(helpers):
    slow_cheap = helpers.route("T-R1", "Slow sea", cost=500, days=27, delay_prob=0.4, mean_delay=4)
    fast_pricey = helpers.route("T-R2", "Air", mode="air", region="air", cost=8000, days=2,
                                delay_prob=0.05, mean_delay=0.5, geo=0.05)
    s = helpers.shipment(routes=[slow_cheap, fast_pricey], profile="budget", deadline=28, penalty=1000)
    rec = recommend(s, n_sims=2000)
    assert rec.chosen.route.name == "Slow sea"
    tips = [t for t in find_tipping_points(rec) if t.parameter == "late-day penalty"]
    assert tips and tips[0].new_route == "Air" and tips[0].threshold > 1000
    # the threshold is real: just above it, the decision really flips
    assert recommend(s, n_sims=1000, penalty_per_day=tips[0].threshold * 1.05).chosen.route.name == "Air"


def test_tipping_sentences_are_meaningful_for_every_shipment():
    """No tipping point at today's value, and every sentence names a real outcome."""
    from engine.dataset import load_shipments
    from engine.optimizer import recommend
    from engine.tipping import find_tipping_points

    for s in load_shipments().values():
        for mode in ("expected", "play_safe"):
            for t in find_tipping_points(recommend(s, mode=mode)):
                assert t.distance > 0, (s.shipment_id, mode, t.sentence)
                assert "None" not in t.sentence, (s.shipment_id, mode, t.sentence)
                assert " 0.0 days" not in t.sentence and "were 0% lower" not in t.sentence, t.sentence
