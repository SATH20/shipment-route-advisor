"use client";

import React, { useCallback, useEffect, useState } from "react";
import { fetchEvaluation, fetchEvents, fetchScenario, fetchShipments } from "@/lib/api";
import { EvaluationData, ScenarioResult, ShipmentSummary, WorldEvent } from "@/lib/types";
import { formatMoney } from "@/lib/words";
import { ResultsPageSkeleton, ErrorBox } from "@/components/PageSkeletons";

// Column names in evaluation/results/*.csv (served as-is by /api/evaluation)
const COL = {
  strategy: "Strategy",
  waste: "Avg regret vs oracle ($)",
  match: "Matches oracle",
  meets: "Meets on-time target",
  worst: "Avg worst-10% cost ($)",
  co2: "Total CO2 (t)",
  noise: "Noise",
  profile: "Profile",
};

const ADVISOR = "Advisor (profile rules)";
const CHEAPEST = "Always cheapest";
const FIXED = "Fixed weights";

const STRATEGY_LABEL: Record<string, string> = {
  [ADVISOR]: "Route Advisor",
  [CHEAPEST]: "Always the cheapest ticket",
  "Always fastest": "Always the fastest",
  "Always safest": "Always the safest",
  [FIXED]: "Fixed score weights",
  "Advisor (expected cost only)": "Route Advisor, cheapest on average for every cargo",
  "Advisor (play-safe only)": "Route Advisor, play it safe for every cargo",
};
const MAIN_STRATEGIES = [ADVISOR, CHEAPEST, "Always fastest", "Always safest", FIXED];

type Row = Record<string, string | number>;
const num = (v: string | number | undefined) => (typeof v === "number" ? v : parseFloat(String(v ?? "")));

/** Round a chart maximum up to 1, 2 or 5 times a power of ten. */
function niceCeil(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
  for (const k of [1, 2, 5, 10]) if (v <= k * p) return k * p;
  return 10 * p;
}

interface Loaded {
  evaluation: EvaluationData;
  events: WorldEvent[];
  scenarios: ScenarioResult[];
  shipments: ShipmentSummary[];
}

export default function ResultsPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([fetchEvaluation(), fetchEvents(), fetchShipments()])
      .then(([evaluation, events, shipments]) =>
        Promise.all(events.map((e) => fetchScenario(e.id))).then((scenarios) =>
          setData({ evaluation, events, scenarios, shipments })
        )
      )
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !data) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <ResultsPageSkeleton />;

  const { evaluation, events, scenarios, shipments } = data;
  const comparison = evaluation.comparison as Row[];
  const sweep = evaluation.noise_sweep as Row[];
  const byProfile = evaluation.by_profile as Row[];
  const row = (name: string) => comparison.find((r) => r[COL.strategy] === name);
  const advisor = row(ADVISOR);
  const cheapest = row(CHEAPEST);

  const lanes = new Set(shipments.map((s) => `${s.origin}|${s.destination}`)).size;
  const bars = MAIN_STRATEGIES.map(row)
    .filter((r): r is Row => !!r)
    .sort((a, b) => num(a[COL.waste]) - num(b[COL.waste]));
  const maxWaste = Math.max(...bars.map((r) => num(r[COL.waste])), 1);

  const prof = (p: string, s: string) => byProfile.find((r) => r[COL.profile] === p && r[COL.strategy] === s);
  const hvCheap = prof("high_value", CHEAPEST);
  const hvAdv = prof("high_value", ADVISOR);
  const exCheap = prof("express", CHEAPEST);
  const hvRatio = hvCheap && hvAdv ? num(hvCheap[COL.worst]) / num(hvAdv[COL.worst]) : null;

  // Noise sweep chart, scaled to the data
  const noiseLevels = Array.from(new Set(sweep.map((r) => String(r[COL.noise]))));
  const sweepLines = [
    { name: ADVISOR, color: "#15803d", width: 3, dash: undefined },
    { name: CHEAPEST, color: "#4a5566", width: 2, dash: undefined },
    { name: FIXED, color: "#8a94a6", width: 2, dash: "4 3" },
  ].map((l) => ({
    ...l,
    pts: noiseLevels.map((n) => num(sweep.find((r) => r[COL.noise] === n && r[COL.strategy] === l.name)?.[COL.waste])),
  }));
  const chartMax = niceCeil(Math.max(...sweepLines.flatMap((l) => l.pts), 1));
  const CW = 340;
  const CH = 160;
  const pad = { l: 48, r: 32, t: 10, b: 24 };
  const xAt = (i: number) => pad.l + (i * (CW - pad.l - pad.r)) / Math.max(1, noiseLevels.length - 1);
  const yAt = (v: number) => CH - pad.b - (v / chartMax) * (CH - pad.t - pad.b);
  const ticks = [0, chartMax / 2, chartMax];

  return (
    <div className="space-y-10">
      <div className="rise">
        <p className="text-sm font-semibold tracking-wider uppercase text-accent mb-2">Does it work?</p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-ink leading-tight">
          Tested on {shipments.length} shipments
        </h1>
        <p className="mt-4 text-base md:text-lg text-muted max-w-2xl leading-relaxed">
          We made up {shipments.length} shipments on {lanes} real trade lanes. Every method below
          saw the same rough guesses about delays and trouble. Then we checked each choice against
          the true odds, which the methods never saw.
        </p>
      </div>

      <section className="bg-card border border-line rounded-3xl p-6 md:p-8 shadow-sm" aria-labelledby="waste-title">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-5">
            <h2 id="waste-title" className="text-2xl md:text-3xl font-bold text-ink leading-tight m-0">
              Money wasted per shipment
            </h2>
            <p className="text-base text-muted mt-3 leading-relaxed">
              A perfect planner knows the true odds. Wasted money is how much more a method spends,
              on average, than that perfect planner. Lower is better.
            </p>
            {advisor && (
              <p className="mt-4 text-base font-semibold text-ink leading-relaxed">
                Route Advisor made the same choice as the perfect planner for{" "}
                <span className="text-good">{advisor[COL.match]}</span> of shipments and wasted{" "}
                {formatMoney(num(advisor[COL.waste]))} per shipment.
              </p>
            )}
          </div>

          <ul className="lg:col-span-7 flex flex-col gap-4 list-none p-0 m-0">
            {bars.map((r) => {
              const name = String(r[COL.strategy]);
              const waste = num(r[COL.waste]);
              const isAdv = name === ADVISOR;
              return (
                <li key={name}>
                  <div className={`flex justify-between gap-3 text-sm font-semibold ${isAdv ? "text-good" : "text-ink"}`}>
                    <span>{STRATEGY_LABEL[name] ?? name}</span>
                    <span>{formatMoney(waste)}</span>
                  </div>
                  <div className="h-3.5 bg-[#f1eee7] rounded-full overflow-hidden mt-1.5" aria-hidden="true">
                    <div
                      className="grow h-full rounded-full"
                      style={{ width: `${Math.max(1, (waste / maxWaste) * 100)}%`, backgroundColor: isAdv ? "#15803d" : "#8a94a6" }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="space-y-6" aria-labelledby="findings-title">
        <h2 id="findings-title" className="text-2xl md:text-3xl font-bold text-ink m-0">
          What we found
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {advisor && cheapest && (
            <div className="bg-card border border-line rounded-2xl p-6 shadow-sm">
              <p className="text-3xl font-heading font-bold text-good m-0 mb-2">{advisor[COL.match]}</p>
              <h3 className="text-lg font-bold text-ink m-0 mb-2">Same choice as a perfect planner</h3>
              <p className="text-sm text-muted leading-relaxed m-0">
                Route Advisor chose what the perfect planner chose for {advisor[COL.match]} of
                shipments. It wasted {formatMoney(num(advisor[COL.waste]))} per shipment, against{" "}
                {formatMoney(num(cheapest[COL.waste]))} for always picking the cheapest ticket.
              </p>
            </div>
          )}

          {hvCheap && hvAdv && hvRatio !== null && (
            <div className="bg-card border border-line rounded-2xl p-6 shadow-sm">
              <p className="text-3xl font-heading font-bold text-accent m-0 mb-2">{hvRatio.toFixed(1)} times</p>
              <h3 className="text-lg font-bold text-ink m-0 mb-2">Where the cheapest ticket goes wrong</h3>
              <p className="text-sm text-muted leading-relaxed m-0">
                On very valuable cargo, the bad-luck cost of always picking the cheapest ticket was{" "}
                {formatMoney(num(hvCheap[COL.worst]))}, against {formatMoney(num(hvAdv[COL.worst]))} for
                Route Advisor.
                {exCheap &&
                  ` On urgent cargo, the cheapest ticket met the on-time target for only ${exCheap[COL.meets]} of shipments.`}
              </p>
            </div>
          )}

          <div className="bg-card border border-line rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-ink m-0 mb-2">Steady when the guesses get worse</h3>
            <p className="text-sm text-muted leading-relaxed m-0 mb-3">
              Money wasted per shipment when our guesses are off by{" "}
              {noiseLevels.join(", ")}.
            </p>
            <figure className="m-0 bg-paper rounded-xl p-3 border border-line">
              <svg
                viewBox={`0 0 ${CW} ${CH}`}
                className="w-full h-auto"
                role="img"
                aria-label={sweepLines
                  .map((l) => `${STRATEGY_LABEL[l.name]}: ${l.pts.map((p) => formatMoney(p)).join(", ")}`)
                  .join(". ")}
              >
                {ticks.map((t) => (
                  <g key={t}>
                    <line x1={pad.l} y1={yAt(t)} x2={CW - pad.r} y2={yAt(t)} stroke="#e7e3da" strokeDasharray={t ? "2 2" : undefined} />
                    <text x={pad.l - 6} y={yAt(t) + 3} textAnchor="end" fontSize="10" fill="#4a5566" fontFamily="Inter, sans-serif">
                      {formatMoney(t)}
                    </text>
                  </g>
                ))}
                {sweepLines.map((l) => (
                  <g key={l.name}>
                    <path
                      d={l.pts.map((p, i) => `${i ? "L" : "M"} ${xAt(i)} ${yAt(p)}`).join(" ")}
                      fill="none"
                      stroke={l.color}
                      strokeWidth={l.width}
                      strokeDasharray={l.dash}
                    />
                    {l.pts.map((p, i) => (
                      <circle key={i} cx={xAt(i)} cy={yAt(p)} r={3} fill={l.color} />
                    ))}
                  </g>
                ))}
                {noiseLevels.map((n, i) => (
                  <text key={n} x={xAt(i)} y={CH - 6} textAnchor="middle" fontSize="10" fill="#4a5566" fontFamily="Inter, sans-serif">
                    off by {n}
                  </text>
                ))}
              </svg>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-muted list-none p-0 m-0">
                {sweepLines.map((l) => (
                  <li key={l.name} className="flex items-center gap-2">
                    <span className="w-4 h-0.5 flex-none" style={{ backgroundColor: l.color }} aria-hidden="true" />
                    {STRATEGY_LABEL[l.name]}: {l.pts.map((p) => formatMoney(p)).join(", ")}
                  </li>
                ))}
              </ul>
            </figure>
          </div>
        </div>
      </section>

      <section className="bg-card border border-line rounded-3xl p-6 md:p-8 shadow-sm" aria-labelledby="table-title">
        <h2 id="table-title" className="text-2xl md:text-3xl font-bold text-ink m-0">
          Not only money
        </h2>
        <p className="text-base text-muted mt-2 leading-relaxed max-w-3xl">
          Route Advisor tries to keep cost low, and the test above measures cost, so it favours
          Route Advisor. This table also shows lateness and pollution, where other methods can win.
        </p>
        <div className="mt-4 overflow-x-auto" tabIndex={0} aria-label="Results table, scrolls sideways on small screens">
          <table className="w-full min-w-[640px] text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-line text-muted">
                <th scope="col" className="py-2 pr-4 font-semibold">Method</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Wasted per shipment</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Same as perfect planner</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Meets on-time target</th>
                <th scope="col" className="py-2 font-semibold">Pollution, all shipments</th>
              </tr>
            </thead>
            <tbody>
              {comparison
                .filter((r) => STRATEGY_LABEL[String(r[COL.strategy])])
                .map((r) => (
                  <tr key={String(r[COL.strategy])} className="border-b border-line last:border-0">
                    <th scope="row" className={`py-2 pr-4 font-semibold ${r[COL.strategy] === ADVISOR ? "text-good" : "text-ink"}`}>
                      {STRATEGY_LABEL[String(r[COL.strategy])]}
                    </th>
                    <td className="py-2 pr-4 text-ink">{formatMoney(num(r[COL.waste]))}</td>
                    <td className="py-2 pr-4 text-ink">{r[COL.match]}</td>
                    <td className="py-2 pr-4 text-ink">{r[COL.meets]}</td>
                    <td className="py-2 text-ink">{num(r[COL.co2]).toFixed(1)} t CO2</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-6" aria-labelledby="events-title">
        <div>
          <h2 id="events-title" className="text-2xl md:text-3xl font-bold text-ink m-0">
            When something happens in the world
          </h2>
          <p className="text-base text-muted mt-2 leading-relaxed">
            We changed the world for all {shipments.length} shipments at once and picked again. Cost here is the usual total cost, or the bad-luck cost for very valuable cargo.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {scenarios.map((sc) => {
            const ev = events.find((e) => e.id === sc.name);
            return (
              <article key={sc.name} className="bg-card border border-line rounded-2xl p-6 shadow-sm flex flex-col">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <h3 className="text-lg font-bold text-ink m-0">{ev?.title ?? sc.name}</h3>
                  <span className="text-xs font-bold text-accent bg-[#eef2fb] px-2.5 py-1 rounded-full">
                    {sc.rerouted} of {sc.total} switched
                  </span>
                </div>
                <p className="text-sm text-muted mb-4 leading-relaxed">{ev?.description}</p>
                <dl className="grid grid-cols-2 gap-3 text-sm border-t border-line pt-4 m-0 mt-auto">
                  <div>
                    <dt className="text-subtle">Had to switch (old way broke a rule)</dt>
                    <dd className="m-0 mt-0.5 font-bold text-ink">{sc.forced}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Left with only one way</dt>
                    <dd className="m-0 mt-0.5 font-bold text-ink">{sc.locked_in}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-subtle">Average cost per shipment, before and after</dt>
                    <dd className="m-0 mt-0.5 font-bold text-ink">
                      {formatMoney(sc.avg_cost_before)} before, {formatMoney(sc.avg_cost_after)} after
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      <section className="bg-paper border border-line rounded-3xl p-6 md:p-8" aria-labelledby="limits-title">
        <h2 id="limits-title" className="text-xl md:text-2xl font-bold text-ink m-0 mb-3">
          What this cannot do yet
        </h2>
        <ul className="text-sm md:text-base text-muted space-y-2 list-disc pl-5 m-0 leading-relaxed">
          <li>
            <strong className="text-ink">Made-up prices and risks.</strong> Ports, canals and distances
            are real. Prices and the chances of delay are invented.
          </li>
          <li>
            <strong className="text-ink">Each delay happens on its own.</strong> In real life one storm
            or strike can delay many ships at once.
          </li>
          <li>
            <strong className="text-ink">No full ships or planes.</strong> We assume there is always
            room for one more shipment.
          </li>
        </ul>
      </section>
    </div>
  );
}
