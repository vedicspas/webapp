"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/useApi";
import { PaginationBar } from "@/components/PaginationBar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "@/stores/toastStore";
import { shortDate, timeOfDay } from "@/lib/format";

interface EmailListItem {
  id: number;
  sentAt: string;
  emailType: string;
  typeLabel: string;
  toEmail: string;
  fromEmail: string;
  subject: string;
  status: "sent" | "skipped" | "failed";
  error: string | null;
}

interface EmailDetail extends EmailListItem {
  htmlBody: string;
  textBody: string;
}

interface Paged {
  items: EmailListItem[];
  page: number;
  pageSize: number;
  total: number;
}

const input = "mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm";
const label = "block text-sm font-medium";

const STATUS_BADGE: Record<EmailListItem["status"], string> = {
  sent: "bg-veda-100 text-veda-800",
  skipped: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-700",
};

export default function AdminEmailsPage() {
  const { data: session, status: authStatus } = useSession();
  const { call, token } = useApi();
  const isAdmin = session?.appUser?.role === "admin";

  const [toEmail, setToEmail] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [applied, setApplied] = useState({ toEmail: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<Paged | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<EmailDetail | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const qs = useMemo(() => {
    const q = new URLSearchParams();
    if (applied.toEmail.trim()) q.set("toEmail", applied.toEmail.trim());
    if (applied.from) q.set("from", applied.from);
    if (applied.to) q.set("to", applied.to);
    q.set("page", String(page));
    q.set("pageSize", String(pageSize));
    return q.toString();
  }, [applied, page, pageSize]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await call<Paged>(`/admin/emails?${qs}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load emails");
    }
  }, [call, qs]);

  useEffect(() => {
    if (token && isAdmin) load();
  }, [token, isAdmin, load]);

  useEffect(() => {
    if (!preview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPreview(null);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [preview]);

  async function viewEmail(id: number) {
    setPreviewBusy(true);
    try {
      setPreview(await call<EmailDetail>(`/admin/emails/${id}`));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not load email", "error");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function confirmDelete() {
    if (deleteId == null) return;
    setDeleteBusy(true);
    try {
      await call(`/admin/emails/${deleteId}`, { method: "DELETE" });
      if (preview?.id === deleteId) setPreview(null);
      setDeleteId(null);
      toast("Email deleted.");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete email", "error");
    } finally {
      setDeleteBusy(false);
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <p className="text-sm">
        <Link href="/admin" className="text-veda-700 underline hover:text-veda-900">
          Admin dashboard
        </Link>
      </p>
      <h1 className="mt-3 text-2xl font-bold text-veda-900">Emails</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Outbound mail log. SMTP is optional — skipped rows still store the HTML so you can preview
        what would have been sent.
      </p>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <form
        className="mt-6 space-y-3 rounded-2xl border border-veda-100 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setApplied({ toEmail, from: fromDate, to: toDate });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={label}>
            To email
            <input
              type="text"
              className={input}
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="name@example.com"
              autoComplete="off"
            />
          </label>
          <label className={label}>
            From date
            <input type="date" className={input} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label className={label}>
            To date
            <input type="date" className={input} value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="submit" className="rounded-full bg-blue-600 px-5 py-1.5 text-sm font-medium text-white hover:bg-blue-500">
            Search
          </button>
          <button
            type="button"
            className="rounded-full border border-veda-300 bg-white px-5 py-1.5 text-sm hover:bg-veda-50"
            onClick={() => {
              setToEmail("");
              setFromDate("");
              setToDate("");
              setApplied({ toEmail: "", from: "", to: "" });
              setPage(1);
            }}
          >
            Cancel
          </button>
        </div>
      </form>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-veda-100 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-veda-100 bg-veda-50 text-xs uppercase tracking-wide text-foreground/60">
            <tr>
              <th className="px-4 py-3 font-medium">Sent</th>
              <th className="px-4 py-3 font-medium">To</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Subject</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"> </th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => (
              <tr key={row.id} className="border-b border-veda-50 last:border-0">
                <td className="whitespace-nowrap px-4 py-3 align-top text-foreground/70">
                  {shortDate(row.sentAt)}
                  <span className="block text-xs">{timeOfDay(row.sentAt)}</span>
                </td>
                <td className="px-4 py-3 align-top break-all">{row.toEmail}</td>
                <td className="whitespace-nowrap px-4 py-3 align-top">{row.typeLabel}</td>
                <td className="max-w-sm px-4 py-3 align-top">{row.subject}</td>
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}>
                    {row.status}
                  </span>
                  {row.error ? <p className="mt-1 max-w-[12rem] text-xs text-foreground/50">{row.error}</p> : null}
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={previewBusy}
                      onClick={() => viewEmail(row.id)}
                      className="rounded-full bg-veda-700 px-3 py-1 text-xs text-white hover:bg-veda-600 disabled:opacity-50"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(row.id)}
                      className="rounded-full border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(data?.items ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-foreground/50">
                  No emails logged yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <PaginationBar
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? pageSize}
        total={data?.total ?? 0}
        onPage={setPage}
        onPageSize={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />

      {preview ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-veda-950/55 backdrop-blur-sm"
            onClick={() => setPreview(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-preview-title"
            className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-[0_24px_80px_rgba(16,31,23,0.35)]"
          >
            <div className="h-1.5 bg-gradient-to-r from-turmeric-400 via-veda-500 to-veda-800" />
            <div className="flex items-start justify-between gap-3 border-b border-veda-100 px-5 py-4">
              <div className="min-w-0">
                <p id="email-preview-title" className="truncate text-lg font-semibold text-veda-900">
                  {preview.subject}
                </p>
                <p className="mt-1 text-sm text-foreground/60">
                  To {preview.toEmail} · {preview.typeLabel} · {preview.status}
                  {preview.error ? ` (${preview.error})` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-full border border-veda-200 px-3 py-1 text-sm hover:bg-veda-50"
              >
                Close
              </button>
            </div>
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={preview.htmlBody.replace(
                "<html>",
                `<html><head><style>html,body{overflow-x:hidden;max-width:100%} p,a,td{overflow-wrap:anywhere;word-break:break-all;word-wrap:break-word}</style></head>`
              )}
              className="min-h-[60vh] w-full flex-1 bg-white"
            />
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteId != null}
        title="Delete this email?"
        message="This removes the log row only. It does not unsend mail that already went out."
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
