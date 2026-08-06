"use client";

import { create } from "zustand";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

interface WishlistState {
  ids: Set<number>;
  loaded: boolean;
  load: (token: string) => Promise<void>;
  toggle: (spaId: number, token: string) => Promise<void>;
  clear: () => void;
}

export const useWishlistStore = create<WishlistState>((set, get) => ({
  ids: new Set<number>(),
  loaded: false,

  load: async (token) => {
    if (get().loaded) return;
    const res = await fetch(`${API_URL}/wishlist/ids`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const ids: number[] = await res.json();
      set({ ids: new Set(ids), loaded: true });
    }
  },

  toggle: async (spaId, token) => {
    const has = get().ids.has(spaId);
    // Optimistic update
    set((s) => {
      const ids = new Set(s.ids);
      if (has) ids.delete(spaId);
      else ids.add(spaId);
      return { ids };
    });
    await fetch(`${API_URL}/wishlist/${spaId}`, {
      method: has ? "DELETE" : "PUT",
      headers: { authorization: `Bearer ${token}` },
    });
  },

  clear: () => set({ ids: new Set(), loaded: false }),
}));
