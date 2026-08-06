"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { SpaSummary } from "@vedic/shared";
import { SpaCard } from "@/components/SpaCard";
import { useWishlistStore } from "@/stores/wishlistStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

export default function WishlistPage() {
  const { data: session, status } = useSession();
  const wishlistIds = useWishlistStore((s) => s.ids);
  const [spas, setSpas] = useState<SpaSummary[] | null>(null);

  useEffect(() => {
    if (!session?.apiToken) return;
    fetch(`${API_URL}/wishlist`, {
      headers: { authorization: `Bearer ${session.apiToken}` },
    })
      .then((r) => r.json())
      .then(setSpas)
      .catch(() => setSpas([]));
  }, [session?.apiToken]);

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-veda-900">Your wishlist</h1>
        <p className="mt-2 text-foreground/60">
          <Link href="/auth/signin" className="text-veda-600 underline">
            Sign in
          </Link>{" "}
          to save spas you love.
        </p>
      </div>
    );
  }

  const visible = spas?.filter((s) => wishlistIds.has(s.id)) ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-veda-900">Your wishlist</h1>
      {visible === null ? (
        <p className="mt-4 text-foreground/60">Loading&hellip;</p>
      ) : visible.length === 0 ? (
        <p className="mt-4 text-foreground/60">
          Nothing saved yet.{" "}
          <Link href="/spas" className="text-veda-600 underline">
            Browse spas
          </Link>{" "}
          and tap the heart to save them.
        </p>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((spa) => (
            <SpaCard key={spa.id} spa={spa} />
          ))}
        </div>
      )}
    </div>
  );
}
