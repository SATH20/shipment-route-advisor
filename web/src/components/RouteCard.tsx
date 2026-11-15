"use client";

import React from "react";
import { RouteItem } from "@/lib/types";
import {
  describeRoute,
  formatDays,
  formatMoney,
  formatPercent,
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

export default function RouteCard({
  route,
  allRoutes,
  isRecommended,
  deadlineDays,
}: RouteCardProps) {
  const { title, subtitle } = translateRouteName(route.name, route.passages);
  const description = describeRoute(route, allRoutes);
  const color = getRouteColor(route.name);
  const isNotAllowed = route.status === "not allowed" || route.metrics === null;

  const m = route.metrics;
  const days = m ? m.mean_days : route.planned_days;
  const pctOfDeadline = Math.min(100, Math.max(5, (days / deadlineDays) * 100));

  // Determine border and highlight styling
  const borderStyle = isRecommended
    ? "border-good ring-2 ring-good/20 shadow-md"
    : "border-line/80 hover:border-line";

  return (
    <article
      className={`lift relative rounded-2xl p-5 bg-card border-2 transition-all flex flex-col justify-between ${borderStyle}`}
    >
      {/* Floating status badge */}
      {isRecommended ? (
        <span className="absolute -top-3 left-4 text-xs font-bold text-white bg-good px-2.5 py-1 rounded-full shadow-sm">
          Our pick
        </span>
      ) : (
        <span
          className={`absolute -top-2.5 left-4 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            route.status === "candidate"
              ? "text-accent bg-accent/10"
              : route.status === "dominated"
              ? "text-subtle bg-gray-100"
              : "text-bad bg-bad/10"
          }`}
        >
          {translateStatus(route.status)}
        </span>
      )}

      {/* Header */}
      <div>
        <div className="flex items-baseline justify-between gap-2 mt-1">
          <h3 className="text-lg font-bold text-ink m-0 leading-tight">
            {title}
          </h3>
          {subtitle && (
            <span className="text-xs text-subtle font-medium truncate">
              {subtitle}
            </span>
          )}
        </div>
        <p className="text-[13px] text-muted mt-1 mb-3.5 leading-snug">
          {description}
        </p>
      </div>

      {/* Days & Deadline bar */}
      <div className="my-2">
        <div className="flex items-baseline gap-1.5">
          <span className="font-heading font-bold text-3xl text-ink">
            {formatDays(days)}
          </span>
          <span className="text-sm text-muted">
            {m ? "days average" : "days planned"}
          </span>
        </div>

        {/* Progress bar vs deadline */}
        <div className="h-2 bg-[#efece5] rounded-full my-2 overflow-hidden">
          <div
            className="grow h-full rounded-full transition-all duration-700"
            style={{
              width: `${pctOfDeadline}%`,
              backgroundColor: color,
            }}
          />
        </div>
        <p className="text-[11px] text-subtle m-0">
          Deadline: {deadlineDays} days
        </p>
      </div>

      {/* Metrics or Rejection Notice */}
      {isNotAllowed || !m ? (
        <div className="mt-3 p-3.5 bg-gray-50 border border-line rounded-xl text-xs text-muted leading-relaxed">
          <p className="font-semibold text-ink mb-1">Not eligible:</p>
          <p className="m-0">
            {route.reasons && route.reasons.length > 0
              ? route.reasons[0]
              : "This route cannot meet shipment requirements."}
          </p>
          <div className="mt-2 pt-2 border-t border-line/60 flex justify-between text-subtle">
            <span>Ticket price</span>
            <span className="font-medium text-ink">
              {formatMoney(route.freight_usd)}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-3 pt-3 border-t border-line/60">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs m-0">
            <div>
              <dt className="text-subtle">Ticket price</dt>
              <dd className="m-0 mt-0.5 font-bold text-ink text-[13px]">
                {formatMoney(route.freight_usd)}
              </dd>
            </div>
            <div>
              <dt className="text-subtle">Chance of trouble</dt>
              <dd
                className={`m-0 mt-0.5 font-bold text-[13px] ${
                  m.p_disruption > 0.04 ? "text-bad" : "text-ink"
                }`}
              >
                {formatPercent(m.p_disruption, 1)}
              </dd>
            </div>
            <div>
              <dt className="text-subtle">Usual total cost</dt>
              <dd className="m-0 mt-0.5 font-bold text-ink text-[13px]">
                {formatMoney(m.exp_total)}
              </dd>
            </div>
            <div>
              <dt className="text-subtle">Bad-luck cost</dt>
              <dd
                className={`m-0 mt-0.5 font-bold text-[13px] ${
                  m.cvar_total > m.exp_total * 2 ? "text-bad" : "text-ink"
                }`}
              >
                {formatMoney(m.cvar_total)}
              </dd>
            </div>
          </dl>

          <p className="text-[11px] text-subtle mt-3 mb-0 pt-2 border-t border-line/40 flex justify-between">
            <span>Pollution:</span>
            <span className="font-medium text-muted">
              {m.co2_tonnes.toFixed(2)} t CO2
            </span>
          </p>
        </div>
      )}
    </article>
  );
}
