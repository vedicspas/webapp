"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { signOutAndGo } from "@/lib/signOut";
import { UserAvatar } from "@/components/UserAvatar";
import { useListingNavStore } from "@/stores/listingNavStore";

const NAV = [
  { href: "/spas", label: "Find a spa" },
  { href: "/wishlist", label: "Wishlist" },
  { href: "/account/bookings", label: "My bookings" },
];

export function Header() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const listingNav = useListingNavStore((s) => s.active);
  const user = session?.appUser;
  const sessionReady = status !== "loading";

  useEffect(() => {
    if (listingNav) setOpen(false);
  }, [listingNav]);

  return (
    <header
      className={`sticky top-0 z-40 bg-veda-800 text-white shadow-md ${
        listingNav ? "invisible pointer-events-none" : ""
      }`}
      aria-hidden={listingNav}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center" aria-label="AyurvedaAdvisor home">
          <img src="/logo-ayurvedaadvisor.svg" alt="AyurvedaAdvisor" className="h-8 w-auto sm:h-12" />
        </Link>

        <nav className="hidden items-center gap-5 text-sm md:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-turmeric-200">
              {item.label}
            </Link>
          ))}
          <Link href="/list-spa" className="hover:text-turmeric-200">
            List a spa
          </Link>
          {user?.role === "vendor" || user?.role === "admin" ? (
            <Link href="/vendor" className="hover:text-turmeric-200">
              Vendor dashboard
            </Link>
          ) : null}
          {user?.role === "admin" ? (
            <Link href="/admin" className="hover:text-turmeric-200">
              Admin
            </Link>
          ) : null}
          {!sessionReady ? (
            <span className="inline-block h-8 w-24 animate-pulse rounded-full bg-white/20" />
          ) : user ? (
            <span className="flex items-center gap-3">
              <Link href={`/profile/${user.username}`} className="flex items-center gap-2 hover:text-turmeric-200">
                <UserAvatar
                  name={user.name}
                  src={user.avatarUrl}
                  size={28}
                  className="bg-white/15 text-white"
                />
                {user.name.split(" ")[0]}
              </Link>
              <button
                onClick={() => void signOutAndGo("/")}
                className="rounded-full border border-white/30 px-3 py-1 text-xs hover:bg-white/10"
              >
                Sign out
              </button>
            </span>
          ) : (
            <Link
              href="/auth/signin"
              className="rounded-full bg-turmeric-400 px-4 py-1.5 font-medium text-veda-900 hover:bg-turmeric-300"
            >
              Sign in
            </Link>
          )}
        </nav>

        <button
          className="md:hidden"
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {open ? (
        <nav className="flex flex-col gap-1 border-t border-white/10 px-4 pb-4 pt-2 text-sm md:hidden">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded px-2 py-2 hover:bg-white/10" onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
          <Link href="/list-spa" className="rounded px-2 py-2 hover:bg-white/10" onClick={() => setOpen(false)}>
            List a spa
          </Link>
          {user?.role === "vendor" || user?.role === "admin" ? (
            <Link href="/vendor" className="rounded px-2 py-2 hover:bg-white/10" onClick={() => setOpen(false)}>
              Vendor dashboard
            </Link>
          ) : null}
          {user?.role === "admin" ? (
            <Link href="/admin" className="rounded px-2 py-2 hover:bg-white/10" onClick={() => setOpen(false)}>
              Admin
            </Link>
          ) : null}
          {!sessionReady ? (
            <span className="rounded px-2 py-2 text-white/60">Loading…</span>
          ) : user ? (
            <>
              <Link href={`/profile/${user.username}`} className="rounded px-2 py-2 hover:bg-white/10" onClick={() => setOpen(false)}>
                My profile
              </Link>
              <button onClick={() => void signOutAndGo("/")} className="rounded px-2 py-2 text-left hover:bg-white/10">
                Sign out
              </button>
            </>
          ) : (
            <Link href="/auth/signin" className="rounded px-2 py-2 hover:bg-white/10" onClick={() => setOpen(false)}>
              Sign in
            </Link>
          )}
        </nav>
      ) : null}
    </header>
  );
}
