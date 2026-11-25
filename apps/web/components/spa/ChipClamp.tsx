"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

function collapsedHeightPx(el: HTMLElement): number {
  const first = el.firstElementChild as HTMLElement | null;
  if (!first) return 0;
  const styles = getComputedStyle(el);
  const gap = Number.parseFloat(styles.rowGap || styles.gap || "0") || 0;
  return first.offsetHeight * 3 + gap * 2;
}

export function ChipClamp({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canToggle, setCanToggle] = useState(false);
  const [limitPx, setLimitPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    function measure() {
      if (!el) return;
      const limit = collapsedHeightPx(el);
      setLimitPx(limit > 0 ? limit : null);
      if (limit <= 0) {
        setCanToggle(false);
        return;
      }
      setCanToggle(el.scrollHeight > limit + 1);
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children, expanded]);

  const collapsedStyle =
    limitPx != null
      ? { maxHeight: limitPx, overflow: "hidden" as const }
      : { maxHeight: "calc(3 * 1.75rem + 2 * 0.5rem)", overflow: "hidden" as const };

  return (
    <div>
      <div ref={ref} className="flex flex-wrap gap-2" style={expanded ? undefined : collapsedStyle}>
        {children}
      </div>
      {canToggle ? (
        <button
          type="button"
          className="mt-2 text-sm font-medium text-veda-700 hover:text-veda-900 hover:underline"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
