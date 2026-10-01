"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageBusy } from "@/components/PageBusy";
import { setSignupIntent, signupRoleFromSearch, type SignupRole } from "@/lib/signupIntent";

const ROLES: { id: SignupRole; title: string; description: string }[] = [
  {
    id: "vendor",
    title: "Vendor / Clinic",
    description: "List your spa / clinic",
  },
  {
    id: "visitor",
    title: "Visitor",
    description: "Review spas, save favorites and book treatments.",
  },
];

function RegisterForm() {
  const params = useSearchParams();
  const [role, setRole] = useState<SignupRole>(() => signupRoleFromSearch(params.get("intent")));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSignupIntent(role);
  }, [role]);

  const signInHref =
    role === "vendor" ? "/auth/signin?intent=vendor&callbackUrl=/list-spa" : "/auth/signin";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100"}/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          intent: role,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      const signedIn = await signIn("credentials", { email, password, redirect: false });
      if (signedIn?.error) throw new Error("Account created, but sign-in failed. Please sign in.");
      window.location.assign("/auth/welcome");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setBusy(false);
    }
  }

  if (busy) {
    return <PageBusy label="Creating your account…" />;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-bold text-veda-900">Create your account</h1>
      <p className="mt-1 text-sm text-foreground/60">Choose how you will use VedaFinder.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {ROLES.map((item) => {
          const selected = role === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setRole(item.id)}
              className={`rounded-2xl border px-4 py-5 text-left transition ${
                selected
                  ? "border-veda-700 bg-veda-50 ring-2 ring-veda-200"
                  : "border-veda-200 bg-white hover:border-veda-400"
              }`}
            >
              <span className="block text-lg font-bold text-veda-900">{item.title}</span>
              <span className="mt-1 block text-sm font-normal text-foreground/70">{item.description}</span>
            </button>
          );
        })}
      </div>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className="w-full rounded-lg border border-veda-200 px-3 py-2.5 text-sm"
        />
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-lg border border-veda-200 px-3 py-2.5 text-sm"
        />
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min 8 characters)"
          className="w-full rounded-lg border border-veda-200 px-3 py-2.5 text-sm"
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-veda-700 py-2.5 font-medium text-white hover:bg-veda-600 disabled:opacity-50"
        >
          Create account
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setSignupIntent(role);
          const next = role === "vendor" ? "/list-spa" : "/";
          void signIn("google", { callbackUrl: `/auth/continue?next=${encodeURIComponent(next)}` });
        }}
        className="mt-3 w-full rounded-full border border-veda-300 py-2.5 text-sm font-medium text-veda-900 hover:bg-veda-50"
      >
        Continue with Google
      </button>

      <p className="mt-6 text-center text-sm text-foreground/60">
        Already have an account?{" "}
        <Link href={signInHref} className="text-veda-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<PageBusy label="Loading…" />}>
      <RegisterForm />
    </Suspense>
  );
}
