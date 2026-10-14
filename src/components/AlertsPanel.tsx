"use client";

import { useState } from "react";
import type { FleetEvent } from "@/lib/fleet";
import type { FleetAlert, Thresholds } from "@/lib/types";

interface Props {
  alerts: FleetAlert[];
  thresholds: Thresholds;
  /** Timestamp of the latest telemetry reading, used for relative times. */
  now: number;
  dispatch: (e: FleetEvent) => void;
}

const ago = (at: number, now: number) => {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return `${m} min ago`;
};

export function AlertsPanel({ alerts, thresholds, now, dispatch }: Props) {
  const [showAcked, setShowAcked] = useState(false);
  const open = alerts.filter((a) => !a.acknowledged);
  const visible = showAcked ? alerts : open;

  return (
    <div className="flex h-full flex-col">
      <fieldset className="grid gap-4 rounded-xl border border-line bg-deep/60 p-4 sm:grid-cols-2">
        <legend className="px-1 text-xs text-mute">Alert when</legend>
        <ThresholdInput
          label="p95 latency exceeds"
          unit="ms"
          min={100}
          max={3000}
          step={50}
          value={thresholds.p95Ms}
          onChange={(v) => dispatch({ type: "setThreshold", key: "p95Ms", value: v })}
        />
        <ThresholdInput
          label="Error rate exceeds"
          unit="%"
          min={0.5}
          max={20}
          step={0.5}
          value={thresholds.errorPct}
          onChange={(v) => dispatch({ type: "setThreshold", key: "errorPct", value: v })}
        />
      </fieldset>

      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-sm" aria-live="polite">
          {open.length ? (
            <>
              <span className="font-display text-coral">{open.length}</span>{" "}
              <span className="text-mute">open</span>
            </>
          ) : (
            <span className="text-signal">All clear</span>
          )}
        </p>
        <div className="flex gap-2 text-xs">
          <button
            onClick={() => setShowAcked((v) => !v)}
            className="rounded-full border border-line px-3 py-1.5 text-mute hover:text-ink"
            aria-pressed={showAcked}
          >
            {showAcked ? "Hide acknowledged" : "Show acknowledged"}
          </button>
          <button
            onClick={() => dispatch({ type: "ackAll" })}
            disabled={!open.length}
            className="rounded-full bg-raised px-3 py-1.5 text-ink hover:bg-line disabled:cursor-not-allowed disabled:opacity-40"
          >
            Acknowledge all
          </button>
        </div>
      </div>

      <ul className="mt-3 max-h-80 flex-1 space-y-2 overflow-y-auto pr-1">
        {visible.map((a) => (
          <li
            key={a.id}
            className={`animate-rise flex gap-3 rounded-lg border p-3 text-sm ${
              a.acknowledged
                ? "border-line/60 opacity-60"
                : a.severity === "critical"
                  ? "border-coral/50 bg-coral/10"
                  : "border-amber/40 bg-amber/5"
            }`}
          >
            <span
              aria-hidden
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.severity === "critical" ? "bg-coral" : "bg-amber"}`}
            />
            <div className="min-w-0 flex-1">
              <p>{a.message}</p>
              <p className="mt-1 text-xs text-faint">
                {a.severity === "critical" ? "Critical" : "Warning"}, {ago(a.at, now)}
              </p>
            </div>
            {!a.acknowledged && (
              <button
                onClick={() => dispatch({ type: "ack", alertId: a.id })}
                className="self-start rounded-md px-2 py-1 text-xs text-mute hover:bg-raised hover:text-ink"
              >
                Acknowledge
              </button>
            )}
          </li>
        ))}
        {visible.length === 0 && (
          <li className="rounded-lg border border-dashed border-line p-5 text-center text-sm text-mute">
            No open alerts. Lower a limit above or shift traffic onto one model to see one fire.
          </li>
        )}
      </ul>
      {alerts.some((a) => a.acknowledged) && (
        <button
          onClick={() => dispatch({ type: "clearAlerts" })}
          className="mt-3 self-start text-xs text-faint underline-offset-4 hover:text-ink hover:underline"
        >
          Clear acknowledged alerts
        </button>
      )}
    </div>
  );
}

function ThresholdInput({
  label,
  unit,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const fill = ((Math.min(max, value) - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs text-mute">
        {label}
        <span className="font-display text-sm text-ink">
          {value}
          <span className="ml-0.5 text-xs text-mute">{unit}</span>
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, value)}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
        className="mt-2 w-full"
      />
    </label>
  );
}
