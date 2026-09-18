"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Send, Star } from "lucide-react";
import { format, parseISO } from "date-fns";
import { displayName } from "@/lib/utils";
import type {
  Review,
  ReviewFormTemplate,
  ReviewQuestion,
  ReviewResponses,
  PeerFeedbackRequest,
} from "@/types/database";

type Peer = PeerFeedbackRequest & {
  reviewer?: {
    full_name: string;
    preferred_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
};

export function ReviewForm({
  review,
  template,
  mode,
  cycleName,
  cycleSelfDue,
  cycleManagerDue,
  peerFeedback,
}: {
  review: Review;
  template: ReviewFormTemplate;
  mode: "self" | "manager" | "view";
  cycleName: string;
  cycleSelfDue: string | null;
  cycleManagerDue: string | null;
  peerFeedback: Peer[];
}) {
  const router = useRouter();
  const initial = mode === "self" ? review.self_responses : review.manager_responses;
  const [draft, setDraft] = useState<ReviewResponses>(() => ({ ...initial }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = review.status === "signed_off";

  const relevantQuestions = template.questions.filter((q) =>
    mode === "self"
      ? q.roles.includes("self")
      : mode === "manager"
        ? q.roles.includes("manager")
        : true
  );

  const setRating = (qid: string, rating: number) =>
    setDraft({
      ...draft,
      [qid]: { rating, comment: draft[qid]?.comment ?? "" },
    });

  const setComment = (qid: string, comment: string) =>
    setDraft({
      ...draft,
      [qid]: { rating: draft[qid]?.rating ?? null, comment },
    });

  const save = async (submit: boolean) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/reviews/${review.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: mode,
        responses: draft,
        submit,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Save failed");
      return;
    }
    router.refresh();
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-sm uppercase tracking-wide text-gray-500">
            {cycleName}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {mode === "self" && "Your self review"}
            {mode === "manager" && "Manager review (side-by-side with self + peer responses)"}
            {mode === "view" && "Review summary"}
          </p>
          {(cycleSelfDue || cycleManagerDue) && (
            <p className="mt-0.5 text-xs text-gray-400">
              {cycleSelfDue && (
                <>Self due {format(parseISO(cycleSelfDue), "MMM d")} · </>
              )}
              {cycleManagerDue && (
                <>Manager due {format(parseISO(cycleManagerDue), "MMM d")}</>
              )}
            </p>
          )}
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-600">
          {review.status.replace("_", " ")}
        </span>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      <div className="space-y-5">
        {relevantQuestions.map((q) => (
          <QuestionRow
            key={q.id}
            question={q}
            mode={mode}
            locked={locked}
            myDraft={draft[q.id]}
            otherSelf={review.self_responses[q.id]}
            peers={peerFeedback}
            onRating={(r) => setRating(q.id, r)}
            onComment={(c) => setComment(q.id, c)}
          />
        ))}
      </div>

      {mode !== "view" && !locked && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={() => save(false)}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Save size={12} /> {busy ? "Saving..." : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirm("Submit this review? You won't be able to edit it once both sides are submitted.")) return;
              save(true);
            }}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Send size={12} /> Submit
          </button>
          {mode === "manager" &&
            review.status === "not_started" && (
              <span className="ml-auto text-[11px] text-gray-500">
                Tip: employee hasn&apos;t submitted their self review yet — submitting now will sign off without their input.
              </span>
            )}
        </div>
      )}
    </div>
  );
}

function QuestionRow({
  question,
  mode,
  locked,
  myDraft,
  otherSelf,
  peers,
  onRating,
  onComment,
}: {
  question: ReviewQuestion;
  mode: "self" | "manager" | "view";
  locked: boolean;
  myDraft: { rating: number | null; comment: string } | undefined;
  otherSelf: { rating: number | null; comment: string } | undefined;
  peers: Peer[];
  onRating: (r: number) => void;
  onComment: (c: string) => void;
}) {
  const showSelfReference = mode === "manager" && question.roles.includes("self");
  const relevantPeers = peers.filter(
    (p) => p.status === "completed" && p.response?.[question.id]
  );

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-sm font-medium text-gray-900">{question.text}</p>

      {showSelfReference && otherSelf && (
        <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Self response (reference)
          </p>
          <Stars rating={otherSelf.rating ?? 0} readonly />
          {otherSelf.comment && (
            <p className="mt-1 text-xs italic text-gray-700">{otherSelf.comment}</p>
          )}
        </div>
      )}

      {relevantPeers.length > 0 && (
        <div className="mt-3 space-y-2">
          {relevantPeers.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-gray-100 bg-blue-50/30 p-3"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Peer response
                {!p.anonymous && p.reviewer && (
                  <span className="ml-1 font-normal normal-case text-gray-500">
                    · {displayName(p.reviewer)}
                  </span>
                )}
                {p.anonymous && (
                  <span className="ml-1 font-normal normal-case text-gray-400">
                    · anonymous
                  </span>
                )}
              </p>
              <Stars rating={p.response[question.id]?.rating ?? 0} readonly />
              {p.response[question.id]?.comment && (
                <p className="mt-1 text-xs italic text-gray-700">
                  {p.response[question.id].comment}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {mode !== "view" && (
        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">
            Your response
          </p>
          <Stars
            rating={myDraft?.rating ?? 0}
            readonly={locked}
            onChange={onRating}
          />
          <textarea
            value={myDraft?.comment ?? ""}
            onChange={(e) => onComment(e.target.value)}
            disabled={locked}
            rows={3}
            placeholder="Comment…"
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:bg-gray-50"
          />
        </div>
      )}

      {mode === "view" && myDraft && (
        <div className="mt-2">
          <Stars rating={myDraft.rating ?? 0} readonly />
          {myDraft.comment && (
            <p className="mt-1 text-xs italic text-gray-700">{myDraft.comment}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Stars({
  rating,
  readonly,
  onChange,
}: {
  rating: number;
  readonly?: boolean;
  onChange?: (r: number) => void;
}) {
  return (
    <div className="mt-1 flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(n)}
          className={`p-0.5 ${readonly ? "cursor-default" : "cursor-pointer"}`}
        >
          <Star
            size={18}
            className={
              n <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300"
            }
          />
        </button>
      ))}
    </div>
  );
}
