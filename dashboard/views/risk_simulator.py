import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from config import assumptions as A
from dashboard.common import footer, full_analysis, money, shipment_card, shipment_picker, shipments

st.title("Risk simulator")
st.write(f"Each route is simulated {A.N_SIMS:,} times with random delays and disruptions.")

sid = shipment_picker("risk_ship")
s = shipments()[sid]
shipment_card(s)
an = full_analysis(sid)
sim = [e for e in an.rec.evaluations if e.metrics is not None and e.metrics.arrival_samples is not None]
if not sim:
    st.error("No route passes the hard rules for this shipment.")
    st.stop()

chosen_id = an.rec.chosen.route.route_id if an.rec.chosen else None
names = [e.route.name + (" (recommended)" if e.route.route_id == chosen_id else "") for e in sim]

st.subheader("Arrival time")
fig = go.Figure()
for e, name in zip(sim, names):
    fig.add_histogram(x=e.metrics.arrival_samples, name=name, opacity=0.6, nbinsx=60)
fig.add_vline(x=s.deadline_days, line_dash="dash", line_color="red", annotation_text=f"deadline {s.deadline_days:g} d")
fig.update_layout(barmode="overlay", xaxis_title="Arrival (days)", yaxis_title="Simulated voyages",
                  height=400, margin=dict(t=30, b=10))
st.plotly_chart(fig, use_container_width=True)

st.subheader("Cost")
fig = go.Figure()
fig.add_bar(name="Typical voyage (median)", x=names, y=[float(np.median(e.metrics.total_samples)) for e in sim])
fig.add_bar(name="Average (expected cost)", x=names, y=[e.metrics.exp_total for e in sim])
fig.add_bar(name="Worst 10% (play-safe score)", x=names, y=[e.metrics.cvar_total for e in sim])
fig.update_layout(barmode="group", yaxis_title="All-in cost (USD)", height=400, margin=dict(t=30, b=10),
                  legend=dict(orientation="h", y=1.1))
st.plotly_chart(fig, use_container_width=True)

rows = []
for e, name in zip(sim, names):
    m = e.metrics
    rows.append({"Route": name, "Planned days": round(m.planned_days, 1), "Avg days": round(m.mean_days, 1),
                 "90th pct days": round(m.p90_days, 1), "On-time": f"{m.p_on_time:.1%}",
                 "Deadline breach": f"{1 - m.p_on_time:.1%}", "Disruption": f"{m.p_disruption:.1%}",
                 "Expected cost": money(m.exp_total), "90th pct cost": money(m.p90_total),
                 "Worst 10% (CVaR)": money(m.cvar_total),
                 "Cost spread (P90/avg)": f"{m.p90_total / m.exp_total:.2f}x"})
st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)
st.caption("Most simulated voyages cost only the freight. The average and worst-case costs come from the "
           "few late or disrupted voyages.")
footer()
