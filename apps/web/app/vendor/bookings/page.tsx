"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Booking } from "@vedic/shared";
import { useApi } from "@/lib/useApi";
import { shortDate, timeOfDay } from "@/lib/format";
import { toast } from "@/stores/toastStore";
import { PageBusy } from "@/components/PageBusy";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AffixedField } from "@/components/AffixedInput";
import { TreatmentCaption } from "@/components/TreatmentCaption";

const STATUS_ACTIONS: Record<string, string> = {
  completed: "Mark completed",
  no_show: "No-show",
  cancelled: "Cancel",
};

type VendorBooking = Booking & { guestName: string; guestEmail: string };

interface BookingsResponse {
  spa: { id: number; name: string; cityName: string; clinicCode: string } | null;
  categories: { id: number; name: string }[];
  items: VendorBooking[];
  page: number;
  pageSize: number;
  total: number;
}

function usd(minor: number): string {
  return `USD ${(Number(minor) / 100).toFixed(2)}`;
}

function paymentStatus(b: VendorBooking): string {
  if (b.paymentModeCode === "pay_at_spa" && b.paidMinor <= 0) return "Pay at the spa";
  if (b.statusCode === "pending_payment" && b.paidMinor <= 0) return "Pending payment";
  if (b.paidMinor <= 0) return "Pay at the spa";
  if (b.paidMinor >= b.totalMinor) return `Paid ${usd(b.paidMinor)}`;
  return `${usd(b.paidMinor)} paid / rest at the spa`;
}

function BookingsInner() {
  const { call, token, authStatus } = useApi();
  const router = useRouter();
  const params = useSearchParams();
  const spaId = params.get("spaId") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const guestName = params.get("guestName") ?? "";
  const bookingRef = params.get("bookingRef") ?? "";
  const treatmentIds = params.get("categoryIds") ?? params.get("treatmentIds") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

  const [data, setData] = useState<BookingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [draftGuest, setDraftGuest] = useState(guestName);
  const [draftBookingRef, setDraftBookingRef] = useState(bookingRef);
  const [draftTreatments, setDraftTreatments] = useState<number[]>(
    () => treatmentIds.split(",").map(Number).filter((id) => id > 0)
  );
  const [pending, setPending] = useState<{ id: number; status: string } | null>(null);
  const [busyStatus, setBusyStatus] = useState(false);

  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
    setDraftGuest(guestName);
    setDraftBookingRef(bookingRef);
    setDraftTreatments(treatmentIds.split(",").map(Number).filter((id) => id > 0));
  }, [from, to, guestName, bookingRef, treatmentIds]);

  const qs = useMemo(() => {
    const q = new URLSearchParams();
    if (spaId) q.set("spaId", spaId);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (guestName.trim()) q.set("guestName", guestName.trim());
    if (bookingRef.trim()) q.set("bookingRef", bookingRef.trim());
    if (treatmentIds) q.set("categoryIds", treatmentIds);
    q.set("page", String(page));
    return q.toString();
  }, [spaId, from, to, guestName, bookingRef, treatmentIds, page]);

  const load = useCallback(() => {
    call<BookingsResponse>(`/vendor/bookings?${qs}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [call, qs]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  function applyFilters(nextPage = 1) {
    const q = new URLSearchParams();
    if (spaId) q.set("spaId", spaId);
    if (draftFrom) q.set("from", draftFrom);
    if (draftTo) q.set("to", draftTo);
    if (draftGuest.trim()) q.set("guestName", draftGuest.trim());
    if (draftBookingRef.trim()) q.set("bookingRef", draftBookingRef.trim());
    if (draftTreatments.length) q.set("categoryIds", draftTreatments.join(","));
    q.set("page", String(nextPage));
    router.push(`/vendor/bookings?${q.toString()}`);
  }

  const dismissPending = useCallback(() => {
    setPending((current) => (busyStatus ? current : null));
  }, [busyStatus]);

  async function confirmPending() {
    if (!pending) return;
    setBusyStatus(true);
    try {
      await call(`/vendor/bookings/${pending.id}/status`, { method: "PATCH", body: { status: pending.status } });
      toast("Booking updated.");
      setPending(null);
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update booking", "error");
    } finally {
      setBusyStatus(false);
    }
  }

  if (authStatus === "unauthenticated") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-foreground/60">
        <Link href="/auth/signin" className="text-veda-600 underline">
          Sign in
        </Link>{" "}
        to continue.
      </div>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-veda-900">
        {data?.spa ? `Bookings · ${data.spa.name}` : "Bookings"}
      </h1>
      {data?.spa?.cityName ? <p className="text-sm text-foreground/60">{data.spa.cityName}</p> : null}
      <Link href="/vendor" className="text-sm text-veda-600 hover:underline">
        &larr; Back to dashboard
      </Link>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <form
        className="mt-6 space-y-3 rounded-2xl border border-veda-100 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters(1);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Booking date from
            <input
              type="date"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Booking date to
            <input
              type="date"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Name of the patient
            <input
              type="text"
              value={draftGuest}
              onChange={(e) => setDraftGuest(e.target.value)}
              placeholder="Search by name"
              className="mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium">
            Booking ref number
            <div className="mt-1">
              {data?.spa?.clinicCode ? (
                <AffixedField prefix={`${data.spa.clinicCode}-`}>
                  <input
                    type="text"
                    value={draftBookingRef}
                    onChange={(e) => {
                      let v = e.target.value.toUpperCase();
                      const code = data.spa?.clinicCode;
                      if (code && v.startsWith(code)) v = v.slice(code.length).replace(/^-+/, "");
                      setDraftBookingRef(v);
                    }}
                    placeholder="260919-X9P2 or X9P2"
                    className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-veda-900 outline-none"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </AffixedField>
              ) : (
                <input
                  type="text"
                  value={draftBookingRef}
                  onChange={(e) => setDraftBookingRef(e.target.value.toUpperCase())}
                  placeholder="AA0842-260919-X9P2 or X9P2"
                  className="w-full rounded-lg border border-veda-200 px-3 py-2 text-sm"
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </div>
          </label>
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Treatment category</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(data?.categories ?? []).map((t) => {
              const on = draftTreatments.includes(t.id);
              return (
                <label
                  key={t.id}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                    on ? "border-veda-700 bg-veda-700 text-white" : "border-veda-200 hover:bg-veda-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() =>
                      setDraftTreatments((ids) =>
                        on ? ids.filter((id) => id !== t.id) : [...ids, t.id]
                      )
                    }
                  />
                  {t.name}
                </label>
              );
            })}
            {data && data.categories.length === 0 ? (
              <span className="text-sm text-foreground/50">No treatment categories yet.</span>
            ) : null}
          </div>
        </fieldset>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="submit"
            className="rounded-full bg-blue-600 px-5 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            Search
          </button>
          <button
            type="button"
            className="rounded-full border border-veda-300 bg-white px-5 py-1.5 text-sm hover:bg-veda-50"
            onClick={() => {
              setDraftFrom("");
              setDraftTo("");
              setDraftGuest("");
              setDraftBookingRef("");
              setDraftTreatments([]);
              const q = new URLSearchParams();
              if (spaId) q.set("spaId", spaId);
              router.push(`/vendor/bookings${q.toString() ? `?${q}` : ""}`);
            }}
          >
            Cancel
          </button>
        </div>
      </form>

      <div className="mt-6 space-y-3">
        {data === null ? (
          <p className="text-foreground/60">Loading&hellip;</p>
        ) : data.items.length === 0 ? (
          <p className="text-foreground/60">No bookings match these filters.</p>
        ) : (
          data.items.map((b) => (
            <div key={b.id} className="rounded-2xl border border-veda-100 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-veda-900">{b.guestName}</p>
                <span className="rounded-full bg-veda-50 px-2.5 py-0.5 text-xs font-medium text-veda-800">
                  {b.statusCode.replace("_", " ")}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-veda-800">
                Booking ref number: {b.code}
              </p>
              <dl className="mt-2 grid gap-1 text-sm text-foreground/80 sm:grid-cols-2">
                <div>
                  <dt className="inline text-foreground/50">Booking for: </dt>
                  <dd className="inline">
                    {shortDate(b.startsAt)}
                    {b.treatmentKind === "session" ? <> at {timeOfDay(b.startsAt)}</> : null}
                  </dd>
                </div>
                <div>
                  <dt className="inline text-foreground/50">Booked on: </dt>
                  <dd className="inline">{shortDate(b.createdAt)}</dd>
                </div>
                <div>
                  <dt className="inline text-foreground/50">Treatment: </dt>
                  <dd className="inline">
                    <TreatmentCaption name={b.treatmentName} categoryName={b.treatmentCategoryName} />
                  </dd>
                </div>
                <div>
                  <dt className="inline text-foreground/50">Charges: </dt>
                  <dd className="inline">{usd(b.totalMinor)}</dd>
                </div>
                <div>
                  <dt className="inline text-foreground/50">Payment: </dt>
                  <dd className="inline">{paymentStatus(b)}</dd>
                </div>
                <div>
                  <dt className="inline text-foreground/50">Guests: </dt>
                  <dd className="inline">
                    {b.partySize}
                    {spaId ? null : (
                      <>
                        {" "}
                        &middot; {b.spaName}
                      </>
                    )}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {b.statusCode === "confirmed" || b.statusCode === "pending_payment" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setPending({ id: b.id, status: "completed" })}
                      className="rounded-full bg-veda-700 px-3 py-1 text-white hover:bg-veda-600"
                    >
                      Mark completed
                    </button>
                    <button
                      type="button"
                      onClick={() => setPending({ id: b.id, status: "no_show" })}
                      className="rounded-full border border-veda-300 px-3 py-1 hover:bg-veda-50"
                    >
                      No-show
                    </button>
                    <button
                      type="button"
                      onClick={() => setPending({ id: b.id, status: "cancelled" })}
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

      {data && data.total > 0 ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-foreground/60">
            Page {data.page} of {totalPages} &middot; {data.total} bookings
            {data.pageSize ? ` (${data.pageSize} per page)` : ""}
          </p>
          {totalPages > 1 ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                className="rounded-full border border-veda-300 px-4 py-1.5 disabled:opacity-40"
                onClick={() => applyFilters(page - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                className="rounded-full border border-veda-300 px-4 py-1.5 disabled:opacity-40"
                onClick={() => applyFilters(page + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        title="Confirm booking update"
        message={`You are about to set this booking to "${pending ? STATUS_ACTIONS[pending.status] ?? pending.status : ""}". Are you sure?`}
        busy={busyStatus}
        onConfirm={confirmPending}
        onCancel={dismissPending}
      />
    </div>
  );
}

export default function VendorBookingsPage() {
  return (
    <Suspense fallback={<PageBusy label="Loading bookings…" />}>
      <BookingsInner />
    </Suspense>
  );
}
