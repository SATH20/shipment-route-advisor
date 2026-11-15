"""Checks an explanation against the optimizer's evidence before anyone sees it.

The prompt tells the LLM to use only the given numbers. This module checks that it did:

  1. every number in the text matches a number in the evidence (small rounding tolerance);
  2. the recommended route is named;
  3. no route that is not part of this shipment is mentioned.

If any check fails, the caller falls back to the deterministic template.
"""
from __future__ import annotations

import re
from typing import Iterable, List, Set

ROUTE_TYPES = ["Direct sea", "Sea via hub", "Suez corridor", "Cape route", "Sea + rail", "Sea + air", "Air freight"]

_ID = re.compile(r"\bS\d{3}(-R\d+)?\b")
_NUM = re.compile(r"(?<![A-Za-z])\$?\d[\d,]*(?:\.\d+)?%?")


def extract_numbers(text: str) -> List[float]:
    text = _ID.sub(" ", text)
    out = []
    for tok in _NUM.findall(text):
        clean = tok.replace("$", "").replace(",", "").replace("%", "")
        try:
            out.append(float(clean))
        except ValueError:
            pass
    return out


def _matches(x: float, allowed: Iterable[float]) -> bool:
    for a in allowed:
        if abs(x - a) <= max(0.051, 0.005 * abs(a)):
            return True
    return False


def validate(text: str, evidence_text: str, chosen_route: str, shipment_routes: Iterable[str]) -> List[str]:
    """Return a list of problems (empty list = the text is safe to show)."""
    issues = []
    allowed: Set[float] = set(extract_numbers(evidence_text))
    for x in extract_numbers(text):
        if not _matches(x, allowed):
            issues.append(f"number {x:g} does not appear in the optimizer output")
    if chosen_route.lower() not in text.lower():
        issues.append(f"recommended route '{chosen_route}' is not named")
    known = {r.lower() for r in shipment_routes}
    for rt in ROUTE_TYPES:
        if rt.lower() in text.lower() and rt.lower() not in known:
            issues.append(f"mentions '{rt}', which is not an option for this shipment")
    return issues
