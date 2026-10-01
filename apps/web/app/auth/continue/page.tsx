"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { PageBusy } from "@/components/PageBusy";

function ContinueInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session, status } = useSession();
  const next = params.get("next") || "/";

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/auth/signin");
      return;
    }
    if (session?.isNewAccount) {
      window.location.replace("/auth/welcome");
      return;
    }
    router.replace(next);
  }, [next, router, session?.isNewAccount, status]);

  return <PageBusy label="Signing you in…" />;
}

export default function ContinuePage() {
  return (
    <Suspense fallback={<PageBusy label="Loading…" />}>
      <ContinueInner />
    </Suspense>
  );
}
