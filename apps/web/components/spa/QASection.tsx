"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Question } from "@vedic/shared";
import { shortDate } from "@/lib/format";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

export function QASection({ slug, initial }: { slug: string; initial: Question[] }) {
  const { data: session } = useSession();
  const [questions, setQuestions] = useState(initial);
  const [newQuestion, setNewQuestion] = useState("");
  const [answerFor, setAnswerFor] = useState<number | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch(`${API_URL}/spas/${slug}/questions`);
    if (res.ok) setQuestions(await res.json());
  }

  async function ask() {
    if (!session?.apiToken || newQuestion.length < 5) return;
    setBusy(true);
    await fetch(`${API_URL}/spas/${slug}/questions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.apiToken}`,
      },
      body: JSON.stringify({ body: newQuestion }),
    });
    setNewQuestion("");
    await refresh();
    setBusy(false);
  }

  async function answer(questionId: number) {
    if (!session?.apiToken || answerText.length < 2) return;
    setBusy(true);
    await fetch(`${API_URL}/questions/${questionId}/answers`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.apiToken}`,
      },
      body: JSON.stringify({ body: answerText }),
    });
    setAnswerFor(null);
    setAnswerText("");
    await refresh();
    setBusy(false);
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-veda-900">Questions &amp; answers</h2>

      {session ? (
        <div className="mt-3 flex gap-2">
          <input
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Ask the community or the spa a question"
            className="w-full rounded-full border border-veda-200 px-4 py-2 text-sm"
          />
          <button
            onClick={ask}
            disabled={busy || newQuestion.length < 5}
            className="shrink-0 rounded-full bg-veda-700 px-4 py-2 text-sm text-white hover:bg-veda-600 disabled:opacity-50"
          >
            Ask
          </button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-foreground/60">
          <Link href="/auth/signin" className="text-veda-600 hover:underline">
            Sign in
          </Link>{" "}
          to ask a question.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {questions.length === 0 ? (
          <p className="text-sm text-foreground/60">No questions yet. Be the first to ask.</p>
        ) : null}
        {questions.map((q) => (
          <div key={q.id} className="rounded-2xl border border-veda-100 bg-white p-4">
            <p className="text-sm">
              <span className="font-medium text-veda-900">{q.user.name}</span>{" "}
              <span className="text-xs text-foreground/50">{shortDate(q.createdAt)}</span>
            </p>
            <p className="mt-1 text-sm text-foreground/85">{q.body}</p>

            {q.answers.map((a) => (
              <div
                key={a.id}
                className={`mt-2 rounded-xl p-3 text-sm ${a.isVendor ? "bg-turmeric-50" : "bg-veda-50"}`}
              >
                <p className="text-xs font-semibold">
                  {a.user.name}
                  {a.isVendor ? (
                    <span className="ml-2 rounded-full bg-turmeric-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-turmeric-900">
                      Spa owner
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-foreground/80">{a.body}</p>
              </div>
            ))}

            {session ? (
              answerFor === q.id ? (
                <div className="mt-2 flex gap-2">
                  <input
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="Write an answer"
                    className="w-full rounded-full border border-veda-200 px-3 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => answer(q.id)}
                    disabled={busy}
                    className="shrink-0 rounded-full bg-veda-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    Reply
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAnswerFor(q.id)}
                  className="mt-2 text-xs text-veda-600 hover:underline"
                >
                  Answer this question
                </button>
              )
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
