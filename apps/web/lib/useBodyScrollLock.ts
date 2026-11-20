"use client";

import { useEffect } from "react";

let lockCount = 0;
let savedOverflow = "";

/** Nested overlays share one lock so the last close restores scrolling. */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (lockCount === 0) savedOverflow = document.body.style.overflow;
    lockCount += 1;
    document.body.style.overflow = "hidden";
    return () => {
      lockCount -= 1;
      if (lockCount <= 0) {
        lockCount = 0;
        document.body.style.overflow = savedOverflow;
      }
    };
  }, [active]);
}
