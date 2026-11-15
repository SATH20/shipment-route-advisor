import os

import pandas as pd
import plotly.express as px
import streamlit as st

from dashboard.common import ROOT, footer, money, portfolio, portfolio_analyses
from dashboard.maps import ROUTE_TYPE_COLORS, lanes_map, map_config

st.title("Overview")
st.write("Recommended route and confidence for each shipment.")

df = portfolio()

c = st.columns(5)
c[0].metric("Shipments", len(df))
c[1].metric("Candidate routes", len(df) * 4)
c[2].metric("Avg expected cost", money(df["Expected cost ($)"].mean()))
c[3].metric("High-confidence picks", f"{(df['Confidence'] == 'High').sum()}/{len(df)}")
c[4].metric("Total CO2", f"{df['CO2 (t)'].sum():.1f} t")

st.subheader("Recommended routes")
st.plotly_chart(lanes_map(portfolio_analyses()), use_container_width=True, config=map_config())
st.caption("Schematic paths through the main passages. Hover a line for the shipment.")

left, right = st.columns(2)
with left:
    mix = df.groupby(["Recommended", "Profile"]).size().reset_index(name="Shipments")
    fig = px.bar(mix, x="Recommended", y="Shipments", color="Profile", title="Recommended route by cargo profile",
                 color_discrete_sequence=["#1d4ed8", "#d97706", "#15803d", "#7c3aed"])
    fig.update_layout(height=360, margin=dict(t=50, b=10), plot_bgcolor="#fafbfc")
    st.plotly_chart(fig, use_container_width=True)
with right:
    fig = px.scatter(df.rename(columns={"_value": "Cargo value ($)"}), x="Cargo value ($)", y="Expected cost ($)", color="Recommended", symbol="Profile",
                     hover_data=["Shipment", "Cargo", "Confidence"], log_x=True,
                     title="Cargo value vs expected all-in cost", color_discrete_map=ROUTE_TYPE_COLORS)
    fig.update_layout(height=360, margin=dict(t=50, b=10), plot_bgcolor="#fafbfc")
    st.plotly_chart(fig, use_container_width=True)

st.subheader("All shipments")
show = df.drop(columns=["_value"]).copy()
show["Expected cost ($)"] = show["Expected cost ($)"].map(lambda x: f"${x:,.0f}")
show["On-time"] = show["On-time"].map(lambda x: f"{x:.0%}")
show["Agreement"] = show["Agreement"].map(lambda x: f"{x:.0%}")
st.dataframe(show, hide_index=True, use_container_width=True)

warn = df[(df["Confidence"] != "High") | (df["Warnings"] > 0)]
if len(warn):
    st.warning("Check manually: " + ", ".join(
        f"{r.Shipment} ({r.Confidence.lower()} confidence)" if r.Confidence != "High" else f"{r.Shipment} (warning)"
        for r in warn.itertuples()))

results = os.path.join(ROOT, "evaluation", "results", "comparison.csv")
st.subheader("Evaluation")
if os.path.exists(results):
    st.write("Each strategy decides on noisy estimates. Its choices are then simulated on the true values. "
             "Regret is the extra cost compared with the best choice under the same rules.")
    st.dataframe(pd.read_csv(results), hide_index=True, use_container_width=True)
    st.caption("The advisor minimises expected cost, so the cost columns favour it. Compare reliability, "
               "worst-case cost and CO2 as well. 'Always cheapest' comes close on this dataset.")
else:
    st.info("Run `python -m evaluation.evaluate` to add the evaluation table here.")

footer()
