"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/useApi";
import { toast } from "@/stores/toastStore";

interface AccType {
  id: number;
  name: string;
  usageCount: number;
}

const input = "mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm";

export default function AdminAccommodationTypesPage() {
  const { data: session, status } = useSession();
  const { call, token, authStatus } = useApi();
  const isAdmin = session?.appUser?.role === "admin";
  const [items, setItems] = useState<AccType[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const refresh = useCallback(async () => {
    const rows = await call<AccType[]>("/admin/accommodation-types");
    setItems(rows);
    setLoaded(true);
  }, [call]);

  useEffect(() => {
    if (!token || !isAdmin) return;
    refresh().catch((err) => toast(err instanceof Error ? err.message : "Could not load types", "error"));
  }, [token, isAdmin, refresh]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (name.length < 2) {
      toast("Enter a type name of at least 2 characters.", "error");
      return;
    }
    setBusy(true);
    try {
      await call("/admin/accommodation-types", { method: "POST", body: { name } });
      setNewName("");
      toast("Type added.");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add type", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: number) {
    const name = editingName.trim();
    if (name.length < 2) {
      toast("Enter a type name of at least 2 characters.", "error");
      return;
    }
    setBusy(true);
    try {
      await call(`/admin/accommodation-types/${id}`, { method: "PATCH", body: { name } });
      setEditingId(null);
      toast("Type renamed.");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not rename type", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: AccType) {
    if (row.usageCount > 0) {
      toast(`“${row.name}” is used by ${row.usageCount} listing${row.usageCount === 1 ? "" : "s"}.`, "error");
      return;
    }
    if (!window.confirm(`Delete “${row.name}”? Vendors will no longer see it.`)) return;
    setBusy(true);
    try {
      await call(`/admin/accommodation-types/${row.id}`, { method: "DELETE" });
      toast("Type deleted.");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete type", "error");
    } finally {
      setBusy(false);
    }
  }

  if (authStatus === "unauthenticated" || (session && !isAdmin)) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-foreground/60">
        Admin access required.{" "}
        <Link href="/auth/signin" className="text-veda-600 underline">
          Sign in
        </Link>{" "}
        with an admin account.
      </div>
    );
  }

  if (status === "loading" || !loaded) {
    return <div className="mx-auto max-w-2xl px-4 py-16 text-foreground/60">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-sm">
        <Link href="/admin" className="text-veda-700 underline hover:text-veda-900">
          Admin dashboard
        </Link>
        {" · "}
        <Link href="/admin/settings" className="text-veda-700 underline hover:text-veda-900">
          Site settings
        </Link>
        {" · "}
        <Link href="/admin/medical-conditions" className="text-veda-700 underline hover:text-veda-900">
          Medical conditions
        </Link>
      </p>
      <h1 className="mt-3 text-2xl font-bold text-veda-900">Accommodation types</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Master list for vendor create/edit. Clinic-only “other” notes never appear here. You cannot
        delete a type while listings still use it.
      </p>

      <form onSubmit={add} className="mt-6 flex flex-wrap items-end gap-2 rounded-2xl border border-veda-100 bg-white p-4">
        <label className="min-w-[12rem] flex-1 text-sm font-medium">
          Add a type
          <input
            className={input}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={80}
            placeholder="e.g. Heritage haveli"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-veda-700 px-5 py-2 text-sm font-medium text-white hover:bg-veda-600 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Add"}
        </button>
      </form>

      <ul className="mt-5 divide-y divide-veda-100 overflow-hidden rounded-2xl border border-veda-100 bg-white">
        {items.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
            {editingId === row.id ? (
              <input
                className="min-w-[10rem] flex-1 rounded-lg border border-veda-200 px-3 py-1.5 text-sm"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                maxLength={80}
                autoFocus
              />
            ) : (
              <span className="min-w-0 flex-1 font-medium text-veda-900">{row.name}</span>
            )}
            <span className="text-xs text-foreground/50">
              {row.usageCount} listing{row.usageCount === 1 ? "" : "s"}
            </span>
            {editingId === row.id ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  className="text-sm text-veda-700 underline"
                  onClick={() => saveEdit(row.id)}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="text-sm text-foreground/60 underline"
                  onClick={() => setEditingId(null)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="text-sm text-veda-700 underline"
                  onClick={() => {
                    setEditingId(row.id);
                    setEditingName(row.name);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  disabled={busy || row.usageCount > 0}
                  className="text-sm text-red-700 underline disabled:text-foreground/30"
                  onClick={() => remove(row)}
                >
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
