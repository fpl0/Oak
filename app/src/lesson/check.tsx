// The check flow every renderer shares (lesson and checkpoint): grade in the browser through the host, report
// with `onCheck`, the Check button (Mod+Shift+Enter; "Save answer" in a checkpoint) and the step's own feedback
// line, redacted to the rung. A by-ear step adds where its first difference is.
import type { AttemptResponse, Exercise } from "@oak/api";
import { useEffect, useRef, useState } from "react";
import { takeProblem } from "../answers/sing.ts";
import type { AnswerFeedback } from "../answers/types.ts";
import { IS_MAC } from "../ui/keys/KeymapProvider.tsx";
import { Button } from "../ui/kit/Button.tsx";
import { Kbd } from "../ui/kit/basics.tsx";
import { issueLines, shapeOf, summaryOf, viewFor } from "./feedback.ts";
import { InlineMd, useStepHost } from "./frame.tsx";
import type { InputRuntime } from "./inputs.tsx";
import { firstWrongBar, isByEar } from "./rules.ts";
import type { ExerciseRendererProps } from "./types.ts";

export const CHECK_KEYS = IS_MAC ? "⌘⇧↵" : "Ctrl+Shift+Enter";

export function extraReplays(ex: Exercise, rt: InputRuntime): number {
  const replays = "cue" in ex && ex.cue ? ex.cue.replays : -1;
  return replays < 0 ? 0 : Math.max(0, rt.plays - 1 - replays);
}

/** In a checkpoint the widgets show no verdict, only that a check runs. */
export function quietIn(mode: "lesson" | "checkpoint", checking: boolean): AnswerFeedback | null {
  if (mode !== "checkpoint") return null;
  return checking ? { state: "pending" } : { state: "idle" };
}

/** The check flow every renderer shares: grade in the browser, then report to the host. */
export function useCheck(
  props: ExerciseRendererProps,
  build: () => AttemptResponse | null,
  rt: InputRuntime,
) {
  const h = useStepHost();
  const [checked, setChecked] = useState(false);
  const run = async () => {
    if (h.checking || h.review) return;
    const response = build();
    if (!response) return;
    const result = await h.grade(response);
    setChecked(true);
    if (result) props.onCheck({ response, result, extraReplays: extraReplays(props.exercise, rt) });
  };
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    h.setCheck(() => void latest.current());
    return () => h.setCheck(null);
  }, [h.setCheck]);
  return { check: run, checked };
}

export function CheckButton({
  onClick,
  disabled,
  label: wanted = "Check",
  reason = null,
}: {
  onClick(): void;
  disabled: boolean;
  label?: string;
  /** Why the button is not open yet ("Bar 3 is still empty."): shown above it and read with it (d4). */
  reason?: string | null;
}) {
  const h = useStepHost();
  const label = h.mode === "checkpoint" ? "Save answer" : wanted;
  const off = disabled || h.review;
  const why = off && !h.review && !h.checking ? reason : null;
  const whyId = `${h.mode}-${h.step.id}-check-why`;
  return (
    <>
      {why ? (
        <p id={whyId} className="basis-full text-right text-sm text-text-2" data-testid="check-reason">
          {why}
        </p>
      ) : null}
      <Button
        variant={h.passed ? "secondary" : "primary"}
        onClick={onClick}
        disabled={off}
        loading={h.checking}
        data-testid="check"
        title={why ?? `${label} (${CHECK_KEYS})`}
        {...(why ? { "aria-describedby": whyId } : {})}
      >
        {label} <Kbd tone={h.passed ? "default" : "inverse"}>{CHECK_KEYS}</Kbd>
      </Button>
    </>
  );
}

/** The step's own feedback line(s), redacted to the rung; announced politely. */
export function StepFeedback({ detail }: { detail: boolean }) {
  const h = useStepHost();
  const r = h.result;
  // A new verdict is brought on screen: a tall step (a sung take's lane, a staff) left it below the fold of the
  // step column, so Check looked as if it did nothing. Instant, never smooth (reduced motion).
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    if (r) box.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [r]);
  // A checkpoint shows no verdict per item (contracts §7.6): the result screen does.
  if (h.mode === "checkpoint")
    return (
      <p
        aria-live="polite"
        className="text-sm text-text-2"
        data-testid="step-feedback"
        data-status={r ? "saved" : "open"}
      >
        {r ? "Answer saved. You can change it and save again, or go on." : ""}
      </p>
    );
  if (!r) return <div aria-live="polite" className="sr-only" />;
  const view = viewFor(r, h.rung, h.passed, h.render);
  // A take Oak could not hear (no voice, bleed, no taps) is said once by the summary; its diagnostic as a
  // "Somewhere in the piece: …" line would only repeat it in grader words.
  const unheard = r.status === "error" && r.diagnostics.some((d) => /^(sing|tap)\./.test(d.id as string));
  const shape = shapeOf(h.exercise);
  // What the pitch tracker made of a sung take it could not grade cleanly (no voice, noise, blips, clipping).
  const take = takeProblem(r.diagnostics as { id: string; params?: Record<string, unknown> }[]);
  const summary = r.status === "ungraded" ? "Noted." : summaryOf(view, r, shape);
  // A line the summary already says (a locked tool leads the verdict) is not said twice.
  const lines =
    (detail || r.status === "error") && !unheard
      ? issueLines(view, shape).filter((l) => !(l.what === summary && !l.fix))
      : [];
  // A by-ear transcription says where to listen again: the first bar that differs (wave3.md §10).
  const firstBar = isByEar(h.exercise) ? firstWrongBar(r) : null;
  const tone =
    r.status === "pass"
      ? "border-accent bg-lane-in"
      : r.status === "error"
        ? "border-accent-2"
        : "border-issue/60";
  return (
    <section
      ref={box}
      aria-live="polite"
      aria-label="Check result"
      className={`rounded-control border-l-2 px-3 py-2 ${tone}`}
      data-testid="step-feedback"
      data-status={r.status}
      data-take={take?.kind}
    >
      <p className="font-medium" data-testid="step-feedback-summary">
        <InlineMd text={summary} />
      </p>
      {firstBar !== null && (
        <p className="mt-1 text-sm" data-testid="first-wrong-bar" data-bar={firstBar}>
          The first wrong note is in bar {firstBar}. Loop that bar of the tune and listen again.
        </p>
      )}
      {lines.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {lines.map((l) => (
            <li key={l.key} data-testid="feedback-line">
              {l.where && <span className="text-text-2">{l.where}</span>}
              {l.what && (
                <span>
                  {l.where ? ": " : ""}
                  <InlineMd text={l.what} />
                </span>
              )}
              {l.fix && (
                <span className="text-accent">
                  {" → "}
                  <InlineMd text={l.fix} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
