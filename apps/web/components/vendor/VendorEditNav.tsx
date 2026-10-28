"use client";

import { useEffect, useRef, useState } from "react";
import { easeScrollTo } from "@/lib/smoothScroll";

export type VendorEditSection = { id: string; label: string };

export function VendorEditNav({ sections }: { sections: VendorEditSection[] }) {
  const clickLock = useRef(0);
  const [current, setCurrent] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    setCurrent(sections[0]?.id ?? "");
  }, [sections]);

  useEffect(() => {
    if (sections.length === 0) return;
    let frame = 0;

    const update = () => {
      if (Date.now() < clickLock.current) return;
      const header = document.querySelector("header");
      const mobileNav = document.querySelector("[data-edit-nav]");
      let offset =
        header instanceof HTMLElement && header.offsetParent !== null
          ? header.getBoundingClientRect().height + 12
          : 88;
      if (mobileNav instanceof HTMLElement && mobileNav.offsetParent !== null) {
        offset += mobileNav.getBoundingClientRect().height;
      }
      const ordered = sections
        .map((tab) => document.getElementById(tab.id))
        .filter((node): node is HTMLElement => Boolean(node));
      let next = sections[0]?.id ?? "";
      for (const section of ordered) {
        if (section.getBoundingClientRect().top <= offset) next = section.id;
      }
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
      if (atBottom && ordered.length) next = ordered[ordered.length - 1].id;
      setCurrent(next);
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [sections]);

  function go(id: string) {
    setCurrent(id);
    clickLock.current = Date.now() + 900;
    const el = document.getElementById(id);
    if (el) easeScrollTo(el);
  }

  return (
    <>
      <nav
        data-edit-nav
        className="sticky top-16 z-30 -mx-4 mb-4 border-b border-veda-100 bg-white/95 px-4 py-2 backdrop-blur lg:hidden"
        aria-label="Form sections"
      >
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sections.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => go(tab.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-sm whitespace-nowrap ${
                current === tab.id
                  ? "bg-veda-700 text-white"
                  : "text-veda-800 hover:bg-veda-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
      <aside className="hidden w-44 shrink-0 lg:block">
        <nav className="sticky top-24 space-y-0.5" aria-label="Form sections">
          {sections.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => go(tab.id)}
              className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm ${
                current === tab.id
                  ? "bg-veda-50 font-semibold text-veda-800"
                  : "text-foreground/70 hover:bg-veda-50 hover:text-veda-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}
