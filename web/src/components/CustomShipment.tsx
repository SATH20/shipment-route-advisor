"use client";

import React, { useId, useState } from "react";
import { ApiError, recommendShipment } from "@/lib/api";
import { ShipmentDetail } from "@/lib/types";
import { formatDays, formatMoney } from "@/lib/words";
import example from "@/data/custom_shipment.example.json";
import RouteCard from "./RouteCard";
import RouteMap from "./RouteMap";
import RecommendationPanel from "./RecommendationPanel";

// A copy of examples/custom_shipment.json (tests/test_api.py checks the two stay identical).
const EXAMPLE_TEXT = JSON.stringify(example, null, 2);

type Problem = { field: string; message: string };

export default function CustomShipment() {
  const uid = useId().replace(/:/g, "");
  const ids = { input: `${uid}-json`, help: `${uid}-help`, error: `${uid}-error` };

  const [text, setText] = useState(EXAMPLE_TEXT);
  const [result, setResult] = useState<ShipmentDetail | null>(null);
  const [sent, setSent] = useState<unknown>(null); // the JSON behind the result, for mode changes
  const [mode, setMode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ title: string; problems: Problem[]; text?: string } | null>(null);

  const run = (shipment: unknown, withMode?: string) => {
    setLoading(true);
    setError(null);
    recommendShipment(shipment, withMode)
      .then((d) => {
        setResult(d);
        setSent(shipment);
        setMode(d.mode);
      })
      .catch((err: unknown) => {
        setResult(null); // never show an older result next to an error
        if (err instanceof ApiError && err.status === 422 && err.problems.length > 0) {
          setError({ title: "The shipment has a problem:", problems: err.problems });
        } else {
          setError({ title: "We could not get a recommendation.", problems: [], text: (err as Error).message });
        }
      })
      .finally(() => setLoading(false));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      setError({ title: "That isn't valid JSON.", problems: [], text: (err as Error).message });
      setResult(null);
      return;
    }
    run(parsed);
  };

  const changeMode = (m: string) => {
    if (sent !== null && m !== mode) run(sent, m);
  };

  const hasMap = result?.routes.some((r) => r.coords.length > 1) ?? false;
  const s = result?.shipment;

  return (
    <section className="bg-card border border-line rounded-3xl p-6 md:p-8 shadow-sm" aria-labelledby={`${uid}-title`}>
      <div className="flex items-center gap-3">
        <span className="w-7 h-7 rounded-full bg-ink text-white font-bold text-xs flex items-center justify-center" aria-hidden="true">
          4
        </span>
        <h2 id={`${uid}-title`} className="text-xl md:text-2xl font-bold text-ink m-0">
          Your own shipment
        </h2>
      </div>

      <form onSubmit={submit} className="mt-4" noValidate>
        <label htmlFor={ids.input} className="block text-sm font-semibold text-ink">
          Shipment as JSON
        </label>
        <p id={ids.help} className="text-sm md:text-base text-muted mt-1 mb-3">
          Paste a shipment as JSON. Routes and legs are described the same way as in the example.
        </p>
        <textarea
          id={ids.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          wrap="off"
          rows={14}
          aria-describedby={error ? `${ids.help} ${ids.error}` : ids.help}
          aria-invalid={error ? true : undefined}
          className="w-full font-mono text-xs md:text-sm text-ink bg-[#fbfaf7] border border-line rounded-xl p-3 resize-y focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />

        {error && (
          <div id={ids.error} role="alert" className="mt-3 rounded-xl border border-bad/40 bg-[#fff3f1] px-4 py-3 text-sm text-bad">
            <p className="m-0 font-semibold">{error.title}</p>
            {error.problems.length > 0 && (
              <ul className="mt-1 mb-0 pl-5 list-disc">
                {error.problems.map((p, i) => (
                  <li key={i}>
                    {p.field && <strong className="font-semibold">{p.field}: </strong>}
                    {p.message}
                  </li>
                ))}
              </ul>
            )}
            {error.text && <p className="mt-1 mb-0">{error.text}</p>}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="inline-flex items-center justify-center gap-2 px-6 min-h-[44px] rounded-full bg-accent text-white font-semibold text-sm hover:opacity-90 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            {loading && (
              <span
                className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {loading ? "Working it out" : "Get a recommendation"}
          </button>
          <button
            type="button"
            onClick={() => {
              setText(EXAMPLE_TEXT);
              setError(null);
            }}
            disabled={loading || text === EXAMPLE_TEXT}
            className="text-sm font-semibold text-accent hover:text-ink underline min-h-[44px] px-2 cursor-pointer disabled:text-subtle disabled:no-underline disabled:cursor-default"
          >
            Put the example back
          </button>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {loading ? "Working out a recommendation" : result ? "Recommendation ready" : ""}
        </p>
      </form>

      {result && s && (
        <div className={`mt-8 pt-6 border-t border-line space-y-6 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <p className="text-lg md:text-xl font-medium leading-relaxed text-ink max-w-4xl m-0">
            Send <strong>{s.weight_kg.toLocaleString("en-US")} kg of {s.cargo}</strong> worth{" "}
            <strong>{formatMoney(s.value_usd)}</strong> from <strong>{s.origin}</strong> to{" "}
            <strong>{s.destination}</strong>. It must arrive within{" "}
            <strong>{formatDays(s.deadline_days)} days</strong>, and each day late costs{" "}
            <strong>{formatMoney(s.penalty_per_day)}</strong>.
          </p>

          {hasMap ? (
            <RouteMap
              routes={result.routes}
              recommendedId={result.recommended_route_id}
              origin={s.origin}
              destination={s.destination}
            />
          ) : (
            <p className="text-sm text-muted m-0">
              No map for this shipment: some of its ports are not on our map.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {result.routes.map((r) => (
              <RouteCard
                key={r.id}
                route={r}
                allRoutes={result.routes}
                isRecommended={r.id === result.recommended_route_id}
                deadlineDays={s.deadline_days}
              />
            ))}
          </div>

          <RecommendationPanel
            detail={result}
            mode={mode ?? result.mode}
            onChangeMode={changeMode}
            hasChanges={false}
            idPrefix={`${uid}-`}
            stepLabel="4"
          />
        </div>
      )}
    </section>
  );
}
