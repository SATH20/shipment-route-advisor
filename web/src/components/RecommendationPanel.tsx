"use client";

import React from "react";
import {
  ConfidenceData,
  RouteItem,
  TippingPoint,
} from "@/lib/types";
import {
  formatDays,
  formatMoney,
  formatPercent,
  translateRouteName,
} from "@/lib/words";
import { getRouteColor } from "./RouteMap";

interface RecommendationPanelProps {
  recommendedRoute: RouteItem | null;
  routes: RouteItem[];
  mode: string;
  onChangeMode: (mode: string) => void;
  confidence: ConfidenceData | null;
  tipping: TippingPoint[];
  warnings: string[];
  cargoValue: number;
  deadlineDays: number;
  minOnTime: number;
}

export default function RecommendationPanel({
  recommendedRoute,
  routes,
  mode,
  onChangeMode,
  confidence,
  tipping,
  warnings,
  cargoValue,
  deadlineDays,
  minOnTime,
}: RecommendationPanelProps) {
  const isSafe = mode === "play_safe";

  if (!recommendedRoute) {
    return (
      <section className="bg-ink text-white rounded-3xl p-8 mt-8">
        <h2 className="text-2xl font-bold">No valid route recommended</h2>
        <p className="text-gray-300 mt-2">
          None of the candidate routes meet all hard constraints.
        </p>
      </section>
    );
  }

  const { title: pickTitle } = translateRouteName(
    recommendedRoute.name,
    recommendedRoute.passages
  );
  const pickColor = getRouteColor(recommendedRoute.name);

  // Find next-best candidate route to compare against
  const otherCandidates = routes.filter(
    (r) => r.id !== recommendedRoute.id && r.metrics !== null
  );
  const runnerUp =
    otherCandidates.find((r) => r.status === "candidate") ||
    otherCandidates[0];

  const runnerUpTitle = runnerUp
    ? translateRouteName(runnerUp.name, runnerUp.passages).title
    : "alternative route";

  // Generate 2-3 dynamic numbered reasons
  const reasons: { n: number; text: string }[] = [];

  if (recommendedRoute.metrics && runnerUp && runnerUp.metrics) {
    const recM = recommendedRoute.metrics;
    const runM = runnerUp.metrics;

    // Reason 1: Normal cost comparison
    if (recM.exp_total > runM.exp_total) {
      reasons.push({
        n: 1,
        text: `On a normal trip ${pickTitle.toLowerCase()} costs more: about ${formatMoney(
          recM.exp_total
        )} in total, against ${formatMoney(runM.exp_total)} for ${runnerUpTitle}.`,
      });
    } else {
      reasons.push({
        n: 1,
        text: `${pickTitle} is cheapest on a normal trip: about ${formatMoney(
          recM.exp_total
        )} in total, against ${formatMoney(runM.exp_total)} for ${runnerUpTitle}.`,
      });
    }

    // Reason 2: Bad luck or transit comparison
    if (recM.cvar_total < runM.cvar_total) {
      reasons.push({
        n: 2,
        text: `But when things go wrong, it loses far less: about ${formatMoney(
          recM.cvar_total
        )} in a bad-luck trip, against ${formatMoney(
          runM.cvar_total
        )} for ${runnerUpTitle}.`,
      });
    } else {
      reasons.push({
        n: 2,
        text: `It arrives in about ${formatDays(
          recM.mean_days
        )} days, arriving on time in ${formatPercent(
          recM.p_on_time
        )} of 5,000 imagined trips.`,
      });
    }

    // Reason 3: Contextual profile note
    if (cargoValue >= 500000) {
      reasons.push({
        n: 3,
        text: `This cargo is worth ${formatMoney(
          cargoValue
        )}, so we protect against bad outcomes.`,
      });
    } else if (minOnTime >= 0.8) {
      reasons.push({
        n: 3,
        text: `This shipment requires ${formatPercent(
          minOnTime
        )} reliability, which this route reliably achieves.`,
      });
    } else {
      reasons.push({
        n: 3,
        text: `This route offers the best expected balance of cost, transit time, and risk.`,
      });
    }
  }

  // Rewrite tipping sentences to use plain route names
  const cleanTipping = tipping.map((t) => {
    let s = t.sentence;
    s = s.replace(/Direct sea/g, "Direct ship");
    s = s.replace(/Air freight/g, "By plane");
    s = s.replace(/Suez corridor/g, "Ship through Suez");
    s = s.replace(/Sea \+ rail/g, "Ship, then train");
    s = s.replace(/Sea \+ air/g, "Ship, then plane");
    s = s.replace(/Sea via hub/g, "Ship with a stop");
    return s;
  });

  return (
    <section className="bg-ink text-white rounded-3xl p-7 md:p-9 shadow-lg">
      {/* Top Bar with Segmented Control */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1c2a40] pb-6">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full bg-white text-ink font-bold text-xs flex items-center justify-center">
            3
          </span>
          <h2 className="text-xl md:text-2xl font-bold m-0 text-white">
            Our pick, and why
          </h2>
        </div>

        {/* Segmented Control */}
        <div
          role="group"
          aria-label="How careful should we be?"
          className="flex bg-[#1c2a40] rounded-full p-1 border border-[#2a3c57]"
        >
          <button
            type="button"
            onClick={() => onChangeMode("play_safe")}
            className={`seg text-sm font-semibold px-4 py-2 rounded-full min-h-[40px] transition-colors ${
              isSafe
                ? "bg-white text-ink shadow-sm"
                : "bg-transparent text-[#c9d4e3] hover:text-white"
            }`}
          >
            Play it safe
          </button>
          <button
            type="button"
            onClick={() => onChangeMode("expected")}
            className={`seg text-sm font-semibold px-4 py-2 rounded-full min-h-[40px] transition-colors ${
              !isSafe
                ? "bg-white text-ink shadow-sm"
                : "bg-transparent text-[#c9d4e3] hover:text-white"
            }`}
          >
            Cheapest on average
          </button>
        </div>
      </div>

      {/* Main Content: Reasons & Confidence */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Big Recommendation & Reasons */}
        <div className="lg:col-span-7">
          <p className="text-sm font-medium text-[#a9b7cc] m-0">We recommend</p>
          <p
            className="text-4xl md:text-5xl font-heading font-bold tracking-tight mt-1 mb-6"
            style={{ color: pickColor }}
          >
            {pickTitle}
          </p>

          <ul className="list-none m-0 p-0 flex flex-col gap-3.5">
            {reasons.map((r) => (
              <li
                key={r.n}
                className="flex gap-3 text-base md:text-[17px] leading-relaxed text-[#e7edf6]"
              >
                <span className="flex-none w-6 h-6 rounded-full bg-[#233552] text-white text-xs font-bold flex items-center justify-center mt-0.5">
                  {r.n}
                </span>
                <span>{r.text}</span>
              </li>
            ))}
          </ul>

          {/* Warnings box */}
          {warnings.length > 0 && (
            <div className="mt-6 p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-sm">
              <p className="font-semibold mb-1">Attention:</p>
              {warnings.map((w, idx) => (
                <p key={idx} className="m-0">
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Confidence & Tipping Points */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* How sure are we? (Hide if confidence is null) */}
          {confidence && (
            <div className="bg-[#17263c] border border-[#263a58] rounded-2xl p-5">
              <p className="text-sm font-semibold text-white m-0">
                How sure are we?
              </p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="font-heading font-bold text-3xl text-white">
                  {Math.round(confidence.agreement * 100)}
                </span>
                <span className="text-sm text-[#a9b7cc]">
                  of 100 checks agree
                </span>
              </div>
              <div className="h-2.5 bg-[#263a58] rounded-full mt-2.5 overflow-hidden">
                <div
                  className="grow h-full bg-[#4ade80] rounded-full transition-all duration-700"
                  style={{ width: `${confidence.agreement * 100}%` }}
                />
              </div>
              <p className="text-xs text-[#a9b7cc] mt-2.5 leading-relaxed m-0">
                We changed our risk guesses by about 30% and decided again, 100 times.
              </p>
            </div>
          )}

          {/* What would change our mind */}
          {cleanTipping.length > 0 && (
            <div className="bg-[#17263c] border border-[#263a58] rounded-2xl p-5">
              <p className="text-sm font-semibold text-white m-0">
                What would change our mind
              </p>
              <ul className="mt-2.5 pl-4 list-disc space-y-2 text-xs md:text-sm text-[#d5deea] leading-relaxed">
                {cleanTipping.slice(0, 2).map((sentence, idx) => (
                  <li key={idx}>{sentence}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
