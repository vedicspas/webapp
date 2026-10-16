"use client";

import { useEffect, useId, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { setSignupIntent } from "@/lib/signupIntent";

type Mode = "login" | "signup";

export function ReviewAuthLightbox({
  open,
  onClose,
  onAuthenticated,
  onBeforeGoogle,
}: {
  open: boolean;
  onClose: () => void;
  onAuthenticated: () => void | Promise<void>;
  onBeforeGoogle?: () => void;
}) {
  const titleId = useId();
  const { update } = useSession();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

  useEffect(() => {
    if (!open) return;
    setMode("login");
    setError(null);
    setBusy(false);
    setSignupIntent("visitor");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  async function finishAuth() {
    await update();
    await onAuthenticated();
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) {
      setBusy(false);
      setError("Invalid email or password");
      return;
    }
    try {
      await finishAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signed in, but the review could not be posted.");
      setBusy(false);
    }
  }

  async function submitSignup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSignupIntent("visitor");
    try {
      const res = await fetch(`${apiUrl}/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password, intent: "visitor" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      const signedIn = await signIn("credentials", { email, password, redirect: false });
      if (signedIn?.error) throw new Error("Account created, but sign-in failed. Please sign in.");
      await finishAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setBusy(false);
    }
  }

  function googleContinue() {
    setSignupIntent("visitor");
    onBeforeGoogle?.();
    const next = `${window.location.pathname}${window.location.search}`;
    void signIn("google", { callbackUrl: `/auth/continue?next=${encodeURIComponent(next)}` });
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-veda-950/55 backdrop-blur-sm"
        disabled={busy}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white shadow-[0_24px_80px_rgba(16,31,23,0.35)]"
        style={{ animation: "confirm-in 180ms ease-out" }}
      >
        <div className="h-1.5 bg-gradient-to-r from-turmeric-400 via-veda-500 to-veda-800" />
        <div className="px-6 py-6 sm:px-8 sm:py-7">
          <p id={titleId} className="text-lg font-semibold text-veda-900">
            Please login / sign up to submit your review
          </p>
          <p className="mt-2 text-sm text-foreground/70">
            Your review stays on this page and will be posted as soon as you continue. New accounts join as a
            Visitor.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-veda-50 p-1 text-sm">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className={`rounded-full py-2 font-medium ${
                mode === "login" ? "bg-white text-veda-900 shadow-sm" : "text-foreground/60"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
              className={`rounded-full py-2 font-medium ${
                mode === "signup" ? "bg-white text-veda-900 shadow-sm" : "text-foreground/60"
              }`}
            >
              Sign up
            </button>
          </div>

          {mode === "login" ? (
            <form onSubmit={submitLogin} className="mt-5 space-y-3">
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded-lg border border-veda-200 px-3 py-2.5 text-sm"
              />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-lg border border-veda-200 px-3 py-2.5 text-sm"
              />
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-veda-700 py-2.5 font-medium text-white hover:bg-veda-600 disabled:opacity-50"
              >
                {busy ? "Signing in…" : "Sign in and post review"}
              </button>
            </form>
          ) : (
            <form onSubmit={submitSignup} className="mt-5 space-y-3">
              <input
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className="w-full rounded-lg border border-veda-200 px-3 py-2.5 text-sm"
              />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded-lg border border-veda-200 px-3 py-2.5 text-sm"
              />
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 8 characters)"
                className="w-full rounded-lg border border-veda-200 px-3 py-2.5 text-sm"
              />
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-veda-700 py-2.5 font-medium text-white hover:bg-veda-600 disabled:opacity-50"
              >
                {busy ? "Creating account…" : "Create account and post review"}
              </button>
            </form>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={googleContinue}
            className="mt-3 w-full rounded-full border border-veda-300 py-2.5 text-sm font-medium text-veda-900 hover:bg-veda-50 disabled:opacity-50"
          >
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}
