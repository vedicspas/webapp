"use client";

import { useToastStore } from "@/stores/toastStore";

export function ToastHost() {
  const { text, kind, hide } = useToastStore();
  if (!text) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex justify-center px-4">
      <button
        type="button"
        onClick={hide}
        className={`pointer-events-auto w-full max-w-2xl rounded-lg px-6 py-3.5 text-center text-lg font-medium shadow-lg ${
          kind === "error" ? "bg-red-100 text-red-800" : "bg-turmeric-400 text-veda-900"
        }`}
      >
        {text}
      </button>
    </div>
  );
}
