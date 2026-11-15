"""Economic scoring: turn simulated outcomes into one number in dollars.

    expected mode : average all-in cost  = freight + E[late penalty] + E[disruption loss] + carbon
    play-safe mode: mean of the worst 10% of simulated all-in costs (CVaR 90)

Why money instead of weights? A weight such as "cost 0.4, time 0.3" has no unit and no
justification. A dollar value per late day and a loss on disruption are business facts a
logistics operator can confirm or correct, and the result is directly comparable across routes.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

from .simulation import RouteMetrics


@dataclass
class CostBreakdown:
    freight: float
    late_penalty: float
    disruption_loss: float
    carbon: float

    @property
    def total(self) -> float:
        return self.freight + self.late_penalty + self.disruption_loss + self.carbon

    def as_dict(self) -> Dict[str, float]:
        return {"freight": self.freight, "late penalty": self.late_penalty,
                "disruption loss": self.disruption_loss, "carbon": self.carbon}


def score(m: RouteMetrics, mode: str) -> float:
    return m.objective(mode)


def breakdown(m: RouteMetrics) -> CostBreakdown:
    return CostBreakdown(m.freight_usd, m.exp_late_cost, m.exp_loss, m.carbon_cost)
