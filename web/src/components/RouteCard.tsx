"use client";

import React from "react";
import { RouteItem } from "@/lib/types";
import {
  describeRoute,
  formatDays,
  formatMoney,
  formatPercent,
  plainReason,
  translateRouteName,
  translateStatus,
} from "@/lib/words";
import { getRouteColor } from "./RouteMap";

interface RouteCardProps {
  route: RouteItem;
  allRoutes: RouteItem[];
  isRecommended: boolean;
  deadlineDays: number;
}

const BADGE: Record<string, string> = {
  candidate: "text-accent bg-[#eef2fb]",
  dominated: "text-muted bg-[#ece8df]",
  "fails reliability": "text-bad bg-[#fff3f1]",
  "not allowed": "text-bad bg-[#fff3f1]",
};

export default function RouteCard({ route, allRoutes, isRecommended, deadlineDays }: RouteCardProps) {
  const { title, subtitle } = translateRouteName(route.name, route.passages);
  const color = getRouteColor(route.name);
  const m = route.metrics;
  const days = m ? m.mean_days : route.planned_days;
  const pctOfDeadline = Math.min(100, Math.max(4, (days / deadlineDays) * 100));
  const reason = route.reasons.length > 0 ? plainReason(route.reasons[0]) : null;

  return (
    <article
      className={`lift relative rounded-2xl p-5 pt-6 bg-card border-2 flex flex-col ${
        isRecommended ? "border-good ring-2 ring-good/20 shadow-md" : "border-line"
      }`}
      aria-label={`${title}: ${translateStatus(route.status)}`}
    >
      <span
        className={`absolute -top-3 left-4 text-xs font-bold px-2.5 py-1 rounded-full ${
          isRecommended ? "text-white bg-good" : BADGE[route.status] ?? "text-muted bg-[#ece8df]"
        }`}
      >
        {translateStatus(route.status)}
      </span>

      <h3 className="text-lg font-bold text-ink m-0 leading-tight">{title}</h3>
      <p className="text-xs text-subtle mt-0.5 mb-0 min-h-[1rem]">{subtitle ?? " "}</p>
      <p className="text-sm text-muted mt-2 mb-4 leading-snug min-h-[2.5rem]">{describeRoute(route, allRoutes)}</p>

      <div className="mb-4">
        <div className="flex items-baseline gap-1.5">
          <span className="font-heading font-bold text-3xl text-ink">{formatDays(Number(days.toFixed(1)))}</span>
          <span className="text-sm text-muted">{m ? "days on average" : "days with no delays"}</span>
        </div>
        <div
          className="h-2 bg-[#efece5] rounded-full my-2 overflow-hidden"
          role="img"
          aria-label={`${formatDays(Number(days.toFixed(1)))} of ${formatDays(deadlineDays)} days allowed`}
        >
          <div className="grow h-full rounded-full" style={{ width: `${pctOfDeadline}%`, backgroundColor: color }} />
        </div>
        <p className="text-xs text-subtle m-0">Deadline: {formatDays(deadlineDays)} days</p>
      </div>

      {reason && (
        <p className="mt-0 mb-4 p-3 rounded-xl bg-paper border border-line text-xs text-ink leading-relaxed">
          <strong className="font-semibold">Why not: </strong>
          {reason}
        </p>
      )}

      <dl className="mt-auto pt-4 border-t border-line grid grid-cols-2 gap-x-3 gap-y-3 text-xs mx-0 mb-0">
        <div>
          <dt className="text-subtle">Ticket price</dt>
          <dd className="m-0 mt-0.5 font-bold text-ink text-sm">{formatMoney(route.freight_usd)}</dd>
        </div>
        {m ? (
          <>
            <div>
              <dt className="text-subtle">Chance of trouble</dt>
              <dd className="m-0 mt-0.5 font-bold text-ink text-sm">{formatPercent(m.p_disruption, 1)}</dd>
            </div>
            <div>
              <dt className="text-subtle">Usual total cost</dt>
              <dd className="m-0 mt-0.5 font-bold text-ink text-sm">{formatMoney(m.exp_total)}</dd>
            </div>
            <div>
              <dt className="text-subtle">Bad-luck cost</dt>
              <dd className="m-0 mt-0.5 font-bold text-ink text-sm">{formatMoney(m.cvar_total)}</dd>
            </div>
            <div>
              <dt className="text-subtle">On time</dt>
              <dd className="m-0 mt-0.5 font-bold text-ink text-sm">{formatPercent(m.p_on_time)}</dd>
            </div>
            <div>
              <dt className="text-subtle">Pollution</dt>
              <dd className="m-0 mt-0.5 font-bold text-ink text-sm">{m.co2_tonnes.toFixed(2)} t CO2</dd>
            </div>
          </>
        ) : (
          <div>
            <dt className="text-subtle">Tested</dt>
            <dd className="m-0 mt-0.5 font-bold text-ink text-sm">No, it breaks a rule</dd>
          </div>
        )}
      </dl>
    </article>
  );
}
