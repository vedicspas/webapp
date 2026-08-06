"use client";

import { create } from "zustand";
import type { StaticMeta } from "@vedic/shared";

const empty: StaticMeta = {
  countries: [],
  cities: [],
  amenities: [],
  treatmentCategories: [],
  paymentModes: [],
  bookingStatuses: [],
  currencies: [],
  roles: [],
};

interface MetaState {
  meta: StaticMeta;
  hydrated: boolean;
  hydrate: (meta: StaticMeta) => void;
}

/** Static lookup tables, hydrated once from the server-rendered layout. */
export const useMetaStore = create<MetaState>((set) => ({
  meta: empty,
  hydrated: false,
  hydrate: (meta) => set({ meta, hydrated: true }),
}));
