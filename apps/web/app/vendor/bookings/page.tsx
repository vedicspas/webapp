"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Booking } from "@vedic/shared";
import { useApi } from "@/lib/useApi";
import { money, shortDate, timeOfDay, PAYMENT_MODE_LABELS } from "@/lib/format";

type VendorBooking = Booking & { guestName: string; guestEmail: string };

export default function VendorBookingsPage() {
  const { call, token, authStatus } = useApi();
  const [bookings, setBookings] = useState<VendorBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    call<VendorBooking[]>("/vendor/bookings")
      .then(setBookings)
      .catch((err: Error) => setError(err.message));
  }, [call]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  async function setStatus(id: number, status: string) {
    await call(`/vendor/bookings/${id}/status`, { method: "PATCH", body: { status } });
    load();
  }

  if (authStatus === "unauthenticated") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-foreground/60">
        <Link href="/auth/signin" className="text-veda-600 underline">Sign in</Link> to continue.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-veda-900">Bookings</h1>
      <Link href="/vendor" className="text-sm text-veda-600 hover:underline">
        &larr; Back to dashboard
      </Link>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <div className="mt-6 space-y-3">
        {bookings === null ? (
          <p className="text-foreground/60">Loading&hellip;</p>
        ) : bookings.length === 0 ? (
          <p className="text-foreground/60">No bookings yet.</p>
        ) : (
          bookings.map((b) => (
            <div key={b.id} className="rounded-2xl border border-veda-100 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-veda-900">
                  {b.treatmentName} <span className="text-foreground/50">at {b.spaName}</span>
                </p>
                <span className="rounded-full bg-veda-50 px-2.5 py-0.5 text-xs font-medium text-veda-800">
                  {b.statusCode.replace("_", " ")}
                </span>
              </div>
              <p className="mt-1 text-sm text-foreground/75">
                {shortDate(b.startsAt)}
                {b.treatmentKind === "session" ? <> at {timeOfDay(b.startsAt)}</> : null} &middot;{" "}
                {b.partySize} {b.partySize === 1 ? "guest" : "guests"} &middot; {b.guestName} (
                {b.guestEmail})
              </p>
              <p className="mt-1 text-sm">
                {money(b.totalMinor, b.currencyCode)} total
                {b.paidMinor > 0 ? <> &middot; {money(b.paidMinor, b.currencyCode)} paid online</> : null}{" "}
                &middot; <span className="text-foreground/60">{PAYMENT_MODE_LABELS[b.paymentModeCode]}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {b.statusCode === "confirmed" || b.statusCode === "pending_payment" ? (
                  <>
                    <button
                      onClick={() => setStatus(b.id, "completed")}
                      className="rounded-full bg-veda-700 px-3 py-1 text-white hover:bg-veda-600"
                    >
                      Mark completed
                    </button>
                    <button
                      onClick={() => setStatus(b.id, "no_show")}
                      className="rounded-full border border-veda-300 px-3 py-1 hover:bg-veda-50"
                    >
                      No-show
                    </button>
                    <button
                      onClick={() => setStatus(b.id, "cancelled")}
                      className="rounded-full border border-red-300 px-3 py-1 text-red-700 hover:bg-red-50"
                    >
                      Cancel
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
