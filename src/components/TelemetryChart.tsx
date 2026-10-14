"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Sample } from "@/lib/types";

const WINDOWS = [
  { label: "1 min", seconds: 60 },
  { label: "2 min", seconds: 120 },
  { label: "4 min", seconds: 240 },
] as const;

const HEIGHT = 260;
const PAD = { top: 16, right: 52, bottom: 28, left: 44 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

const timeLabel = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function TelemetryChart({ history, p95Limit }: { history: Sample[]; p95Limit: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [windowSec, setWindowSec] = useState<number>(120);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => history.slice(-windowSec), [history, windowSec]);
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const rpsMax = niceMax(Math.max(1, ...data.map((d) => Math.max(d.rps, d.demand))) * 1.1);
  const latMax = niceMax(Math.max(p95Limit, ...data.map((d) => d.p95)) * 1.1);

  // Right-align the data so the newest reading always sits at the right edge.
  const step = innerW / (windowSec - 1);
  const offset = windowSec - data.length;
  const x = (i: number) => PAD.left + (i + offset) * step;
  const yR = (v: number) => PAD.top + innerH - (v / rpsMax) * innerH;
  const yL = (v: number) => PAD.top + innerH - (v / latMax) * innerH;

  const line = (pick: (d: Sample) => number, y: (v: number) => number) =>
    data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(pick(d)).toFixed(1)}`).join("");

  const served = line((d) => d.rps, yR);
  const area = data.length
    ? `${served}L${x(data.length - 1).toFixed(1)},${PAD.top + innerH}L${x(0).toFixed(1)},${PAD.top + innerH}Z`
    : "";

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const hovered = hover !== null ? data[hover] : null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!data.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < data.length; i++) {
      const dist = Math.abs(x(i) - px);
      if (dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    setHover(best);
  };

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute">
          <Legend swatch="bg-plasma" label="Served req/s" />
          <Legend swatch="border-t border-dashed border-mute bg-transparent" label="Demand" />
          <Legend swatch="bg-signal" label="p95 latency" />
          <Legend swatch="border-t border-dashed border-amber bg-transparent" label="Latency limit" />
        </div>
        <div role="radiogroup" aria-label="Time window" className="flex rounded-full border border-line p-0.5 text-xs">
          {WINDOWS.map((w) => (
            <button
              key={w.seconds}
              role="radio"
              aria-checked={windowSec === w.seconds}
              onClick={() => setWindowSec(w.seconds)}
              className={`rounded-full px-3 py-1 transition-colors ${
                windowSec === w.seconds ? "bg-raised text-ink" : "text-mute hover:text-ink"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={wrapRef} className="relative w-full min-w-0 overflow-hidden">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block touch-none select-none"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={
            data.length
              ? `Throughput and latency over the last ${windowSec} seconds. Latest: ${data[data.length - 1].rps} requests per second, p95 ${data[data.length - 1].p95} milliseconds.`
              : "Waiting for telemetry"
          }
        >
          <defs>
            <linearGradient id="servedFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-plasma)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--color-plasma)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={PAD.top + innerH * (1 - t)}
                y2={PAD.top + innerH * (1 - t)}
                stroke="var(--color-line)"
                strokeWidth={1}
                opacity={t === 0 ? 1 : 0.5}
              />
              <text x={PAD.left - 8} y={PAD.top + innerH * (1 - t) + 4} textAnchor="end" className="fill-faint text-[10px]">
                {Math.round(rpsMax * t)}
              </text>
              <text x={width - PAD.right + 8} y={PAD.top + innerH * (1 - t) + 4} className="fill-faint text-[10px]">
                {Math.round(latMax * t)}
              </text>
            </g>
          ))}
          <text x={PAD.left - 8} y={HEIGHT - 6} textAnchor="end" className="fill-faint text-[10px]">
            req/s
          </text>
          <text x={width - PAD.right + 8} y={HEIGHT - 6} className="fill-faint text-[10px]">
            ms
          </text>

          {data.length > 1 && (
            <>
              <path d={area} fill="url(#servedFill)" />
              <path d={served} fill="none" stroke="var(--color-plasma)" strokeWidth={1.75} />
              <path
                d={line((d) => d.demand, yR)}
                fill="none"
                stroke="var(--color-mute)"
                strokeWidth={1}
                strokeDasharray="3 4"
                opacity={0.7}
              />
              <path d={line((d) => d.p95, yL)} fill="none" stroke="var(--color-signal)" strokeWidth={1.75} />
            </>
          )}

          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={yL(p95Limit)}
            y2={yL(p95Limit)}
            stroke="var(--color-amber)"
            strokeDasharray="6 5"
            strokeWidth={1}
          />

          {hovered && hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--color-mute)" strokeWidth={1} />
              <circle cx={x(hover)} cy={yR(hovered.rps)} r={4} fill="var(--color-plasma)" stroke="var(--color-night)" strokeWidth={2} />
              <circle cx={x(hover)} cy={yL(hovered.p95)} r={4} fill="var(--color-signal)" stroke="var(--color-night)" strokeWidth={2} />
            </g>
          )}

          {data.length === 0 && (
            <text x={width / 2} y={HEIGHT / 2} textAnchor="middle" className="fill-mute text-xs">
              Waiting for the first readings
            </text>
          )}
        </svg>

        {hovered && hover !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 w-44 rounded-lg border border-line bg-deep/95 p-3 text-xs shadow-xl backdrop-blur"
            style={{
              left: Math.min(Math.max(0, x(hover) - 88), width - 176),
            }}
          >
            <p className="mb-1.5 text-mute">{timeLabel(hovered.at)}</p>
            <Row label="Served" value={`${hovered.rps.toFixed(0)} req/s`} />
            <Row label="Demand" value={`${hovered.demand.toFixed(0)} req/s`} />
            <Row label="p95" value={`${hovered.p95} ms`} />
            <Row label="Errors" value={`${(hovered.errorRate * 100).toFixed(2)}%`} />
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-0.5 w-4 rounded ${swatch}`} aria-hidden />
      {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-mute">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
