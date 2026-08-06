"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useWishlistStore } from "@/stores/wishlistStore";

export function WishlistButton({ spaId, className = "" }: { spaId: number; className?: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const saved = useWishlistStore((s) => s.ids.has(spaId));
  const toggle = useWishlistStore((s) => s.toggle);

  return (
    <button
      aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
      className={`grid h-9 w-9 place-items-center rounded-full bg-white/90 text-lg shadow transition hover:scale-110 ${className}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!session?.apiToken) {
          router.push("/auth/signin");
          return;
        }
        toggle(spaId, session.apiToken);
      }}
    >
      <span className={saved ? "text-red-500" : "text-veda-800"}>{saved ? "\u2665" : "\u2661"}</span>
    </button>
  );
}
