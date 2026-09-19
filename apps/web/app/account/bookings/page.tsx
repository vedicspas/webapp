"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Booking } from "@vedic/shared";
import { money, shortDate, timeOfDay, PAYMENT_MODE_LABELS } from "@/lib/format";
import { TreatmentCaption } from "@/components/TreatmentCaption";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-veda-100 text-veda-800",
  pending_payment: "bg-amber-100 text-amber-800",
  cancelled: "bg-red-100 text-red-700",
  completed: "bg-blue-100 text-blue-800",
  no_show: "bg-gray-200 text-gray-700",
};

export default function MyBookingsPage() {
  const { data: session, status } = useSession();
  const [bookings, setBookings] = useState<Booking[] | null>(null);

  useEffect(() => {
    if (!session?.apiToken) return;
    fetch(`${API_URL}/bookings/mine`, {
      headers: { authorization: `Bearer ${session.apiToken}` },
    })
      .then((r) => r.json())
      .then(setBookings)
      .catch(() => setBookings([]));
  }, [session?.apiToken]);

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-foreground/60">
          <Link href="/auth/signin" className="text-veda-600 underline">
            Sign in
          </Link>{" "}
          to see your bookings.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-veda-900">My bookings</h1>
      <div className="mt-6 space-y-3">
        {bookings === null ? (
          <p className="text-foreground/60">Loading&hellip;</p>
        ) : bookings.length === 0 ? (
          <p className="text-foreground/60">
            No bookings yet.{" "}
            <Link href="/spas" className="text-veda-600 underline">
              Find a spa
            </Link>{" "}
            to get started.
          </p>
        ) : (
          bookings.map((b) => (
            <div key={b.id} className="rounded-2xl border border-veda-100 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/spas/${b.spaSlug}`}
                  className="font-semibold text-veda-900 hover:underline"
                >
                  {b.spaName}
                </Link>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[b.statusCode] ?? ""}`}
                >
                  {b.statusCode.replace("_", " ")}
                </span>
              </div>
              <p className="mt-1 text-sm text-foreground/75">
                <TreatmentCaption name={b.treatmentName} categoryName={b.treatmentCategoryName} /> &middot;{" "}
                {shortDate(b.startsAt)}
                {b.treatmentKind === "session" ? <> at {timeOfDay(b.startsAt)}</> : null} &middot;{" "}
                {b.partySize} {b.partySize === 1 ? "guest" : "guests"}
              </p>
              <p className="mt-1 text-sm">
                Total {money(b.totalMinor, b.currencyCode)}
                {b.paidMinor > 0 ? <> &middot; paid {money(b.paidMinor, b.currencyCode)}</> : null}{" "}
                &middot; <span className="text-foreground/60">{PAYMENT_MODE_LABELS[b.paymentModeCode]}</span>
              </p>
              <p className="mt-1 text-sm font-medium text-veda-800">
                Booking ref number: {b.code}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
