"use client";

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "@/stores/toastStore";

function listingUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).href;
}

function prefersNativeShare(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  const mobileUa = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return mobileUa || coarse;
}

function ShareNodesIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

const iconBtn =
  "grid h-9 w-9 place-items-center rounded-lg text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-veda-500";

export function ShareListing({
  title,
  text,
  path,
}: {
  title: string;
  text?: string | null;
  path: string;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(path);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();

  useEffect(() => {
    setUrl(listingUrl(path));
  }, [path]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onTrigger() {
    const shareUrl = listingUrl(path);
    setUrl(shareUrl);
    const shareText = (text ?? "").trim();
    if (prefersNativeShare()) {
      try {
        await navigator.share({
          title,
          text: shareText || title,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    setOpen((v) => !v);
  }

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied.");
      setOpen(false);
    } catch {
      toast("Could not copy the link.", "error");
    }
  }

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Share this listing"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-haspopup="dialog"
        onClick={() => void onTrigger()}
        className="grid h-10 w-10 place-items-center bg-transparent text-black hover:opacity-70"
      >
        <ShareNodesIcon />
      </button>

      {open ? (
        <div
          id={dialogId}
          role="dialog"
          aria-label="Share on"
          className="absolute right-0 top-12 z-50 w-[min(20rem,calc(100vw-2rem))] rounded-xl bg-white p-4 shadow-xl ring-1 ring-black/10 sm:right-full sm:top-0 sm:mr-3 sm:w-auto"
        >
          <div className="mb-3 flex items-center justify-between gap-6">
            <p className="text-sm font-medium text-foreground/55">Share on</p>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-full text-lg leading-none text-foreground/45 hover:bg-veda-50 hover:text-foreground/80"
            >
              &times;
            </button>
          </div>
          <div className="flex items-center gap-2">
            <a
              className={`${iconBtn} bg-[#1877F2]`}
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Share on Facebook"
              onClick={() => setOpen(false)}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.6l.4-3H13v-1.4c0-.6.4-1 1-1z" />
              </svg>
            </a>
            <a
              className={`${iconBtn} bg-[#1DA1F2]`}
              href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Share on Twitter"
              onClick={() => setOpen(false)}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M22 5.8c-.7.3-1.5.5-2.3.6.8-.5 1.4-1.3 1.7-2.2-.8.5-1.6.8-2.5 1A3.9 3.9 0 0 0 12 8.6c0 .3 0 .6.1.9-3.2-.2-6.1-1.7-8-4.1-.4.6-.5 1.3-.5 2 0 1.4.7 2.6 1.8 3.3-.6 0-1.2-.2-1.8-.5v.1c0 1.9 1.4 3.5 3.2 3.9-.3.1-.7.1-1.1.1-.3 0-.5 0-.8-.1.5 1.6 2 2.7 3.8 2.8A7.8 7.8 0 0 0 2 18.4 11 11 0 0 0 8 20c7.2 0 11.1-6 11.1-11.1v-.5c.8-.5 1.4-1.2 1.9-2z" />
              </svg>
            </a>
            <a
              className={`${iconBtn} bg-[#0A66C2]`}
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Share on LinkedIn"
              onClick={() => setOpen(false)}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M6.5 9H4V20h2.5V9zM5.2 4C4.2 4 3.4 4.8 3.4 5.8S4.2 7.6 5.2 7.6 7 6.8 7 5.8 6.2 4 5.2 4zM20 20h-2.5v-5.6c0-1.5-.5-2.5-1.8-2.5-1 0-1.5.7-1.8 1.3-.1.2-.1.6-.1.9V20H11V9h2.4v1.5c.4-.7 1.2-1.7 2.9-1.7 2.1 0 3.7 1.4 3.7 4.3V20z" />
              </svg>
            </a>
            <a
              className={`${iconBtn} bg-[#FF4500]`}
              href={`https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Share on Reddit"
              onClick={() => setOpen(false)}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M14.1 3.3a1.1 1.1 0 0 0-.3 2.2l.1.9c-1.2.1-2.3.4-3.3.9A2.2 2.2 0 0 0 8 6.2a2.2 2.2 0 0 0-2.1 2.8 3.6 3.6 0 0 0-1 .2 2.2 2.2 0 1 0 1.1 4.1c.1 1.7 1.9 3.1 4.4 3.4a4 4 0 0 0-.2 1.2c0 .4.3.7.7.7s.7-.3.7-.7c0-.3.1-.6.2-.8 1.1.2 2.3.2 3.4 0 .1.2.2.5.2.8 0 .4.3.7.7.7s.7-.3.7-.7a4 4 0 0 0-.2-1.2c2.5-.3 4.3-1.7 4.4-3.4a2.2 2.2 0 1 0 1.1-4.1 3.6 3.6 0 0 0-1-.2 2.2 2.2 0 0 0-4.2-.7c-1-.5-2.1-.8-3.3-.9l-.2-1.2a1.1 1.1 0 0 0 .8-1.1c0-.6-.5-1.1-1.1-1.1zm-5.4 8.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4zm6.6 0a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4zm-5.6 3.4c.5.5 1.4.8 2.3.8s1.8-.3 2.3-.8a.6.6 0 0 1 .8.8c-.7.7-1.9 1.1-3.1 1.1s-2.4-.4-3.1-1.1a.6.6 0 0 1 .8-.8z" />
              </svg>
            </a>
            <button
              type="button"
              className={`${iconBtn} bg-neutral-300 text-neutral-700`}
              aria-label="Copy link"
              onClick={() => void copyLink()}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
          <span className="pointer-events-none absolute -top-1.5 right-4 h-3 w-3 rotate-45 bg-white ring-1 ring-black/10 sm:hidden" />
          <span className="pointer-events-none absolute -right-1.5 top-4 hidden h-3 w-3 rotate-45 bg-white ring-1 ring-black/10 sm:block" />
        </div>
      ) : null}
    </div>
  );
}
