"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/useApi";
import { toast } from "@/stores/toastStore";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface AdminCondition {
  id: number;
  name: string;
  isDeleted: boolean;
  usageCount: number;
}

interface AdminCategory {
  id: number;
  name: string;
  sortOrder: number;
  isDeleted: boolean;
  isOther: boolean;
  usageCount: number;
  conditions: AdminCondition[];
}

type Pending =
  | { kind: "delete-cat"; id: number; name: string }
  | { kind: "restore-cat"; id: number; name: string }
  | { kind: "rename-cat"; id: number; from: string; to: string }
  | { kind: "delete-cond"; id: number; name: string }
  | { kind: "restore-cond"; id: number; name: string }
  | { kind: "rename-cond"; id: number; from: string; to: string };

const input = "mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm";

export default function AdminMedicalConditionsPage() {
  const { data: session, status } = useSession();
  const { call, token, authStatus } = useApi();
  const isAdmin = session?.appUser?.role === "admin";
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newCondition, setNewCondition] = useState<Record<number, string>>({});
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [editingCondId, setEditingCondId] = useState<number | null>(null);
  const [editingCondName, setEditingCondName] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);

  const refresh = useCallback(async () => {
    const rows = await call<AdminCategory[]>("/admin/medical-conditions");
    setCategories(rows);
    setLoaded(true);
  }, [call]);

  useEffect(() => {
    if (!token || !isAdmin) return;
    refresh().catch((err) => toast(err instanceof Error ? err.message : "Could not load conditions", "error"));
  }, [token, isAdmin, refresh]);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = newCategory.trim();
    if (name.length < 2) {
      toast("Enter a category name of at least 2 characters.", "error");
      return;
    }
    setBusy(true);
    try {
      await call("/admin/medical-condition-categories", { method: "POST", body: { name } });
      setNewCategory("");
      toast("Category added.");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add category", "error");
    } finally {
      setBusy(false);
    }
  }

  async function addCondition(e: React.FormEvent, categoryId: number) {
    e.preventDefault();
    const name = (newCondition[categoryId] ?? "").trim();
    if (name.length < 2) {
      toast("Enter a condition name of at least 2 characters.", "error");
      return;
    }
    setBusy(true);
    try {
      await call("/admin/medical-conditions", { method: "POST", body: { categoryId, name } });
      setNewCondition((m) => ({ ...m, [categoryId]: "" }));
      toast("Condition added.");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add condition", "error");
    } finally {
      setBusy(false);
    }
  }

  function confirmMessage(item: Pending): { title: string; message: string; confirmLabel: string } {
    if (item.kind === "delete-cat") {
      return {
        title: `Retire “${item.name}”?`,
        message:
          "This category and its names will leave the vendor picker. Clinics that already tagged them keep those tags. You can restore later.",
        confirmLabel: "Retire category",
      };
    }
    if (item.kind === "restore-cat") {
      return {
        title: `Restore “${item.name}”?`,
        message: "This category will show in the vendor picker again, along with names that are not retired.",
        confirmLabel: "Restore category",
      };
    }
    if (item.kind === "rename-cat") {
      return {
        title: "Save this category name?",
        message: `Rename “${item.from}” to “${item.to}”.`,
        confirmLabel: "Save name",
      };
    }
    if (item.kind === "delete-cond") {
      return {
        title: `Retire “${item.name}”?`,
        message:
          "Vendors will not be able to pick this name again. Clinics that already tagged it keep it on those treatments. You can restore later.",
        confirmLabel: "Retire name",
      };
    }
    if (item.kind === "restore-cond") {
      return {
        title: `Restore “${item.name}”?`,
        message: "This name will show in the vendor picker again.",
        confirmLabel: "Restore name",
      };
    }
    return {
      title: "Save this condition name?",
      message: `Rename “${item.from}” to “${item.to}”.`,
      confirmLabel: "Save name",
    };
  }

  async function runPending() {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === "delete-cat") {
        await call(`/admin/medical-condition-categories/${pending.id}`, { method: "DELETE" });
        toast("Category retired.");
      } else if (pending.kind === "restore-cat") {
        await call(`/admin/medical-condition-categories/${pending.id}/restore`, { method: "POST" });
        toast("Category restored.");
      } else if (pending.kind === "rename-cat") {
        await call(`/admin/medical-condition-categories/${pending.id}`, {
          method: "PATCH",
          body: { name: pending.to },
        });
        setEditingCatId(null);
        toast("Category renamed.");
      } else if (pending.kind === "delete-cond") {
        await call(`/admin/medical-conditions/${pending.id}`, { method: "DELETE" });
        toast("Condition retired.");
      } else if (pending.kind === "restore-cond") {
        await call(`/admin/medical-conditions/${pending.id}/restore`, { method: "POST" });
        toast("Condition restored.");
      } else {
        await call(`/admin/medical-conditions/${pending.id}`, { method: "PATCH", body: { name: pending.to } });
        setEditingCondId(null);
        toast("Condition renamed.");
      }
      setPending(null);
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update", "error");
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
    return <div className="mx-auto max-w-3xl px-4 py-16 text-foreground/60">Loading…</div>;
  }

  const dialog = pending ? confirmMessage(pending) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-sm">
        <Link href="/admin" className="text-veda-700 underline hover:text-veda-900">
          Admin dashboard
        </Link>
        {" · "}
        <Link href="/admin/accommodation-types" className="text-veda-700 underline hover:text-veda-900">
          Accommodation types
        </Link>
      </p>
      <h1 className="mt-3 text-2xl font-bold text-veda-900">Medical conditions</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Master list for “useful for” on treatments. Retire a name to hide it from new picks; existing
        clinic tags stay. Other is for clinic-typed names and cannot be retired.
      </p>

      <form
        onSubmit={addCategory}
        className="mt-6 flex flex-wrap items-end gap-2 rounded-2xl border border-veda-100 bg-white p-4"
      >
        <label className="min-w-[12rem] flex-1 text-sm font-medium">
          Add a category
          <input
            className={input}
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            maxLength={80}
            placeholder="e.g. Immune health"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-veda-700 px-5 py-2 text-sm font-medium text-white hover:bg-veda-600 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Add category"}
        </button>
      </form>

      <div className="mt-5 space-y-4">
        {categories.map((cat) => (
          <section
            key={cat.id}
            className={`rounded-2xl border bg-white p-4 ${
              cat.isDeleted ? "border-veda-100 opacity-70" : "border-veda-100"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              {editingCatId === cat.id ? (
                <input
                  className="min-w-[10rem] flex-1 rounded-lg border border-veda-200 px-3 py-1.5 text-sm"
                  value={editingCatName}
                  onChange={(e) => setEditingCatName(e.target.value)}
                  maxLength={80}
                  autoFocus
                />
              ) : (
                <h2 className="min-w-0 flex-1 text-base font-semibold text-veda-900">
                  {cat.name}
                  {cat.isDeleted ? (
                    <span className="ml-2 text-xs font-normal text-foreground/50">Retired</span>
                  ) : null}
                </h2>
              )}
              <span className="text-xs text-foreground/50">
                {cat.usageCount} treatment{cat.usageCount === 1 ? "" : "s"}
              </span>
              {cat.isOther ? (
                <span className="text-xs text-foreground/45">Protected</span>
              ) : editingCatId === cat.id ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    className="text-sm text-veda-700 underline"
                    onClick={() => {
                      const to = editingCatName.trim();
                      if (to.length < 2) {
                        toast("Enter a category name of at least 2 characters.", "error");
                        return;
                      }
                      if (to === cat.name) {
                        setEditingCatId(null);
                        return;
                      }
                      setPending({ kind: "rename-cat", id: cat.id, from: cat.name, to });
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="text-sm text-foreground/60 underline"
                    onClick={() => setEditingCatId(null)}
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
                      setEditingCatId(cat.id);
                      setEditingCatName(cat.name);
                      setEditingCondId(null);
                    }}
                  >
                    Rename
                  </button>
                  {cat.isDeleted ? (
                    <button
                      type="button"
                      className="text-sm text-veda-700 underline"
                      onClick={() => setPending({ kind: "restore-cat", id: cat.id, name: cat.name })}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="text-sm text-red-700 underline"
                      onClick={() => setPending({ kind: "delete-cat", id: cat.id, name: cat.name })}
                    >
                      Retire
                    </button>
                  )}
                </>
              )}
            </div>

            <ul className="mt-3 divide-y divide-veda-50">
              {cat.conditions.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2 py-2">
                  {editingCondId === row.id ? (
                    <input
                      className="min-w-[10rem] flex-1 rounded-lg border border-veda-200 px-3 py-1.5 text-sm"
                      value={editingCondName}
                      onChange={(e) => setEditingCondName(e.target.value)}
                      maxLength={80}
                      autoFocus
                    />
                  ) : (
                    <span className={`min-w-0 flex-1 text-sm ${row.isDeleted ? "text-foreground/45" : "text-veda-900"}`}>
                      {row.name}
                      {row.isDeleted ? <span className="ml-2 text-xs">Retired</span> : null}
                    </span>
                  )}
                  <span className="text-xs text-foreground/50">
                    {row.usageCount} treatment{row.usageCount === 1 ? "" : "s"}
                  </span>
                  {editingCondId === row.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        className="text-sm text-veda-700 underline"
                        onClick={() => {
                          const to = editingCondName.trim();
                          if (to.length < 2) {
                            toast("Enter a condition name of at least 2 characters.", "error");
                            return;
                          }
                          if (to === row.name) {
                            setEditingCondId(null);
                            return;
                          }
                          setPending({ kind: "rename-cond", id: row.id, from: row.name, to });
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="text-sm text-foreground/60 underline"
                        onClick={() => setEditingCondId(null)}
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
                          setEditingCondId(row.id);
                          setEditingCondName(row.name);
                          setEditingCatId(null);
                        }}
                      >
                        Rename
                      </button>
                      {row.isDeleted ? (
                        <button
                          type="button"
                          className="text-sm text-veda-700 underline"
                          onClick={() => setPending({ kind: "restore-cond", id: row.id, name: row.name })}
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-sm text-red-700 underline"
                          onClick={() => setPending({ kind: "delete-cond", id: row.id, name: row.name })}
                        >
                          Retire
                        </button>
                      )}
                    </>
                  )}
                </li>
              ))}
              {cat.conditions.length === 0 ? (
                <li className="py-2 text-sm text-foreground/50">No names in this category yet.</li>
              ) : null}
            </ul>

            {!cat.isDeleted ? (
              <form onSubmit={(e) => void addCondition(e, cat.id)} className="mt-3 flex flex-wrap items-end gap-2">
                <label className="min-w-[12rem] flex-1 text-sm">
                  Add a name
                  <input
                    className={input}
                    value={newCondition[cat.id] ?? ""}
                    onChange={(e) => setNewCondition((m) => ({ ...m, [cat.id]: e.target.value }))}
                    maxLength={80}
                    placeholder="e.g. Immunity support"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-full border border-veda-300 px-4 py-2 text-sm hover:bg-veda-50 disabled:opacity-60"
                >
                  Add
                </button>
              </form>
            ) : null}
          </section>
        ))}
      </div>

      <ConfirmDialog
        open={pending != null}
        title={dialog?.title}
        message={dialog?.message ?? ""}
        confirmLabel={dialog?.confirmLabel}
        busy={busy}
        onConfirm={() => void runPending()}
        onCancel={() => {
          if (!busy) setPending(null);
        }}
      />
    </div>
  );
}
