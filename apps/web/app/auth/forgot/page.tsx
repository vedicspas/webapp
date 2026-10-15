"use client";

import { useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Could not send reset email");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold text-veda-900">Forgot password</h1>
      {done ? (
        <p className="mt-4 text-sm leading-relaxed text-foreground/70">
          If an account exists for that address, you’ll receive a reset link shortly.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-foreground/60">
            Enter your email and we’ll send a link to choose a new password.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              className="w-full rounded-lg border border-veda-200 px-3 py-2.5 text-sm"
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-veda-700 py-2.5 font-medium text-white hover:bg-veda-600 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        </>
      )}
      <p className="mt-6 text-center text-sm text-foreground/60">
        <Link href="/auth/signin" className="text-veda-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
