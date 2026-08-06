"use client";

import { create } from "zustand";
import type { PaymentModeCode, SpaSummary } from "@vedic/shared";

export interface SearchState {
  q: string;
  cityId: number | null;
  countryId: number | null;
  categoryId: number | null;
  amenityIds: number[];
  ratingMin: number | null;
  paymentMode: PaymentModeCode | null;
  nearMe: { lat: number; lng: number } | null;
  sort: "rating" | "price_asc" | "price_desc" | "distance";
  page: number;
  showMap: boolean;

  results: (SpaSummary & { distanceKm?: number })[];
  total: number;
  loading: boolean;
  /** True once the store has been initialized from the URL params. */
  initialized: boolean;

  set: (patch: Partial<SearchState>) => void;
  toggleAmenity: (id: number) => void;
  reset: () => void;
  queryString: () => string;
}

const initial = {
  q: "",
  cityId: null,
  countryId: null,
  categoryId: null,
  amenityIds: [] as number[],
  ratingMin: null,
  paymentMode: null,
  nearMe: null,
  sort: "rating" as const,
  page: 1,
  showMap: false,
  results: [],
  total: 0,
  loading: false,
  initialized: false,
};

export const useSearchStore = create<SearchState>((set, get) => ({
  ...initial,

  set: (patch) => set(patch),

  toggleAmenity: (id) =>
    set((s) => ({
      amenityIds: s.amenityIds.includes(id)
        ? s.amenityIds.filter((a) => a !== id)
        : [...s.amenityIds, id],
      page: 1,
    })),

  reset: () => set(initial),

  queryString: () => {
    const s = get();
    const params = new URLSearchParams();
    if (s.q) params.set("q", s.q);
    if (s.cityId) params.set("cityId", String(s.cityId));
    if (s.countryId) params.set("countryId", String(s.countryId));
    if (s.categoryId) params.set("categoryId", String(s.categoryId));
    if (s.amenityIds.length) params.set("amenityIds", s.amenityIds.join(","));
    if (s.ratingMin) params.set("ratingMin", String(s.ratingMin));
    if (s.paymentMode) params.set("paymentMode", s.paymentMode);
    if (s.nearMe) {
      params.set("lat", String(s.nearMe.lat));
      params.set("lng", String(s.nearMe.lng));
      params.set("radiusKm", "200");
    }
    params.set("sort", s.nearMe && s.sort === "rating" ? "distance" : s.sort);
    params.set("page", String(s.page));
    return params.toString();
  },
}));
