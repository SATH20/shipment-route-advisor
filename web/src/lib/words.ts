import { RouteItem } from "./types";

// Plain names for the engine's route types. Wording only: every number comes from the API.
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
  dominated: "Beaten by another way",
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

export const REJECTED = ["dominated", "fails reliability", "not allowed"];
export const ELIGIBLE = ["recommended", "candidate"];

export function plainRouteName(name: string): string {
  return ROUTE_NAME_MAP[name] || name;
}

export function translateRouteName(
  name: string,
  passages: string[] = []
): { title: string; subtitle?: string } {
  const title = plainRouteName(name);

  if (name === "Direct sea") {
    if (passages.includes("Cape of Good Hope")) {
      return { title, subtitle: "around Africa" };
    }
    if (passages.includes("Panama Canal")) {
      return { title, subtitle: "through the Panama Canal" };
    }
    return { title, subtitle: "open ocean" };
  }

  if (name === "Suez corridor") {
    return { title, subtitle: "risky waters" };
  }

  return { title };
}

/** Replace every engine route name in a sentence with its plain name. */
export function plainNames(sentence: string): string {
  let s = sentence;
  for (const [engine, plain] of Object.entries(ROUTE_NAME_MAP)) {
    s = s.split(engine).join(plain);
  }
  return s;
}

/** Rewrite an engine rule-check reason in plain words. Numbers are copied, never computed. */
export function plainReason(reason: string): string {
  let m = reason.match(/^(.*) are hazardous cargo and cannot travel by air$/);
  if (m) return `${capitalize(m[1])} are dangerous goods, so they cannot go by plane.`;
  if (/^customer excludes the (.*) region$/.test(reason)) {
    return `The customer does not allow ships through the ${reason.replace(/^customer excludes the (.*) region$/, "$1")}.`;
  }
  m = reason.match(/^freight (\$[\d,]+) exceeds the (\$[\d,]+) budget$/);
  if (m) return `The ticket costs ${m[1]}, more than the ${m[2]} budget.`;
  m = reason.match(/^planned transit ([\d.]+) days already misses the ([\d.]+)-day deadline$/);
  if (m) return `Even with no delays it takes ${m[1]} days, longer than the ${m[2]}-day deadline.`;
  m = reason.match(/^on-time probability (\d+%) is below the (\d+%) target/);
  if (m) return `On time in only ${m[1]} of trips. This cargo needs at least ${m[2]}.`;
  m = reason.match(/^(.*) is at least as good on cost, time, reliability, risk and CO2$/);
  if (m) {
    return `${plainRouteName(m[1])} is as good or better on price, time, lateness, trouble and pollution.`;
  }
  return capitalize(plainNames(reason));
}

/** Rewrite an engine "what would change it" sentence in plain words. */
export function plainTipping(sentence: string): string {
  let s = sentence;
  s = s.replace(
    /^At a carbon price above (\$[\d,]+)\/tonne \(now (\$[\d,]+)\), (.*) would win\.$/,
    "If pollution cost more than $1 a tonne (now $2), $3 would win."
  );
  s = s.replace(
    /^If (.*)'s delay and disruption risk were (\d+%) lower \(disruption chance ([\d.]+%) -> ([\d.]+%)\), it would become the pick\.$/,
    "If $1 had $2 less risk of delays and trouble (chance of trouble $4 instead of $3), it would become our pick."
  );
  s = s.replace(
    /^If (.*)'s delay and disruption risk were (\d+%) lower, it would become the pick\.$/,
    "If $1 had $2 less risk of delays and trouble, it would become our pick."
  );
  s = s.replace(
    /^If (.*)'s risk is underestimated by more than (\d+%), (.*) would take over\.$/,
    "If $1 is more than $2 riskier than we think, $3 would take over."
  );
  s = s.replace(
    /^(.*) stays the pick even if its risk is (\d+)x higher than estimated\.$/,
    "$1 stays our pick even if it is $2 times riskier than we think."
  );
  s = s.replace(/^If a late day cost the customer more than/, "If each late day cost more than");
  s = s.replace(/^If a late day cost less than/, "If each late day cost less than");
  return plainNames(s);
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

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
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
  return Number.isInteger(val) ? val.toString() : val.toFixed(1);
}

export function formatCount(val: number): string {
  return val.toLocaleString("en-US");
}

/** "1 in 10" style wording for a share such as 0.1. */
export function oneIn(share: number): string {
  return `1 in ${Math.round(1 / share)}`;
}

/**
 * One short line for a route card, comparing it with the other routes that were simulated.
 * Only states facts that hold for the numbers on screen.
 */
export function describeRoute(route: RouteItem, allRoutes: RouteItem[]): string {
  if (route.status === "not allowed") {
    return "Breaks a rule for this shipment.";
  }

  // Compare with every way, using planned days for ways that were not tried
  const valid = allRoutes;
  if (!route.metrics || allRoutes.filter((r) => r.metrics).length < 2) {
    return "The only way left to test.";
  }
  const daysOf = (r: RouteItem) => (r.metrics ? r.metrics.mean_days : r.planned_days);

  const minBy = (f: (r: RouteItem) => number) =>
    valid.reduce((best, r) => (f(r) < f(best) ? r : best));
  const maxBy = (f: (r: RouteItem) => number) =>
    valid.reduce((best, r) => (f(r) > f(best) ? r : best));

  const tried = allRoutes.filter((r) => r.metrics);
  const isFastest = minBy(daysOf).id === route.id;
  const isSlowest = maxBy(daysOf).id === route.id;
  const isCheapest = minBy((r) => r.freight_usd).id === route.id;
  const isPriciest = maxBy((r) => r.freight_usd).id === route.id;
  const isRiskiest =
    tried.reduce((best, r) => (r.metrics!.p_disruption > best.metrics!.p_disruption ? r : best)).id === route.id;

  if (isFastest && isPriciest) return "Fastest, and the most expensive ticket.";
  if (isCheapest && isSlowest) return "Cheapest ticket, and the slowest.";
  if (isFastest) return "The fastest way.";
  if (isCheapest) return "The cheapest ticket.";
  if (isRiskiest) return "The biggest chance of trouble of the ways we tried.";
  if (route.stops.length > 2) {
    return `Changes at ${route.stops.slice(1, -1).join(", ")}.`;
  }
  return "In between on price and time.";
}
