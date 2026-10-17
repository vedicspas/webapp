"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/useApi";
import { PaginationBar } from "@/components/PaginationBar";
import { InquiryTable, type AdminInquiry } from "@/components/admin/InquiryTable";

interface Paged {
  items: AdminInquiry[];
  page: number;
  pageSize: number;
  total: number;
}

function InquiriesInner() {
  const search = useSearchParams();
  const { data: session, status: authStatus } = useSession();
  const { call, token } = useApi();
  const isAdmin = session?.appUser?.role === "admin";
  const spaId = search.get("spaId") || "";
  const inquiryIdParam = search.get("inquiryId") || "";

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<Paged | null>(null);
  const [error, setError] = useState<string | null>(null);

  const qs = useMemo(() => {
    const q = new URLSearchParams();
    if (spaId) q.set("spaId", spaId);
    if (inquiryIdParam) q.set("inquiryId", inquiryIdParam);
    q.set("page", String(page));
    q.set("pageSize", String(pageSize));
    return q.toString();
  }, [spaId, inquiryIdParam, page, pageSize]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await call<Paged>(`/admin/inquiries?${qs}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load inquiries");
    }
  }, [call, qs]);

  useEffect(() => {
    if (!token || !isAdmin) return;
    void load();
  }, [token, isAdmin, load]);

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
      <h1 className="mt-3 text-2xl font-bold text-veda-900">Inquiries</h1>
      <p className="mt-1 text-sm text-foreground/60">
        Patient interest submitted on unclaimed clinic listings. These have not been sent to the clinic.
      </p>
      {spaId || inquiryIdParam ? (
        <p className="mt-2 text-sm">
          <Link href="/admin/inquiries" className="text-veda-700 underline hover:text-veda-900">
            View all inquiries
          </Link>
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-4">
        <InquiryTable
          items={data?.items ?? []}
          highlightId={inquiryIdParam ? Number(inquiryIdParam) : null}
        />
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
    </div>
  );
}

export default function AdminInquiriesPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-16 text-foreground/60">Loading…</div>}>
      <InquiriesInner />
    </Suspense>
  );
}
