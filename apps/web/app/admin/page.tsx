"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { VendorStatus } from "@vedic/shared";
import { useApi } from "@/lib/useApi";
import { money, shortDate } from "@/lib/format";
import { RatingStars } from "@/components/RatingStars";
import { toast } from "@/stores/toastStore";
import { PaginationBar } from "@/components/PaginationBar";
import { TreatmentCaption } from "@/components/TreatmentCaption";

interface Stats {
  users: number;
  vendorsPending: number;
  vendorsApproved: number;
  vendorsSuspended: number;
  spasPublished: number;
  spasTotal: number;
  bookings: number;
  grossBookingMinor: number;
  platformFeesMinor: number;
  reviews: number;
}

interface AdminVendor {
  id: number;
  businessName: string;
  status: VendorStatus;
  stripeOnboarded: number;
  createdAt: string;
  ownerName: string;
  ownerEmail: string;
  spaCount: number;
  publishedCount: number;
}

interface AdminSpa {
  id: number;
  slug: string;
  name: string;
  clinicCode: string;
  cityName: string;
  isPublished: boolean;
  vendorName: string;
  vendorStatus: VendorStatus;
}

interface AdminReview {
  id: number;
  rating: number;
  title: string;
  body: string;
  status: "published" | "hidden";
  createdAt: string;
  moderatedAt: string | null;
  moderationReason: string | null;
  authorName: string;
  authorEmail: string;
  spaName: string;
  spaSlug: string;
  clinicCode: string;
}

interface AdminBooking {
  id: number;
  code: string;
  startsAt: string;
  partySize: number;
  totalMinor: number;
  paidMinor: number;
  platformFeeMinor: number;
  statusCode: string;
  paymentModeCode: string;
  spaName: string;
  clinicCode: string;
  treatmentName: string;
  treatmentCategoryName: string;
  guestName: string;
}

interface CategoryOption {
  id: number;
  name: string;
}

interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  categories?: CategoryOption[];
}

type Tab = "vendors" | "spas" | "reviews" | "bookings";

const STATUS_BADGE: Record<VendorStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-veda-100 text-veda-800",
  suspended: "bg-red-100 text-red-700",
};

const input = "mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm";
const label = "block text-sm font-medium";

function CategoryChips({
  categories,
  selected,
  onChange,
}: {
  categories: CategoryOption[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">Treatment category</legend>
      <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
        {categories.map((t) => {
          const on = selected.includes(t.id);
          return (
            <label
              key={t.id}
              className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                on ? "border-veda-700 bg-veda-700 text-white" : "border-veda-200 hover:bg-veda-50"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                onChange={() => onChange(on ? selected.filter((id) => id !== t.id) : [...selected, t.id])}
              />
              {t.name}
            </label>
          );
        })}
        {categories.length === 0 ? <span className="text-sm text-foreground/50">No categories yet.</span> : null}
      </div>
    </fieldset>
  );
}

export default function AdminPage() {
  const { data: session, status: authStatus } = useSession();
  const { call, token } = useApi();
  const [tab, setTab] = useState<Tab>("vendors");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [vendorName, setVendorName] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");
  const [vendorFrom, setVendorFrom] = useState("");
  const [vendorTo, setVendorTo] = useState("");

  const [clinicName, setClinicName] = useState("");
  const [clinicId, setClinicId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [appliedClinic, setAppliedClinic] = useState({
    clinicName: "",
    clinicId: "",
    from: "",
    to: "",
    categoryIds: [] as number[],
  });
  const [appliedVendor, setAppliedVendor] = useState({ name: "", email: "", from: "", to: "" });
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  const [vendors, setVendors] = useState<Paged<AdminVendor> | null>(null);
  const [spas, setSpas] = useState<Paged<AdminSpa> | null>(null);
  const [reviews, setReviews] = useState<Paged<AdminReview> | null>(null);
  const [bookings, setBookings] = useState<Paged<AdminBooking> | null>(null);

  const isAdmin = session?.appUser?.role === "admin";

  const clinicQs = useMemo(() => {
    const q = new URLSearchParams();
    if (appliedClinic.clinicName.trim()) q.set("clinicName", appliedClinic.clinicName.trim());
    if (appliedClinic.clinicId.trim()) q.set("clinicId", appliedClinic.clinicId.trim());
    if (appliedClinic.from) q.set("from", appliedClinic.from);
    if (appliedClinic.to) q.set("to", appliedClinic.to);
    if (appliedClinic.categoryIds.length) q.set("categoryIds", appliedClinic.categoryIds.join(","));
    q.set("page", String(page));
    q.set("pageSize", String(pageSize));
    return q.toString();
  }, [appliedClinic, page, pageSize]);

  const vendorQs = useMemo(() => {
    const q = new URLSearchParams();
    if (appliedVendor.name.trim()) q.set("name", appliedVendor.name.trim());
    if (appliedVendor.email.trim()) q.set("email", appliedVendor.email.trim());
    if (appliedVendor.from) q.set("from", appliedVendor.from);
    if (appliedVendor.to) q.set("to", appliedVendor.to);
    q.set("page", String(page));
    q.set("pageSize", String(pageSize));
    return q.toString();
  }, [appliedVendor, page, pageSize]);

  const loadStats = useCallback(async () => {
    const s = await call<Stats>("/admin/stats");
    setStats(s);
  }, [call]);

  const loadTab = useCallback(async () => {
    try {
      if (tab === "vendors") {
        setVendors(await call<Paged<AdminVendor>>(`/admin/vendors?${vendorQs}`));
      } else if (tab === "spas") {
        const data = await call<Paged<AdminSpa>>(`/admin/spas?${clinicQs}`);
        setSpas(data);
        setCategories(data.categories ?? []);
      } else if (tab === "reviews") {
        const data = await call<Paged<AdminReview>>(`/admin/reviews?${clinicQs}`);
        setReviews(data);
        setCategories(data.categories ?? []);
      } else {
        const data = await call<Paged<AdminBooking>>(`/admin/bookings?${clinicQs}`);
        setBookings(data);
        setCategories(data.categories ?? []);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    }
  }, [call, tab, vendorQs, clinicQs]);

  useEffect(() => {
    if (token && isAdmin) loadStats().catch(() => {});
  }, [token, isAdmin, loadStats]);

  useEffect(() => {
    if (token && isAdmin) loadTab();
  }, [token, isAdmin, loadTab]);

  function switchTab(next: Tab) {
    setTab(next);
    setPage(1);
  }

  async function setVendorStatus(id: number, status: VendorStatus) {
    try {
      await call(`/admin/vendors/${id}/status`, { method: "PATCH", body: { status } });
      toast("Vendor status saved.");
      loadStats();
      loadTab();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed", "error");
    }
  }

  async function setSpaPublished(id: number, isPublished: boolean) {
    try {
      await call(`/admin/spas/${id}`, { method: "PATCH", body: { isPublished } });
      toast(isPublished ? "Listing published." : "Listing unpublished.");
      loadStats();
      loadTab();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed", "error");
    }
  }

  async function setReviewStatus(id: number, status: "published" | "hidden") {
    const reason =
      status === "hidden"
        ? window.prompt("Optional internal reason for hiding this review:") ?? undefined
        : undefined;
    if (status === "hidden" && reason === undefined) return;
    try {
      await call(`/admin/reviews/${id}`, {
        method: "PATCH",
        body: { status, reason: reason?.trim() || undefined },
      });
      toast(status === "hidden" ? "Review hidden." : "Review restored.");
      loadStats();
      loadTab();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update review", "error");
    }
  }

  async function deleteReview(id: number) {
    if (!confirm("Permanently delete this review? This cannot be undone.")) return;
    try {
      await call(`/admin/reviews/${id}`, { method: "DELETE" });
      toast("Review deleted.");
      loadStats();
      loadTab();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete review", "error");
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

  const clinicFilters = (
    <form
      className="mt-4 space-y-3 rounded-2xl border border-veda-100 bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setPage(1);
        setAppliedClinic({ clinicName, clinicId, from, to, categoryIds });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Name of the clinic
          <input className={input} value={clinicName} onChange={(e) => setClinicName(e.target.value)} />
        </label>
        <label className={label}>
          Clinic ID
          <input
            className={input}
            value={clinicId}
            onChange={(e) => setClinicId(e.target.value.toUpperCase())}
            placeholder="AA0842"
          />
        </label>
        <label className={label}>
          From date
          <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className={label}>
          To date
          <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <CategoryChips categories={categories} selected={categoryIds} onChange={setCategoryIds} />
      <div className="flex flex-wrap justify-center gap-3">
        <button type="submit" className="rounded-full bg-blue-600 px-5 py-1.5 text-sm font-medium text-white hover:bg-blue-500">
          Search
        </button>
        <button
          type="button"
          className="rounded-full border border-veda-300 bg-white px-5 py-1.5 text-sm hover:bg-veda-50"
          onClick={() => {
            setClinicName("");
            setClinicId("");
            setFrom("");
            setTo("");
            setCategoryIds([]);
            setAppliedClinic({ clinicName: "", clinicId: "", from: "", to: "", categoryIds: [] });
            setPage(1);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-veda-900">Admin dashboard</h1>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {stats ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Users", stats.users],
            ["Pending vendors", stats.vendorsPending],
            ["Published spas", `${stats.spasPublished}/${stats.spasTotal}`],
            ["Bookings", stats.bookings],
            ["Gross bookings", money(stats.grossBookingMinor)],
            ["Platform fees", money(stats.platformFeesMinor)],
          ].map(([labelText, value]) => (
            <div key={String(labelText)} className="rounded-2xl border border-veda-100 bg-white p-3 text-center">
              <p className="text-lg font-bold text-veda-900">{value}</p>
              <p className="text-xs text-foreground/60">{labelText}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {(
          [
            ["vendors", `Vendors${stats?.vendorsPending ? ` (${stats.vendorsPending} pending)` : ""}`],
            ["spas", "Listings"],
            ["reviews", "Reviews"],
            ["bookings", "Bookings"],
          ] as [Tab, string][]
        ).map(([key, tabLabel]) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={`rounded-full px-4 py-1.5 text-sm ${
              tab === key ? "bg-veda-700 text-white" : "border border-veda-300 text-veda-800 hover:bg-veda-50"
            }`}
          >
            {tabLabel}
          </button>
        ))}
      </div>

      {tab === "vendors" ? (
        <div className="mt-4">
          <form
            className="space-y-3 rounded-2xl border border-veda-100 bg-white p-4"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setAppliedVendor({ name: vendorName, email: vendorEmail, from: vendorFrom, to: vendorTo });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>
                Name
                <input className={input} value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
              </label>
              <label className={label}>
                Email
                <input className={input} value={vendorEmail} onChange={(e) => setVendorEmail(e.target.value)} />
              </label>
              <label className={label}>
                From date
                <input type="date" className={input} value={vendorFrom} onChange={(e) => setVendorFrom(e.target.value)} />
              </label>
              <label className={label}>
                To date
                <input type="date" className={input} value={vendorTo} onChange={(e) => setVendorTo(e.target.value)} />
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
                  setVendorName("");
                  setVendorEmail("");
                  setVendorFrom("");
                  setVendorTo("");
                  setAppliedVendor({ name: "", email: "", from: "", to: "" });
                  setPage(1);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
          <div className="mt-4 space-y-3">
            {(vendors?.items ?? []).map((v) => (
              <div key={v.id} className="rounded-2xl border border-veda-100 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-veda-900">{v.businessName}</p>
                    <p className="text-sm text-foreground/60">
                      {v.ownerName} ({v.ownerEmail}) &middot; applied {shortDate(v.createdAt)} &middot;{" "}
                      {v.spaCount} listing{v.spaCount === 1 ? "" : "s"} ({v.publishedCount} live)
                      {v.stripeOnboarded ? " · Stripe connected" : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[v.status]}`}>
                    {v.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {v.status !== "approved" ? (
                    <button
                      onClick={() => setVendorStatus(v.id, "approved")}
                      className="rounded-full bg-veda-700 px-4 py-1.5 text-white hover:bg-veda-600"
                    >
                      Approve
                    </button>
                  ) : null}
                  {v.status !== "suspended" ? (
                    <button
                      onClick={() => setVendorStatus(v.id, "suspended")}
                      className="rounded-full border border-red-300 px-4 py-1.5 text-red-700 hover:bg-red-50"
                    >
                      Suspend {v.publishedCount > 0 ? "(unpublishes listings)" : ""}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <PaginationBar
            page={vendors?.page ?? page}
            pageSize={vendors?.pageSize ?? pageSize}
            total={vendors?.total ?? 0}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        </div>
      ) : null}

      {tab === "spas" ? (
        <div className="mt-4">
          {clinicFilters}
          <div className="mt-4 space-y-3">
            {(spas?.items ?? []).map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-veda-100 bg-white p-4"
              >
                <div>
                  <Link href={`/spas/${s.slug}`} className="font-medium text-veda-900 hover:underline">
                    {s.name}
                  </Link>
                  <p className="text-sm text-foreground/60">
                    Clinic ID {s.clinicCode} &middot; {s.cityName} &middot; {s.vendorName}{" "}
                    <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[s.vendorStatus]}`}>
                      {s.vendorStatus}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => setSpaPublished(s.id, !s.isPublished)}
                  className={`rounded-full px-4 py-1.5 text-sm ${
                    s.isPublished
                      ? "border border-red-300 text-red-700 hover:bg-red-50"
                      : "bg-veda-700 text-white hover:bg-veda-600"
                  }`}
                >
                  {s.isPublished ? "Unpublish" : "Publish"}
                </button>
              </div>
            ))}
          </div>
          <PaginationBar
            page={spas?.page ?? page}
            pageSize={spas?.pageSize ?? pageSize}
            total={spas?.total ?? 0}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        </div>
      ) : null}

      {tab === "reviews" ? (
        <div className="mt-4">
          {clinicFilters}
          <div className="mt-4 space-y-3">
            {(reviews?.items ?? []).map((r) => (
              <div key={r.id} className="rounded-2xl border border-veda-100 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <RatingStars rating={r.rating} />
                  <span className="text-xs text-foreground/50">{shortDate(r.createdAt)}</span>
                </div>
                <p className="mt-1 font-medium text-veda-900">{r.title}</p>
                <p className="mt-1 text-sm text-foreground/80">{r.body}</p>
                <p className="mt-1 text-xs text-foreground/50">
                  {r.status === "hidden" ? (
                    <span className="mr-2 rounded-full bg-red-100 px-2 py-0.5 text-red-700">hidden</span>
                  ) : (
                    <span className="mr-2 rounded-full bg-veda-100 px-2 py-0.5 text-veda-800">published</span>
                  )}
                  by {r.authorName} ({r.authorEmail}) on{" "}
                  <Link href={`/spas/${r.spaSlug}`} className="text-veda-600 hover:underline">
                    {r.spaName}
                  </Link>{" "}
                  · Clinic ID {r.clinicCode}
                </p>
                {r.moderationReason ? (
                  <p className="mt-1 text-xs text-foreground/50">Internal reason: {r.moderationReason}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.status === "published" ? (
                    <button
                      onClick={() => setReviewStatus(r.id, "hidden")}
                      className="rounded-full border border-veda-300 px-4 py-1 text-xs hover:bg-veda-50"
                    >
                      Hide review
                    </button>
                  ) : (
                    <button
                      onClick={() => setReviewStatus(r.id, "published")}
                      className="rounded-full border border-veda-300 px-4 py-1 text-xs hover:bg-veda-50"
                    >
                      Restore review
                    </button>
                  )}
                  <button
                    onClick={() => deleteReview(r.id)}
                    className="rounded-full border border-red-300 px-4 py-1 text-xs text-red-700 hover:bg-red-50"
                  >
                    Delete permanently
                  </button>
                </div>
              </div>
            ))}
          </div>
          <PaginationBar
            page={reviews?.page ?? page}
            pageSize={reviews?.pageSize ?? pageSize}
            total={reviews?.total ?? 0}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        </div>
      ) : null}

      {tab === "bookings" ? (
        <div className="mt-4">
          {clinicFilters}
          <div className="mt-4 space-y-3">
            {(bookings?.items ?? []).map((b) => (
              <div key={b.id} className="rounded-2xl border border-veda-100 bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-veda-900">
                    <TreatmentCaption name={b.treatmentName} categoryName={b.treatmentCategoryName} />{" "}
                    <span className="text-foreground/50">at {b.spaName}</span>
                  </p>
                  <span className="rounded-full bg-veda-50 px-2.5 py-0.5 text-xs font-medium text-veda-800">
                    {b.statusCode.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-1 font-medium text-veda-800">Booking ref number: {b.code}</p>
                <p className="mt-1 text-foreground/70">
                  Clinic ID {b.clinicCode} &middot; {shortDate(b.startsAt)} &middot; {b.guestName} &middot; {b.partySize}{" "}
                  guest{b.partySize === 1 ? "" : "s"}
                </p>
                <p className="mt-1">
                  {money(b.totalMinor)} total &middot; {money(b.paidMinor)} paid online &middot;{" "}
                  <span className="text-veda-700">{money(b.platformFeeMinor)} platform fee</span>
                </p>
              </div>
            ))}
          </div>
          <PaginationBar
            page={bookings?.page ?? page}
            pageSize={bookings?.pageSize ?? pageSize}
            total={bookings?.total ?? 0}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
