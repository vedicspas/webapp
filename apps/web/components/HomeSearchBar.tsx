"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { Paginated, SpaSummary } from "@vedic/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

export function HomeSearchBar() {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<SpaSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_URL}/spas?q=${encodeURIComponent(term)}&page=1`,
          { signal: controller.signal }
        );
        const data = (await res.json()) as Paginated<SpaSummary>;
        setSuggestions(Array.isArray(data.items) ? data.items.slice(0, 8) : []);
        setOpen(true);
        setActive(-1);
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function goToSearch() {
    const term = q.trim();
    setOpen(false);
    router.push(term ? `/spas?q=${encodeURIComponent(term)}` : "/spas");
  }

  function goToSpa(spa: SpaSummary) {
    setOpen(false);
    router.push(`/spas/${spa.slug}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative mx-auto max-w-xl">
      <form
        className="flex overflow-hidden rounded-full bg-white shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0 && suggestions[active]) {
            goToSpa(suggestions[active]);
            return;
          }
          goToSearch();
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            if (q.trim().length >= 2 && suggestions.length > 0) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search spas, treatments, destinations..."
          className="w-full px-5 py-3.5 text-veda-900 outline-none"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          autoComplete="off"
        />
        <button
          type="submit"
          className="shrink-0 bg-turmeric-400 px-6 font-medium text-veda-900 hover:bg-turmeric-300"
        >
          Search
        </button>
      </form>

      {open && q.trim().length >= 2 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-veda-100 bg-white text-left shadow-xl"
        >
          {loading && suggestions.length === 0 ? (
            <li className="px-5 py-3 text-sm text-foreground/60">Searching&hellip;</li>
          ) : suggestions.length === 0 ? (
            <li className="px-5 py-3 text-sm text-foreground/60">No matching spas</li>
          ) : (
            suggestions.map((spa, i) => (
              <li key={spa.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => goToSpa(spa)}
                  className={`flex w-full flex-col items-start px-5 py-2.5 text-left ${
                    i === active ? "bg-veda-50" : "hover:bg-veda-50"
                  }`}
                >
                  <span className="font-bold text-veda-900">{spa.name}</span>
                  <span className="text-xs text-foreground/60">
                    {spa.cityName}, {spa.countryName}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
