"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchEvents, fetchShipment, fetchShipments, FetchShipmentOptions } from "@/lib/api";
import { ShipmentDetail, ShipmentSummary, WorldEvent } from "@/lib/types";
import { formatCount, oneIn } from "@/lib/words";
import RouteCard from "@/components/RouteCard";
import RouteMap from "@/components/RouteMap";
import ShipmentHeader from "@/components/ShipmentHeader";
import RecommendationPanel from "@/components/RecommendationPanel";
import WhatIfScenarios, { ScenarioState } from "@/components/WhatIfScenarios";
import TripsHistogram from "@/components/TripsHistogram";
import { ErrorBox, SectionsSkeleton } from "@/components/PageSkeletons";

const DEFAULT_SHIPMENT = "S020";

function defaultsFrom(base: ShipmentDetail): ScenarioState {
  return {
    activeEvents: [],
    penalty: base.shipment.penalty_per_day,
    deadlineShift: 0,
    carbonPrice: base.settings.default_carbon_price,
  };
}

/** Only the inputs the user actually changed are sent, so the API keeps the full double-check. */
/** A slider counts as "at its default" even with tiny floating-point error from its steps. */
function sameValue(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
}

/**
 * Only the inputs the user actually changed are sent. With no changes the API runs the full
 * double-check (confidence and what would change our mind), so moving a slider back to its
 * default brings them back without pressing Reset.
 */
function changesFrom(state: ScenarioState, base: ShipmentDetail): FetchShipmentOptions {
  const d = defaultsFrom(base);
  const out: FetchShipmentOptions = {};
  if (state.activeEvents.length > 0) out.events = state.activeEvents.join(",");
  if (!sameValue(state.penalty, d.penalty)) out.penalty = state.penalty;
  if (!sameValue(state.deadlineShift, 0)) out.deadline_shift = state.deadlineShift;
  if (!sameValue(state.carbonPrice, d.carbonPrice)) out.carbon = state.carbonPrice;
  return out;
}

export default function PlanShipmentPage() {
  const [shipmentsList, setShipmentsList] = useState<ShipmentSummary[]>([]);
  const [events, setEvents] = useState<WorldEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_SHIPMENT);

  // base = this shipment in the chosen mode with no changes; current = with the user's changes
  const [baseDetail, setBaseDetail] = useState<ShipmentDetail | null>(null);
  const [currentDetail, setCurrentDetail] = useState<ShipmentDetail | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [scenario, setScenario] = useState<ScenarioState | null>(null);

  const [pending, setPending] = useState<boolean>(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const requestId = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    (id: string, targetMode: string | null, state: ScenarioState | null, base: ShipmentDetail | null) => {
      const myId = ++requestId.current;
      setPending(true);
      setRefreshError(null);
      const modeOpt = targetMode ? { mode: targetMode } : {};
      const basePromise =
        base && base.shipment.id === id && base.mode === targetMode
          ? Promise.resolve(base)
          : fetchShipment(id, modeOpt);
      basePromise
        .then((b) => {
          const changes = state ? changesFrom(state, b) : {};
          const current =
            Object.keys(changes).length > 0
              ? fetchShipment(id, { ...modeOpt, ...changes })
              : Promise.resolve(b);
          return Promise.all([b, current]);
        })
        .then(([b, cur]) => {
          if (myId !== requestId.current) return; // a newer request has started
          setBaseDetail(b);
          setCurrentDetail(cur);
          setMode(b.mode);
          if (!state) setScenario(defaultsFrom(b));
          setPending(false);
        })
        .catch((err: Error) => {
          if (myId !== requestId.current) return;
          setPending(false);
          if (!base) setFatalError(err.message);
          else setRefreshError(err.message);
        });
    },
    []
  );

  const loadLists = useCallback(() => {
    Promise.all([fetchShipments(), fetchEvents()])
      .then(([list, ev]) => {
        setShipmentsList(list);
        setEvents(ev);
      })
      .catch((err: Error) => setFatalError(err.message));
  }, []);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  // A new shipment starts from its own default mode and no changes.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    load(selectedId, null, null, null);
  }, [selectedId, load]);

  const handleModeChange = (newMode: string) => {
    if (newMode === mode) return;
    setMode(newMode);
    load(selectedId, newMode, scenario, baseDetail);
  };

  const handleScenarioChange = (next: ScenarioState) => {
    setScenario(next);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(selectedId, mode, next, baseDetail), 300);
  };

  const handleReset = () => {
    if (!baseDetail) return;
    if (debounce.current) clearTimeout(debounce.current);
    const d = defaultsFrom(baseDetail);
    setScenario(d);
    load(selectedId, mode, d, baseDetail);
  };

  const retry = () => {
    setFatalError(null);
    loadLists();
    load(selectedId, null, null, null);
  };

  if (fatalError && !currentDetail) {
    return <ErrorBox message={fatalError} onRetry={retry} />;
  }

  // Never show another shipment's numbers while the chosen one loads.
  const ready =
    currentDetail && baseDetail && scenario && currentDetail.shipment.id === selectedId;

  return (
    <div className="space-y-10">
      <section className="rise flex flex-wrap gap-8 items-end justify-between">
        <div className="flex-[1_1_520px] min-w-0">
          <p className="text-sm font-semibold tracking-wider uppercase text-accent mb-2">
            Step by step
          </p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-ink leading-tight">
            Which way should this shipment travel?
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted max-w-2xl leading-relaxed">
            A shipment can travel in a few ways. Some are cheap, some are fast,
            and some pass through dangerous waters. We try each way
            {ready ? ` ${formatCount(currentDetail.settings.n_sims)} times` : " many times"} on
            the computer and pick the one that makes the most sense for this cargo.
          </p>
        </div>

        <ol className="flex-[0_1_420px] list-none m-0 p-0 grid grid-cols-2 gap-3" aria-label="Steps on this page">
          {["The shipment", "The ways to send it", "Our pick, and why", "Try it yourself"].map(
            (label, i) => (
              <li key={label} className="bg-card border border-line rounded-2xl p-4">
                <span className="block text-xs text-subtle font-bold mb-1">{i + 1}</span>
                <span className="font-semibold text-sm text-ink">{label}</span>
              </li>
            )
          )}
        </ol>
      </section>

      <ShipmentHeader
        shipments={shipmentsList}
        selectedId={selectedId}
        onSelectShipment={setSelectedId}
        shipment={ready ? currentDetail.shipment : null}
        changed={ready ? Object.keys(changesFrom(scenario, baseDetail)).length > 0 : false}
      />

      <p className="sr-only" role="status" aria-live="polite">
        {pending ? "Updating the numbers" : ready ? "Numbers updated" : ""}
      </p>

      {refreshError && (
        <div role="alert" className="rounded-2xl border border-bad/40 bg-[#fff3f1] px-5 py-4 text-sm text-bad">
          We could not update the numbers: {refreshError} The numbers below are from before your last change.
        </div>
      )}

      {!ready ? (
        <SectionsSkeleton />
      ) : (
        <div
          aria-busy={pending}
          className={`space-y-10 transition-opacity duration-200 ${pending ? "opacity-60" : "opacity-100"}`}
        >
          <section className="bg-card border border-line rounded-3xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <span className="w-7 h-7 rounded-full bg-ink text-white font-bold text-xs flex items-center justify-center" aria-hidden="true">
                2
              </span>
              <h2 className="text-xl md:text-2xl font-bold text-ink m-0">
                {currentDetail.routes.length} ways to send it
              </h2>
            </div>
            <p className="text-sm md:text-base text-muted mb-6">
              Each line on the map is one way to go. The thick line is our pick.
            </p>

            <RouteMap
              routes={currentDetail.routes}
              recommendedId={currentDetail.recommended_route_id}
              origin={currentDetail.shipment.origin}
              destination={currentDetail.shipment.destination}
            />

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {currentDetail.routes.map((r) => (
                <RouteCard
                  key={r.id}
                  route={r}
                  allRoutes={currentDetail.routes}
                  isRecommended={r.id === currentDetail.recommended_route_id}
                  deadlineDays={currentDetail.shipment.deadline_days}
                />
              ))}
            </div>

            <p className="mt-6 text-xs text-subtle leading-relaxed border-t border-line pt-4">
              <strong className="text-muted">Usual total cost</strong> is the ticket, plus late
              fees, plus money lost when something goes wrong, plus a price on pollution. It is the
              average over {formatCount(currentDetail.settings.n_sims)} tries on the computer.{" "}
              <strong className="text-muted">Bad-luck cost</strong> is the average of the worst{" "}
              {oneIn(currentDetail.settings.worst_share)} of those tries.
            </p>
          </section>

          <RecommendationPanel
            detail={currentDetail}
            mode={mode ?? currentDetail.mode}
            onChangeMode={handleModeChange}
            hasChanges={Object.keys(changesFrom(scenario, baseDetail)).length > 0}
          />

          <WhatIfScenarios
            events={events}
            base={baseDetail}
            current={currentDetail}
            scenarioState={scenario}
            onChangeScenario={handleScenarioChange}
            onReset={handleReset}
            hasChanges={Object.keys(changesFrom(scenario, baseDetail)).length > 0}
          />

          <TripsHistogram
            routes={currentDetail.routes}
            deadlineDays={currentDetail.shipment.deadline_days}
            nSims={currentDetail.settings.n_sims}
          />
        </div>
      )}
    </div>
  );
}
