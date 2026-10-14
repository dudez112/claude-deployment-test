"use client";

import { useMemo, useState } from "react";
import type { ModelConfig } from "@/lib/types";
import { estimateCost, estimateTokens, formatUsd } from "@/lib/tokens";

const SAMPLE_PROMPT = `You are a support assistant for an online bookshop. Using the order history below, explain to the customer why their parcel is late and offer a next step.

Order #48213: two paperbacks, shipped Monday from the Leeds warehouse, carrier reports a sorting delay.`;

export function CostPlanner({ models }: { models: ModelConfig[] }) {
  const [prompt, setPrompt] = useState(SAMPLE_PROMPT);
  const [outputTokens, setOutputTokens] = useState(300);
  const [requestsPerDay, setRequestsPerDay] = useState(20000);

  const inputTokens = useMemo(() => estimateTokens(prompt), [prompt]);

  const rows = useMemo(() => {
    const priced = models
      .filter((m) => m.costPer1kOut > 0 || outputTokens === 0)
      .map((m) => ({
        model: m,
        cost: estimateCost(inputTokens, outputTokens, requestsPerDay, m.costPer1kIn, m.costPer1kOut),
      }))
      .sort((a, b) => a.cost.perMonth - b.cost.perMonth);
    const max = Math.max(...priced.map((r) => r.cost.perMonth), 0);
    return { priced, max };
  }, [models, inputTokens, outputTokens, requestsPerDay]);

  const cheapest = rows.priced[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-5">
        <label className="block">
          <span className="flex items-baseline justify-between text-xs text-mute">
            Prompt
            <span>
              about <span className="font-display text-sm text-ink">{inputTokens.toLocaleString()}</span> tokens
            </span>
          </span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={7}
            className="mt-2 w-full resize-y rounded-xl border border-line bg-deep p-3 text-sm leading-relaxed placeholder:text-faint focus:border-plasma focus:outline-none"
            placeholder="Paste a typical prompt to estimate its size"
          />
        </label>

        <label className="block">
          <span className="flex items-baseline justify-between text-xs text-mute">
            Expected reply length
            <span className="font-display text-sm text-ink">
              {outputTokens.toLocaleString()} <span className="text-xs text-mute">tokens</span>
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={4000}
            step={50}
            value={outputTokens}
            onChange={(e) => setOutputTokens(Number(e.target.value))}
            style={{ "--fill": `${(outputTokens / 4000) * 100}%` } as React.CSSProperties}
            className="mt-2 w-full"
          />
        </label>

        <label className="block">
          <span className="text-xs text-mute">Requests per day</span>
          <input
            type="number"
            min={0}
            step={1000}
            inputMode="numeric"
            value={requestsPerDay}
            onChange={(e) => setRequestsPerDay(Math.max(0, Math.min(1e9, Number(e.target.value) || 0)))}
            className="mt-2 w-full rounded-xl border border-line bg-deep px-3 py-2 text-sm focus:border-plasma focus:outline-none"
          />
        </label>
        <p className="text-xs leading-relaxed text-faint">
          Token counts are estimated from characters and words; real tokenizers vary by model. Prices are
          illustrative rates for this demo fleet.
        </p>
      </div>

      <div>
        {cheapest && requestsPerDay > 0 && inputTokens + outputTokens > 0 ? (
          <p className="mb-4 text-sm text-mute">
            Cheapest fit is <span className="text-ink">{cheapest.model.name}</span> at{" "}
            <span className="font-display text-signal">{formatUsd(cheapest.cost.perMonth)}</span> a month.
          </p>
        ) : (
          <p className="mb-4 text-sm text-mute">Add a prompt and a daily volume to compare models.</p>
        )}
        <ul className="space-y-3">
          {rows.priced.map(({ model, cost }, i) => (
            <li key={model.id} className="rounded-xl border border-line bg-deep/60 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm">
                  {model.name}
                  {i === 0 && requestsPerDay > 0 && (
                    <span className="ml-2 rounded-full bg-signal/15 px-2 py-0.5 text-xs text-signal">Lowest</span>
                  )}
                </span>
                <span className="font-display text-sm">{formatUsd(cost.perMonth)}/mo</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className={`h-full transition-[width] duration-500 ${i === 0 ? "bg-signal" : "bg-plasma"}`}
                  style={{ width: `${rows.max ? Math.max(2, (cost.perMonth / rows.max) * 100) : 0}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-faint">
                {formatUsd(cost.perRequest)} per request, {formatUsd(cost.perDay)} per day
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
