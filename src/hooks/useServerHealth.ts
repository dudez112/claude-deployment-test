"use client";

import { useEffect, useState } from "react";

export interface ServerHealth {
  state: "checking" | "ok" | "down";
  region?: string;
  environment?: string;
  commit?: string | null;
  roundTripMs?: number;
  checkedAt?: number;
}

/** Polls /api/health and measures round-trip time to the serverless function. */
export function useServerHealth(intervalMs = 30_000): ServerHealth {
  const [health, setHealth] = useState<ServerHealth>({ state: "checking" });

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const started = performance.now();
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (cancelled) return;
        setHealth({
          state: "ok",
          region: data.region,
          environment: data.environment,
          commit: data.commit,
          roundTripMs: Math.round(performance.now() - started),
          checkedAt: Date.now(),
        });
      } catch {
        if (!cancelled) setHealth({ state: "down", checkedAt: Date.now() });
      }
    };
    check();
    const id = window.setInterval(check, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);

  return health;
}
