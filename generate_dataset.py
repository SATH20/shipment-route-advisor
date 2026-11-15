"""Generate the synthetic dataset.

Writes two copies of the data:

  data/                                  what the recommender sees (ESTIMATES, with noise)
    shipments.csv, routes.csv, route_legs.csv
  evaluation/ground_truth/
    route_legs_true.csv                  the TRUE parameters, used only for evaluation

How routes are built
--------------------
Each route is a chain of legs between real ports. Leg distances come from the sea-lane
network in geography.py (the same paths the dashboard map draws), and cost and transit time
follow from distance and mode. Route types:

  Direct sea     one sea leg; avoids the Red Sea, so Asia/India -> Europe goes round Africa
  Sea via hub    two sea legs through a transshipment port; congestion at the hub
  Suez corridor  through the Red Sea and Suez Canal: much shorter, high geopolitical risk
                 (only on lanes where Suez is the short way)
  Sea + rail     sea to a land-bridge hub, then rail (China-Europe, INSTC, US land bridge)
  Sea + air      sea to a hub, then air
  Air freight    a few days, far more expensive, ~60x the CO2 of sea

Every shipment gets Direct sea + Air freight plus two other types.
Assumption: direct sea services avoid the Red Sea (as most carriers did after the 2024
attacks); the Suez corridor is the alternative that accepts that risk.

Run:  python generate_dataset.py
"""
from __future__ import annotations

import os
import random

import pandas as pd

from config import assumptions as A
from geography import leg_km

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
TRUTH_DIR = os.path.join(ROOT, "evaluation", "ground_truth")

N_SHIPMENTS = 30
ROUTES_PER_SHIPMENT = 4
N_HAZARDOUS = 2

# origin, destination, transshipment hubs
LANES = [
    ("Shanghai", "Rotterdam", ["Singapore", "Colombo", "Port Said"]),
    ("Mumbai", "Hamburg", ["Jebel Ali", "Salalah", "Port Said"]),
    ("Chennai", "Los Angeles", ["Singapore", "Busan", "Kaohsiung"]),
    ("Singapore", "New York", ["Colombo", "Port Said", "Algeciras"]),
    ("Ho Chi Minh", "Felixstowe", ["Singapore", "Colombo", "Port Said"]),
    ("Nhava Sheva", "Antwerp", ["Jebel Ali", "Salalah", "Port Said"]),
    ("Busan", "Savannah", ["Kaohsiung", "Panama", "Manzanillo"]),
    ("Mundra", "Piraeus", ["Jebel Ali", "Salalah", "Port Said"]),
]

# Per-mode economics: USD per kg per 1000 km, km/day, handling days per leg
MODE = {
    "sea":  {"rate": 0.021, "speed": 650,  "handling": 1.0},
    "rail": {"rate": 0.060, "speed": 750,  "handling": 1.0},
    "air":  {"rate": 0.550, "speed": 9000, "handling": 1.0},
}

# route type -> legs as (mode, region) and risk ranges
ARCHETYPES = {
    "Direct sea":    dict(legs=[("sea", "open_ocean")],
                          p=(0.18, 0.30), d=(2.0, 5.0), cong=(0.25, 0.55), geo=(0.10, 0.30)),
    "Sea via hub":   dict(legs=[("sea", "open_ocean"), ("sea", "open_ocean")],
                          p=(0.25, 0.42), d=(2.0, 6.0), cong=(0.55, 0.90), geo=(0.10, 0.30)),
    "Suez corridor": dict(legs=[("sea", "red_sea"), ("sea", "mediterranean")],
                          p=(0.16, 0.28), d=(2.0, 5.0), cong=(0.30, 0.60), geo=(0.45, 0.85)),
    "Sea + rail":    dict(legs=[("sea", "open_ocean"), ("rail", "rail_corridor")],
                          p=(0.20, 0.35), d=(1.0, 4.0), cong=(0.30, 0.60), geo=(0.25, 0.50)),
    "Sea + air":     dict(legs=[("sea", "open_ocean"), ("air", "air")],
                          p=(0.12, 0.22), d=(0.5, 2.5), cong=(0.20, 0.50), geo=(0.10, 0.30)),
    "Air freight":   dict(legs=[("air", "air")],
                          p=(0.04, 0.10), d=(0.3, 1.2), cong=(0.10, 0.30), geo=(0.05, 0.20)),
}

CARGO = {
    "express":    [("pharmaceuticals", False), ("auto spare parts", False)],
    "standard":   [("apparel", False), ("home goods", False)],
    "budget":     [("furniture", False), ("building materials", False)],
    "high_value": [("electronics", False), ("lithium batteries", True), ("luxury goods", False)],
}
VALUE_RANGE = {
    "express": (40_000, 200_000), "standard": (20_000, 120_000),
    "budget": (8_000, 40_000), "high_value": (300_000, 1_500_000),
}
# deadline = planned days of the Direct sea route x slack + U(0, 3)
# (express: direct sea is usually too slow; budget: plenty of slack)
DEADLINE_SLACK = {"express": 0.80, "standard": 1.08, "budget": 1.35, "high_value": 1.30}


# Where the sea leg of a "Sea + rail" route ends and the rail leg starts (a real land bridge per lane)
RAIL_HUB = {
    ("Shanghai", "Rotterdam"): "Lianyungang",      # China-Europe railway
    ("Ho Chi Minh", "Felixstowe"): "Lianyungang",
    ("Mumbai", "Hamburg"): "Bandar Abbas",         # International North-South Transport Corridor
    ("Nhava Sheva", "Antwerp"): "Bandar Abbas",
    ("Mundra", "Piraeus"): "Bandar Abbas",
    ("Singapore", "New York"): "Los Angeles",      # US land bridge
    ("Busan", "Savannah"): "Los Angeles",
    ("Chennai", "Los Angeles"): "Seattle",         # sea to the Pacific Northwest, rail south
}


def _hub_for(arch: str, lane, rng) -> str:
    hubs = lane[2]
    if arch == "Suez corridor":
        return "Port Said"
    if arch == "Sea + rail":
        return RAIL_HUB[(lane[0], lane[1])]
    return rng.choice([h for h in hubs if h != "Port Said"])


def build_route(rng, shipment_id, k, arch, lane, weight_kg):
    origin, dest, _ = lane
    spec = ARCHETYPES[arch]
    stops = [origin] + ([_hub_for(arch, lane, rng)] if len(spec["legs"]) == 2 else []) + [dest]
    route_id = f"{shipment_id}-R{k}"
    legs = []
    for i, (mode, region) in enumerate(spec["legs"]):
        m = MODE[mode]
        km = leg_km(stops[i], stops[i + 1], mode, region) * rng.uniform(0.97, 1.04)
        legs.append(dict(
            route_id=route_id, leg_no=i + 1, from_hub=stops[i], to_hub=stops[i + 1],
            mode=mode, region=region, distance_km=round(km, 0),
            cost_usd=round(weight_kg * m["rate"] * km / 1000 * rng.uniform(0.9, 1.12) + 150, 2),
            transit_days=round(km / m["speed"] + m["handling"], 2),
            delay_prob=round(rng.uniform(*spec["p"]), 3),
            mean_delay_days=round(rng.uniform(*spec["d"]), 2),
            congestion=round(rng.uniform(*spec["cong"]), 3),
            geo_risk=round(rng.uniform(*spec["geo"]), 3),
        ))
    return dict(route_id=route_id, shipment_id=shipment_id, route_name=arch, n_legs=len(legs)), legs


def generate_truth(seed: int = A.SEED):
    rng = random.Random(seed)
    shipments, routes, legs = [], [], []
    profiles = list(A.PROFILES)
    for i in range(1, N_SHIPMENTS + 1):
        sid = f"S{i:03d}"
        profile = profiles[(i - 1) % len(profiles)]          # balanced: ~7-8 per profile
        lane = rng.choice(LANES)
        cargo_type, hazardous = rng.choice(CARGO[profile])
        value = round(rng.uniform(*VALUE_RANGE[profile]), -2)
        weight = round(rng.uniform(150, 1200) if profile == "high_value" else rng.uniform(300, 4000))

        extras = [a for a in ARCHETYPES if a not in ("Direct sea", "Air freight")]
        if "Port Said" not in lane[2]:
            extras.remove("Suez corridor")
        archs = ["Direct sea", "Air freight"] + rng.sample(extras, ROUTES_PER_SHIPMENT - 2)
        rng.shuffle(archs)

        sh_routes, sh_legs = [], []
        for k, arch in enumerate(archs, start=1):
            r, ls = build_route(rng, sid, k, arch, lane, weight)
            sh_routes.append(r)
            sh_legs.extend(ls)

        def planned(rid):
            return sum(l["transit_days"] for l in sh_legs if l["route_id"] == rid)
        direct = next(r["route_id"] for r in sh_routes if r["route_name"] == "Direct sea")
        deadline = round(planned(direct) * DEADLINE_SLACK[profile] + rng.uniform(0, 3), 1)

        def freight(rid):
            return sum(l["cost_usd"] for l in sh_legs if l["route_id"] == rid)
        cheapest = min(freight(r["route_id"]) for r in sh_routes)
        # only cost-driven customers set a freight budget
        budget = (round(cheapest * rng.uniform(1.8, 4.0), -1)
                  if profile in ("standard", "budget") and rng.random() < 0.4 else None)
        avoid = "red_sea" if rng.random() < 0.2 else ""

        def legal(r):  # mirrors the hard rules in engine/constraints.py
            ls = [l for l in sh_legs if l["route_id"] == r["route_id"]]
            return not ((hazardous and any(l["mode"] == "air" for l in ls))
                        or (avoid and any(l["region"] == avoid for l in ls))
                        or (budget is not None and freight(r["route_id"]) > budget)
                        or planned(r["route_id"]) > deadline)
        if not any(legal(r) for r in sh_routes):
            # keep the dataset decidable: relax customer restrictions first, then the deadline
            budget, avoid = None, ""
            if not any(legal(r) for r in sh_routes):
                ok = [planned(r["route_id"]) for r in sh_routes
                      if not (hazardous and any(l["mode"] == "air" for l in sh_legs if l["route_id"] == r["route_id"]))]
                deadline = round(min(ok) * 1.05 + 1, 1)

        shipments.append(dict(
            shipment_id=sid, origin=lane[0], destination=lane[1], cargo_type=cargo_type,
            profile=profile, weight_kg=weight, cargo_value_usd=value, deadline_days=deadline,
            delay_penalty_usd_per_day=round(value * A.PROFILES[profile]["penalty_pct_per_day"], -1),
            budget_usd=budget, hazardous=hazardous, avoid_regions=avoid,
        ))
        routes.extend(sh_routes)
        legs.extend(sh_legs)

    # Make sure the "hazardous cargo cannot fly" rule appears in the data: if the random draw
    # produced fewer than N_HAZARDOUS lithium-battery shipments, convert high-value shipments that
    # still have a legal non-air route. Done after the loop so the other random draws are unchanged.
    converted = sum(1 for sh in shipments if sh["hazardous"])
    for sh in shipments:
        if converted >= N_HAZARDOUS or sh["profile"] != "high_value" or sh["hazardous"]:
            continue
        sid = sh["shipment_id"]
        for r in (r for r in routes if r["shipment_id"] == sid):
            ls = [l for l in legs if l["route_id"] == r["route_id"]]
            if (all(l["mode"] != "air" for l in ls)
                    and not (sh["avoid_regions"] and any(l["region"] == sh["avoid_regions"] for l in ls))
                    and sum(l["transit_days"] for l in ls) <= sh["deadline_days"]):
                sh["cargo_type"], sh["hazardous"] = "lithium batteries", True
                converted += 1
                break
    return pd.DataFrame(shipments), pd.DataFrame(routes), pd.DataFrame(legs)


def observe(true_legs: pd.DataFrame, seed: int = A.OBSERVATION_SEED, noise: float = A.OBSERVATION_NOISE):
    """The planner's view: freight and transit are quotes (+-3%); delay and risk are noisy estimates."""
    rng = random.Random(seed)
    obs = true_legs.copy()
    clip = lambda x: min(max(x, 0.0), 1.0)
    for idx in obs.index:
        obs.at[idx, "cost_usd"] = round(obs.at[idx, "cost_usd"] * rng.uniform(0.97, 1.03), 2)
        obs.at[idx, "transit_days"] = round(obs.at[idx, "transit_days"] * rng.uniform(0.97, 1.03), 2)
        obs.at[idx, "delay_prob"] = round(clip(obs.at[idx, "delay_prob"] * rng.lognormvariate(0, noise)), 3)
        obs.at[idx, "mean_delay_days"] = round(obs.at[idx, "mean_delay_days"] * rng.lognormvariate(0, noise), 2)
        obs.at[idx, "congestion"] = round(clip(obs.at[idx, "congestion"] * rng.lognormvariate(0, noise)), 3)
        obs.at[idx, "geo_risk"] = round(clip(obs.at[idx, "geo_risk"] * rng.lognormvariate(0, noise)), 3)
    return obs


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(TRUTH_DIR, exist_ok=True)
    shipments, routes, true_legs = generate_truth()
    obs_legs = observe(true_legs)
    shipments.to_csv(os.path.join(DATA_DIR, "shipments.csv"), index=False)
    routes.to_csv(os.path.join(DATA_DIR, "routes.csv"), index=False)
    obs_legs.to_csv(os.path.join(DATA_DIR, "route_legs.csv"), index=False)
    true_legs.to_csv(os.path.join(TRUTH_DIR, "route_legs_true.csv"), index=False)
    print(f"Wrote {len(shipments)} shipments, {len(routes)} routes, {len(obs_legs)} legs")
    print(f"  estimates  -> {DATA_DIR}")
    print(f"  true values -> {TRUTH_DIR} (evaluation only)")


if __name__ == "__main__":
    main()
