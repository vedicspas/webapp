"use client";

import { useId, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Review, ReviewAspectId, ReviewListResponse, ReviewSummary } from "@vedic/shared";
import {
  DISTRIBUTION_LABELS,
  MAX_REVIEW_PHOTO_BYTES,
  MAX_REVIEW_PHOTOS,
  REVIEW_ASPECTS,
  REVIEW_BODY_MAX,
  REVIEW_BODY_MIN,
  REVIEW_TITLE_MAX,
  REVIEW_TITLE_MIN,
  emptyAspectScores,
} from "@vedic/shared";
import { shortDate } from "@/lib/format";
import { RatingControl, RatingDisplay, RatingStars } from "@/components/RatingStars";
import { toast } from "@/stores/toastStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

function monthLabel(yyyyMm: string | null): string | null {
  if (!yyyyMm) return null;
  const [y, m] = yyyyMm.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function Distribution({ summary }: { summary: ReviewSummary }) {
  const max = Math.max(1, ...Object.values(summary.distribution));
  return (
    <div className="space-y-1.5">
      {([5, 4, 3, 2, 1] as const).map((bucket) => {
        const n = summary.distribution[bucket];
        const pct = summary.ratingCount ? Math.round((100 * n) / summary.ratingCount) : 0;
        return (
          <div key={bucket} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2 text-sm">
            <span className="flex items-center gap-1 text-foreground/70">
              <RatingDisplay rating={bucket} showValue={false} />
              <span className="sr-only">{DISTRIBUTION_LABELS[bucket]}</span>
            </span>
            <div className="h-2 overflow-hidden rounded-full bg-veda-100">
              <div
                className="h-full rounded-full bg-turmeric-500"
                style={{ width: `${Math.round((100 * n) / max)}%` }}
              />
            </div>
            <span className="text-right tabular-nums text-foreground/60">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function ReviewForm({
  slug,
  token,
  onCreated,
  onCancel,
}: {
  slug: string;
  token: string;
  onCreated: (review: Review) => void;
  onCancel: () => void;
}) {
  const overallId = useId();
  const [rating, setRating] = useState<number | null>(null);
  const [aspects, setAspects] = useState(emptyAspectScores());
  const [na, setNa] = useState<Record<ReviewAspectId, boolean>>(
    () => Object.fromEntries(REVIEW_ASPECTS.map((a) => [a.id, false])) as Record<ReviewAspectId, boolean>
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [recommends, setRecommends] = useState<boolean | null>(null);
  const [visitedMonth, setVisitedMonth] = useState("");
  const [visitedYear, setVisitedYear] = useState("");
  const [genuine, setGenuine] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const yearNow = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: 16 }, (_, i) => yearNow - i), [yearNow]);

  function setAspect(id: ReviewAspectId, value: number | null) {
    setNa((prev) => ({ ...prev, [id]: false }));
    setAspects((prev) => ({ ...prev, [id]: value }));
  }

  function toggleNa(id: ReviewAspectId) {
    setNa((prev) => {
      const next = !prev[id];
      if (next) setAspects((a) => ({ ...a, [id]: null }));
      return { ...prev, [id]: next };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (rating == null) {
      setError("Please rate your overall experience.");
      return;
    }
    if (recommends == null) {
      setError("Please say whether you would recommend this clinic.");
      return;
    }
    if (!genuine) {
      setError("Please confirm this is a genuine personal experience.");
      return;
    }
    for (const file of photos) {
      if (file.size > MAX_REVIEW_PHOTO_BYTES) {
        setError("Each photo must be 5 MB or smaller.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const payload = {
        rating,
        title,
        body,
        recommends,
        confirmedGenuine: true,
        visitedMonth: visitedMonth ? Number(visitedMonth) : undefined,
        visitedYear: visitedYear ? Number(visitedYear) : undefined,
        aspects: Object.fromEntries(
          REVIEW_ASPECTS.map((a) => [a.id, na[a.id] ? null : aspects[a.id]])
        ),
      };
      const fd = new FormData();
      fd.append("payload", JSON.stringify(payload));
      for (const file of photos) fd.append("photos", file);
      const res = await fetch(`${API_URL}/spas/${slug}/reviews`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit review");
      toast("Review posted.");
      onCreated(data as Review);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not submit review";
      setError(message);
      toast(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-2xl border border-veda-200 bg-white p-4">
      <div>
        <p id={overallId} className="text-sm font-medium">
          Overall experience <span className="text-red-600">*</span>
        </p>
        <RatingControl value={rating} onChange={setRating} labelledBy={overallId} />
      </div>

      <label className="block text-sm font-medium">
        Review title <span className="text-red-600">*</span>
        <input
          required
          minLength={REVIEW_TITLE_MIN}
          maxLength={REVIEW_TITLE_MAX}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Sum up your stay"
          className="mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm font-normal"
        />
        <span className="text-xs text-foreground/50">
          {title.length}/{REVIEW_TITLE_MAX}
        </span>
      </label>

      <label className="block text-sm font-medium">
        Review description <span className="text-red-600">*</span>
        <textarea
          required
          minLength={REVIEW_BODY_MIN}
          maxLength={REVIEW_BODY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Tell other travelers about your experience"
          rows={5}
          className="mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm font-normal"
        />
        <span className="text-xs text-foreground/50">
          {body.length}/{REVIEW_BODY_MAX} (min {REVIEW_BODY_MIN})
        </span>
      </label>

      <fieldset>
        <legend className="text-sm font-medium">
          Would you recommend this clinic? <span className="text-red-600">*</span>
        </legend>
        <div className="mt-2 flex gap-3">
          {[true, false].map((v) => (
            <label key={String(v)} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="recommends"
                checked={recommends === v}
                onChange={() => setRecommends(v)}
              />
              {v ? "Yes" : "No"}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">
          Visit month
          <select
            value={visitedMonth}
            onChange={(e) => setVisitedMonth(e.target.value)}
            className="mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm font-normal"
          >
            <option value="">Optional</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i, 1).toLocaleString(undefined, { month: "long" })}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Visit year
          <select
            value={visitedYear}
            onChange={(e) => setVisitedYear(e.target.value)}
            className="mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm font-normal"
          >
            <option value="">Optional</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-4 border-t border-veda-100 pt-4">
        <p className="text-sm font-medium">Detailed ratings</p>
        <p className="text-xs text-foreground/60">
          Mark Not applicable if you did not experience that part of the stay. It is stored as blank,
          never as zero.
        </p>
        {REVIEW_ASPECTS.map((aspect) => {
          const labelId = `${overallId}-${aspect.id}`;
          return (
            <div key={aspect.id} className="rounded-xl bg-veda-50/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p id={labelId} className="text-sm font-medium">
                  {aspect.label}
                </p>
                <label className="flex items-center gap-2 text-xs text-foreground/70">
                  <input
                    type="checkbox"
                    checked={na[aspect.id]}
                    onChange={() => toggleNa(aspect.id)}
                  />
                  Not applicable
                </label>
              </div>
              {na[aspect.id] ? (
                <p className="mt-1 text-xs text-foreground/50">Won&apos;t count toward this category average.</p>
              ) : (
                <RatingControl
                  value={aspects[aspect.id]}
                  onChange={(v) => setAspect(aspect.id, v)}
                  labelledBy={labelId}
                  allowEmpty
                />
              )}
            </div>
          );
        })}
      </div>

      <label className="block text-sm font-medium">
        Photographs (optional, max {MAX_REVIEW_PHOTOS})
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          multiple
          className="mt-1 block w-full text-sm font-normal"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            setPhotos((prev) => [...prev, ...picked].slice(0, MAX_REVIEW_PHOTOS));
            e.target.value = "";
          }}
        />
      </label>
      {photos.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {photos.map((file, i) => (
            <li key={`${file.name}-${i}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(file)}
                alt=""
                className="h-16 w-16 rounded-lg object-cover"
              />
              <button
                type="button"
                className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-xs shadow"
                onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={genuine} onChange={(e) => setGenuine(e.target.checked)} />
        <span>
          I confirm this review is a genuine personal experience. <span className="text-red-600">*</span>
        </span>
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-veda-700 px-5 py-2 text-sm font-medium text-white hover:bg-veda-600 disabled:opacity-50"
        >
          {submitting ? "Posting…" : "Post review"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-veda-300 px-5 py-2 text-sm hover:bg-veda-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const visit = monthLabel(review.visitedOn);
  return (
    <article className="rounded-2xl border border-veda-100 bg-white p-4">
      <div className="flex items-center gap-3">
        {review.user.avatarUrl ? (
          <Image
            src={review.user.avatarUrl}
            alt=""
            width={36}
            height={36}
            className="rounded-full"
          />
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-veda-100 text-veda-700">
            {review.user.name[0]}
          </span>
        )}
        <div>
          <Link
            href={`/profile/${review.user.username}`}
            className="text-sm font-medium text-veda-900 hover:underline"
          >
            {review.user.name}
          </Link>
          <p className="text-xs text-foreground/50">{shortDate(review.createdAt)}</p>
        </div>
      </div>
      <div className="mt-2">
        <RatingStars rating={review.rating} />
      </div>
      <h3 className="mt-1 font-medium text-veda-900">{review.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-foreground/80">{review.body}</p>
      <p className="mt-2 text-sm text-foreground/70">
        {review.recommends == null
          ? null
          : review.recommends
            ? "Recommends this clinic"
            : "Does not recommend this clinic"}
        {visit ? ` · Visited ${visit}` : ""}
      </p>
      <dl className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
        {REVIEW_ASPECTS.map((aspect) => {
          const score = review.aspects[aspect.id];
          return (
            <div key={aspect.id} className="flex items-center justify-between gap-2">
              <dt className="text-foreground/60">{aspect.label}</dt>
              <dd>
                {score == null ? (
                  <span className="text-foreground/40">N/A</span>
                ) : (
                  <RatingDisplay rating={score} size="sm" />
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {review.photos.length > 0 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {review.photos.map((photo) => (
            <div key={photo.id} className="relative h-24 w-32 shrink-0 overflow-hidden rounded-lg">
              <Image src={photo.url} alt={photo.alt || ""} fill className="object-cover" sizes="128px" />
            </div>
          ))}
        </div>
      ) : null}
      {review.response ? (
        <div className="mt-3 rounded-xl bg-turmeric-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-turmeric-800">
            Response from {review.response.responderName}
          </p>
          <p className="mt-1 text-sm text-foreground/80">{review.response.body}</p>
        </div>
      ) : null}
    </article>
  );
}

const EMPTY_SUMMARY: ReviewSummary = {
  ratingAvg: 0,
  ratingCount: 0,
  recommendPercent: null,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  aspectAvgs: emptyAspectScores(),
};

export function ReviewsSection({ slug, initial }: { slug: string; initial: ReviewListResponse }) {
  const { data: session } = useSession();
  const [reviews, setReviews] = useState(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [summary, setSummary] = useState(initial.summary ?? EMPTY_SUMMARY);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  async function loadMore() {
    const next = page + 1;
    const res = await fetch(`${API_URL}/spas/${slug}/reviews?page=${next}`);
    const data: ReviewListResponse = await res.json();
    setReviews((prev) => [...prev, ...data.items]);
    setSummary(data.summary);
    setPage(next);
  }

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-veda-900">Reviews ({summary.ratingCount})</h2>
        {session ? (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-full border border-veda-300 px-4 py-1.5 text-sm text-veda-800 hover:bg-veda-50"
          >
            {showForm ? "Cancel" : "Write a review"}
          </button>
        ) : (
          <Link href="/auth/signin" className="text-sm text-veda-600 hover:underline">
            Sign in to review
          </Link>
        )}
      </div>

      {summary.ratingCount > 0 ? (
        <div className="mt-4 grid gap-6 rounded-2xl border border-veda-100 bg-white p-4 lg:grid-cols-[16rem_1fr]">
          <div>
            <p className="text-4xl font-bold tabular-nums text-veda-900">{summary.ratingAvg.toFixed(1)}</p>
            <RatingDisplay rating={summary.ratingAvg} count={summary.ratingCount} size="lg" />
            <p className="mt-2 text-sm text-foreground/70">
              {summary.recommendPercent == null
                ? "No recommendation data yet"
                : `${summary.recommendPercent}% of reviewers recommend this clinic`}
            </p>
          </div>
          <Distribution summary={summary} />
          <dl className="grid gap-2 text-sm lg:col-span-2 sm:grid-cols-2">
            {REVIEW_ASPECTS.map((aspect) => (
              <div key={aspect.id} className="flex items-center justify-between gap-3">
                <dt className="text-foreground/70">{aspect.label}</dt>
                <dd>
                  {summary.aspectAvgs[aspect.id] == null ? (
                    <span className="text-foreground/40">N/A</span>
                  ) : (
                    <RatingDisplay rating={summary.aspectAvgs[aspect.id]!} />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <p className="mt-3 text-sm text-foreground/60">No reviews yet. Be the first to share your stay.</p>
      )}

      {showForm && session?.apiToken ? (
        <ReviewForm
          slug={slug}
          token={session.apiToken}
          onCancel={() => setShowForm(false)}
            onCreated={async (review) => {
            setReviews((prev) => [review, ...prev]);
            setTotal((t) => t + 1);
            setShowForm(false);
            try {
              const res = await fetch(`${API_URL}/spas/${slug}/reviews?page=1`);
              const data: ReviewListResponse = await res.json();
              setSummary(data.summary);
            } catch {
              /* keep optimistic list; summary refreshes on next load */
            }
          }}
        />
      ) : null}

      <div className="mt-4 space-y-4">
        {reviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>

      {reviews.length < total ? (
        <button
          onClick={loadMore}
          className="mt-4 w-full rounded-full border border-veda-300 py-2 text-sm text-veda-800 hover:bg-veda-50"
        >
          Show more reviews
        </button>
      ) : null}
    </section>
  );
}
