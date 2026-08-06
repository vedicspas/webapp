"use client";

import { useEffect } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import type { StaticMeta } from "@vedic/shared";
import { useMetaStore } from "@/stores/metaStore";
import { useWishlistStore } from "@/stores/wishlistStore";

function MetaHydrator({ meta }: { meta: StaticMeta }) {
  const hydrate = useMetaStore((s) => s.hydrate);
  const hydrated = useMetaStore((s) => s.hydrated);
  useEffect(() => {
    if (!hydrated) hydrate(meta);
  }, [hydrated, hydrate, meta]);
  return null;
}

function WishlistLoader() {
  const { data: session } = useSession();
  const load = useWishlistStore((s) => s.load);
  const clear = useWishlistStore((s) => s.clear);
  useEffect(() => {
    if (session?.apiToken) load(session.apiToken);
    else clear();
  }, [session?.apiToken, load, clear]);
  return null;
}

export function Providers({ meta, children }: { meta: StaticMeta; children: React.ReactNode }) {
  return (
    <SessionProvider>
      <MetaHydrator meta={meta} />
      <WishlistLoader />
      {children}
    </SessionProvider>
  );
}
