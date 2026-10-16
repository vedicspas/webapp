"use client";

import { useEffect, useRef, useState } from "react";
import { useMetaStore } from "@/stores/metaStore";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Could not load captcha.")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load captcha."));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function useTurnstileSiteKey(): string | null {
  const fromMeta = useMetaStore((s) => s.meta.turnstileSiteKey ?? null);
  const hydrate = useMetaStore((s) => s.hydrate);
  const [key, setKey] = useState<string | null>(fromMeta);

  useEffect(() => {
    if (fromMeta) {
      setKey(fromMeta);
      return;
    }
    const url = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";
    fetch(`${url}/meta`, { cache: "no-store" })
      .then((r) => r.json())
      .then((live: { turnstileSiteKey?: string | null }) => {
        const next = live?.turnstileSiteKey?.trim() || null;
        if (next) {
          setKey(next);
          const current = useMetaStore.getState().meta;
          hydrate({ ...current, turnstileSiteKey: next });
        }
      })
      .catch(() => {});
  }, [fromMeta, hydrate]);

  return key;
}

export function TurnstileField({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey || !hostRef.current) return;
    let cancelled = false;

    loadTurnstile()
      .then(() => {
        if (cancelled || !hostRef.current || !window.turnstile) return;
        if (widgetId.current) {
          window.turnstile.remove(widgetId.current);
          widgetId.current = null;
        }
        widgetId.current = window.turnstile.render(hostRef.current, {
          sitekey: siteKey,
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => onTokenRef.current(""),
          theme: "light",
        });
      })
      .catch(() => onTokenRef.current(""));

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [siteKey]);

  return <div ref={hostRef} className="flex justify-center" />;
}
