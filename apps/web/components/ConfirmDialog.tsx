"use client";

import { useEffect, useId } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title = "Please confirm",
  message,
  confirmLabel = "Yes - Confirm",
  cancelLabel = "No - Cancel",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-veda-950/55 backdrop-blur-sm"
        disabled={busy}
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-[0_24px_80px_rgba(16,31,23,0.35)]"
        style={{ animation: "confirm-in 180ms ease-out" }}
      >
        <div className="h-1.5 bg-gradient-to-r from-turmeric-400 via-veda-500 to-veda-800" />
        <div className="px-6 py-6 sm:px-8 sm:py-7">
          <p id={titleId} className="text-lg font-semibold text-veda-900">
            {title}
          </p>
          <p id={messageId} className="mt-3 text-sm leading-relaxed text-foreground/75">
            {message}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="rounded-full bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50"
            >
              {busy ? "Updating…" : confirmLabel}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded-full bg-gray-200 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
