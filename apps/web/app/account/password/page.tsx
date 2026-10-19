"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/useApi";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { call, authStatus } = useApi();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.replace("/auth/signin?callbackUrl=/account/password");
    }
  }, [authStatus, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await call("/auth/change-password", {
        method: "POST",
        body: { currentPassword, password },
      });
      setDone(true);
      setCurrentPassword("");
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change your password");
    } finally {
      setBusy(false);
    }
  }

  if (authStatus === "loading" || authStatus === "unauthenticated") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-foreground/60">Loading&hellip;</div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold text-veda-900">Change password</h1>
      {done ? (
        <p className="mt-4 text-sm leading-relaxed text-foreground/70">
          Your password has been changed. You can sign in with it next time. If this wasn’t you, contact
          support right away.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-foreground/60">
            Enter your current password, then choose a new one (8+ characters).
          </p>
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
              className="w-full rounded-lg border border-veda-200 px-3 py-2.5 text-sm"
            />
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
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className="w-full rounded-lg border border-veda-200 px-3 py-2.5 text-sm"
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-veda-700 py-2.5 font-medium text-white hover:bg-veda-600 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save new password"}
            </button>
          </form>
        </>
      )}
      <p className="mt-6 text-center text-sm text-foreground/60">
        <Link href="/auth/forgot" className="text-veda-600 hover:underline">
          Forgot your current password?
        </Link>
      </p>
    </div>
  );
}
