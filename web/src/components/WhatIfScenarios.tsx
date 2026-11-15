"use client";

import React from "react";
import { ShipmentDetail, WorldEvent } from "@/lib/types";
import {
  formatCount,
  formatDays,
  formatMoney,
  oneIn,
  plainReason,
  translateRouteName,
} from "@/lib/words";
import { getRouteColor } from "./RouteMap";

export interface ScenarioState {
  activeEvents: string[];
  penalty: number;
  deadlineShift: number;
  carbonPrice: number;
}

interface WhatIfScenariosProps {
  events: WorldEvent[];
  base: ShipmentDetail; // this shipment, same mode, no changes
  current: ShipmentDetail; // with the user's changes
  scenarioState: ScenarioState;
  onChangeScenario: (state: ScenarioState) => void;
  onReset: () => void;
  hasChanges: boolean;
}

// Slider ranges are multiples of the shipment's own value, so the default sits exactly on a step.
const STEPS_PER_DEFAULT = 10;
const MAX_MULTIPLE_PENALTY = 4;
const MAX_MULTIPLE_CARBON = 5;

function Slider({
  id,
  label,
  valueText,
  min,
  max,
  step,
  value,
  onChange,
}: {
  id: string;
  label: string;
  valueText: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between gap-3 text-sm font-semibold">
        <label htmlFor={id} className="text-muted">
          {label}
        </label>
        <output htmlFor={id} className="text-ink whitespace-nowrap">
          {valueText}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent cursor-pointer h-11"
      />
    </div>
  );
}

export default function WhatIfScenarios({
  events,
  base,
  current,
  scenarioState,
  onChangeScenario,
  onReset,
  hasChanges,
}: WhatIfScenariosProps) {
  const settings = current.settings;
  const defaultPenalty = base.shipment.penalty_per_day;
  const defaultCarbon = settings.default_carbon_price;
  const penaltyStep = Math.max(defaultPenalty, 1) / STEPS_PER_DEFAULT;
  const penaltyMax = Math.max(defaultPenalty, 1) * MAX_MULTIPLE_PENALTY;
  const carbonStep = defaultCarbon / STEPS_PER_DEFAULT;
  const carbonMax = defaultCarbon * MAX_MULTIPLE_CARBON;

  const toggleEvent = (id: string) => {
    const on = scenarioState.activeEvents.includes(id);
    onChangeScenario({
      ...scenarioState,
      activeEvents: on
        ? scenarioState.activeEvents.filter((e) => e !== id)
        : [...scenarioState.activeEvents, id],
    });
  };

  const oldPick = base.routes.find((r) => r.id === base.recommended_route_id) || null;
  const newPick = current.routes.find((r) => r.id === current.recommended_route_id) || null;
  const newTitle = newPick ? translateRouteName(newPick.name, newPick.passages).title : "No way";
  const changed = (oldPick?.id ?? null) !== (newPick?.id ?? null);

  let message: string;
  if (!newPick) {
    message = "No way passes all the rules any more. A person would need to plan this shipment.";
  } else if (changed && oldPick) {
    const oldTitle = translateRouteName(oldPick.name, oldPick.passages).title;
    const oldNow = current.routes.find((r) => r.id === oldPick.id);
    const reason = oldNow && oldNow.reasons.length ? plainReason(oldNow.reasons[0]) : null;
    if (oldNow && oldNow.status !== "candidate" && reason) {
      message = `${oldTitle} is out now. ${reason}`;
    } else if (oldNow?.metrics && newPick.metrics) {
      const safe = current.mode === "play_safe";
      const a = safe ? newPick.metrics.cvar_total : newPick.metrics.exp_total;
      const b = safe ? oldNow.metrics.cvar_total : oldNow.metrics.exp_total;
      const what = safe ? `in the worst ${oneIn(settings.worst_share)} tries` : "on a usual trip";
      message = `It now costs about ${formatMoney(a)} ${what}, against ${formatMoney(b)} for ${oldTitle}.`;
    } else {
      message = `It replaces ${oldTitle}.`;
    }
  } else if (hasChanges) {
    message = `Same pick as before. We tried every way ${formatCount(settings.n_sims)} times again with your changes.`;
  } else {
    message = "Turn on a change above to see if the pick moves.";
  }

  return (
    <section className="bg-card border border-line rounded-3xl p-6 md:p-8 shadow-sm" aria-labelledby="whatif-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-ink text-white font-bold text-xs flex items-center justify-center" aria-hidden="true">
            4
          </span>
          <h2 id="whatif-title" className="text-xl md:text-2xl font-bold text-ink m-0">
            Try it yourself
          </h2>
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={!hasChanges}
          className="text-sm font-semibold text-accent hover:text-ink underline min-h-[44px] px-2 cursor-pointer disabled:text-subtle disabled:no-underline disabled:cursor-default"
        >
          Reset all changes
        </button>
      </div>

      <p className="text-sm md:text-base text-muted mt-2 mb-6">
        Something happens in the world, or the customer changes their mind. Does our pick change?
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {events.map((ev) => {
          const on = scenarioState.activeEvents.includes(ev.id);
          return (
            <button
              key={ev.id}
              type="button"
              onClick={() => toggleEvent(ev.id)}
              aria-pressed={on}
              className={`text-left p-4 rounded-2xl border-2 cursor-pointer flex flex-col gap-2 min-h-[44px] ${
                on ? "border-accent bg-[#f3f6ff]" : "border-line bg-card hover:border-subtle"
              }`}
            >
              <span className="flex items-start justify-between gap-3 w-full">
                <span className="text-base font-bold text-ink leading-snug">{ev.title}</span>
                <span
                  className={`flex-none w-10 h-6 rounded-full p-0.5 flex items-center ${
                    on ? "bg-accent justify-end" : "bg-[#d6d1c6] justify-start"
                  }`}
                  aria-hidden="true"
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
                </span>
              </span>
              <span className="text-sm text-muted leading-relaxed">{ev.description}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 pt-6 border-t border-line grid grid-cols-1 md:grid-cols-3 gap-6">
        <Slider
          id="slider-penalty"
          label="Cost of each late day"
          valueText={formatMoney(scenarioState.penalty)}
          min={0}
          max={penaltyMax}
          step={penaltyStep}
          value={scenarioState.penalty}
          onChange={(v) => onChangeScenario({ ...scenarioState, penalty: v })}
        />
        <Slider
          id="slider-deadline"
          label="Move the deadline"
          valueText={
            scenarioState.deadlineShift === 0
              ? "No change"
              : `${scenarioState.deadlineShift > 0 ? "+" : ""}${formatDays(scenarioState.deadlineShift)} days`
          }
          min={-10}
          max={10}
          step={0.5}
          value={scenarioState.deadlineShift}
          onChange={(v) => onChangeScenario({ ...scenarioState, deadlineShift: v })}
        />
        <Slider
          id="slider-carbon"
          label="Price of pollution"
          valueText={`${formatMoney(scenarioState.carbonPrice)} per tonne of CO2`}
          min={0}
          max={carbonMax}
          step={carbonStep}
          value={scenarioState.carbonPrice}
          onChange={(v) => onChangeScenario({ ...scenarioState, carbonPrice: v })}
        />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3 p-4 bg-paper rounded-2xl border border-line" aria-live="polite">
        <span className="text-sm font-medium text-muted">Our pick now:</span>
        <span className="inline-flex items-center gap-2 text-sm font-bold text-ink bg-card border border-line px-3.5 py-1.5 rounded-full">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: newPick ? getRouteColor(newPick.name) : "#4a5566" }}
            aria-hidden="true"
          />
          {newTitle}
        </span>
        <span className="text-sm text-muted min-w-0 flex-[1_1_240px]">{message}</span>
      </div>
    </section>
  );
}
