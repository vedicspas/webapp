"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { UserAvatar } from "@/components/UserAvatar";
import { signOutAndGo } from "@/lib/signOut";

type MenuUser = {
  name: string;
  username: string;
  avatarUrl?: string | null;
  role: string;
};

export function UserMenu({ user }: { user: MenuUser }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef(0);
  const menuId = useId();
  const firstName = user.name.split(" ")[0];
  const isAdmin = user.role === "admin";

  function cancelClose() {
    window.clearTimeout(closeTimer.current);
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  }

  function openMenu() {
    cancelClose();
    setOpen(true);
  }

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      cancelClose();
    };
  }, []);

  const itemClass =
    "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-veda-800 hover:bg-veda-50";

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="flex items-center gap-2 hover:text-turmeric-200"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <UserAvatar
          name={user.name}
          src={user.avatarUrl}
          size={28}
          className="bg-white/15 text-white"
        />
        {firstName}
      </button>

      <div
        id={menuId}
        role="menu"
        aria-hidden={!open}
        className={`absolute right-0 top-full z-50 mt-2.5 w-56 origin-top-right rounded-xl border border-veda-100 bg-white py-1.5 text-veda-900 shadow-lg transition duration-[250ms] ease-out ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-2 scale-[0.98] opacity-0"
        }`}
      >
        <span
          className="pointer-events-none absolute -top-1.5 right-7 h-3 w-3 rotate-45 border-l border-t border-veda-100 bg-white"
          aria-hidden
        />
        {isAdmin ? (
          <Link
            role="menuitem"
            href="/admin"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            <ManageIcon />
            Manage
          </Link>
        ) : (
          <Link
            role="menuitem"
            href={`/profile/${user.username}`}
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            <ProfileIcon />
            Profile
          </Link>
        )}
        <Link
          role="menuitem"
          href="/account/password"
          className={itemClass}
          onClick={() => setOpen(false)}
        >
          <KeyIcon />
          Change Password
        </Link>
        <div className="my-1 border-t border-veda-100" />
        <button
          type="button"
          role="menuitem"
          className={itemClass}
          onClick={() => void signOutAndGo("/")}
        >
          <SignOutIcon />
          Sign Out
        </button>
      </div>
    </div>
  );
}

function ManageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-veda-600" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-veda-600" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19.5c.8-3.2 3.5-5 7-5s6.2 1.8 7 5" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-veda-600" aria-hidden>
      <circle cx="8" cy="15" r="3.5" />
      <path d="M11 13.5l8-8M16.5 5.5l2.5 2.5" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-veda-600" aria-hidden>
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H4" />
      <path d="M14 19h4a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4" />
    </svg>
  );
}
