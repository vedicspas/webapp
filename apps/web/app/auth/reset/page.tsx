"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageBusy } from "@/components/PageBusy";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Could not reset password");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-sm px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-veda-900">Reset password</h1>
        <p className="mt-3 text-sm text-foreground/70">This reset link is invalid or expired.</p>
        <p className="mt-6 text-sm">
          <Link href="/auth/forgot" className="text-veda-600 hover:underline">
            Request a new link
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold text-veda-900">Choose a new password</h1>
      {done ? (
        <p className="mt-4 text-sm leading-relaxed text-foreground/70">
          Your password has been updated.{" "}
          <Link href="/auth/signin" className="text-veda-600 hover:underline">
            Sign in
          </Link>
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password (8+ characters)"
            autoComplete="new-password"
            className="w-full rounded-lg border border-veda-200 px-3 py-2.5 text-sm"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-veda-700 py-2.5 font-medium text-white hover:bg-veda-600 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<PageBusy label="Loading…" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
