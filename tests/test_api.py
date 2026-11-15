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

