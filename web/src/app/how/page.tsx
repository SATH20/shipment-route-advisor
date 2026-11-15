"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchShipment } from "@/lib/api";
import { ShipmentDetail } from "@/lib/types";
import {
  formatCount,
  formatMoney,
  formatPercent,
  oneIn,
  plainReason,
  translateRouteName,
} from "@/lib/words";
import { HowPageSkeleton, ErrorBox } from "@/components/PageSkeletons";

const EXAMPLE_SHIPMENT = "S020";

const COST_PARTS = [
  { key: "ticket", label: "Ticket", color: "#1d4ed8" },
  { key: "late", label: "Late fees", color: "#b45309" },
  { key: "loss", label: "Money lost to trouble", color: "#b42318" },
  { key: "carbon", label: "Pollution price", color: "#15803d" },
] as const;

function Step({
  n,
  title,
  text,
  children,
  icon,
}: {
  n: number;
  title: string;
  text: React.ReactNode;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <section className="bg-card border border-line rounded-3xl p-6 md:p-8 shadow-sm" aria-labelledby={`step-${n}`}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-ocean flex items-center justify-center flex-none text-accent" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {icon}
          </svg>
        </div>
        <div className="min-w-0">
          <h2 id={`step-${n}`} className="text-xl md:text-2xl font-bold text-ink m-0">
            {n}. {title}
          </h2>
          <p className="text-base text-muted mt-2 mb-0 leading-relaxed">{text}</p>
        </div>
      </div>
      <div className="mt-6 pt-5 border-t border-line">{children}</div>
    </section>
  );
}

function ExampleLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-accent mt-0 mb-3">{children}</p>;
}

export default function HowItDecidesPage() {
  const [detail, setDetail] = useState<ShipmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchShipment(EXAMPLE_SHIPMENT)
      .then(setDetail)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !detail) return <ErrorBox message={error} onRetry={load} />;
  if (!detail) return <HowPageSkeleton />;

  const { routes, confidence, shipment, settings } = detail;
  const pick = routes.find((r) => r.id === detail.recommended_route_id) || null;
  const pickTitle = pick ? translateRouteName(pick.name, pick.passages).title : null;
  const notAllowed = routes.filter((r) => r.status === "not allowed");
  const dropped = routes.filter((r) => r.status === "fails reliability" || r.status === "dominated");
  const tested = routes.filter((r) => r.metrics);
  const safe = detail.mode === "play_safe";
  const worst = oneIn(settings.worst_share);
  const n = formatCount(settings.n_sims);
  const maxCost = Math.max(...tested.map((r) => r.metrics!.exp_total), 1);
  const exampleName = `${shipment.id}: ${shipment.cargo} from ${shipment.origin} to ${shipment.destination}`;

  return (
    <div className="space-y-10">
      <div className="rise">
        <p className="text-sm font-semibold tracking-wider uppercase text-accent mb-2">How it decides</p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-ink leading-tight">
          Five steps, every time
        </h1>
        <p className="mt-4 text-base md:text-lg text-muted max-w-2xl leading-relaxed">
          Every shipment goes through the same five steps. Below each step you can see what
          happened for one example shipment: {exampleName}.
        </p>
      </div>

      <Step
        n={1}
        title="Check the rules"
        text="Some ways are simply not allowed. Dangerous goods cannot fly. Some customers ban the Red Sea. Some tickets are over budget. Some ways are too slow even with no delays at all."
        icon={<><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><path d="M9 12l2 2 4-4" /></>}
      >
        <ExampleLabel>Example: {shipment.id}</ExampleLabel>
        {notAllowed.length === 0 ? (
          <p className="text-base text-ink m-0">All {routes.length} ways pass the rules for this shipment.</p>
        ) : (
          <ul className="text-base text-ink space-y-1 list-disc pl-5 m-0">
            {notAllowed.map((r) => (
              <li key={r.id}>
                <strong>{translateRouteName(r.name, r.passages).title}:</strong> {plainReason(r.reasons[0] ?? "")}
              </li>
            ))}
          </ul>
        )}
      </Step>

      <Step
        n={2}
        title={`Try each way ${n} times`}
        text={`The computer sends the shipment ${n} times on each way. Like rolling dice, some tries are delayed at ports and a few run into real trouble. This shows how often each way is on time. The odds are our best guesses, not facts.`}
        icon={<><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.2" /><circle cx="15.5" cy="15.5" r="1.2" /><circle cx="15.5" cy="8.5" r="1.2" /><circle cx="8.5" cy="15.5" r="1.2" /></>}
      >
        <ExampleLabel>Example: on time in how many tries?</ExampleLabel>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 list-none p-0 m-0">
          {routes.map((r) => (
            <li key={r.id} className="p-4 bg-paper rounded-xl border border-line flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">{translateRouteName(r.name, r.passages).title}</span>
              <span className="text-sm font-bold text-ink whitespace-nowrap">
                {r.metrics ? `${formatPercent(r.metrics.p_on_time)} on time` : "Not tried (breaks a rule)"}
              </span>
            </li>
          ))}
        </ul>
      </Step>

      <Step
        n={3}
        title="Drop the weak ways"
        text={
          shipment.min_on_time > 0
            ? `A way must be on time in at least ${formatPercent(shipment.min_on_time)} of tries for this cargo. We also drop a way if another way is as good or better on price, time, lateness, trouble and pollution.`
            : "This cargo has no on-time rule. We still drop a way if another way is as good or better on price, time, lateness, trouble and pollution."
        }
        icon={<><path d="M3 6h18" /><path d="M7 12h10" /><path d="M10 18h4" /></>}
      >
        <ExampleLabel>Example: {shipment.id}</ExampleLabel>
        {dropped.length === 0 ? (
          <p className="text-base text-ink m-0">
            None this time. Every way that passed the rules was on time often enough, and each one
            was best at something.
          </p>
        ) : (
          <ul className="text-base text-ink space-y-1 list-disc pl-5 m-0">
            {dropped.map((r) => (
              <li key={r.id}>
                <strong>{translateRouteName(r.name, r.passages).title}:</strong> {plainReason(r.reasons[0] ?? "")}
              </li>
            ))}
          </ul>
        )}
      </Step>

      <Step
        n={4}
        title="Add up the cost in dollars"
        text={
          <>
            The ticket, late fees, money lost when something goes wrong, and a price on pollution all
            become dollars. For most cargo the lowest <strong>usual total cost</strong> wins. For very
            valuable cargo we play it safe: the lowest <strong>bad-luck cost</strong> wins. That is the
            average of the worst {worst} tries.
          </>
        }
        icon={<><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.7 0-2.5 1-2.5 2s1 1.6 2.5 2 2.5 1 2.5 2-1 2-2.5 2c-1.2 0-2.2-.6-2.6-1.6" /><path d="M12 6.5v1.5M12 16v1.5" /></>}
      >
        <ExampleLabel>Example: usual total cost of each way</ExampleLabel>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted mb-4 list-none p-0 m-0" aria-label="Colour key">
          {COST_PARTS.map((p) => (
            <li key={p.key} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: p.color }} aria-hidden="true" />
              {p.label}
            </li>
          ))}
        </ul>
        <div className="space-y-5">
          {tested.map((r) => {
            const m = r.metrics!;
            const parts = { ticket: r.freight_usd, late: m.exp_late_cost, loss: m.exp_loss, carbon: m.carbon_cost };
            const isPick = r.id === detail.recommended_route_id;
            return (
              <div key={r.id}>
                <div className="flex flex-wrap justify-between gap-x-4 text-sm font-bold text-ink mb-1">
                  <span>
                    {translateRouteName(r.name, r.passages).title}
                    {isPick && <span className="ml-2 text-xs font-bold text-good bg-[#eef8f1] px-2 py-0.5 rounded-full">Our pick</span>}
                  </span>
                  <span>
                    Usual {formatMoney(m.exp_total)}
                    <span className="font-medium text-muted"> | Bad luck {formatMoney(m.cvar_total)}</span>
                  </span>
                </div>
                <div className="h-5 bg-[#efece5] rounded-lg overflow-hidden flex" style={{ width: `${Math.max(2, (m.exp_total / maxCost) * 100)}%` }} aria-hidden="true">
                  {COST_PARTS.map((p) =>
                    parts[p.key] > 0 ? (
                      <div key={p.key} className="h-full" style={{ width: `${(parts[p.key] / m.exp_total) * 100}%`, backgroundColor: p.color }} />
                    ) : null
                  )}
                </div>
                <p className="text-xs text-muted mt-1 mb-0">
                  {COST_PARTS.map((p) => `${p.label} ${formatMoney(parts[p.key])}`).join(", ")}
                </p>
              </div>
            );
          })}
        </div>
        {pick?.metrics && (
          <p className="mt-5 mb-0 text-base text-ink leading-relaxed">
            {safe
              ? `This cargo is very valuable, so we play it safe. ${pickTitle} has the lowest bad-luck cost (${formatMoney(pick.metrics.cvar_total)}), even though its usual cost is ${formatMoney(pick.metrics.exp_total)}.`
              : `${pickTitle} has the lowest usual total cost (${formatMoney(pick.metrics.exp_total)}) of the ways left after step 3.`}
          </p>
        )}
      </Step>

      <Step
        n={5}
        title="Double-check"
        text={`Our guesses about delays and trouble could be wrong. So we change them by about ${formatPercent(settings.estimate_noise)} and pick again, ${confidence ? confidence.runs : "many"} times. If the same way wins almost every time, we are sure.`}
        icon={<><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>}
      >
        <ExampleLabel>Example: {shipment.id}</ExampleLabel>
        {confidence ? (
          <p className="text-base text-ink m-0">
            <strong>
              {Math.round(confidence.agreement * confidence.runs)} of {confidence.runs} checks
            </strong>{" "}
            picked {pickTitle} again. We call that <strong>{confidence.label.toLowerCase()}</strong> confidence.
          </p>
        ) : (
          <p className="text-base text-ink m-0">No check was made because no way could be recommended.</p>
        )}
        <p className="text-sm text-muted mt-4 mb-0">
          Want to see this for another shipment?{" "}
          <Link href="/" className="text-accent font-semibold underline">
            Plan a shipment
          </Link>
        </p>
      </Step>
    </div>
  );
}
