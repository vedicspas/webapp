"use client";

import { useEffect } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import type { StaticMeta } from "@vedic/shared";
import { useMetaStore } from "@/stores/metaStore";
import { useWishlistStore } from "@/stores/wishlistStore";
import { ToastHost } from "@/components/ToastHost";

function MetaHydrator({ meta }: { meta: StaticMeta }) {
  const hydrate = useMetaStore((s) => s.hydrate);
  const hydrated = useMetaStore((s) => s.hydrated);
  useEffect(() => {
    if (!hydrated) hydrate(meta);
    if (meta.languages.length > 0 && meta.cities.length > 0) return;
    const url = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";
    fetch(`${url}/meta`)
      .then((r) => r.json())
      .then((live: StaticMeta) => {
        if (Array.isArray(live?.cities) && live.cities.length > 0) hydrate(live);
      })
      .catch(() => {});
  }, [hydrated, hydrate, meta]);
  return null;
}

function WishlistLoader() {
  const { data: session, status } = useSession();
  const load = useWishlistStore((s) => s.load);
  const clear = useWishlistStore((s) => s.clear);
  useEffect(() => {
    if (status === "loading") return;
    if (session?.apiToken) load(session.apiToken);
    else clear();
  }, [session?.apiToken, status, load, clear]);
  return null;
}

export function Providers({ meta, children }: { meta: StaticMeta; children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <MetaHydrator meta={meta} />
      <WishlistLoader />
      <ToastHost />
      {children}
    </SessionProvider>
  );
}
