// Ear steps written down in stages or parts (Wave 4; contracts §2.9 bass first, §6.6 X1): a staged chord
// dictation answers the bass under each chord first (degree pad), then each chord's quality (quality pad), then
// the numerals (RN palette), each stage opening when the one before passes at `stagePass` (0.8) or the step is
// revealed; a by-ear transcription in parts is written one track at a time in the Workbench, the bass before the
// chords. Each stage or part is checked on its own (never an attempt: the player grades a narrowed copy), and the
// step's Check grades the whole answer at the end and saves it. The source loops one bar at a time.
import type { ByEarPart, DictationStage, GradeResult } from "@oak/api";
import { Check, CircleDashed, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { StagedDictation } from "../answers/dictation/StagedDictation.tsx";
import {
  currentStage,
  emptyStaged,
  STAGE_TEXT,
  type StagedFeedback,
  type StagedSpec,
  type StagedValue,
  stageComplete,
  stagedResponse,
  stageWidget,
} from "../answers/dictation/stages.ts";
import { AnswerEnvProvider } from "../answers/env.tsx";
import { Button } from "../ui/kit/Button.tsx";
import { CHECK_KEYS, StepFeedback, useCheck } from "./check.tsx";
import { issueLines, shapeOf, partMarks as slotMarks, viewFor } from "./feedback.ts";
import { InlineMd, StepLayout, useStepHost } from "./frame.tsx";
import { type InputRuntime, useAnswerEnvFor } from "./inputs.tsx";
import { sendLessonEvent } from "./public.ts";
import { SourcePlayer } from "./source-player.tsx";
import {
  hasParts,
  partExercise,
  partMarks,
  partPassed,
  partResponse,
  revealedStages,
  type StagedEx,
  type StageMark,
  stageExercise,
  stageFlow,
  stageOrder,
  stagePass,
  stagePassed,
} from "./stages.ts";
import type { ExerciseRendererProps } from "./types.ts";

function MarkIcon({ mark }: { mark: StageMark }) {
  if (mark === "passed" || mark === "revealed")
    return <Check aria-hidden className="size-4 shrink-0 text-accent" />;
  if (mark === "locked") return <Lock aria-hidden className="size-4 shrink-0 text-text-3" />;
  return <CircleDashed aria-hidden className="size-4 shrink-0 text-text-2" />;
}

const MARK_TEXT: Record<StageMark, string> = {
  open: "your turn",
  passed: "done",
  revealed: "shown",
  locked: "opens after the one before",
};

/** A stage's or a part's own verdict: one calm line and, below rung 4, where to listen (never the answer). */
function OwnVerdict({ result, passed, testId }: { result: GradeResult; passed: boolean; testId: string }) {
  const h = useStepHost();
  if (passed)
    return (
      <p role="status" className="text-sm text-text-2" data-testid={testId} data-status="pass">
        Right. The next one is open.
      </p>
    );
  const view = viewFor(result, h.rung, false, h.render);
  // Only lines with words: below rung 2 a finding is just a place, which the summary names as a bar.
  const lines = issueLines(view, shapeOf(h.exercise))
    .filter((l) => l.what || l.fix)
    .slice(0, 3);
  // Below rung 2 a slot's finding has no words yet: the verdict still says where (the bar), never what.
  const bars = [
    ...new Set(
      view.issues
        .filter((i) => i.severity === "error" || i.severity === "warn")
        .map((i) => i.where.bar)
        .filter((b): b is number => b !== undefined),
    ),
  ].sort((a, b) => a - b);
  const where = lines.length === 0 && bars.length > 0 ? barList(bars) : null;
  return (
    <div role="status" className="text-sm" data-testid={testId} data-status={result.status}>
      <p>
        {result.status === "error"
          ? "That could not be checked yet."
          : where
            ? `${Math.round(result.score * 100)}% of it is right. Loop ${where} and listen again.`
            : `${Math.round(result.score * 100)}% of it is right. Loop a bar and listen again.`}
      </p>
      {lines.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5 text-text-2">
          {lines.map((l) => (
            <li key={l.key}>
              {l.where ? `${l.where}: ` : ""}
              {l.what}
              {l.fix ? ` → ${l.fix}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "bar 3", "bars 2 and 4". */
function barList(bars: readonly number[]): string {
  if (bars.length === 1) return `bar ${bars[0]}`;
  return `bars ${bars.slice(0, -1).join(", ")} and ${bars[bars.length - 1]}`;
}

// --- staged chord dictation ------------------------------------------------------------------------

/** Where a staged step keeps its found stages for a reload: per lesson, step and series; null in a checkpoint. */
export function stagedMemoKey(
  mode: string,
  lessonId: string,
  stepId: string,
  seriesNo: number,
): string | null {
  return mode === "lesson" ? `oak.staged.v1:${lessonId}:${stepId}:${seriesNo}` : null;
}

/** The answers and the stages found so far, from this tab's sessionStorage (null when absent or unreadable). */
export function readStagedMemo(
  key: string | null,
  stages: readonly DictationStage[],
): { value: StagedValue; found: DictationStage[] } | null {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const m = JSON.parse(raw) as { value?: StagedValue; found?: string[] };
    const found = (m.found ?? []).filter((st): st is DictationStage => stages.includes(st as DictationStage));
    return { value: m.value ?? {}, found };
  } catch {
    return null;
  }
}

function writeStagedMemo(key: string | null, value: StagedValue, found: readonly DictationStage[]): void {
  if (!key) return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ value, found }));
  } catch {
    // Storage blocked: a reload starts the stages again, as before.
  }
}

export function StagedRenderer(props: ExerciseRendererProps) {
  const h = useStepHost();
  const ex = h.exercise as StagedEx;
  const rt = useRef<InputRuntime>({ tapStart: null, plays: 0 }).current;
  const env = useAnswerEnvFor(ex, rt, h.trial, null);
  // A checkpoint shows no verdict per item (contracts §7.6): every stage is answered at once there.
  const together = h.mode === "checkpoint" || stageFlow(ex) === "together";
  const spec: StagedSpec = {
    stages: stageOrder(ex),
    stageAnswers: ex.stageAnswers,
    flow: together ? "together" : "sequential",
    pass: stagePass(ex),
  };
  // A reload keeps the stages already found (and their answers) for this series: they are not attempts and earn
  // nothing, so this is a convenience in the viewer's own tab (sessionStorage), never progress.
  const memo = stagedMemoKey(h.mode, h.lesson.id, h.step.id, h.seriesNo);
  const [value, setValue] = useState<StagedValue>(
    () => readStagedMemo(memo, spec.stages)?.value ?? emptyStaged(spec),
  );
  const [feedback, setFeedback] = useState<StagedFeedback>(() => {
    const found = readStagedMemo(memo, spec.stages)?.found ?? [];
    return Object.fromEntries(found.map((st) => [st, { state: "correct" } as const]));
  });
  useEffect(() => {
    const found = spec.stages.filter((st) => feedback[st]?.state === "correct");
    writeStagedMemo(memo, value, found);
  });
  const [own, setOwn] = useState<{ stage: DictationStage; result: GradeResult } | null>(null);
  const last = spec.stages[spec.stages.length - 1] ?? null;
  const ready = spec.stages.every((s) => stageComplete(spec, s, value));
  const { check } = useCheck(props, () => (ready ? stagedResponse(spec, value) : null), rt);
  // A step passed before (a revisit) or revealed shows every stage done.
  // A reveal (rung 4: "Show me", the hint ladder's last rung, the tutor panel's Reveal) shows each stage not yet
  // right with its answer, and every stage is open.
  // (The host counts a reveal as `passed` for display; the step's own state says whether it was really passed.)
  const reallyPassed = h.state?.passed === true || h.result?.status === "pass";
  const reveal = h.rung >= 4 && !reallyPassed ? revealedStages(ex) : null;
  const shown: StagedFeedback = reveal
    ? Object.fromEntries(
        spec.stages.map((s) => [
          s,
          feedback[s]?.state === "correct"
            ? feedback[s]
            : ({ state: "revealed", correct: reveal[s] ?? [] } as const),
        ]),
      )
    : h.passed || h.review
      ? Object.fromEntries(spec.stages.map((s) => [s, { state: "correct" } as const]))
      : feedback;
  const current = currentStage(spec, shown);
  const checkStage = async (stage: DictationStage) => {
    if (!stageComplete(spec, stage, value) || h.checking) return;
    // The last stage, a `together` flow and a checkpoint check everything: graded, saved, the step's verdict.
    if (together || stage === last) {
      setFeedback((f) => ({ ...f, [stage]: { state: "pending" } }));
      await check();
      setFeedback((f) => {
        const { [stage]: _pending, ...rest } = f;
        return rest;
      });
      return;
    }
    setFeedback((f) => ({ ...f, [stage]: { state: "pending" } }));
    const r = await h.gradeQuiet(stagedResponse(spec, value, stage), stageExercise(ex, stage));
    if (!r) {
      setFeedback((f) => ({ ...f, [stage]: { state: "idle" } }));
      return;
    }
    setOwn({ stage, result: r });
    // A stage that missed marks the chords it missed on its own widget (where, never what).
    setFeedback((f) => ({
      ...f,
      [stage]: stagePassed(ex, r)
        ? { state: "correct" }
        : { state: "wrong", marks: slotMarks(r, stageWidget(spec, stage)) },
    }));
  };
  // The step's verdict marks the last stage (or, `together`, every stage) right once it passes.
  const final = h.result?.status === "pass";
  const fb: StagedFeedback =
    final && !h.review
      ? {
          ...shown,
          ...Object.fromEntries((together ? spec.stages : [last]).map((s) => [s, { state: "correct" }])),
        }
      : shown;
  const stageRef = useRef(checkStage);
  stageRef.current = checkStage;
  useEffect(() => {
    h.setCheck(() => {
      const at = currentStage(spec, fb) ?? last;
      if (at) void stageRef.current(at);
    });
    return () => h.setCheck(null);
  });
  const stim = ex.stimulus;
  const source =
    stim.src === "code"
      ? { code: stim.code, bars: stim.bars }
      : h.trial
        ? { code: h.trial.code, bars: Number(h.trial.params.bars ?? 4) }
        : null;
  return (
    <StepLayout
      answer={
        <AnswerEnvProvider value={env}>
          <div className="flex flex-col gap-4" data-testid="staged" data-flow={spec.flow}>
            {source ? (
              <SourcePlayer
                code={source.code}
                bars={source.bars}
                rates={[1, 0.75]}
                noun="chords"
                onPlay={() => {
                  rt.plays += 1;
                }}
                testId="stage-source"
              />
            ) : null}
            <StagedDictation
              spec={spec}
              value={value}
              onChange={setValue}
              onCheckStage={(s) => void checkStage(s)}
              feedback={fb}
              disabled={h.checking || h.review}
              label="Your answer, stage by stage"
              idBase={`l-${h.step.id.toLowerCase()}-${h.seriesNo}-staged`}
              autoFocus
              rung={h.rung}
              // "Show me" after a stage missed: the step's own reveal (rung 4, as the hint ladder's last rung and
              // the tutor panel's Reveal), which shows every stage and earns no evidence. Never in a checkpoint.
              // Offered once the server allows the reveal (enough checks of the whole step, contracts §10.5).
              {...(h.mode !== "checkpoint" && h.state?.revealAvailable
                ? { onReveal: () => void sendLessonEvent({ type: "HINT", reveal: true }) }
                : {})}
            />
            {own && current === own.stage ? (
              <OwnVerdict result={own.result} passed={stagePassed(ex, own.result)} testId="stage-verdict" />
            ) : null}
            <StepFeedback detail />
          </div>
        </AnswerEnvProvider>
      }
      actions={
        // The stage that is open, from the footer too: on a short screen its own button is below the fold.
        current && !h.review ? (
          <Button
            variant="primary"
            onClick={() => void checkStage(current)}
            disabled={!stageComplete(spec, current, value) || h.checking || fb[current]?.state === "pending"}
            loading={h.checking}
            data-testid="check-stage"
            title={`Check (${CHECK_KEYS})`}
          >
            {h.mode === "checkpoint" ? "Save answer" : `Check the ${STAGE_TEXT[current].title.toLowerCase()}`}
          </Button>
        ) : null
      }
    />
  );
}

// --- by-ear transcription in parts ---------------------------------------------------------------

/**
 * The parts of a by-ear step (beside the Workbench where the code is written): which track is asked for now,
 * a check of that part alone, and whether the step's own Check is open yet (every part passed or revealed).
 */
export function ByEarParts({
  code,
  onState,
}: {
  code: string;
  /** Whether the step's Check is open (every part passed or revealed) and which track is asked for now. */
  onState(s: { ready: boolean; track: string | null }): void;
}) {
  const h = useStepHost();
  const ex = h.exercise;
  const [passed, setPassed] = useState<ReadonlySet<number>>(new Set());
  const [own, setOwn] = useState<{ i: number; result: GradeResult } | null>(null);
  const [busy, setBusy] = useState(false);
  const parts: ByEarPart[] = hasParts(ex) ? ex.byEar.parts : [];
  const all = parts.map((_, i) => i);
  const marks = partMarks(parts, h.passed || h.review ? new Set(all) : passed, h.rung);
  const cur = marks.indexOf("open");
  const ready = cur < 0;
  const track = parts[cur]?.track ?? null;
  useEffect(() => onState({ ready, track }), [ready, track, onState]);
  if (!hasParts(ex)) return null;
  const checkPart = async () => {
    const part = parts[cur];
    if (!part || busy) return;
    setBusy(true);
    try {
      const r = await h.gradeQuiet(partResponse(code, part), partExercise(ex, part));
      if (!r) return;
      setOwn({ i: cur, result: r });
      if (partPassed(part, r)) setPassed((p) => new Set([...p, cur]));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Parts, one at a time" className="flex flex-col gap-2" data-testid="by-ear-parts">
      <p className="text-sm font-medium">One part at a time</p>
      <ol className="flex flex-col gap-2">
        {parts.map((part, i) => {
          const mark = marks[i] ?? "locked";
          return (
            <li
              key={`${part.track}-${i}`}
              className={`rounded-control border px-3 py-2 ${mark === "open" ? "border-accent" : "border-border"}`}
              data-part-track={part.track}
              data-mark={mark}
            >
              <p className="flex items-center gap-2 text-sm">
                <MarkIcon mark={mark} />
                <span>
                  <InlineMd text={part.label} />{" "}
                  <span className="text-text-3">
                    (track <code className="font-mono">{part.track}:</code>, {MARK_TEXT[mark]})
                  </span>
                </span>
              </p>
              {own && own.i === i ? (
                <div className="mt-1">
                  <OwnVerdict
                    result={own.result}
                    passed={partPassed(part, own.result)}
                    testId="part-verdict"
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {cur >= 0 && (
        <Button
          variant="secondary"
          onClick={() => void checkPart()}
          loading={busy}
          disabled={busy || h.review}
          data-testid="check-part"
        >
          Check this part
        </Button>
      )}
    </section>
  );
}
