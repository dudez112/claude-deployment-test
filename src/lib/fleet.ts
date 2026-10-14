import { DEFAULT_MODELS } from "./models";
import type {
  AssistantAction,
  FleetAlert,
  FleetSnapshot,
  ModelConfig,
  ModelMetrics,
  Sample,
  Thresholds,
} from "./types";

export const HISTORY_LIMIT = 240;
export const DEFAULT_THRESHOLDS: Thresholds = { p95Ms: 900, errorPct: 2 };
const ALERT_COOLDOWN_MS = 30_000;
const ALERT_LIMIT = 50;

export interface FleetState {
  models: ModelConfig[];
  metrics: Record<string, ModelMetrics>;
  history: Sample[];
  alerts: FleetAlert[];
  thresholds: Thresholds;
  paused: boolean;
  tick: number;
}

export type FleetEvent =
  | { type: "tick"; at: number; seed: number }
  | { type: "warmup"; at: number; seed: number; count: number }
  | { type: "hydrate"; models?: ModelConfig[]; thresholds?: Thresholds }
  | { type: "setOnline"; modelId: string; online: boolean }
  | { type: "setWeight"; modelId: string; weight: number }
  | { type: "setThreshold"; key: keyof Thresholds; value: number }
  | { type: "setPaused"; paused: boolean }
  | { type: "ack"; alertId: string }
  | { type: "ackAll" }
  | { type: "clearAlerts" }
  | { type: "reset" };

export function initialFleetState(): FleetState {
  return {
    models: DEFAULT_MODELS.map((m) => ({ ...m })),
    metrics: {},
    history: [],
    alerts: [],
    thresholds: { ...DEFAULT_THRESHOLDS },
    paused: false,
    tick: 0,
  };
}

/** Small deterministic PRNG so the reducer stays pure. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, digits = 1) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/** Incoming request demand for a given tick: daily-ish wave, jitter and rare bursts. */
export function demandAt(tick: number, rand: () => number) {
  const wave = 150 + 55 * Math.sin(tick / 22) + 25 * Math.sin(tick / 7.3);
  const jitter = (rand() - 0.5) * 30;
  const burst = rand() < 0.03 ? 90 + rand() * 80 : 0;
  return Math.max(0, wave + jitter + burst);
}

export interface StepResult {
  metrics: Record<string, ModelMetrics>;
  sample: Sample;
}

/** Route demand across online models by weight and compute per-model health. */
export function simulateStep(
  models: ModelConfig[],
  tick: number,
  at: number,
  rand: () => number,
): StepResult {
  const demand = demandAt(tick, rand);
  const routable = models.filter((m) => m.online && m.weight > 0);
  const weightSum = routable.reduce((s, m) => s + m.weight, 0);
  const metrics: Record<string, ModelMetrics> = {};

  let served = 0;
  let failed = 0;
  let latencyWeighted = 0;

  for (const m of models) {
    if (!m.online || m.weight <= 0 || weightSum === 0) {
      metrics[m.id] = { rps: 0, p50: 0, p95: 0, errorRate: 0, load: 0 };
      continue;
    }
    const rps = (demand * m.weight) / weightSum;
    const load = rps / m.capacity;
    const congestion = 1 + Math.pow(load, 3) * 1.6;
    const p50 = m.baseLatency * congestion * (0.92 + rand() * 0.16);
    const p95 = p50 * (1.55 + Math.min(load, 2) * 0.6 + rand() * 0.15);
    const overload = Math.max(0, load - 0.9);
    const errorRate = clamp(0.002 + overload * 0.35 + rand() * 0.003, 0, 1);

    metrics[m.id] = {
      rps: round(rps),
      p50: Math.round(p50),
      p95: Math.round(p95),
      errorRate: round(errorRate, 4),
      load: round(load, 3),
    };
    served += rps;
    failed += rps * errorRate;
    latencyWeighted += p95 * rps;
  }

  const fleetP95 = served > 0 ? latencyWeighted / served : 0;
  // With nothing routable, every request is rejected.
  const fleetError = served > 0 ? failed / served : demand > 0 ? 1 : 0;

  return {
    metrics,
    sample: {
      at,
      demand: round(demand),
      rps: round(served),
      p95: Math.round(fleetP95),
      errorRate: round(fleetError, 4),
    },
  };
}

function nextAlerts(state: FleetState, step: StepResult, at: number): FleetAlert[] {
  const { thresholds } = state;
  const fresh: FleetAlert[] = [];
  const recentlyRaised = (modelId: string | null, kind: FleetAlert["kind"]) =>
    state.alerts.some(
      (a) =>
        a.modelId === modelId && a.kind === kind && !a.acknowledged && at - a.at < ALERT_COOLDOWN_MS,
    );

  const anyOnline = state.models.some((m) => m.online && m.weight > 0);
  if (!anyOnline && !recentlyRaised(null, "outage")) {
    fresh.push({
      id: `${at}-outage`,
      at,
      modelId: null,
      kind: "outage",
      severity: "critical",
      message: "No models are taking traffic. Every request is being rejected.",
      acknowledged: false,
    });
  }

  for (const m of state.models) {
    const mm = step.metrics[m.id];
    if (!mm || mm.rps === 0) continue;
    if (mm.p95 > thresholds.p95Ms && !recentlyRaised(m.id, "latency")) {
      fresh.push({
        id: `${at}-${m.id}-latency`,
        at,
        modelId: m.id,
        kind: "latency",
        severity: mm.p95 > thresholds.p95Ms * 1.5 ? "critical" : "warning",
        message: `${m.name} p95 latency is ${mm.p95} ms, over the ${thresholds.p95Ms} ms limit.`,
        acknowledged: false,
      });
    }
    if (mm.errorRate * 100 > thresholds.errorPct && !recentlyRaised(m.id, "errors")) {
      fresh.push({
        id: `${at}-${m.id}-errors`,
        at,
        modelId: m.id,
        kind: "errors",
        severity: mm.errorRate * 100 > thresholds.errorPct * 3 ? "critical" : "warning",
        message: `${m.name} is failing ${(mm.errorRate * 100).toFixed(1)}% of requests (limit ${thresholds.errorPct}%).`,
        acknowledged: false,
      });
    }
  }

  return fresh.length ? [...fresh, ...state.alerts].slice(0, ALERT_LIMIT) : state.alerts;
}

function advance(state: FleetState, at: number, rand: () => number, raiseAlerts: boolean): FleetState {
  const step = simulateStep(state.models, state.tick, at, rand);
  const history = [...state.history, step.sample].slice(-HISTORY_LIMIT);
  return {
    ...state,
    metrics: step.metrics,
    history,
    alerts: raiseAlerts ? nextAlerts(state, step, at) : state.alerts,
    tick: state.tick + 1,
  };
}

export function fleetReducer(state: FleetState, event: FleetEvent): FleetState {
  switch (event.type) {
    case "tick": {
      if (state.paused) return state;
      return advance(state, event.at, mulberry32(event.seed), true);
    }
    case "warmup": {
      if (state.history.length > 0) return state;
      const rand = mulberry32(event.seed);
      let next = state;
      for (let i = event.count; i > 0; i--) {
        next = advance(next, event.at - i * 1000, rand, false);
      }
      return next;
    }
    case "hydrate": {
      const models = event.models
        ? state.models.map((m) => {
            const saved = event.models!.find((s) => s.id === m.id);
            return saved
              ? { ...m, online: Boolean(saved.online), weight: clamp(Number(saved.weight) || 0, 0, 100) }
              : m;
          })
        : state.models;
      return {
        ...state,
        models,
        thresholds: event.thresholds
          ? {
              p95Ms: clamp(Number(event.thresholds.p95Ms) || DEFAULT_THRESHOLDS.p95Ms, 100, 5000),
              errorPct: clamp(Number(event.thresholds.errorPct) || DEFAULT_THRESHOLDS.errorPct, 0.1, 50),
            }
          : state.thresholds,
      };
    }
    case "setOnline":
      return {
        ...state,
        models: state.models.map((m) =>
          m.id === event.modelId
            ? { ...m, online: event.online, weight: event.online && m.weight === 0 ? 10 : m.weight }
            : m,
        ),
      };
    case "setWeight":
      return {
        ...state,
        models: state.models.map((m) =>
          m.id === event.modelId ? { ...m, weight: clamp(Math.round(event.weight), 0, 100) } : m,
        ),
      };
    case "setThreshold": {
      const limits = event.key === "p95Ms" ? [100, 5000] : [0.1, 50];
      return {
        ...state,
        thresholds: { ...state.thresholds, [event.key]: clamp(event.value, limits[0], limits[1]) },
      };
    }
    case "setPaused":
      return { ...state, paused: event.paused };
    case "ack":
      return {
        ...state,
        alerts: state.alerts.map((a) => (a.id === event.alertId ? { ...a, acknowledged: true } : a)),
      };
    case "ackAll":
      return { ...state, alerts: state.alerts.map((a) => ({ ...a, acknowledged: true })) };
    case "clearAlerts":
      return { ...state, alerts: state.alerts.filter((a) => !a.acknowledged) };
    case "reset":
      return {
        ...state,
        models: DEFAULT_MODELS.map((m) => ({ ...m })),
        thresholds: { ...DEFAULT_THRESHOLDS },
        alerts: [],
        paused: false,
      };
  }
}

/** Translate an assistant action into a reducer event. */
export function actionToEvent(action: AssistantAction): FleetEvent {
  switch (action.type) {
    case "pause":
      return { type: "setPaused", paused: true };
    case "resume":
      return { type: "setPaused", paused: false };
    default:
      return action;
  }
}

export function buildSnapshot(state: FleetState): FleetSnapshot {
  const last = state.history[state.history.length - 1];
  return {
    models: state.models.map((m) => ({
      id: m.id,
      name: m.name,
      region: m.region,
      online: m.online,
      weight: m.weight,
      capacity: m.capacity,
      ...(state.metrics[m.id] ?? {}),
    })),
    totals: {
      rps: last?.rps ?? 0,
      p95: last?.p95 ?? 0,
      errorRate: last?.errorRate ?? 0,
      demand: last?.demand ?? 0,
    },
    thresholds: state.thresholds,
    openAlerts: state.alerts.filter((a) => !a.acknowledged).length,
  };
}

export function historyToCsv(history: Sample[]): string {
  const rows = history.map((s) =>
    [new Date(s.at).toISOString(), s.demand, s.rps, s.p95, (s.errorRate * 100).toFixed(2)].join(","),
  );
  return ["timestamp,demand_rps,served_rps,p95_ms,error_pct", ...rows].join("\n");
}
