export interface ShipmentSummary {
  id: string;
  cargo: string;
  profile: string;
  origin: string;
  destination: string;
  value_usd: number;
  weight_kg: number;
  deadline_days: number;
  recommended_route_name: string | null;
  confidence_label: string | null;
}

export interface ShipmentMeta {
  id: string;
  cargo: string;
  profile: string;
  origin: string;
  destination: string;
  value_usd: number;
  weight_kg: number;
  deadline_days: number;
  penalty_per_day: number;
  min_on_time: number;
  risk_mode: string;
  hazardous: boolean;
  avoid_regions: string[];
  budget_usd: number | null;
}

export interface RouteMetrics {
  mean_days: number;
  p90_days: number;
  p_on_time: number;
  p_disruption: number;
  exp_late_cost: number;
  exp_loss: number;
  carbon_cost: number;
  exp_total: number;
  cvar_total: number;
  co2_tonnes: number;
}

export interface ArrivalHistogram {
  edges: number[];
  counts: number[];
}

export interface RouteItem {
  id: string;
  name: string;
  stops: string[];
  status: string;
  reasons: string[];
  freight_usd: number;
  planned_days: number;
  metrics: RouteMetrics | null;
  coords: [number, number][];
  passages: string[];
  stop_coords: [number, number][];
  arrival_histogram: ArrivalHistogram | null;
}

export interface ConfidenceData {
  label: string;
  agreement: number;
  runs: number;
  alternatives: Record<string, number>;
}

export interface TippingPoint {
  parameter: string;
  sentence: string;
  new_route: string;
}

export interface ModelSettings {
  n_sims: number;
  confidence_runs: number;
  estimate_noise: number;
  worst_share: number;
  default_carbon_price: number;
  carbon_price: number;
}

export interface WorldEvent {
  id: string;
  title: string;
  description: string;
}

export interface ExplanationData {
  text: string;
  source: string;
}

export interface ShipmentDetail {
  shipment: ShipmentMeta;
  mode: string;
  recommended_route_id: string | null;
  runner_up_id: string | null;
  settings: ModelSettings;
  warnings: string[];
  routes: RouteItem[];
  confidence: ConfidenceData | null;
  tipping: TippingPoint[];
  explanation: ExplanationData;
}

export interface EvaluationData {
  comparison: Record<string, any>[];
  noise_sweep: Record<string, any>[];
  by_profile: Record<string, any>[];
}

export interface ScenarioDetail {
  shipment: string;
  from: string;
  to: string;
  why: string;
}

export interface ScenarioResult {
  name: string;
  rerouted: number;
  forced: number;
  locked_in: number;
  total: number;
  moves: Record<string, number>;
  value_of_replanning: number;
  avg_cost_before: number;
  avg_cost_after: number;
  co2_change: number;
  details: ScenarioDetail[];
}

export interface Assumption {
  name: string;
  value: string;
}
