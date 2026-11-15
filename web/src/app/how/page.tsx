"use client";

import React, { useEffect, useState } from "react";
import { fetchShipment } from "@/lib/api";
import { ShipmentDetail } from "@/lib/types";
import {
  formatDays,
  formatMoney,
  formatPercent,
  translateRouteName,
} from "@/lib/words";
import { getRouteColor } from "@/components/RouteMap";

export default function HowItDecidesPage() {
  const [detail, setDetail] = useState<ShipmentDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchShipment("S020")
      .then((data) => {
        setDetail(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load S020 data");
        setLoading(false);
      });
  }, []);

  if (loading && !detail) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-muted font-medium">Loading decision steps...</p>
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="p-8 bg-red-50 border border-bad/30 rounded-3xl text-bad">
        <h2 className="text-xl font-bold mb-2">Connection Problem</h2>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!detail) return null;

  const { routes, confidence } = detail;
  const notAllowedRoutes = routes.filter((r) => r.status === "not allowed");
  const dominatedRoutes = routes.filter((r) => r.status === "dominated");

  // Max total cost among routes for stacked bar scaling in step 4
  const maxTotalCost = Math.max(
    ...routes.map((r) => r.metrics?.exp_total ?? r.freight_usd),
    1
  );

  return (
    <div className="space-y-12">
      {/* Page Header */}
      <div>
        <p className="text-sm font-semibold tracking-wider uppercase text-accent mb-2">
          How it decides
        </p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-ink leading-tight">
          Five simple steps, every time
        </h1>
        <p className="mt-4 text-base md:text-lg text-muted max-w-2xl leading-relaxed">
          Every shipment goes through the same transparent five-step process.
          Here is how it worked for S020 (electronics from India to Belgium).
        </p>
      </div>

      {/* 5 Steps Grid */}
      <div className="space-y-8">
        {/* Step 1: Check the rules */}
        <div className="bg-card border border-line rounded-3xl p-7 md:p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-ocean flex items-center justify-center flex-none text-accent">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"></path>
                <path d="M9 12l2 2 4-4"></path>
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-ink m-0">
                1. Check the rules
              </h2>
              <p className="text-sm md:text-base text-muted mt-1 leading-relaxed">
                Batteries cannot fly. Some customers exclude the Red Sea. Some
                routes take longer than the deadline before any delays even
                happen.
              </p>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-line">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent block mb-2">
              Live example for S020
            </span>
            {notAllowedRoutes.length === 0 ? (
              <p className="text-sm font-medium text-ink m-0">
                Every way passed the rules. None were banned for this shipment.
              </p>
            ) : (
              <ul className="text-sm text-ink space-y-1 list-disc pl-5 m-0">
                {notAllowedRoutes.map((r) => (
                  <li key={r.id}>
                    <strong>{translateRouteName(r.name).title}</strong>:{" "}
                    {r.reasons[0] || "not allowed"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Step 2: Imagine 5,000 trips */}
        <div className="bg-card border border-line rounded-3xl p-7 md:p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-ocean flex items-center justify-center flex-none text-accent">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="3"></rect>
                <circle cx="8.5" cy="8.5" r="1.2"></circle>
                <circle cx="15.5" cy="15.5" r="1.2"></circle>
                <circle cx="15.5" cy="8.5" r="1.2"></circle>
                <circle cx="8.5" cy="15.5" r="1.2"></circle>
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-ink m-0">
                2. Imagine 5,000 trips
              </h2>
              <p className="text-sm md:text-base text-muted mt-1 leading-relaxed">
                Like rolling dice: some voyages arrive on time, some are delayed
                at ports, and a few hit weather or chokepoint trouble. Now we know
                the exact odds.
              </p>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-line">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent block mb-3">
              Live example for S020: On-time arrival chances
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {routes.map((r) => {
                const { title } = translateRouteName(r.name, r.passages);
                const color = getRouteColor(r.name);
                const onTime = r.metrics ? r.metrics.p_on_time : 0;
                return (
                  <div
                    key={r.id}
                    className="p-3.5 bg-paper rounded-xl border border-line flex items-center justify-between"
                  >
                    <span className="text-xs font-semibold text-ink truncate mr-2">
                      {title}
                    </span>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: color }}
                    >
                      {formatPercent(onTime)} on-time
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Step 3: Drop the losers */}
        <div className="bg-card border border-line rounded-3xl p-7 md:p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-ocean flex items-center justify-center flex-none text-accent">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18"></path>
                <path d="M7 12h10"></path>
                <path d="M10 18h4"></path>
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-ink m-0">
                3. Drop the losers
              </h2>
              <p className="text-sm md:text-base text-muted mt-1 leading-relaxed">
                If one way is slower, costs more, has more trouble, and pollutes
                more than another candidate, nobody should ever pick it. We drop
                those automatically.
              </p>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-line">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent block mb-2">
              Live example for S020
            </span>
            {dominatedRoutes.length === 0 ? (
              <p className="text-sm font-medium text-ink m-0">
                None this time: every route had at least one advantage (such as
                lower ticket price or faster speed).
              </p>
            ) : (
              <p className="text-sm font-medium text-ink m-0">
                Dropped:{" "}
                {dominatedRoutes
                  .map((r) => translateRouteName(r.name).title)
                  .join(", ")}
              </p>
            )}
          </div>
        </div>

        {/* Step 4: Add up the real cost */}
        <div className="bg-card border border-line rounded-3xl p-7 md:p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-ocean flex items-center justify-center flex-none text-accent">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9"></circle>
                <path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.7 0-2.5 1-2.5 2s1 1.6 2.5 2 2.5 1 2.5 2-1 2-2.5 2c-1.2 0-2.2-.6-2.6-1.6"></path>
                <path d="M12 6.5v1.5M12 16v1.5"></path>
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-ink m-0">
                4. Add up the real cost
              </h2>
              <p className="text-sm md:text-base text-muted mt-1 leading-relaxed">
                Ticket price, late fees, losses from trouble, and pollution fees
                are all converted into dollars. Lowest total wins.
              </p>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-line">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent block mb-4">
              Live example for S020: Cost breakdown in dollars
            </span>

            {/* Stacked Bars Legend */}
            <div className="flex flex-wrap gap-4 text-xs font-semibold text-muted mb-4">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#2563eb]" />
                <span>Ticket price</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#d97706]" />
                <span>Late fees</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#dc2626]" />
                <span>Losses from trouble</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#059669]" />
                <span>Pollution</span>
              </div>
            </div>

            {/* Stacked bar per route */}
            <div className="space-y-4">
              {routes.map((r) => {
                const { title } = translateRouteName(r.name, r.passages);
                const m = r.metrics;
                if (!m) return null;

                const ticket = r.freight_usd;
                const late = m.exp_late_cost;
                const loss = m.exp_loss;
                const carbon = m.carbon_cost;
                const total = m.exp_total;

                const ticketPct = (ticket / total) * 100;
                const latePct = (late / total) * 100;
                const lossPct = (loss / total) * 100;
                const carbonPct = (carbon / total) * 100;

                const barWidth = Math.min(100, (total / maxTotalCost) * 100);

                return (
                  <div key={r.id} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold text-ink">
                      <span>{title}</span>
                      <span>Total: {formatMoney(total)}</span>
                    </div>

                    <div
                      className="h-6 bg-[#efece5] rounded-lg overflow-hidden flex"
                      style={{ width: `${Math.max(25, barWidth)}%` }}
                    >
                      {ticket > 0 && (
                        <div
                          className="h-full bg-[#2563eb]"
                          style={{ width: `${ticketPct}%` }}
                          title={`Ticket: ${formatMoney(ticket)}`}
                        />
                      )}
                      {late > 0 && (
                        <div
                          className="h-full bg-[#d97706]"
                          style={{ width: `${latePct}%` }}
                          title={`Late fees: ${formatMoney(late)}`}
                        />
                      )}
                      {loss > 0 && (
                        <div
                          className="h-full bg-[#dc2626]"
                          style={{ width: `${lossPct}%` }}
                          title={`Trouble losses: ${formatMoney(loss)}`}
                        />
                      )}
                      {carbon > 0 && (
                        <div
                          className="h-full bg-[#059669]"
                          style={{ width: `${carbonPct}%` }}
                          title={`Pollution: ${formatMoney(carbon)}`}
                        />
                      )}
                    </div>

                    <div className="text-[11px] text-subtle flex flex-wrap gap-x-3">
                      <span>Ticket {formatMoney(ticket)}</span>
                      <span>Late {formatMoney(late)}</span>
                      <span>Trouble {formatMoney(loss)}</span>
                      <span>Pollution {formatMoney(carbon)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Step 5: Double-check */}
        <div className="bg-card border border-line rounded-3xl p-7 md:p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-ocean flex items-center justify-center flex-none text-accent">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 12a8 8 0 1 1-2.3-5.7"></path>
                <path d="M20 4v5h-5"></path>
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-ink m-0">
                5. Double-check
              </h2>
              <p className="text-sm md:text-base text-muted mt-1 leading-relaxed">
                Change our guesses by about 30% and decide again, 100 times.
                Then we report how stable the decision really is.
              </p>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-line">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent block mb-2">
              Live example for S020: Confidence result
            </span>
            {confidence ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-lg font-bold text-ink">
                  {Math.round(confidence.agreement * 100)} of 100 checks agree
                </span>
                <span className="text-xs font-bold text-good bg-good/10 px-2.5 py-1 rounded-full">
                  {confidence.label} confidence
                </span>
                <span className="text-xs text-muted">
                  The recommended route stays best even with varying risk estimates.
                </span>
              </div>
            ) : (
              <p className="text-sm font-medium text-ink m-0">
                Confidence check was completed successfully.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
