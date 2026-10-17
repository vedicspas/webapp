"use client";

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { setSignupIntent } from "@/lib/signupIntent";
import { TurnstileField, useTurnstileSiteKey } from "@/components/TurnstileField";
import { useApi } from "@/lib/useApi";
import { toast } from "@/stores/toastStore";
import type { SessionUser } from "@vedic/shared";

const CLAIM_OPEN_KEY = "veda_open_claim";
const RELATIONSHIPS = ["Owner", "Manager", "Authorized representative", "Other"] as const;
const RESEND_MS = 30_000;

type AuthMode = "login" | "signup";

interface PublicClaim {
  id: number;
  status: "draft" | "pending" | "approved" | "rejected";
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  relationship: string;
  notes: string | null;
  hasDocument: boolean;
  documentName: string | null;
  otpVerified: boolean;
  rejectionNote: string | null;
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-veda-900">
      {children}
    </label>
  );
}

function AutoNotes({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  className: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    const cs = getComputedStyle(el);
    const line = Number.parseFloat(cs.lineHeight) || 20;
    const pad =
      (Number.parseFloat(cs.paddingTop) || 0) + (Number.parseFloat(cs.paddingBottom) || 0);
    const min = line * 2 + pad;
    const max = line * 4 + pad;
    el.style.height = `${Math.min(max, Math.max(min, el.scrollHeight))}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      id={id}
      rows={2}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Include the special details if any."
      className={`${className} resize-none overflow-y-auto whitespace-pre-wrap`}
    />
  );
}

const ClaimUiContext = createContext<{ openClaim: () => void } | null>(null);

export function ClaimUiProvider({
  slug,
  clinicName,
  clinicAddress,
  children,
}: {
  slug: string;
  clinicName: string;
  clinicAddress?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(CLAIM_OPEN_KEY) === slug) {
        sessionStorage.removeItem(CLAIM_OPEN_KEY);
        setOpen(true);
      }
    } catch {
      // sessionStorage may be blocked.
    }
  }, [slug]);

  return (
    <ClaimUiContext.Provider value={{ openClaim: () => setOpen(true) }}>
      {children}
      <ClaimClinicLightbox
        open={open}
        onClose={() => setOpen(false)}
        slug={slug}
        clinicName={clinicName}
        clinicAddress={clinicAddress}
      />
    </ClaimUiContext.Provider>
  );
}

export function ClaimClinicControl({ variant = "link" }: { variant?: "link" | "button" }) {
  const ctx = useContext(ClaimUiContext);
  if (!ctx) return null;
  if (variant === "button") {
    return (
      <button
        type="button"
        className="w-full rounded-full bg-veda-700 py-2.5 font-medium text-white hover:bg-veda-600"
        onClick={ctx.openClaim}
      >
        Claim This Clinic
      </button>
    );
  }
  return (
    <button
      type="button"
      className="mt-2 text-sm font-medium text-veda-700 underline decoration-veda-300 underline-offset-2 hover:text-veda-900"
      onClick={ctx.openClaim}
    >
      Claim this clinic
    </button>
  );
}

export function ClaimClinicLightbox({
  open,
  onClose,
  slug,
  clinicName,
  clinicAddress,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  clinicName: string;
  clinicAddress?: string;
}) {
  const titleId = useId();
  const nameId = `${titleId}-name`;
  const roleId = `${titleId}-role`;
  const emailId = `${titleId}-email`;
  const codeId = `${titleId}-code`;
  const phoneId = `${titleId}-phone`;
  const notesId = `${titleId}-notes`;
  const docsId = `${titleId}-docs`;
  const { data: session, update } = useSession();
  const { call, token } = useApi();
  const siteKey = useTurnstileSiteKey();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [claim, setClaim] = useState<PublicClaim | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [relationship, setRelationship] = useState<(typeof RELATIONSHIPS)[number]>("Owner");
  const [notes, setNotes] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const signedIn = Boolean(session?.appUser);
  const emailVerified = Boolean(claim?.otpVerified);
  const showCode = otpSent && !emailVerified;
  const resendWait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (!open) return;
    setAuthMode("login");
    setError(null);
    setBusy(false);
    setTurnstileToken("");
    setCaptchaReset((n) => n + 1);
    setOtp("");
    setOtpSent(false);
    setFile(null);
    setResendAt(0);
    setSignupIntent("vendor");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy, onClose]);

  useEffect(() => {
    if (!open || resendAt <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [open, resendAt]);

  useEffect(() => {
    if (!open || !signedIn) return;
    const user = session?.appUser;
    setContactName((v) => v || user?.name || "");
    setContactEmail((v) => v || user?.email || "");
    call<{ unclaimed: boolean; myClaim: PublicClaim | null }>(`/spas/${slug}/claim-status`)
      .then((data) => {
        if (data.myClaim) {
          setClaim(data.myClaim);
          setContactName(data.myClaim.contactName || user?.name || "");
          setContactEmail(data.myClaim.contactEmail || user?.email || "");
          setContactPhone(data.myClaim.contactPhone || "");
          if (RELATIONSHIPS.includes(data.myClaim.relationship as (typeof RELATIONSHIPS)[number])) {
            setRelationship(data.myClaim.relationship as (typeof RELATIONSHIPS)[number]);
          }
          setNotes(data.myClaim.notes || "");
          setOtpSent(false);
        }
      })
      .catch(() => {
        // First visit — no claim yet.
      });
  }, [open, signedIn, slug, call, session?.appUser]);

  if (!open) return null;

  async function ensureVendor() {
    const businessName = (contactName || session?.appUser?.name || "Clinic owner").slice(0, 160);
    try {
      const result = await call<{ apiToken: string; user: SessionUser }>("/vendor/register", {
        method: "POST",
        body: { businessName },
      });
      await update({ apiToken: result.apiToken, appUser: result.user });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.toLowerCase().includes("already")) throw err;
    }
  }

  async function saveDraft(): Promise<PublicClaim> {
    await ensureVendor();
    const saved = await call<PublicClaim>(`/spas/${slug}/claims`, {
      method: "POST",
      body: {
        contactName,
        contactEmail,
        contactPhone,
        relationship,
        notes: notes.trim() || null,
      },
    });
    setClaim(saved);
    return saved;
  }

  async function finishAuth() {
    await update();
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    if (siteKey && !turnstileToken) {
      setError("Please confirm you are human.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await signIn("credentials", { email, password, turnstileToken, redirect: false });
    if (result?.error) {
      setBusy(false);
      setTurnstileToken("");
      setCaptchaReset((n) => n + 1);
      setError("Invalid email or password");
      return;
    }
    try {
      await finishAuth();
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signed in, but something went wrong.");
      setBusy(false);
    }
  }

  async function submitSignup(e: React.FormEvent) {
    e.preventDefault();
    if (siteKey && !turnstileToken) {
      setError("Please confirm you are human.");
      return;
    }
    setBusy(true);
    setError(null);
    setSignupIntent("vendor");
    try {
      const res = await fetch(`${apiUrl}/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password, intent: "vendor", turnstileToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      const signed = await signIn("credentials", {
        email,
        apiToken: data.apiToken,
        redirect: false,
      });
      if (signed?.error) throw new Error("Account created, but sign-in failed. Please sign in.");
      await finishAuth();
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setTurnstileToken("");
      setCaptchaReset((n) => n + 1);
      setBusy(false);
    }
  }

  function googleContinue() {
    setSignupIntent("vendor");
    try {
      sessionStorage.setItem(CLAIM_OPEN_KEY, slug);
    } catch {
      // ignore
    }
    const next = `${window.location.pathname}${window.location.search}`;
    void signIn("google", { callbackUrl: `/auth/continue?next=${encodeURIComponent(next)}` });
  }

  function onEmailChange(value: string) {
    setContactEmail(value);
    if (otpSent || claim?.otpVerified) {
      setOtpSent(false);
      setOtp("");
      setResendAt(0);
      if (claim?.otpVerified) setClaim({ ...claim, otpVerified: false });
    }
  }

  async function sendCode() {
    if (contactName.trim().length < 2) {
      setError("Enter your name first.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await saveDraft();
      await call(`/claims/${saved.id}/otp`, { method: "POST" });
      setOtpSent(true);
      setResendAt(Date.now() + RESEND_MS);
      setNow(Date.now());
      toast("Verification code sent.");
    } catch (err) {
      setOtpSent(false);
      setResendAt(0);
      setError(err instanceof Error ? err.message : "Could not send the code");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!claim) return;
    setBusy(true);
    setError(null);
    try {
      await call(`/claims/${claim.id}/verify-otp`, { method: "POST", body: { code: otp } });
      setClaim({ ...claim, otpVerified: true });
      toast("Email verified.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify the code");
    } finally {
      setBusy(false);
    }
  }

  async function uploadDocument() {
    if (!claim || !file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await call<{ documentName: string }>(`/claims/${claim.id}/document`, {
        method: "POST",
        body,
      });
      setClaim({ ...claim, hasDocument: true, documentName: result.documentName });
      setFile(null);
      toast("Document uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the file");
    } finally {
      setBusy(false);
    }
  }

  async function submitClaim() {
    setBusy(true);
    setError(null);
    try {
      const saved = await saveDraft();
      if (file) {
        const body = new FormData();
        body.append("file", file);
        await call(`/claims/${saved.id}/document`, { method: "POST", body });
      }
      await call(`/claims/${saved.id}/submit`, { method: "POST" });
      setClaim({ ...saved, status: "pending" });
      toast("Claim submitted for review.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the claim");
    } finally {
      setBusy(false);
    }
  }

  const locked = claim?.status === "pending" || claim?.status === "approved";
  const field =
    "w-full rounded-lg border border-veda-200 px-3 py-2 text-sm disabled:bg-veda-50 disabled:text-foreground/60";
  const ghostBtn =
    "shrink-0 rounded-full border border-veda-300 px-4 py-2 text-sm font-medium text-veda-900 hover:bg-veda-50 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-veda-950/55 backdrop-blur-sm"
        disabled={busy}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-[0_24px_80px_rgba(16,31,23,0.35)]"
        style={{ animation: "confirm-in 180ms ease-out" }}
      >
        <button
          type="button"
          aria-label="Close"
          disabled={busy}
          onClick={onClose}
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full text-2xl leading-none text-foreground/45 hover:bg-veda-50 hover:text-veda-900 disabled:opacity-50"
        >
          &times;
        </button>
        <div className="h-1.5 shrink-0 bg-gradient-to-r from-turmeric-400 via-veda-500 to-veda-800" />
        <div className="overflow-y-auto px-6 py-6 pr-14 sm:px-8 sm:py-7 sm:pr-16">
          <p id={titleId} className="text-lg font-semibold text-veda-900">
            {clinicName}
          </p>
          <p className="mt-1 text-sm text-foreground/70">
            Address on file: {clinicAddress?.trim() || "not provided"}
          </p>

          {!signedIn ? (
            <>
              <p className="mt-3 text-sm text-foreground/70">
                Sign in or create a clinic owner account to request ownership of this listing.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-veda-50 p-1 text-sm">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setAuthMode("login");
                    setError(null);
                    setTurnstileToken("");
                    setCaptchaReset((n) => n + 1);
                  }}
                  className={`rounded-full py-2 font-medium ${
                    authMode === "login" ? "bg-white text-veda-900 shadow-sm" : "text-foreground/60"
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setAuthMode("signup");
                    setError(null);
                    setTurnstileToken("");
                    setCaptchaReset((n) => n + 1);
                  }}
                  className={`rounded-full py-2 font-medium ${
                    authMode === "signup" ? "bg-white text-veda-900 shadow-sm" : "text-foreground/60"
                  }`}
                >
                  Sign up
                </button>
              </div>
              {authMode === "login" ? (
                <form onSubmit={submitLogin} className="mt-5 space-y-3">
                  <div>
                    <FieldLabel htmlFor={`${titleId}-login-email`}>Email</FieldLabel>
                    <input
                      id={`${titleId}-login-email`}
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={field}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor={`${titleId}-login-password`}>Password</FieldLabel>
                    <input
                      id={`${titleId}-login-password`}
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={field}
                    />
                  </div>
                  {siteKey ? (
                    <TurnstileField key={`login-${captchaReset}`} siteKey={siteKey} onToken={setTurnstileToken} />
                  ) : null}
                  {error ? <p className="text-sm text-red-600">{error}</p> : null}
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-full bg-veda-700 py-2.5 font-medium text-white hover:bg-veda-600 disabled:opacity-50"
                  >
                    {busy ? "Signing in…" : "Sign in"}
                  </button>
                </form>
              ) : (
                <form onSubmit={submitSignup} className="mt-5 space-y-3">
                  <div>
                    <FieldLabel htmlFor={`${titleId}-signup-name`}>Full name</FieldLabel>
                    <input
                      id={`${titleId}-signup-name`}
                      required
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={field}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor={`${titleId}-signup-email`}>Email</FieldLabel>
                    <input
                      id={`${titleId}-signup-email`}
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={field}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor={`${titleId}-signup-password`}>Password</FieldLabel>
                    <input
                      id={`${titleId}-signup-password`}
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 8 characters"
                      className={field}
                    />
                  </div>
                  {siteKey ? (
                    <TurnstileField key={`signup-${captchaReset}`} siteKey={siteKey} onToken={setTurnstileToken} />
                  ) : null}
                  {error ? <p className="text-sm text-red-600">{error}</p> : null}
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-full bg-veda-700 py-2.5 font-medium text-white hover:bg-veda-600 disabled:opacity-50"
                  >
                    {busy ? "Creating account…" : "Create clinic owner account"}
                  </button>
                </form>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={googleContinue}
                className="mt-3 w-full rounded-full border border-veda-300 py-2.5 text-sm font-medium text-veda-900 hover:bg-veda-50 disabled:opacity-50"
              >
                Continue with Google
              </button>
            </>
          ) : locked ? (
            <div className="mt-4 rounded-xl bg-veda-50 px-4 py-3 text-sm text-veda-800">
              {claim?.status === "pending"
                ? "Your claim is awaiting review. We’ll email you when a decision is made."
                : "This claim was approved. You can manage the listing from your vendor dashboard."}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {claim?.status === "rejected" ? (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  A previous claim was not approved
                  {claim.rejectionNote ? `: ${claim.rejectionNote}` : "."} You can submit a new request below.
                </p>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <FieldLabel htmlFor={nameId}>Your name</FieldLabel>
                  <input
                    id={nameId}
                    required
                    autoComplete="name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className={field}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor={roleId}>I am a</FieldLabel>
                  <select
                    id={roleId}
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value as (typeof RELATIONSHIPS)[number])}
                    className={field}
                  >
                    {RELATIONSHIPS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={`grid gap-3 ${showCode ? "md:grid-cols-2" : ""}`}>
                <div>
                  <FieldLabel htmlFor={emailId}>Your email</FieldLabel>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                    <input
                      id={emailId}
                      type="email"
                      required
                      autoComplete="email"
                      value={contactEmail}
                      onChange={(e) => onEmailChange(e.target.value)}
                      className={field}
                    />
                    {emailVerified ? (
                      <span className="inline-flex items-center text-sm font-medium text-veda-700 sm:px-2">
                        Verified
                      </span>
                    ) : !otpSent ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void sendCode()}
                        className={ghostBtn}
                      >
                        Verify email
                      </button>
                    ) : null}
                  </div>
                </div>
                {showCode ? (
                  <div>
                    <FieldLabel htmlFor={codeId}>Verification code</FieldLabel>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                      <input
                        id={codeId}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className={field}
                      />
                      <button
                        type="button"
                        disabled={busy || resendWait > 0}
                        onClick={() => void sendCode()}
                        className={ghostBtn}
                      >
                        {resendWait > 0 ? `Resend (${resendWait}s)` : "Resend"}
                      </button>
                      <button
                        type="button"
                        disabled={busy || !claim || otp.length !== 6}
                        onClick={() => void verifyCode()}
                        className={ghostBtn}
                      >
                        Verify
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div>
                <FieldLabel htmlFor={phoneId}>Your mobile / phone number (Include country code)</FieldLabel>
                <input
                  id={phoneId}
                  required
                  autoComplete="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className={field}
                />
              </div>

              <div>
                <FieldLabel htmlFor={notesId}>Optional note for review team</FieldLabel>
                <AutoNotes id={notesId} value={notes} onChange={setNotes} className={field} />
              </div>

              <div>
                <FieldLabel htmlFor={docsId}>Supporting documents</FieldLabel>
                <input
                  id={docsId}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm file:mr-3 file:rounded-full file:border file:border-veda-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-veda-900 hover:file:bg-veda-50"
                />
                {claim?.documentName ? (
                  <p className="mt-1 text-xs text-foreground/60">Uploaded: {claim.documentName}</p>
                ) : (
                  <p className="mt-1 text-xs text-foreground/50">Optional. PDF or image.</p>
                )}
                {file && claim ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void uploadDocument()}
                    className="mt-2 text-sm text-veda-700 underline"
                  >
                    Upload now
                  </button>
                ) : null}
              </div>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <button
                type="button"
                disabled={busy || !claim?.otpVerified || contactPhone.trim().length < 6}
                onClick={() => void submitClaim()}
                className="w-full rounded-full bg-veda-700 py-2.5 font-medium text-white hover:bg-veda-600 disabled:opacity-50"
              >
                {busy ? "Submitting…" : "Submit claim"}
              </button>
              {!token ? <p className="text-xs text-foreground/50">Session still loading…</p> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
