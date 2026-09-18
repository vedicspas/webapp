"use client";

import { create } from "zustand";

export type ToastKind = "success" | "error";

interface ToastState {
  id: number;
  text: string;
  kind: ToastKind;
  show: (text: string, kind?: ToastKind) => void;
  hide: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  id: 0,
  text: "",
  kind: "success",
  show: (text, kind = "success") => {
    if (timer) clearTimeout(timer);
    set((s) => ({ id: s.id + 1, text, kind }));
    timer = setTimeout(() => {
      set({ text: "" });
      timer = null;
    }, 10_000);
  },
  hide: () => {
    if (timer) clearTimeout(timer);
    timer = null;
    set({ text: "" });
  },
}));

export function toast(text: string, kind: ToastKind = "success"): void {
  useToastStore.getState().show(text, kind);
}
