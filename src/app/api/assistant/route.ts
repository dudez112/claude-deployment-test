import { answer } from "@/lib/assistant";
import type { FleetSnapshot } from "@/lib/types";

const MAX_MESSAGE = 500;
const MAX_MODELS = 20;

const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, max = 64) => (typeof v === "string" ? v.slice(0, max) : "");

/** Validate and normalise an untrusted snapshot from the client. */
function parseSnapshot(raw: unknown): FleetSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.models) || r.models.length === 0 || r.models.length > MAX_MODELS) return null;
  const totals = (r.totals ?? {}) as Record<string, unknown>;
  const thresholds = (r.thresholds ?? {}) as Record<string, unknown>;

  const models = r.models.map((m) => {
    const o = (m ?? {}) as Record<string, unknown>;
    return {
      id: str(o.id),
      name: str(o.name),
      region: str(o.region),
      online: o.online === true,
      weight: num(o.weight),
      capacity: num(o.capacity, 1),
      rps: num(o.rps),
      p50: num(o.p50),
      p95: num(o.p95),
      errorRate: num(o.errorRate),
      load: num(o.load),
    };
  });
  if (models.some((m) => !m.id || !m.name)) return null;

  return {
    models,
    totals: {
      rps: num(totals.rps),
      p95: num(totals.p95),
      errorRate: num(totals.errorRate),
      demand: num(totals.demand),
    },
    thresholds: { p95Ms: num(thresholds.p95Ms, 900), errorPct: num(thresholds.errorPct, 2) },
    openAlerts: num(r.openAlerts),
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON body with message and snapshot." }, { status: 400 });
  }

  const { message, snapshot } = (body ?? {}) as { message?: unknown; snapshot?: unknown };
  if (typeof message !== "string" || message.length > MAX_MESSAGE) {
    return Response.json(
      { error: `message must be a string of at most ${MAX_MESSAGE} characters.` },
      { status: 400 },
    );
  }
  const parsed = parseSnapshot(snapshot);
  if (!parsed) {
    return Response.json({ error: "snapshot is missing or malformed." }, { status: 400 });
  }

  return Response.json(answer(message, parsed), {
    headers: { "Cache-Control": "no-store" },
  });
}
