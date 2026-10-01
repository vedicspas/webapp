"use client";

import { useMemo, useRef, useState } from "react";

export function TagInput({
  values,
  onChange,
  suggestions,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim();
  const selected = new Set(values.map((v) => v.toLowerCase()));
  const matches = useMemo(() => {
    const unused = suggestions.filter((s) => !selected.has(s.toLowerCase()));
    if (!q) return unused.slice(0, 8);
    const lower = q.toLowerCase();
    return unused.filter((s) => s.toLowerCase().includes(lower)).slice(0, 8);
  }, [q, selected, suggestions]);

  const exact = suggestions.find((s) => s.toLowerCase() === q.toLowerCase());
  const canCreate = q.length > 1 && !selected.has(q.toLowerCase()) && !exact;
  const options = canCreate ? [`Add “${q}”`, ...matches] : matches;

  function add(name: string) {
    const cleaned = name.trim().replace(/\s+/g, " ");
    if (!cleaned || selected.has(cleaned.toLowerCase())) return;
    const canonical = suggestions.find((s) => s.toLowerCase() === cleaned.toLowerCase()) ?? cleaned;
    onChange([...values, canonical]);
    setQuery("");
    setHighlight(0);
    inputRef.current?.focus();
  }

  function pick(option: string) {
    if (option.startsWith("Add “") && option.endsWith("”")) {
      add(q);
      return;
    }
    add(option);
  }

  return (
    <div className="rounded-lg border border-veda-200 bg-white px-2 py-1.5 focus-within:border-veda-500 focus-within:ring-2 focus-within:ring-veda-200">
      <div className="flex flex-wrap gap-1.5">
        {values.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-veda-100 px-2.5 py-0.5 text-sm text-veda-900"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              className="text-veda-600 hover:text-red-700"
              onClick={() => onChange(values.filter((v) => v !== tag))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          placeholder={values.length === 0 ? placeholder : ""}
          className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none"
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 150);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && query === "" && values.length > 0) {
              onChange(values.slice(0, -1));
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((i) => Math.max(i - 1, 0));
            }
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              if (options[highlight]) pick(options[highlight]);
              else if (q) add(q);
            }
            if (e.key === "Escape") setOpen(false);
          }}
        />
      </div>
      {open && options.length > 0 ? (
        <ul className="mt-1 max-h-44 overflow-y-auto rounded-md border border-veda-100 bg-white py-1 shadow-md">
          {options.map((option, i) => (
            <li key={option}>
              <button
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-sm ${
                  i === highlight ? "bg-veda-50 text-veda-900" : "text-foreground/80"
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(option)}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
