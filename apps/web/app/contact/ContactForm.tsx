"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { SiteSettings } from "@vedic/shared";
import { useApi } from "@/lib/useApi";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRe = /^[+]?[\d\s().-]{7,20}$/;

function phoneOk(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return phoneRe.test(value.trim()) && digits.length >= 7 && digits.length <= 15;
}

type FieldName = "name" | "email" | "phone" | "subject" | "message";

function fieldClass(state: "idle" | "valid" | "invalid"): string {
  const base = "mt-1 w-full rounded-lg border px-3 py-2.5 text-sm outline-none";
  if (state === "invalid") return `${base} border-red-600`;
  if (state === "valid") return `${base} border-green-600`;
  return `${base} border-veda-200`;
}

function FieldError({ message }: { message: string | null }) {
  return <p className="mt-1 min-h-5 text-xs text-red-600">{message ?? "\u00a0"}</p>;
}

function MailIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6.5 3.5l2.2 2.2a1 1 0 010 1.4L7.2 8.6a12 12 0 007.2 7.2l1.5-1.5a1 1 0 011.4 0l2.2 2.2a1 1 0 010 1.4l-1.3 1.3c-.8.8-2 .9-3.1.4A18 18 0 013.9 7.9c-.5-1.1-.4-2.3.4-3.1l1.3-1.3a1 1 0 011.4 0z" />
    </svg>
  );
}

export function ContactForm() {
  const { data: session, status } = useSession();
  const { call, token } = useApi();
  const loggedIn = Boolean(session?.appUser);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState<Record<FieldName, boolean>>({
    name: false,
    email: false,
    phone: false,
    subject: false,
    message: false,
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/site-settings`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: SiteSettings) => setSettings(data))
      .catch(() => setSettings({ contactEmail: null, contactPhone: null }));
  }, []);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => {
      setDone(false);
      setName("");
      setEmail("");
      setPhone("");
      setSubject("");
      setMessage("");
      setTouched({ name: false, email: false, phone: false, subject: false, message: false });
      setFormError(null);
    }, 15_000);
    return () => window.clearTimeout(timer);
  }, [done]);

  const errors = useMemo(() => {
    const next: Partial<Record<FieldName, string>> = {};
    if (!loggedIn) {
      if (!name.trim()) next.name = "Name is required.";
      if (!email.trim()) next.email = "Email is required.";
      else if (!emailRe.test(email.trim())) next.email = "Enter a valid email address.";
    }
    if (!phone.trim()) next.phone = "Phone number is required.";
    else if (!phoneOk(phone)) next.phone = "Enter a valid phone number.";
    if (!subject.trim()) next.subject = "Subject is required.";
    if (!message.trim()) next.message = "Message is required.";
    return next;
  }, [loggedIn, name, email, phone, subject, message]);

  function stateFor(field: FieldName): "idle" | "valid" | "invalid" {
    if (!touched[field]) return "idle";
    return errors[field] ? "invalid" : "valid";
  }

  function mark(field: FieldName) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true, phone: true, subject: true, message: true });
    if (Object.keys(errors).length) return;
    setBusy(true);
    setFormError(null);
    try {
      const body = loggedIn
        ? { phone: phone.trim(), subject: subject.trim(), message: message.trim() }
        : {
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            subject: subject.trim(),
            message: message.trim(),
          };
      if (token) {
        await call("/contact", { method: "POST", body });
      } else {
        const res = await fetch(`${API_URL}/contact`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error ?? "Could not send message");
      }
      setDone(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not send message");
    } finally {
      setBusy(false);
    }
  }

  const contactEmail = settings?.contactEmail ?? null;
  const contactPhone = settings?.contactPhone ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h1 className="text-3xl font-bold text-veda-900">Contact Us</h1>
          <p className="mt-3 text-foreground/70">
            Have a question about a listing, a booking, or this site? Send a message and we will get
            back to you.
          </p>
          <div className="mt-8 space-y-4">
            {contactEmail ? (
              <a
                href={`mailto:${contactEmail}`}
                className="flex items-center gap-3 text-veda-800 hover:text-veda-950"
              >
                <span className="grid h-10 w-10 place-items-center rounded-full bg-veda-100 text-veda-800">
                  <MailIcon />
                </span>
                <span>
                  Email us at <span className="font-medium underline">{contactEmail}</span>
                </span>
              </a>
            ) : null}
            {contactPhone ? (
              <a
                href={`tel:${contactPhone.replace(/\s/g, "")}`}
                className="flex items-center gap-3 text-veda-800 hover:text-veda-950"
              >
                <span className="grid h-10 w-10 place-items-center rounded-full bg-veda-100 text-veda-800">
                  <PhoneIcon />
                </span>
                <span className="font-medium">{contactPhone}</span>
              </a>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-veda-100 bg-white p-5 sm:p-8">
          {done ? (
            <p className="text-veda-800">
              Thank you. Your message has been sent. We will get back to you soon.
            </p>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-1">
              {!loggedIn && status !== "loading" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Your name
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => mark("name")}
                      className={fieldClass(stateFor("name"))}
                      autoComplete="name"
                    />
                    <FieldError message={touched.name ? errors.name ?? null : null} />
                  </label>
                  <label className="block text-sm font-medium">
                    Your email
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => mark("email")}
                      className={fieldClass(stateFor("email"))}
                      autoComplete="email"
                    />
                    <FieldError message={touched.email ? errors.email ?? null : null} />
                  </label>
                </div>
              ) : null}
              <label className="block text-sm font-medium">
                Phone number
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => mark("phone")}
                  className={fieldClass(stateFor("phone"))}
                  autoComplete="tel"
                />
                <FieldError message={touched.phone ? errors.phone ?? null : null} />
              </label>
              <label className="block text-sm font-medium">
                Subject
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  onBlur={() => mark("subject")}
                  className={fieldClass(stateFor("subject"))}
                />
                <FieldError message={touched.subject ? errors.subject ?? null : null} />
              </label>
              <label className="block text-sm font-medium">
                Your message
                <textarea
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onBlur={() => mark("message")}
                  className={fieldClass(stateFor("message"))}
                />
                <FieldError message={touched.message ? errors.message ?? null : null} />
              </label>
              {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={busy || status === "loading" || (loggedIn && !token)}
                  className="inline-flex items-center gap-2 rounded-lg bg-veda-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-veda-600 disabled:opacity-60"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M3 11.5L21 3l-7.5 18-2.7-6.3L3 11.5z" />
                  </svg>
                  {busy ? "Sending…" : "Send message"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
