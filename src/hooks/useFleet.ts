"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { fleetReducer, initialFleetState, type FleetEvent } from "@/lib/fleet";

const STORAGE_KEY = "lumen.fleet.v1";
const PERSISTED: ReadonlySet<FleetEvent["type"]> = new Set([
  "setOnline",
  "setWeight",
  "setThreshold",
  "reset",
]);

const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

/** Live fleet simulation: ticks once a second and remembers your configuration. */
export function useFleet() {
  const [state, rawDispatch] = useReducer(fleetReducer, undefined, initialFleetState);
  const dirty = useRef(false);

  const dispatch = useCallback((event: FleetEvent) => {
    if (PERSISTED.has(event.type)) dirty.current = true;
    rawDispatch(event);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        rawDispatch({ type: "hydrate", models: saved.models, thresholds: saved.thresholds });
      }
    } catch {
      // Storage can be unavailable (private mode, blocked cookies); defaults are fine.
    }
    rawDispatch({ type: "warmup", at: Date.now(), seed: randomSeed(), count: 90 });
    const id = window.setInterval(() => {
      rawDispatch({ type: "tick", at: Date.now(), seed: randomSeed() });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!dirty.current) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          models: state.models.map(({ id, online, weight }) => ({ id, online, weight })),
          thresholds: state.thresholds,
        }),
      );
    } catch {
      // Ignore storage failures; the session still works in memory.
    }
  }, [state.models, state.thresholds]);

  return { state, dispatch };
}
