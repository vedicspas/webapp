"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/useApi";
import { PaginationBar } from "@/components/PaginationBar";
import { shortDate, timeOfDay } from "@/lib/format";

interface ViewRow {
  id: number;
  spaId: number;
  spaName: string;
  clinicCode: string;
  userId: number;
  userName: string;
  userEmail: string;
  createdAt: string;
}

interface Paged {
  items: ViewRow[];
  page: number;
  pageSize: number;
  total: number;
}

export default function AdminConsultationViewsPage() {
  const { data: session, status: authStatus } = useSession();
  const { call, token } = useApi();
  const isAdmin = session?.appUser?.role === "admin";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<Paged | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(
        await call<Paged>(`/admin/consultation-views?page=${page}&pageSize=${pageSize}`)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load consultation views");
    }
  }, [call, page, pageSize]);

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
      <h1 className="mt-3 text-2xl font-bold text-veda-900">Online consultation contact views</h1>
      <p className="mt-1 text-sm text-foreground/60">
        Identifiable viewing history is restricted to AyurvedaAdvisor administrators. Clinics see only
        unique-viewer and total-view counts.
      </p>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-veda-100 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-veda-50 text-veda-800">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Clinic</th>
              <th className="px-4 py-2 font-medium">Viewer</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => (
              <tr key={row.id} className="border-t border-veda-100">
                <td className="px-4 py-2 whitespace-nowrap text-foreground/70">
                  {shortDate(row.createdAt)} {timeOfDay(row.createdAt)}
                </td>
                <td className="px-4 py-2">
                  {row.spaName}{" "}
                  <span className="text-foreground/50">({row.clinicCode})</span>
                </td>
                <td className="px-4 py-2">
                  {row.userName}{" "}
                  <span className="text-foreground/50">{row.userEmail}</span>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-foreground/60" colSpan={3}>
                  No consultation contact views yet.
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
    </div>
  );
}
