"use client";

import Link from "next/link";
import type { VendorStatus } from "@vedic/shared";
import type { FeaturedClinicTarget } from "@/components/admin/FeaturedClinicModal";
import { RatingStars } from "@/components/RatingStars";
import { shortDate } from "@/lib/format";

export const VENDOR_STATUS_BADGE: Record<VendorStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-veda-100 text-veda-800",
  suspended: "bg-red-100 text-red-700",
};

export interface AdminSpa {
  id: number;
  slug: string;
  name: string;
  clinicCode: string;
  cityName: string;
  postalCode: string;
  isPublished: boolean;
  origin: "vendor" | "admin" | "imported";
  phone: string | null;
  email: string | null;
  website: string | null;
  vendorName: string | null;
  vendorStatus: VendorStatus | null;
  isUnclaimed: boolean;
  pendingClaims: number;
  inquiryCount: number;
  featuredOrder: number | null;
  createdAt: string;
  publishedAt: string | null;
  ratingAvg: number;
  ratingCount: number;
}

export const LISTING_ORIGIN_LABEL: Record<AdminSpa["origin"], string> = {
  admin: "Added by admin",
  vendor: "Added by vendor",
  imported: "Imported",
};

const ORIGIN_BADGE: Record<AdminSpa["origin"], string> = {
  admin: "bg-veda-100 text-veda-800",
  vendor: "bg-slate-100 text-slate-700",
  imported: "bg-indigo-100 text-indigo-800",
};

function websiteHref(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function AdminClinicRow({
  spa,
  onInquiries,
  onFeatured,
  onPublish,
}: {
  spa: AdminSpa;
  onInquiries: (spa: AdminSpa) => void;
  onFeatured: (spa: FeaturedClinicTarget) => void;
  onPublish: (id: number, isPublished: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-veda-100 bg-white p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/spas/${spa.slug}`} className="font-medium text-veda-900 hover:underline">
            {spa.name}
          </Link>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ORIGIN_BADGE[spa.origin]}`}>
            {LISTING_ORIGIN_LABEL[spa.origin]}
          </span>
          {spa.website ? (
            <a
              href={websiteHref(spa.website)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open website for ${spa.name}`}
              title={spa.website}
              className="grid h-7 w-7 place-items-center rounded-full text-veda-700 hover:bg-veda-50"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
                <path
                  fill="currentColor"
                  d="M11 3h6v6h-2V6.41l-6.3 6.3-1.41-1.42L13.59 5H11V3zM4 5h5v2H6v9h9v-3h2v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"
                />
              </svg>
            </a>
          ) : null}
        </div>
        <p className="text-sm text-foreground/60">
          Clinic ID {spa.clinicCode} &middot; {spa.cityName}
          {spa.postalCode ? ` · ${spa.postalCode}` : ""}
          {spa.isUnclaimed ? (
            <>
              {" "}
              &middot;{" "}
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Unclaimed
              </span>
            </>
          ) : (
            <>
              {" "}
              &middot; {spa.vendorName}{" "}
              {spa.vendorStatus ? (
                <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${VENDOR_STATUS_BADGE[spa.vendorStatus]}`}>
                  {spa.vendorStatus}
                </span>
              ) : null}
            </>
          )}
          {spa.pendingClaims > 0 ? (
            <>
              {" "}
              &middot;{" "}
              <Link href={`/admin/claims?spaId=${spa.id}`} className="text-veda-700 underline">
                {spa.pendingClaims} claim{spa.pendingClaims === 1 ? "" : "s"}
              </Link>
            </>
          ) : null}
          {" "}
          &middot;{" "}
          <button type="button" className="text-veda-700 underline" onClick={() => onInquiries(spa)}>
            Inquiries ({spa.inquiryCount})
          </button>
          {spa.featuredOrder != null ? (
            <>
              {" "}
              &middot;{" "}
              <span className="rounded-full bg-turmeric-100 px-2 py-0.5 text-xs font-medium text-turmeric-800">
                Featured #{spa.featuredOrder}
              </span>
            </>
          ) : null}
        </p>
        {spa.email || spa.phone ? (
          <p className="mt-1 text-sm text-foreground/65">
            {spa.email ? (
              <a href={`mailto:${spa.email}`} className="hover:underline">
                {spa.email}
              </a>
            ) : null}
            {spa.email && spa.phone ? " · " : null}
            {spa.phone ? (
              <a href={`tel:${spa.phone.replace(/\s+/g, "")}`} className="hover:underline">
                {spa.phone}
              </a>
            ) : null}
          </p>
        ) : null}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-foreground/65">
          <span>Created {shortDate(spa.createdAt)}</span>
          <span aria-hidden>·</span>
          <span>{spa.publishedAt ? `Published ${shortDate(spa.publishedAt)}` : "Not published"}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            Rating
            <RatingStars rating={spa.ratingAvg} count={spa.ratingCount || undefined} />
          </span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {spa.featuredOrder != null ? (
          <button
            type="button"
            onClick={() =>
              onFeatured({
                id: spa.id,
                name: spa.name,
                isPublished: spa.isPublished,
                featuredOrder: spa.featuredOrder,
              })
            }
            className="rounded-full border border-veda-300 px-4 py-1.5 text-sm text-veda-800 hover:bg-veda-50"
          >
            Manage featured
          </button>
        ) : spa.isPublished ? (
          <button
            type="button"
            onClick={() =>
              onFeatured({
                id: spa.id,
                name: spa.name,
                isPublished: spa.isPublished,
                featuredOrder: null,
              })
            }
            className="rounded-full border border-veda-300 px-4 py-1.5 text-sm text-veda-800 hover:bg-veda-50"
          >
            Make featured
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onPublish(spa.id, !spa.isPublished)}
          className={`rounded-full px-4 py-1.5 text-sm ${
            spa.isPublished
              ? "border border-red-300 text-red-700 hover:bg-red-50"
              : "bg-veda-700 text-white hover:bg-veda-600"
          }`}
        >
          {spa.isPublished ? "Unpublish" : "Publish"}
        </button>
      </div>
    </div>
  );
}
