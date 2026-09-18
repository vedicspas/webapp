"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Paginated, Review } from "@vedic/shared";
import { shortDate } from "@/lib/format";
import { RatingStars } from "@/components/RatingStars";
import { toast } from "@/stores/toastStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

export function ReviewsSection({ slug, initial }: { slug: string; initial: Paginated<Review> }) {
  const { data: session } = useSession();
  const [reviews, setReviews] = useState(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadMore() {
    const next = page + 1;
    const res = await fetch(`${API_URL}/spas/${slug}/reviews?page=${next}`);
    const data: Paginated<Review> = await res.json();
    setReviews((prev) => [...prev, ...data.items]);
    setPage(next);
  }

  async function submit() {
    if (!session?.apiToken) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/spas/${slug}/reviews`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.apiToken}`,
        },
        body: JSON.stringify({ rating, title, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit review");
      setReviews((prev) => [data, ...prev]);
      setTotal((t) => t + 1);
      setShowForm(false);
      setTitle("");
      setBody("");
      toast("Review posted.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not submit review", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-veda-900">Reviews ({total})</h2>
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

      {showForm ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-veda-200 bg-white p-4">
          <label className="block text-sm font-medium">
            Rating
            <select
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              className="mt-1 block rounded-lg border border-veda-200 px-3 py-1.5"
            >
              {[5, 4, 3, 2, 1].map((r) => (
                <option key={r} value={r}>
                  {"\u2605".repeat(r)}
                </option>
              ))}
            </select>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title of your review"
            className="w-full rounded-lg border border-veda-200 px-3 py-2 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Tell other travelers about your experience (min 10 characters)"
            rows={4}
            className="w-full rounded-lg border border-veda-200 px-3 py-2 text-sm"
          />
          <button
            onClick={submit}
            disabled={submitting || title.length < 3 || body.length < 10}
            className="rounded-full bg-veda-700 px-5 py-2 text-sm font-medium text-white hover:bg-veda-600 disabled:opacity-50"
          >
            {submitting ? "Posting\u2026" : "Post review"}
          </button>
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {reviews.map((review) => (
          <article key={review.id} className="rounded-2xl border border-veda-100 bg-white p-4">
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

            {review.response ? (
              <div className="mt-3 rounded-xl bg-turmeric-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-turmeric-800">
                  Response from {review.response.responderName}
                </p>
                <p className="mt-1 text-sm text-foreground/80">{review.response.body}</p>
              </div>
            ) : null}
          </article>
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
