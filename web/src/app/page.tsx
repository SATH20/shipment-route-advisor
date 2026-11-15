"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchShipment, fetchShipments } from "@/lib/api";
import { ShipmentDetail, ShipmentSummary } from "@/lib/types";
import RouteCard from "@/components/RouteCard";
import RouteMap from "@/components/RouteMap";
import ShipmentHeader from "@/components/ShipmentHeader";
import RecommendationPanel from "@/components/RecommendationPanel";
import WhatIfScenarios, { ScenarioState } from "@/components/WhatIfScenarios";
import TripsHistogram from "@/components/TripsHistogram";

export default function PlanShipmentPage() {
  const [shipmentsList, setShipmentsList] = useState<ShipmentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("S020");

  const [baseDetail, setBaseDetail] = useState<ShipmentDetail | null>(null);
  const [currentDetail, setCurrentDetail] = useState<ShipmentDetail | null>(null);

  const [mode, setMode] = useState<string>("play_safe");
  const [scenarioState, setScenarioState] = useState<ScenarioState>({
    activeEvents: [],
    penalty: 6380,
    deadlineShift: 0,
    carbonPrice: 90,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load all shipments on mount
  useEffect(() => {
    fetchShipments()
      .then((data) => {
        setShipmentsList(data);
      })
      .catch((err) => {
        setError(err.message || "Failed to load shipments list");
      });
  }, []);

  // When selectedId changes, load base detail and reset scenario inputs
  useEffect(() => {
    if (!selectedId) return;

    setLoading(true);
    fetchShipment(selectedId)
      .then((detail) => {
        setBaseDetail(detail);
        setCurrentDetail(detail);
        setMode(detail.shipment.risk_mode);
        setScenarioState({
          activeEvents: [],
          penalty: detail.shipment.penalty_per_day,
          deadlineShift: 0,
          carbonPrice: 90,
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load shipment details");
        setLoading(false);
      });
  }, [selectedId]);

  // Debounced refetch whenever mode or scenario parameters change
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const applyChanges = useCallback(
    (
      targetMode: string,
      targetState: ScenarioState
    ) => {
      if (!selectedId) return;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        const eventsStr =
          targetState.activeEvents.length > 0
            ? targetState.activeEvents.join(",")
            : undefined;

        fetchShipment(selectedId, {
          mode: targetMode,
          events: eventsStr,
          penalty: targetState.penalty,
          deadline_shift: targetState.deadlineShift,
          carbon: targetState.carbonPrice,
        })
          .then((updated) => {
            setCurrentDetail(updated);
          })
          .catch((err) => {
            console.error("Refetch error:", err);
          });
      }, 300);
    },
    [selectedId]
  );

  const handleModeChange = (newMode: string) => {
    setMode(newMode);
    applyChanges(newMode, scenarioState);
  };

  const handleScenarioChange = (newState: ScenarioState) => {
    setScenarioState(newState);
    applyChanges(mode, newState);
  };

  const handleReset = () => {
    if (!baseDetail) return;
    const defaultState: ScenarioState = {
      activeEvents: [],
      penalty: baseDetail.shipment.penalty_per_day,
      deadlineShift: 0,
      carbonPrice: 90,
    };
    setScenarioState(defaultState);
    applyChanges(mode, defaultState);
  };

  // Scroll animations with IntersectionObserver
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window))
      return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("rise");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    const elements = document.querySelectorAll(".scroll-rise");
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [currentDetail]);

  if (loading && !currentDetail) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-muted font-medium">
          Loading shipment details and running simulations...
        </p>
      </div>
    );
  }

  if (error && !currentDetail) {
    return (
      <div className="p-8 bg-red-50 border border-bad/30 rounded-3xl text-bad">
        <h2 className="text-xl font-bold mb-2">Connection Problem</h2>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!currentDetail) return null;

  const { shipment, routes, recommended_route_id, confidence, tipping, warnings } =
    currentDetail;

  const recommendedRoute =
    routes.find((r) => r.id === recommended_route_id) || null;

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="scroll-rise flex flex-wrap gap-8 items-end justify-between">
        <div className="flex-[1_1_520px] min-w-0">
          <p className="text-sm font-semibold tracking-wider uppercase text-accent mb-2">
            Step by step
          </p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-ink leading-tight">
            Which way should this
            <br />
            shipment travel?
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted max-w-2xl leading-relaxed">
            There are a few ways to send a package across the world. Some are
            cheap, some are fast, some go through dangerous waters. We test every
            way 5,000 times and pick the one that makes the most sense for this
            cargo.
          </p>
        </div>

        {/* Step Index Box */}
        <ol className="flex-[0_1_420px] list-none m-0 p-0 grid grid-cols-2 gap-2.5">
          <li className="bg-card border border-line rounded-2xl p-3.5">
            <span className="block text-xs text-subtle font-bold mb-0.5">1</span>
            <span className="font-semibold text-sm text-ink">The shipment</span>
          </li>
          <li className="bg-card border border-line rounded-2xl p-3.5">
            <span className="block text-xs text-subtle font-bold mb-0.5">2</span>
            <span className="font-semibold text-sm text-ink">The ways to send it</span>
          </li>
          <li className="bg-card border border-line rounded-2xl p-3.5">
            <span className="block text-xs text-subtle font-bold mb-0.5">3</span>
            <span className="font-semibold text-sm text-ink">Our pick, and why</span>
          </li>
          <li className="bg-card border border-line rounded-2xl p-3.5">
            <span className="block text-xs text-subtle font-bold mb-0.5">4</span>
            <span className="font-semibold text-sm text-ink">Try it yourself</span>
          </li>
        </ol>
      </section>

      {/* Section 1: The shipment */}
      <div className="scroll-rise">
        <ShipmentHeader
          shipments={shipmentsList}
          selectedId={selectedId}
          onSelectShipment={setSelectedId}
          shipment={shipment}
        />
      </div>

      {/* Section 2: {n} ways to send it */}
      <section className="scroll-rise bg-card border border-line rounded-3xl p-7 md:p-9 shadow-sm">
        <div className="flex items-center gap-2.5 mb-2">
          <span className="w-7 h-7 rounded-full bg-ink text-white font-bold text-xs flex items-center justify-center">
            2
          </span>
          <h2 className="text-xl md:text-2xl font-bold text-ink m-0">
            {routes.length} ways to send it
          </h2>
        </div>
        <p className="text-sm md:text-base text-muted mb-7">
          Each line is one way to go. The thick line is our pick.
        </p>

        {/* Route Map & Legend */}
        <RouteMap
          routes={routes}
          recommendedId={recommended_route_id}
          origin={shipment.origin}
          destination={shipment.destination}
        />

        {/* Route Cards Grid */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {routes.map((r) => (
            <RouteCard
              key={r.id}
              route={r}
              allRoutes={routes}
              isRecommended={r.id === recommended_route_id}
              deadlineDays={shipment.deadline_days}
            />
          ))}
        </div>

        {/* Metric definitions */}
        <p className="mt-6 text-xs text-subtle leading-relaxed border-t border-line/60 pt-4">
          <strong className="text-muted">Usual total cost</strong> = ticket +
          late fees + losses from trouble + a price on pollution, averaged over
          5,000 imagined trips.{" "}
          <strong className="text-muted">Bad-luck cost</strong> = the average of
          the worst 1 in 10 of those trips.
        </p>
      </section>

      {/* Section 3: Our pick, and why */}
      <div className="scroll-rise">
        <RecommendationPanel
          recommendedRoute={recommendedRoute}
          routes={routes}
          mode={mode}
          onChangeMode={handleModeChange}
          confidence={confidence}
          tipping={tipping}
          warnings={warnings}
          cargoValue={shipment.value_usd}
          deadlineDays={shipment.deadline_days}
          minOnTime={shipment.min_on_time}
        />
      </div>

      {/* Section 4: Try it yourself */}
      <div className="scroll-rise">
        <WhatIfScenarios
          basePickName={baseDetail?.recommended_route_id ? baseDetail.routes.find(r => r.id === baseDetail.recommended_route_id)?.name ?? null : null}
          currentPickName={recommendedRoute ? recommendedRoute.name : null}
          scenarioState={scenarioState}
          onChangeScenario={handleScenarioChange}
          onReset={handleReset}
          defaultPenalty={shipment.penalty_per_day}
        />
      </div>

      {/* Collapsible: 5,000 imagined trips histogram */}
      <div className="scroll-rise">
        <TripsHistogram
          routes={routes}
          deadlineDays={shipment.deadline_days}
        />
      </div>
    </div>
  );
}
