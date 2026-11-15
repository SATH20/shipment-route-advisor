"""Compare the advisor with simple baselines, scored on the hidden ground truth.

  1. Main comparison at the default estimate noise (30%), averaged over 3 noise draws.
  2. Noise sweep (0%, 30%, 60%): how decision quality degrades as estimates get worse.
  3. Breakdown by cargo profile.

Note: the advisor minimises expected cost and "avg true cost" is an expected cost, so that
column favours it by construction. The table therefore also reports on-time reliability,
worst-case cost and CO2, where other strategies can win.

Run:  python -m evaluation.evaluate        (writes evaluation/results/)
"""
from __future__ import annotations

import os
import sys
from typing import Dict

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from config import assumptions as A  # noqa: E402
from engine.dataset import build_shipments, load_tables  # noqa: E402
from generate_dataset import observe  # noqa: E402
from .baselines import STRATEGIES  # noqa: E402
from .metrics import TruthCache, as_rows, score_strategy  # noqa: E402

TRUTH_LEGS = os.path.join(ROOT, "evaluation", "ground_truth", "route_legs_true.csv")
RESULTS = os.path.join(ROOT, "evaluation", "results")
NOISE_SEEDS = (A.OBSERVATION_SEED, A.OBSERVATION_SEED + 1, A.OBSERVATION_SEED + 2)


def load_truth():
    ships, routes, _ = load_tables()
    true_legs = pd.read_csv(TRUTH_LEGS)
    return ships, routes, true_legs, build_shipments(ships, routes, true_legs)


def run_at_noise(noise: float, ships, routes, true_legs, truth: TruthCache, seeds=NOISE_SEEDS) -> pd.DataFrame:
    frames = []
    for seed in seeds:
        observed = build_shipments(ships, routes, observe(true_legs, seed=seed, noise=noise))
        results = []
        for name, strat in STRATEGIES.items():
            picks: Dict[str, str] = {sid: strat(s) for sid, s in observed.items()}
            results.append(score_strategy(name, picks, truth))
        oracle_picks = {sid: truth.oracle(sid) for sid in observed}
        results.append(score_strategy("Oracle (perfect hindsight)", oracle_picks, truth))
        frames.append(pd.DataFrame([r.__dict__ for r in results]))
    df = pd.concat(frames).groupby("strategy", sort=False).mean().reset_index()
    return df


def to_display(df: pd.DataFrame) -> pd.DataFrame:
    from .metrics import StrategyResult
    return pd.DataFrame(as_rows([StrategyResult(**row) for row in df.to_dict("records")]))


def by_profile(ships, routes, true_legs, truth: TruthCache) -> pd.DataFrame:
    observed = build_shipments(ships, routes, observe(true_legs))
    rows = []
    for profile in A.PROFILES:
        sub = {sid: s for sid, s in observed.items() if s.profile == profile}
        for name in ("Always cheapest", "Fixed weights", "Advisor (profile rules)"):
            picks = {sid: STRATEGIES[name](s) for sid, s in sub.items()}
            r = score_strategy(name, picks, truth)
            rows.append({"Profile": profile, "Strategy": name, "Avg true cost ($)": round(r.avg_true_cost),
                         "Meets on-time target": f"{r.meets_target:.0%}",
                         "Avg worst-10% cost ($)": round(r.avg_worst10)})
    return pd.DataFrame(rows)


def main():
    os.makedirs(RESULTS, exist_ok=True)
    ships, routes, true_legs, truth_ships = load_truth()
    truth = TruthCache(truth_ships)

    main_df = run_at_noise(A.OBSERVATION_NOISE, ships, routes, true_legs, truth)
    display = to_display(main_df)
    display.to_csv(os.path.join(RESULTS, "comparison.csv"), index=False)

    sweep = []
    for noise in (0.0, 0.3, 0.6):
        df = run_at_noise(noise, ships, routes, true_legs, truth)
        for row in df.to_dict("records"):
            sweep.append({"Noise": f"{noise:.0%}", "Strategy": row["strategy"],
                          "Avg regret vs oracle ($)": round(row["avg_regret"]),
                          "Matches oracle": f"{row['oracle_match']:.0%}",
                          "Meets on-time target": f"{row['meets_target']:.0%}"})
    sweep_df = pd.DataFrame(sweep)
    sweep_df.to_csv(os.path.join(RESULTS, "noise_sweep.csv"), index=False)

    prof_df = by_profile(ships, routes, true_legs, truth)
    prof_df.to_csv(os.path.join(RESULTS, "by_profile.csv"), index=False)

    pd.set_option("display.width", 200)
    pd.set_option("display.max_columns", 20)
    print(f"=== Main comparison (estimate noise {A.OBSERVATION_NOISE:.0%}, {len(NOISE_SEEDS)} draws, "
          f"{len(truth_ships)} shipments) ===")
    print(display.to_string(index=False))
    print("\n=== Noise sweep ===")
    print(sweep_df.pivot(index="Strategy", columns="Noise", values="Avg regret vs oracle ($)").to_string())
    print("\n=== By cargo profile ===")
    print(prof_df.to_string(index=False))
    print(f"\nResults written to {RESULTS}")


if __name__ == "__main__":
    main()
