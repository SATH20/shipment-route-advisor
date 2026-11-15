"""All modelling assumptions. Change a number here and every module picks it up.
The assumptions table in the README is built from these values.
"""

# --- Reproducibility -------------------------------------------------------
SEED = 42                 # dataset generation
OBSERVATION_SEED = 1042   # noise added to create the "estimated" view of the data
SIM_SEED = 7              # Monte Carlo (combined with a per-route hash -> common random numbers)

# --- Simulation ------------------------------------------------------------
N_SIMS = 5000             # Monte Carlo runs per route
CVAR_ALPHA = 0.90         # play-safe mode scores the average of the worst 10% of outcomes

# --- Economic model --------------------------------------------------------
LOSS_FRACTION_ON_DISRUPTION = 0.10   # share of cargo value lost / written off when a leg is disrupted
DISRUPTION_EXTRA_DAYS = 7.0          # extra days added by a disruption (reroute, inspection, hold)
CARBON_PRICE_USD_PER_TONNE = 90.0    # internal carbon price (roughly EU ETS level)

# Disruption probability of a leg, derived from its risk indicators:
#   p = BASE + GEO_COEF * geo_risk^2 + CONGESTION_COEF * congestion
# Squared geo term: geopolitical risk is mostly harmless until it is high.
DISRUPTION_BASE = 0.002
DISRUPTION_GEO_COEF = 0.06
DISRUPTION_CONGESTION_COEF = 0.01
DISRUPTION_CAP = 0.50

# kg CO2 per tonne-km (order of magnitude from GLEC-style factors)
EMISSION_FACTORS = {"sea": 0.010, "rail": 0.022, "road": 0.062, "air": 0.600}

# --- Business policy: cargo profiles --------------------------------------
# Profiles set *economic parameters*, not arbitrary weights.
#   penalty_pct_per_day : cost of one late day, as a share of cargo value
#   min_on_time         : reliability rule applied after simulation
#   risk_mode           : "expected" (average outcome) or "play_safe" (worst 10% of outcomes)
PROFILES = {
    "express":    {"penalty_pct_per_day": 0.020,  "min_on_time": 0.90, "risk_mode": "expected"},
    "standard":   {"penalty_pct_per_day": 0.004,  "min_on_time": 0.70, "risk_mode": "expected"},
    "budget":     {"penalty_pct_per_day": 0.0008, "min_on_time": 0.00, "risk_mode": "expected"},
    "high_value": {"penalty_pct_per_day": 0.006,  "min_on_time": 0.80, "risk_mode": "play_safe"},
}

# --- Estimation uncertainty (used by evaluation + confidence engine) ------
OBSERVATION_NOISE = 0.30   # lognormal sigma applied to delay / risk estimates
CONFIDENCE_RUNS = 100      # re-decisions with perturbed estimates
CONFIDENCE_SIMS = 1000     # Monte Carlo runs per route inside each re-decision
CONFIDENCE_HIGH = 0.80     # share of re-decisions agreeing with the pick
CONFIDENCE_MEDIUM = 0.60


def assumptions_table():
    """Rows for the README / report."""
    return [
        ("Monte Carlo runs per route", f"{N_SIMS}"),
        ("Cargo value lost on disruption", f"{LOSS_FRACTION_ON_DISRUPTION:.0%}"),
        ("Extra days per disruption", f"{DISRUPTION_EXTRA_DAYS:g}"),
        ("Carbon price", f"${CARBON_PRICE_USD_PER_TONNE:g} / tonne CO2"),
        ("Disruption probability per leg",
         f"{DISRUPTION_BASE} + {DISRUPTION_GEO_COEF} x geo^2 + {DISRUPTION_CONGESTION_COEF} x congestion"),
        ("Emission factors (kg CO2 / t-km)", ", ".join(f"{k} {v}" for k, v in EMISSION_FACTORS.items())),
        ("Play-safe risk measure", f"mean of worst {1 - CVAR_ALPHA:.0%} of simulated costs (CVaR)"),
        ("Estimate noise (evaluation)", f"lognormal sigma {OBSERVATION_NOISE}"),
    ] + [
        (f"Profile '{p}'",
         f"late day = {v['penalty_pct_per_day']:.2%} of value, min on-time {v['min_on_time']:.0%}, {v['risk_mode']}")
        for p, v in PROFILES.items()
    ]
