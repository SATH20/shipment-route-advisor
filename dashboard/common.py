"""Shared helpers for the dashboard: cached data access and small UI pieces.

The dashboard only reads the ESTIMATED data in data/ - it never sees the evaluation truth.
"""
from __future__ import annotations

import os
import sys
from dataclasses import replace
from typing import Dict, Optional, Tuple

import pandas as pd
import streamlit as st

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from config import assumptions as A  # noqa: E402
from engine.analysis import Analysis, analyze  # noqa: E402
from engine.dataset import build_shipments, load_tables  # noqa: E402
from engine.models import Shipment  # noqa: E402
from engine.optimizer import CANDIDATE, DOMINATED, NOT_ALLOWED, RECOMMENDED, UNRELIABLE  # noqa: E402
from evaluation.scenarios import SCENARIOS  # noqa: E402

STATUS_COLORS = {RECOMMENDED: "#15803d", CANDIDATE: "#2563eb", DOMINATED: "#9ca3af",
                 UNRELIABLE: "#d97706", NOT_ALLOWED: "#dc2626"}
CONF_BADGE = {"High": "High", "Medium": "Medium", "Low": "Low"}
MODE_LABEL = {"expected": "Expected cost", "play_safe": "Play-safe (worst 10%)"}


def money(x: float) -> str:
    return f"${x:,.0f}"


CSS = """
<style>
.block-container {padding-top: 2.2rem; max-width: 1350px;}
h1 {font-weight: 700; letter-spacing: -0.02em;}
h2, h3 {font-weight: 650;}
[data-testid="stMetric"] {background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px;
    padding: 10px 14px;}
[data-testid="stMetricLabel"] p {font-size: 0.82rem; color: #6b7280;}
[data-testid="stMetricValue"] {font-size: 1.45rem;}
.rcard {background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px 10px;
    height: 100%; border-top-width: 4px;}
.rcard .rname {font-weight: 650; font-size: 1.02rem; margin-bottom: 2px;}
.rcard .pill {display: inline-block; font-size: 0.72rem; font-weight: 600; padding: 1px 8px;
    border-radius: 999px; margin-bottom: 6px;}
.rcard .rpath {font-size: 0.78rem; color: #6b7280; margin-bottom: 8px; min-height: 2.2em;}
.rcard table {width: 100%; font-size: 0.85rem; border-collapse: collapse; margin: 0;}
.rcard td {padding: 2px 0; border: none;}
.rcard td.v {text-align: right; font-weight: 600;}
.rcard .rwhy {font-size: 0.76rem; color: #4b5563; margin-top: 8px; border-top: 1px solid #f0f0f0;
    padding-top: 6px;}
.banner {background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 12px 16px;
    margin: 6px 0 12px;}
.banner .t {font-size: 1.15rem; font-weight: 650; color: #14532d;}
.banner .s {font-size: 0.85rem; color: #166534;}
</style>
"""


def inject_css():
    st.markdown(CSS, unsafe_allow_html=True)


def _h(x: str) -> str:
    """Make text safe inside HTML markdown (no LaTeX from $)."""
    return x.replace("$", "&#36;").replace("<", "&lt;")


def route_cards(an: Analysis):
    order = {RECOMMENDED: 0, CANDIDATE: 1, DOMINATED: 2, UNRELIABLE: 3, NOT_ALLOWED: 4}
    evs = sorted(an.rec.evaluations, key=lambda e: (order[e.status], e.score or 0))
    cols = st.columns(len(evs))
    for col, e in zip(cols, evs):
        c = STATUS_COLORS[e.status]
        m = e.metrics
        rows = [("Freight", money(e.route.freight_usd))]
        if m:
            rows += [("Avg transit", f"{m.mean_days:.1f} d"), ("On-time", f"{m.p_on_time:.0%}"),
                     ("Disruption", f"{m.p_disruption:.1%}"), ("Expected cost", money(m.exp_total)),
                     ("Worst 10%", money(m.cvar_total)), ("CO2", f"{m.co2_tonnes:.2f} t")]
        else:
            rows += [("Planned transit", f"{e.route.planned_days:.1f} d")]
        why = e.reasons[0] if e.reasons else ("lowest score" if e.status == RECOMMENDED else "")
        html = (f'<div class="rcard" style="border-top-color:{c}">'
                f'<div class="rname">{_h(e.route.name)}</div>'
                f'<span class="pill" style="background:{c}1a;color:{c}">{e.status}</span>'
                f'<div class="rpath">{_h(e.route.path.replace(" -> ", " &rarr; "))}</div><table>'
                + "".join(f'<tr><td>{k}</td><td class="v">{_h(v)}</td></tr>' for k, v in rows)
                + f'</table>{f"<div class=rwhy>{_h(why)}</div>" if why else ""}</div>')
        col.markdown(html, unsafe_allow_html=True)


def banner(title: str, sub: str):
    st.markdown(f'<div class="banner"><div class="t">{_h(title)}</div><div class="s">{_h(sub)}</div></div>',
                unsafe_allow_html=True)


def md(text: str) -> str:
    """Escape $ so Streamlit markdown does not render money as LaTeX; keep line breaks."""
    return text.replace("$", "\\$").replace("\n", "  \n")


@st.cache_resource(show_spinner=False)
def tables():
    if not os.path.exists(os.path.join(ROOT, "data", "shipments.csv")):
        st.error("No dataset found. Run `python generate_dataset.py` first.")
        st.stop()
    return load_tables()


@st.cache_resource(show_spinner=False)
def shipments(scenarios: Tuple[str, ...] = ()) -> Dict[str, Shipment]:
    ships, routes, legs = tables()
    for name in scenarios:
        legs = SCENARIOS[name](legs)
    return build_shipments(ships, routes, legs)


@st.cache_resource(show_spinner="Running simulations")
def full_analysis(shipment_id: str, mode: Optional[str] = None, scenarios: Tuple[str, ...] = ()) -> Analysis:
    return analyze(shipments(scenarios)[shipment_id], mode=mode, keep_samples=True)


@st.cache_resource(show_spinner="Running simulations")
def what_if(shipment_id: str, mode: Optional[str], scenarios: Tuple[str, ...], penalty: float,
            deadline_shift: float, carbon: float, min_on_time: float) -> Analysis:
    s = shipments(scenarios)[shipment_id]
    s = replace(s, deadline_days=max(1.0, s.deadline_days + deadline_shift))
    return analyze(s, mode=mode, keep_samples=True, penalty_per_day=penalty, carbon_price=carbon,
                   min_on_time=min_on_time)


@st.cache_resource(show_spinner="Analysing all shipments")
def portfolio_analyses() -> Dict[str, Analysis]:
    return {sid: analyze(s, with_tipping=False) for sid, s in shipments().items()}


@st.cache_resource(show_spinner="Analysing all shipments")
def portfolio() -> pd.DataFrame:
    rows = []
    for sid, an in portfolio_analyses().items():
        s = an.rec.shipment
        c = an.rec.chosen
        rows.append({
            "Shipment": sid, "Lane": f"{s.origin} to {s.destination}", "Cargo": s.cargo_type,
            "Profile": s.profile, "Value": money(s.cargo_value_usd), "Deadline (d)": s.deadline_days,
            "Recommended": c.route.name if c else "-",
            "Mode": MODE_LABEL[an.rec.mode],
            "Expected cost ($)": round(c.metrics.exp_total) if c else None,
            "_value": s.cargo_value_usd,
            "On-time": c.metrics.p_on_time if c else None,
            "CO2 (t)": round(c.metrics.co2_tonnes, 2) if c else None,
            "Confidence": an.confidence.label if an.confidence else "-",
            "Agreement": an.confidence.agreement if an.confidence else None,
            "Routes not allowed": sum(e.status == NOT_ALLOWED for e in an.rec.evaluations),
            "Warnings": len(an.rec.warnings),
        })
    return pd.DataFrame(rows)


def shipment_picker(key: str, default: str = "S020") -> str:
    ids = list(shipments().keys())
    s_all = shipments()
    label = {sid: f"{sid}: {s.cargo_type}, {s.origin} to {s.destination} ({s.profile.replace('_', '-')})"
             for sid, s in s_all.items()}
    return st.selectbox("Shipment", ids, index=ids.index(default) if default in ids else 0,
                        format_func=label.get, key=key)


def shipment_card(s: Shipment):
    c = st.columns(5)
    c[0].metric(f"Cargo ({s.profile.replace('_', '-')})", s.cargo_type.title())
    c[1].metric("Value", money(s.cargo_value_usd))
    c[2].metric("Deadline", f"{s.deadline_days:g} days")
    c[3].metric("Late-day penalty", money(s.delay_penalty_usd_per_day))
    c[4].metric("Weight", f"{s.weight_kg:,.0f} kg")
    tags = []
    if s.hazardous:
        tags.append("Hazardous: no air")
    if s.avoid_regions:
        tags.append("Avoids " + ", ".join(r.replace("_", " ").title() for r in s.avoid_regions))
    if s.budget_usd:
        tags.append(f"Freight budget {money(s.budget_usd)}")
    tags.append(f"On-time target {s.min_on_time:.0%}" if s.min_on_time else "No on-time target")
    st.caption(" | ".join(tags))


def routes_table(an: Analysis) -> pd.DataFrame:
    order = {RECOMMENDED: 0, CANDIDATE: 1, DOMINATED: 2, UNRELIABLE: 3, NOT_ALLOWED: 4}
    rows = []
    for e in sorted(an.rec.evaluations, key=lambda e: (order[e.status], e.score or 0)):
        m = e.metrics
        rows.append({
            "Route": e.route.name, "Path": e.route.path, "Status": e.status,
            "Freight": money(e.route.freight_usd),
            "Avg days": f"{m.mean_days:.1f}" if m else f"{e.route.planned_days:.1f} (planned)",
            "On-time": f"{m.p_on_time:.0%}" if m else "-",
            "Disruption": f"{m.p_disruption:.1%}" if m else "-",
            "CO2 (t)": f"{m.co2_tonnes:.2f}" if m else "-",
            "Expected cost": money(m.exp_total) if m else "-",
            "Worst 10%": money(m.cvar_total) if m else "-",
            "Why": "; ".join(e.reasons) if e.reasons else ("best economic score" if e.status == RECOMMENDED else ""),
        })
    return pd.DataFrame(rows)


def style_status(df: pd.DataFrame):
    def color(v):
        c = STATUS_COLORS.get(v)
        return f"color: {c}; font-weight: 600" if c else ""
    return df.style.map(color, subset=["Status"])


def footer():
    st.caption(f"Synthetic data. {A.N_SIMS:,} simulations per route. Assumptions: config/assumptions.py. "
               "The optional LLM only rewrites the explanation; it does not choose the route.")
