"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { Paginated, SpaSummary } from "@vedic/shared";
import { useSearchStore } from "@/stores/searchStore";
import { useMetaStore } from "@/stores/metaStore";
import { SpaCard } from "./SpaCard";
import { SearchFilters } from "./SearchFilters";

const SpaMap = dynamic(() => import("./SpaMap"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm">Loading map&hellip;</div>,
});

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

export function SearchResults() {
  const params = useSearchParams();
  const store = useSearchStore();
  const meta = useMetaStore((s) => s.meta);
  const lastQuery = useRef("");

  // Initialize the Zustand store from URL params once. The store update
  // re-renders this component (it subscribes to the whole store).
  useEffect(() => {
    useSearchStore.getState().set({
      q: params.get("q") ?? "",
      cityId: params.get("cityId") ? Number(params.get("cityId")) : null,
      countryId: params.get("countryId") ? Number(params.get("countryId")) : null,
      categoryId: params.get("categoryId") ? Number(params.get("categoryId")) : null,
      sort: (params.get("sort") as "rating") ?? "rating",
      page: 1,
      initialized: true,
    });
  }, [params]);

  const qs = store.initialized ? store.queryString() : null;

  useEffect(() => {
    if (!qs || qs === lastQuery.current) return;
    lastQuery.current = qs;
    let cancelled = false;
    useSearchStore.setState({ loading: true });
    fetch(`${API_URL}/spas?${qs}`)
      .then((r) => r.json())
      .then((data: Paginated<SpaSummary>) => {
        if (!cancelled) {
          useSearchStore.setState({ results: data.items, total: data.total, loading: false });
        }
      })
      .catch(() => !cancelled && useSearchStore.setState({ loading: false }));
    return () => {
      cancelled = true;
    };
  }, [qs]);

  const cityName = store.cityId ? meta.cities.find((c) => c.id === store.cityId)?.name : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-veda-900">
          {cityName ? `Ayurvedic spas in ${cityName}` : "Ayurvedic spas & retreats"}
          {!store.loading ? (
            <span className="ml-2 text-sm font-normal text-foreground/60">
              {store.total} found
            </span>
          ) : null}
        </h1>
        <button
          className="rounded-full border border-veda-300 px-4 py-1.5 text-sm text-veda-800 hover:bg-veda-50"
          onClick={() => store.set({ showMap: !store.showMap })}
        >
          {store.showMap ? "Show list" : "Show map"}
        </button>
      </div>

      <SearchFilters />

      {store.showMap ? (
        <div className="mt-4 h-[70vh] overflow-hidden rounded-2xl border border-veda-100">
          <SpaMap spas={store.results} />
        </div>
      ) : (
        <>
          {store.loading ? (
            <div className="grid gap-5 pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-80 animate-pulse rounded-2xl bg-veda-100" />
              ))}
            </div>
          ) : store.results.length === 0 ? (
            <p className="py-16 text-center text-foreground/60">
              No spas match these filters yet. Try widening your search.
            </p>
          ) : (
            <div className="grid gap-5 pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {store.results.map((spa) => (
                <SpaCard key={spa.id} spa={spa} />
              ))}
            </div>
          )}

          {store.total > 12 ? (
            <div className="flex justify-center gap-2 pt-8">
              <button
                disabled={store.page <= 1}
                onClick={() => store.set({ page: store.page - 1 })}
                className="rounded-full border border-veda-300 px-4 py-1.5 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-2 py-1.5 text-sm">
                Page {store.page} of {Math.ceil(store.total / 12)}
              </span>
              <button
                disabled={store.page >= Math.ceil(store.total / 12)}
                onClick={() => store.set({ page: store.page + 1 })}
                className="rounded-full border border-veda-300 px-4 py-1.5 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
