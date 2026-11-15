"use client";

import React from "react";
import { RouteItem } from "@/lib/types";
import { formatCount, formatDays, formatPercent, translateRouteName } from "@/lib/words";
import { getRouteColor } from "./RouteMap";

interface TripsHistogramProps {
  routes: RouteItem[];
  deadlineDays: number;
  nSims: number;
}

const W = 240;
const H = 90;

export default function TripsHistogram({ routes, deadlineDays, nSims }: TripsHistogramProps) {
  const withHist = routes.filter((r) => r.arrival_histogram && r.metrics);
  if (withHist.length === 0) return null;

  return (
    <details className="group bg-card border border-line rounded-3xl p-6 md:p-8 shadow-sm">
      <summary className="font-heading text-lg md:text-xl font-bold text-ink cursor-pointer list-none flex items-center justify-between gap-3 min-h-[44px] rounded-xl [&::-webkit-details-marker]:hidden">
        <span>See all {formatCount(nSims)} tries for each way</span>
        <svg
          className="flex-none text-muted group-open:rotate-180 transition-transform"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>

      <p className="text-sm text-muted mt-3 mb-6 leading-relaxed">
        Each bar shows how many tries arrived on that day. Bars left of the red dashed line arrived
        before the {formatDays(deadlineDays)}-day deadline.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {withHist.map((r) => {
          const hist = r.arrival_histogram!;
          const m = r.metrics!;
          const { title } = translateRouteName(r.name, r.passages);
          const color = getRouteColor(r.name);
          const maxCount = Math.max(...hist.counts, 1);
          const lo = Math.min(hist.edges[0], deadlineDays) - 1;
          const hi = Math.max(hist.edges[hist.edges.length - 1], deadlineDays) + 1;
          const x = (d: number) => ((d - lo) / (hi - lo)) * W;
          const dx = x(deadlineDays);

          return (
            <figure key={r.id} className="m-0 p-4 bg-paper rounded-2xl border border-line flex flex-col gap-2">
              <figcaption>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-ink">{title}</span>
                  <span className="text-xs font-semibold text-good whitespace-nowrap">
                    {formatPercent(m.p_on_time)} on time
                  </span>
                </span>
                <span className="text-xs text-muted block mt-1">
                  {formatDays(Number(m.mean_days.toFixed(1)))} days on average. 9 in 10 tries arrive within{" "}
                  {formatDays(Number(m.p90_days.toFixed(1)))} days.
                </span>
              </figcaption>

              <svg
                viewBox={`0 0 ${W} ${H + 14}`}
                className="w-full h-auto"
                role="img"
                aria-label={`${title}: arrival days from ${formatDays(Number(hist.edges[0].toFixed(1)))} to ${formatDays(
                  Number(hist.edges[hist.edges.length - 1].toFixed(1))
                )}; deadline ${formatDays(deadlineDays)} days.`}
              >
                {hist.counts.map((count, i) => {
                  const x0 = x(hist.edges[i]);
                  const x1 = x(hist.edges[i + 1]);
                  const h = (count / maxCount) * (H - 12);
                  return (
                    <rect key={i} x={x0} y={H - h} width={Math.max(1.5, x1 - x0 - 0.5)} height={h} fill={color} opacity={0.8} rx={1} />
                  );
                })}
                <line x1={0} y1={H} x2={W} y2={H} stroke="#d9d4c8" strokeWidth="1" />
                <line x1={dx} y1={0} x2={dx} y2={H} stroke="#b42318" strokeWidth="1.5" strokeDasharray="3 3" />
                <text x={W - 2} y={H + 12} textAnchor="end" fontSize="10" fill="#4a5566" fontFamily="Inter, sans-serif">
                  {formatDays(Number(hi.toFixed(1)))} days
                </text>
                <text x={2} y={H + 12} fontSize="10" fill="#4a5566" fontFamily="Inter, sans-serif">
                  {formatDays(Number(lo.toFixed(1)))} days
                </text>
              </svg>
            </figure>
          );
        })}
      </div>
    </details>
  );
}
