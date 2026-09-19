"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type {
  AvailabilitySlot,
  CreateBookingResponse,
  RetreatSlot,
  SpaDetail,
  Treatment,
} from "@vedic/shared";
import { money, PAYMENT_MODE_LABELS, shortDate, timeOfDay } from "@/lib/format";
import { toast } from "@/stores/toastStore";
import { PaymentForm } from "./PaymentForm";
import { TreatmentCaption } from "@/components/TreatmentCaption";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

type Step = "pick" | "pay" | "done";

export function BookingWidget({ spa }: { spa: SpaDetail }) {
  const { data: session } = useSession();
  const router = useRouter();

  const [treatmentId, setTreatmentId] = useState<number | null>(
    spa.treatments[0]?.id ?? null
  );
  const [treatments, setTreatments] = useState<Treatment[]>(spa.treatments);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [retreatSlots, setRetreatSlots] = useState<RetreatSlot[]>([]);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [partySize, setPartySize] = useState(1);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [result, setResult] = useState<CreateBookingResponse | null>(null);

  const treatment: Treatment | undefined = treatments.find((t) => t.id === treatmentId);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/spas/${spa.slug}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: SpaDetail) => {
        if (cancelled || !Array.isArray(data.treatments)) return;
        setTreatments(data.treatments);
        setTreatmentId((current) => {
          if (current && data.treatments.some((t) => t.id === current)) return current;
          return data.treatments[0]?.id ?? null;
        });
      })
      .catch(() => {
        /* keep the server-rendered list if the live fetch fails */
      });
    return () => {
      cancelled = true;
    };
  }, [spa.slug]);

  // Load availability whenever treatment/date changes. Selection resets are
  // handled in the select/date change handlers.
  useEffect(() => {
    if (!treatment) return;

    if (treatment.kind === "retreat") {
      fetch(`${API_URL}/treatments/${treatment.id}/retreat-slots`)
        .then((r) => r.json())
        .then(setRetreatSlots)
        .catch(() => setRetreatSlots([]));
    } else if (date) {
      fetch(`${API_URL}/spas/${spa.slug}/availability?treatmentId=${treatment.id}&date=${date}`)
        .then((r) => r.json())
        .then((data) => setSlots(Array.isArray(data) ? data : []))
        .catch(() => setSlots([]));
    }
  }, [treatment, date, spa.slug]);

  const totalMinor = treatment ? treatment.priceMinor * partySize : 0;
  const payNow = useMemo(() => {
    if (!treatment) return 0;
    switch (spa.paymentModeCode) {
      case "full_prepay":
        return totalMinor;
      case "deposit":
        return Math.round((totalMinor * (spa.depositBps ?? 2000)) / 10000);
      case "booking_fee":
        return spa.bookingFeeMinor ?? 500;
      default:
        return 0;
    }
  }, [treatment, totalMinor, spa]);

  async function book() {
    if (!session?.apiToken) {
      router.push("/auth/signin");
      return;
    }
    if (!treatment || !selectedStart) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/bookings`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.apiToken}`,
        },
        body: JSON.stringify({
          treatmentId: treatment.id,
          startsAt: selectedStart,
          partySize,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Booking failed");
      setResult(data as CreateBookingResponse);
      setStep(data.stripeClientSecret ? "pay" : "done");
      toast(data.stripeClientSecret ? "Booking saved. Complete payment to confirm." : "Booking saved.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Booking failed", "error");
    } finally {
      setLoading(false);
    }
  }

  if (step === "done" && result) {
    return (
      <div className="rounded-2xl border border-veda-200 bg-white p-5 shadow-md">
        <p className="text-3xl">&#127881;</p>
        <h3 className="mt-1 text-lg font-semibold text-veda-900">Booking confirmed</h3>
        <p className="mt-2 text-sm text-foreground/75">
          <TreatmentCaption name={result.booking.treatmentName} categoryName={result.booking.treatmentCategoryName} />
          {" "}at {result.booking.spaName} on{" "}
          <strong>{shortDate(result.booking.startsAt)}</strong>
          {result.booking.treatmentKind === "session" ? (
            <> at {timeOfDay(result.booking.startsAt)}</>
          ) : null}
          .
        </p>
        <p className="mt-2 rounded-lg bg-veda-50 px-3 py-2 text-sm">
          Booking ref number: <strong>{result.booking.code}</strong>
        </p>
        <button
          onClick={() => router.push("/account/bookings")}
          className="mt-4 w-full rounded-full bg-veda-700 py-2.5 font-medium text-white hover:bg-veda-600"
        >
          View my bookings
        </button>
      </div>
    );
  }

  if (step === "pay" && result?.stripeClientSecret) {
    return (
      <div className="rounded-2xl border border-veda-200 bg-white p-5 shadow-md">
        <h3 className="text-lg font-semibold text-veda-900">Complete your payment</h3>
        <p className="mb-4 mt-1 text-sm text-foreground/70">
          {money(result.payNowMinor, result.booking.currencyCode)} due now &middot;{" "}
          {PAYMENT_MODE_LABELS[spa.paymentModeCode]}
        </p>
        <PaymentForm
          clientSecret={result.stripeClientSecret}
          onSuccess={() => {
            toast("Payment saved.");
            setStep("done");
          }}
        />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-veda-200 bg-white p-5 shadow-md">
      <h3 className="text-lg font-semibold text-veda-900">Book a treatment</h3>
      <p className="mt-0.5 text-xs text-veda-600">{PAYMENT_MODE_LABELS[spa.paymentModeCode]}</p>

      {treatments.length === 0 ? (
        <p className="mt-4 rounded-lg bg-veda-50 px-3 py-2 text-sm text-foreground/70">
          No treatments are currently offered for booking.
        </p>
      ) : (
      <label className="mt-4 block text-sm font-medium">
        Treatment
        <select
          value={treatmentId ?? ""}
          onChange={(e) => {
            setTreatmentId(Number(e.target.value));
            setSelectedStart(null);
            setDate("");
          }}
          className="mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm"
        >
          {treatments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.categoryName ? ` - ${t.categoryName}` : ""}
              {" — "}
              {money(t.priceMinor, spa.currencyCode)}
              {t.kind === "retreat" && t.nights ? ` · ${t.nights} nights` : ""}
            </option>
          ))}
        </select>
      </label>
      )}

      {treatments.length === 0 ? null : (
      <>
      {treatment?.kind === "session" ? (
        <>
          <label className="mt-3 block text-sm font-medium">
            Date
            <input
              type="date"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => {
                setDate(e.target.value);
                setSelectedStart(null);
              }}
              className="mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm"
            />
          </label>
          {date ? (
            <div className="mt-3">
              <p className="text-sm font-medium">Available times (spa local time)</p>
              {slots.length === 0 ? (
                <p className="mt-1 text-sm text-foreground/60">No free slots on this date.</p>
              ) : (
                <div className="mt-1 grid max-h-40 grid-cols-3 gap-1.5 overflow-y-auto">
                  {slots.map((slot) => (
                    <button
                      key={slot.startsAt}
                      onClick={() => setSelectedStart(slot.startsAt)}
                      className={`rounded-lg px-2 py-1.5 text-sm tabular-nums ${
                        selectedStart === slot.startsAt
                          ? "bg-veda-700 text-white"
                          : "border border-veda-200 hover:bg-veda-50"
                      }`}
                    >
                      {timeOfDay(slot.startsAt)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : treatment ? (
        <div className="mt-3">
          <label className="block text-sm font-medium">
            Start date
            <select
              value={selectedStart ?? ""}
              onChange={(e) => setSelectedStart(e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm"
            >
              <option value="">Choose a start date</option>
              {retreatSlots.map((slot) => {
                const left = slot.capacity - slot.bookedCount;
                return (
                  <option key={slot.id} value={slot.startDate} disabled={left <= 0}>
                    {shortDate(slot.startDate)}
                    {left > 0 ? ` · ${left} spot${left === 1 ? "" : "s"} available` : " · full"}
                  </option>
                );
              })}
            </select>
          </label>
          <p className="mt-1.5 text-xs text-foreground/55">
            This is a {treatment.nights}-night stay at the clinic. Pick a start date the clinic has
            opened for this program.
          </p>
          {retreatSlots.length === 0 ? (
            <p className="mt-1 text-sm text-foreground/60">No start dates are listed yet.</p>
          ) : null}
        </div>
      ) : null}

      <label className="mt-3 block text-sm font-medium">
        Guests
        <select
          value={partySize}
          onChange={(e) => setPartySize(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm"
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "guest" : "guests"}
            </option>
          ))}
        </select>
      </label>

      {treatment ? (
        <div className="mt-4 space-y-1 rounded-xl bg-veda-50 px-4 py-3 text-sm">
          <p className="flex justify-between">
            <span>Total</span>
            <strong>{money(totalMinor, spa.currencyCode)}</strong>
          </p>
          <p className="flex justify-between text-veda-700">
            <span>Due now</span>
            <strong>{payNow > 0 ? money(payNow, spa.currencyCode) : "Nothing - pay at the spa"}</strong>
          </p>
          {spa.paymentModeCode === "deposit" ? (
            <p className="text-xs text-foreground/60">
              Balance of {money(totalMinor - payNow, spa.currencyCode)} is paid at the spa.
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        disabled={!treatment || !selectedStart || loading}
        onClick={book}
        className="mt-4 w-full rounded-full bg-turmeric-400 py-2.5 font-semibold text-veda-900 transition hover:bg-turmeric-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Booking\u2026" : session ? "Reserve" : "Sign in to book"}
      </button>
      </>
      )}
      <p className="mt-2 text-center text-xs text-foreground/50">
        Payments are processed securely by Stripe. Card details never touch our servers.
      </p>
    </div>
  );
}
