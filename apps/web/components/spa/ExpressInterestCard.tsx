"use client";

import { useEffect, useId, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "@/stores/toastStore";
import { ClaimClinicControl } from "@/components/spa/ClaimClinicLightbox";

const SERVICES = [
  { value: "consultation", label: "Consultation" },
  { value: "massage", label: "Massage" },
  { value: "general_enquiry", label: "General enquiry" },
] as const;

const TIMEFRAMES = [
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "exploring", label: "Exploring options" },
] as const;

const field =
  "w-full rounded-lg border border-veda-200 px-3 py-2 text-sm disabled:bg-veda-50 disabled:text-foreground/60";

export function UnclaimedListingAside({ slug }: { slug: string }) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
      <ExpressInterestCard slug={slug} />
      <div className="rounded-2xl border border-veda-200 bg-white p-5 shadow-md">
        <p className="font-semibold text-veda-900">Own or manage this clinic?</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/70">
          Claim this listing to update its details and manage appointment requests.
        </p>
        <div className="mt-4">
          <ClaimClinicControl variant="button" />
        </div>
      </div>
    </aside>
  );
}

function ExpressInterestCard({ slug }: { slug: string }) {
  const formId = useId();
  const { data: session } = useSession();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(session?.appUser?.name ?? "");
  const [email, setEmail] = useState(session?.appUser?.email ?? "");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [shareConsent, setShareConsent] = useState(false);

  useEffect(() => {
    const user = session?.appUser;
    if (!user) return;
    setName((v) => v || user.name || "");
    setEmail((v) => v || user.email || "");
  }, [session?.appUser]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!shareConsent) {
      setError("Please agree so we can share this enquiry with the clinic after it is claimed.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/spas/${slug}/inquiries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone: phone.trim() || null,
          service: service || null,
          timeframe: timeframe || null,
          shareConsent: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not submit your interest");
      setDone(true);
      toast("Thanks — we’ve logged your interest.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your interest");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-veda-200 bg-white p-5 shadow-md">
      <p className="font-semibold text-veda-900">Interested in visiting this clinic?</p>
      <p className="mt-2 text-sm leading-relaxed text-foreground/75">
        Let us know, and we’ll notify you if this clinic starts accepting appointment enquiries through
        AyurvedaAdvisor.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-foreground/60">
        This clinic has not claimed its listing yet. Submitting your interest does not book an appointment or
        notify the clinic.
      </p>

      {done ? (
        <p className="mt-4 rounded-xl bg-veda-50 px-4 py-3 text-sm text-veda-800">
          Thank you. We’ve recorded your interest. We’ll be in touch if this clinic starts accepting enquiries.
        </p>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 w-full rounded-full bg-veda-700 py-2.5 font-medium text-white hover:bg-veda-600"
        >
          Express Interest
        </button>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
          <div>
            <label htmlFor={`${formId}-name`} className="mb-1 block text-sm font-medium text-veda-900">
              Name
            </label>
            <input
              id={`${formId}-name`}
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label htmlFor={`${formId}-email`} className="mb-1 block text-sm font-medium text-veda-900">
              Email
            </label>
            <input
              id={`${formId}-email`}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label htmlFor={`${formId}-phone`} className="mb-1 block text-sm font-medium text-veda-900">
              Phone (Include country code)
            </label>
            <input
              id={`${formId}-phone`}
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className={field}
            />
          </div>
          <div>
            <label htmlFor={`${formId}-service`} className="mb-1 block text-sm font-medium text-veda-900">
              Interested service
            </label>
            <select
              id={`${formId}-service`}
              value={service}
              onChange={(e) => setService(e.target.value)}
              className={field}
            >
              <option value="">Optional</option>
              {SERVICES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-time`} className="mb-1 block text-sm font-medium text-veda-900">
              Preferred visit timeframe
            </label>
            <select
              id={`${formId}-time`}
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className={field}
            >
              <option value="">Optional</option>
              {TIMEFRAMES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs leading-relaxed text-foreground/55">
            Notify me when this clinic becomes available for enquiries on AyurvedaAdvisor.
          </p>
          <label className="flex items-start gap-2 text-sm leading-relaxed text-foreground/80">
            <input
              type="checkbox"
              className="mt-1"
              checked={shareConsent}
              onChange={(e) => setShareConsent(e.target.checked)}
            />
            <span>
              I agree that AyurvedaAdvisor may share my name, contact details, and selected service with the
              clinic so it can contact me about this enquiry.
            </span>
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-veda-700 py-2.5 font-medium text-white hover:bg-veda-600 disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Submit"}
          </button>
        </form>
      )}
    </div>
  );
}
