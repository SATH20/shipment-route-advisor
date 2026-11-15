"""The recommender must never see the ground truth used for evaluation."""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_engine_and_services_never_reference_ground_truth():
    for pkg in ("engine", "services", "api"):
        folder = os.path.join(ROOT, pkg)
        for dirpath, _, files in os.walk(folder):
            for f in files:
                if f.endswith(".py"):
                    src = open(os.path.join(dirpath, f), encoding="utf-8").read()
                    assert "ground_truth" not in src and "route_legs_true" not in src, f"{pkg}/{f}"

    web_src = os.path.join(ROOT, "web", "src")
    if os.path.exists(web_src):
        for dirpath, _, files in os.walk(web_src):
            for f in files:
                if f.endswith((".ts", ".tsx", ".js", ".jsx")):
                    src = open(os.path.join(dirpath, f), encoding="utf-8").read()
                    assert "ground_truth" not in src and "route_legs_true" not in src, f"web/src/{f}"


def test_web_src_is_scanned():
    # the static scan above silently skips web/src if the folder moves; fail loudly instead
    assert os.path.isdir(os.path.join(ROOT, "web", "src"))


def test_api_never_opens_ground_truth_at_runtime(monkeypatch):
    """Call every API endpoint and record every file pandas or open() reads."""
    import builtins

    import pandas as pd
    from fastapi.testclient import TestClient

    from api import main

    opened = []
    real_open, real_read_csv = builtins.open, pd.read_csv

    def spy_open(file, *a, **k):
        opened.append(str(file))
        return real_open(file, *a, **k)

    def spy_read_csv(path, *a, **k):
        opened.append(str(path))
        return real_read_csv(path, *a, **k)

    monkeypatch.setattr(builtins, "open", spy_open)
    monkeypatch.setattr(pd, "read_csv", spy_read_csv)
    for f in (main._load_shipments, main._shipment_analysis, main._evaluation_data, main._scenario_data):
        f.cache_clear()

    c = TestClient(main.app)
    for url in ("/api/shipments/S001", "/api/shipments/S001?events=Red%20Sea%20crisis",
                "/api/evaluation", "/api/scenarios/Red%20Sea%20crisis", "/api/events", "/api/settings"):
        assert c.get(url).status_code == 200, url
    assert opened, "spy recorded nothing"
    leaks = [p for p in opened if "ground_truth" in p or "route_legs_true" in p]
    assert not leaks, leaks
