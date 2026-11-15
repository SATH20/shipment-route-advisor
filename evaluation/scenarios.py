"""What-if scenarios: change the world, re-run every decision, report what moves.

Scenarios are applied to the planner's ESTIMATED data (they model news the planner receives).

  red_sea_crisis       Red Sea legs: geopolitical risk 0.97, more and longer delays
  red_sea_reopens      Red Sea legs: geopolitical risk falls to normal levels
  hub_congestion       every transshipment hub: congestion x1.6, delay probability x1.5, +2 days delay
  air_capacity_crunch  air freight rates x1.8

For each scenario we report how many shipments are re-routed, where they move, and the
value of re-planning (expected cost of keeping the old route under the new conditions minus
expected cost of the new choice).

Run:  python -m evaluation.scenarios
"""
from __future__ import annotations

import os
import sys
from collections import Counter
from dataclasses import dataclass
from typing import Callable, Dict, List

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from engine.dataset import build_shipments, load_tables  # noqa: E402
from engine.optimizer import NOT_ALLOWED, UNRELIABLE, recommend  # noqa: E402
from engine.simulation import simulate_route  # noqa: E402


# Scenario parameters (also used to describe the events in the web app)
CRISIS_GEO_RISK = 0.97
CRISIS_EXTRA_DELAY_PROB = 0.3
CRISIS_EXTRA_DELAY_DAYS = 5
REOPEN_GEO_RISK = 0.12
REOPEN_DELAY_FACTOR = 0.8
HUB_CONGESTION_FACTOR = 1.6
HUB_DELAY_PROB_FACTOR = 1.5
HUB_EXTRA_DELAY_DAYS = 2
AIR_PRICE_FACTOR = 1.8


def red_sea_crisis(legs: pd.DataFrame) -> pd.DataFrame:
    legs = legs.copy()
    m = legs["region"] == "red_sea"
    legs.loc[m, "geo_risk"] = CRISIS_GEO_RISK
    legs.loc[m, "delay_prob"] = (legs.loc[m, "delay_prob"] + CRISIS_EXTRA_DELAY_PROB).clip(upper=1.0)
    legs.loc[m, "mean_delay_days"] = legs.loc[m, "mean_delay_days"] + CRISIS_EXTRA_DELAY_DAYS
    return legs


def red_sea_reopens(legs: pd.DataFrame) -> pd.DataFrame:
    legs = legs.copy()
    m = legs["region"] == "red_sea"
    legs.loc[m, "geo_risk"] = REOPEN_GEO_RISK
    legs.loc[m, "delay_prob"] = legs.loc[m, "delay_prob"] * REOPEN_DELAY_FACTOR
    return legs


def hub_congestion(legs: pd.DataFrame) -> pd.DataFrame:
    legs = legs.copy()
    n_legs = legs.groupby("route_id")["leg_no"].transform("max")
    m = n_legs > 1                       # any leg that starts or ends at a transshipment hub
    legs.loc[m, "congestion"] = (legs.loc[m, "congestion"] * HUB_CONGESTION_FACTOR).clip(upper=1.0)
    legs.loc[m, "delay_prob"] = (legs.loc[m, "delay_prob"] * HUB_DELAY_PROB_FACTOR).clip(upper=1.0)
    legs.loc[m, "mean_delay_days"] = legs.loc[m, "mean_delay_days"] + HUB_EXTRA_DELAY_DAYS
    return legs


def air_capacity_crunch(legs: pd.DataFrame) -> pd.DataFrame:
    legs = legs.copy()
    m = legs["mode"] == "air"
    legs.loc[m, "cost_usd"] = legs.loc[m, "cost_usd"] * AIR_PRICE_FACTOR
    return legs


SCENARIOS: Dict[str, Callable[[pd.DataFrame], pd.DataFrame]] = {
    "Red Sea crisis": red_sea_crisis,
    "Red Sea reopens": red_sea_reopens,
    "Hub congestion spike": hub_congestion,
    "Air capacity crunch": air_capacity_crunch,
}


# Plain-language titles and descriptions for the web app (numbers come from the constants above)
EVENT_INFO: Dict[str, Dict[str, str]] = {
    "Red Sea crisis": {
        "title": "Trouble in the Red Sea",
        "description": (f"Ships through the Red Sea face attacks. Delays there become much more likely "
                        f"and last {CRISIS_EXTRA_DELAY_DAYS} days longer."),
    },
    "Red Sea reopens": {
        "title": "The Red Sea calms down",
        "description": (f"Danger in the Red Sea drops to a normal level and delays there "
                        f"become {1 - REOPEN_DELAY_FACTOR:.0%} less likely."),
    },
    "Hub congestion spike": {
        "title": "Busy stopover ports",
        "description": (f"Routes that change ships or trains at a port are delayed "
                        f"{HUB_DELAY_PROB_FACTOR:g} times as often, and each delay lasts {HUB_EXTRA_DELAY_DAYS} days longer."),
    },
    "Air capacity crunch": {
        "title": "Plane tickets cost more",
        "description": f"Every flight costs {AIR_PRICE_FACTOR - 1:.0%} more because planes are full.",
    },
}


@dataclass
class ScenarioResult:
    name: str
    rerouted: int
    forced: int                    # old route no longer allowed / reliable enough
    locked_in: int                 # shipments with only one eligible route after the scenario
    total: int
    moves: Dict[str, int]
    value_of_replanning: float     # $ saved on voluntary switches vs keeping the old route
    avg_cost_before: float
    avg_cost_after: float
    co2_change: float
    details: List[Dict]


def run_scenario(name: str, n_sims: int = 2000, ships=None, routes=None, legs=None) -> ScenarioResult:
    if ships is None:
        ships, routes, legs = load_tables()
    base = build_shipments(ships, routes, legs)
    new = build_shipments(ships, routes, SCENARIOS[name](legs))
    moves, details = Counter(), []
    saved = before_cost = after_cost = co2 = 0.0
    forced = locked = 0
    for sid, s_new in new.items():
        r0 = recommend(base[sid], n_sims=n_sims)
        r1 = recommend(s_new, n_sims=n_sims)
        if not (r0.chosen and r1.chosen):
            continue
        old_id, new_id = r0.chosen.route.route_id, r1.chosen.route.route_id
        mode = r1.mode
        before_cost += r0.chosen.metrics.objective(mode)
        after_cost += r1.chosen.metrics.objective(mode)
        co2 += r1.chosen.metrics.co2_tonnes - r0.chosen.metrics.co2_tonnes
        locked += len(r1.ranked) <= 1
        if old_id != new_id:
            old_eval = r1.by_id(old_id)
            moves[f"{r0.chosen.route.name} -> {r1.chosen.route.name}"] += 1
            if old_eval.status in (NOT_ALLOWED, UNRELIABLE):
                forced += 1
                details.append({"shipment": sid, "from": r0.chosen.route.name, "to": r1.chosen.route.name,
                                "why": "forced: " + old_eval.reasons[0]})
            else:
                keep = simulate_route(old_eval.route, s_new, n=n_sims).objective(mode)
                gain = keep - r1.chosen.metrics.objective(mode)
                saved += gain
                details.append({"shipment": sid, "from": r0.chosen.route.name, "to": r1.chosen.route.name,
                                "why": f"saves ${gain:,.0f} vs keeping the old route"})
    n = len(new)
    return ScenarioResult(name, sum(moves.values()), forced, locked, n, dict(moves), saved, before_cost / n, after_cost / n,
                          co2, details)


def main():
    rows = []
    for name in SCENARIOS:
        r = run_scenario(name)
        rows.append({"Scenario": name, "Re-routed": f"{r.rerouted}/{r.total}", "Forced": r.forced,
                     "Locked in (no alternative)": r.locked_in,
                     "Moves": "; ".join(f"{k} ({v})" for k, v in r.moves.items()) or "-",
                     "Saved on voluntary switches ($)": round(r.value_of_replanning),
                     "Avg cost before -> after ($)": f"{r.avg_cost_before:,.0f} -> {r.avg_cost_after:,.0f}",
                     "CO2 change (t)": round(r.co2_change, 1)})
    df = pd.DataFrame(rows)
    out = os.path.join(ROOT, "evaluation", "results")
    os.makedirs(out, exist_ok=True)
    df.to_csv(os.path.join(out, "scenarios.csv"), index=False)
    pd.set_option("display.width", 250)
    pd.set_option("display.max_colwidth", 80)
    print(df.to_string(index=False))
    for name in SCENARIOS:
        for d in run_scenario(name).details:
            print(f"  [{name}] {d['shipment']}: {d['from']} -> {d['to']} ({d['why']})")


if __name__ == "__main__":
    main()
