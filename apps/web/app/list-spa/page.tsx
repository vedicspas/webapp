"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PageBusy } from "@/components/PageBusy";
import { setVendorSignupIntent } from "@/lib/signupIntent";

/** Entry point for listing a spa: sign in / register as vendor, then the listing editor. */
export default function ListSpaPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      setVendorSignupIntent();
      router.replace("/auth/signin?intent=vendor&callbackUrl=/list-spa");
      return;
    }
    const role = session?.appUser?.role;
    if (role === "vendor" || role === "admin") {
      router.replace("/vendor/spas/new");
      return;
    }
    router.replace("/vendor/register?next=/vendor/spas/new");
  }, [router, session?.appUser?.role, status]);

  return <PageBusy label="Taking you to list your spa…" />;
}
