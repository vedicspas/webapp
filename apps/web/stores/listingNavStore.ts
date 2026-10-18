"use client";

import { create } from "zustand";

interface ListingNavState {
  active: boolean;
  setActive: (active: boolean) => void;
}

export const useListingNavStore = create<ListingNavState>((set) => ({
  active: false,
  setActive: (active) => set({ active }),
}));
