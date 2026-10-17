"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/useApi";
import { PaginationBar } from "@/components/PaginationBar";
import { toast } from "@/stores/toastStore";
import { shortDate, timeOfDay } from "@/lib/format";

interface ClaimListItem {
  id: number;
  spaId: number;
  status: "draft" | "pending" | "approved" | "rejected";
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  relationship: string;
  spaName: string;
  slug: string;
  clinicCode: string;
  ownerEmail: string;
  ownerName: string;
  businessName: string;
  submittedAt: string | null;
  pendingClaimsForSpa?: number;
}

interface ClaimDetail extends ClaimListItem {
  claimantNotes: string | null;
  notes: { id: number; body: string; createdAt: string; adminName: string; adminEmail: string }[];
  otps: {
    id: number;
    email: string;
    code: string;
    expiresAt: string;
    consumedAt: string | null;
    createdAt: string;
  }[];
  hasDocument: boolean;
  documentName: string | null;
  rejectionNote: string | null;
}

interface Paged {
  items: ClaimListItem[];
  page: number;
  pageSize: number;
  total: number;
}

const STATUS_BADGE: Record<ClaimListItem["status"], string> = {
  draft: "bg-veda-50 text-foreground/70",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-veda-100 text-veda-800",
  rejected: "bg-red-100 text-red-700",
};

const input = "mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm";
const label = "block text-sm font-medium";

function ClaimsInner() {
  const search = useSearchParams();
  const { data: session, status: authStatus } = useSession();
  const { call, token } = useApi();
  const isAdmin = session?.appUser?.role === "admin";
  const spaId = search.get("spaId") || "";
  const claimIdParam = search.get("claimId") || "";

  const [status, setStatus] = useState("");
  const [appliedStatus, setAppliedStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<Paged | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [note, setNote] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);

  const qs = useMemo(() => {
    const q = new URLSearchParams();
    if (spaId) q.set("spaId", spaId);
    if (appliedStatus) q.set("status", appliedStatus);
    if (claimIdParam) q.set("claimId", claimIdParam);
    q.set("page", String(page));
    q.set("pageSize", String(pageSize));
    return q.toString();
  }, [spaId, appliedStatus, claimIdParam, page, pageSize]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await call<Paged>(`/admin/claims?${qs}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load claims");
    }
  }, [call, qs]);

  useEffect(() => {
    if (!token || !isAdmin) return;
    load();
  }, [token, isAdmin, load]);

  useEffect(() => {
    if (!token || !isAdmin || !claimIdParam) return;
    call<ClaimDetail>(`/admin/claims/${claimIdParam}`)
      .then(setDetail)
      .catch(() => {
        // List still loads if the id is invalid.
      });
  }, [token, isAdmin, claimIdParam, call]);

  async function openClaim(id: number) {
    try {
      setDetail(await call<ClaimDetail>(`/admin/claims/${id}`));
      setNote("");
      setRejectNote("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not load claim", "error");
    }
  }

  async function addNote() {
    if (!detail || !note.trim()) return;
    setBusy(true);
    try {
      await call(`/admin/claims/${detail.id}/notes`, { method: "POST", body: { body: note.trim() } });
      setNote("");
      await openClaim(detail.id);
      toast("Note saved.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save note", "error");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!detail) return;
    setBusy(true);
    try {
      await call(`/admin/claims/${detail.id}/approve`, { method: "POST" });
      toast("Claim approved.");
      setDetail(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not approve", "error");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!detail) return;
    if (rejectNote.trim().length < 3) {
      toast("Add a short review note for the claimant.", "error");
      return;
    }
    setBusy(true);
    try {
      await call(`/admin/claims/${detail.id}/reject`, { method: "POST", body: { note: rejectNote.trim() } });
      toast("Claim rejected.");
      setDetail(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not reject", "error");
    } finally {
      setBusy(false);
    }
  }

  async function downloadDocument() {
    if (!detail || !token) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";
    try {
      const res = await fetch(`${apiUrl}/admin/claims/${detail.id}/document`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = detail.documentName || "claim-document";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not download", "error");
    }
  }

  if (authStatus === "unauthenticated" || (session && !isAdmin)) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-foreground/60">
        Admin access required.{" "}
        <Link href="/auth/signin" className="text-veda-600 underline">
          Sign in
        </Link>
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
      <h1 className="mt-3 text-2xl font-bold text-veda-900">Clinic claims</h1>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <form
        className="mt-4 space-y-3 rounded-2xl border border-veda-100 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setAppliedStatus(status);
        }}
      >
        <label className={label}>
          Status
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <button type="submit" className="rounded-full bg-blue-600 px-5 py-1.5 text-sm font-medium text-white hover:bg-blue-500">
          Search
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-veda-100 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-veda-100 bg-veda-50 text-xs uppercase tracking-wide text-foreground/60">
            <tr>
              <th className="px-4 py-3 font-medium">Clinic</th>
              <th className="px-4 py-3 font-medium">Claimant</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"> </th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => (
              <tr key={row.id} className="border-b border-veda-50 last:border-0">
                <td className="px-4 py-3 align-top">
                  <Link href={`/spas/${row.slug}`} className="font-medium text-veda-900 hover:underline">
                    {row.spaName}
                  </Link>
                  <p className="text-xs text-foreground/60">{row.clinicCode}</p>
                </td>
                <td className="px-4 py-3 align-top">
                  {row.contactName}
                  <p className="text-xs text-foreground/60">
                    {row.relationship} · {row.contactEmail}
                  </p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top text-foreground/70">
                  {row.submittedAt ? (
                    <>
                      {shortDate(row.submittedAt)}
                      <span className="block text-xs">{timeOfDay(row.submittedAt)}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <button
                    type="button"
                    onClick={() => void openClaim(row.id)}
                    className="rounded-full bg-veda-700 px-3 py-1 text-xs text-white hover:bg-veda-600"
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
            {(data?.items ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-foreground/50">
                  No claims yet.
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

      {detail ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            aria-label="Dismiss"
            className="absolute inset-0 bg-veda-950/55"
            onClick={() => setDetail(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-veda-900">{detail.spaName}</h2>
            <p className="text-sm text-foreground/60">
              {detail.clinicCode} · {detail.relationship} ·{" "}
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[detail.status]}`}>
                {detail.status}
              </span>
            </p>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-foreground/50">Claimant</dt>
                <dd>{detail.contactName}</dd>
              </div>
              <div>
                <dt className="text-foreground/50">Email</dt>
                <dd className="break-all">{detail.contactEmail}</dd>
              </div>
              <div>
                <dt className="text-foreground/50">Phone</dt>
                <dd>{detail.contactPhone}</dd>
              </div>
              <div>
                <dt className="text-foreground/50">Account</dt>
                <dd>
                  {detail.ownerName} ({detail.ownerEmail})
                </dd>
              </div>
            </dl>
            {detail.claimantNotes ? (
              <p className="mt-3 text-sm">
                <span className="text-foreground/50">Claimant note: </span>
                <span className="whitespace-pre-wrap">{detail.claimantNotes}</span>
              </p>
            ) : null}
            {detail.hasDocument ? (
              <button type="button" onClick={() => void downloadDocument()} className="mt-3 text-sm text-veda-700 underline">
                Download {detail.documentName || "document"}
              </button>
            ) : (
              <p className="mt-3 text-sm text-foreground/50">No supporting document.</p>
            )}

            {detail.status === "pending" ? (
              <div className="mt-4 space-y-3">
                <textarea
                  className={input}
                  rows={2}
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Rejection note (required to reject)"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void approve()}
                    className="rounded-full bg-veda-700 px-4 py-1.5 text-sm text-white hover:bg-veda-600 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void reject()}
                    className="rounded-full border border-red-300 px-4 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
                {detail.pendingClaimsForSpa && detail.pendingClaimsForSpa > 1 ? (
                  <p className="text-xs text-amber-800">
                    {detail.pendingClaimsForSpa} pending claims for this clinic. Approving this one rejects the others.
                  </p>
                ) : null}
              </div>
            ) : null}

            {detail.rejectionNote ? (
              <p className="mt-3 text-sm text-red-700">Review note: {detail.rejectionNote}</p>
            ) : null}

            <div className="mt-5">
              <p className="text-sm font-medium">Admin notes</p>
              <div className="mt-2 flex gap-2">
                <input className={input + " mt-0"} value={note} onChange={(e) => setNote(e.target.value)} />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void addNote()}
                  className="rounded-full bg-veda-700 px-4 py-2 text-sm text-white hover:bg-veda-600 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {detail.notes.map((n) => (
                  <li key={n.id} className="rounded-lg bg-veda-50 px-3 py-2">
                    <p>{n.body}</p>
                    <p className="text-xs text-foreground/50">
                      {n.adminName} · {shortDate(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5">
              <p className="text-sm font-medium">Verification codes</p>
              <ul className="mt-2 space-y-1 text-xs text-foreground/70">
                {detail.otps.map((o) => (
                  <li key={o.id}>
                    {o.code} → {o.email} · {shortDate(o.createdAt)} {timeOfDay(o.createdAt)}
                    {o.consumedAt ? " · used" : ""}
                  </li>
                ))}
                {detail.otps.length === 0 ? <li>None yet.</li> : null}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminClaimsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-16 text-foreground/60">Loading…</div>}>
      <ClaimsInner />
    </Suspense>
  );
}
