from engine.analysis import analyze
from services.explanation_service import explain, template_text
from services.validation_service import extract_numbers, validate


def _analysis(helpers):
    a = helpers.route("T-R1", "Direct sea", cost=800, days=20, delay_prob=0.2, geo=0.2)
    b = helpers.route("T-R2", "Air freight", mode="air", region="air", cost=9000, days=2, delay_prob=0.05, geo=0.05)
    s = helpers.shipment(routes=[a, b], deadline=30)
    return analyze(s, n_sims=1000)


def test_extract_numbers_ignores_ids():
    assert extract_numbers("S016-R2 costs $1,234 and arrives 95% on time in 7.5 days") == [1234, 95, 7.5]


def test_template_names_the_recommended_route(helpers):
    an = _analysis(helpers)
    text = template_text(an)
    assert text.startswith(f"Recommended: {an.rec.chosen.route.name}")


def test_without_llm_we_get_the_template(helpers):
    ex = explain(_analysis(helpers), use_llm=False)
    assert ex.source == "template" and ex.text == ex.template


def test_faithful_llm_text_is_accepted(helpers):
    an = _analysis(helpers)
    chosen = an.rec.chosen.route.name

    def fake_llm(prompt):
        return f"Ship it by {chosen}. It is the better balance of cost and reliability for this cargo."
    ex = explain(an, llm_fn=fake_llm)
    assert ex.source == "llm", ex.issues


def test_invented_number_falls_back_to_template(helpers):
    an = _analysis(helpers)
    chosen = an.rec.chosen.route.name
    ex = explain(an, llm_fn=lambda p: f"{chosen} saves $123,457 and is 99.99% safe.")
    assert ex.source == "template"
    assert any("123457" in i for i in ex.issues)


def test_wrong_route_falls_back(helpers):
    an = _analysis(helpers)
    other = next(r.name for r in an.rec.shipment.routes if r.name != an.rec.chosen.route.name)
    ex = explain(an, llm_fn=lambda p: f"Use {other}.")
    assert ex.source == "template"


def test_unknown_route_is_flagged():
    issues = validate("Use the Cape route.", "{}", "Cape route", ["Direct sea"])
    assert any("not an option" in i for i in issues)


def test_llm_failure_falls_back(helpers):
    def broken(prompt):
        raise TimeoutError("no network")
    ex = explain(_analysis(helpers), llm_fn=broken)
    assert ex.source == "template" and "LLM unavailable" in ex.issues[0]
