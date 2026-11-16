import {
  Assumption,
  EvaluationData,
  ScenarioResult,
  ShipmentDetail,
  ShipmentSummary,
  ModelSettings,
  WorldEvent,
} from "./types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

export class ApiError extends Error {
  status?: number;
  /** For a 422: each problem the API found, with the field it is about. */
  problems: { field: string; message: string }[];
  constructor(message: string, status?: number, problems: { field: string; message: string }[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problems = problems;
  }
}

/** Turn a FastAPI validation location like ["body","routes",0,"legs",1,"delay_prob"] into words. */
function fieldName(loc: unknown): string {
  if (!Array.isArray(loc)) return "";
  const parts: string[] = [];
  for (let i = 0; i < loc.length; i++) {
    const p = loc[i];
    if (p === "body" || p === "query") continue;
    const next = loc[i + 1];
    if ((p === "routes" || p === "legs") && typeof next === "number") {
      parts.push(`${p === "routes" ? "route" : "leg"} ${next + 1}`);
      i++;
    } else {
      parts.push(String(p));
    }
  }
  return parts.join(", ");
}

export const API_URL = API_BASE_URL;

/** True when the API runs on this machine (then there is no host to wake up). */
export const API_IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(API_BASE_URL);

// Free hosting (Render) puts the API to sleep; the first request wakes it, which can take
// up to a minute. Requests keep retrying for WAKE_BUDGET_MS before giving up.
const WAKE_BUDGET_MS = API_IS_LOCAL ? 8_000 : 90_000;
const SLOW_MS = 4_000; // after this long, check whether the server is up at all
const HEALTH_TIMEOUT_MS = 3_000;
const RETRY_DELAY_MS = 3_000;
const MIN_ATTEMPT_MS = 60_000; // never cut off a slow but running computation sooner
const RETRY_STATUSES = [502, 503, 504]; // what a proxy answers while the app is still starting

// --- "server is starting" signal for the notice in the layout ---------------------------
type WakeListener = (waking: boolean) => void;
const wakeListeners = new Set<WakeListener>();
let wakingRequests = 0;

function notify() {
  wakeListeners.forEach((l) => l(wakingRequests > 0));
}

export function onServerWaking(listener: WakeListener): () => void {
  wakeListeners.add(listener);
  listener(wakingRequests > 0);
  return () => {
    wakeListeners.delete(listener);
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function serverIsUp(): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function request<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const start = Date.now();
  let waking = false;
  let done = false;
  const markWaking = () => {
    if (!waking && !done) {
      waking = true;
      wakingRequests += 1;
      notify();
    }
  };
  // A slow answer is normal for a busy server; only show the notice if it is not up at all.
  const slowCheck = setTimeout(() => {
    serverIsUp().then((up) => {
      if (!up) markWaking();
    });
  }, SLOW_MS);

  try {
    for (;;) {
      const remaining = WAKE_BUDGET_MS - (Date.now() - start);
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), Math.max(remaining, MIN_ATTEMPT_MS));
      let res: Response;
      try {
        res = await fetch(url, {
          ...init,
          signal: ctrl.signal,
          headers: { Accept: "application/json", ...init?.headers },
        });
      } catch {
        // network error or timeout: the server may still be starting
        clearTimeout(timeout);
        if (Date.now() - start + RETRY_DELAY_MS < WAKE_BUDGET_MS) {
          markWaking();
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw new ApiError(`The route engine at ${API_BASE_URL} is not answering.`);
      }
      clearTimeout(timeout);

      if (RETRY_STATUSES.includes(res.status) && Date.now() - start + RETRY_DELAY_MS < WAKE_BUDGET_MS) {
        markWaking();
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      if (!res.ok) {
        let detail = `Error ${res.status}: ${res.statusText}`;
        let problems: { field: string; message: string }[] = [];
        try {
          const body = await res.json();
          if (typeof body.detail === "string") detail = body.detail;
          if (Array.isArray(body.detail)) {
            problems = body.detail.map((d: { loc?: unknown; msg?: unknown }) => ({
              field: fieldName(d.loc),
              message: String(d.msg ?? "").replace(/^Value error, /, ""),
            }));
            detail = problems.map((p) => (p.field ? `${p.field}: ${p.message}` : p.message)).join(" ");
          }
        } catch {
          // use default error text
        }
        throw new ApiError(detail, res.status, problems);
      }
      return (await res.json()) as T;
    }
  } finally {
    done = true;
    clearTimeout(slowCheck);
    if (waking) {
      wakingRequests -= 1;
      notify();
    }
  }
}

export async function fetchShipments(): Promise<ShipmentSummary[]> {
  return request<ShipmentSummary[]>("/api/shipments");
}

export interface FetchShipmentOptions {
  mode?: string;
  events?: string;
  penalty?: number;
  deadline_shift?: number;
  carbon?: number;
  min_on_time?: number;
}

export async function fetchShipment(
  id: string,
  options?: FetchShipmentOptions
): Promise<ShipmentDetail> {
  const params = new URLSearchParams();
  if (options?.mode) params.set("mode", options.mode);
  if (options?.events) params.set("events", options.events);
  if (options?.penalty !== undefined && options.penalty !== null) {
    params.set("penalty", options.penalty.toString());
  }
  if (options?.deadline_shift !== undefined && options.deadline_shift !== null) {
    params.set("deadline_shift", options.deadline_shift.toString());
  }
  if (options?.carbon !== undefined && options.carbon !== null) {
    params.set("carbon", options.carbon.toString());
  }
  if (options?.min_on_time !== undefined && options.min_on_time !== null) {
    params.set("min_on_time", options.min_on_time.toString());
  }

  const qs = params.toString();
  const endpoint = `/api/shipments/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`;
  return request<ShipmentDetail>(endpoint);
}

export async function fetchEvaluation(): Promise<EvaluationData> {
  return request<EvaluationData>("/api/evaluation");
}

export async function fetchScenario(name: string): Promise<ScenarioResult> {
  return request<ScenarioResult>(`/api/scenarios/${encodeURIComponent(name)}`);
}

export async function fetchAssumptions(): Promise<Assumption[]> {
  return request<Assumption[]>("/api/assumptions");
}

export async function fetchEvents(): Promise<WorldEvent[]> {
  return request<WorldEvent[]>("/api/events");
}

export async function fetchSettings(): Promise<ModelSettings> {
  return request<ModelSettings>("/api/settings");
}

/** Recommend a route for a shipment that is not in the dataset (POST /api/recommend). */
export async function recommendShipment(shipment: unknown, mode?: string): Promise<ShipmentDetail> {
  const qs = mode ? `?mode=${encodeURIComponent(mode)}` : "";
  return request<ShipmentDetail>(`/api/recommend${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(shipment),
  });
}
