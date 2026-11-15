"""Dashboard for the shipment route advisor.

Run:  streamlit run dashboard/app.py
"""
import os
import sys

import streamlit as st

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

st.set_page_config(page_title="Shipment route advisor", layout="wide")

from dashboard.common import inject_css  # noqa: E402

inject_css()

pages = st.navigation([
    st.Page("views/overview.py", title="Overview", default=True),
    st.Page("views/route_optimizer.py", title="Route optimizer"),
    st.Page("views/risk_simulator.py", title="Risk simulator"),
    st.Page("views/scenarios.py", title="Scenarios"),
])

with st.sidebar:
    st.markdown("**Shipment route advisor**")
    st.markdown(
        "Pipeline  \n"
        "1. Hard rules  \n2. Monte Carlo (5,000 runs)  \n3. Reliability rules  \n"
        "4. Pareto filter  \n5. Economic score  \n6. Confidence  \n7. Tipping points  \n8. Explanation"
    )

pages.run()
