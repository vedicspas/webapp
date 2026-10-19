"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { DayPicker, type Matcher } from "react-day-picker";
import "react-day-picker/style.css";

function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromIsoLocal(iso: string): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function resolveBound(value: Date | "today"): Date {
  return value === "today" ? startOfToday() : value;
}

export function DateField({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = "Choose a date",
  allowEmpty = false,
}: {
  value: string;
  onChange: (iso: string) => void;
  minDate?: Date | "today";
  maxDate?: Date | "today";
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const menuId = useId();
  const selected = fromIsoLocal(value);

  const disabled: Matcher[] = [];
  if (minDate) disabled.push({ before: resolveBound(minDate) });
  if (maxDate) disabled.push({ after: resolveBound(maxDate) });

  function place() {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const popH = popRef.current?.offsetHeight ?? 340;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < popH + 12 && rect.top > popH + 12 ? rect.top - popH - 8 : rect.bottom + 8;
    const popW = popRef.current?.offsetWidth ?? 260;
    const left = Math.min(rect.left, Math.max(8, window.innerWidth - popW - 8));
    setPos({ top, left });
  }

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(place);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="mt-1 flex w-full items-center justify-between gap-2 rounded-lg border border-veda-200 bg-white px-3 py-2 text-left text-sm hover:border-veda-300"
      >
        <span className={value ? "text-foreground" : "text-foreground/45"}>
          {selected ? format(selected, "d MMM yyyy") : placeholder}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-veda-700" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popRef}
              id={menuId}
              role="dialog"
              aria-label="Choose a date"
              style={{ top: pos.top, left: pos.left }}
              className="booking-day-picker fixed z-[60] w-fit rounded-xl border border-veda-100 bg-white p-2 shadow-lg"
            >
              <DayPicker
                mode="single"
                selected={selected}
                onSelect={(d) => {
                  if (!d) {
                    if (allowEmpty) onChange("");
                    return;
                  }
                  onChange(toIsoLocal(d));
                  setOpen(false);
                }}
                disabled={disabled.length > 0 ? disabled : undefined}
                defaultMonth={selected ?? (minDate ? resolveBound(minDate) : startOfToday())}
              />
            </div>,
            document.body
          )
        : null}
    </>
  );
}
