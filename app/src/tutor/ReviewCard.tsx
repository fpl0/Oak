// A stored review as a card other pages embed (Wave 4: the album track page, the capstone page, a transcription's
// history): the review rendered from its schema in compact form, every comment with its bar link (the bars loop
// and light in the Workbench on screen), headed with what it reviewed. `ReviewCards` lists a subject's reviews
// from `tutor.reviews`, with its loading, empty and error states. The review never says pass or fail.
import type { ReviewRecord } from "@oak/api";
import { useTutorReviews } from "../lib/queries.ts";
import { ErrorState, LoadingState } from "../ui/kit/QueryState.tsx";
import { GENERAL_SUBJECT, type TutorSubject, useTutorContext } from "./context.ts";
import { useTokenContext } from "./hooks.ts";
import { type ReviewData, ReviewView } from "./ReviewView.tsx";

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** "Review of version 2 · 12 Nov", "Review of your transcription · 12 Nov". Pure. */
export function reviewHeading(record: ReviewRecord): string {
  const when = DAY.format(new Date(record.at));
  if (record.kind === "capstone")
    return record.track
      ? `Review of version ${record.track.version} · ${when}`
      : `Review of your draft · ${when}`;
  return record.version !== null
    ? `Review of version ${record.version} · ${when}`
    : `Review of your transcription · ${when}`;
}

export function ReviewCard({ record }: { record: ReviewRecord }) {
  const ctx = useTokenContext();
  const current = useTutorContext((s) => s.subject);
  // The bar links act on the Workbench of the page the card sits on, when it shows this subject.
  const subject: TutorSubject =
    current &&
    current.thread.subjectKind === record.subject.subjectKind &&
    current.thread.subjectId === record.subject.subjectId
      ? current
      : { ...GENERAL_SUBJECT, thread: record.subject, title: "" };
  const data: ReviewData =
    record.kind === "capstone"
      ? { reviewKind: "capstone", review: record.review }
      : { reviewKind: "transcription", review: record.review };
  return (
    <ReviewView
      data={data}
      subject={subject}
      thread={record.subject}
      ctx={ctx}
      id={`review-${record.conversationId}`}
      compact
      heading={reviewHeading(record)}
    />
  );
}

/** Every stored review of a capstone or transcription, newest first. */
export function ReviewCards({
  subject,
  empty,
}: {
  subject: { subjectKind: "capstone" | "transcription"; subjectId: string };
  /** What to show when there is none yet (the page's own next action). */
  empty?: React.ReactNode;
}) {
  const reviews = useTutorReviews(subject);
  if (reviews.isPending) return <LoadingState rows={2} label="Loading reviews" />;
  if (reviews.isError) return <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />;
  const items = reviews.data.items;
  if (items.length === 0) return <>{empty ?? null}</>;
  return (
    <ul className="flex flex-col gap-3" aria-label="Claude's reviews" data-testid="review-cards">
      {items.map((r) => (
        <li key={r.conversationId}>
          <ReviewCard record={r} />
        </li>
      ))}
    </ul>
  );
}
