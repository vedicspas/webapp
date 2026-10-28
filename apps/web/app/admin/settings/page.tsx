"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { SiteSettings } from "@vedic/shared";
import { useApi } from "@/lib/useApi";
import { toast } from "@/stores/toastStore";

const input = "mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm";
const label = "block text-sm font-medium";
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AdminSettingsPage() {
  const { data: session, status } = useSession();
  const { call, token, authStatus } = useApi();
  const isAdmin = session?.appUser?.role === "admin";
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!token || !isAdmin) return;
    call<SiteSettings>("/admin/settings")
      .then((data) => {
        setContactEmail(data.contactEmail ?? "");
        setContactPhone(data.contactPhone ?? "");
        setLoaded(true);
      })
      .catch((err) => toast(err instanceof Error ? err.message : "Could not load settings", "error"));
  }, [call, token, isAdmin]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = contactEmail.trim();
    if (trimmed && !emailRe.test(trimmed)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(null);
    setBusy(true);
    try {
      const saved = await call<SiteSettings>("/admin/settings", {
        method: "PUT",
        body: {
          contactEmail: trimmed || null,
          contactPhone: contactPhone.trim() || null,
        },
      });
      setContactEmail(saved.contactEmail ?? "");
      setContactPhone(saved.contactPhone ?? "");
      toast("Site settings saved.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save settings", "error");
    } finally {
      setBusy(false);
    }
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

  if (status === "loading" || !loaded) {
    return <div className="mx-auto max-w-xl px-4 py-16 text-foreground/60">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <p className="text-sm">
        <Link href="/admin" className="text-veda-700 underline hover:text-veda-900">
          Admin dashboard
        </Link>
        {" · "}
        <Link href="/admin/emails" className="text-veda-700 underline hover:text-veda-900">
          Emails
        </Link>
        {" · "}
        <Link href="/admin/accommodation-types" className="text-veda-700 underline hover:text-veda-900">
          Accommodation types
        </Link>
        {" · "}
        <Link href="/admin/medical-conditions" className="text-veda-700 underline hover:text-veda-900">
          Medical conditions
        </Link>
      </p>
      <h1 className="mt-3 text-2xl font-bold text-veda-900">Site settings</h1>
      <p className="mt-2 text-sm text-foreground/60">
        These values appear on the Contact Us page. Leave a field blank to hide it. The contact
        form still saves messages if email is empty; outbound mail is sent only when Contact Us
        email is set and SMTP is configured.
      </p>
      <form onSubmit={save} className="mt-6 space-y-4 rounded-2xl border border-veda-100 bg-white p-5">
        <label className={label}>
          Contact Us email
          <input
            type="email"
            className={input}
            value={contactEmail}
            onChange={(e) => {
              setContactEmail(e.target.value);
              setEmailError(null);
            }}
            autoComplete="email"
          />
          {emailError ? <p className="mt-1 text-xs text-red-600">{emailError}</p> : null}
        </label>
        <label className={label}>
          Contact Us phone number
          <input
            type="tel"
            className={input}
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            autoComplete="tel"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-veda-700 px-5 py-2 text-sm font-medium text-white hover:bg-veda-600 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
