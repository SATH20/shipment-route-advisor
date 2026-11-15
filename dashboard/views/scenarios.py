import pandas as pd
import streamlit as st

from config import assumptions as A
from dashboard.common import (MODE_LABEL, footer, full_analysis, md, money, routes_table, shipment_card,
                              shipment_picker, shipments, style_status, what_if)
from dashboard.maps import map_config, route_map
from evaluation.scenarios import SCENARIOS, run_scenario
from services.explanation_service import explain

st.title("Scenarios")

tab1, tab2 = st.tabs(["One shipment", "All shipments"])

with tab1:
    sid = shipment_picker("wi_ship")
    s = shipments()[sid]
    shipment_card(s)

    st.markdown("##### Conditions")
    c = st.columns(3)
    scen = tuple(n for n in SCENARIOS if c[list(SCENARIOS).index(n) % 3].checkbox(n, key=f"wi_{n}"))
    st.markdown("##### Business inputs")
    c = st.columns(4)
    penalty = c[0].slider("Late-day penalty ($)", 0, int(max(1000, s.delay_penalty_usd_per_day * 10)),
                          int(s.delay_penalty_usd_per_day), step=10)
    shift = c[1].slider("Deadline shift (days)", -10.0, 10.0, 0.0, 0.5)
    carbon = c[2].slider("Carbon price ($/t)", 0, 500, int(A.CARBON_PRICE_USD_PER_TONNE), step=10)
    target = c[3].slider("On-time target", 0.0, 0.99, float(s.min_on_time), 0.01)
    mode_choice = st.radio("Decision mode", ["Profile default", "Expected cost", "Play-safe"], horizontal=True,
                           key="wi_mode")
    mode = {"Profile default": None, "Expected cost": "expected", "Play-safe": "play_safe"}[mode_choice]

    base = full_analysis(sid, mode)
    new = what_if(sid, mode, scen, float(penalty), float(shift), float(carbon), float(target))

    b, n = base.rec.chosen, new.rec.chosen
    l, r = st.columns(2)
    l.metric("Current recommendation", b.route.name if b else "-")
    if b:
        l.caption(f"Score: {money(b.metrics.objective(base.rec.mode))} ({MODE_LABEL[base.rec.mode].lower()})")
    if n:
        changed = (b is None) or n.route.route_id != b.route.route_id
        r.metric("After changes" + (" (changed)" if changed else " (same)"), n.route.name)
        r.caption(f"Score: {money(n.metrics.objective(new.rec.mode))} ({MODE_LABEL[new.rec.mode].lower()})")
    else:
        r.metric("After changes", "No valid route")
    for w in new.rec.warnings:
        st.warning(w)
    if n:
        st.plotly_chart(route_map(new, height=400), use_container_width=True, config=map_config())
        st.markdown(md(explain(new, use_llm=False).text))
    st.dataframe(style_status(routes_table(new)), hide_index=True, use_container_width=True)

with tab2:
    st.write("Applies one change to all 30 shipments and re-runs each decision. Forced: the old route now "
             "breaks a rule. Locked in: only one valid route is left.")
    pick = st.selectbox("Scenario", list(SCENARIOS), key="pf_scen")

    @st.cache_resource(show_spinner="Running all shipments")
    def cached(name):
        return run_scenario(name)

    res = cached(pick)
    k = st.columns(5)
    k[0].metric("Re-routed", f"{res.rerouted}/{res.total}")
    k[1].metric("Forced switches", res.forced)
    k[2].metric("Locked in", res.locked_in)
    k[3].metric("Avg cost, before to after", f"{money(res.avg_cost_before)} to {money(res.avg_cost_after)}")
    k[4].metric("CO2 change", f"{res.co2_change:+.1f} t")
    if res.details:
        st.dataframe(pd.DataFrame(res.details), hide_index=True, use_container_width=True)
    else:
        st.info("No shipment changes route.")

footer()
