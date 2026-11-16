"use client";

import React, { useId, useMemo } from "react";
import { geoEquirectangular, geoPath, geoGraticule } from "d3-geo";
import * as topojson from "topojson-client";
import landData from "world-atlas/land-110m.json";
import { RouteItem } from "@/lib/types";
import { REJECTED, translateRouteName } from "@/lib/words";

interface RouteMapProps {
  routes: RouteItem[];
  recommendedId: string | null;
  origin: string;
  destination: string;
}

const ROUTE_COLORS: Record<string, string> = {
  "Air freight": "#7c3aed",
  "By plane": "#7c3aed",
  "Direct sea": "#1d4ed8",
  "Direct ship": "#1d4ed8",
  "Suez corridor": "#dc4a3d",
  "Ship through Suez": "#dc4a3d",
  "Sea + rail": "#15803d",
  "Ship, then train": "#15803d",
  "Sea + air": "#d97706",
  "Ship, then plane": "#d97706",
  "Sea via hub": "#0891b2",
  "Ship with a stop": "#0891b2",
};

// Lighter versions of the same hues for text on the dark pick panel (contrast at least 4.5:1)
const ROUTE_COLORS_ON_DARK: Record<string, string> = {
  "Air freight": "#a78bfa",
  "Direct sea": "#7aa2ff",
  "Suez corridor": "#ff8a7d",
  "Sea + rail": "#4ade80",
  "Sea + air": "#fbbf24",
  "Sea via hub": "#22d3ee",
};

export function getRouteColor(name: string, onDark: boolean = false): string {
  if (onDark) return ROUTE_COLORS_ON_DARK[name] || "#7aa2ff";
  return ROUTE_COLORS[name] || "#1d4ed8";
}

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Put a label next to its point, on the first side that does not cover another label. */
function placeLabel(pt: [number, number], text: string, size: number, placed: Box[]) {
  const w = text.length * size * 0.6 + 4;
  const h = size + 4;
  const options = [
    { x: pt[0] + 10, y: pt[1] - 8, anchor: "start" },
    { x: pt[0] + 10, y: pt[1] + size + 6, anchor: "start" },
    { x: pt[0] - 10, y: pt[1] - 8, anchor: "end" },
    { x: pt[0] - 10, y: pt[1] + size + 6, anchor: "end" },
  ];
  for (const o of options) {
    const box = { x: o.anchor === "end" ? o.x - w : o.x, y: o.y - size, w, h };
    if (!placed.some((p) => overlaps(p, box))) {
      placed.push(box);
      return o;
    }
  }
  const o = options[0];
  placed.push({ x: o.x, y: o.y - size, w, h });
  return o;
}

export default function RouteMap({
  routes,
  recommendedId,
  origin,
  destination,
}: RouteMapProps) {
  // unique per map, so the moving dot follows this map's path when two maps are on the page
  const pathId = `pick-path-${useId().replace(/:/g, "")}`;
  const width = 960;
  const height = 580;

  // Extract land FeatureCollection once
  const landFeature = useMemo(() => {
    return topojson.feature(
      landData as any,
      (landData as any).objects.land
    ) as any;
  }, []);

  // Compute projection rotated and fitted to the bounding box of unwrapped coordinates
  const { projection, projectedRoutes, originPt, destPt, intermediateStops } =
    useMemo(() => {
      if (!routes || routes.length === 0) {
        const fallback = geoEquirectangular().fitExtent(
          [[30, 30], [width - 30, height - 30]],
          landFeature
        );
        return {
          projection: fallback,
          projectedRoutes: [],
          originPt: null,
          destPt: null,
          intermediateStops: [],
        };
      }

      // Collect all route points and unwrap longitudes smoothly across the antimeridian
      const allUnwrappedPoints: [number, number][] = [];
      let globalPrevLon = routes[0]?.coords[0]?.[1] ?? 0;

      const unwrappedRoutes = routes.map((r) => {
        let prevLon = r.coords[0]?.[1] ?? globalPrevLon;
        const unwrapCoords: [number, number][] = [];

        for (const [lat, lon] of r.coords) {
          let currLon = lon;
          while (currLon - prevLon > 180) currLon -= 360;
          while (currLon - prevLon < -180) currLon += 360;
          unwrapCoords.push([currLon, lat]); // [lon, lat] for GeoJSON convention
          allUnwrappedPoints.push([currLon, lat]);
          prevLon = currLon;
        }

        return {
          route: r,
          unwrappedCoords: unwrapCoords,
        };
      });

      // Calculate bounds in unwrapped space
      const lons = allUnwrappedPoints.map((p) => p[0]);
      const lats = allUnwrappedPoints.map((p) => p[1]);
      const minLon = Math.min(...lons);
      const maxLon = Math.max(...lons);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);

      const centerLon = (minLon + maxLon) / 2;
      const centerLat = (minLat + maxLat) / 2;

      // Add 12% margin around bounding box
      const margin = 0.12;
      const dLon = Math.max(35, (maxLon - minLon) * (1 + margin * 2));
      const dLat = Math.max(22, (maxLat - minLat) * (1 + margin * 2));

      // Rotate projection by -centerLon so the route is dead center
      const proj = geoEquirectangular()
        .rotate([-centerLon, 0])
        .fitExtent(
          [
            [40, 40],
            [width - 40, height - 40],
          ],
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [-dLon / 2, Math.max(-80, centerLat - dLat / 2)],
                  [dLon / 2, Math.max(-80, centerLat - dLat / 2)],
                  [dLon / 2, Math.min(80, centerLat + dLat / 2)],
                  [-dLon / 2, Math.min(80, centerLat + dLat / 2)],
                  [-dLon / 2, Math.max(-80, centerLat - dLat / 2)],
                ],
              ],
            },
          }
        );

      // Project each route into an SVG path string
      const projected = unwrappedRoutes.map(({ route, unwrappedCoords }) => {
        const isAir =
          route.name.includes("Air") || route.name.includes("plane");
        const pts = unwrappedCoords.map(([lon, lat]) => {
          // In rotated space:
          const p = proj([lon, lat]);
          return p ?? [0, 0];
        });

        let pathString = "";
        if (isAir && pts.length === 2) {
          const [p0, p1] = pts;
          if (Math.abs(p1[0] - p0[0]) > width * 0.4) {
            // Flight crosses seam: draw two separate legs
            pathString = `M ${p0[0].toFixed(1)} ${p0[1].toFixed(1)} M ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
          } else {
            // Curved arch for flights
            const midX = (p0[0] + p1[0]) / 2;
            const midY = (p0[1] + p1[1]) / 2;
            const dx = p1[0] - p0[0];
            const dy = p1[1] - p0[1];
            const dist = Math.hypot(dx, dy);
            const arch = Math.max(50, dist * 0.22);
            const cpX = midX;
            const cpY = midY - arch;
            pathString = `M ${p0[0].toFixed(1)} ${p0[1].toFixed(1)} Q ${cpX.toFixed(1)} ${cpY.toFixed(1)} ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
          }
        } else if (pts.length > 0) {
          pathString = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
          for (let i = 1; i < pts.length; i++) {
            const prev = pts[i - 1];
            const curr = pts[i];
            // If horizontal jump is across the projection antimeridian seam, split with M instead of L
            if (Math.abs(curr[0] - prev[0]) > width * 0.4) {
              pathString += ` M ${curr[0].toFixed(1)} ${curr[1].toFixed(1)}`;
            } else {
              pathString += ` L ${curr[0].toFixed(1)} ${curr[1].toFixed(1)}`;
            }
          }
        }

        return {
          route,
          pathString,
          color: getRouteColor(route.name),
          isRecommended: route.id === recommendedId,
          status: route.status,
        };
      });

      // Find origin, destination, and intermediate stops
      const firstRoute = unwrappedRoutes[0];
      const orig = firstRoute?.unwrappedCoords[0];
      const dest =
        firstRoute?.unwrappedCoords[firstRoute.unwrappedCoords.length - 1];

      const oProjected = orig ? proj(orig) : null;
      const dProjected = dest ? proj(dest) : null;

      // Intermediate stops
      const stops: { name: string; pt: [number, number]; color: string }[] = [];
      for (const { route } of unwrappedRoutes) {
        if (route.stops.length > 2) {
          // Has intermediate hubs
          for (let i = 1; i < route.stops.length - 1; i++) {
            const stopName = route.stops[i];
            // the hub's own position (route.coords is the drawn path, not the stops)
            const leg = route.stop_coords?.[i];
            if (leg) {
              let lon = leg[1];
              while (lon - centerLon > 180) lon -= 360;
              while (lon - centerLon < -180) lon += 360;
              const pt = proj([lon, leg[0]]);
              if (pt && !stops.some((s) => s.name === stopName)) {
                stops.push({
                  name: stopName,
                  pt: [pt[0], pt[1]],
                  color: getRouteColor(route.name),
                });
              }
            }
          }
        }
      }

      return {
        projection: proj,
        projectedRoutes: projected,
        originPt: oProjected,
        destPt: dProjected,
        intermediateStops: stops,
      };
    }, [routes, recommendedId, landFeature, width, height]);

  // Generate SVG path for the world land
  const landPathString = useMemo(() => {
    const pathGen = geoPath(projection);
    return pathGen(landFeature) || "";
  }, [projection, landFeature]);

  // Faint graticule lines
  const graticulePathString = useMemo(() => {
    const pathGen = geoPath(projection);
    const graticule = geoGraticule().step([30, 30]);
    return pathGen(graticule()) || "";
  }, [projection]);

  // Sort routes so rejected are drawn first, candidates second, recommended on top
  const sortedRoutes = useMemo(() => {
    const statusOrder: Record<string, number> = {
      "not allowed": 0,
      "fails reliability": 1,
      dominated: 2,
      candidate: 3,
      recommended: 4,
    };
    return [...projectedRoutes].sort((a, b) => {
      const orderA = a.isRecommended ? 5 : (statusOrder[a.status] ?? 2);
      const orderB = b.isRecommended ? 5 : (statusOrder[b.status] ?? 2);
      return orderA - orderB;
    });
  }, [projectedRoutes]);

  const recommendedRoute = projectedRoutes.find((r) => r.isRecommended);

  // Label placement: origin and destination first, then hubs, avoiding overlaps
  const labels = useMemo(() => {
    const placed: Box[] = [];
    const out: { key: string; text: string; pt: [number, number]; size: number; x: number; y: number; anchor: string; color: string; bold: boolean }[] = [];
    const add = (key: string, text: string, pt: [number, number] | null, size: number, color: string, bold: boolean) => {
      if (!pt) return;
      const o = placeLabel(pt, text, size, placed);
      out.push({ key, text, pt, size, x: o.x, y: o.y, anchor: o.anchor, color, bold });
    };
    add("origin", origin, originPt as [number, number] | null, 14, "#0f1b2d", true);
    add("dest", destination, destPt as [number, number] | null, 14, "#0f1b2d", true);
    for (const s of intermediateStops) add(`hub-${s.name}`, s.name, s.pt, 12, s.color, false);
    return out;
  }, [origin, destination, originPt, destPt, intermediateStops]);

  const pickName = recommendedRoute
    ? translateRouteName(recommendedRoute.route.name, recommendedRoute.route.passages).title
    : null;
  const mapLabel =
    `Map of ${routes.length} ways from ${origin} to ${destination}.` +
    (pickName ? ` Our pick, ${pickName}, is the thick line.` : "");

  return (
    <div className="flex flex-wrap lg:flex-nowrap gap-6 items-stretch">
      <figure className="flex-[999_1_560px] min-w-0 m-0 relative rounded-2xl overflow-hidden border border-[#dfe7f0] bg-ocean">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={mapLabel} className="w-full h-auto block">
          <rect width={width} height={height} fill="#eaf1f8" />
          <path d={graticulePathString} fill="none" stroke="#d5deea" strokeWidth="0.8" strokeDasharray="2 3" opacity="0.6" />
          <path d={landPathString} fill="#f7f4ec" stroke="#d9d4c8" strokeWidth="1" strokeLinejoin="round" />

          {sortedRoutes.map((r, idx) => {
            const isRec = r.isRecommended;
            const isRejected = REJECTED.includes(r.status);
            return (
              <path
                key={r.route.id}
                id={isRec ? pathId : undefined}
                className={`draw d${(idx % 4) + 1}`}
                pathLength="1"
                d={r.pathString}
                fill="none"
                stroke={r.color}
                strokeWidth={isRec ? 8 : isRejected ? 2.5 : 4}
                strokeDasharray={isRejected ? (r.status === "dominated" ? "6 5" : "3 4") : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={isRec ? 1 : isRejected ? 0.45 : 0.75}
              />
            );
          })}

          {recommendedRoute && (
            <circle className="travel-dot" r="6" fill={recommendedRoute.color} stroke="#ffffff" strokeWidth="2.5">
              <animateMotion dur="4.5s" repeatCount="indefinite" begin="1.2s">
                <mpath href={`#${pathId}`} />
              </animateMotion>
            </circle>
          )}

          {intermediateStops.map((stop) => (
            <circle key={stop.name} cx={stop.pt[0]} cy={stop.pt[1]} r="5" fill="#ffffff" stroke={stop.color} strokeWidth="3" />
          ))}

          {originPt && (
            <g>
              <circle className="ping" cx={originPt[0]} cy={originPt[1]} r="7" fill="#0f1b2d" />
              <circle cx={originPt[0]} cy={originPt[1]} r="7" fill="#0f1b2d" stroke="#ffffff" strokeWidth="2.5" />
            </g>
          )}
          {destPt && <circle cx={destPt[0]} cy={destPt[1]} r="7" fill="#0f1b2d" stroke="#ffffff" strokeWidth="2.5" />}

          {labels.map((l) => (
            <text
              key={l.key}
              x={l.x}
              y={l.y}
              textAnchor={l.anchor as "start" | "end"}
              fontFamily="Inter, sans-serif"
              fontSize={l.size}
              fontWeight={l.bold ? 700 : 600}
              fill="#0f1b2d"
              stroke="#f7f4ec"
              strokeWidth={l.bold ? 4 : 3}
              paintOrder="stroke"
            >
              {l.text}
            </text>
          ))}
        </svg>
      </figure>

      <ul className="flex-[1_1_300px] list-none m-0 p-0 flex flex-col gap-3 justify-center" aria-label="Map key">
        {routes.map((r) => {
          const { title, subtitle } = translateRouteName(r.name, r.passages);
          const isRec = r.id === recommendedId;
          return (
            <li
              key={r.id}
              className={`flex gap-3 items-start p-3.5 rounded-xl border bg-card ${
                isRec ? "border-good ring-2 ring-good/20" : "border-line"
              }`}
            >
              <span className="flex-none w-7 h-1.5 rounded-full mt-2" style={{ backgroundColor: getRouteColor(r.name) }} aria-hidden="true" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-[15px] font-semibold text-ink">{title}</strong>
                  {isRec && (
                    <span className="text-xs font-bold text-good bg-[#eef8f1] px-2 py-0.5 rounded-full">Our pick</span>
                  )}
                </div>
                <span className="text-[13px] text-muted block leading-snug">
                  {r.stops.join(" to ")}
                  {subtitle ? `, ${subtitle}` : ""}
                </span>
              </div>
            </li>
          );
        })}
        <li className="text-xs text-subtle leading-relaxed pt-1">
          Lines show the ports and sea passages each way uses, not exact tracks. Dashed lines are ways we ruled out.
        </li>
      </ul>
    </div>
  );
}
