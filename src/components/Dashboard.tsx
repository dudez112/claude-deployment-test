"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { actionToEvent, buildSnapshot, historyToCsv } from "@/lib/fleet";
import type { AssistantAction, Sample } from "@/lib/types";
import { useFleet } from "@/hooks/useFleet";
import { useServerHealth, type ServerHealth } from "@/hooks/useServerHealth";
import { AlertsPanel } from "./AlertsPanel";
import { AssistantPanel } from "./AssistantPanel";
import { CommandPalette, type Command } from "./CommandPalette";
import { CostPlanner } from "./CostPlanner";
import { FleetTable } from "./FleetTable";
import { MeshCanvas } from "./MeshCanvas";
import { TelemetryChart } from "./TelemetryChart";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "models", label: "Models" },
  { id: "alerts", label: "Alerts" },
  { id: "assistant", label: "Assistant" },
  { id: "planner", label: "Cost planner" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const scrollToSection = (id: string) => {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
};

export function Dashboard() {
  const { state, dispatch } = useFleet();
  const health = useServerHealth();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [exportNote, setExportNote] = useState<string | null>(null);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const getSnapshot = useCallback(() => buildSnapshot(stateRef.current), []);

  const applyActions = useCallback(
    (actions: AssistantAction[]) => actions.forEach((a) => dispatch(actionToEvent(a))),
    [dispatch],
  );

  const exportCsv = useCallback(() => {
    const history = stateRef.current.history;
    if (!history.length) {
      setExportNote("No readings to export yet.");
      return;
    }
    const blob = new Blob([historyToCsv(history)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lumen-telemetry-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setExportNote(`Exported ${history.length} readings.`);
  }, []);

  useEffect(() => {
    if (!exportNote) return;
    const id = window.setTimeout(() => setExportNote(null), 3000);
    return () => window.clearTimeout(id);
  }, [exportNote]);

  // ⌘K / Ctrl+K opens the command menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Highlight the nav item for the section in view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id as SectionId);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const commands = useMemo<Command[]>(
    () => [
      ...SECTIONS.map((s) => ({ id: `go-${s.id}`, group: "Go to", label: s.label, run: () => scrollToSection(s.id) })),
      {
        id: "toggle-stream",
        group: "Telemetry",
        label: state.paused ? "Resume live stream" : "Pause live stream",
        run: () => dispatch({ type: "setPaused", paused: !state.paused }),
      },
      { id: "export", group: "Telemetry", label: "Export readings as CSV", run: exportCsv },
      { id: "ack", group: "Alerts", label: "Acknowledge all alerts", run: () => dispatch({ type: "ackAll" }) },
      ...state.models.map((m) => ({
        id: `toggle-${m.id}`,
        group: "Models",
        label: `${m.online ? "Take" : "Bring"} ${m.name} ${m.online ? "offline" : "online"}`,
        run: () => dispatch({ type: "setOnline", modelId: m.id, online: !m.online }),
      })),
      { id: "reset", group: "Fleet", label: "Reset fleet to defaults", run: () => dispatch({ type: "reset" }) },
    ],
    [state.paused, state.models, dispatch, exportCsv],
  );

  const names = useMemo(() => Object.fromEntries(state.models.map((m) => [m.id, m.name])), [state.models]);
  const latest = state.history[state.history.length - 1];
  const now = latest?.at ?? 0;

  return (
    <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line/70 px-5 py-6 lg:flex">
        <Brand />
        <nav aria-label="Sections" className="mt-10 space-y-1">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                scrollToSection(s.id);
              }}
              aria-current={activeSection === s.id ? "location" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                activeSection === s.id ? "bg-raised text-ink" : "text-mute hover:text-ink"
              }`}
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${activeSection === s.id ? "bg-signal" : "bg-line"}`}
              />
              {s.label}
            </a>
          ))}
        </nav>
        <button
          onClick={() => setPaletteOpen(true)}
          className="mt-8 flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm text-mute hover:text-ink"
        >
          Commands
          <kbd className="rounded bg-raised px-1.5 py-0.5 text-xs">⌘K</kbd>
        </button>
        <div className="mt-auto">
          <ServerStatus health={health} />
        </div>
      </aside>

      <div className="min-w-0">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 border-b border-line/70 bg-night/85 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Brand />
            <button
              onClick={() => setPaletteOpen(true)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-mute"
              aria-label="Open command menu"
            >
              Commands
            </button>
          </div>
          <nav aria-label="Sections" className="scrollbar-none flex gap-1 overflow-x-auto px-3 pb-2">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(s.id);
                }}
                aria-current={activeSection === s.id ? "location" : undefined}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${
                  activeSection === s.id ? "bg-raised text-ink" : "text-mute"
                }`}
              >
                {s.label}
              </a>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-[88rem] space-y-16 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          <section id="overview" tabIndex={-1} aria-labelledby="overview-title" className="focus:outline-none">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 id="overview-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  Inference fleet
                </h1>
                <p className="mt-2 max-w-xl text-sm text-mute">
                  Live traffic across five models in four regions. Shift weight, take models offline or ask the
                  assistant, and the map and charts respond within a second.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                    state.paused ? "border-amber/50 text-amber" : "border-signal/40 text-signal"
                  }`}
                  aria-live="polite"
                >
                  <span
                    aria-hidden
                    className={`h-2 w-2 rounded-full ${state.paused ? "bg-amber" : "animate-pulse-ring bg-signal"}`}
                  />
                  {state.paused ? "Paused" : "Live"}
                </span>
                <button
                  onClick={() => dispatch({ type: "setPaused", paused: !state.paused })}
                  className="rounded-full bg-raised px-4 py-1.5 text-sm hover:bg-line"
                >
                  {state.paused ? "Resume stream" : "Pause stream"}
                </button>
                <button
                  onClick={exportCsv}
                  className="rounded-full border border-line px-4 py-1.5 text-sm text-mute hover:text-ink"
                >
                  Export CSV
                </button>
              </div>
            </div>
            {exportNote && (
              <p role="status" className="mt-3 text-xs text-signal">
                {exportNote}
              </p>
            )}

            <Readouts latest={latest} history={state.history} state={state} />

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="relative h-[22rem] overflow-hidden rounded-2xl border border-line bg-deep/70 lg:col-span-5 lg:h-auto lg:min-h-[22rem]">
                <p className="absolute top-4 left-4 z-10 text-xs text-mute">Routing map</p>
                <MeshCanvas
                  models={state.models}
                  metrics={state.metrics}
                  thresholds={state.thresholds}
                  paused={state.paused}
                  demand={latest?.demand ?? 0}
                />
              </div>
              <div className="min-w-0 rounded-2xl border border-line bg-panel/60 p-4 sm:p-5 lg:col-span-7">
                <TelemetryChart history={state.history} p95Limit={state.thresholds.p95Ms} />
              </div>
            </div>
          </section>

          <section id="models" tabIndex={-1} aria-labelledby="models-title" className="focus:outline-none">
            <SectionHeading id="models-title" title="Models">
              Traffic splits by weight across online models. Push one past its capacity and latency and errors climb.
            </SectionHeading>
            <FleetTable models={state.models} metrics={state.metrics} thresholds={state.thresholds} dispatch={dispatch} />
          </section>

          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-6">
            <section id="alerts" tabIndex={-1} aria-labelledby="alerts-title" className="min-w-0 focus:outline-none lg:col-span-5">
              <SectionHeading id="alerts-title" title="Alerts">
                Raised when a model crosses your limits. Repeats are held back for 30 seconds.
              </SectionHeading>
              <AlertsPanel alerts={state.alerts} thresholds={state.thresholds} now={now} dispatch={dispatch} />
            </section>

            <section
              id="assistant"
              tabIndex={-1}
              aria-labelledby="assistant-title"
              className="flex min-w-0 flex-col focus:outline-none lg:col-span-7"
            >
              <SectionHeading id="assistant-title" title="Ops assistant">
                Answers from the live snapshot on the server and can change the fleet for you.
              </SectionHeading>
              <div className="flex-1 rounded-2xl border border-line bg-panel/60 p-4 sm:p-5">
                <AssistantPanel getSnapshot={getSnapshot} onActions={applyActions} names={names} />
              </div>
            </section>
          </div>

          <section id="planner" tabIndex={-1} aria-labelledby="planner-title" className="focus:outline-none">
            <SectionHeading id="planner-title" title="Cost planner">
              Estimate what a workload costs on each model before you route it.
            </SectionHeading>
            <div className="rounded-2xl border border-line bg-panel/60 p-4 sm:p-6">
              <CostPlanner models={state.models} />
            </div>
          </section>

          <footer className="flex flex-col gap-3 border-t border-line/70 pt-6 text-xs text-faint sm:flex-row sm:justify-between">
            <p>Lumen is a demo console. Traffic is simulated in your browser; the assistant and health check run on the server.</p>
            <div className="lg:hidden">
              <ServerStatus health={health} />
            </div>
          </footer>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <svg aria-hidden viewBox="0 0 32 32" className="h-7 w-7">
        <circle cx="16" cy="16" r="13" fill="none" stroke="var(--color-line)" strokeWidth="2" strokeDasharray="2 3" />
        <circle cx="16" cy="16" r="4.5" fill="var(--color-plasma)" />
        <circle cx="16" cy="3" r="2.5" fill="var(--color-signal)" />
        <circle cx="27.3" cy="22.5" r="2.5" fill="var(--color-signal)" />
        <circle cx="4.7" cy="22.5" r="2.5" fill="var(--color-amber)" />
      </svg>
      <span className="font-display text-lg font-semibold tracking-tight">Lumen</span>
    </div>
  );
}

function SectionHeading({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 id={id} className="font-display text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-mute">{children}</p>
    </div>
  );
}

function Readouts({
  latest,
  history,
  state,
}: {
  latest: Sample | undefined;
  history: Sample[];
  state: ReturnType<typeof useFleet>["state"];
}) {
  const ref = history[history.length - 61];
  const online = state.models.filter((m) => m.online && m.weight > 0).length;
  const { p95Ms, errorPct } = state.thresholds;

  const items = [
    {
      label: "Throughput",
      value: latest ? latest.rps.toFixed(0) : "—",
      unit: "req/s",
      delta: latest && ref ? latest.rps - ref.rps : null,
      deltaUnit: "",
      tone: latest && latest.rps < latest.demand * 0.5 ? "text-coral" : "text-ink",
      goodWhenUp: true,
    },
    {
      label: "p95 latency",
      value: latest ? String(latest.p95) : "—",
      unit: "ms",
      delta: latest && ref ? latest.p95 - ref.p95 : null,
      deltaUnit: " ms",
      tone: !latest ? "text-ink" : latest.p95 > p95Ms * 1.5 ? "text-coral" : latest.p95 > p95Ms ? "text-amber" : "text-ink",
      goodWhenUp: false,
    },
    {
      label: "Error rate",
      value: latest ? (latest.errorRate * 100).toFixed(2) : "—",
      unit: "%",
      delta: latest && ref ? (latest.errorRate - ref.errorRate) * 100 : null,
      deltaUnit: " pts",
      tone:
        !latest ? "text-ink" : latest.errorRate * 100 > errorPct * 3 ? "text-coral" : latest.errorRate * 100 > errorPct ? "text-amber" : "text-ink",
      goodWhenUp: false,
    },
    {
      label: "Models serving",
      value: String(online),
      unit: `of ${state.models.length}`,
      delta: null,
      deltaUnit: "",
      tone: online === 0 ? "text-coral" : "text-ink",
      goodWhenUp: true,
    },
  ];

  return (
    <dl className="mt-8 grid grid-cols-2 gap-y-6 border-y border-line/70 py-5 md:grid-cols-4 md:divide-x md:divide-line/70">
      {items.map((it) => (
        <div key={it.label} className="px-1 md:px-6 md:first:pl-0">
          <dt className="text-xs text-mute">{it.label}</dt>
          <dd className="mt-1 flex items-baseline gap-1.5">
            <span className={`font-display text-2xl font-semibold sm:text-3xl ${it.tone}`}>{it.value}</span>
            <span className="text-xs text-mute">{it.unit}</span>
          </dd>
          {it.delta !== null && Math.abs(it.delta) >= 0.005 && (
            <dd
              className={`mt-1 text-xs ${
                (it.delta > 0) === it.goodWhenUp ? "text-signal" : "text-coral"
              }`}
            >
              {it.delta > 0 ? "+" : "−"}
              {Math.abs(it.delta).toFixed(it.deltaUnit === " pts" ? 2 : 0)}
              {it.deltaUnit} vs a minute ago
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

function ServerStatus({ health }: { health: ServerHealth }) {
  const color = health.state === "ok" ? "bg-signal" : health.state === "down" ? "bg-coral" : "bg-amber";
  return (
    <div className="text-xs">
      <p className="flex items-center gap-2 text-mute">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${color}`} />
        {health.state === "ok"
          ? `API healthy in ${health.region}`
          : health.state === "down"
            ? "API unreachable"
            : "Checking API"}
      </p>
      {health.state === "ok" && (
        <p className="mt-1 pl-3.5 text-faint">
          {health.roundTripMs} ms round trip
          {health.commit ? `, build ${health.commit}` : ""}
        </p>
      )}
    </div>
  );
}
