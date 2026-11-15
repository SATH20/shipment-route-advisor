import {
  Assumption,
  EvaluationData,
  ScenarioResult,
  ShipmentDetail,
  ShipmentSummary,
  ModelSettings,
  WorldEvent,
} from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const API_URL = API_BASE_URL;

async function request<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
    });

    if (!res.ok) {
      let detail = `Error ${res.status}: ${res.statusText}`;
      try {
        const body = await res.json();
        if (body.detail) {
          detail = body.detail;
        }
      } catch {
        // use default error text
      }
      throw new ApiError(detail, res.status);
    }

    return (await res.json()) as T;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(`The route engine at ${API_BASE_URL} is not answering.`);
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
