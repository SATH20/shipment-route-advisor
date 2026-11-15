"use client";

import React from "react";
import { ShipmentMeta, ShipmentSummary } from "@/lib/types";
import { capitalize, formatDays, formatMoney } from "@/lib/words";

interface ShipmentHeaderProps {
  shipments: ShipmentSummary[];
  selectedId: string;
  onSelectShipment: (id: string) => void;
  shipment: ShipmentMeta | null; // null while the chosen shipment loads
  changed?: boolean; // true when step 4 has changed the deadline or late fee
}

const PROFILE_CHIP: Record<string, { text: string; cls: string }> = {
  high_value: { text: "Very valuable cargo: we guard against bad luck", cls: "text-[#6d28d9] bg-[#f3edff]" },
  express: { text: "Urgent cargo: lateness is expensive", cls: "text-[#b45309] bg-[#fef3c7]" },
  standard: { text: "Normal cargo: a balance of price and time", cls: "text-accent bg-[#eef2fb]" },
  budget: { text: "Low-cost cargo: price matters most", cls: "text-accent bg-[#eef2fb]" },
};

export default function ShipmentHeader({
  shipments,
  selectedId,
  onSelectShipment,
  shipment,
  changed = false,
}: ShipmentHeaderProps) {
  const chip = shipment ? PROFILE_CHIP[shipment.profile] : null;

  return (
    <section className="bg-card border border-line rounded-3xl p-6 md:p-8 shadow-sm" aria-labelledby="shipment-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-ink text-white font-bold text-xs flex items-center justify-center" aria-hidden="true">
            1
          </span>
          <h2 id="shipment-title" className="text-xl md:text-2xl font-bold text-ink m-0">
            The shipment
          </h2>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <label htmlFor="shipment-select" className="flex-none text-sm font-medium text-muted">
            Choose a shipment
          </label>
          <select
            id="shipment-select"
            value={selectedId}
            onChange={(e) => onSelectShipment(e.target.value)}
            disabled={shipments.length === 0}
            className="text-[15px] font-medium text-ink px-3.5 py-2.5 border border-line rounded-xl bg-[#fbfaf7] hover:border-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-accent min-h-[44px] cursor-pointer w-full sm:w-auto max-w-full"
          >
            {shipments.length === 0 && <option value={selectedId}>{selectedId}</option>}
            {shipments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}: {capitalize(s.cargo)}, {s.origin} to {s.destination}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!shipment ? (
        <div className="mt-5 space-y-3 animate-pulse motion-reduce:animate-none" aria-hidden="true">
          <div className="h-6 w-5/6 bg-[#ece8df] rounded-full" />
          <div className="h-6 w-2/3 bg-[#ece8df] rounded-full" />
        </div>
      ) : (
        <>
          <p className="mt-5 text-lg md:text-2xl font-medium leading-relaxed text-ink max-w-4xl">
            Send <strong>{shipment.weight_kg.toLocaleString("en-US")} kg of {shipment.cargo}</strong>{" "}
            worth <strong>{formatMoney(shipment.value_usd)}</strong> from{" "}
            <strong>{shipment.origin}</strong> to <strong>{shipment.destination}</strong>. It must
            arrive within <strong>{formatDays(shipment.deadline_days)} days</strong>, and each day
            late costs <strong>{formatMoney(shipment.penalty_per_day)}</strong>.
          </p>
          {changed && (
            <p className="mt-2 mb-0 text-sm text-muted">These numbers include your changes in step 4.</p>
          )}

          <ul className="mt-5 flex flex-wrap gap-2 text-xs md:text-sm font-semibold list-none p-0 m-0" aria-label="Rules for this shipment">
            {chip && <li className={`px-3 py-1.5 rounded-full ${chip.cls}`}>{chip.text}</li>}
            {shipment.min_on_time > 0 && (
              <li className="text-[#0f5132] bg-[#e8f5ee] px-3 py-1.5 rounded-full">
                Must be on time in at least {Math.round(shipment.min_on_time * 100)}% of trips
              </li>
            )}
            {shipment.hazardous && (
              <li className="text-bad bg-[#fff3f1] px-3 py-1.5 rounded-full">
                Dangerous goods: no planes
              </li>
            )}
            {shipment.avoid_regions.map((r) => (
              <li key={r} className="text-bad bg-[#fff3f1] px-3 py-1.5 rounded-full">
                Not through the {r.split("_").map(capitalize).join(" ")}
              </li>
            ))}
            {shipment.budget_usd !== null && (
              <li className="text-accent bg-[#eef2fb] px-3 py-1.5 rounded-full">
                Ticket budget: {formatMoney(shipment.budget_usd)}
              </li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}
