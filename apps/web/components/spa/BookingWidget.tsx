"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type {
  AvailabilitySlot,
  CreateBookingResponse,
  ProgramRun,
  RetreatAvailability,
  SpaDetail,
  Treatment,
} from "@vedic/shared";
import { money, PAYMENT_MODE_LABELS, shortDate, timeOfDay, treatmentDurationLabel } from "@/lib/format";
import { toast } from "@/stores/toastStore";
import { PaymentForm } from "./PaymentForm";
import { TreatmentCaption } from "@/components/TreatmentCaption";
import { DateField } from "@/components/DateField";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

type Step = "pick" | "pay" | "done";

function batchLabel(batch: { label: string; startTime: string; endTime: string }): string {
  const times = `${batch.startTime}–${batch.endTime}`;
  return batch.label.trim() ? `${batch.label.trim()} (${times})` : times;
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function BookingWidget({ spa }: { spa: SpaDetail }) {
  const { data: session } = useSession();
  const router = useRouter();

  const [treatmentId, setTreatmentId] = useState<number | null>(
    spa.treatments[0]?.id ?? null
  );
  const [treatments, setTreatments] = useState<Treatment[]>(spa.treatments);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [retreatAvail, setRetreatAvail] = useState<RetreatAvailability | null>(null);
  const [programRuns, setProgramRuns] = useState<ProgramRun[]>([]);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [partySize, setPartySize] = useState(1);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [result, setResult] = useState<CreateBookingResponse | null>(null);

  const treatment: Treatment | undefined = treatments.find((t) => t.id === treatmentId);
  const selectedRun = programRuns.find((r) => r.startDate === selectedStart);
  const selectedBatch = selectedRun?.batches.find((b) => b.id === selectedBatchId);

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

  useEffect(() => {
    if (!treatment) return;

    if (treatment.kind === "retreat") {
      fetch(`${API_URL}/treatments/${treatment.id}/retreat-availability`)
        .then((r) => r.json())
        .then((data) => setRetreatAvail(data && typeof data === "object" ? data : null))
        .catch(() => setRetreatAvail(null));
      setSlots([]);
      setProgramRuns([]);
    } else if (treatment.kind === "program") {
      fetch(`${API_URL}/treatments/${treatment.id}/program-runs`)
        .then((r) => r.json())
        .then((data) => setProgramRuns(Array.isArray(data) ? data : []))
        .catch(() => setProgramRuns([]));
      setSlots([]);
      setRetreatAvail(null);
    } else if (date) {
      fetch(`${API_URL}/spas/${spa.slug}/availability?treatmentId=${treatment.id}&date=${date}`)
        .then((r) => r.json())
        .then((data) => setSlots(Array.isArray(data) ? data : []))
        .catch(() => setSlots([]));
      setRetreatAvail(null);
      setProgramRuns([]);
    }
  }, [treatment, date, spa.slug]);

  useEffect(() => {
    if (treatment?.kind !== "program") return;
    if (programRuns.length === 1 && selectedStart !== programRuns[0].startDate) {
      setSelectedStart(programRuns[0].startDate);
    }
  }, [treatment?.kind, programRuns, selectedStart]);

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

  const retreatRemaining = date && retreatAvail ? retreatAvail.remainingByDate[date] ?? 0 : 0;
  const batchRemaining = selectedBatch
    ? selectedBatch.capacity - selectedBatch.bookedCount
    : 0;
  const canReserve =
    Boolean(treatment) &&
    !loading &&
    (treatment?.kind === "session"
      ? Boolean(selectedStart)
      : treatment?.kind === "retreat"
        ? Boolean(date) && retreatRemaining >= partySize
        : Boolean(selectedStart && selectedBatchId) && batchRemaining >= partySize);

  async function book() {
    if (!session?.apiToken) {
      router.push("/auth/signin");
      return;
    }
    if (!treatment) return;
    const startsAt =
      treatment.kind === "session" ? selectedStart : treatment.kind === "retreat" ? date : selectedStart;
    if (!startsAt) return;
    if (treatment.kind === "program" && !selectedBatchId) return;
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
          startsAt,
          partySize,
          ...(treatment.kind === "program" ? { batchId: selectedBatchId } : {}),
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
          {result.booking.treatmentKind === "session" || result.booking.treatmentKind === "program" ? (
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
            setSelectedBatchId(null);
            setDate("");
            setRetreatAvail(null);
            setProgramRuns([]);
          }}
          className="mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm"
        >
          {treatments.map((t) => {
            const duration = treatmentDurationLabel(t);
            return (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.categoryName ? ` - ${t.categoryName}` : ""}
                {" — "}
                {money(t.priceMinor, spa.currencyCode)}
                {duration ? ` · ${duration}` : ""}
              </option>
            );
          })}
        </select>
      </label>
      )}

      {treatments.length === 0 ? null : (
      <>
      {treatment?.kind === "session" ? (
        <>
          <div className="mt-3">
            <p className="text-sm font-medium">Date</p>
            <DateField
              value={date}
              minDate="today"
              onChange={(next) => {
                setDate(next);
                setSelectedStart(null);
              }}
            />
          </div>
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
      ) : treatment?.kind === "retreat" ? (
        <div className="mt-3">
          <p className="text-sm font-medium">Start date</p>
          <DateField
            value={date}
            minDate="today"
            maxDate={addMonths(new Date(), 6)}
            isDateEnabled={(iso) => (retreatAvail?.remainingByDate[iso] ?? 0) >= partySize}
            onChange={(next) => {
              setDate(next);
              setSelectedStart(next);
            }}
          />
          <p className="mt-1.5 text-xs text-foreground/55">
            This is a {treatment.durationDays}-day stay. You can start on the weekdays the clinic has
            opened for this retreat.
          </p>
          {date && retreatAvail ? (
            <p className="mt-1 text-sm text-foreground/70">
              {retreatRemaining > 0
                ? `${retreatRemaining} spot${retreatRemaining === 1 ? "" : "s"} available on this start date.`
                : "That start date is full."}
            </p>
          ) : null}
        </div>
      ) : treatment?.kind === "program" ? (
        <div className="mt-3">
          {programRuns.length > 1 ? (
            <label className="block text-sm font-medium">
              Start date
              <select
                value={selectedStart ?? ""}
                onChange={(e) => {
                  setSelectedStart(e.target.value || null);
                  setSelectedBatchId(null);
                }}
                className="mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm"
              >
                <option value="">Choose a start date</option>
                {programRuns.map((run) => (
                  <option key={run.id} value={run.startDate}>
                    {shortDate(run.startDate)}
                    {run.endDate !== run.startDate ? ` – ${shortDate(run.endDate)}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : programRuns.length === 1 ? (
            <p className="text-sm text-foreground/70">
              Starts {shortDate(programRuns[0].startDate)}
              {programRuns[0].endDate !== programRuns[0].startDate
                ? ` · ${treatment.durationDays} days`
                : ""}
            </p>
          ) : (
            <p className="text-sm text-foreground/60">No upcoming dates are listed for this program.</p>
          )}
          {selectedRun ? (
            <div className="mt-3">
              <p className="text-sm font-medium">Time batch</p>
              <div className="mt-1 grid gap-1.5">
                {selectedRun.batches.map((batch) => {
                  const left = batch.capacity - batch.bookedCount;
                  return (
                    <button
                      key={batch.id}
                      type="button"
                      disabled={left < partySize}
                      onClick={() => setSelectedBatchId(batch.id)}
                      className={`rounded-lg px-3 py-2 text-left text-sm ${
                        selectedBatchId === batch.id
                          ? "bg-veda-700 text-white"
                          : "border border-veda-200 hover:bg-veda-50"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {batchLabel(batch)}
                      {" · "}
                      {left > 0 ? `${left} spot${left === 1 ? "" : "s"}` : "full"}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <p className="mt-1.5 text-xs text-foreground/55">
            This is a {treatment.durationDays}-day program. Pick a start date and a time batch.
          </p>
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
        disabled={!canReserve}
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
