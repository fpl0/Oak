// A structured review (contracts §10.6), rendered from the review schema: 2–3 strengths anchored to bars (a bar
// chip loops them in the Workbench), the revision(s) with a `tryCode` card, one listening question and the liner
// note. A review never says pass or fail, and the header says so.
import {
  type CapstoneReview,
  CapstoneReviewSchema,
  type CardData,
  type SubjectRef,
  type TranscriptionReview,
  TranscriptionReviewSchema,
} from "@oak/api";
import { Ear, Feather, Repeat, Sparkles, TriangleAlert, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { CodeCard } from "./CodeCard.tsx";
import { showBars, type TutorSubject } from "./context.ts";
import type { TokenContext } from "./music-tokens.ts";

export type ReviewData =
  | { reviewKind: "capstone"; review: CapstoneReview }
  | { reviewKind: "transcription"; review: TranscriptionReview };

/** A stored review (`TranscriptEntry.review` is `unknown`) as typed data, or null. */
export function reviewOf(raw: unknown): ReviewData | null {
  const v = raw && typeof raw === "object" && "review" in raw ? (raw as { review: unknown }).review : raw;
  const c = CapstoneReviewSchema.safeParse(v);
  if (c.success) return { reviewKind: "capstone", review: c.data };
  const t = TranscriptionReviewSchema.safeParse(v);
  if (t.success) return { reviewKind: "transcription", review: t.data };
  return null;
}

function BarsChip({ bars, thread }: { bars: [number, number]; thread: SubjectRef }) {
  const [a, b] = bars[0] <= bars[1] ? bars : [bars[1], bars[0]];
  const label = a === b ? `bar ${a}` : `bars ${a}–${b}`;
  return (
    <button
      type="button"
      data-token="bars"
      onClick={() => showBars(thread, a, b)}
      aria-label={`Show ${label}`}
      className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-accent/40 bg-lane-in px-2 text-xs font-medium whitespace-nowrap text-accent hover:bg-surface-2"
    >
      <Repeat aria-hidden className="size-3" />
      {label}
    </button>
  );
}

function Part({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="flex items-center gap-1.5 font-sans text-xs font-semibold tracking-wide text-text-3 uppercase">
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}

export function ReviewView({
  data,
  subject,
  thread,
  ctx,
  id,
}: {
  data: ReviewData;
  subject: TutorSubject;
  thread: SubjectRef;
  ctx: TokenContext;
  id: string;
}) {
  const r = data.review;
  // Review `tryCode` is Preview-only before a capstone's first release; after it (revision mode) it applies like
  // any card (contracts §10.7 table).
  const revising = data.reviewKind === "capstone" && subject.released === true;
  const tryCard = (i: number, title: string, code: string, bars: [number, number]): CardData => ({
    cardId: `${id}-rev-${i}`,
    toolUseId: `${id}-rev-${i}`,
    kind: "variation",
    title: `Try: ${title}`,
    code,
    explanation: "",
    bars: Math.max(1, Math.min(16, Math.abs(bars[1] - bars[0]) + 1, 4)),
    apply: revising ? "applicable" : "preview_only",
    applyAllowed: revising,
    lockedTools: [],
  });
  return (
    <article
      aria-label={data.reviewKind === "capstone" ? "Capstone review" : "Transcription review"}
      data-testid="review"
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-3"
    >
      <p className="text-xs text-text-3">Claude's comments never affect pass or fail.</p>
      <Part icon={<Sparkles aria-hidden className="size-3.5" />} title="What works">
        <ul className="flex flex-col gap-2" data-testid="review-strengths">
          {r.strengths.map((s) => (
            <li key={`${s.bars[0]}-${s.text}`} className="flex items-start gap-2 text-sm">
              <BarsChip bars={s.bars} thread={thread} />
              <span>
                {"layer" in s && <span className="mr-1 font-medium capitalize">{s.layer}:</span>}
                {s.text}
              </span>
            </li>
          ))}
        </ul>
      </Part>
      <Part
        icon={<Wrench aria-hidden className="size-3.5" />}
        title={r.revisions.length === 1 ? "One revision" : `${r.revisions.length} revisions`}
      >
        <ol className="flex flex-col gap-3" data-testid="review-revisions">
          {r.revisions.map((v, i) => (
            <li key={v.title} className="flex flex-col gap-2 rounded-control border border-border p-2.5">
              <div className="flex items-center gap-2">
                <BarsChip bars={v.bars} thread={thread} />
                <span className="font-medium">{v.title}</span>
              </div>
              <p className="text-sm text-text-2">{v.why}</p>
              {"listenFor" in v && (
                <p className="flex items-start gap-1.5 text-sm">
                  <Ear aria-hidden className="mt-0.5 size-3.5 shrink-0 text-text-3" />
                  {v.listenFor}
                </p>
              )}
              {"tryCode" in v && v.tryCode.trim() && (
                <CodeCard
                  card={tryCard(i, v.title, v.tryCode, v.bars)}
                  subject={subject}
                  thread={thread}
                  ctx={ctx}
                  local
                />
              )}
            </li>
          ))}
        </ol>
      </Part>
      {"plausibilityFlags" in r && r.plausibilityFlags.length > 0 && (
        <Part icon={<TriangleAlert aria-hidden className="size-3.5" />} title="Worth a second listen">
          <ul className="flex flex-col gap-2">
            {r.plausibilityFlags.map((f) => (
              <li key={`${f.bars[0]}-${f.issue}`} className="flex items-start gap-2 text-sm">
                <BarsChip bars={f.bars} thread={thread} />
                <span>{f.issue}</span>
              </li>
            ))}
          </ul>
        </Part>
      )}
      <Part icon={<Ear aria-hidden className="size-3.5" />} title="Listen for">
        <p className="text-sm" data-testid="review-question">
          {r.listeningQuestion}
        </p>
      </Part>
      <Part icon={<Feather aria-hidden className="size-3.5" />} title="Liner note">
        <blockquote
          className="border-l-2 border-accent/50 pl-3 font-display text-sm italic"
          data-testid="review-liner"
        >
          {r.linerNote}
        </blockquote>
      </Part>
    </article>
  );
}
