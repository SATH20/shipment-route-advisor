import os

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from dashboard.common import (CONF_BADGE, MODE_LABEL, STATUS_COLORS, banner, footer, full_analysis, md, money,
                              route_cards, routes_table, shipment_card, shipment_picker, shipments, style_status)
from dashboard.maps import map_config, route_map
from engine.scoring import breakdown
from services.explanation_service import explain

st.title("Route optimizer")

col_a, col_b = st.columns([3, 1])
with col_a:
    sid = shipment_picker("opt_ship")
s = shipments()[sid]
with col_b:
    mode_choice = st.radio("Decision mode", ["Profile default", "Expected cost", "Play-safe"], key="opt_mode",
                           horizontal=True,
                           help="Profile default uses play-safe for high-value cargo, expected cost otherwise.")
mode = {"Profile default": None, "Expected cost": "expected", "Play-safe": "play_safe"}[mode_choice]

shipment_card(s)
an = full_analysis(sid, mode)
rec = an.rec

if rec.chosen is None:
    st.error(" ".join(rec.warnings))
    st.stop()

ch = rec.chosen
m = ch.metrics
banner(f"Recommended: {ch.route.name}",
       f"{ch.route.path.replace(' -> ', ' → ')}  |  scored on {MODE_LABEL[rec.mode].lower()}")
k = st.columns(5)
k[0].metric("Expected all-in cost", money(m.exp_total))
k[1].metric("Worst 10% cost", money(m.cvar_total))
k[2].metric("On-time chance", f"{m.p_on_time:.0%}")
k[3].metric("Avg transit", f"{m.mean_days:.1f} days")
k[4].metric(f"Confidence ({an.confidence.agreement:.0%})" if an.confidence else "Confidence",
            CONF_BADGE.get(an.confidence.label, "-") if an.confidence else "-")
for w in rec.warnings:
    st.warning(w)

st.plotly_chart(route_map(an), use_container_width=True, config=map_config())
st.caption("Schematic: lines show the ports and main passages each route uses, not exact vessel tracks. "
           "The thick line is the recommendation; dotted lines were rejected, dashed lines were dominated.")

route_cards(an)
st.write("")

left, right = st.columns([3, 2])
with left:
    st.subheader("Explanation")
    use_llm = st.toggle("Rewrite with Gemini", value=False, disabled=not os.environ.get("GEMINI_API_KEY"),
                        help="Needs GEMINI_API_KEY. Every number the LLM writes is checked against the optimizer "
                             "output; any mismatch falls back to the template.")
    ex = explain(an, use_llm=use_llm)
    st.markdown(md(ex.text))
    src = "LLM (validated)" if ex.source == "llm" else "deterministic template"
    st.caption(f"Source: {src}" + (f". Fallback reason: {'; '.join(ex.issues)}" if ex.issues else ""))
with right:
    st.subheader("What would change it")
    if an.tipping:
        for t in an.tipping[:4]:
            st.markdown(md(f"- {t.sentence}"))
    else:
        st.write("No change within the tested ranges.")
    if an.confidence and an.confidence.alternatives:
        st.caption("Other routes that won when estimates were varied: " + ", ".join(
            f"{k} ({v:.0%})" for k, v in an.confidence.alternatives.items()))

sim = [e for e in rec.evaluations if e.metrics]
c1, c2 = st.columns(2)
with c1:
    df = pd.DataFrame([{"Route": e.route.name, "Freight ($)": e.metrics.freight_usd,
                        "Avg days": e.metrics.mean_days, "Disruption": e.metrics.p_disruption,
                        "Status": e.status} for e in sim])
    fig = px.scatter(df, x="Avg days", y="Freight ($)", color="Status", text="Route", size="Disruption",
                     size_max=40, color_discrete_map=STATUS_COLORS, log_y=True,
                     title="Freight vs transit time (bubble size: disruption chance)")
    fig.update_traces(textposition="top center")
    fig.add_vline(x=s.deadline_days, line_dash="dash", line_color="#dc2626", annotation_text="deadline")
    fig.update_layout(height=420, margin=dict(t=50, b=10), plot_bgcolor="#fafbfc")
    st.plotly_chart(fig, use_container_width=True)
with c2:
    fig = go.Figure()
    palette = {"freight": "#1d4ed8", "late penalty": "#d97706", "disruption loss": "#dc2626", "carbon": "#6b7280"}
    for p, c in palette.items():
        fig.add_bar(name=p, x=[e.route.name for e in sim], y=[breakdown(e.metrics).as_dict()[p] for e in sim],
                    marker_color=c)
    fig.update_layout(barmode="stack", title="Expected cost by component", height=420,
                      margin=dict(t=50, b=10), yaxis_title="USD", plot_bgcolor="#fafbfc",
                      legend=dict(orientation="h", y=1.08))
    st.plotly_chart(fig, use_container_width=True)

with st.expander("Details: all routes in one table"):
    st.dataframe(style_status(routes_table(an)), hide_index=True, use_container_width=True)

footer()
