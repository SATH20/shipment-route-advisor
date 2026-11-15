"use client";

import { useEffect, useState } from "react";
import { fetchShipments } from "@/lib/api";
import { ShipmentSummary } from "@/lib/types";

export default function HomePage() {
  const [shipments, setShipments] = useState<ShipmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchShipments()
      .then((data) => {
        setShipments(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load shipments");
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div className="p-6 bg-card border border-line rounded-2xl">
        <h1 className="text-2xl font-bold mb-2">Shipment Route Advisor</h1>
        <p className="text-muted">
          Frontend layout initialized. Testing connection to the FastAPI backend...
        </p>

        <div className="mt-4 pt-4 border-t border-line">
          {loading && (
            <p className="text-subtle animate-pulse">Loading shipments from /api/shipments...</p>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-bad/20 rounded-xl text-bad text-sm">
              <p className="font-semibold mb-1">Backend connection issue:</p>
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && (
            <div className="flex items-center gap-2 text-good font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-good animate-ping" />
              <span>
                Connected to backend successfully! Loaded <strong>{shipments.length}</strong> shipments.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
