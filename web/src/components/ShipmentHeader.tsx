"use client";

import React from "react";
import { ShipmentMeta, ShipmentSummary } from "@/lib/types";
import { formatDays, formatMoney, translateProfile } from "@/lib/words";

interface ShipmentHeaderProps {
  shipments: ShipmentSummary[];
  selectedId: string;
  onSelectShipment: (id: string) => void;
  shipment: ShipmentMeta;
}

export default function ShipmentHeader({
  shipments,
  selectedId,
  onSelectShipment,
  shipment,
}: ShipmentHeaderProps) {
  const isHighValue = shipment.profile === "high_value";
  const isExpress = shipment.profile === "express";

  let profileDescription = `${translateProfile(shipment.profile)} cargo`;
  if (isHighValue) {
    profileDescription = "Very valuable cargo: we protect against bad luck";
  } else if (isExpress) {
    profileDescription = "Urgent cargo: priority delivery required";
  } else if (shipment.profile === "budget") {
    profileDescription = "Budget cargo: keeping costs low";
  }

  return (
    <section className="bg-card border border-line rounded-3xl p-7 md:p-8 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full bg-ink text-white font-bold text-xs flex items-center justify-center">
            1
          </span>
          <h2 className="text-xl md:text-2xl font-bold text-ink m-0">
            The shipment
          </h2>
        </div>

        <label className="flex items-center gap-3 text-sm font-medium text-muted">
          <span>Shipment</span>
          <select
            value={selectedId}
            onChange={(e) => onSelectShipment(e.target.value)}
            className="text-[15px] font-medium text-ink px-3.5 py-2.5 border border-line rounded-xl bg-[#fbfaf7] hover:border-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/40 min-h-[44px] cursor-pointer"
            aria-label="Select shipment"
          >
            {shipments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} - {s.cargo.charAt(0).toUpperCase() + s.cargo.slice(1)},{" "}
                {s.origin} to {s.destination}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Dynamic plain sentence */}
      <p className="mt-5 text-xl md:text-2xl font-medium leading-relaxed text-ink max-w-4xl">
        Send <strong>{shipment.weight_kg.toLocaleString()} kg of {shipment.cargo}</strong>{" "}
        worth <strong>{formatMoney(shipment.value_usd)}</strong> from{" "}
        <strong>{shipment.origin}</strong> to <strong>{shipment.destination}</strong>. It must
        arrive within <strong>{formatDays(shipment.deadline_days)} days</strong>, and every day
        late costs <strong>{formatMoney(shipment.penalty_per_day)}</strong>.
      </p>

      {/* Chips */}
      <div className="mt-5 flex flex-wrap gap-2 text-xs md:text-sm font-semibold">
        <span
          className={`px-3 py-1.5 rounded-full ${
            isHighValue
              ? "text-[#6d28d9] bg-[#f3edff]"
              : isExpress
              ? "text-[#b45309] bg-[#fef3c7]"
              : "text-accent bg-accent/10"
          }`}
        >
          {profileDescription}
        </span>

        {shipment.min_on_time > 0 && (
          <span className="text-[#0f5132] bg-[#e8f5ee] px-3 py-1.5 rounded-full">
            Must arrive on time in at least {Math.round(shipment.min_on_time * 100)}% of trips
          </span>
        )}

        {shipment.hazardous && (
          <span className="text-[#b42318] bg-[#fee4e2] px-3 py-1.5 rounded-full">
            Batteries can&apos;t fly
          </span>
        )}

        {shipment.avoid_regions.includes("red_sea") && (
          <span className="text-[#b42318] bg-[#fee4e2] px-3 py-1.5 rounded-full">
            No Red Sea
          </span>
        )}

        {shipment.budget_usd && (
          <span className="text-[#026aa2] bg-[#f0f9ff] px-3 py-1.5 rounded-full">
            Freight budget: {formatMoney(shipment.budget_usd)}
          </span>
        )}
      </div>
    </section>
  );
}
