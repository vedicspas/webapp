"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signIn("credentials", { email, password, redirect: false });
    setBusy(false);
    if (result?.error) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";
      try {
        const health = await fetch(`${apiUrl}/health`, { cache: "no-store" });
        if (!health.ok) throw new Error("unhealthy");
        setError("Invalid email or password");
      } catch {
        setError(
          `Can't reach the API at ${apiUrl}. Start the database and API (docker compose up), then try again.`
        );
      }
    } else {
      router.push(params.get("callbackUrl") ?? "/");
      router.refresh();
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold text-veda-900">Welcome back</h1>
      <p className="mt-1 text-sm text-foreground/60">Sign in to book treatments and save spas.</p>

      <form onSubmit={submit} className="mt-6 space-y-3">
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-veda-200 px-3 py-2.5 text-sm"
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-veda-700 py-2.5 font-medium text-white hover:bg-veda-600 disabled:opacity-50"
        >
          {busy ? "Signing in\u2026" : "Sign in"}
        </button>
      </form>

      <button
        onClick={() => signIn("google", { callbackUrl: "/" })}
        className="mt-3 w-full rounded-full border border-veda-300 py-2.5 text-sm font-medium text-veda-900 hover:bg-veda-50"
      >
        Continue with Google
      </button>

      <p className="mt-6 text-center text-sm text-foreground/60">
        New here?{" "}
        <Link href="/auth/register" className="text-veda-600 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
