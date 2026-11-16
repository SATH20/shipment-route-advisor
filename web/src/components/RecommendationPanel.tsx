"use client";

import React from "react";
import { ShipmentDetail } from "@/lib/types";
import {
  ELIGIBLE,
  formatCount,
  formatDays,
  formatMoney,
  formatPercent,
  oneIn,
  plainNames,
  plainTipping,
  translateRouteName,
} from "@/lib/words";
import { getRouteColor } from "./RouteMap";

interface RecommendationPanelProps {
  detail: ShipmentDetail;
  mode: string;
  onChangeMode: (mode: string) => void;
  hasChanges: boolean;
  /** Set when a second panel is on the page, so ids stay unique. */
  idPrefix?: string;
  stepLabel?: string;
}

const CONFIDENCE_COLOR: Record<string, string> = {
  High: "#4ade80",
  Medium: "#7aa2ff",
  Low: "#dc4a3d",
};

const CONFIDENCE_WORDS: Record<string, string> = {
  High: "Very sure",
  Medium: "Fairly sure",
  Low: "Not sure: a close call",
};

function plainWarning(w: string): string {
  const m = w.match(/reaches the (\d+%) on-time target; recommending the most reliable option \((\d+%)\)/);
  if (m) {
    return `No way reaches the ${m[1]} on-time target. We picked the most reliable one (on time in ${m[2]} of tries). A person should check this shipment.`;
  }
  if (w.startsWith("No route satisfies the hard rules")) {
    return "No way passes all the rules for this shipment. A person needs to plan it.";
  }
  return plainNames(w);
}

function ModeToggle({ mode, onChangeMode }: { mode: string; onChangeMode: (m: string) => void }) {
  const options = [
    { id: "play_safe", label: "Play it safe" },
    { id: "expected", label: "Cheapest on average" },
  ];
  return (
    <div
      role="group"
      aria-label="How careful should we be?"
      className="flex bg-[#1c2a40] rounded-full p-1 border border-[#263a58] w-full sm:w-auto"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={mode === o.id}
          onClick={() => onChangeMode(o.id)}
          className={`seg text-sm font-semibold px-4 py-2 rounded-full min-h-[44px] flex-1 sm:flex-initial flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7aa2ff] ${
            mode === o.id ? "bg-white text-ink shadow-sm" : "bg-transparent text-[#c9d4e3] hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function RecommendationPanel({
  detail,
  mode,
  onChangeMode,
  hasChanges,
  idPrefix = "",
  stepLabel = "3",
}: RecommendationPanelProps) {
  const titleId = `${idPrefix}pick-title`;
  const { routes, confidence, tipping, warnings, shipment, settings } = detail;
  const pick = routes.find((r) => r.id === detail.recommended_route_id) || null;
  const runnerUp = routes.find((r) => r.id === detail.runner_up_id) || null;
  const isSafe = mode === "play_safe";
  const n = formatCount(settings.n_sims);
  const worst = oneIn(settings.worst_share);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1c2a40] pb-6">
      <div className="flex items-center gap-3">
        <span className="w-7 h-7 rounded-full bg-white text-ink font-bold text-xs flex items-center justify-center" aria-hidden="true">
          {stepLabel}
        </span>
        <h2 className="text-xl md:text-2xl font-bold m-0 text-white">Our pick, and why</h2>
      </div>
      <ModeToggle mode={mode} onChangeMode={onChangeMode} />
    </div>
  );

  if (!pick || !pick.metrics) {
    return (
      <section className="bg-ink text-white rounded-3xl p-6 md:p-8 shadow-lg">
        {header}
        <p className="mt-6 text-2xl font-heading font-bold">We cannot recommend a way</p>
        <ul className="mt-3 text-[#d5deea] list-none p-0 space-y-2">
          {(warnings.length ? warnings : ["No route satisfies the hard rules"]).map((w, i) => (
            <li key={i}>{plainWarning(w)}</li>
          ))}
        </ul>
      </section>
    );
  }

  const pickTitle = translateRouteName(pick.name, pick.passages).title;
  const pm = pick.metrics;
  const reasons: string[] = [];

  if (!runnerUp || !runnerUp.metrics) {
    reasons.push(
      "Every other way breaks a rule or is beaten by another way, so this is the only real choice."
    );
    reasons.push(
      `It takes about ${formatDays(Number(pm.mean_days.toFixed(1)))} days and costs about ${formatMoney(pm.exp_total)} on a usual trip.`
    );
  } else {
    const rm = runnerUp.metrics;
    const ruTitle = translateRouteName(runnerUp.name, runnerUp.passages).title;
    if (isSafe && pm.exp_total > rm.exp_total) {
      reasons.push(
        `On a usual trip it costs more: about ${formatMoney(pm.exp_total)}, against ${formatMoney(rm.exp_total)} for ${ruTitle}.`
      );
      reasons.push(
        `But in the worst ${worst} tries it costs about ${formatMoney(pm.cvar_total)}, against ${formatMoney(rm.cvar_total)} for ${ruTitle}.`
      );
      reasons.push(
        shipment.profile === "high_value"
          ? "This cargo is very valuable, so we pick the way that loses the least when things go wrong."
          : "You chose to play it safe, so we pick the way that loses the least when things go wrong."
      );
    } else {
      const eligible = routes.filter((r) => ELIGIBLE.includes(r.status) && r.metrics);
      const lowest = eligible.every((r) => pm.exp_total <= r.metrics!.exp_total);
      reasons.push(
        lowest
          ? `It has the lowest usual total cost of the ways that pass the rules: about ${formatMoney(pm.exp_total)}, against ${formatMoney(rm.exp_total)} for ${ruTitle}.`
          : `It costs about ${formatMoney(pm.exp_total)} on a usual trip, against ${formatMoney(rm.exp_total)} for ${ruTitle}.`
      );
      reasons.push(
        isSafe
          ? `In the worst ${worst} tries it costs about ${formatMoney(pm.cvar_total)}, against ${formatMoney(rm.cvar_total)} for ${ruTitle}.`
          : `It takes about ${formatDays(Number(pm.mean_days.toFixed(1)))} days on average.`
      );
    }
  }

  if (reasons.length < 3) {
    const onTime = formatPercent(pm.p_on_time);
    if (shipment.min_on_time <= 0) {
      reasons.push(`It is on time in ${onTime} of the ${n} tries. This cargo has no on-time rule.`);
    } else if (pm.p_on_time >= shipment.min_on_time) {
      reasons.push(
        `It is on time in ${onTime} of the ${n} tries. This cargo needs at least ${formatPercent(shipment.min_on_time)}.`
      );
    } else {
      reasons.push(
        `It is on time in only ${onTime} of the ${n} tries, below the ${formatPercent(shipment.min_on_time)} this cargo needs.`
      );
    }
  }

  const agreeCount = confidence ? Math.round(confidence.agreement * confidence.runs) : 0;
  const altNames = confidence
    ? Object.keys(confidence.alternatives).map((k) => translateRouteName(k).title)
    : [];

  return (
    <section className="bg-ink text-white rounded-3xl p-6 md:p-8 shadow-lg" aria-labelledby={titleId}>
      {header}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7">
          <p className="text-sm font-medium text-[#a9b7cc] m-0">We recommend</p>
          <p
            id={titleId}
            className="text-4xl md:text-5xl font-heading font-bold tracking-tight mt-1 mb-6"
            style={{ color: getRouteColor(pick.name, true) }}
          >
            {pickTitle}
          </p>

          <ol className="list-none m-0 p-0 flex flex-col gap-4">
            {reasons.map((text, i) => (
              <li key={i} className="flex gap-3 text-base md:text-lg leading-relaxed text-[#e7edf6]">
                <span className="flex-none w-6 h-6 rounded-full bg-[#233552] text-white text-xs font-bold flex items-center justify-center mt-1" aria-hidden="true">
                  {i + 1}
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ol>

          {warnings.length > 0 && (
            <div role="note" className="mt-6 p-4 rounded-xl bg-[#17263c] border border-[#dc4a3d] text-sm text-white">
              <p className="font-semibold m-0 mb-1">Please check this one</p>
              {warnings.map((w, i) => (
                <p key={i} className="m-0 text-[#d5deea]">
                  {plainWarning(w)}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-[#17263c] border border-[#263a58] rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white m-0">How sure are we?</h3>
            {confidence ? (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2 mt-2">
                  <span className="font-heading font-bold text-3xl text-white">{agreeCount}</span>
                  <span className="text-sm text-[#c9d4e3]">
                    of {confidence.runs} checks agree. {CONFIDENCE_WORDS[confidence.label] ?? confidence.label}.
                  </span>
                </div>
                <div
                  className="h-2.5 bg-[#263a58] rounded-full mt-3 overflow-hidden"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={confidence.runs}
                  aria-valuenow={agreeCount}
                  aria-label="Checks that agree with our pick"
                >
                  <div
                    className="grow h-full rounded-full"
                    style={{ width: `${confidence.agreement * 100}%`, backgroundColor: CONFIDENCE_COLOR[confidence.label] }}
                  />
                </div>
                <p className="text-xs text-[#c9d4e3] mt-3 leading-relaxed m-0">
                  Our guesses about delays and trouble could be wrong. So we changed them by about{" "}
                  {formatPercent(settings.estimate_noise)} and picked again, {confidence.runs} times.
                  {altNames.length > 0 && ` When the answer changed, it was ${altNames.join(" or ")}.`}
                </p>
              </>
            ) : (
              <p className="text-xs text-[#c9d4e3] mt-2 leading-relaxed m-0">
                {hasChanges
                  ? "We only run this check for the shipment as it really is. Press Reset in step 4 to see it."
                  : "There is nothing to check because no way can be recommended."}
              </p>
            )}
          </div>

          <div className="bg-[#17263c] border border-[#263a58] rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white m-0">What would change our mind</h3>
            {tipping.length > 0 ? (
              <ul className="mt-3 pl-4 list-disc space-y-2 text-sm text-[#d5deea] leading-relaxed">
                {tipping.slice(0, 2).map((t, i) => (
                  <li key={i}>{plainTipping(t.sentence)}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#c9d4e3] mt-2 leading-relaxed m-0">
                {hasChanges
                  ? "We only work this out for the shipment as it really is. Press Reset in step 4 to see it."
                  : "Nothing nearby would change our pick."}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
