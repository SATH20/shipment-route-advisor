"use client";

import React from "react";
import { formatDays, formatMoney, translateRouteName } from "@/lib/words";
import { getRouteColor } from "./RouteMap";

export interface ScenarioState {
  activeEvents: string[];
  penalty: number;
  deadlineShift: number;
  carbonPrice: number;
}

interface WhatIfScenariosProps {
  basePickName: string | null;
  currentPickName: string | null;
  scenarioState: ScenarioState;
  onChangeScenario: (state: ScenarioState) => void;
  onReset: () => void;
  defaultPenalty: number;
}

const EVENTS = [
  {
    id: "Red Sea crisis",
    title: "Trouble in the Red Sea",
    description: "Ships passing the Red Sea face more attacks and delays.",
  },
  {
    id: "Air capacity crunch",
    title: "Plane tickets cost 80% more",
    description: "A squeeze on air cargo capacity drives rates up.",
  },
  {
    id: "Hub congestion spike",
    title: "Transshipment hubs clogged",
    description: "Major container transfer ports see heavy delays and backlog.",
  },
  {
    id: "Red Sea reopens",
    title: "Red Sea routes reopen",
    description: "Tensions ease and ships return safely to the Suez Canal.",
  },
];

export default function WhatIfScenarios({
  basePickName,
  currentPickName,
  scenarioState,
  onChangeScenario,
  onReset,
  defaultPenalty,
}: WhatIfScenariosProps) {
  const toggleEvent = (eventId: string) => {
    const isChecked = scenarioState.activeEvents.includes(eventId);
    const newEvents = isChecked
      ? scenarioState.activeEvents.filter((e) => e !== eventId)
      : [...scenarioState.activeEvents, eventId];
    onChangeScenario({
      ...scenarioState,
      activeEvents: newEvents,
    });
  };

  const hasModifications =
    scenarioState.activeEvents.length > 0 ||
    scenarioState.penalty !== defaultPenalty ||
    scenarioState.deadlineShift !== 0 ||
    scenarioState.carbonPrice !== 90;

  const baseTitle = basePickName
    ? translateRouteName(basePickName).title
    : "No route";
  const currentTitle = currentPickName
    ? translateRouteName(currentPickName).title
    : "No route";
  const pickColor = currentPickName ? getRouteColor(currentPickName) : "#1d4ed8";
  const isChanged = basePickName !== currentPickName;

  return (
    <section className="bg-card border border-line rounded-3xl p-7 md:p-9 shadow-sm mt-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full bg-ink text-white font-bold text-xs flex items-center justify-center">
            4
          </span>
          <h2 className="text-xl md:text-2xl font-bold text-ink m-0">
            Try it yourself
          </h2>
        </div>

        {hasModifications && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-semibold text-accent hover:text-ink underline min-h-[44px] flex items-center cursor-pointer"
          >
            Reset all changes
          </button>
        )}
      </div>

      <p className="text-sm md:text-base text-muted mt-2 mb-6">
        Something happens in the world. Does our pick change?
      </p>

      {/* Event Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {EVENTS.map((ev) => {
          const isActive = scenarioState.activeEvents.includes(ev.id);
          return (
            <button
              key={ev.id}
              type="button"
              onClick={() => toggleEvent(ev.id)}
              aria-pressed={isActive}
              className={`text-left p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between min-h-[120px] ${
                isActive
                  ? "border-accent bg-accent/5 shadow-sm"
                  : "border-line bg-card hover:border-muted/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2 w-full">
                <span className="text-[15px] font-bold text-ink leading-snug">
                  {ev.title}
                </span>
                <span
                  className={`w-10 h-5 rounded-full p-0.5 flex items-center transition-colors ${
                    isActive ? "bg-accent justify-end" : "bg-[#d6d1c6] justify-start"
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                </span>
              </div>
              <span className="text-xs text-muted mt-2 leading-relaxed">
                {ev.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sliders */}
      <div className="mt-8 pt-6 border-t border-line grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Late Day Penalty Slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-muted">Late-day penalty</span>
            <span className="text-ink">{formatMoney(scenarioState.penalty)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(2000, defaultPenalty * 3)}
            step={50}
            value={scenarioState.penalty}
            onChange={(e) =>
              onChangeScenario({
                ...scenarioState,
                penalty: Number(e.target.value),
              })
            }
            className="w-full accent-accent cursor-pointer"
            aria-label="Late-day penalty slider"
          />
        </div>

        {/* Deadline Shift Slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-muted">Deadline change</span>
            <span className="text-ink">
              {scenarioState.deadlineShift > 0
                ? `+${formatDays(scenarioState.deadlineShift)} days`
                : scenarioState.deadlineShift < 0
                ? `${formatDays(scenarioState.deadlineShift)} days`
                : "No change"}
            </span>
          </div>
          <input
            type="range"
            min={-10}
            max={10}
            step={0.5}
            value={scenarioState.deadlineShift}
            onChange={(e) =>
              onChangeScenario({
                ...scenarioState,
                deadlineShift: Number(e.target.value),
              })
            }
            className="w-full accent-accent cursor-pointer"
            aria-label="Deadline shift slider"
          />
        </div>

        {/* Carbon Price Slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-muted">Price on pollution</span>
            <span className="text-ink">
              {formatMoney(scenarioState.carbonPrice)} / t CO2
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={500}
            step={10}
            value={scenarioState.carbonPrice}
            onChange={(e) =>
              onChangeScenario({
                ...scenarioState,
                carbonPrice: Number(e.target.value),
              })
            }
            className="w-full accent-accent cursor-pointer"
            aria-label="Pollution price slider"
          />
        </div>
      </div>

      {/* Dynamic Pick Result Notice */}
      <div className="mt-7 flex flex-wrap items-center gap-3 p-4 bg-paper rounded-2xl border border-line">
        <span className="text-sm font-medium text-muted">Our pick now:</span>
        <span
          className="text-sm font-bold text-white px-3.5 py-1.5 rounded-full shadow-sm"
          style={{ backgroundColor: pickColor }}
        >
          {currentTitle}
        </span>
        <span className="text-xs md:text-sm text-muted">
          {isChanged
            ? `Changed! Switched from ${baseTitle} to ${currentTitle} due to new world conditions.`
            : hasModifications
            ? "Same pick as before. The engine re-ran all 5,000 trips with the new conditions."
            : "Turn on a change above to see if the pick moves."}
        </span>
      </div>
    </section>
  );
}
