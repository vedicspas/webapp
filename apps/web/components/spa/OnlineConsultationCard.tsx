"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ReviewAuthLightbox } from "@/components/spa/ReviewAuthLightbox";
import { toast } from "@/stores/toastStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

function pendingKey(slug: string) {
  return `vedic-consult-open:${slug}`;
}

function httpUrl(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

interface ContactDetails {
  clinicName: string;
  phone: string | null;
  email: string | null;
  bookingUrl: string | null;
}

export function OnlineConsultationCard({
  slug,
  clinicName,
}: {
  slug: string;
  clinicName: string;
}) {
  const { data: session, status, update } = useSession();
  const titleId = useId();
  const noteId = useId();
  const openIdRef = useRef<string | null>(null);
  const revealingRef = useRef(false);
  const autoAttemptRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<string | undefined>(session?.apiToken);
  const [authOpen, setAuthOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<ContactDetails | null>(null);

  const token = session?.apiToken;
  tokenRef.current = token;

  const waitForToken = useCallback(async (preferred?: string | null) => {
    if (preferred) return preferred;
    if (tokenRef.current) return tokenRef.current;
    let sess = await update();
    if (sess?.apiToken) return sess.apiToken;
    await new Promise((r) => setTimeout(r, 300));
    sess = await update();
    return sess?.apiToken || tokenRef.current || "";
  }, [update]);

  const startNewOpen = useCallback(() => {
    const id = crypto.randomUUID();
    openIdRef.current = id;
    sessionStorage.setItem(pendingKey(slug), id);
    return id;
  }, [slug]);

  const resumeOpenId = useCallback(() => {
    const existing = openIdRef.current || sessionStorage.getItem(pendingKey(slug));
    if (existing) {
      openIdRef.current = existing;
      return existing;
    }
    return startNewOpen();
  }, [slug, startNewOpen]);

  const clearPending = useCallback(() => {
    sessionStorage.removeItem(pendingKey(slug));
    openIdRef.current = null;
  }, [slug]);

  const reveal = useCallback(async (apiToken?: string) => {
    const authToken = apiToken || tokenRef.current;
    if (!authToken || revealingRef.current) return false;
    revealingRef.current = true;
    setBusy(true);
    try {
      const openId = resumeOpenId();
      const res = await fetch(`${API_URL}/spas/${slug}/consultation-contact`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ openId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setAuthOpen(true);
        return false;
      }
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Could not load contact details");
      const payload = data as ContactDetails;
      setDetails({
        clinicName: payload.clinicName || clinicName,
        phone: payload.phone?.trim() || null,
        email: payload.email?.trim() || null,
        bookingUrl: httpUrl(payload.bookingUrl),
      });
      setModalOpen(true);
      clearPending();
      const params = new URLSearchParams(window.location.search);
      if (params.has("consult")) {
        params.delete("consult");
        const qs = params.toString();
        window.history.replaceState(
          null,
          "",
          qs ? `${window.location.pathname}?${qs}` : window.location.pathname
        );
      }
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not load contact details", "error");
      return false;
    } finally {
      revealingRef.current = false;
      setBusy(false);
    }
  }, [clearPending, clinicName, resumeOpenId, slug]);

  useEffect(() => {
    if (status !== "authenticated" || !token || autoAttemptRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("consult") !== "1") return;
    autoAttemptRef.current = true;
    void reveal();
  }, [reveal, status, token]);

  useEffect(() => {
    if (!modalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setModalOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  function markReturnUrl() {
    if (!openIdRef.current) resumeOpenId();
    const next = new URLSearchParams(window.location.search);
    next.set("consult", "1");
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }

  async function onViewClick() {
    startNewOpen();
    if (status !== "authenticated" || !token) {
      markReturnUrl();
      setAuthOpen(true);
      return;
    }
    await reveal();
  }

  const hasAny = Boolean(details?.phone || details?.email || details?.bookingUrl);

  return (
    <section
      id="listing-online-consult"
      className="mt-4 scroll-mt-16 rounded-2xl border border-veda-200 bg-white p-5 shadow-md"
    >
      <h3 className="text-lg font-semibold text-veda-900">Online consultation</h3>
      <p className="mt-2 text-sm leading-relaxed text-foreground/75">
        Contact the clinic directly to arrange an online consultation.
      </p>
      <button
        type="button"
        onClick={() => void onViewClick()}
        disabled={busy}
        className="mt-4 w-full rounded-full bg-turmeric-400 py-2.5 font-semibold text-veda-900 transition hover:bg-turmeric-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Loading\u2026" : "View consultation contact details"}
      </button>

      <ReviewAuthLightbox
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onBeforeGoogle={markReturnUrl}
        title="Please login / sign up to view consultation contact details"
        description="Contact details stay on this page and will open as soon as you continue. New accounts join as a Visitor."
        loginSubmitLabel="Sign in and view details"
        signupSubmitLabel="Create account and view details"
        onAuthenticated={async (sess) => {
          setAuthOpen(false);
          const apiToken = await waitForToken(sess?.apiToken);
          if (!apiToken) {
            toast("Signed in. Click the button again to view contact details.", "error");
            return;
          }
          autoAttemptRef.current = true;
          await reveal(apiToken);
        }}
      />

      {modalOpen && details ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            aria-label="Dismiss"
            className="absolute inset-0 bg-veda-950/55 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={noteId}
            ref={dialogRef}
            tabIndex={-1}
            className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white shadow-[0_24px_80px_rgba(16,31,23,0.35)] focus:outline-none"
            style={{ animation: "confirm-in 180ms ease-out" }}
          >
            <div className="h-1.5 bg-gradient-to-r from-turmeric-400 via-veda-500 to-veda-800" />
            <div className="px-6 py-6 sm:px-8 sm:py-7">
              <p id={titleId} className="text-lg font-semibold text-veda-900">
                Contact {details.clinicName}
              </p>
              {hasAny ? (
                <ul className="mt-4 space-y-3 text-sm">
                  {details.phone ? (
                    <li>
                      <span className="block text-foreground/60">Phone</span>
                      <a
                        className="font-medium text-veda-800 underline-offset-2 hover:underline"
                        href={`tel:${details.phone}`}
                      >
                        {details.phone}
                      </a>
                    </li>
                  ) : null}
                  {details.email ? (
                    <li>
                      <span className="block text-foreground/60">Email</span>
                      <a
                        className="font-medium text-veda-800 underline-offset-2 hover:underline"
                        href={`mailto:${details.email}`}
                      >
                        {details.email}
                      </a>
                    </li>
                  ) : null}
                  {details.bookingUrl ? (
                    <li>
                      <a
                        className="font-medium text-veda-800 underline-offset-2 hover:underline"
                        href={details.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Visit clinic&rsquo;s booking/contact page.
                      </a>
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-foreground/70">
                  Consultation contact details are currently unavailable.
                </p>
              )}
              <p id={noteId} className="mt-5 text-sm leading-relaxed text-foreground/55">
                Contact the clinic directly to check availability, fees and consultation options. Booking,
                payment and consultation are handled directly by the clinic. AyurvedaAdvisor does not currently
                provide video consultations on its platform.
              </p>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="mt-6 w-full rounded-full bg-veda-700 py-2.5 text-sm font-medium text-white hover:bg-veda-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
