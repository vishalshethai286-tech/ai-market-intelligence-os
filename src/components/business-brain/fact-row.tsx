"use client";

import { useState, useTransition } from "react";
import type { BrainFact, BrainFactVerificationStatus, BrainFeedbackType } from "@/generated/prisma/client";
import { markFactVerificationAction, submitBrainFeedbackAction } from "@/lib/actions/business-brain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_BADGE: Record<BrainFactVerificationStatus, { variant: "outline" | "success" | "danger" | "warning"; label: string }> = {
  UNVERIFIED: { variant: "outline", label: "Unverified" },
  CORRECT: { variant: "success", label: "Correct" },
  INCORRECT: { variant: "danger", label: "Incorrect" },
  NEEDS_REVIEW: { variant: "warning", label: "Needs review" },
};

export type FeedbackKind = "product" | "industry";

const FEEDBACK_LABELS: Record<FeedbackKind, { positive: string; negative: string; positiveType: BrainFeedbackType; negativeType: BrainFeedbackType }> = {
  product: { positive: "Correct product", negative: "Incorrect product", positiveType: "CORRECT_PRODUCT", negativeType: "INCORRECT_PRODUCT" },
  industry: { positive: "Good industry", negative: "Bad industry", positiveType: "GOOD_INDUSTRY", negativeType: "BAD_INDUSTRY" },
};

export function FactRow({
  fact,
  canReview,
  feedbackKind,
  feedbackCounts,
}: {
  fact: BrainFact;
  canReview: boolean;
  feedbackKind?: FeedbackKind;
  feedbackCounts?: { positive: number; negative: number };
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingStatus, setPendingStatus] = useState<BrainFactVerificationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isFeedbackPending, startFeedbackTransition] = useTransition();
  const [pendingFeedbackType, setPendingFeedbackType] = useState<BrainFeedbackType | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const badge = STATUS_BADGE[fact.verificationStatus];

  function mark(status: BrainFactVerificationStatus) {
    setPendingStatus(status);
    startTransition(async () => {
      setError(null);
      const result = await markFactVerificationAction(fact.id, status);
      if (result?.error) setError(result.error);
      setPendingStatus(null);
    });
  }

  function giveFeedback(feedbackType: BrainFeedbackType) {
    setPendingFeedbackType(feedbackType);
    startFeedbackTransition(async () => {
      setFeedbackError(null);
      const result = await submitBrainFeedbackAction(feedbackType, { factId: fact.id });
      if (result?.error) setFeedbackError(result.error);
      setPendingFeedbackType(null);
    });
  }

  return (
    <div className="rounded-lg border border-black/[.08] p-3 dark:border-white/[.145]">
      <p className="text-sm">{fact.factValue}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-black/50 dark:text-white/50">
        <span>{Math.round(fact.confidenceScore * 100)}% confidence</span>
        {fact.sourceUrl && (
          <a href={fact.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {fact.sourceUrl}
          </a>
        )}
        {fact.lastVerifiedAt && <span>Last verified {fact.lastVerifiedAt.toLocaleDateString()}</span>}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {canReview && (
          <>
            <Button
              type="button"
              size="sm"
              variant={fact.verificationStatus === "CORRECT" ? "primary" : "outline"}
              disabled={isPending}
              onClick={() => mark("CORRECT")}
            >
              {isPending && pendingStatus === "CORRECT" ? "..." : "Correct"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={fact.verificationStatus === "INCORRECT" ? "destructive" : "outline"}
              disabled={isPending}
              onClick={() => mark("INCORRECT")}
            >
              {isPending && pendingStatus === "INCORRECT" ? "..." : "Incorrect"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={fact.verificationStatus === "NEEDS_REVIEW" ? "primary" : "outline"}
              disabled={isPending}
              onClick={() => mark("NEEDS_REVIEW")}
            >
              {isPending && pendingStatus === "NEEDS_REVIEW" ? "..." : "Needs review"}
            </Button>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {feedbackKind && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-black/[.06] pt-2 dark:border-white/[.08]">
          <span className="text-xs text-black/50 dark:text-white/50">
            {feedbackCounts?.positive ?? 0} positive · {feedbackCounts?.negative ?? 0} negative
          </span>
          {canReview && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isFeedbackPending}
                onClick={() => giveFeedback(FEEDBACK_LABELS[feedbackKind].positiveType)}
              >
                {isFeedbackPending && pendingFeedbackType === FEEDBACK_LABELS[feedbackKind].positiveType
                  ? "..."
                  : FEEDBACK_LABELS[feedbackKind].positive}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isFeedbackPending}
                onClick={() => giveFeedback(FEEDBACK_LABELS[feedbackKind].negativeType)}
              >
                {isFeedbackPending && pendingFeedbackType === FEEDBACK_LABELS[feedbackKind].negativeType
                  ? "..."
                  : FEEDBACK_LABELS[feedbackKind].negative}
              </Button>
            </>
          )}
          {feedbackError && <p className="w-full text-sm text-red-600 dark:text-red-400">{feedbackError}</p>}
        </div>
      )}
    </div>
  );
}
