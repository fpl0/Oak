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
import { Check, Ear, Feather, Repeat, Sparkles, TriangleAlert, Wrench } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "../ui/kit/index.ts";
import { CodeCard } from "./CodeCard.tsx";
import { showBars, type TutorSubject } from "./context.ts";
import { InlineMarkdown } from "./Markdown.tsx";
import { parseMarkdown, plainText } from "./markdown.ts";
import type { TokenContext } from "./music-tokens.ts";
import { readDone, writeDone } from "./review-done.ts";

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
  compact = false,
  heading,
}: {
  data: ReviewData;
  subject: TutorSubject;
  thread: SubjectRef;
  ctx: TokenContext;
  id: string;
  /**
   * Wave 4: the card form other pages embed (the album track page, a transcription's history): no `tryCode`
   * cards, the liner note left to the page that shows it.
   */
  compact?: boolean;
  /** A line above the review ("Review of version 2 · 12 Nov"), for the card form. */
  heading?: string;
}) {
  const r = data.review;
  // "Mark done" on each revision (ux §6.5): the learner's own checklist, never sent anywhere.
  const [done, setDone] = useState<number[]>(() => readDone(id));
  const toggleDone = (i: number) => {
    const next = done.includes(i) ? done.filter((x) => x !== i) : [...done, i].sort((a, b) => a - b);
    setDone(next);
    writeDone(id, next);
  };
  // Review prose may carry music tokens ([[chord:Am]], [[rn:V]], [[bars:7-8]]): drawn as chips, never raw.
  const md = (text: string) => <InlineMarkdown text={text} ctx={ctx} thread={thread} />;
  // Review `tryCode` is Preview-only before a capstone's first release; after it (revision mode) it applies like
  // any card (contracts §10.7 table).
  const revising = data.reviewKind === "capstone" && subject.released === true;
  const tryCard = (i: number, title: string, code: string, bars: [number, number]): CardData => ({
    cardId: `${id}-rev-${i}`,
    toolUseId: `${id}-rev-${i}`,
    kind: "variation",
    // The card's title is plain text: tokens read as their values ("Try ii before V"), never as brackets.
    title: `Try: ${plainText(parseMarkdown(title))}`,
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
      data-compact={compact ? "true" : undefined}
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-3"
    >
      {heading && <h3 className="font-sans text-sm font-semibold text-text">{heading}</h3>}
      <p className="text-xs text-text-3">Claude's comments never affect pass or fail.</p>
      <Part icon={<Sparkles aria-hidden className="size-3.5" />} title="What works">
        <ul className="flex flex-col gap-2" data-testid="review-strengths">
          {r.strengths.map((s) => (
            <li key={`${s.bars[0]}-${s.text}`} className="flex items-start gap-2 text-sm">
              <BarsChip bars={s.bars} thread={thread} />
              <span>
                {"layer" in s && <span className="mr-1 font-medium capitalize">{s.layer}:</span>}
                {md(s.text)}
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
            <li
              key={`${i}-${v.title}`}
              data-done={done.includes(i) || undefined}
              className="flex flex-col gap-2 rounded-control border border-border p-2.5 data-[done]:bg-surface-2"
            >
              <div className="flex items-center gap-2">
                <BarsChip bars={v.bars} thread={thread} />
                {/* A title carries tokens too ("Try [[rn:ii]] before [[rn:V]]"); a long word wraps, never runs out. */}
                <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{md(v.title)}</span>
                {"layer" in v && <span className="text-xs text-text-3 capitalize">{v.layer}</span>}
                {!compact && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    aria-pressed={done.includes(i)}
                    icon={done.includes(i) ? <Check aria-hidden className="size-3.5" /> : undefined}
                    onClick={() => toggleDone(i)}
                    data-testid="review-mark-done"
                  >
                    {done.includes(i) ? "Done" : "Mark done"}
                  </Button>
                )}
              </div>
              <p className="text-sm text-text-2">{md(v.why)}</p>
              {"listenFor" in v && (
                <p className="flex items-start gap-1.5 text-sm">
                  <Ear aria-hidden className="mt-0.5 size-3.5 shrink-0 text-text-3" />
                  <span>{md(v.listenFor)}</span>
                </p>
              )}
              {!compact && "tryCode" in v && v.tryCode.trim() && (
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
                <span>{md(f.issue)}</span>
              </li>
            ))}
          </ul>
        </Part>
      )}
      <Part icon={<Ear aria-hidden className="size-3.5" />} title="Listen for">
        <p className="text-sm" data-testid="review-question">
          {md(r.listeningQuestion)}
        </p>
      </Part>
      {!compact && (
        <Part icon={<Feather aria-hidden className="size-3.5" />} title="Liner note">
          <blockquote
            className="border-l-2 border-accent/50 pl-3 font-display text-sm italic"
            data-testid="review-liner"
          >
            {md(r.linerNote)}
          </blockquote>
        </Part>
      )}
    </article>
  );
}
