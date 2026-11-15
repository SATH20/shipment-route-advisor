"""Turns the optimizer's output into an explanation a logistics operator can act on.

  1. build_evidence()  - structured facts taken only from the optimizer / confidence / tipping output
  2. template_text()   - deterministic explanation from those facts (always available)
  3. optional LLM      - rewrites the template into smoother prose (Gemini, if GEMINI_API_KEY is set)
  4. validation        - every number and route name in the LLM text is checked against the evidence;
                         any mismatch -> the template is shown instead

The LLM never chooses a route, changes a score or sees the ground truth.

CLI:  python -m services.explanation_service S016 [--llm]
"""
from __future__ import annotations

import argparse
import json
import os
import urllib.request
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional

from config import assumptions as A
from engine.analysis import Analysis
from engine.optimizer import RECOMMENDED
from engine.scoring import breakdown
from .validation_service import validate

LLMFn = Callable[[str], str]


@dataclass
class Explanation:
    text: str
    source: str                      # "template" or "llm"
    template: str
    evidence: str
    issues: List[str] = field(default_factory=list)


def _money(x: float) -> str:
    return f"${x:,.0f}"


def _mode_label(mode: str) -> str:
    return ("play-safe (judged on the average of the worst 10% of outcomes)" if mode == "play_safe"
            else "expected cost (judged on the average outcome)")


def build_evidence(an: Analysis) -> Dict:
    rec = an.rec
    s = rec.shipment
    ev: Dict = {
        "shipment": f"{s.shipment_id}: {s.cargo_type} worth {_money(s.cargo_value_usd)}, {s.origin} to {s.destination}, "
                    f"deadline {s.deadline_days:g} days, each late day costs {_money(s.delay_penalty_usd_per_day)}",
        "decision_mode": _mode_label(rec.mode),
        "simulations": f"{A.N_SIMS:,} simulated voyages per route",
        "warnings": rec.warnings,
    }
    if rec.chosen is None:
        return ev
    routes = {}
    for e in rec.evaluations:
        m = e.metrics
        entry = {"status": e.status, "reasons": e.reasons, "path": e.route.path}
        if m:
            b = breakdown(m)
            entry.update({
                "freight": _money(m.freight_usd), "average_days": f"{m.mean_days:.1f}",
                "on_time": f"{m.p_on_time:.0%}", "disruption_chance": f"{m.p_disruption:.1%}",
                "co2_tonnes": f"{m.co2_tonnes:.2f}", "expected_total_cost": _money(m.exp_total),
                "worst_10pct_cost": _money(m.cvar_total),
                "expected_late_penalty": _money(b.late_penalty), "expected_disruption_loss": _money(b.disruption_loss),
            })
        routes[e.route.name] = entry
    ev["routes"] = routes
    ev["recommended"] = rec.chosen.route.name
    ru = rec.runner_up
    if ru:
        c, r = rec.chosen.metrics, ru.metrics
        ev["comparison_with_next_best"] = {
            "next_best": ru.route.name,
            "freight_difference": _money(abs(c.freight_usd - r.freight_usd)),
            "expected_cost_difference": _money(abs(c.exp_total - r.exp_total)),
            "worst_case_difference": _money(abs(c.cvar_total - r.cvar_total)),
            "on_time_points_difference": f"{abs(c.p_on_time - r.p_on_time) * 100:.0f}",
            "co2_difference_tonnes": f"{abs(c.co2_tonnes - r.co2_tonnes):.2f}",
        }
    if an.confidence:
        ev["confidence"] = {"label": an.confidence.label,
                            "agreement": f"{round(an.confidence.agreement * an.confidence.runs)} of {an.confidence.runs}",
                            "estimate_noise": f"{A.OBSERVATION_NOISE:.0%}"}
    ev["what_would_change_it"] = [t.sentence for t in an.tipping[:2]]
    return ev


def _driver(an: Analysis) -> str:
    rec = an.rec
    ch, ru = rec.chosen, rec.runner_up
    c = ch.metrics
    if ru is None:
        return f"It is the only route that passes every rule for this shipment."
    r = ru.metrics
    if rec.mode == "play_safe" and c.exp_total > r.exp_total:
        return (f"Its average cost is higher ({_money(c.exp_total)} vs {_money(r.exp_total)} for {ru.route.name}), "
                f"but its worst case is much better ({_money(c.cvar_total)} vs {_money(r.cvar_total)}). "
                f"For {rec.shipment.profile.replace('_', '-')} cargo we protect against the bad outcomes.")
    bc, br = breakdown(c).as_dict(), breakdown(r).as_dict()
    savings = {k: br[k] - bc[k] for k in bc}
    main = max(savings, key=savings.get)
    if c.freight_usd > r.freight_usd:
        return (f"It costs {_money(c.freight_usd - r.freight_usd)} more in freight than {ru.route.name}, "
                f"but saves {_money(savings[main])} in expected {main}, so its expected all-in cost is "
                f"{_money(c.exp_total)} vs {_money(r.exp_total)}.")
    other = {k: v for k, v in savings.items() if k != "freight"}
    main_other = max(other, key=other.get)
    extra = (f" and saves {_money(other[main_other])} in expected {main_other}"
             if other[main_other] > savings["freight"] else "")
    return (f"It is {_money(r.freight_usd - c.freight_usd)} cheaper in freight than {ru.route.name}{extra}, so its "
            f"expected all-in cost is {_money(c.exp_total)} vs {_money(r.exp_total)}, and it still arrives on "
            f"time {c.p_on_time:.0%} of the time.")


def template_text(an: Analysis) -> str:
    rec = an.rec
    if rec.chosen is None:
        return "No route can be recommended: " + " ".join(rec.warnings)
    ch = rec.chosen
    m = ch.metrics
    lines = [f"Recommended: {ch.route.name} ({ch.route.path}).",
             f"Why: {_driver(an)}",
             f"Expected outcome: about {m.mean_days:.1f} days, {m.p_on_time:.0%} chance of arriving on time, "
             f"{m.p_disruption:.1%} chance of a disruption, {m.co2_tonnes:.2f} tonnes of CO2."]
    ruled = [f"{e.route.name} ({e.reasons[0]})" for e in rec.evaluations
             if e.status != RECOMMENDED and e.reasons]
    if ruled:
        lines.append("Ruled out: " + "; ".join(ruled) + ".")
    if an.confidence:
        cf = an.confidence
        lines.append(f"Confidence: {cf.label} - the same route won {round(cf.agreement * cf.runs)} of "
                     f"{cf.runs} re-runs with risk estimates varied by about {A.OBSERVATION_NOISE:.0%}.")
    if an.tipping:
        lines.append("What would change it: " + " ".join(t.sentence for t in an.tipping[:2]))
    for w in rec.warnings:
        lines.append(f"Warning: {w}")
    return "\n".join(lines)


# ----------------------------------------------------------------------------- LLM
PROMPT = """You explain shipping route decisions to a logistics operator.
Rewrite the DRAFT below as a short, clear explanation (max 120 words, plain sentences, no headings).
Rules:
- Keep the same recommended route. Never suggest a different route.
- Use only numbers that appear in the DRAFT or FACTS, written exactly as given. Do not calculate new numbers.
- Do not mention routes that are not in the FACTS.

FACTS (JSON):
{facts}

DRAFT:
{draft}
"""


def gemini_llm(prompt: str, timeout: float = 20.0) -> str:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY not set")
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}],
                       "generationConfig": {"temperature": 0.2}}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json",
                                                          "x-goog-api-key": key})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read())
    return data["candidates"][0]["content"]["parts"][0]["text"].strip()


def explain(an: Analysis, use_llm: Optional[bool] = None, llm_fn: Optional[LLMFn] = None) -> Explanation:
    draft = template_text(an)
    evidence = json.dumps(build_evidence(an), indent=1)
    evidence_all = evidence + "\n" + draft
    if use_llm is None:
        use_llm = llm_fn is not None or bool(os.environ.get("GEMINI_API_KEY"))
    if not use_llm or an.rec.chosen is None:
        return Explanation(draft, "template", draft, evidence)
    try:
        text = (llm_fn or gemini_llm)(PROMPT.format(facts=evidence, draft=draft))
    except Exception as exc:  # network, quota, missing key...
        return Explanation(draft, "template", draft, evidence, [f"LLM unavailable: {exc}"])
    issues = validate(text, evidence_all, an.rec.chosen.route.name, [r.name for r in an.rec.shipment.routes])
    if issues:
        return Explanation(draft, "template", draft, evidence, issues)
    return Explanation(text, "llm", draft, evidence)


def main():
    from engine.analysis import analyze
    from engine.dataset import load_shipments
    ap = argparse.ArgumentParser()
    ap.add_argument("shipment_id")
    ap.add_argument("--llm", action="store_true", help="use Gemini if GEMINI_API_KEY is set")
    ap.add_argument("--mode", choices=["expected", "play_safe"], default=None)
    args = ap.parse_args()
    an = analyze(load_shipments()[args.shipment_id], mode=args.mode)
    ex = explain(an, use_llm=args.llm or None)
    print(ex.text)
    print(f"\n[source: {ex.source}]" + (f" [fallback reasons: {'; '.join(ex.issues)}]" if ex.issues else ""))


if __name__ == "__main__":
    main()
