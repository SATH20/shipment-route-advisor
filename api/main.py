"""FastAPI application exposing the shipment route advisor engine."""
from __future__ import annotations

import dataclasses
import functools
import os
import sys
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from config.assumptions import assumptions_table  # noqa: E402
from engine.analysis import analyze  # noqa: E402
from engine.dataset import build_shipments, load_tables  # noqa: E402
from engine.models import Shipment  # noqa: E402
from evaluation.scenarios import SCENARIOS, run_scenario  # noqa: E402
from geography import route_passages, route_path  # noqa: E402
from services.explanation_service import explain  # noqa: E402

app = FastAPI(title="Shipment Route Advisor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@functools.lru_cache(maxsize=32)
def _load_shipments(events: Tuple[str, ...] = ()) -> Dict[str, Shipment]:
    ships, routes, legs = load_tables()
    for ev in events:
        legs = SCENARIOS[ev](legs)
    return build_shipments(ships, routes, legs)


@functools.lru_cache(maxsize=16)
def _all_shipments_summary() -> List[dict]:
    ships_dict = _load_shipments(())
    result = []
    for sid, s in ships_dict.items():
        an = analyze(s, with_tipping=False)
        rec = an.rec
        c = rec.chosen
        result.append({
            "id": s.shipment_id,
            "cargo": s.cargo_type,
            "profile": s.profile,
            "origin": s.origin,
            "destination": s.destination,
            "value_usd": float(s.cargo_value_usd),
            "weight_kg": float(s.weight_kg),
            "deadline_days": float(s.deadline_days),
            "recommended_route_name": c.route.name if c else None,
            "confidence_label": an.confidence.label if an.confidence else None,
        })
    return result


@functools.lru_cache(maxsize=256)
def _shipment_analysis(
    shipment_id: str,
    mode: Optional[str],
    events: Tuple[str, ...],
    penalty: Optional[float],
    deadline_shift: Optional[float],
    carbon: Optional[float],
    min_on_time: Optional[float],
) -> dict:
    ships_dict = _load_shipments(events)
    if shipment_id not in ships_dict:
        raise HTTPException(status_code=404, detail=f"Shipment {shipment_id} not found")

    s = ships_dict[shipment_id]

    # Deadline shift modifies shipment.deadline_days
    if deadline_shift is not None and deadline_shift != 0.0:
        new_deadline = max(1.0, float(s.deadline_days + deadline_shift))
        s = dataclasses.replace(s, deadline_days=new_deadline)

    overrides = {}
    if penalty is not None:
        overrides["penalty_per_day"] = float(penalty)
    if carbon is not None:
        overrides["carbon_price"] = float(carbon)
    if min_on_time is not None:
        overrides["min_on_time"] = float(min_on_time)

    # When overrides or deadline_shift are passed, confidence and tipping are skipped
    with_conf = True
    with_tips = True
    if deadline_shift is not None and deadline_shift != 0.0:
        with_conf = False
        with_tips = False

    an = analyze(
        s,
        mode=mode,
        keep_samples=True,
        with_confidence=with_conf,
        with_tipping=with_tips,
        **overrides,
    )
    rec = an.rec

    # Build response routes
    route_list = []
    for e in rec.evaluations:
        r = e.route
        m = e.metrics

        metrics_dict = None
        hist_dict = None
        if m is not None:
            metrics_dict = {
                "mean_days": float(m.mean_days),
                "p90_days": float(m.p90_days),
                "p_on_time": float(m.p_on_time),
                "p_disruption": float(m.p_disruption),
                "exp_late_cost": float(m.exp_late_cost),
                "exp_loss": float(m.exp_loss),
                "carbon_cost": float(m.carbon_cost),
                "exp_total": float(m.exp_total),
                "cvar_total": float(m.cvar_total),
                "co2_tonnes": float(m.co2_tonnes),
            }
            if m.arrival_samples is not None and len(m.arrival_samples) > 0:
                counts, edges = np.histogram(m.arrival_samples, bins=30)
                hist_dict = {
                    "edges": [float(x) for x in edges],
                    "counts": [int(x) for x in counts],
                }

        pts = route_path(r.legs)
        coords = [[float(lat), float(lon)] for lat, lon in pts]

        route_list.append({
            "id": r.route_id,
            "name": r.name,
            "stops": [r.legs[0].from_hub] + [l.to_hub for l in r.legs],
            "status": e.status,
            "reasons": list(e.reasons),
            "freight_usd": float(r.freight_usd),
            "planned_days": float(r.planned_days),
            "metrics": metrics_dict,
            "coords": coords,
            "passages": route_passages(r.legs),
            "arrival_histogram": hist_dict,
        })

    conf_dict = None
    if an.confidence is not None:
        conf_dict = {
            "label": an.confidence.label,
            "agreement": float(an.confidence.agreement),
            "runs": int(an.confidence.runs),
            "alternatives": {k: float(v) for k, v in an.confidence.alternatives.items()},
        }

    tipping_list = [
        {
            "parameter": t.parameter,
            "sentence": t.sentence,
            "new_route": t.new_route,
        }
        for t in an.tipping
    ]

    exp = explain(an, use_llm=False)

    return {
        "shipment": {
            "id": s.shipment_id,
            "cargo": s.cargo_type,
            "profile": s.profile,
            "origin": s.origin,
            "destination": s.destination,
            "value_usd": float(s.cargo_value_usd),
            "weight_kg": float(s.weight_kg),
            "deadline_days": float(s.deadline_days),
            "penalty_per_day": float(penalty if penalty is not None else s.delay_penalty_usd_per_day),
            "min_on_time": float(min_on_time if min_on_time is not None else s.min_on_time),
            "risk_mode": s.risk_mode,
            "hazardous": bool(s.hazardous),
            "avoid_regions": list(s.avoid_regions),
            "budget_usd": float(s.budget_usd) if s.budget_usd is not None else None,
        },
        "mode": rec.mode,
        "recommended_route_id": rec.chosen.route.route_id if rec.chosen else None,
        "warnings": list(rec.warnings),
        "routes": route_list,
        "confidence": conf_dict,
        "tipping": tipping_list,
        "explanation": {
            "text": exp.text,
            "source": exp.source,
        },
    }


@app.get("/api/shipments")
def get_shipments():
    return _all_shipments_summary()


@app.get("/api/shipments/{id}")
def get_shipment(
    id: str,
    mode: Optional[str] = Query(None, description="Decision mode: expected | play_safe"),
    events: Optional[str] = Query(None, description="Comma-separated scenario names"),
    penalty: Optional[float] = Query(None, description="Late penalty per day in USD"),
    deadline_shift: Optional[float] = Query(None, description="Deadline shift in days"),
    carbon: Optional[float] = Query(None, description="Carbon price in USD per tonne"),
    min_on_time: Optional[float] = Query(None, description="Minimum on-time target (0-1)"),
):
    if mode is not None and mode not in ("expected", "play_safe"):
        raise HTTPException(status_code=422, detail=f"Invalid mode '{mode}'. Must be 'expected' or 'play_safe'.")

    event_tuple: Tuple[str, ...] = ()
    if events:
        event_names = [e.strip() for e in events.split(",") if e.strip()]
        for ev in event_names:
            if ev not in SCENARIOS:
                raise HTTPException(
                    status_code=422,
                    detail=f"Unknown scenario event '{ev}'. Available: {list(SCENARIOS.keys())}",
                )
        event_tuple = tuple(event_names)

    return _shipment_analysis(id, mode, event_tuple, penalty, deadline_shift, carbon, min_on_time)


@functools.lru_cache(maxsize=4)
def _evaluation_data() -> dict:
    res_dir = os.path.join(ROOT, "evaluation", "results")
    f_comp = os.path.join(res_dir, "comparison.csv")
    f_sweep = os.path.join(res_dir, "noise_sweep.csv")
    f_prof = os.path.join(res_dir, "by_profile.csv")

    for f in (f_comp, f_sweep, f_prof):
        if not os.path.exists(f):
            raise HTTPException(status_code=503, detail="Run python -m evaluation.evaluate first")

    return {
        "comparison": pd.read_csv(f_comp).to_dict(orient="records"),
        "noise_sweep": pd.read_csv(f_sweep).to_dict(orient="records"),
        "by_profile": pd.read_csv(f_prof).to_dict(orient="records"),
    }


@app.get("/api/evaluation")
def get_evaluation():
    return _evaluation_data()


@functools.lru_cache(maxsize=16)
def _scenario_data(name: str) -> dict:
    if name not in SCENARIOS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown scenario '{name}'. Available: {list(SCENARIOS.keys())}",
        )
    res = run_scenario(name)
    return dataclasses.asdict(res)


@app.get("/api/scenarios/{name}")
def get_scenario(name: str):
    return _scenario_data(name)


@functools.lru_cache(maxsize=4)
def _assumptions_data() -> List[dict]:
    return [{"name": name, "value": val} for name, val in assumptions_table()]


@app.get("/api/assumptions")
def get_assumptions():
    return _assumptions_data()
