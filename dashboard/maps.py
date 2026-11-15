"""Plotly maps for the dashboard."""
from __future__ import annotations

import os
from typing import Dict, List

import plotly.graph_objects as go

from engine.analysis import Analysis
from engine.optimizer import CANDIDATE, DOMINATED, NOT_ALLOWED, RECOMMENDED, UNRELIABLE
from geography import PORTS, route_path

STATUS_STYLE = {
    RECOMMENDED: dict(color="#15803d", width=6, dash="solid"),
    CANDIDATE: dict(color="#2563eb", width=2.5, dash="solid"),
    DOMINATED: dict(color="#9ca3af", width=2, dash="dash"),
    UNRELIABLE: dict(color="#d97706", width=2, dash="dot"),
    NOT_ALLOWED: dict(color="#dc2626", width=1.5, dash="dot"),
}
ROUTE_TYPE_COLORS = {
    "Direct sea": "#2563eb", "Sea via hub": "#0891b2", "Suez corridor": "#dc2626", "Cape route": "#7c3aed",
    "Sea + rail": "#15803d", "Sea + air": "#d97706", "Air freight": "#9333ea",
}


def map_config() -> dict:
    """Plotly config for maps. Set PLOTLY_TOPOJSON_URL to serve the map outlines locally (offline use)."""
    cfg = {"displayModeBar": False}
    if os.environ.get("PLOTLY_TOPOJSON_URL"):
        cfg["topojsonURL"] = os.environ["PLOTLY_TOPOJSON_URL"]
    return cfg


def _geo_layout(fig: go.Figure, height: int):
    fig.update_geos(projection_type="natural earth", showland=True, landcolor="#e9edf2", showocean=True,
                    oceancolor="#f8fafc", showcountries=True, countrycolor="#d5dbe3", coastlinecolor="#b8c2cf",
                    showframe=False, lataxis_range=[-50, 72])
    fig.update_layout(height=height, margin=dict(l=0, r=0, t=10, b=0), paper_bgcolor="rgba(0,0,0,0)",
                      legend=dict(orientation="h", yanchor="top", y=-0.02, xanchor="left", x=0, font=dict(size=12)))


def route_map(an: Analysis, height: int = 470) -> go.Figure:
    fig = go.Figure()
    order = {NOT_ALLOWED: 0, UNRELIABLE: 1, DOMINATED: 2, CANDIDATE: 3, RECOMMENDED: 4}   # recommended on top
    hubs = set()
    for e in sorted(an.rec.evaluations, key=lambda e: order[e.status]):
        pts = route_path(e.route.legs)
        if not pts:
            continue
        st = dict(STATUS_STYLE[e.status])
        if e.status not in (NOT_ALLOWED, UNRELIABLE):
            st["color"] = ROUTE_TYPE_COLORS.get(e.route.name, st["color"])   # tell route types apart
        m = e.metrics
        hover = (f"<b>{e.route.name}</b><br>{e.route.path}<br>Status: {e.status}<br>"
                 f"Freight: ${e.route.freight_usd:,.0f}<br>"
                 + (f"Avg transit: {m.mean_days:.1f} days<br>On-time: {m.p_on_time:.0%}<br>"
                    f"Expected cost: ${m.exp_total:,.0f}" if m else (e.reasons[0] if e.reasons else "")))
        fig.add_trace(go.Scattergeo(
            lat=[p[0] for p in pts], lon=[p[1] for p in pts], mode="lines",
            line=dict(width=st["width"], color=st["color"], dash=st["dash"]),
            name=f"{e.route.name} ({e.status})", hoverinfo="text", text=hover,
            opacity=1.0 if e.status == RECOMMENDED else 0.75))
        hubs.update(l.to_hub for l in e.route.legs[:-1])
    s = an.rec.shipment
    ends = [s.origin, s.destination]
    fig.add_trace(go.Scattergeo(
        lat=[PORTS[p][0] for p in ends], lon=[PORTS[p][1] for p in ends], mode="markers+text",
        text=ends, textposition="top center", marker=dict(size=10, color="#111827"), textfont=dict(size=12),
        hoverinfo="text", showlegend=False))
    hubs = [h for h in hubs if h in PORTS and h not in ends]
    if hubs:
        fig.add_trace(go.Scattergeo(
            lat=[PORTS[h][0] for h in hubs], lon=[PORTS[h][1] for h in hubs], mode="markers+text",
            text=hubs, textposition="bottom center", marker=dict(size=6, color="#475569"),
            textfont=dict(size=10, color="#475569"), hoverinfo="text", showlegend=False))
    _geo_layout(fig, height)
    return fig


def lanes_map(analyses: Dict[str, Analysis], height: int = 430) -> go.Figure:
    """Recommended route of every shipment, coloured by route type."""
    fig = go.Figure()
    shown = set()
    ports = set()
    for sid, an in analyses.items():
        c = an.rec.chosen
        if not c:
            continue
        pts = route_path(c.route.legs)
        name = c.route.name
        fig.add_trace(go.Scattergeo(
            lat=[p[0] for p in pts], lon=[p[1] for p in pts], mode="lines",
            line=dict(width=2, color=ROUTE_TYPE_COLORS.get(name, "#64748b")), opacity=0.7,
            name=name, legendgroup=name, showlegend=name not in shown, hoverinfo="text",
            text=f"<b>{sid}</b>: {an.rec.shipment.cargo_type}<br>{c.route.path}<br>{name}"))
        shown.add(name)
        ports.update([an.rec.shipment.origin, an.rec.shipment.destination])
    ports = sorted(p for p in ports if p in PORTS)
    fig.add_trace(go.Scattergeo(
        lat=[PORTS[p][0] for p in ports], lon=[PORTS[p][1] for p in ports], mode="markers",
        marker=dict(size=6, color="#111827"), text=ports, hoverinfo="text", showlegend=False))
    _geo_layout(fig, height)
    return fig
