// Stage D panels of the trial frame (ux §4.5 "bass-first harmonic dictation"): the step track of a staged chord
// dictation (bass → quality → numerals) with what is settled so far, the per-chord quality row (one quality
// pad of the answers registry per chord), and "the answer in context" — what each chord was, bar by bar, with
// the labels the chord lenses allow. Pure views: the machine and the runner decide everything.
import type { ChordQuality, Trial } from "@oak/api";
import { clsx } from "clsx";
import { Check, Eye } from "lucide-react";
import { useRef } from "react";
import { qualityLabel } from "../answers/keys.ts";
import type { AnswerFeedback, AnswerSpecOf } from "../answers/types.ts";
import { drillWidgetFor } from "./answer-widget.tsx";
import { type ChordStep, type SlotLabel, STEP_TITLES, stepExpected } from "./harmony.ts";
import type { StepsState } from "./machine.ts";

/** The three steps, the open one marked, each settled one with how (found, or shown). */
export function StepTrack({
  steps,
  done,
  lastRight = true,
}: {
  steps: StepsState;
  done: boolean;
  /** Once answered: whether the last step (the trial's own answer) was right. */
  lastRight?: boolean;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Steps" data-testid="step-track">
      {steps.order.map((step, i) => {
        const r = steps.results[step];
        const last = i === steps.order.length - 1;
        const settled = i < steps.at || (done && last);
        const missed = done && last && !lastRight;
        const open = !done && i === steps.at;
        return (
          <li
            key={step}
            aria-current={open ? "step" : undefined}
            data-step={step}
            data-state={
              missed ? "missed" : settled ? (r?.revealed ? "shown" : "found") : open ? "open" : "later"
            }
            className={clsx(
              "flex h-7 items-center gap-1.5 rounded-control border px-2.5 text-sm",
              open && "border-accent bg-lane-in font-medium text-text",
              settled && !missed && "border-border bg-surface-2 text-text-2",
              missed && "border-accent-2 text-text-2",
              !open && !settled && "border-dashed border-border text-text-3",
            )}
          >
            <span className="tabular-nums">{i + 1}</span>
            <span>{STEP_TITLES[step as ChordStep]}</span>
            {settled && !missed && !r?.revealed && (
              <Check aria-label="found" className="size-3.5 text-accent" />
            )}
            {missed && <span className="sr-only">not this time</span>}
            {settled && r?.revealed && <Eye aria-label="shown" className="size-3.5 text-text-3" />}
          </li>
        );
      })}
    </ol>
  );
}

const degreeText = (d: string): string => d.replace(/^b/, "♭").replace(/^#/, "♯");

/**
 * What the earlier steps settled, chord by chord: the right bass degrees and qualities (the next step builds on
 * what is true, whether it was found or shown).
 */
export function StepsSoFar({ trial, steps }: { trial: Trial; steps: StepsState }) {
  const settled = steps.order.slice(0, steps.at).filter((s) => s !== "rn");
  if (settled.length === 0) return null;
  const bass = settled.includes("bass") ? (stepExpected(trial, "bass")?.degrees ?? []) : [];
  const quality = settled.includes("quality") ? (stepExpected(trial, "quality")?.qualities ?? []) : [];
  const n = Math.max(bass.length, quality.length);
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Settled so far" data-testid="steps-so-far">
      {Array.from({ length: n }, (_, i) => (
        <li
          key={i}
          className="flex min-w-24 flex-col rounded-control border border-border bg-surface-2 px-2.5 py-1.5 text-sm"
        >
          <span className="text-xs text-text-3">Chord {i + 1}</span>
          <span className="font-medium tabular-nums">
            {bass[i] ? `Bass ${degreeText(bass[i] as string)}` : ""}
            {bass[i] && quality[i] ? " · " : ""}
            {quality[i] ? qualityLabel(quality[i] as ChordQuality).long : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The quality step: one quality pad per chord (the answers registry's widget), Tab or a pick moving to the next
 * chord. The value is one quality per chord, empty slots as `undefined`.
 */
export function QualityRow({
  spec,
  count,
  value,
  onChange,
  onSubmit,
  disabled,
  marks,
  captions,
  idBase,
  autoFocus,
}: {
  spec: AnswerSpecOf<"quality-pad">;
  count: number;
  value: readonly (ChordQuality | undefined)[];
  onChange(next: (ChordQuality | undefined)[]): void;
  onSubmit(): void;
  disabled: boolean;
  /** Per chord, after a check: right or not. */
  marks: readonly boolean[] | null;
  /** One caption per chord ("Chord 1 · bass 1"). */
  captions: readonly string[];
  idBase: string;
  autoFocus: boolean;
}) {
  const Pad = drillWidgetFor(spec);
  const root = useRef<HTMLDivElement>(null);
  if (!Pad) return null;
  const focusPad = (i: number) => {
    const pads = root.current?.querySelectorAll<HTMLElement>("[data-quality-slot]");
    const pad = pads?.[i];
    const pick =
      pad?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ??
      pad?.querySelector<HTMLButtonElement>("button");
    pick?.focus();
  };
  return (
    // Two chords a row; the pads' key hints show once (under the first), not under every chord.
    <div
      ref={root}
      className="grid gap-x-6 gap-y-3 sm:grid-cols-2 [&>[data-quality-slot]:not(:first-child)_[data-answer]>div:last-child]:hidden"
      data-testid="quality-row"
    >
      {Array.from({ length: count }, (_, i) => {
        const q = value[i];
        const feedback: AnswerFeedback =
          marks && marks[i] !== undefined
            ? marks[i]
              ? { state: "correct" }
              : { state: "wrong", marks: [{ part: 0, ok: false }] }
            : { state: "idle" };
        return (
          <div key={i} data-quality-slot={i} className="flex min-w-0 flex-col gap-1">
            <span aria-hidden className="text-sm font-medium text-text-2">
              {captions[i] ?? `Chord ${i + 1}`}
            </span>
            <Pad
              spec={spec as never}
              value={(q ? [q] : []) as never}
              onChange={(v) => {
                const next = Array.from({ length: count }, (_, k) => value[k]);
                next[i] = (v as ChordQuality[])[0];
                onChange(next);
                // A pick moves on to the next chord that has none yet.
                const after = next.findIndex((x, k) => k > i && x === undefined);
                if (after >= 0) requestAnimationFrame(() => focusPad(after));
              }}
              onSubmit={onSubmit}
              disabled={disabled}
              feedback={feedback}
              autoFocus={autoFocus && i === 0}
              label={`${captions[i] ?? `Chord ${i + 1}`}: which quality?`}
              idBase={`${idBase}-q${i}`}
            />
          </div>
        );
      })}
    </div>
  );
}

/** "The answer in context": what each chord was, bar by bar (bass degree always; symbols and numerals by lens). */
export function ChordStrip({
  labels,
  title,
  yours,
}: {
  labels: readonly SlotLabel[];
  title: string;
  /** The learner's numerals, per chord, where they differ ("yours IV"); null where they matched. */
  yours?: readonly (string | null)[];
}) {
  if (labels.length === 0) return null;
  return (
    <section aria-label={title} data-testid="answer-in-context" className="flex flex-col gap-1.5">
      <h3 className="text-sm font-medium text-text-2">{title}</h3>
      <ol className="flex flex-wrap gap-2">
        {labels.map((l, i) => (
          <li
            key={i}
            className={clsx(
              "flex min-w-20 flex-col items-start rounded-control border bg-surface px-2.5 py-1.5",
              yours?.[i] ? "border-accent-2" : "border-border",
            )}
          >
            <span className="text-xs text-text-3">{labels.length > 1 ? `Bar ${l.bar}` : "The chord"}</span>
            <span className="font-medium tabular-nums">
              {[l.rn, l.symbol].filter(Boolean).join(" · ") || `Bass ${l.degree}`}
            </span>
            {(l.rn || l.symbol) && <span className="text-xs text-text-2">Bass {l.degree}</span>}
            {yours?.[i] && (
              <span className="text-xs text-text-2" data-testid="yours">
                Yours: {yours[i]}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
