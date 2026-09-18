"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Booking } from "@vedic/shared";
import { PageBusy } from "@/components/PageBusy";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

const primaryBtn =
  "block w-full rounded-full bg-turmeric-400 px-6 py-2.5 text-center font-semibold text-veda-900 hover:bg-turmeric-300";
const secondaryBtn =
  "block w-full rounded-full border border-veda-300 px-6 py-2.5 text-center font-medium text-veda-900 hover:bg-veda-50";

export default function WelcomePage() {
  const { data: session, status } = useSession();
  const [hasBookings, setHasBookings] = useState(false);
  const [bookingsReady, setBookingsReady] = useState(false);
  const [waitingForSession, setWaitingForSession] = useState(true);
  const role = session?.appUser?.role;
  const isVendor = role === "vendor" || role === "admin";

  useEffect(() => {
    const timer = window.setTimeout(() => setWaitingForSession(false), 2500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (status === "authenticated") setWaitingForSession(false);
  }, [status]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.apiToken || isVendor) {
      setBookingsReady(true);
      return;
    }
    let cancelled = false;
    fetch(`${API_URL}/bookings/mine`, {
      headers: { authorization: `Bearer ${session.apiToken}` },
    })
      .then((r) => r.json())
      .then((data: Booking[]) => {
        if (!cancelled) setHasBookings(Array.isArray(data) && data.length > 0);
      })
      .catch(() => {
        if (!cancelled) setHasBookings(false);
      })
      .finally(() => {
        if (!cancelled) setBookingsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.apiToken, status, isVendor]);

  if (status === "loading" || waitingForSession || (session?.apiToken && !bookingsReady)) {
    return <PageBusy label="Setting up your account…" />;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-veda-900 sm:text-3xl">Thank you for registering with us</h1>
      <p className="mt-2 text-sm text-foreground/60">What would you like to do next?</p>
      {isVendor ? (
        <div className="mt-8">
          <Link href="/list-spa" className={primaryBtn}>
            List your spa / clinic
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          <Link href="/spas" className={primaryBtn}>
            Book an appointment
          </Link>
          <Link href="/spas" className={secondaryBtn}>
            Find a spa / clinic
          </Link>
          {hasBookings ? (
            <Link href="/account/bookings" className={secondaryBtn}>
              My bookings
            </Link>
          ) : null}
          <Link href="/list-spa" className="mt-4 inline-block text-sm text-foreground/50 hover:text-veda-700 hover:underline">
            List your spa / clinic
          </Link>
        </div>
      )}
    </div>
  );
}
