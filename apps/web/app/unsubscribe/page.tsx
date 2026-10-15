import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Unsubscribe" };
export const dynamic = "force-dynamic";

const API_URL =
  process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  let message = "This unsubscribe link is invalid or expired.";
  let ok = false;

  if (token) {
    try {
      const res = await fetch(`${API_URL}/unsubscribe?token=${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; email?: string };
      if (res.ok) {
        ok = true;
        message = data.email
          ? `You’ve been unsubscribed. We will no longer send account emails to ${data.email}.`
          : "You’ve been unsubscribed.";
      } else {
        message = data.error ?? message;
      }
    } catch {
      message = "We couldn’t complete this request. Please try again later.";
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-veda-900">{ok ? "Unsubscribed" : "Unsubscribe"}</h1>
      <p className="mt-3 text-sm leading-relaxed text-foreground/70">{message}</p>
      <p className="mt-6">
        <Link href="/" className="text-veda-600 underline hover:text-veda-800">
          Back to AyurvedaAdvisor.com
        </Link>
      </p>
    </div>
  );
}
