// A `propose_code` card (contracts §10.7, ux §6.4): title, explanation, the code, Preview (isolated player,
// strict lint), a token-level Diff against the editor, and — only where the server said `applicable` — Copy,
// Apply and Apply to new sketch. A preview-only card's code cannot be selected or copied: the learner types
// what they want to keep.
import type { CardData, SubjectRef } from "@oak/api";
import { useNavigate } from "@tanstack/react-router";
import { clsx } from "clsx";
import { ClipboardCopy, FilePlus2, GitCompare, Lock, Play, Square, Wand2 } from "lucide-react";
import { useState } from "react";
import { useSketchCreate, useTutorCardApplied } from "../lib/queries.ts";
import { currentSessionId } from "../session/store.ts";
import { Button } from "../ui/kit/Button.tsx";
import { toast } from "../ui/kit/Toast.tsx";
import { type TutorSubject, tutorHostFor, useTutorContext } from "./context.ts";
import { diffCode, diffStats } from "./diff.ts";
import type { TokenContext } from "./music-tokens.ts";
import { previewCard, usePreview } from "./preview.ts";

const KIND_LABEL: Record<CardData["kind"], string> = {
  hint: "Hint",
  fix: "Fix",
  variation: "Variation",
  example: "Example",
  next_step: "Next step",
};

/** Why a card is Preview-only here, in the learner's words (contracts §10.7 table). */
export function previewOnlyReason(subject: TutorSubject): string {
  if (subject.graded && !subject.passed) return "Try it yourself first, or take hint 4.";
  if (subject.thread.subjectKind === "capstone")
    return "Before the first release of a capstone you type your own code. Preview and Diff only.";
  if (subject.thread.subjectKind === "lesson")
    return "In a Make step you type your own code. Preview and Diff only.";
  return "This card is for listening. Preview and Diff only.";
}

export function CodeCard({
  card,
  subject,
  thread,
  ctx,
  applied = false,
  local = false,
}: {
  card: CardData;
  subject: TutorSubject;
  thread: SubjectRef;
  ctx: TokenContext;
  applied?: boolean;
  /**
   * The card has no server record (a review's `tryCode`): applying it is not reported through
   * `tutor.cardApplied`. The host still marks the change as Claude's (the version note credits it).
   */
  local?: boolean;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const [done, setDone] = useState(applied);
  const preview = usePreview();
  useTutorContext((s) => s.hosts);
  const host = tutorHostFor(thread);
  const applyMut = useTutorCardApplied();
  const createSketch = useSketchCreate();
  const navigate = useNavigate();
  const applicable = card.apply === "applicable" && card.applyAllowed;
  const playing = preview.cardId === card.cardId;
  const loading = preview.loading === card.cardId;
  const error = preview.errors[card.cardId];
  const current = subject.code ?? null;
  const ops = showDiff && current !== null ? diffCode(current, card.code) : [];
  const stats = diffStats(ops);
  const locked = card.lockedTools.map((id) => {
    const t = ctx.tools.find((x) => x.id === id);
    const at = t ? (Array.isArray(t.unlock.at) ? t.unlock.at[0] : t.unlock.at) : null;
    return { id, name: t?.code ?? id, at };
  });
  const idBase = `card-${card.cardId}`;

  const apply = async () => {
    if (!host?.applyCode) return;
    try {
      host.applyCode(card.code, { cardId: card.cardId, title: card.title });
      if (!local)
        await applyMut.mutateAsync({
          params: { id: card.cardId },
          body: { sketchId: host.sketchId ?? null, toNewSketch: false },
        });
      setDone(true);
      toast.success("Applied", "One change in the editor. Undo with ⌘Z.");
    } catch (e) {
      toast.error("The card was not applied", e instanceof Error ? e.message : undefined);
    }
  };

  const toNewSketch = async () => {
    try {
      const { sketch } = await createSketch.mutateAsync({
        body: {
          title: card.title.slice(0, 120) || "Tutor card",
          originKind: "tutor",
          originId: card.cardId,
          sessionId: currentSessionId(),
          code: card.code,
          bpm: null,
          meter: null,
          key: null,
          analysis: null,
          note: null,
          tutorAssisted: true,
          band: null,
          flags: { lockedTools: [], previewTools: [...card.lockedTools] },
          ranOk: false,
        },
      });
      if (!local)
        await applyMut.mutateAsync({
          params: { id: card.cardId },
          body: { sketchId: sketch.id, toNewSketch: true },
        });
      setDone(true);
      void navigate({ to: "/studio/$sketchId", params: { sketchId: sketch.id } });
    } catch (e) {
      toast.error("No sketch was made", e instanceof Error ? e.message : undefined);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(card.code);
      toast.success("Copied");
    } catch {
      toast.error("Copy did not work", "Your browser refused the clipboard.");
    }
  };

  return (
    <section
      aria-labelledby={`${idBase}-title`}
      data-testid="code-card"
      data-apply={card.apply}
      className="overflow-hidden rounded-card border border-border bg-surface"
    >
      <header className="flex items-start justify-between gap-2 border-b border-border bg-surface-2 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-text-3 uppercase">{KIND_LABEL[card.kind]}</p>
          <h4 id={`${idBase}-title`} className="font-sans text-sm font-semibold">
            {card.title}
          </h4>
        </div>
        <span className="shrink-0 text-xs text-text-3">
          {card.bars} {card.bars === 1 ? "bar" : "bars"}
        </span>
      </header>
      {card.explanation && <p className="px-3 pt-2 text-sm text-text-2">{card.explanation}</p>}
      {locked.length > 0 && (
        <details className="mx-3 mt-2 rounded-control border border-accent-2/50 px-2 py-1 text-xs text-text-2">
          <summary className="flex cursor-pointer items-center gap-1">
            <Lock aria-hidden className="size-3 shrink-0" />
            Preview: uses {locked.length === 1 ? "a tool" : `${locked.length} tools`} you have not unlocked
            yet
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5 pl-4">
            {locked.map((l) => (
              <li key={l.id}>
                <code className="font-mono">{l.name}</code>
                {l.at ? ` unlocks at ${l.at}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      {showDiff && current !== null && (
        <p id={`${idBase}-diffsum`} className="sr-only">
          Changes against your code: {stats.added} added, {stats.removed} removed.
        </p>
      )}
      {showDiff && current !== null ? (
        <pre
          id={`${idBase}-diff`}
          aria-describedby={`${idBase}-diffsum`}
          className={clsx(
            "m-3 max-h-64 overflow-auto rounded-control border border-border bg-bg p-2 font-mono text-[0.8125rem] leading-snug whitespace-pre-wrap",
            !applicable && "select-none",
          )}
          onCopy={applicable ? undefined : (e) => e.preventDefault()}
        >
          {ops.map((o, i) =>
            o.type === "same" ? (
              <span key={i}>{o.text}</span>
            ) : o.type === "add" ? (
              <ins key={i} className="rounded-sm bg-accent/15 text-accent no-underline">
                {o.text}
              </ins>
            ) : (
              <del key={i} className="rounded-sm bg-issue/12 text-issue">
                {o.text}
              </del>
            ),
          )}
        </pre>
      ) : (
        <pre
          data-testid="card-code"
          className={clsx(
            "m-3 max-h-64 overflow-auto rounded-control border border-border bg-bg p-2 font-mono text-[0.8125rem] leading-snug",
            !applicable && "select-none",
          )}
          onCopy={applicable ? undefined : (e) => e.preventDefault()}
        >
          {card.code}
        </pre>
      )}
      {error && (
        <p role="status" className="px-3 pb-2 text-sm text-issue">
          Preview did not play: {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
        <Button
          size="sm"
          variant={playing ? "primary" : "secondary"}
          loading={loading}
          icon={
            playing ? <Square aria-hidden className="size-3.5" /> : <Play aria-hidden className="size-3.5" />
          }
          onClick={() =>
            void previewCard({
              cardId: card.cardId,
              title: card.title,
              code: card.code,
              bars: card.bars,
              unlocked: ctx.unlocked ?? new Set(),
            })
          }
          aria-label={playing ? `Stop preview of ${card.title}` : `Preview ${card.title}`}
        >
          {playing ? "Stop" : "Preview"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<GitCompare aria-hidden className="size-3.5" />}
          aria-pressed={showDiff}
          aria-controls={showDiff ? `${idBase}-diff` : undefined}
          disabled={current === null}
          title={current === null ? "There is no code on screen to compare with." : undefined}
          onClick={() => setShowDiff((v) => !v)}
        >
          {showDiff ? "Code" : "Diff"}
        </Button>
        {applicable ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              icon={<ClipboardCopy aria-hidden className="size-3.5" />}
              onClick={copy}
            >
              Copy
            </Button>
            {host?.applyCode && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Wand2 aria-hidden className="size-3.5" />}
                loading={applyMut.isPending}
                onClick={apply}
              >
                {done ? "Apply again" : "Apply"}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={<FilePlus2 aria-hidden className="size-3.5" />}
              loading={createSketch.isPending}
              onClick={toNewSketch}
            >
              Apply to new sketch
            </Button>
          </>
        ) : (
          <p
            data-testid="preview-only"
            className="flex basis-full items-center gap-1 pt-0.5 text-xs text-text-3"
          >
            <Lock aria-hidden className="size-3 shrink-0" /> Preview only. {previewOnlyReason(subject)}
          </p>
        )}
      </div>
    </section>
  );
}
