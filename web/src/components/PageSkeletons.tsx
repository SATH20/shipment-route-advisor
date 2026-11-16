"use client";

import React from "react";
import { API_IS_LOCAL, API_URL } from "@/lib/api";

export function ErrorBox({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const offline = !message || message.includes("not answering");
  const apiPort = new URL(API_URL).port || "80";
  return (
    <div role="alert" className="max-w-xl mx-auto my-12 p-8 md:p-10 bg-card border-2 border-bad/30 rounded-3xl shadow-sm text-center">
      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[#fff3f1] flex items-center justify-center text-bad">
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
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-ink mb-2">
        {offline ? "We cannot reach the route engine" : "Something went wrong"}
      </h2>
      <p className="text-sm md:text-base text-muted max-w-md mx-auto mb-6 leading-relaxed">
        {message || "The route engine is not answering."}
        {offline && API_IS_LOCAL && " Start it with this command, then try again:"}
        {offline && !API_IS_LOCAL && " It may be down for a moment. Please try again in a minute."}
      </p>
      {offline && API_IS_LOCAL && (
        <div className="bg-paper p-3 rounded-xl font-mono text-xs text-ink mb-6 border border-line select-all inline-block">
          uvicorn api.main:app --port {apiPort}
        </div>
      )}
      <div>
        <button
          type="button"
          onClick={onRetry || (() => window.location.reload())}
          className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-accent text-white font-semibold text-sm hover:opacity-90 transition-opacity min-h-[44px] cursor-pointer shadow-sm"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export function SectionsSkeleton() {
  return <MainPageSkeleton sectionsOnly />;
}

export function MainPageSkeleton({ sectionsOnly = false }: { sectionsOnly?: boolean }) {
  return (
    <div className="space-y-12 animate-pulse motion-reduce:animate-none">
      {!sectionsOnly && (
        <>
      {/* Hero Header Skeleton */}
      <div className="flex flex-wrap gap-8 items-end justify-between">
        <div className="flex-[1_1_520px] space-y-3">
          <div className="h-4 w-28 bg-[#e8e4db] rounded-full" />
          <div className="h-10 w-3/4 bg-[#ded8cd] rounded-2xl" />
          <div className="h-4 w-full bg-[#e8e4db] rounded-full" />
          <div className="h-4 w-4/5 bg-[#e8e4db] rounded-full" />
        </div>
      </div>

      {/* Section 1: The shipment skeleton */}
      <section className="bg-card border border-line rounded-3xl p-7 md:p-8 space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[#ded8cd]" />
            <div className="h-6 w-32 bg-[#ded8cd] rounded-full" />
          </div>
          <div className="h-10 w-48 bg-[#efece5] rounded-xl" />
        </div>
        <div className="h-6 w-5/6 bg-[#e8e4db] rounded-full" />
        <div className="flex gap-2 pt-2">
          <div className="h-7 w-28 bg-[#efece5] rounded-full" />
          <div className="h-7 w-40 bg-[#efece5] rounded-full" />
        </div>
      </section>

        </>
      )}

      {/* Section 2: Ways to send it skeleton (Map + Cards) */}
      <section className="bg-card border border-line rounded-3xl p-7 md:p-9 space-y-7">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-[#ded8cd]" />
          <div className="h-6 w-48 bg-[#ded8cd] rounded-full" />
        </div>

        {/* Map Skeleton */}
        <div className="flex flex-wrap lg:flex-nowrap gap-6 items-stretch">
          <div className="flex-[999_1_560px] min-w-0 rounded-2xl border border-[#dfe7f0] aspect-[16/10] bg-ocean/70 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="w-12 h-12 rounded-full border-4 border-accent/30 border-t-accent animate-spin motion-reduce:animate-none mb-3" />
            <p className="text-sm font-medium text-subtle">
              Loading the map
            </p>
          </div>
          <div className="flex-[1_1_300px] flex flex-col gap-2.5 justify-center">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-14 bg-paper rounded-xl border border-line flex items-center px-4 gap-3"
              >
                <div className="w-7 h-2 rounded-full bg-[#d5dbe3]" />
                <div className="h-4 w-28 bg-[#d5dbe3] rounded-full" />
              </div>
            ))}
          </div>
        </div>

        {/* 4 Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-2xl p-5 bg-card border-2 border-line/60 flex flex-col justify-between h-[230px]"
            >
              <div className="space-y-2">
                <div className="h-5 w-24 bg-[#ded8cd] rounded-full" />
                <div className="h-4 w-3/4 bg-[#e8e4db] rounded-full" />
              </div>
              <div className="space-y-2">
                <div className="h-8 w-16 bg-[#ded8cd] rounded-lg" />
                <div className="h-2 w-full bg-[#efece5] rounded-full" />
              </div>
              <div className="pt-2 border-t border-line/40 flex justify-between">
                <div className="h-4 w-16 bg-[#efece5] rounded-full" />
                <div className="h-4 w-14 bg-[#efece5] rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3: Recommendation panel skeleton */}
      <section className="bg-ink rounded-3xl p-7 md:p-9 space-y-6">
        <div className="flex justify-between items-center border-b border-[#1c2a40] pb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-white/20" />
            <div className="h-6 w-36 bg-white/20 rounded-full" />
          </div>
          <div className="h-10 w-44 bg-white/10 rounded-full" />
        </div>
        <div className="space-y-3 py-4">
          <div className="h-4 w-28 bg-white/20 rounded-full" />
          <div className="h-10 w-64 bg-white/30 rounded-xl" />
          <div className="h-4 w-4/5 bg-white/20 rounded-full" />
          <div className="h-4 w-3/5 bg-white/20 rounded-full" />
        </div>
      </section>
    </div>
  );
}

export function HowPageSkeleton() {
  return (
    <div className="space-y-8 animate-pulse motion-reduce:animate-none">
      <div className="space-y-3 mb-8">
        <div className="h-4 w-24 bg-[#e8e4db] rounded-full" />
        <div className="h-10 w-80 bg-[#ded8cd] rounded-2xl" />
        <div className="h-4 w-96 bg-[#e8e4db] rounded-full" />
      </div>

      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="bg-card border border-line rounded-3xl p-7 md:p-8 space-y-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-ocean/70" />
            <div className="space-y-2 flex-1">
              <div className="h-6 w-48 bg-[#ded8cd] rounded-full" />
              <div className="h-4 w-full bg-[#e8e4db] rounded-full" />
            </div>
          </div>
          <div className="pt-4 border-t border-line/60">
            <div className="h-4 w-32 bg-[#efece5] rounded-full mb-2" />
            <div className="h-5 w-2/3 bg-[#e8e4db] rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResultsPageSkeleton() {
  return (
    <div className="space-y-10 animate-pulse motion-reduce:animate-none">
      <div className="space-y-3 mb-8">
        <div className="h-4 w-24 bg-[#e8e4db] rounded-full" />
        <div className="h-10 w-96 bg-[#ded8cd] rounded-2xl" />
        <div className="h-4 w-full max-w-xl bg-[#e8e4db] rounded-full" />
      </div>

      {/* Comparison Skeleton */}
      <section className="bg-card border border-line rounded-3xl p-7 md:p-10 space-y-6">
        <div className="h-8 w-64 bg-[#ded8cd] rounded-xl" />
        <div className="space-y-4 pt-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <div className="h-4 w-32 bg-[#ded8cd] rounded-full" />
                <div className="h-4 w-16 bg-[#ded8cd] rounded-full" />
              </div>
              <div className="h-3.5 bg-[#f1eee7] rounded-full" />
            </div>
          ))}
        </div>
      </section>

      {/* Findings Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-card border border-line rounded-2xl p-6 h-[200px] flex flex-col justify-between"
          >
            <div className="h-8 w-20 bg-[#ded8cd] rounded-lg" />
            <div className="space-y-2">
              <div className="h-5 w-3/4 bg-[#ded8cd] rounded-full" />
              <div className="h-3.5 w-full bg-[#efece5] rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
