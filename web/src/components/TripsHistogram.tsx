"use client";

import React from "react";
import { RouteItem } from "@/lib/types";
import { formatDays, formatPercent, translateRouteName } from "@/lib/words";
import { getRouteColor } from "./RouteMap";

interface TripsHistogramProps {
  routes: RouteItem[];
  deadlineDays: number;
}

export default function TripsHistogram({
  routes,
  deadlineDays,
}: TripsHistogramProps) {
  const routesWithHist = routes.filter(
    (r) => r.arrival_histogram && r.metrics !== null
  );

  if (routesWithHist.length === 0) return null;

  return (
    <details className="group bg-card border border-line rounded-3xl p-6 md:p-8 mt-8 shadow-sm transition-all">
      <summary className="font-heading text-lg md:text-xl font-bold text-ink cursor-pointer list-none flex items-center justify-between select-none min-h-[44px]">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-ocean text-accent flex items-center justify-center font-bold text-sm">
            📈
          </span>
          <span>See the 5,000 imagined trips</span>
        </div>
        <span className="text-muted text-sm font-normal group-open:rotate-180 transition-transform">
          ▼
        </span>
      </summary>

      <p className="text-xs md:text-sm text-muted mt-3 mb-6">
        Arrival day distribution across 5,000 simulated trips. The red dashed line
        marks the customer&apos;s deadline ({deadlineDays} days).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-2">
        {routesWithHist.map((r) => {
          const hist = r.arrival_histogram!;
          const m = r.metrics!;
          const { title } = translateRouteName(r.name, r.passages);
          const color = getRouteColor(r.name);

          const width = 240;
          const height = 90;
          const maxCount = Math.max(...hist.counts, 1);
          const minEdge = hist.edges[0];
          const maxEdge = Math.max(
            hist.edges[hist.edges.length - 1],
            deadlineDays + 2
          );
          const range = maxEdge - minEdge || 1;

          // X position of the deadline
          const deadlineX = ((deadlineDays - minEdge) / range) * width;

          return (
            <div
              key={r.id}
              className="p-4 bg-paper/60 rounded-2xl border border-line/70 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-bold text-ink truncate">
                    {title}
                  </span>
                  <span className="text-[11px] font-semibold text-good">
                    {formatPercent(m.p_on_time)} on-time
                  </span>
                </div>
                <span className="text-[11px] text-muted block mb-3">
                  Avg: {formatDays(m.mean_days)} d | 90%: {formatDays(m.p90_days)} d
                </span>
              </div>

              {/* Histogram SVG */}
              <div className="relative">
                <svg
                  viewBox={`0 0 ${width} ${height}`}
                  className="w-full h-[90px] overflow-visible"
                >
                  {/* Bars */}
                  {hist.counts.map((count, i) => {
                    const x0 = ((hist.edges[i] - minEdge) / range) * width;
                    const x1 = ((hist.edges[i + 1] - minEdge) / range) * width;
                    const barWidth = Math.max(1.5, x1 - x0 - 0.5);
                    const barHeight = (count / maxCount) * (height - 10);
                    const y = height - barHeight;

                    return (
                      <rect
                        key={i}
                        x={x0}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        fill={color}
                        opacity={0.75}
                        rx={1}
                      />
                    );
                  })}

                  {/* Deadline vertical dashed line */}
                  {deadlineX >= 0 && deadlineX <= width && (
                    <g>
                      <line
                        x1={deadlineX}
                        y1={0}
                        x2={deadlineX}
                        y2={height}
                        stroke="#dc2626"
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={Math.min(deadlineX + 3, width - 45)}
                        y={10}
                        fontSize="9"
                        fill="#dc2626"
                        fontWeight="600"
                        fontFamily="Inter, sans-serif"
                      >
                        {deadlineDays}d
                      </text>
                    </g>
                  )}
                </svg>

                <div className="flex justify-between text-[10px] text-subtle mt-1 font-mono">
                  <span>{formatDays(minEdge)}d</span>
                  <span>{formatDays(maxEdge)}d</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
