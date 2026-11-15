"""POST /api/recommend: a shipment given as JSON runs the same pipeline as a dataset shipment."""
import copy
import json
import os

from fastapi.testclient import TestClient

from api.main import app
from engine.dataset import load_shipments

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXAMPLE = os.path.join(ROOT, "examples", "custom_shipment.json")
LEG_FIELDS = ("from_hub", "to_hub", "mode", "region", "distance_km", "cost_usd", "transit_days",
              "delay_prob", "mean_delay_days", "congestion", "geo_risk")

client = TestClient(app)


def shipment_as_json(sid: str) -> dict:
    s = load_shipments()[sid]
    return {
        "shipment_id": s.shipment_id, "origin": s.origin, "destination": s.destination,
        "cargo_type": s.cargo_type, "profile": s.profile, "weight_kg": s.weight_kg,
        "cargo_value_usd": s.cargo_value_usd, "deadline_days": s.deadline_days,
        "delay_penalty_usd_per_day": s.delay_penalty_usd_per_day, "budget_usd": s.budget_usd,
        "hazardous": s.hazardous, "avoid_regions": list(s.avoid_regions),
        "routes": [{"name": r.name, "route_id": r.route_id,
                    "legs": [{f: getattr(l, f) for f in LEG_FIELDS} for l in r.legs]} for r in s.routes],
    }


def example() -> dict:
    with open(EXAMPLE, encoding="utf-8") as f:
        return json.load(f)


def test_posting_s020_matches_get_exactly():
    body = shipment_as_json("S020")
    for mode in (None, "expected"):
        params = {"mode": mode} if mode else {}
        got = client.post("/api/recommend", json=body, params=params)
        assert got.status_code == 200, got.text
        want = client.get("/api/shipments/S020", params=params).json()
        assert got.json() == want  # same pick, numbers, explanation, confidence and tipping


def test_example_file_returns_one_recommended_route():
    r = client.post("/api/recommend", json=example())
    assert r.status_code == 200, r.text
    d = r.json()
    rec = [x for x in d["routes"] if x["status"] == "recommended"]
    assert len(rec) == 1 and rec[0]["id"] == d["recommended_route_id"]
    assert d["confidence"] is not None and d["tipping"]
    assert any(len(x["stops"]) == 4 for x in d["routes"])  # the 3-leg route
    assert d["shipment"]["id"] not in load_shipments()  # really a new shipment


def test_bad_probability_gives_422():
    body = example()
    body["routes"][0]["legs"][0]["delay_prob"] = 1.5
    r = client.post("/api/recommend", json=body)
    assert r.status_code == 422
    err = r.json()["detail"][0]
    assert err["loc"][-1] == "delay_prob" and "less than or equal to 1" in err["msg"]


def test_other_invalid_inputs_give_clear_422():
    cases = {
        "unknown profile": lambda b: b.update(profile="overnight"),
        "unknown mode": lambda b: b["routes"][0]["legs"][0].update(mode="teleport"),
        "negative cost": lambda b: b["routes"][0]["legs"][0].update(cost_usd=-5),
        "broken chain": lambda b: b["routes"][2]["legs"][1].update(from_hub="Mumbai"),
        "wrong origin": lambda b: b.update(origin="Mumbai"),
        "no routes": lambda b: b.update(routes=[]),
    }
    for name, change in cases.items():
        body = example()
        change(body)
        r = client.post("/api/recommend", json=body)
        assert r.status_code == 422, name
    r = client.post("/api/recommend", json=example(), params={"mode": "fastest"})
    assert r.status_code == 422


def test_unknown_ports_do_not_crash():
    body = copy.deepcopy(example())
    hub = body["routes"][2]["legs"][0]["to_hub"]
    body["routes"][2]["legs"][0]["to_hub"] = body["routes"][2]["legs"][1]["from_hub"] = "Port Nowhere"
    assert hub != "Port Nowhere"
    r = client.post("/api/recommend", json=body)
    assert r.status_code == 200, r.text
    route = r.json()["routes"][2]
    assert route["coords"] == [] and route["passages"] == [] and route["stop_coords"] == []


def test_default_late_penalty_comes_from_the_profile():
    from config import assumptions as A
    d = client.post("/api/recommend", json=example()).json()
    body = example()
    assert "delay_penalty_usd_per_day" not in body
    want = round(body["cargo_value_usd"] * A.PROFILES[body["profile"]]["penalty_pct_per_day"], -1)
    assert d["shipment"]["penalty_per_day"] == want
