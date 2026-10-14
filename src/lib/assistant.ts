import type { AssistantAction, AssistantReply, FleetSnapshot } from "./types";

type SnapshotModel = FleetSnapshot["models"][number];

const pct = (v: number | undefined) => `${((v ?? 0) * 100).toFixed(1)}%`;
const ms = (v: number | undefined) => `${Math.round(v ?? 0)} ms`;

/** Find the model a message refers to, by full name, id or a word unique to one model. */
export function findModel(text: string, models: SnapshotModel[]): SnapshotModel | null {
  const t = text.toLowerCase();
  const byFull = models.find((m) => t.includes(m.name.toLowerCase()) || t.includes(m.id));
  if (byFull) return byFull;

  const wordCounts = new Map<string, number>();
  for (const m of models) {
    for (const w of new Set(m.name.toLowerCase().split(/\s+/))) {
      wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
    }
  }
  const words = new Set(t.split(/[^a-z0-9-]+/));
  return (
    models.find((m) =>
      m.name
        .toLowerCase()
        .split(/\s+/)
        .some((w) => wordCounts.get(w) === 1 && words.has(w)),
    ) ?? null
  );
}

const live = (models: SnapshotModel[]) => models.filter((m) => m.online && (m.rps ?? 0) > 0);

function summary(s: FleetSnapshot): string {
  const online = s.models.filter((m) => m.online && m.weight > 0);
  if (online.length === 0) {
    return "Nothing is serving traffic right now: every model is offline or has zero weight, so all requests are rejected. Bring a model online to recover.";
  }
  const hot = live(s.models).filter((m) => (m.load ?? 0) > 0.9);
  const status =
    s.totals.p95 > s.thresholds.p95Ms || s.totals.errorRate * 100 > s.thresholds.errorPct
      ? "The fleet is outside its limits."
      : "The fleet is within its limits.";
  const parts = [
    status,
    `${online.length} of ${s.models.length} models are serving ${s.totals.rps.toFixed(0)} req/s with a fleet p95 of ${ms(s.totals.p95)} and ${pct(s.totals.errorRate)} errors.`,
  ];
  if (hot.length) {
    parts.push(
      `${hot.map((m) => `${m.name} (${Math.round((m.load ?? 0) * 100)}% load)`).join(", ")} ${hot.length === 1 ? "is" : "are"} near saturation.`,
    );
  }
  if (s.openAlerts) parts.push(`${s.openAlerts} alert${s.openAlerts === 1 ? " is" : "s are"} unacknowledged.`);
  return parts.join(" ");
}

function recommend(s: FleetSnapshot): AssistantReply {
  const serving = live(s.models);
  if (serving.length === 0) {
    const candidate = [...s.models].sort((a, b) => b.capacity - a.capacity)[0];
    return {
      reply: `Nothing is serving. I'd bring ${candidate.name} online first since it has the most headroom (${candidate.capacity} req/s). Say "bring ${candidate.name} online" and I'll do it.`,
      actions: [],
    };
  }
  const hottest = [...serving].sort((a, b) => (b.load ?? 0) - (a.load ?? 0))[0];
  const coolest = [...serving].sort((a, b) => (a.load ?? 0) - (b.load ?? 0))[0];
  if ((hottest.load ?? 0) < 0.8) {
    return {
      reply: `No change needed. The busiest model, ${hottest.name}, is at ${Math.round((hottest.load ?? 0) * 100)}% of capacity.`,
      actions: [],
    };
  }
  if (hottest.id === coolest.id) {
    const offline = s.models.find((m) => !m.online);
    return {
      reply: offline
        ? `${hottest.name} is carrying everything at ${Math.round((hottest.load ?? 0) * 100)}% load. Bringing ${offline.name} online would spread it out.`
        : `${hottest.name} is carrying everything at ${Math.round((hottest.load ?? 0) * 100)}% load and there is no spare model to shift to.`,
      actions: [],
    };
  }
  const shift = Math.min(15, hottest.weight);
  return {
    reply: `${hottest.name} is at ${Math.round((hottest.load ?? 0) * 100)}% load while ${coolest.name} is at ${Math.round((coolest.load ?? 0) * 100)}%. I moved ${shift} points of traffic weight from ${hottest.name} to ${coolest.name}.`,
    actions: [
      { type: "setWeight", modelId: hottest.id, weight: hottest.weight - shift },
      { type: "setWeight", modelId: coolest.id, weight: Math.min(100, coolest.weight + shift) },
    ],
  };
}

export const HELP_TEXT =
  'Ask me about the fleet ("how are we doing?", "which model is slowest?", "where are the errors?") or tell me to act: "take Vega offline", "set Atlas Mini weight to 60", "set latency limit to 700 ms", "rebalance", "pause the stream", "acknowledge alerts".';

export function answer(message: string, s: FleetSnapshot): AssistantReply {
  const text = message.trim().toLowerCase();
  const actions: AssistantAction[] = [];
  const model = findModel(text, s.models);
  const number = text.match(/(\d+(?:\.\d+)?)/);
  const value = number ? Number(number[1]) : null;

  if (!text) return { reply: HELP_TEXT, actions };

  if (/\b(help|what can you do|commands?)\b/.test(text)) return { reply: HELP_TEXT, actions };

  // Actions first, so "take X offline" isn't read as a status question.
  if (/\b(offline|disable|turn off|shut ?down|drain)\b/.test(text)) {
    if (!model) return { reply: "Which model should I take offline? Name it, for example \"take Vega Code offline\".", actions };
    if (!model.online) return { reply: `${model.name} is already offline.`, actions };
    actions.push({ type: "setOnline", modelId: model.id, online: false });
    const remaining = s.models.filter((m) => m.online && m.weight > 0 && m.id !== model.id);
    return {
      reply: remaining.length
        ? `Took ${model.name} offline. Its traffic is now split across ${remaining.map((m) => m.name).join(", ")}.`
        : `Took ${model.name} offline. That was the last model serving, so requests will now be rejected.`,
      actions,
    };
  }

  if (/\b(online|enable|turn on|bring up|start)\b/.test(text) && !/\bstream\b/.test(text)) {
    if (!model) return { reply: "Which model should I bring online?", actions };
    if (model.online) return { reply: `${model.name} is already online.`, actions };
    actions.push({ type: "setOnline", modelId: model.id, online: true });
    return { reply: `Brought ${model.name} online in ${model.region}. It starts with ${model.weight || 10} points of traffic weight.`, actions };
  }

  if (/\b(weight|route|traffic share|send)\b/.test(text) && model && value !== null) {
    const w = Math.max(0, Math.min(100, Math.round(value)));
    actions.push({ type: "setWeight", modelId: model.id, weight: w });
    return { reply: `Set ${model.name} traffic weight to ${w}.`, actions };
  }

  if (/\b(threshold|limit)\b/.test(text) && value !== null) {
    if (/(error|fail)/.test(text) || /%/.test(text)) {
      const v = Math.max(0.1, Math.min(50, value));
      actions.push({ type: "setThreshold", key: "errorPct", value: v });
      return { reply: `Error-rate alerts now fire above ${v}%.`, actions };
    }
    const v = Math.max(100, Math.min(5000, Math.round(value)));
    actions.push({ type: "setThreshold", key: "p95Ms", value: v });
    return { reply: `Latency alerts now fire when p95 goes above ${v} ms.`, actions };
  }

  if (/\b(pause|freeze|stop)\b/.test(text)) {
    actions.push({ type: "pause" });
    return { reply: "Paused the telemetry stream. Charts will hold their current values.", actions };
  }
  if (/\b(resume|unpause|continue)\b/.test(text)) {
    actions.push({ type: "resume" });
    return { reply: "Resumed the telemetry stream.", actions };
  }

  if (/\b(ack|acknowledge|dismiss|silence)\b/.test(text)) {
    if (s.openAlerts === 0) return { reply: "There are no open alerts.", actions };
    actions.push({ type: "ackAll" });
    return { reply: `Acknowledged ${s.openAlerts} open alert${s.openAlerts === 1 ? "" : "s"}.`, actions };
  }

  if (/\b(rebalance|recommend|suggest|what should|fix|optimi[sz]e)\b/.test(text)) return recommend(s);

  const serving = live(s.models);

  if (/\b(slow|slowest|latency|lag)\b/.test(text)) {
    if (model) {
      return {
        reply: model.online
          ? `${model.name}: p50 ${ms(model.p50)}, p95 ${ms(model.p95)} at ${(model.rps ?? 0).toFixed(1)} req/s.`
          : `${model.name} is offline, so it has no latency to report.`,
        actions,
      };
    }
    if (!serving.length) return { reply: "No model is serving, so there is no latency to compare.", actions };
    const sorted = [...serving].sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0));
    return {
      reply: `Slowest is ${sorted[0].name} at ${ms(sorted[0].p95)} p95; fastest is ${sorted[sorted.length - 1].name} at ${ms(sorted[sorted.length - 1].p95)}. Fleet p95 is ${ms(s.totals.p95)} against a ${s.thresholds.p95Ms} ms limit.`,
      actions,
    };
  }

  if (/\b(fast|fastest|quick)\b/.test(text) && serving.length) {
    const f = [...serving].sort((a, b) => (a.p95 ?? 0) - (b.p95 ?? 0))[0];
    return { reply: `Fastest right now is ${f.name} at ${ms(f.p95)} p95.`, actions };
  }

  if (/\b(error|errors|fail|failing|failures)\b/.test(text)) {
    if (!serving.length) return { reply: `All requests are failing because nothing is serving (${pct(s.totals.errorRate)} errors).`, actions };
    const worst = [...serving].sort((a, b) => (b.errorRate ?? 0) - (a.errorRate ?? 0))[0];
    return {
      reply: `Fleet error rate is ${pct(s.totals.errorRate)}. The highest is ${worst.name} at ${pct(worst.errorRate)}${(worst.load ?? 0) > 0.9 ? `, caused by running at ${Math.round((worst.load ?? 0) * 100)}% of capacity` : ""}.`,
      actions,
    };
  }

  if (/\b(busy|busiest|load|capacity|traffic|throughput|rps)\b/.test(text)) {
    if (!serving.length) return { reply: `Demand is ${s.totals.demand.toFixed(0)} req/s but nothing is serving it.`, actions };
    const lines = [...serving]
      .sort((a, b) => (b.load ?? 0) - (a.load ?? 0))
      .map((m) => `${m.name} ${(m.rps ?? 0).toFixed(0)} req/s (${Math.round((m.load ?? 0) * 100)}%)`);
    return { reply: `Serving ${s.totals.rps.toFixed(0)} of ${s.totals.demand.toFixed(0)} req/s demand. By load: ${lines.join(", ")}.`, actions };
  }

  if (model) {
    return {
      reply: model.online
        ? `${model.name} (${model.region}) is online with weight ${model.weight}: ${(model.rps ?? 0).toFixed(1)} req/s, p95 ${ms(model.p95)}, ${pct(model.errorRate)} errors, ${Math.round((model.load ?? 0) * 100)}% load.`
        : `${model.name} (${model.region}) is offline.`,
      actions,
    };
  }

  if (/\b(status|summary|overview|how are|health|doing|report)\b/.test(text)) return { reply: summary(s), actions };

  return { reply: `I didn't catch that. ${HELP_TEXT}`, actions };
}
