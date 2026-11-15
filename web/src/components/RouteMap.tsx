"use client";

import React, { useMemo } from "react";
import { geoEquirectangular, geoPath, geoGraticule } from "d3-geo";
import * as topojson from "topojson-client";
import landData from "world-atlas/land-110m.json";
import { RouteItem } from "@/lib/types";
import { translateRouteName } from "@/lib/words";

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

export function getRouteColor(name: string): string {
  return ROUTE_COLORS[name] || "#1d4ed8";
}

export default function RouteMap({
  routes,
  recommendedId,
  origin,
  destination,
}: RouteMapProps) {
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
            // Find coordinate of this stop
            const leg = route.coords[i];
            if (leg) {
              const pt = proj([leg[1], leg[0]]);
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

  return (
    <div className="flex flex-wrap lg:flex-nowrap gap-6 items-stretch">
      {/* Map Container */}
      <figure className="flex-[999_1_560px] min-w-0 m-0 relative rounded-2xl overflow-hidden border border-[#dfe7f0] aspect-[1120/998] md:aspect-[16/10] bg-ocean shadow-inner">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Shipping route map from ${origin} to ${destination}`}
          className="w-full h-full block"
        >
          {/* Ocean Background */}
          <rect width={width} height={height} fill="#eaf1f8" />

          {/* Graticule lines */}
          <path
            d={graticulePathString}
            fill="none"
            stroke="#d5dbe3"
            strokeWidth="0.8"
            strokeDasharray="2 3"
            opacity="0.6"
          />

          {/* Land Outlines */}
          <path
            d={landPathString}
            fill="#f7f4ec"
            stroke="#d5dbe3"
            strokeWidth="1"
            strokeLinejoin="round"
          />

          {/* Route Paths */}
          {sortedRoutes.map((r, idx) => {
            const isRec = r.isRecommended;
            const isRejected =
              r.status === "not allowed" ||
              r.status === "fails reliability" ||
              r.status === "dominated";
            const strokeWidth = isRec ? 8 : isRejected ? 2.5 : 4;
            const strokeDash = isRejected
              ? r.status === "dominated"
                ? "6 5"
                : "3 4"
              : undefined;
            const opacity = isRec ? 1 : isRejected ? 0.45 : 0.75;
            const animClass = `draw d${(idx % 4) + 1}`;

            return (
              <path
                key={r.route.id}
                id={isRec ? "recommended-map-path" : undefined}
                className={animClass}
                pathLength="1"
                d={r.pathString}
                fill="none"
                stroke={r.color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDash}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={opacity}
              />
            );
          })}

          {/* Animated traveling dot along the recommended route */}
          {recommendedRoute && (
            <circle
              r="6"
              fill={recommendedRoute.color}
              stroke="#ffffff"
              strokeWidth="2.5"
            >
              <animateMotion
                dur="4.5s"
                repeatCount="indefinite"
                begin="1.2s"
              >
                <mpath href="#recommended-map-path" />
              </animateMotion>
            </circle>
          )}

          {/* Intermediate Stops */}
          {intermediateStops.map((stop) => (
            <g key={stop.name}>
              <circle
                cx={stop.pt[0]}
                cy={stop.pt[1]}
                r="5"
                fill="#ffffff"
                stroke={stop.color}
                strokeWidth="3"
              />
              <text
                x={stop.pt[0] + 8}
                y={stop.pt[1] - 8}
                fontFamily="Inter, sans-serif"
                fontSize="12"
                fontWeight="600"
                fill="#0f1b2d"
                stroke="#f7f4ec"
                strokeWidth="3"
                paintOrder="stroke"
              >
                {stop.name}
              </text>
            </g>
          ))}

          {/* Origin & Destination Markers */}
          {originPt && (
            <g>
              <circle
                className="ping"
                cx={originPt[0]}
                cy={originPt[1]}
                r="7"
                fill="#0f1b2d"
              />
              <circle
                cx={originPt[0]}
                cy={originPt[1]}
                r="7"
                fill="#0f1b2d"
                stroke="#ffffff"
                strokeWidth="2.5"
              />
              <text
                x={originPt[0] + 10}
                y={originPt[1] - 8}
                fontFamily="Inter, sans-serif"
                fontSize="14"
                fontWeight="700"
                fill="#0f1b2d"
                stroke="#f7f4ec"
                strokeWidth="4"
                paintOrder="stroke"
              >
                {origin}
              </text>
            </g>
          )}

          {destPt && (
            <g>
              <circle
                cx={destPt[0]}
                cy={destPt[1]}
                r="7"
                fill="#0f1b2d"
                stroke="#ffffff"
                strokeWidth="2.5"
              />
              <text
                x={destPt[0] + 10}
                y={destPt[1] - 8}
                fontFamily="Inter, sans-serif"
                fontSize="14"
                fontWeight="700"
                fill="#0f1b2d"
                stroke="#f7f4ec"
                strokeWidth="4"
                paintOrder="stroke"
              >
                {destination}
              </text>
            </g>
          )}
        </svg>
      </figure>

      {/* Legend list */}
      <ul className="flex-[1_1_300px] list-none m-0 p-0 flex flex-col gap-2.5 justify-center">
        {routes.map((r) => {
          const { title, subtitle } = translateRouteName(r.name, r.passages);
          const color = getRouteColor(r.name);
          const isRec = r.id === recommendedId;

          return (
            <li
              key={r.id}
              className={`flex gap-3 items-start p-3.5 rounded-xl border transition-all ${
                isRec
                  ? "bg-white border-line shadow-sm ring-2 ring-good/40"
                  : "bg-white/80 border-line/60"
              }`}
            >
              <span
                className="flex-none w-7 h-1.5 rounded-full mt-2"
                style={{ backgroundColor: color }}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <strong className="text-[15px] font-semibold text-ink">
                    {title}
                  </strong>
                  {isRec && (
                    <span className="text-[11px] font-bold text-good bg-good/10 px-2 py-0.5 rounded-full">
                      Our pick
                    </span>
                  )}
                </div>
                <span className="text-[13px] text-muted block leading-snug">
                  {subtitle
                    ? `Passage: ${subtitle}`
                    : `${r.planned_days.toFixed(0)} planned days, ${r.stops.join(" → ")}`}
                </span>
              </div>
            </li>
          );
        })}

        <li className="mt-auto text-[12px] text-subtle leading-relaxed pt-2">
          Lines show the ports and sea passages each way uses, not exact tracks.
        </li>
      </ul>
    </div>
  );
}
