"""Tests for the FastAPI endpoints."""
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_shipments_list():
    resp = client.get("/api/shipments")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 30
    assert "id" in data[0]
    assert "cargo" in data[0]
    assert "recommended_route_name" in data[0]
    assert "confidence_label" in data[0]


def test_shipment_s020():
    resp = client.get("/api/shipments/S020")
    assert resp.status_code == 200
    data = resp.json()
    assert data["shipment"]["id"] == "S020"
    routes = data["routes"]
    assert len(routes) == 4
    recommended = [r for r in routes if r["status"] == "recommended"]
    assert len(recommended) == 1
    assert recommended[0]["name"] == "Air freight"
    assert data["recommended_route_id"] == recommended[0]["id"]


def test_shipment_mode_expected():
    resp = client.get("/api/shipments/S020?mode=expected")
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "expected"
    recommended = [r for r in data["routes"] if r["status"] == "recommended"]
    assert len(recommended) == 1
    assert recommended[0]["name"] == "Direct sea"


def test_shipment_events_red_sea_crisis():
    resp = client.get("/api/shipments/S025?events=Red Sea crisis")
    assert resp.status_code == 200
    data = resp.json()
    recommended = [r for r in data["routes"] if r["status"] == "recommended"]
    assert len(recommended) == 1
    assert recommended[0]["name"] == "Sea + air"


def test_shipment_unknown_id_404():
    resp = client.get("/api/shipments/UNKNOWN_ID")
    assert resp.status_code == 404


def test_shipment_unknown_event_422():
    resp = client.get("/api/shipments/S020?events=Nonexistent%20Event")
    assert resp.status_code == 422


def test_evaluation_endpoint():
    resp = client.get("/api/evaluation")
    assert resp.status_code == 200
    data = resp.json()
    assert "comparison" in data
    assert "noise_sweep" in data
    assert "by_profile" in data


def test_assumptions_endpoint():
    resp = client.get("/api/assumptions")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) > 0
    assert "name" in data[0]
    assert "value" in data[0]


def test_scenario_endpoint():
    resp = client.get("/api/scenarios/Red Sea crisis")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Red Sea crisis"
    assert data["rerouted"] == 3


def test_s020_passages():
    from engine.dataset import load_shipments
    from geography import route_passages

    s = load_shipments()["S020"]
    direct_sea = next(r for r in s.routes if r.name == "Direct sea")
    suez = next(r for r in s.routes if r.name == "Suez corridor")

    direct_passages = route_passages(direct_sea.legs)
    suez_passages = route_passages(suez.legs)

    assert "Cape of Good Hope" in direct_passages
    assert "Suez Canal" in suez_passages


def test_api_s020_passages():
    resp = client.get("/api/shipments/S020")
    assert resp.status_code == 200
    data = resp.json()
    routes = data["routes"]
    assert len(routes) == 4
    for r in routes:
        assert "passages" in r
        assert isinstance(r["passages"], list)
        assert len(r["passages"]) > 0

    direct_sea = next(r for r in routes if r["name"] == "Direct sea")
    suez = next(r for r in routes if r["name"] == "Suez corridor")

    assert "Cape of Good Hope" in direct_sea["passages"]
    assert "Suez Canal" in suez["passages"]



def test_detail_has_settings_runner_up_and_stop_coords():
    from fastapi.testclient import TestClient
    from api.main import app
    from config import assumptions as A
    from geography import PORTS
    d = TestClient(app).get("/api/shipments/S020").json()
    assert d["settings"]["n_sims"] == A.N_SIMS
    assert d["settings"]["confidence_runs"] == A.CONFIDENCE_RUNS
    assert d["settings"]["default_carbon_price"] == A.CARBON_PRICE_USD_PER_TONNE
    # S020 is play-safe: the runner-up is ranked on the worst-10% cost, i.e. Direct sea (README example)
    names = {r["id"]: r["name"] for r in d["routes"]}
    assert names[d["runner_up_id"]] == "Direct sea"
    for r in d["routes"]:
        assert len(r["stop_coords"]) == len(r["stops"])
        for name, (lat, lon) in zip(r["stops"], r["stop_coords"]):
            assert (lat, lon) == PORTS[name]


def test_events_endpoint_lists_every_scenario():
    from fastapi.testclient import TestClient
    from api.main import app
    from evaluation.scenarios import SCENARIOS
    ev = TestClient(app).get("/api/events").json()
    assert [e["id"] for e in ev] == list(SCENARIOS)
    assert all(e["title"] and e["description"] for e in ev)


def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_allowed_origins_from_env():
    """ALLOWED_ORIGINS (set on Render to the Vercel URL) controls CORS."""
    import importlib
    import os
    import api.main as m
    old = os.environ.get("ALLOWED_ORIGINS")
    os.environ["ALLOWED_ORIGINS"] = "https://example-app.vercel.app, http://localhost:3000"
    try:
        m2 = importlib.reload(m)
        c = TestClient(m2.app)
        ok = c.get("/api/health", headers={"Origin": "https://example-app.vercel.app"})
        bad = c.get("/api/health", headers={"Origin": "https://evil.example"})
        assert ok.headers.get("access-control-allow-origin") == "https://example-app.vercel.app"
        assert "access-control-allow-origin" not in bad.headers
    finally:
        if old is None:
            os.environ.pop("ALLOWED_ORIGINS", None)
        else:
            os.environ["ALLOWED_ORIGINS"] = old
        importlib.reload(m)


def test_s020_air_capacity_crunch_confidence():
    """The "How sure are we?" panel shows this value; it must come from the event-adjusted run."""
    d = client.get("/api/shipments/S020", params={"events": "Air capacity crunch"}).json()
    assert d["confidence"]["agreement"] == 0.45
    assert d["confidence"]["runs"] == 100
    assert d["confidence"]["label"] == "Low"
    pick = next(r["name"] for r in d["routes"] if r["id"] == d["recommended_route_id"])
    assert pick == "Air freight"
    # and without the event the same shipment is a confident pick
    assert client.get("/api/shipments/S020").json()["confidence"]["agreement"] == 0.82


def test_web_example_shipment_matches_examples_folder():
    """The web app pre-fills "Your own shipment" with a copy of the example (Vercel only builds web/)."""
    import json
    import os
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(root, "examples", "custom_shipment.json"), encoding="utf-8") as f:
        original = json.load(f)
    with open(os.path.join(root, "web", "src", "data", "custom_shipment.example.json"), encoding="utf-8") as f:
        copy = json.load(f)
    assert copy == original, "copy examples/custom_shipment.json to web/src/data/custom_shipment.example.json"
