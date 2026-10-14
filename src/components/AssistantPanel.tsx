"use client";

import { useEffect, useRef, useState } from "react";
import type { AssistantAction, AssistantReply, FleetSnapshot } from "@/lib/types";

interface Message {
  id: number;
  role: "you" | "assistant";
  text: string;
  actions?: AssistantAction[];
  error?: boolean;
}

interface Props {
  getSnapshot: () => FleetSnapshot;
  onActions: (actions: AssistantAction[]) => void;
  names: Record<string, string>;
}

const SUGGESTIONS = [
  "How are we doing?",
  "Which model is slowest?",
  "Where are the errors?",
  "Rebalance traffic",
  "Bring Lyra Embed online",
  "Set latency limit to 700 ms",
];

const describe = (a: AssistantAction, names: Record<string, string>) => {
  switch (a.type) {
    case "setOnline":
      return `${names[a.modelId] ?? a.modelId} ${a.online ? "online" : "offline"}`;
    case "setWeight":
      return `${names[a.modelId] ?? a.modelId} weight ${a.weight}`;
    case "setThreshold":
      return `${a.key === "p95Ms" ? "Latency limit" : "Error limit"} ${a.value}${a.key === "p95Ms" ? " ms" : "%"}`;
    case "pause":
      return "Paused stream";
    case "resume":
      return "Resumed stream";
    case "ackAll":
      return "Acknowledged alerts";
  }
};

export function AssistantPanel({ getSnapshot, onActions, names }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: "assistant",
      text: "I watch the same telemetry you do and can change the fleet for you. Ask how things are going, or tell me what to do.",
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || pending) return;
    setInput("");
    setMessages((m) => [...m, { id: nextId.current++, role: "you", text: message }]);
    setPending(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, snapshot: getSnapshot() }),
      });
      const data = (await res.json()) as AssistantReply | { error: string };
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `Request failed with ${res.status}`);
      }
      if (data.actions.length) onActions(data.actions);
      setMessages((m) => [
        ...m,
        { id: nextId.current++, role: "assistant", text: data.reply, actions: data.actions },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: nextId.current++,
          role: "assistant",
          error: true,
          text: `The assistant couldn't be reached (${err instanceof Error ? err.message : "network error"}). Check your connection and send again.`,
        },
      ]);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex h-full min-h-[26rem] flex-col">
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`animate-rise flex ${m.role === "you" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "you"
                  ? "rounded-br-sm bg-plasma text-night"
                  : m.error
                    ? "rounded-bl-sm border border-coral/50 bg-coral/10"
                    : "rounded-bl-sm bg-raised"
              }`}
            >
              <p>{m.text}</p>
              {m.actions && m.actions.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {m.actions.map((a, i) => (
                    <li key={i} className="rounded-full bg-signal/15 px-2 py-0.5 text-xs text-signal">
                      {describe(a, names)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start" aria-label="Assistant is thinking">
            <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-raised px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-mute"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="scrollbar-none -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            disabled={pending}
            className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs text-mute transition-colors hover:border-plasma hover:text-ink disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2"
      >
        <label className="sr-only" htmlFor="assistant-input">
          Message the ops assistant
        </label>
        <input
          id="assistant-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          placeholder="Ask about the fleet or give an instruction"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-xl border border-line bg-deep px-4 py-2.5 text-sm placeholder:text-faint focus:border-plasma focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="rounded-xl bg-plasma px-4 py-2.5 text-sm font-medium text-night transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
