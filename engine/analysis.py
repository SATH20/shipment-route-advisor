"""One call that runs the full decision: recommendation + confidence + tipping points."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from config import assumptions as A
from .confidence import Confidence, assess
from .models import Shipment
from .optimizer import Recommendation, recommend
from .tipping import TippingPoint, find_tipping_points


@dataclass
class Analysis:
    rec: Recommendation
    confidence: Optional[Confidence] = None
    tipping: List[TippingPoint] = field(default_factory=list)


def analyze(shipment: Shipment, mode: Optional[str] = None, n_sims: int = A.N_SIMS,
            with_confidence: bool = True, with_tipping: bool = True, keep_samples: bool = False,
            **overrides) -> Analysis:
    rec = recommend(shipment, mode=mode, n_sims=n_sims, keep_samples=keep_samples, **overrides)
    conf = assess(rec) if with_confidence and not overrides else None
    tips = find_tipping_points(rec) if with_tipping and not overrides else []
    return Analysis(rec, conf, tips)
