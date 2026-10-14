export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  region: string;
  /** Baseline median latency in ms at low load. */
  baseLatency: number;
  /** Maximum sustainable requests per second before saturation. */
  capacity: number;
  /** USD per 1,000 input tokens. */
  costPer1kIn: number;
  /** USD per 1,000 output tokens. */
  costPer1kOut: number;
  online: boolean;
  /** Relative share of traffic, 0–100. */
  weight: number;
}

export interface ModelMetrics {
  rps: number;
  p50: number;
  p95: number;
  /** Fraction of failed requests, 0–1. */
  errorRate: number;
  /** Utilisation, rps / capacity. */
  load: number;
}

export interface Sample {
  at: number;
  rps: number;
  p95: number;
  errorRate: number;
  demand: number;
}

export type AlertKind = "latency" | "errors" | "outage";

export interface FleetAlert {
  id: string;
  at: number;
  modelId: string | null;
  kind: AlertKind;
  severity: "warning" | "critical";
  message: string;
  acknowledged: boolean;
}

export interface Thresholds {
  /** Fleet p95 latency limit in ms. */
  p95Ms: number;
  /** Error-rate limit as a percentage. */
  errorPct: number;
}

/** Compact view of the fleet sent to the assistant API. */
export interface FleetSnapshot {
  models: Array<
    Pick<ModelConfig, "id" | "name" | "region" | "online" | "weight" | "capacity"> &
      Partial<ModelMetrics>
  >;
  totals: { rps: number; p95: number; errorRate: number; demand: number };
  thresholds: Thresholds;
  openAlerts: number;
}

export type AssistantAction =
  | { type: "setOnline"; modelId: string; online: boolean }
  | { type: "setWeight"; modelId: string; weight: number }
  | { type: "setThreshold"; key: keyof Thresholds; value: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "ackAll" };

export interface AssistantReply {
  reply: string;
  actions: AssistantAction[];
}
