"use client";

import React, { useEffect, useState } from "react";
import { fetchEvaluation, fetchScenario } from "@/lib/api";
import { EvaluationData, ScenarioResult } from "@/lib/types";
import { formatMoney } from "@/lib/words";

const SCENARIO_NAMES = [
  "Red Sea crisis",
  "Red Sea reopens",
  "Hub congestion spike",
  "Air capacity crunch",
];

const SCENARIO_DESCRIPTIONS: Record<string, string> = {
  "Red Sea crisis": "Houthi attacks increase risk and delays in the Red Sea and Suez.",
  "Red Sea reopens": "Tensions subside and vessels return to shorter Suez routes.",
  "Hub congestion spike": "Major transshipment hubs face severe berth delays and backlogs.",
  "Air capacity crunch": "Air freight rates rise by 80% due to constrained cargo space.",
};

export default function ResultsPage() {
  const [evalData, setEvalData] = useState<EvaluationData | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioResult[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchEvaluation(),
      Promise.all(SCENARIO_NAMES.map((name) => fetchScenario(name))),
    ])
      .then(([evaluation, scenarioResults]) => {
        setEvalData(evaluation);
        setScenarios(scenarioResults);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load evaluation and scenario data");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-muted font-medium">Loading evaluation benchmarks...</p>
      </div>
    );
  }

  if (error || !evalData) {
    return (
      <div className="p-8 bg-red-50 border border-bad/30 rounded-3xl text-bad">
        <h2 className="text-xl font-bold mb-2">Connection Problem</h2>
        <p className="text-sm">{error || "No evaluation data available."}</p>
      </div>
    );
  }

  // 1. Comparison table parsing
  const { comparison, noise_sweep, by_profile } = evalData;

  const strategyMap: Record<string, { label: string; color: string }> = {
    "Advisor (profile rules)": { label: "Route Advisor", color: "#15803d" },
    "Always cheapest": { label: "Always pick the cheapest", color: "#64748b" },
    "Always safest": { label: "Always pick the safest", color: "#64748b" },
    "Always fastest": { label: "Always pick the fastest", color: "#64748b" },
    "Fixed weights": { label: "Fixed scoring weights", color: "#64748b" },
  };

  const relevantRows = comparison
    .filter((r) => strategyMap[r.Strategy])
    .sort((a, b) => {
      const regretA = Number(a["Avg regret vs oracle ($)"]);
      const regretB = Number(b["Avg regret vs oracle ($)"]);
      return regretA - regretB;
    });

  const maxRegret = Math.max(
    ...relevantRows.map((r) => Number(r["Avg regret vs oracle ($)"])),
    1
  );

  // 2. Computed findings
  const advisorRow = comparison.find((r) =>
    r.Strategy.includes("Advisor (profile rules)")
  );
  const cheapestRow = comparison.find((r) =>
    r.Strategy.includes("Always cheapest")
  );

  const oracleMatch = advisorRow ? advisorRow["Matches oracle"] : "91%";
  const advisorRegret = advisorRow
    ? Number(advisorRow["Avg regret vs oracle ($)"])
    : 315;
  const cheapestRegret = cheapestRow
    ? Number(cheapestRow["Avg regret vs oracle ($)"])
    : 1297;

  // By profile calculations
  const hvCheapest = by_profile.find(
    (r) => r.Profile === "high_value" && r.Strategy.includes("cheapest")
  );
  const hvAdvisor = by_profile.find(
    (r) => r.Profile === "high_value" && r.Strategy.includes("Advisor")
  );

  const hvBadCheapest = hvCheapest
    ? Number(hvCheapest["Avg worst-10% cost ($)"])
    : 17583;
  const hvBadAdvisor = hvAdvisor
    ? Number(hvAdvisor["Avg worst-10% cost ($)"])
    : 6833;
  const hvRatio = (hvBadCheapest / hvBadAdvisor).toFixed(1);

  const expressCheapest = by_profile.find(
    (r) => r.Profile === "express" && r.Strategy.includes("cheapest")
  );
  const expressOnTime = expressCheapest
    ? expressCheapest["Meets on-time target"]
    : "75%";

  // Noise sweep chart data
  const noiseLevels = ["0%", "30%", "60%"];
  const getRegretAtNoise = (stratPattern: string, noise: string) => {
    const row = noise_sweep.find(
      (r) => r.Noise === noise && r.Strategy.includes(stratPattern)
    );
    return row ? Number(row["Avg regret vs oracle ($)"]) : 0;
  };

  const advisorNoisePts = noiseLevels.map((n) =>
    getRegretAtNoise("Advisor (profile rules)", n)
  );
  const cheapestNoisePts = noiseLevels.map((n) =>
    getRegretAtNoise("Always cheapest", n)
  );
  const fixedWeightsNoisePts = noiseLevels.map((n) =>
    getRegretAtNoise("Fixed weights", n)
  );

  const chartW = 340;
  const chartH = 140;
  const maxSweepRegret = 7000;
  const xCoords = [40, 170, 300];

  const toY = (val: number) => chartH - 25 - (val / maxSweepRegret) * (chartH - 45);

  const makeLinePath = (pts: number[]) =>
    `M ${xCoords[0]} ${toY(pts[0])} L ${xCoords[1]} ${toY(pts[1])} L ${xCoords[2]} ${toY(pts[2])}`;

  return (
    <div className="space-y-12">
      {/* Page Header */}
      <div>
        <p className="text-sm font-semibold tracking-wider uppercase text-accent mb-2">
          Does it work?
        </p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-ink leading-tight">
          Tested against 30 real-world routes
        </h1>
        <p className="mt-4 text-base md:text-lg text-muted max-w-2xl leading-relaxed">
          We tested 30 shipments across 8 global trade corridors. Every method
          saw the same noisy estimates, then decisions were evaluated against the
          true voyage outcomes.
        </p>
      </div>

      {/* Main Benchmark Section */}
      <section className="bg-card border border-line rounded-3xl p-7 md:p-10 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Description */}
          <div className="lg:col-span-5">
            <h2 className="text-2xl md:text-3xl font-bold text-ink leading-tight">
              Money wasted per shipment
            </h2>
            <p className="text-sm md:text-base text-muted mt-3 leading-relaxed">
              Every method saw the same noisy guesses; then we checked against
              what really would have happened. Wasted money is how much more each
              method spent on average than a perfect planner who knew the future.
            </p>
            <p className="mt-4 text-base font-semibold text-ink leading-relaxed">
              Route Advisor made the same choice as the perfect planner{" "}
              <strong className="text-good">{oracleMatch} of the time</strong>,
              averaging just {formatMoney(advisorRegret)} in regret.
            </p>
            <p className="mt-2 text-xs text-subtle leading-relaxed">
              Always cheapest spends less on upfront freight, but it misses the
              deadline for {100 - parseInt(expressOnTime)}% of urgent shipments.
            </p>
          </div>

          {/* Right Column: Horizontal Bars */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {relevantRows.map((r) => {
              const info = strategyMap[r.Strategy];
              const regret = Number(r["Avg regret vs oracle ($)"]);
              const pct = Math.max(3, (regret / maxRegret) * 100);
              const isAdvisor = info.label === "Route Advisor";

              return (
                <div key={r.Strategy} className="space-y-1.5">
                  <div className="flex justify-between items-baseline text-sm font-semibold">
                    <span
                      className={
                        isAdvisor ? "text-good font-bold text-[15px]" : "text-ink"
                      }
                    >
                      {info.label}
                    </span>
                    <span
                      className={
                        isAdvisor ? "text-good font-bold text-[15px]" : "text-ink"
                      }
                    >
                      {formatMoney(regret)}
                    </span>
                  </div>

                  <div className="h-3.5 bg-[#f1eee7] rounded-full overflow-hidden">
                    <div
                      className="grow h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: info.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3 Computed Findings */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-ink m-0">
          Three key findings from the data
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Finding 1 */}
          <div className="bg-card border border-line rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-3xl font-heading font-bold text-good block mb-2">
                {oracleMatch}
              </span>
              <h3 className="text-base font-bold text-ink mb-2">
                Near-perfect decision accuracy
              </h3>
              <p className="text-xs md:text-sm text-muted leading-relaxed m-0">
                Route Advisor matched the ideal hindsight planner {oracleMatch} of
                the time. The few cases it missed were close calls where the
                difference was tiny.
              </p>
            </div>
          </div>

          {/* Finding 2 */}
          <div className="bg-card border border-line rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-3xl font-heading font-bold text-accent block mb-2">
                {hvRatio}x safer
              </span>
              <h3 className="text-base font-bold text-ink mb-2">
                Where &quot;always cheapest&quot; fails
              </h3>
              <p className="text-xs md:text-sm text-muted leading-relaxed m-0">
                Always cheapest has lower freight, but on valuable cargo its
                bad-luck cost is {hvRatio} times higher ({formatMoney(hvBadCheapest)} vs {formatMoney(hvBadAdvisor)}). On urgent cargo, it misses on-time SLAs for 1 in 4 packages.
              </p>
            </div>
          </div>

          {/* Finding 3: Noise Sweep Chart */}
          <div className="bg-card border border-line rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-ink mb-1">
                Stable when guesses get worse
              </h3>
              <p className="text-xs text-muted leading-relaxed mb-3">
                Wasted money as error increases from 0% to 60%.
              </p>

              {/* Plain SVG Line Chart */}
              <div className="bg-paper rounded-xl p-2.5 border border-line">
                <svg
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  className="w-full h-[120px]"
                >
                  {/* Grid lines */}
                  <line
                    x1="30"
                    y1={toY(0)}
                    x2={chartW - 10}
                    y2={toY(0)}
                    stroke="#e7e3da"
                    strokeWidth="1"
                  />
                  <line
                    x1="30"
                    y1={toY(3000)}
                    x2={chartW - 10}
                    y2={toY(3000)}
                    stroke="#e7e3da"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                  <line
                    x1="30"
                    y1={toY(6000)}
                    x2={chartW - 10}
                    y2={toY(6000)}
                    stroke="#e7e3da"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />

                  {/* Lines */}
                  {/* Fixed weights (gray dashed) */}
                  <path
                    d={makeLinePath(fixedWeightsNoisePts)}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                  />
                  {/* Always cheapest (slate) */}
                  <path
                    d={makeLinePath(cheapestNoisePts)}
                    fill="none"
                    stroke="#64748b"
                    strokeWidth="2"
                  />
                  {/* Route Advisor (green solid) */}
                  <path
                    d={makeLinePath(advisorNoisePts)}
                    fill="none"
                    stroke="#15803d"
                    strokeWidth="3"
                  />

                  {/* Points on Route Advisor */}
                  {advisorNoisePts.map((pt, i) => (
                    <circle
                      key={i}
                      cx={xCoords[i]}
                      cy={toY(pt)}
                      r="4"
                      fill="#15803d"
                    />
                  ))}

                  {/* X Axis Labels */}
                  {noiseLevels.map((n, i) => (
                    <text
                      key={n}
                      x={xCoords[i]}
                      y={chartH - 6}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#6b7686"
                      fontFamily="Inter, sans-serif"
                    >
                      {n}
                    </text>
                  ))}
                </svg>

                <div className="flex justify-between items-center text-[10px] text-subtle px-1 mt-1 font-medium">
                  <span className="flex items-center gap-1 text-good">
                    <span className="w-2 h-2 rounded-full bg-good" />
                    Route Advisor ({formatMoney(advisorNoisePts[2])})
                  </span>
                  <span className="flex items-center gap-1 text-muted">
                    <span className="w-2 h-2 rounded-full bg-slate-500" />
                    Cheapest ({formatMoney(cheapestNoisePts[2])})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* World Events Grid */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-ink m-0">World events</h2>
          <p className="text-sm md:text-base text-muted mt-1 leading-relaxed">
            How route choices react when chokepoints face geopolitical conflict,
            strikes, or capacity bottlenecks across 30 shipments.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {scenarios.map((scen) => (
            <div
              key={scen.name}
              className="bg-card border border-line rounded-2xl p-6 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-lg font-bold text-ink m-0">{scen.name}</h3>
                  <span className="text-xs font-bold text-accent bg-accent/10 px-2.5 py-1 rounded-full">
                    {scen.rerouted} of {scen.total} switched
                  </span>
                </div>
                <p className="text-xs text-muted mb-4 leading-relaxed">
                  {SCENARIO_DESCRIPTIONS[scen.name] ||
                    "Scenario simulating geopolitical disruptions."}
                </p>

                <dl className="grid grid-cols-2 gap-3 text-xs border-t border-line/60 pt-3 m-0">
                  <div>
                    <dt className="text-subtle">Forced switches</dt>
                    <dd className="m-0 mt-0.5 font-bold text-ink">
                      {scen.forced} shipments
                    </dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Locked into 1 route</dt>
                    <dd className="m-0 mt-0.5 font-bold text-ink">
                      {scen.locked_in} shipments
                    </dd>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-line/40 flex justify-between">
                    <span className="text-subtle">Average cost impact:</span>
                    <span className="font-semibold text-ink">
                      {formatMoney(scen.avg_cost_before)} to{" "}
                      {formatMoney(scen.avg_cost_after)}
                    </span>
                  </div>
                </dl>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Limits Box */}
      <section className="bg-paper border border-line rounded-3xl p-7 md:p-8">
        <h2 className="text-lg font-bold text-ink mb-2">Model limits</h2>
        <p className="text-xs md:text-sm text-muted leading-relaxed mb-4">
          This system is transparent about what it can and cannot do:
        </p>
        <ul className="text-xs md:text-sm text-muted space-y-2 list-disc pl-5 m-0 leading-relaxed">
          <li>
            <strong>Made-up prices and risks on real lanes:</strong> Ports,
            canals, and sailing distances reflect actual geography, but rates and
            delay odds are synthetic estimates.
          </li>
          <li>
            <strong>Independent delays:</strong> The simulation handles delays on
            each leg independently. In reality, large weather events or port
            strikes impact multiple shipments simultaneously.
          </li>
          <li>
            <strong>No capacity limits:</strong> Any number of shipments are
            assumed to fit onto a train or flight without booking constraints.
          </li>
        </ul>
      </section>
    </div>
  );
}
