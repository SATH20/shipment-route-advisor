"""The precomputed responses in api/cache must be exactly what the API computes live."""
import json
import os

import pytest
from fastapi.testclient import TestClient

import api.main as main
from api import cache_store

client = TestClient(main.app)
SAMPLE = ["S001", "S020", "S025"]


def cache_file(sid):
    with open(os.path.join(cache_store.CACHE_DIR, f"{sid}.json"), "rb") as f:
        return f.read()


def test_cache_is_current():
    cache_store.clear_memory()
    assert cache_store.cache_is_current(), (
        "api/cache was built from other data, code or library versions; "
        "run: python scripts/build_cache.py")


@pytest.mark.parametrize("sid", SAMPLE)
def test_cached_json_is_identical_to_live(sid):
    main._shipment_analysis.cache_clear()
    live = main._shipment_analysis(sid, None, (), None, None, None, None)  # computed now
    assert json.loads(cache_file(sid)) == live
    assert cache_file(sid) == json.dumps(live, **cache_store.JSON_KW).encode("utf-8")


def test_default_get_serves_the_cache(monkeypatch):
    cache_store.clear_memory()
    calls = []
    monkeypatch.setattr(main, "_shipment_analysis", lambda *a: calls.append(a) or {})
    for params in ({}, {"mode": "play_safe"}):  # S020's own mode, given explicitly
        r = client.get("/api/shipments/S020", params=params)
        assert r.status_code == 200 and r.content == cache_file("S020")
        assert r.headers["content-type"] == "application/json"
    assert calls == []


@pytest.mark.parametrize("params", [
    {"mode": "expected"}, {"events": "Red Sea crisis"}, {"penalty": 1000},
    {"carbon": 120}, {"deadline_shift": 2}, {"min_on_time": 0.5},
])
def test_other_settings_compute_live(monkeypatch, params):
    cache_store.clear_memory()
    calls = []
    real = main._shipment_analysis
    monkeypatch.setattr(main, "_shipment_analysis", lambda *a: calls.append(a) or real(*a))
    r = client.get("/api/shipments/S020", params=params)
    assert r.status_code == 200 and len(calls) == 1
    assert r.content != cache_file("S020")


def test_stale_cache_is_ignored(monkeypatch):
    monkeypatch.setattr(cache_store, "fingerprint", lambda: "something else")
    cache_store.clear_memory()
    calls = []
    real = main._shipment_analysis
    monkeypatch.setattr(main, "_shipment_analysis", lambda *a: calls.append(a) or real(*a))
    r = client.get("/api/shipments/S025")
    assert r.status_code == 200 and len(calls) == 1
    assert r.json() == json.loads(cache_file("S025"))  # live gives the same numbers
    monkeypatch.undo()
    cache_store.clear_memory()


def test_custom_shipments_never_use_the_cache(monkeypatch):
    monkeypatch.setattr(main, "cached_response", lambda sid: pytest.fail("cache used for POST"))
    with open(os.path.join(main.ROOT, "examples", "custom_shipment.json"), encoding="utf-8") as f:
        assert client.post("/api/recommend", json=json.load(f)).status_code == 200
