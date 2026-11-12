// The drill runner (ux §4.1 TrialFrame): one set from the first trial to its summary. The machine
// (machine.ts) decides; runtime.ts plays, captures and talks to the server; this file draws the frame —
// header (family, level, trial n of N, results so far), the stimulus panel, the answer surface, the feedback
// line and the key-labelled controls. Keyboard-first: digits answer inside the pad, Space or R replays, C
// replays the cadence, Enter checks or moves on, A plays the answer, P compares, Shift+S skips a sung part.
import {
  type Answer,
  type DrillFinish,
  type FamilyDef,
  type FamilyId,
  type KeySpec,
  OakApiError,
  type Trial,
} from "@oak/api";
import { labelPitch } from "@oak/theory";
import { useMachine } from "@xstate/react";
import { clsx } from "clsx";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AnswerEnvProvider } from "../answers/env.tsx";
import { emptyValue, isComplete } from "../answers/response.ts";
import { type AnswerFeedback, type AnswerValue, AUTO_SUBMIT_KINDS } from "../answers/types.ts";
import { useLenses } from "../lib/lenses.ts";
import { useDrillSession } from "../lib/queries.ts";
import { useRunnerView } from "../session/hooks.ts";
import { clearSubject, patchSubject, setSubject } from "../tutor/context.ts";
import { keyScope, useHotkeys } from "../ui/keys/KeymapProvider.tsx";
import type { Binding } from "../ui/keys/keymap.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Card, Chip, Kbd } from "../ui/kit/basics.tsx";
import { Callout } from "../ui/kit/Controls.tsx";
import { ErrorState, LoadingState } from "../ui/kit/QueryState.tsx";
import { RecheckHint } from "../voice/panels.tsx";
import { reportTake } from "../voice/recheck.ts";
import { useVoiceSync } from "../voice/sync.ts";
import { useVoice } from "../voice/use-voice.ts";
import { answerWidgetLabel } from "./answer-label.ts";
import { drillWidgetFor } from "./answer-widget.tsx";
import { levelMoveText, promptOf, stageText } from "./copy.ts";
import { DictationTools, isDictation, mineOf } from "./DictationTools.tsx";
import { clearInflight, inflightKey, loadInflight, resumeFromServer } from "./inflight.ts";
import { LensSwitches } from "./LensSwitches.tsx";
import { type DrillPurpose, drillMachine, type ResumeState } from "./machine.ts";
import {
  answerOf,
  expectedText,
  expectedValueOf,
  type Surface,
  surfaceOf,
  type TrialOutcome,
  wrongMarks,
} from "./model.ts";
import {
  answerPlan,
  comparePlan,
  cuePlan,
  isFetTrial,
  keyOfTrial,
  minePlan,
  resolutionOf,
  stagingOf,
  targetMidisOf,
} from "./plans.ts";
import { auditionCode, drillDeps, drillImplementations } from "./runtime.ts";
import { SetSummary } from "./SetSummary.tsx";
import { SingPanel } from "./SingPanel.tsx";
import { expectedStaffValue, isStaffTrial, meterOf, staffAnswer } from "./staff.ts";
import { TapPanel } from "./TapPanel.tsx";
import { KeyHighlight, TrialStaff } from "./TrialVisual.tsx";
import type { DrillData } from "./use-drill-data.ts";
import { usePlanPlayer } from "./use-plan-player.ts";

export interface SetResult {
  drillSessionId: string | null;
  meanCredit: number | null;
  finish: DrillFinish | null;
  outcomes: TrialOutcome[];
  /** The level of the set's last trial (free practice continues from there). */
  lastLevel: number | null;
}

export interface DrillRunnerProps {
  data: DrillData;
  purpose: DrillPurpose;
  familyIds: FamilyId[];
  /** Shown in the header: the family's title, or the composite's. */
  title: string;
  warmupItemId?: string | null;
  sessionId?: string | null;
  /** Free practice: the level the staircase starts at. */
  practiceLevel?: number | null;
  /** Warm-up: open with an easy trial. */
  easyFirst?: boolean;
  /** FET sets: sung resolutions in this set (3 in the first set of the day, else 2). */
  sungResolutions?: number;
  /** "Set 2 of 4" inside a warm-up. */
  position?: { index: number; total: number } | null;
  continueLabel: string;
  onContinue(result: SetResult): void;
  /** More summary actions (free practice: "Another set"). */
  extraActions?: (result: SetResult) => ReactNode;
  /** Invalidates server state after the set (families, due, map). */
  onFinished?(finish: DrillFinish): void;
}

const INSTRUMENT_DRUMS = new Set(["bd", "sd", "hh", "oh", "rim", "cp", "cr", "rd", "lt", "mt", "ht", "cb"]);

function instrumentsOf(trial: Trial<unknown>): string[] {
  const out = new Set<string>();
  for (const e of trial.events) if (e.midi !== null && e.s && !INSTRUMENT_DRUMS.has(e.s)) out.add(e.s);
  return [...out];
}

function keyText(trial: Trial<unknown>): string | null {
  const k = keyOfTrial(trial);
  if (!k) return null;
  return `${k.tonic.replace(/b$/, "♭").replace(/#$/, "♯")} ${k.mode}`;
}

/**
 * The runner, after it knows whether a set is in flight: this browser's pointer is read back from the server
 * (`drills.get`), which holds every trial answered so far, so a reload continues from the server's record.
 */
export function DrillRunner(props: DrillRunnerProps) {
  // Quiet mode switched in another tab reaches this set at once (the QUIET event below follows voice.get).
  useVoiceSync();
  const key = inflightKey({
    warmupItemId: props.warmupItemId ?? null,
    familyIds: props.familyIds,
    purpose: props.purpose,
  });
  const [local] = useState(() => loadInflight(key));
  const detail = useDrillSession(local?.session.id ?? null);
  // Decided once: later renders (a refetch of the family data) must never touch the set that runs by then.
  const [settled, setSettled] = useState<{ resume: ResumeState | null } | null>(() =>
    local ? null : { resume: null },
  );
  useEffect(() => {
    if (settled || !local || detail.isPending) return;
    const notFound = detail.error instanceof OakApiError && detail.error.status === 404;
    const resume = resumeFromServer(local, detail.data ?? (notFound ? null : undefined));
    if (!resume) clearInflight(key);
    setSettled({ resume });
  }, [settled, local, detail.isPending, detail.error, detail.data, key]);
  if (!settled)
    return (
      <Card className="p-6">
        <LoadingState rows={3} label="Picking up the set" />
      </Card>
    );
  return <RunnerCore {...props} inflight={key} resume={settled.resume} />;
}

function RunnerCore(props: DrillRunnerProps & { inflight: string; resume: ResumeState | null }) {
  const { data, purpose, familyIds } = props;
  const key = props.inflight;
  const [machine] = useState(() =>
    drillMachine.provide(
      drillImplementations({
        registry: data.registry,
        defs: data.defs,
        states: data.states,
        profile: data.profile,
        easyFirst: props.easyFirst ?? false,
        sungResolutions: props.sungResolutions ?? 2,
        practiceLevel: props.practiceLevel ?? null,
        inflightKey: key,
        ...(props.onFinished ? { onFinished: props.onFinished } : {}),
      }),
    ),
  );
  const [resume] = useState(() => props.resume);
  const [snap, send] = useMachine(machine, {
    input: {
      purpose,
      familyIds,
      warmupItemId: props.warmupItemId ?? null,
      sessionId: props.sessionId ?? null,
      quiet: data.profile.quiet,
      tolCents: data.profile.singTolCents,
      resume,
      deps: drillDeps({ registry: data.registry, profile: data.profile }),
    },
  });
  const ctx = snap.context;
  // Quiet mode can change mid-set (the mic chip, Settings): the machine follows, and the runner reads Quiet mode
  // from the machine so what is shown and what is listened for always agree.
  const liveQuiet = data.profile.quiet;
  useEffect(() => {
    send({ type: "QUIET", quiet: liveQuiet });
  }, [liveQuiet, send]);
  const thread = { subjectKind: "drill" as const, subjectId: familyIds.join("+") };
  const region = useRef<HTMLDivElement>(null);

  // The tutor never sees a trial in progress (contracts §10.4); it opens again at the summary.
  useEffect(() => {
    setSubject({ thread, title: props.title, tutorOpen: false });
    return () => clearSubject(thread);
  }, []);
  const atSummary = snap.matches("summary");
  useEffect(() => {
    patchSubject(thread, { tutorOpen: atSummary });
  }, [atSummary]);

  if (snap.matches("loading"))
    return (
      <Card className="p-6">
        <LoadingState rows={3} label="Preparing the set" />
        <p className="mt-2 text-sm text-text-3">Loading sounds for this set…</p>
      </Card>
    );
  if (snap.matches("failed") || snap.matches("finishFailed"))
    return (
      <Card className="p-6">
        <ErrorState
          error={new Error(ctx.error ?? "The set could not continue.")}
          onRetry={() => send({ type: "RETRY" })}
        />
        {snap.matches("finishFailed") && (
          <p className="mt-2 text-center text-sm text-text-3">
            Your answers are kept; retrying sends them again.
          </p>
        )}
      </Card>
    );
  if (atSummary) {
    const def = data.defs.get(familyIds[0] as string) as FamilyDef;
    const result: SetResult = {
      drillSessionId: ctx.session?.id ?? null,
      meanCredit: ctx.finish?.meanCredit ?? null,
      finish: ctx.finish,
      outcomes: ctx.outcomes,
      lastLevel: ctx.trials[ctx.trials.length - 1]?.level ?? null,
    };
    return (
      <SetSummary
        data={data}
        def={def}
        title={props.title}
        familyIds={familyIds}
        context={ctx}
        purpose={purpose}
        primary={
          <Button variant="primary" size="lg" autoFocus onClick={() => props.onContinue(result)}>
            {props.continueLabel} <Kbd tone="inverse">Enter</Kbd>
          </Button>
        }
        extra={props.extraActions?.(result)}
      />
    );
  }
  if (!ctx.current) return <LoadingState rows={2} />;
  return (
    <div
      ref={region}
      tabIndex={-1}
      {...keyScope("answer-pad")}
      className="outline-none"
      data-testid="drill-runner"
    >
      <TrialView key={ctx.index} props={props} snap={snap} send={send} region={region} />
    </div>
  );
}

const DIALOG_SELECTOR = 'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"]';
const DIALOG_GRACE_MS = 500;

/** A dialog is on screen (a modal, the shortcut sheet, a popover dialog): focus is its business. */
function openDialog(): boolean {
  for (const el of document.querySelectorAll(DIALOG_SELECTOR)) {
    if (el instanceof HTMLDialogElement && !el.open) continue;
    if (el instanceof HTMLElement && el.getClientRects().length > 0) return true;
  }
  return false;
}

type Snap = ReturnType<typeof useMachine<typeof drillMachine>>[0];
type Send = ReturnType<typeof useMachine<typeof drillMachine>>[1];

function TrialView({
  props,
  snap,
  send,
  region,
}: {
  props: DrillRunnerProps;
  snap: Snap;
  send: Send;
  region: React.RefObject<HTMLDivElement | null>;
}) {
  const { data } = props;
  const lenses = useLenses();
  const player = usePlanPlayer();
  const voice = useVoice();
  const ctx = snap.context;
  const quietNow = ctx.input.quiet;
  const trial = (ctx.current as NonNullable<typeof ctx.current>).trial;
  const def = data.defs.get(trial.family) as FamilyDef;
  // Pads show syllables when the solfège lens is shown (wave3.md §4.3); the degree number is always printed.
  const solfegeShown = lenses.shown.solfege;
  const surface: Surface = surfaceOf(trial, def, { solfege: solfegeShown ? "syllables" : "numbers" });
  const spec = surface.kind === "widget" ? surface.spec : null;
  const [value, setValue] = useState<AnswerValue | null>(() => (spec ? emptyValue(spec as never) : null));
  const outcome = ctx.outcomes[ctx.index];
  const inFeedback = snap.matches("feedback") || snap.matches("resolution");
  const presenting = snap.matches({ trial: "presenting" }) || snap.matches({ trial: "cueing" });
  const answering = snap.matches({ trial: "answering" });
  const auditioning = snap.matches({ feedback: "auditioning" });
  const resolving = snap.matches({ resolution: "running" });
  const imagining = snap.matches({ resolution: "imagining" });
  const fet = isFetTrial(trial);
  const dictation = isDictation(trial, def.generator);
  // A staff answer is graded (and played back as "mine") as the code it spells (staff.ts).
  const staffTrial = spec?.ui === "staff-input";
  const mine =
    dictation && !inFeedback
      ? mineOf(trial, staffTrial ? staffAnswer(trial, String(value ?? ""))?.text?.[0] : value)
      : null;
  // A full pad checks itself, except in dictation: there the learner plays theirs back before checking.
  const autoSubmit = spec !== null && AUTO_SUBMIT_KINDS.includes(spec.ui) && !dictation;
  const isSing = surface.kind === "sing";
  const isTap = surface.kind === "tap";
  const total = ctx.source?.total ?? 0;
  const hasCue = !isTap && !isSing && cuePlan(trial) !== null;
  const cueLabel = Number(trial.params.cueBars ?? 0) > 0 ? "Cadence" : "Hear the key";
  // A trial read from the page (playFirst: false) is not played before the answer: its sound is the reveal.
  const staged = stagingOf(trial);
  const audibleAnswer = answerPlan(trial).events.length > 0;
  const canReplay = inFeedback
    ? !resolving && (staged.stimulus !== null || audibleAnswer)
    : answering && (isTap || isSing || staged.stimulus !== null);
  const compare = outcome ? comparePlan(trial, ctx.captured, outcome.sung) : null;
  const prevLevel = ctx.index > 0 ? ctx.trials[ctx.index - 1]?.level : undefined;
  const levelMove =
    props.purpose === "practice" && prevLevel !== undefined ? levelMoveText(prevLevel, trial.level) : null;
  const setLevel = ctx.session?.levels[trial.family] ?? trial.level;
  const shownLevel = props.purpose === "practice" ? trial.level : setLevel;
  const replayLimit = trial.cue.replays;

  // Focus: the pad while answering (widgets focus themselves), the region otherwise so the keys keep working.
  // Dev only (tree-shaken from production): the trial on screen, for the browser suites' right answers.
  useEffect(() => {
    if (import.meta.env.DEV) {
      (globalThis as { __oakDrillTrial?: Trial }).__oakDrillTrial = trial;
      // A staff trial's answer as the staff writes it (the browser suites type it into the typed alternative).
      (globalThis as { __oakDrillStaffAnswer?: string | null }).__oakDrillStaffAnswer = isStaffTrial(trial)
        ? expectedStaffValue(trial)
        : null;
    }
  }, [trial]);

  // Focus that falls to the page (a button that goes away under it: "I heard it", "Quiet mode for today", a
  // disabled control) comes back to the region, so the drill's keys keep working without the mouse — with focus
  // on <body> the region's Enter, digits and R were dead.
  // Never from a dialog: one that closes hands focus back to its own trigger (often a moment after it unmounts),
  // and one that is open keeps it. Focus that was in a dialog in the last half second is the dialog's business.
  useEffect(() => {
    let dialogAt = Number.NEGATIVE_INFINITY;
    const inDialog = (t: EventTarget | null) => t instanceof Element && t.closest(DIALOG_SELECTOR) !== null;
    const onIn = (e: FocusEvent) => {
      if (inDialog(e.target)) dialogAt = performance.now();
    };
    const onOut = (e: FocusEvent) => {
      if (inDialog(e.target) || openDialog()) {
        dialogAt = performance.now();
        return;
      }
      setTimeout(() => {
        if (openDialog() || performance.now() - dialogAt < DIALOG_GRACE_MS) return;
        if (document.activeElement === document.body || document.activeElement === null)
          region.current?.focus({ preventScroll: true });
      }, 30);
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, [region]);

  // After the quiet "I heard it" button goes, focus comes back to the region (Enter moves on).
  useEffect(() => {
    if (imagining) return;
    if (inFeedback || isTap || isSing) region.current?.focus({ preventScroll: true });
  }, [inFeedback, isTap, isSing, region, imagining, resolving]);

  // The session's Pause (Alt+P) puts the page under an overlay: a sung part listening then stops at once (it
  // counts as skipped, no penalty), so the mic is never live behind "Paused".
  const sessionPaused = useRunnerView((v) => v.paused);
  const listening = (isSing && (presenting || answering)) || resolving;
  useEffect(() => {
    if (sessionPaused && listening) {
      player.stop();
      send({ type: "SKIP_SUNG" });
    }
  }, [sessionPaused, listening, send, player]);

  // A finished sung take that heard no voice (or mostly noise) leaves the "re-run the quiet check" suggestion
  // (app/src/voice/recheck.ts), shown under the feedback; once per trial.
  const reported = useRef(false);
  useEffect(() => {
    if (!outcome || !isSing || reported.current || outcome.result.skipped) return;
    reported.current = true;
    const frames = ctx.captured.frames;
    if (frames)
      reportTake({
        diagnostics: outcome.result.diagnostics,
        frames,
        floorDb: data.profile.noiseFloorDb ?? null,
      });
  }, [outcome, isSing, ctx.captured.frames, data.profile.noiseFloorDb]);

  const submit = (v: AnswerValue | null = value) => {
    if (!spec || v === null) return;
    if (!isComplete(spec, v)) return;
    player.stop();
    const answer =
      spec.ui === "staff-input"
        ? staffAnswer(trial, v as string)
        : answerOf(spec, v, (trial.expected as Answer).text?.length ?? 1, trial.expected as Answer);
    if (answer === null) return;
    send({ type: "SUBMIT", answer });
  };
  const change = (v: AnswerValue) => {
    setValue(v);
    if (autoSubmit && spec && isComplete(spec, v)) submit(v);
  };

  const bindings: Binding[] = [
    {
      id: "drill-replay",
      keys: "R",
      scope: "answer-pad",
      group: "Drills",
      description: "Hear it again",
      when: () => canReplay,
      run: () => (inFeedback ? send({ type: "AUDITION", what: "again" }) : send({ type: "REPLAY" })),
    },
    {
      id: "drill-replay-space",
      keys: "Space",
      scope: "answer-pad",
      group: "Drills",
      description: "Hear it again (when no button has focus)",
      when: (k) => !k.onControl && canReplay,
      run: () => (inFeedback ? send({ type: "AUDITION", what: "again" }) : send({ type: "REPLAY" })),
    },
    {
      id: "drill-cue",
      keys: "C",
      scope: "answer-pad",
      group: "Drills",
      description: "Cadence (or the key) again",
      when: () => hasCue && (answering || snap.matches({ feedback: "idle" })),
      run: () => (inFeedback ? send({ type: "AUDITION", what: "cue" }) : send({ type: "CUE" })),
    },
    {
      id: "drill-answer",
      keys: "A",
      scope: "answer-pad",
      group: "Drills",
      description: fet ? "Hear it resolve" : "Hear the answer",
      when: () => snap.matches("feedback") && audibleAnswer,
      run: () => send({ type: "AUDITION", what: "answer" }),
    },
    {
      id: "drill-compare",
      keys: "P",
      scope: "answer-pad",
      group: "Drills",
      description: "Compare: yours, then the answer",
      when: () => snap.matches("feedback") && compare !== null,
      run: () => send({ type: "AUDITION", what: "compare" }),
    },
    {
      id: "drill-play-mine",
      keys: "P",
      scope: "answer-pad",
      group: "Drills",
      description: "Play mine (dictation)",
      when: (k) => !k.inEditable && answering && mine !== null,
      run: () => {
        if (mine) player.play("mine", minePlan(trial, mine));
      },
    },
    {
      id: "drill-heard",
      keys: "Space",
      scope: "answer-pad",
      group: "Drills",
      description: "Heard it in my head (Quiet mode)",
      when: () => imagining,
      run: () => send({ type: "HEARD" }),
    },
    {
      id: "drill-next",
      keys: "Enter",
      scope: "answer-pad",
      group: "Drills",
      description: "Check, or next trial",
      when: (k) => !k.onControl && (inFeedback ? !resolving : answering && spec !== null),
      run: () => (imagining ? send({ type: "HEARD" }) : inFeedback ? send({ type: "NEXT" }) : submit()),
    },
    {
      id: "drill-skip-sung",
      keys: "Shift+S",
      scope: "answer-pad",
      group: "Drills",
      description: "Skip the sung part (no penalty)",
      when: () => (isSing && (presenting || answering)) || resolving || imagining,
      run: () => send({ type: "SKIP_SUNG" }),
    },
  ];
  // Only keys that work for this trial are registered, so the shortcut sheet lists exactly those.
  useHotkeys(
    bindings.filter(
      (b) =>
        (b.id !== "drill-cue" || hasCue) &&
        (b.id !== "drill-compare" || compare !== null) &&
        (b.id !== "drill-skip-sung" || isSing || trial.params.sungResolution === true) &&
        (b.id !== "drill-play-mine" || dictation) &&
        (b.id !== "drill-heard" || imagining),
    ),
  );

  const expected = trial.expected as Answer;
  const expectedValue = !spec
    ? null
    : spec.ui === "staff-input"
      ? expectedStaffValue(trial)
      : expectedValueOf(spec, expected);
  const feedback: AnswerFeedback = !outcome
    ? { state: "idle" }
    : outcome.result.correct
      ? { state: "correct" }
      : spec && expectedValue !== null
        ? {
            state: "revealed",
            correct: expectedValue as AnswerValue,
            ...(spec.ui === "staff-input" ? {} : { marks: wrongMarks(spec, value, expectedValue) }),
          }
        : { state: "wrong" };
  const Widget = spec ? drillWidgetFor(spec) : null;
  const stage = imagining
    ? "Hear it in your head, then press Space."
    : stageText(ctx.stage, trial.params.mode);
  const auditionText =
    ctx.audition === "resolve"
      ? "Hear it walk home…"
      : ctx.audition === "compare"
        ? "Yours, then it…"
        : "Playing…";
  const showKey = typeof trial.params.showKey === "number" ? trial.params.showKey : null;
  const singTargets = resolving
    ? resolutionOf(trial).targets
    : ((trial.params.singTargets as { midi: number; on: number; off: number }[] | undefined) ?? []);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-text-2">
            {props.position ? `Set ${props.position.index + 1} of ${props.position.total} · ` : ""}
            {props.title}
          </p>
          <h2 className="text-h3" data-testid="trial-prompt">
            {promptOf(trial, def)}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <Chip title={props.purpose === "practice" ? "Free practice adapts the level as you go" : undefined}>
            Level {shownLevel} of {def.levels.length}
          </Chip>
          <span className="text-sm tabular-nums text-text-2" data-testid="trial-counter">
            Trial {Math.min(ctx.index + 1, total)} of {total}
          </span>
          <TrialDots outcomes={ctx.outcomes} total={total} index={ctx.index} />
        </div>
      </header>

      <Card
        className="flex min-h-36 flex-col items-center justify-center gap-3 p-5 text-center"
        data-testid="stimulus-panel"
      >
        <div className="flex items-center gap-2 text-text-2" aria-live="polite">
          {(presenting || resolving || (ctx.stage !== null && !inFeedback)) && (
            <span
              aria-hidden
              className="size-2.5 animate-pulse rounded-full bg-accent reduced:animate-none"
            />
          )}
          <span data-testid="stage-text">
            {stage ??
              (inFeedback
                ? auditioning
                  ? auditionText
                  : "Listen back, or move on."
                : answering
                  ? isTap || isSing
                    ? "Ready."
                    : "Your turn."
                  : "Getting ready…")}
          </span>
        </div>
        {trial.params.showStaff === true && <TrialStaff trial={trial} />}
        {showKey !== null && <KeyHighlight highlight={showKey} />}
        {inFeedback && (keyText(trial) || instrumentsOf(trial).length > 0) && (
          <p className="text-sm text-text-3" data-testid="trial-details">
            {[
              keyText(trial) ? `In ${keyText(trial)}` : null,
              noteNamesText(trial, lenses.shown),
              instrumentsOf(trial).join(", ") || null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {levelMove && <p className="text-sm text-text-2">{levelMove}</p>}
      </Card>

      <section aria-label="Your answer" className="min-h-28">
        {ctx.micError && !inFeedback && (
          <Callout
            tone="attention"
            title={quietNow ? "Quiet mode is on" : "The microphone is not available"}
            actions={
              <>
                {!quietNow && (
                  <Button size="sm" onClick={() => send({ type: "REPLAY" })}>
                    Try again
                  </Button>
                )}
                <Button size="sm" variant="primary" onClick={() => send({ type: "SKIP_SUNG" })}>
                  Skip singing <Kbd tone="inverse">⇧S</Kbd>
                </Button>
              </>
            }
          >
            {ctx.micError}
          </Callout>
        )}
        {isTap && (
          <TapPanel
            trial={trial}
            stage={ctx.stage}
            done={inFeedback}
            taps={inFeedback ? ctx.captured.taps : null}
          />
        )}
        {imagining && (
          <Card className="flex flex-col items-center gap-3 p-5 text-center" data-testid="quiet-resolution">
            <p className="text-text">Quiet mode: hear the way home again in your head.</p>
            <p className="text-sm text-text-2">Nothing is recorded, and nothing counts against you.</p>
            <Button variant="primary" autoFocus onClick={() => send({ type: "HEARD" })}>
              I heard it <Kbd tone="inverse">Space</Kbd>
            </Button>
          </Card>
        )}
        {(isSing || (resolving && !quietNow)) && (
          <SingPanel
            trial={trial}
            targets={singTargets}
            tolCents={data.profile.singTolCents}
            labels={singLabelsOf(trial, singTargets, data.solfege)}
            active={ctx.stage === "sing"}
            micOpen={
              (presenting || resolving) &&
              !ctx.micError &&
              (ctx.stage === "sing" || ctx.stage === "listen" || ctx.stage === "resolution")
            }
            label={resolving ? "Sing the way home." : "Sing the note."}
          />
        )}
        {spec &&
          !resolving &&
          (Widget ? (
            <AnswerEnvProvider
              value={{
                lenses: lenses.shown,
                ...(staffTrial ? { staff: { meter: meterOf(trial), sound: "piano" } } : {}),
              }}
            >
              <Widget
                spec={spec as never}
                value={value as never}
                onChange={(v) => change(v as AnswerValue)}
                onSubmit={() => submit()}
                disabled={inFeedback}
                feedback={feedback}
                autoFocus={!inFeedback}
                label={answerWidgetLabel(spec)}
                solfege={solfegeShown ? "syllables" : "numbers"}
                {...(spec.ui === "choice" && spec.options.some((o) => o.audio)
                  ? { audition: auditionCode }
                  : {})}
                idBase={`drill-${ctx.index}`}
              />
            </AnswerEnvProvider>
          ) : (
            <Callout tone="info" title="This answer type is not available yet">
              Choose Show me to hear the answer and move on.
            </Callout>
          ))}
      </section>

      {dictation && (answering || presenting) && (
        <DictationTools
          trial={trial}
          mine={mine}
          player={player}
          onSourceHeard={() => send({ type: "LISTENED" })}
        />
      )}

      {outcome && (
        <FeedbackLine
          outcome={outcome}
          text={expectedText(spec, expected, data.solfege === "syllables")}
          def={def}
          trial={trial}
          resolving={resolving || imagining}
          quiet={quietNow}
          resolutionDone={snap.matches({ resolution: "done" })}
          answer={ctx.captured.answer}
          micError={ctx.micError}
          onQuietToday={() => void voice.setQuiet(true, "today")}
        />
      )}
      {outcome && isSing && inFeedback && <RecheckHint />}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          {canReplay && (
            <Button
              onClick={() =>
                inFeedback ? send({ type: "AUDITION", what: "again" }) : send({ type: "REPLAY" })
              }
            >
              {isTap || isSing ? (inFeedback ? "Hear it again" : "Once more") : "Hear it again"} <Kbd>R</Kbd>
            </Button>
          )}
          {hasCue && (answering || snap.matches({ feedback: "idle" })) && (
            <Button
              onClick={() => (inFeedback ? send({ type: "AUDITION", what: "cue" }) : send({ type: "CUE" }))}
            >
              {cueLabel} <Kbd>C</Kbd>
            </Button>
          )}
          {snap.matches("feedback") && audibleAnswer && (
            <Button onClick={() => send({ type: "AUDITION", what: "answer" })}>
              {fet ? "Hear it resolve" : "Hear the answer"} <Kbd>A</Kbd>
            </Button>
          )}
          {snap.matches("feedback") && compare && (
            <Button onClick={() => send({ type: "AUDITION", what: "compare" })}>
              Compare <Kbd>P</Kbd>
            </Button>
          )}
          {answering && spec && (
            <Button variant="ghost" onClick={() => send({ type: "REVEAL" })}>
              Show me
            </Button>
          )}
          {((isSing && (presenting || answering)) || resolving || imagining) && (
            <Button variant="ghost" onClick={() => send({ type: "SKIP_SUNG" })}>
              Skip singing <Kbd>⇧S</Kbd>
            </Button>
          )}
          {answering && replayLimit >= 0 && ctx.replays > 0 && !isTap && !isSing && (
            <span className="text-sm text-text-3">
              {ctx.replays <= replayLimit
                ? `Replays ${ctx.replays} of ${replayLimit}`
                : "Extra replays count as help; that's fine."}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LensSwitches lenses={lenses} />
          {answering && spec && !autoSubmit && (
            <Button
              variant="primary"
              disabled={value === null || !isComplete(spec, value)}
              onClick={() => submit()}
            >
              Check {spec.ui === "code" ? null : <Kbd tone="inverse">Enter</Kbd>}
            </Button>
          )}
          {inFeedback && (
            <Button
              variant="primary"
              disabled={resolving || imagining}
              onClick={() => send({ type: "NEXT" })}
              data-testid="next-trial"
            >
              {snap.matches("feedback") && trial.params.sungResolution === true && !outcome?.revealed
                ? quietNow
                  ? "Hear it home"
                  : "Sing it home"
                : ctx.index + 1 < total
                  ? "Next"
                  : "Finish set"}{" "}
              <Kbd tone="inverse">Enter</Kbd>
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

function TrialDots({
  outcomes,
  total,
  index,
}: {
  outcomes: readonly TrialOutcome[];
  total: number;
  index: number;
}) {
  return (
    <ol className="flex items-center gap-1" aria-label="Trials">
      {Array.from({ length: total }, (_, i) => {
        const o = outcomes[i];
        const state = !o
          ? i === index
            ? "current"
            : "todo"
          : o.result.skipped
            ? "skipped"
            : o.result.correct
              ? "right"
              : "missed";
        return (
          <li key={i} aria-current={i === index ? "step" : undefined}>
            <span className="sr-only">
              Trial {i + 1}:{" "}
              {state === "right"
                ? "right"
                : state === "missed"
                  ? "not this time"
                  : state === "skipped"
                    ? "skipped"
                    : state === "current"
                      ? "current"
                      : "to do"}
            </span>
            <span
              aria-hidden
              className={clsx(
                "block size-2.5 rounded-full",
                state === "right" && "bg-accent",
                state === "missed" && "border-2 border-accent-2",
                state === "skipped" && "border border-dashed border-text-3",
                state === "current" && "ring-2 ring-accent ring-offset-1 ring-offset-bg",
                (state === "todo" || state === "current") && "bg-border",
              )}
            />
          </li>
        );
      })}
    </ol>
  );
}

function FeedbackLine({
  outcome,
  text,
  def,
  trial,
  resolving,
  quiet,
  resolutionDone,
  answer,
  micError,
  onQuietToday,
}: {
  outcome: TrialOutcome;
  text: string | null;
  def: FamilyDef;
  trial: Trial;
  resolving: boolean;
  quiet: boolean;
  resolutionDone: boolean;
  answer: Answer | null;
  micError: string | null;
  onQuietToday(): void;
}) {
  const r = outcome.result;
  let line: string;
  const mode = trial.params.mode;
  if (r.skipped) line = "Skipped. No penalty, and nothing counted.";
  else if (outcome.revealed) line = text ? `It was ${text}. Hear it, then move on.` : "Here is the answer.";
  else if (mode === "tap")
    line = r.correct ? "In time." : "Not quite in time yet. Hear it again, or compare.";
  else if (mode === "sing")
    line = r.correct
      ? "In tune."
      : outcome.sung?.[0]?.midi === null
        ? "No steady note reached the mic. Hum a little louder next time."
        : "Close. Hear the target, then compare.";
  else if (r.correct) line = text ? `That's it: ${text}.` : "That's it.";
  else line = text ? `It was ${text}.` : "Not this time.";
  const got = answer?.choice?.[0] ?? answer?.degrees?.[0] ?? answer?.qualities?.[0];
  const exp = (trial.expected as Answer).choice?.[0] ?? (trial.expected as Answer).degrees?.[0];
  const tip = !r.correct && got && exp ? def.confusionTips?.[`${exp}|${got}`] : undefined;
  return (
    <div
      role="status"
      data-testid="trial-feedback"
      data-correct={r.correct ? "true" : "false"}
      className={clsx(
        "rounded-control border px-4 py-3",
        r.correct ? "border-accent/40 bg-lane-in" : "border-border bg-surface-2",
      )}
    >
      <p className="font-medium">{line}</p>
      {tip && <p className="mt-1 text-sm text-text-2">{tip}</p>}
      {(resolving || resolutionDone) && (
        <p className="mt-1 text-sm text-text-2">
          {resolving
            ? quiet
              ? "Listen to the way home. It does not change this answer."
              : "Now sing the way home. It does not change this answer."
            : outcome.sungResolution?.skipped && micError && !quiet
              ? `${micError.split(". ")[0]?.replace(/\.$/, "")}, so the way home was not sung. No penalty.`
              : outcome.sungResolution?.skipped
                ? "Singing skipped. No penalty."
                : outcome.sungResolution?.quiet
                  ? "Heard home, in your head."
                  : outcome.resolutionCredit !== null
                    ? outcome.resolutionCredit >= 0.8
                      ? "Sung home, in tune."
                      : "Sung home. The trace shows where it drifted."
                    : "Resolution heard."}
        </p>
      )}
      {resolutionDone && outcome.sungResolution?.skipped && micError && !quiet && (
        <div className="mt-2">
          <Button size="sm" onClick={onQuietToday} data-testid="quiet-today">
            Quiet mode for today
          </Button>
        </div>
      )}
    </div>
  );
}

/** The note names of the asked notes, when the note-name lens is shown ("F♯4"). */
function noteNamesText(trial: Trial, shown: { noteNames: boolean }): string | null {
  if (!shown.noteNames) return null;
  const key = keyOfTrial(trial) as KeySpec | undefined;
  const midis = targetMidisOf(trial).slice(0, 8);
  if (!key || midis.length === 0) return null;
  return midis.map((m) => labelPitch(m, key).display).join(" ");
}

/** Ribbon labels of sung targets: the degree, with its syllable once syllables are the singing labels (§8.3). */
function singLabelsOf(
  trial: Trial,
  targets: readonly { midi: number }[],
  labels: "numbers" | "syllables",
): string[] | undefined {
  const key = keyOfTrial(trial) as KeySpec | undefined;
  if (!key) return undefined;
  return targets.map((t) => {
    const l = labelPitch(t.midi, key);
    return labels === "syllables" ? `${l.degreeDisplay} · ${l.syllable}` : l.degreeDisplay;
  });
}
