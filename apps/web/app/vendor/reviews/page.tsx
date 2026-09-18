"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Review } from "@vedic/shared";
import { useApi } from "@/lib/useApi";
import { RatingStars } from "@/components/RatingStars";
import { shortDate } from "@/lib/format";
import { toast } from "@/stores/toastStore";

type VendorReview = Review & { spaName: string };

export default function VendorReviewsPage() {
  const { call, token, authStatus } = useApi();
  const [reviews, setReviews] = useState<VendorReview[] | null>(null);
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    call<VendorReview[]>("/vendor/reviews").then(setReviews).catch(() => setReviews([]));
  }, [call]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  async function reply(reviewId: number) {
    setBusy(true);
    try {
      await call(`/reviews/${reviewId}/response`, { method: "POST", body: { body: replyText } });
      setReplyFor(null);
      setReplyText("");
      toast("Response saved.");
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not post response", "error");
    } finally {
      setBusy(false);
    }
  }

  if (authStatus === "unauthenticated") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-foreground/60">
        <Link href="/auth/signin" className="text-veda-600 underline">Sign in</Link> to continue.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-veda-900">Guest reviews</h1>
      <Link href="/vendor" className="text-sm text-veda-600 hover:underline">
        &larr; Back to dashboard
      </Link>

      <div className="mt-6 space-y-4">
        {reviews === null ? (
          <p className="text-foreground/60">Loading&hellip;</p>
        ) : reviews.length === 0 ? (
          <p className="text-foreground/60">No reviews yet.</p>
        ) : (
          reviews.map((review) => (
            <article key={review.id} className="rounded-2xl border border-veda-100 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-veda-500">{review.spaName}</p>
              <div className="mt-1 flex items-center justify-between">
                <RatingStars rating={review.rating} />
                <span className="text-xs text-foreground/50">{shortDate(review.createdAt)}</span>
              </div>
              <h3 className="mt-1 font-medium text-veda-900">{review.title}</h3>
              <p className="mt-1 text-sm text-foreground/80">{review.body}</p>
              <p className="mt-1 text-xs text-foreground/50">by {review.user.name}</p>

              {review.response ? (
                <div className="mt-3 rounded-xl bg-turmeric-50 p-3 text-sm">
                  <p className="text-xs font-semibold text-turmeric-800">Your response</p>
                  <p className="mt-1">{review.response.body}</p>
                </div>
              ) : replyFor === review.id ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={3}
                    placeholder="Thank the guest, address concerns..."
                    className="w-full rounded-lg border border-veda-200 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => reply(review.id)}
                    disabled={busy || replyText.length < 3}
                    className="rounded-full bg-veda-700 px-4 py-1.5 text-sm text-white hover:bg-veda-600 disabled:opacity-50"
                  >
                    Post response
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setReplyFor(review.id)}
                  className="mt-3 rounded-full border border-veda-300 px-4 py-1.5 text-sm hover:bg-veda-50"
                >
                  Respond
                </button>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
