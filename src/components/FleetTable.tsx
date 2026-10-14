"use client";

import { useMemo, useState } from "react";
import type { FleetEvent } from "@/lib/fleet";
import type { ModelConfig, ModelMetrics, Thresholds } from "@/lib/types";

type SortKey = "name" | "region" | "weight" | "rps" | "p95" | "errorRate" | "load";

interface Props {
  models: ModelConfig[];
  metrics: Record<string, ModelMetrics>;
  thresholds: Thresholds;
  dispatch: (e: FleetEvent) => void;
}

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: "name", label: "Model" },
  { key: "region", label: "Region" },
  { key: "weight", label: "Traffic weight", numeric: true },
  { key: "rps", label: "Req/s", numeric: true },
  { key: "p95", label: "p95", numeric: true },
  { key: "errorRate", label: "Errors", numeric: true },
  { key: "load", label: "Load", numeric: true },
];

function tone(value: number, warn: number, crit: number) {
  if (value > crit) return "text-coral";
  if (value > warn) return "text-amber";
  return "text-ink";
}

export function FleetTable({ models, metrics, thresholds, dispatch }: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "rps", dir: -1 });
  const [onlyOnline, setOnlyOnline] = useState(false);

  const totalWeight = models.filter((m) => m.online).reduce((s, m) => s + m.weight, 0);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = models.filter(
      (m) =>
        (!onlyOnline || m.online) &&
        (!q || `${m.name} ${m.provider} ${m.region}`.toLowerCase().includes(q)),
    );
    const value = (m: ModelConfig): string | number => {
      const mm = metrics[m.id];
      switch (sort.key) {
        case "name":
          return m.name;
        case "region":
          return m.region;
        case "weight":
          return m.weight;
        default:
          return mm?.[sort.key] ?? 0;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === "string" ? va.localeCompare(String(vb)) : va - (vb as number);
      return cmp * sort.dir;
    });
  }, [models, metrics, query, sort, onlyOnline]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" || key === "region" ? 1 : -1 }));

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block sm:w-72">
          <span className="sr-only">Search models</span>
          <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 fill-faint">
            <path d="M8.5 3a5.5 5.5 0 0 1 4.38 8.83l3.65 3.64a.75.75 0 1 1-1.06 1.06l-3.64-3.65A5.5 5.5 0 1 1 8.5 3Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, provider or region"
            className="w-full rounded-lg border border-line bg-deep py-2 pr-3 pl-9 text-sm placeholder:text-faint focus:border-plasma focus:outline-none"
          />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-mute">
          <input
            type="checkbox"
            checked={onlyOnline}
            onChange={(e) => setOnlyOnline(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-plasma)]"
          />
          Online only
        </label>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-line md:block">
        <table className="w-full text-sm">
          <thead className="bg-deep text-left text-xs text-mute">
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  className={`px-4 py-3 font-medium ${c.numeric && c.key !== "weight" ? "text-right" : ""}`}
                >
                  <button
                    onClick={() => toggleSort(c.key)}
                    className={`inline-flex items-center gap-1 hover:text-ink ${sort.key === c.key ? "text-ink" : ""}`}
                  >
                    {c.label}
                    <span aria-hidden className="w-2 text-plasma">
                      {sort.key === c.key ? (sort.dir === 1 ? "▲" : "▼") : ""}
                    </span>
                  </button>
                </th>
              ))}
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const mm = metrics[m.id];
              return (
                <tr key={m.id} className="border-t border-line/70 transition-colors hover:bg-panel/60">
                  <td className="px-4 py-3">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-faint">{m.provider}</p>
                  </td>
                  <td className="px-4 py-3 text-mute">{m.region}</td>
                  <td className="px-4 py-3">
                    <WeightControl model={m} totalWeight={totalWeight} dispatch={dispatch} />
                  </td>
                  <td className="px-4 py-3 text-right">{m.online ? (mm?.rps ?? 0).toFixed(1) : "—"}</td>
                  <td className={`px-4 py-3 text-right ${tone(mm?.p95 ?? 0, thresholds.p95Ms, thresholds.p95Ms * 1.5)}`}>
                    {m.online && mm?.rps ? `${mm.p95} ms` : "—"}
                  </td>
                  <td
                    className={`px-4 py-3 text-right ${tone((mm?.errorRate ?? 0) * 100, thresholds.errorPct, thresholds.errorPct * 3)}`}
                  >
                    {m.online && mm?.rps ? `${((mm.errorRate ?? 0) * 100).toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <LoadBar load={m.online ? mm?.load ?? 0 : 0} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StatusSwitch model={m} dispatch={dispatch} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile list */}
      <ul className="space-y-3 md:hidden">
        {rows.map((m) => {
          const mm = metrics[m.id];
          return (
            <li key={m.id} className="rounded-xl border border-line bg-deep/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-faint">
                    {m.provider}, {m.region}
                  </p>
                </div>
                <StatusSwitch model={m} dispatch={dispatch} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Stat label="Req/s" value={m.online ? (mm?.rps ?? 0).toFixed(1) : "—"} />
                <Stat
                  label="p95"
                  value={m.online && mm?.rps ? `${mm.p95} ms` : "—"}
                  className={tone(mm?.p95 ?? 0, thresholds.p95Ms, thresholds.p95Ms * 1.5)}
                />
                <Stat
                  label="Errors"
                  value={m.online && mm?.rps ? `${((mm.errorRate ?? 0) * 100).toFixed(2)}%` : "—"}
                  className={tone((mm?.errorRate ?? 0) * 100, thresholds.errorPct, thresholds.errorPct * 3)}
                />
              </dl>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-mute">Weight</span>
                <div className="flex-1">
                  <WeightControl model={m} totalWeight={totalWeight} dispatch={dispatch} />
                </div>
              </div>
              <div className="mt-2">
                <LoadBar load={m.online ? mm?.load ?? 0 : 0} wide />
              </div>
            </li>
          );
        })}
      </ul>

      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-mute">
          No models match “{query}”. Clear the search to see the whole fleet.
        </p>
      )}
    </div>
  );
}

function WeightControl({
  model,
  totalWeight,
  dispatch,
}: {
  model: ModelConfig;
  totalWeight: number;
  dispatch: (e: FleetEvent) => void;
}) {
  const share = model.online && totalWeight > 0 ? Math.round((model.weight / totalWeight) * 100) : 0;
  return (
    <div className="flex min-w-36 items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        value={model.weight}
        disabled={!model.online}
        onChange={(e) => dispatch({ type: "setWeight", modelId: model.id, weight: Number(e.target.value) })}
        aria-label={`${model.name} traffic weight`}
        aria-valuetext={`${model.weight}, ${share}% of traffic`}
        style={{ "--fill": `${model.weight}%` } as React.CSSProperties}
        className="w-full"
      />
      <span className="w-10 text-right text-xs text-mute">{share}%</span>
    </div>
  );
}

function StatusSwitch({ model, dispatch }: { model: ModelConfig; dispatch: (e: FleetEvent) => void }) {
  return (
    <button
      role="switch"
      aria-checked={model.online}
      aria-label={`${model.name} ${model.online ? "online" : "offline"}`}
      onClick={() => dispatch({ type: "setOnline", modelId: model.id, online: !model.online })}
      className="inline-flex items-center gap-2 text-xs"
    >
      <span className={model.online ? "text-signal" : "text-faint"}>{model.online ? "Online" : "Offline"}</span>
      <span
        className={`relative h-5 w-9 rounded-full transition-colors ${model.online ? "bg-signal/30" : "bg-line"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${
            model.online ? "left-[18px] bg-signal" : "left-0.5 bg-faint"
          }`}
        />
      </span>
    </button>
  );
}

function LoadBar({ load, wide }: { load: number; wide?: boolean }) {
  const pct = Math.round(load * 100);
  const color = load > 1 ? "bg-coral" : load > 0.85 ? "bg-amber" : "bg-signal";
  return (
    <div className={`inline-flex items-center gap-2 ${wide ? "w-full" : ""}`}>
      <div className={`h-1.5 overflow-hidden rounded-full bg-line ${wide ? "flex-1" : "w-16"}`}>
        <div className={`h-full ${color} transition-[width] duration-500`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="w-10 text-right text-xs text-mute">{pct}%</span>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <dt className="text-faint">{label}</dt>
      <dd className={`mt-0.5 text-sm ${className || "text-ink"}`}>{value}</dd>
    </div>
  );
}
