"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { VendorStatus } from "@vedic/shared";
import { useApi } from "@/lib/useApi";
import { money, shortDate } from "@/lib/format";
import { RatingStars } from "@/components/RatingStars";

interface Stats {
  users: number;
  vendorsPending: number;
  vendorsApproved: number;
  vendorsSuspended: number;
  spasPublished: number;
  spasTotal: number;
  bookings: number;
  grossBookingMinor: number;
  platformFeesMinor: number;
  reviews: number;
}

interface AdminVendor {
  id: number;
  businessName: string;
  status: VendorStatus;
  stripeOnboarded: number;
  createdAt: string;
  ownerName: string;
  ownerEmail: string;
  spaCount: number;
  publishedCount: number;
}

interface AdminSpa {
  id: number;
  slug: string;
  name: string;
  cityName: string;
  isPublished: boolean;
  vendorName: string;
  vendorStatus: VendorStatus;
}

interface AdminReview {
  id: number;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorEmail: string;
  spaName: string;
  spaSlug: string;
}

interface AdminBooking {
  id: number;
  code: string;
  startsAt: string;
  partySize: number;
  totalMinor: number;
  paidMinor: number;
  platformFeeMinor: number;
  statusCode: string;
  paymentModeCode: string;
  spaName: string;
  treatmentName: string;
  guestName: string;
}

type Tab = "vendors" | "spas" | "reviews" | "bookings";

const STATUS_BADGE: Record<VendorStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-veda-100 text-veda-800",
  suspended: "bg-red-100 text-red-700",
};

export default function AdminPage() {
  const { data: session, status: authStatus } = useSession();
  const { call, token } = useApi();
  const [tab, setTab] = useState<Tab>("vendors");
  const [stats, setStats] = useState<Stats | null>(null);
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [spas, setSpas] = useState<AdminSpa[]>([]);
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = session?.appUser?.role === "admin";

  const load = useCallback(async () => {
    try {
      const [s, v, sp, rv, bk] = await Promise.all([
        call<Stats>("/admin/stats"),
        call<AdminVendor[]>("/admin/vendors"),
        call<AdminSpa[]>("/admin/spas"),
        call<AdminReview[]>("/admin/reviews"),
        call<AdminBooking[]>("/admin/bookings"),
      ]);
      setStats(s);
      setVendors(v);
      setSpas(sp);
      setReviews(rv);
      setBookings(bk);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    }
  }, [call]);

  useEffect(() => {
    // All state updates inside load() happen after awaited fetches, not
    // synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (token && isAdmin) load();
  }, [token, isAdmin, load]);

  async function setVendorStatus(id: number, status: VendorStatus) {
    try {
      await call(`/admin/vendors/${id}/status`, { method: "PATCH", body: { status } });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function setSpaPublished(id: number, isPublished: boolean) {
    try {
      await call(`/admin/spas/${id}`, { method: "PATCH", body: { isPublished } });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function deleteReview(id: number) {
    if (!confirm("Delete this review permanently?")) return;
    await call(`/admin/reviews/${id}`, { method: "DELETE" });
    load();
  }

  if (authStatus === "unauthenticated" || (session && !isAdmin)) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-foreground/60">
        Admin access required.{" "}
        <Link href="/auth/signin" className="text-veda-600 underline">
          Sign in
        </Link>{" "}
        with an admin account.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-veda-900">Admin dashboard</h1>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {stats ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Users", stats.users],
            ["Pending vendors", stats.vendorsPending],
            ["Published spas", `${stats.spasPublished}/${stats.spasTotal}`],
            ["Bookings", stats.bookings],
            ["Gross bookings", money(stats.grossBookingMinor)],
            ["Platform fees", money(stats.platformFeesMinor)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-veda-100 bg-white p-3 text-center">
              <p className="text-lg font-bold text-veda-900">{value}</p>
              <p className="text-xs text-foreground/60">{label}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {(
          [
            ["vendors", `Vendors${stats?.vendorsPending ? ` (${stats.vendorsPending} pending)` : ""}`],
            ["spas", "Listings"],
            ["reviews", "Reviews"],
            ["bookings", "Bookings"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-1.5 text-sm ${
              tab === key ? "bg-veda-700 text-white" : "border border-veda-300 text-veda-800 hover:bg-veda-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "vendors" ? (
        <div className="mt-4 space-y-3">
          {vendors.map((v) => (
            <div key={v.id} className="rounded-2xl border border-veda-100 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-veda-900">{v.businessName}</p>
                  <p className="text-sm text-foreground/60">
                    {v.ownerName} ({v.ownerEmail}) &middot; applied {shortDate(v.createdAt)} &middot;{" "}
                    {v.spaCount} listing{v.spaCount === 1 ? "" : "s"} ({v.publishedCount} live)
                    {v.stripeOnboarded ? " · Stripe connected" : ""}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[v.status]}`}>
                  {v.status}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {v.status !== "approved" ? (
                  <button
                    onClick={() => setVendorStatus(v.id, "approved")}
                    className="rounded-full bg-veda-700 px-4 py-1.5 text-white hover:bg-veda-600"
                  >
                    Approve
                  </button>
                ) : null}
                {v.status !== "suspended" ? (
                  <button
                    onClick={() => setVendorStatus(v.id, "suspended")}
                    className="rounded-full border border-red-300 px-4 py-1.5 text-red-700 hover:bg-red-50"
                  >
                    Suspend {v.publishedCount > 0 ? "(unpublishes listings)" : ""}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "spas" ? (
        <div className="mt-4 space-y-3">
          {spas.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-veda-100 bg-white p-4"
            >
              <div>
                <Link href={`/spas/${s.slug}`} className="font-medium text-veda-900 hover:underline">
                  {s.name}
                </Link>
                <p className="text-sm text-foreground/60">
                  {s.cityName} &middot; {s.vendorName}{" "}
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[s.vendorStatus]}`}>
                    {s.vendorStatus}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setSpaPublished(s.id, !s.isPublished)}
                className={`rounded-full px-4 py-1.5 text-sm ${
                  s.isPublished
                    ? "border border-red-300 text-red-700 hover:bg-red-50"
                    : "bg-veda-700 text-white hover:bg-veda-600"
                }`}
              >
                {s.isPublished ? "Unpublish" : "Publish"}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "reviews" ? (
        <div className="mt-4 space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-2xl border border-veda-100 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <RatingStars rating={r.rating} />
                <span className="text-xs text-foreground/50">{shortDate(r.createdAt)}</span>
              </div>
              <p className="mt-1 font-medium text-veda-900">{r.title}</p>
              <p className="mt-1 text-sm text-foreground/80">{r.body}</p>
              <p className="mt-1 text-xs text-foreground/50">
                by {r.authorName} ({r.authorEmail}) on{" "}
                <Link href={`/spas/${r.spaSlug}`} className="text-veda-600 hover:underline">
                  {r.spaName}
                </Link>
              </p>
              <button
                onClick={() => deleteReview(r.id)}
                className="mt-2 rounded-full border border-red-300 px-4 py-1 text-xs text-red-700 hover:bg-red-50"
              >
                Delete review
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "bookings" ? (
        <div className="mt-4 space-y-3">
          {bookings.map((b) => (
            <div key={b.id} className="rounded-2xl border border-veda-100 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-veda-900">
                  {b.treatmentName} <span className="text-foreground/50">at {b.spaName}</span>
                </p>
                <span className="rounded-full bg-veda-50 px-2.5 py-0.5 text-xs font-medium text-veda-800">
                  {b.statusCode.replace("_", " ")}
                </span>
              </div>
              <p className="mt-1 text-foreground/70">
                {shortDate(b.startsAt)} &middot; {b.guestName} &middot; {b.partySize} guest
                {b.partySize === 1 ? "" : "s"} &middot; code {b.code}
              </p>
              <p className="mt-1">
                {money(b.totalMinor)} total &middot; {money(b.paidMinor)} paid online &middot;{" "}
                <span className="text-veda-700">{money(b.platformFeeMinor)} platform fee</span>
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
