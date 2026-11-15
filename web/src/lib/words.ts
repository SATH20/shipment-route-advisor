import { RouteItem } from "./types";

export const ROUTE_NAME_MAP: Record<string, string> = {
  "Direct sea": "Direct ship",
  "Sea via hub": "Ship with a stop",
  "Suez corridor": "Ship through Suez",
  "Sea + rail": "Ship, then train",
  "Sea + air": "Ship, then plane",
  "Air freight": "By plane",
};

export const STATUS_MAP: Record<string, string> = {
  recommended: "Our pick",
  candidate: "Possible",
  dominated: "Worse in every way",
  "fails reliability": "Too often late",
  "not allowed": "Not allowed",
};

export const PROFILE_MAP: Record<string, string> = {
  express: "Urgent",
  standard: "Normal",
  budget: "Cheap is fine",
  high_value: "Very valuable",
};

export const MODE_MAP: Record<string, string> = {
  play_safe: "Play it safe",
  expected: "Cheapest on average",
};

export const NUMBER_LABELS: Record<string, string> = {
  exp_total: "Usual total cost",
  cvar_total: "Bad-luck cost",
  p_on_time: "Arrives on time",
  p_disruption: "Chance of trouble",
  mean_days: "days",
  co2_tonnes: "Pollution (t CO2)",
  freight_usd: "Ticket price",
};

export function translateRouteName(
  name: string,
  passages: string[] = []
): { title: string; subtitle?: string } {
  const title = ROUTE_NAME_MAP[name] || name;

  if (name === "Direct sea") {
    if (passages.includes("Cape of Good Hope")) {
      return { title, subtitle: "around Africa" };
    }
    if (passages.includes("Panama Canal")) {
      return { title, subtitle: "through the Panama Canal" };
    }
    return { title, subtitle: "long ocean path" };
  }

  if (name === "Suez corridor") {
    return { title, subtitle: "risky waters" };
  }

  return { title };
}

export function translateStatus(status: string): string {
  return STATUS_MAP[status] || status;
}

export function translateProfile(profile: string): string {
  return PROFILE_MAP[profile] || profile;
}

export function translateMode(mode: string): string {
  return MODE_MAP[mode] || mode;
}

export function formatMoney(val: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);
}

export function formatPercent(val: number, decimals: number = 0): string {
  return `${(val * 100).toFixed(decimals)}%`;
}

export function formatDays(val: number): string {
  return val % 1 === 0 ? val.toString() : val.toFixed(1);
}

/**
 * Builds a plain description for a route comparing its metrics to the other routes
 * for the same shipment.
 */
export function describeRoute(route: RouteItem, allRoutes: RouteItem[]): string {
  if (route.status === "not allowed") {
    if (route.reasons && route.reasons.length > 0) {
      const r = route.reasons[0].toLowerCase();
      if (r.includes("hazardous") || r.includes("battery")) {
        return "Batteries cannot fly.";
      }
      if (r.includes("red sea")) {
        return "Excluded by customer rule.";
      }
      if (r.includes("budget")) {
        return "Over freight budget.";
      }
      if (r.includes("deadline")) {
        return "Too slow for deadline.";
      }
    }
    return "Not allowed for this shipment.";
  }

  const valid = allRoutes.filter((r) => r.metrics !== null);
  if (!route.metrics || valid.length === 0) {
    return "Standard candidate path.";
  }

  const fastest = valid.reduce((min, r) =>
    (r.metrics?.mean_days ?? 999) < (min.metrics?.mean_days ?? 999) ? r : min
  );
  const slowest = valid.reduce((max, r) =>
    (r.metrics?.mean_days ?? 0) > (max.metrics?.mean_days ?? 0) ? r : max
  );
  const cheapest = valid.reduce((min, r) =>
    r.freight_usd < min.freight_usd ? r : min
  );
  const priciest = valid.reduce((max, r) =>
    r.freight_usd > max.freight_usd ? r : max
  );
  const riskiest = valid.reduce((max, r) =>
    (r.metrics?.p_disruption ?? 0) > (max.metrics?.p_disruption ?? 0) ? r : max
  );

  const isFastest = route.id === fastest.id;
  const isSlowest = route.id === slowest.id;
  const isCheapest = route.id === cheapest.id;
  const isPriciest = route.id === priciest.id;
  const isRiskiest = route.id === riskiest.id;

  if (isFastest && isPriciest) {
    return "Fastest. Costs the most.";
  }
  if (isCheapest && isSlowest) {
    return "Cheapest. Slowest.";
  }
  if (isFastest) {
    return "Fastest way to get there.";
  }
  if (isCheapest) {
    return "Lowest ticket price.";
  }
  if (isRiskiest && (route.metrics.p_disruption ?? 0) > 0.04) {
    return "Shorter, but risky waters.";
  }
  if (route.name.includes("rail") || route.name.includes("train")) {
    const hub = route.stops.length > 2 ? route.stops[1] : "hub";
    return `Ship to ${hub}, then train.`;
  }
  if (route.name.includes("air") || route.name.includes("plane")) {
    return "Combined sea and flight.";
  }
  if (route.stops.length > 2) {
    return `Ship through ${route.stops[1]}.`;
  }
  return "Balanced route.";
}
