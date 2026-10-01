"use client";

import { useState } from "react";
import type { PaymentModeCode } from "@vedic/shared";
import { useSearchStore } from "@/stores/searchStore";
import { useMetaStore } from "@/stores/metaStore";
import { PAYMENT_MODE_LABELS } from "@/lib/format";

export function SearchFilters() {
  const store = useSearchStore();
  const meta = useMetaStore((s) => s.meta);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);

  const activeCount =
    (store.cityId ? 1 : 0) +
    (store.categoryId ? 1 : 0) +
    store.amenityIds.length +
    (store.ratingMin ? 1 : 0) +
    (store.paymentMode ? 1 : 0);

  function nearMe() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        store.set({
          nearMe: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          cityId: null,
          page: 1,
        });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 10000 }
    );
  }

  return (
    <div className="rounded-2xl border border-veda-100 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={store.q}
          onChange={(e) => store.set({ q: e.target.value, page: 1 })}
          placeholder="Search by name or keyword"
          className="min-w-0 flex-1 rounded-full border border-veda-200 px-4 py-2 text-sm outline-none focus:border-veda-500"
        />
        <button
          onClick={nearMe}
          className={`rounded-full px-4 py-2 text-sm ${
            store.nearMe
              ? "bg-veda-600 text-white"
              : "border border-veda-200 text-veda-800 hover:bg-veda-50"
          }`}
        >
          {locating ? "Locating\u2026" : store.nearMe ? "Near me \u2713" : "Near me"}
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-veda-200 px-4 py-2 text-sm text-veda-800 hover:bg-veda-50"
        >
          Filters{activeCount ? ` (${activeCount})` : ""}
        </button>
        <select
          value={store.sort}
          onChange={(e) => store.set({ sort: e.target.value as "rating", page: 1 })}
          className="rounded-full border border-veda-200 px-3 py-2 text-sm"
        >
          <option value="rating">Top rated</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          {store.nearMe ? <option value="distance">Nearest</option> : null}
        </select>
      </div>

      {open ? (
        <div className="mt-3 grid gap-4 border-t border-veda-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Destination</span>
            <select
              value={store.cityId ?? ""}
              onChange={(e) =>
                store.set({ cityId: e.target.value ? Number(e.target.value) : null, nearMe: null, page: 1 })
              }
              className="w-full rounded-lg border border-veda-200 px-2 py-1.5"
            >
              <option value="">Anywhere</option>
              {meta.cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium">Treatment category</span>
            <select
              value={store.categoryId ?? ""}
              onChange={(e) =>
                store.set({ categoryId: e.target.value ? Number(e.target.value) : null, page: 1 })
              }
              className="w-full rounded-lg border border-veda-200 px-2 py-1.5"
            >
              <option value="">Any</option>
              {meta.treatmentCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium">Minimum rating</span>
            <select
              value={store.ratingMin ?? ""}
              onChange={(e) =>
                store.set({ ratingMin: e.target.value ? Number(e.target.value) : null, page: 1 })
              }
              className="w-full rounded-lg border border-veda-200 px-2 py-1.5"
            >
              <option value="">Any</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
              <option value="4.5">4.5+</option>
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium">Payment option</span>
            <select
              value={store.paymentMode ?? ""}
              onChange={(e) =>
                store.set({
                  paymentMode: (e.target.value || null) as PaymentModeCode | null,
                  page: 1,
                })
              }
              className="w-full rounded-lg border border-veda-200 px-2 py-1.5"
            >
              <option value="">Any</option>
              {meta.paymentModes.map((m) => (
                <option key={m.id} value={m.code}>
                  {PAYMENT_MODE_LABELS[m.code]}
                </option>
              ))}
            </select>
          </label>

          <div className="text-sm sm:col-span-2 lg:col-span-4">
            <span className="mb-1 block font-medium">Amenities</span>
            <div className="flex flex-wrap gap-2">
              {meta.amenities.map((a) => (
                <button
                  key={a.id}
                  onClick={() => store.toggleAmenity(a.id)}
                  className={`rounded-full px-3 py-1 text-xs ${
                    store.amenityIds.includes(a.id)
                      ? "bg-veda-600 text-white"
                      : "border border-veda-200 text-veda-800 hover:bg-veda-50"
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
