"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { easeScrollTo } from "@/lib/smoothScroll";
import { useListingNavStore } from "@/stores/listingNavStore";

type Tab = { id: string; label: string };

export function ListingStickyNav({
  clinicName,
  showAmenities,
  showLocation,
  showBooking,
  children,
}: {
  clinicName: string;
  showAmenities: boolean;
  showLocation: boolean;
  showBooking: boolean;
  children: React.ReactNode;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const clickLock = useRef(0);
  const setActive = useListingNavStore((s) => s.setActive);
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState("listing-about");

  const tabs = useMemo(() => {
    const items: Tab[] = [{ id: "listing-about", label: "About" }];
    if (showAmenities) items.push({ id: "listing-amenities", label: "Amenities" });
    items.push({ id: "listing-treatments", label: "Treatments" });
    items.push({ id: "listing-reviews", label: "Reviews" });
    if (showLocation) items.push({ id: "listing-location", label: "Location" });
    if (showBooking) items.push({ id: "listing-booking", label: "Booking" });
    return items;
  }, [showAmenities, showLocation, showBooking]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    let frame = 0;

    const update = () => {
      const header = document.querySelector("header");
      const headerH =
        header instanceof HTMLElement ? header.getBoundingClientRect().height : 72;
      const on = el.getBoundingClientRect().bottom <= headerH;
      setVisible(on);
      setActive(on);

      if (Date.now() < clickLock.current) return;

      const bar = document.querySelector("[data-listing-nav]");
      const offset =
        (bar instanceof HTMLElement ? bar.getBoundingClientRect().height : headerH) + 12;
      const desktop = window.matchMedia("(min-width: 1024px)").matches;
      const ordered = tabs
        .map((tab) => document.getElementById(tab.id))
        .filter((node): node is HTMLElement => Boolean(node))
        .sort((a, b) => a.offsetTop - b.offsetTop);

      let next = tabs[0]?.id ?? "listing-about";
      for (const section of ordered) {
        if (section.id === "listing-booking" && desktop) continue;
        if (section.getBoundingClientRect().top <= offset) next = section.id;
      }
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
      setActive(false);
    };
  }, [setActive, tabs]);

  useEffect(() => {
    document.documentElement.classList.toggle("listing-nav-active", visible);
    return () => document.documentElement.classList.remove("listing-nav-active");
  }, [visible]);

  function go(id: string) {
    setCurrent(id);
    clickLock.current = Date.now() + 900;
    const el = document.getElementById(id);
    if (el) easeScrollTo(el);
  }

  return (
    <>
      <div ref={sentinelRef}>{children}</div>
      {visible ? (
        <div
          data-listing-nav
          className="fixed inset-x-0 top-0 z-50 bg-veda-800 text-white shadow-md"
        >
          <div className="mx-auto flex max-w-6xl items-center px-4 py-2">
            <Link
              href="/"
              className="mr-3 hidden shrink-0 items-center md:flex"
              aria-label="AyurvedaAdvisor home"
            >
              <img
                src="/logo-ayurvedaadvisor.svg"
                alt="AyurvedaAdvisor"
                className="h-6 w-auto sm:h-8"
              />
            </Link>
            <p className="min-w-0 max-w-[9.5rem] shrink-0 truncate text-base font-semibold sm:max-w-[14rem] sm:text-lg md:max-w-[16rem]">
              {clinicName}
            </p>
            <span className="mx-3 shrink-0 text-white/45" aria-hidden>
              |
            </span>
            <nav
              className="flex min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Listing sections"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => go(tab.id)}
                  className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap ${
                    current === tab.id
                      ? "bg-white text-veda-800"
                      : "text-white/90 hover:bg-white/15 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
