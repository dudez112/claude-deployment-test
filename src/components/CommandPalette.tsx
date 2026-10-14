"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface Command {
  id: string;
  label: string;
  group: string;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

export function CommandPalette({ open, onClose, commands }: Props) {
  if (!open) return null;
  return <PaletteDialog onClose={onClose} commands={commands} />;
}

function PaletteDialog({ onClose, commands }: Omit<Props, "open">) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreFocus.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      restoreFocus.current?.focus?.();
    };
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    const terms = q.split(/\s+/);
    return commands.filter((c) => {
      const hay = `${c.group} ${c.label}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [commands, query]);

  const selected = Math.min(active, Math.max(0, results.length - 1));

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    // Let the dialog unmount before running, so focus/scroll changes land on the page.
    requestAnimationFrame(() => c.run());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((selected + 1) % Math.max(1, results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((selected - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[selected]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      // Keep focus inside the dialog.
      e.preventDefault();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" onKeyDown={onKeyDown}>
      <button aria-label="Close command menu" className="absolute inset-0 bg-night/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        className="animate-rise relative w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl shadow-black/40"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder="Type a command or a model name"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-list"
          aria-activedescendant={results[selected] ? `cmd-${results[selected].id}` : undefined}
          className="w-full border-b border-line bg-transparent px-5 py-4 text-base placeholder:text-faint focus:outline-none"
        />
        <ul id="command-list" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {results.map((c, i) => {
            const header = i === 0 || results[i - 1].group !== c.group ? c.group : null;
            return (
              <li key={c.id} role="presentation">
                {header && <p className="px-3 pt-2 pb-1 text-xs text-faint">{header}</p>}
                <div
                  id={`cmd-${c.id}`}
                  role="option"
                  aria-selected={i === selected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(c)}
                  className={`cursor-pointer rounded-lg px-3 py-2 text-sm ${
                    i === selected ? "bg-raised text-ink" : "text-mute"
                  }`}
                >
                  {c.label}
                </div>
              </li>
            );
          })}
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-mute">No commands match “{query}”.</li>
          )}
        </ul>
        <p className="border-t border-line px-5 py-2.5 text-xs text-faint">
          Arrow keys to move, Enter to run, Esc to close
        </p>
      </div>
    </div>
  );
}
