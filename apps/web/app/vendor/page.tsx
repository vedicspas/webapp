"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/useApi";
import { toast } from "@/stores/toastStore";

interface VendorMe {
  id: number;
  businessName: string;
  status: "pending" | "approved" | "suspended";
  stripeOnboarded: boolean;
  hasStripeAccount: boolean;
  spas: {
    id: number;
    slug: string;
    name: string;
    cityName: string;
    paymentModeCode: string;
    isPublished: boolean;
  }[];
}

export default function VendorDashboardPage() {
  const { call, token, authStatus } = useApi();
  const [me, setMe] = useState<VendorMe | null>(null);
  const [notVendor, setNotVendor] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    call<VendorMe>("/vendor/me")
      .then(setMe)
      .catch((err: Error) => {
        if (err.message.includes("Vendor account")) setNotVendor(true);
      });
  }, [call]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  // Refresh Stripe status when returning from onboarding
  useEffect(() => {
    if (token && window.location.search.includes("stripe=return")) {
      call("/vendor/stripe/status").then(load);
    }
  }, [token, call, load]);

  async function onboardStripe() {
    setBusy(true);
    try {
      const { url } = await call<{ url: string }>("/vendor/stripe/onboard", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Stripe onboarding unavailable", "error");
      setBusy(false);
    }
  }

  if (authStatus === "unauthenticated") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-foreground/60">
        <Link href="/auth/signin" className="text-veda-600 underline">
          Sign in
        </Link>{" "}
        to manage your spa.
      </div>
    );
  }

  if (notVendor) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-veda-900">List your spa on VedaFinder</h1>
        <p className="mt-2 text-foreground/60">
          Create a free vendor account to publish your center, take bookings and reply to reviews.
        </p>
        <Link
          href="/list-spa"
          className="mt-6 inline-block rounded-full bg-turmeric-400 px-6 py-2.5 font-semibold text-veda-900 hover:bg-turmeric-300"
        >
          List your spa
        </Link>
      </div>
    );
  }

  if (!me) return <div className="mx-auto max-w-4xl px-4 py-10 text-foreground/60">Loading&hellip;</div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-veda-900">{me.businessName}</h1>

      {me.status === "pending" ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your vendor account is <strong>awaiting approval</strong> by the VedaFinder team. You can
          prepare your listings, treatments and Stripe setup now; publishing goes live once you are
          approved.
        </p>
      ) : null}
      {me.status === "suspended" ? (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          Your vendor account is <strong>suspended</strong> and your listings are hidden from the
          marketplace. Contact support for details.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link href="/vendor/bookings" className="rounded-full border border-veda-300 px-4 py-1.5 hover:bg-veda-50">
          Bookings
        </Link>
        <Link href="/vendor/reviews" className="rounded-full border border-veda-300 px-4 py-1.5 hover:bg-veda-50">
          Reviews
        </Link>
        <Link href="/vendor/spas/new" className="rounded-full border border-veda-300 px-4 py-1.5 hover:bg-veda-50">
          Add a spa
        </Link>
      </div>

      <section className="mt-6 rounded-2xl border border-veda-100 bg-white p-5">
        <h2 className="font-semibold text-veda-900">Payments</h2>
        {me.stripeOnboarded ? (
          <p className="mt-1 text-sm text-veda-700">
            &#10003; Stripe account connected. Online payments go straight to your account, minus
            the platform fee.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-foreground/70">
              Connect a Stripe account to accept online prepayments and deposits. Until then, only
              &ldquo;pay at spa&rdquo; and booking-fee reservations work.
            </p>
            <button
              onClick={onboardStripe}
              disabled={busy}
              className="mt-3 rounded-full bg-veda-700 px-5 py-2 text-sm font-medium text-white hover:bg-veda-600 disabled:opacity-50"
            >
              {busy ? "Redirecting\u2026" : me.hasStripeAccount ? "Resume Stripe onboarding" : "Connect Stripe"}
            </button>
          </>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-semibold text-veda-900">Your spas</h2>
        <div className="space-y-3">
          {me.spas.map((spa) => (
            <div
              key={spa.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-veda-100 bg-white p-4"
            >
              <div>
                <p className="font-medium text-veda-900">{spa.name}</p>
                <p className="text-sm text-foreground/60">
                  {spa.cityName} &middot; {spa.isPublished ? "Published" : "Draft"}
                </p>
              </div>
              <div className="flex gap-2 text-sm">
                <Link
                  href={`/vendor/spas/${spa.id}`}
                  className="rounded-full bg-veda-700 px-4 py-1.5 text-white hover:bg-veda-600"
                >
                  Edit
                </Link>
                {spa.isPublished ? (
                  <Link
                    href={`/spas/${spa.slug}`}
                    className="rounded-full border border-veda-300 px-4 py-1.5 hover:bg-veda-50"
                  >
                    View
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
          {me.spas.length === 0 ? (
            <p className="text-sm text-foreground/60">No spas yet. Add your first listing.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
