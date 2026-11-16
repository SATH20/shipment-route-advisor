"use client";

import { useEffect, useState } from "react";
import { onServerWaking } from "@/lib/api";

/** Shown while the free-hosted API is waking up; requests keep retrying meanwhile. */
export default function ServerWakeNotice() {
  const [waking, setWaking] = useState(false);
  useEffect(() => onServerWaking(setWaking), []);

  return (
    <div role="status" aria-live="polite" className="max-w-[1200px] w-full mx-auto px-4 sm:px-6">
      {waking && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-card px-5 py-4 text-sm text-ink shadow-sm">
          <span
            className="flex-none w-4 h-4 rounded-full border-2 border-[#d5deea] border-t-accent animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span>
            <strong className="font-semibold">Starting the server, this can take up to a minute.</strong>{" "}
            <span className="text-muted">It sleeps when nobody uses it. The page will fill in by itself.</span>
          </span>
        </div>
      )}
    </div>
  );
}
