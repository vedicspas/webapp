"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/useApi";
import type { SessionUser } from "@vedic/shared";

function VendorRegisterForm() {
  const { call, authStatus } = useApi();
  const { data: session, update } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/vendor/spas/new";
  const [businessName, setBusinessName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.replace("/auth/signin?intent=vendor&callbackUrl=/list-spa");
    }
  }, [authStatus, router]);

  useEffect(() => {
    const role = session?.appUser?.role;
    if (role === "vendor" || role === "admin") {
      router.replace(next);
    }
  }, [next, router, session?.appUser?.role]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await call<{ apiToken: string; user: SessionUser }>(
        "/vendor/register",
        { method: "POST", body: { businessName } }
      );
      await update({ apiToken: result.apiToken, appUser: result.user });
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setBusy(false);
    }
  }

  if (authStatus !== "authenticated") {
    return <div className="mx-auto max-w-md px-4 py-16 text-center text-foreground/60">Loading&hellip;</div>;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold text-veda-900">List your spa</h1>
      <p className="mt-1 text-sm text-foreground/60">
        Enter your business name to start listing. You will stay signed in.
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
          {busy ? "Creating\u2026" : "Continue"}
        </button>
      </form>
    </div>
  );
}

export default function VendorRegisterPage() {
  return (
    <Suspense>
      <VendorRegisterForm />
    </Suspense>
  );
}
