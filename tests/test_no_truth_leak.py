"""The recommender must never see the ground truth used for evaluation."""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_engine_and_services_never_reference_ground_truth():
    for pkg in ("engine", "services", "dashboard"):
        folder = os.path.join(ROOT, pkg)
        for dirpath, _, files in os.walk(folder):
            for f in files:
                if f.endswith(".py"):
                    src = open(os.path.join(dirpath, f)).read()
                    assert "ground_truth" not in src and "route_legs_true" not in src, f"{pkg}/{f}"
