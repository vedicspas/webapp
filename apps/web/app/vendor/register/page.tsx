"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useApi } from "@/lib/useApi";

export default function VendorRegisterPage() {
  const { call, authStatus } = useApi();
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call("/vendor/register", { method: "POST", body: { businessName } });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setBusy(false);
    }
  }

  if (authStatus === "unauthenticated") {
    router.push("/auth/signin?callbackUrl=/vendor/register");
    return null;
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-veda-900">You&rsquo;re a vendor now</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Your role has changed, so please sign in again to refresh your session. Then you can add
          your first spa listing.
        </p>
        <button
          onClick={() => signOut({ callbackUrl: "/auth/signin?callbackUrl=/vendor" })}
          className="mt-6 rounded-full bg-veda-700 px-6 py-2.5 font-medium text-white hover:bg-veda-600"
        >
          Sign in again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold text-veda-900">Become a vendor</h1>
      <p className="mt-1 text-sm text-foreground/60">
        List your Ayurvedic spa or health center, manage bookings and respond to reviews.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          required
          minLength={2}
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Business name"
          className="w-full rounded-lg border border-veda-200 px-3 py-2.5 text-sm"
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-veda-700 py-2.5 font-medium text-white hover:bg-veda-600 disabled:opacity-50"
        >
          {busy ? "Creating\u2026" : "Create vendor account"}
        </button>
      </form>
    </div>
  );
}
