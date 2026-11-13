// One exercise's input, for every kind of contracts §5.4 except listen, predict and the Make (they have their own
// renderers): the code kinds edit in a Workbench (editable regions only, locked tools flagged by the graded
// lint), code-fill fills blanks with a live preview, investigate asks its questions beside a playable editor,
// and the answer kinds render an AnswerWidget with their stimulus (count-in, replays, the tap pad's bar-1 time,
// the notes to sing). The value is controlled by the caller; `inputResponse` turns it into the wire response.

import type {
  AllEx,
  AttemptResponse,
  CodeRange,
  Exercise,
  GradeResult,
  HintRung,
  InvestigateQ,
  KeySpec,
  Trial,
} from "@oak/api";
import { fillBlanks, stripMarkers } from "@oak/api";
import { normalize, singTargets } from "@oak/grader";
import type { SungResult } from "@oak/pitch";
import { METERS } from "@oak/theory";
import { Play, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { type AnswerEnv, AnswerEnvProvider, appAudio, type SingTake } from "../answers/env.tsx";
import { emptyValue, isComplete, responseOf } from "../answers/response.ts";
import { summarize } from "../answers/sing.ts";
import type { AnswerFeedback, AnswerKind, AnswerSpec, AnswerSpecOf, AnswerValue } from "../answers/types.ts";
import { auditionCode } from "../lib/audition.ts";
import { analyzeCode } from "../lib/grader-client.ts";
import { useLenses } from "../lib/lenses.ts";
import { Button } from "../ui/kit/Button.tsx";
import { reportTake } from "../voice/recheck.ts";
import { Workbench, type WorkbenchProps } from "../workbench/Workbench.tsx";
import { answerResponse } from "./answer-response.ts";
import { lessonWidgetFor } from "./answers.tsx";
import { type Playing, playLead, playStimulus } from "./audio.ts";
import { InlineMd, useStepHost } from "./frame.tsx";
import type { TakeLookup } from "./grading.ts";
import { LeadSheetView, leadSheetOf } from "./lead-sheet.tsx";
import { answerSpecOf, givenStart, questionSpec, revealCode, withTrialOptions } from "./model.ts";
import { CodeMusic } from "./music.tsx";
import { byEarSource, isByEar, keySignatureResponse, singLabelsFor, tonicPc } from "./rules.ts";
import { useTargetMarks } from "./target-marks.ts";
import { isMatchSound, MATCH_SOUND_LABELS } from "./wave5.ts";

type Part = Exclude<Exercise, AllEx>;

/** Mutable per-input runtime: the AudioContext time of bar 1 of the last tap take. */
export interface InputRuntime {
  tapStart: number | null;
  plays: number;
  /** The slot a slot strip is playing (`P`), stopped when another slot plays. */
  slotPlaying?: { stop(): void } | null;
}

export interface InvestigateValue {
  code: string;
  answers: AnswerValue[];
}

const CODE_INPUT = new Set<Exercise["kind"]>([
  "code-modify",
  "error-hunt",
  "code-make",
  "compose-brief",
  "transcribe-step",
]);

/** A dictation written as code: by ear, or from the page (U07.CP "from the page": a staff to write in `n()`). */
function isCodeDictation(ex: Exercise): boolean {
  return ex.kind === "dictation" && ex.answer.ui === "code";
}

export function isCodeInput(ex: Exercise): boolean {
  return CODE_INPUT.has(ex.kind) || isByEar(ex) || isCodeDictation(ex);
}

/** The starter of a code part as the editor shows it (clean), and its editable regions. */
export function starterOf(ex: Exercise): { code: string; editable: CodeRange[] | null } {
  if ("code" in ex && ex.code && typeof ex.code === "object" && "starter" in ex.code) {
    const c = stripMarkers(ex.code.starter);
    return { code: c.code, editable: c.editable };
  }
  if (ex.kind === "dictation" && ex.answer.ui === "code") {
    const c = stripMarkers(ex.answer.starter);
    return { code: c.code, editable: c.editable };
  }
  return { code: "", editable: null };
}

export function initialInput(ex: Part): unknown {
  if (isCodeInput(ex)) return starterOf(ex).code;
  if (ex.kind === "run-investigate")
    return {
      code: starterOf(ex).code,
      answers: ex.questions.map((q) => emptyValue(questionSpec(q) as AnswerSpecOf<AnswerKind>)),
    } satisfies InvestigateValue;
  const spec = answerSpecOf(ex);
  const given = givenStart(ex, spec);
  if (given) return given;
  return spec ? emptyValue(spec as AnswerSpecOf<AnswerKind>) : null;
}

export function inputReady(ex: Part, value: unknown, trial: Trial | null = null): boolean {
  if (isCodeInput(ex)) return typeof value === "string";
  if (ex.kind === "run-investigate") {
    const v = value as InvestigateValue;
    return ex.questions.every((q, i) => isComplete(questionSpec(q), v.answers[i] as AnswerValue));
  }
  const spec = withTrialOptions(answerSpecOf(ex), trial);
  if (!spec) return true;
  if (spec.ui === "keyboard") return Array.isArray(value) && value.length > 0;
  return isComplete(spec, value as AnswerValue);
}

export function inputResponse(ex: Part, value: unknown, rt: InputRuntime): AttemptResponse {
  if (isCodeInput(ex)) return { code: value as string };
  if (ex.kind === "run-investigate") {
    const v = value as InvestigateValue;
    return { parts: ex.questions.map((q, i) => responseOf(questionSpec(q), v.answers[i] as AnswerValue)) };
  }
  const spec = answerSpecOf(ex);
  if (!spec) return { skipped: true };
  // A key signature is placed as accidentals in order; the grader reads them as `answer.text` (wave3.md §10).
  if (spec.ui === "staff-input" && spec.mode === "key-signature")
    return keySignatureResponse(value as string);
  const r = answerResponse(ex.kind, spec, value as AnswerValue);
  // The tap pad reports AudioContext seconds; the grader reads seconds from bar 1 of the stimulus.
  if ("taps" in r && rt.tapStart !== null) {
    const start = rt.tapStart;
    return { taps: r.taps.map((t) => Math.round((t - start) * 1000) / 1000) };
  }
  return r;
}

/** Plays a stimulus with its count-in; counts plays against the cue's replay allowance. */
export function StimulusPlayer({
  ex,
  trial,
  runtime,
  label = "Play",
  onStart,
}: {
  ex: Part;
  trial: Trial | null;
  runtime: InputRuntime;
  label?: string;
  onStart?: (p: Playing) => void;
}) {
  const h = useStepHost();
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [failed, setFailed] = useState(false);
  const stim = "stimulus" in ex ? ex.stimulus : undefined;
  const cue = "cue" in ex ? ex.cue : undefined;
  useEffect(() => () => playing?.stop(), [playing]);
  if (!stim || (stim.src !== "code" && stim.src !== "generator")) return null;
  if (stim.src === "generator" && !trial) return null;
  const replays = cue?.replays ?? -1;
  const left = replays < 0 ? null : Math.max(0, replays + 1 - runtime.plays);
  const start = async () => {
    setFailed(false);
    try {
      const p = await playStimulus({
        ...(stim.src === "code" ? { code: stim.code } : { trial }),
        bars: stim.src === "code" ? stim.bars : Number(trial?.params.bars ?? 1),
        meter: ex.meter ?? h.env.meter,
        key: ex.key ?? h.env.key,
        countInBars: cue?.countInBars ?? 0,
        click: cue?.click ?? false,
        // A code stimulus plays its "chords that set home" first, as a drill trial does (U03.L02 S6).
        ...(stim.src === "code" && cue ? { context: cue.context } : {}),
      });
      runtime.plays += 1;
      setPlaying(p);
      onStart?.(p);
      void p.done.then(() => setPlaying((cur) => (cur === p ? null : cur)));
    } catch {
      setFailed(true);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="stimulus">
      <Button
        variant="secondary"
        icon={playing ? <Square aria-hidden className="size-3.5" /> : <Play aria-hidden className="size-4" />}
        onClick={() => {
          if (playing) {
            playing.stop();
            setPlaying(null);
          } else void start();
        }}
        data-testid="play-stimulus"
      >
        {playing ? "Stop" : runtime.plays > 0 ? "Play again" : label}
      </Button>
      {left !== null && (
        <span className="text-sm text-text-3" aria-live="polite">
          {left > 0 ? `${left} ${left === 1 ? "play" : "plays"} included` : "Extra plays count a little less"}
        </span>
      )}
      {failed && (
        <span className="text-sm text-text-2">The sound did not start. Press any key, then try again.</span>
      )}
    </div>
  );
}

export interface PartInputProps {
  ex: Part;
  value: unknown;
  onChange(v: unknown): void;
  slot: "stage" | "answer";
  /** Workbench ID slug, unique on the page. */
  wbId: string;
  feedback: AnswerFeedback;
  result: GradeResult | null;
  rung: HintRung;
  disabled: boolean;
  onSubmit(): void;
  runtime: InputRuntime;
  trial: Trial | null;
  /** A Run succeeded (run steps complete on it; modify steps re-check after the first Check). */
  onRun?(code: string): void;
  /** Pass the result to the Workbench (marks on roll, staff and editor; ghost notes from rung 3). */
  workbenchFeedback?: boolean;
  passed?: boolean;
  variant?: "full" | "compact";
  autoFocus?: boolean;
  label?: string;
}

function useWorkbenchBase(ex: Part, variant?: "full" | "compact"): Omit<WorkbenchProps, "id" | "code"> {
  const h = useStepHost();
  const base = h.workbench;
  const lessonCtx = {
    ...base.lessonCtx,
    ...(ex.key ? { key: ex.key } : {}),
    ...(ex.meter ? { meter: ex.meter } : {}),
  };
  // A part with its own pickup (contracts §6.11) shows bar 0 as the pickup bar, as it is graded.
  // The part's own variant (a part of an "all" step is compact), else the step's: code with long lines gets the
  // full width with the music under it (LessonPlayer `wide`). review:journey: the step's choice was overwritten
  // with "full", so A1.L01's `.scope()` line was cut off in a half-width editor beside an empty column.
  const v = variant ?? (base.variant === "compact" ? "compact" : "full");
  return { ...base, lessonCtx, variant: v, ...(ex.pickup ? { pickup: ex.pickup } : {}) };
}

/** The Workbench of a code part, its A/B target and its marks. */
function CodeStage(p: PartInputProps & { code: string; setCode(code: string): void; readOnly?: true }) {
  const base = useWorkbenchBase(p.ex, p.variant);
  const starter = starterOf(p.ex);
  const { editable } = starter;
  // The ⟪…⟫ regions are the only editable text: they are boxed, and a keyboard focus lands in them.
  useTargetMarks(p.wbId, p.readOnly ? null : editable, p.code === starter.code, p.result);
  const reference = isByEar(p.ex) ? byEarSource(p.ex).code : revealCode(p.ex);
  // A1's "match this sound" (a controls matcher): the sound to match is the point, so it is heard from the start.
  const matchSound = isMatchSound(p.ex);
  const audible =
    isByEar(p.ex) ||
    matchSound ||
    ("target" in p.ex && p.ex.target && typeof p.ex.target === "object" && "audible" in p.ex.target
      ? p.ex.target.audible
      : false);
  // ux §3.6: A/B from rung 2 on a modify step, always on a dictation. A modify step that starts by ear (its
  // roll appears only after a failed check, `revealRollAfter`) can be heard from the start: the ear is the point.
  const abAudible =
    isByEar(p.ex) ||
    matchSound ||
    (p.ex.kind === "code-modify" && p.ex.target.revealRollAfter !== undefined && !p.ex.target.showRoll)
      ? ("always" as const)
      : ("fromHint2" as const);
  return (
    <Workbench
      {...base}
      id={p.wbId}
      code={p.code}
      // The regions' boxes follow every edit (wave4.md §3.5), not only the pristine starter.
      {...(!p.readOnly && (editable?.length ?? 0) > 0 ? { targetRegions: true } : {})}
      {...(p.readOnly
        ? { readOnly: true as const }
        : editable && editable.length > 0
          ? { readOnly: { editable } }
          : {})}
      {...(p.workbenchFeedback
        ? {
            feedback: {
              result: p.result,
              rung: p.rung,
              ...(p.passed !== undefined ? { passed: p.passed } : {}),
            },
          }
        : {})}
      target={reference && audible ? { code: reference, audible: abAudible } : null}
      {...(isByEar(p.ex)
        ? { abLabels: { a: "Your code", b: "The tune" } }
        : matchSound
          ? { abLabels: { ...MATCH_SOUND_LABELS } }
          : {})}
      onChange={(c) => p.setCode(c)}
      onEvaluated={(o) => {
        if (o.ok) p.onRun?.(o.code);
      }}
    />
  );
}

export function AnswerWidgetHost(p: {
  spec: AnswerSpec;
  value: AnswerValue;
  onChange(v: AnswerValue): void;
  feedback: AnswerFeedback;
  disabled: boolean;
  onSubmit(): void;
  rung: HintRung;
  idBase: string;
  label: string;
  autoFocus?: boolean;
}) {
  const Widget = lessonWidgetFor(p.spec as AnswerSpecOf<AnswerKind>);
  if (!Widget)
    return (
      <p className="text-sm text-text-2" data-testid="answer-unavailable">
        This answer type isn't available yet. You can go on without it.
      </p>
    );
  return (
    <Widget
      spec={p.spec as AnswerSpecOf<AnswerKind>}
      value={p.value}
      onChange={p.onChange}
      onSubmit={p.onSubmit}
      disabled={p.disabled}
      feedback={p.feedback}
      label={p.label}
      rung={p.rung}
      idBase={p.idBase}
      audition={(code) => auditionCode(code, 1)}
      {...(p.autoFocus ? { autoFocus: true } : {})}
    />
  );
}

type SingNotes = NonNullable<AnswerEnv["sing"]>["notes"];

/**
 * The notes of a sing step whose target is read from music (`from: "stimulus"` or `"reference"`): the stimulus
 * (or the reference's first solution) is evaluated for its own bars, as the grader does (`singPerformance` in
 * grading.ts), so the lane shows the very notes the take is graded against. `null` while it is read, or for a
 * step that has none (degree targets are computed synchronously by the caller).
 */
function useSungFromMusic(ex: Part, key: AnswerEnvKey, meter: AnswerEnvMeter): SingNotes | null {
  const sing = ex.kind === "sing" && ex.target.from !== "degrees" ? ex : null;
  const src = !sing
    ? null
    : sing.target.from === "reference"
      ? (sing.target.reference.solutions[0] ?? null)
      : sing.stimulus.src === "code"
        ? sing.stimulus.code
        : null;
  const bars = !sing
    ? 0
    : sing.target.from === "reference"
      ? sing.target.reference.bars
      : sing.stimulus.src === "code"
        ? (sing.stimulus.bars ?? 4)
        : 4;
  const [notes, setNotes] = useState<{ for: string; notes: SingNotes } | null>(null);
  const id = sing && src ? `${src}|${bars}|${meter}|${key?.tonic ?? ""}:${key?.mode ?? ""}` : null;
  useEffect(() => {
    if (!sing || !src || !id) return;
    let live = true;
    void analyzeCode(src, { mode: "lesson", bars, lint: null, meter })
      .then((res) => {
        if (!live || !res.ok) return;
        const n = normalize(res, key ? { meter, key } : { meter });
        const targets = singTargets(sing.target, n, key, meter, n.cps);
        setNotes({ for: id, notes: targets.map((t) => ({ midi: t.midi, at: t.on, dur: t.off - t.on })) });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  return notes && notes.for === id ? notes.notes : null;
}

type AnswerEnvKey = Parameters<typeof singTargets>[2];
type AnswerEnvMeter = Parameters<typeof singTargets>[3];

/**
 * Dev and e2e only: the target pitches each sing part on screen is graded against, by exercise ID, so a browser
 * spec can submit a take on its targets through the player's own path (`__oakLesson.singTargets()`).
 */
export const devSingTargets = new Map<string, number[]>();

/**
 * The takes the sing widgets on this page measured, by exercise ID: the grader reads the whole @oak/pitch result
 * of the take a response summarises (`TakeLookup`), so a failed pattern names the first wrong degree and a take
 * Oak could not hear says why (no voice, too noisy, too short, clipped). A response that is not the latest take's
 * summary (a replay, the dev hook) is graded from its summary.
 */
const takes = new Map<string, { summary: string; result: SungResult }>();
export const lessonTakes: TakeLookup = (exerciseId, sung) => {
  const t = takes.get(exerciseId);
  if (!t || t.summary !== JSON.stringify(sung)) return null;
  return t.result as unknown as ReturnType<TakeLookup>;
};

/** Keeps a finished take for grading and leaves the voice's re-check advice when it heard no voice or noise. */
function onSingTake(exerciseId: string, take: SingTake, floorDb: number | null): void {
  takes.set(exerciseId, { summary: JSON.stringify(summarize(take.result)), result: take.result });
  reportTake({
    diagnostics: take.result.diagnostics,
    ...(take.pitchFrames ? { frames: take.pitchFrames } : {}),
    floorDb,
  });
}

/** The pitches a sing part is graded against: the trial's, the music's, or its degrees placed in the key. */
function singTargetMidis(
  ex: Part,
  trial: Trial | null,
  fromMusic: SingNotes | null,
  env: { key: AnswerEnvKey & object; meter: AnswerEnvMeter; bpm: number },
): readonly { midi: number }[] | undefined {
  if (ex.kind !== "sing") return undefined;
  if (trial && Array.isArray(trial.params.singTargets)) return trial.params.singTargets as { midi: number }[];
  if (ex.target.from !== "degrees") return fromMusic ?? undefined;
  const meter = ex.meter ?? env.meter;
  return singTargets(ex.target, null, ex.key ?? env.key, meter, env.bpm / 60 / METERS[meter].unitsPerBar);
}

/** Publishes a sing part's targets for the dev hook (a no-op in a production build). */
function useDevSingTargets(exId: string, notes: readonly { midi: number }[] | undefined): void {
  const key = notes ? notes.map((n) => n.midi).join(",") : "";
  useEffect(() => {
    if (!import.meta.env.DEV || key === "") return;
    devSingTargets.set(exId, key.split(",").map(Number));
    return () => {
      devSingTargets.delete(exId);
    };
  }, [exId, key]);
}

/** The answer environment of a part: calibration, quiet mode, the tap take and the notes to sing. */
export function useAnswerEnvFor(
  ex: Part,
  runtime: InputRuntime,
  trial: Trial | null,
  code: string | null,
): AnswerEnv {
  const h = useStepHost();
  const fromMusic = useSungFromMusic(
    ex,
    ex.kind === "sing" ? (ex.key ?? h.env.key) : null,
    ex.kind === "sing" ? (ex.meter ?? h.env.meter) : h.env.meter,
  );
  const allLenses = useLenses();
  const lenses = allLenses.shown;
  const env: AnswerEnv = { profile: h.env.profile, quiet: h.voice.quiet, audio: appAudio };
  // A checkpoint stores the answer without grading it ("Save answer"), so the widgets' Enter hint says so.
  if (h.mode === "checkpoint") env.submitVerb = "save";
  useDevSingTargets(ex.id, singTargetMidis(ex, trial, fromMusic, h.env));
  if (code !== null) env.code = code;
  // The Workbench's labels are the content's inside a step; the answer widgets read the learner's lenses
  // (wave3.md §4.3), and show what the step itself labels too: a widget shows syllables when either asks. A lens
  // switched elsewhere mid-step (Studio, the drill footer, Settings) reaches the widget without a remount.
  const labels = [h.step.ui.rollLabels ?? "none", h.step.ui.staffLabels ?? "none"];
  env.lenses = {
    degrees: lenses.degrees || labels.some((l) => l.includes("degree")),
    solfege: lenses.solfege || labels.some((l) => l.includes("solfege")),
    noteNames: lenses.noteNames || labels.includes("note"),
    // Wave 4 chord lenses: the RN palette prints a numeral's chord symbol only with that lens on.
    chordSymbols: allLenses.chords.shown.chordSymbols,
    romanNumerals: allLenses.chords.shown.romanNumerals,
  };
  // Chords, numerals and slot strips are heard and named in the step's own key and tempo (wave4.md §4.3).
  const harmonyUi = "answer" in ex && ex.answer && typeof ex.answer === "object" ? ex.answer.ui : null;
  const staged = ex.kind === "dictation" && ex.stageAnswers !== undefined;
  if (
    staged ||
    harmonyUi === "rn-palette" ||
    harmonyUi === "bar-grid" ||
    harmonyUi === "quality-pad" ||
    harmonyUi === "slot-choice" ||
    harmonyUi === "keyboard" ||
    harmonyUi === "staff-input" ||
    harmonyUi === "text"
  ) {
    const meter = ex.meter ?? h.env.meter;
    env.harmony = {
      key: ex.key ?? (trial?.params.key as KeySpec | undefined) ?? h.env.key,
      beatsPerBar: METERS[meter].unitsPerBar,
      bpm: typeof ex.bpm === "number" ? ex.bpm : h.env.bpm,
      // A graded chord is named once it is checked, never while it is built (that would give the answer away).
      nameChords: "after",
    };
  }
  // A slot strip hears its selected slot alone (`P`): slot i is the i-th equal span of the stimulus (a bar, half a
  // bar or a phrase, as the strip divides it).
  const slotSpec = harmonyUi === "slot-choice" && "answer" in ex ? (ex.answer as { slots?: number }) : null;
  const slotStim = "stimulus" in ex ? ex.stimulus : undefined;
  if (slotSpec?.slots && slotStim && (slotStim.src === "code" || trial)) {
    const meter = ex.meter ?? h.env.meter;
    const bars = slotStim.src === "code" ? slotStim.bars : Number(trial?.params.bars ?? 0);
    const per = bars / slotSpec.slots;
    if (bars > 0 && per > 0)
      env.slots = {
        play: (slot) => {
          runtime.slotPlaying?.stop();
          void playStimulus({
            ...(slotStim.src === "code" ? { code: slotStim.code } : { trial }),
            bars,
            meter,
            key: ex.key ?? h.env.key,
            span: { fromBar: slot * per, bars: per },
          })
            .then((p) => {
              runtime.slotPlaying = p;
            })
            .catch(() => null);
        },
      };
  }
  if (ex.kind === "staff-write" || ex.kind === "staff-read" || ex.kind === "dictation")
    env.staff = { meter: METERS[ex.meter ?? h.env.meter] };
  if (ex.kind === "tap") {
    const meter = ex.meter ?? h.env.meter;
    env.tap = {
      bars: ex.bars,
      bpm: typeof ex.bpm === "number" ? ex.bpm : h.env.bpm,
      beatsPerBar: METERS[meter].unitsPerBar,
      countInBars: ex.cue.countInBars,
      start: async () => {
        const p = await playStimulus({
          ...(ex.stimulus.src === "code" ? { code: ex.stimulus.code } : { trial }),
          bars: ex.bars,
          meter,
          key: ex.key ?? h.env.key,
          countInBars: Math.max(1, ex.cue.countInBars),
          click: ex.cue.click,
        });
        runtime.tapStart = p.startAt;
        runtime.plays += 1;
        return p.startAt;
      },
    };
  }
  // A drill trial sung in a checkpoint carries its own targets (seconds from the response window) and cue.
  const trialTargets =
    ex.kind === "sing" && trial && Array.isArray(trial.params.singTargets)
      ? (trial.params.singTargets as { midi: number; on: number; off: number }[])
      : null;
  if (ex.kind === "sing" && trialTargets && trial) {
    const degrees = ex.target.from === "degrees" ? ex.target.degrees : [];
    const labels = singLabelsFor(ex, h.lesson.id);
    env.sing = {
      notes: trialTargets.map((t, i) => {
        return { midi: t.midi, at: t.on, dur: t.off - t.on, label: degrees[i] ?? "" };
      }),
      mode: ex.mode,
      tol: ex.tol,
      showTrace: ex.showTrace,
      labels,
      ...(ex.cue.countInBars > 0
        ? {
            countIn: {
              beats: ex.cue.countInBars * METERS[ex.meter ?? h.env.meter].unitsPerBar,
              bpm: Number(trial.params.bpm ?? h.env.bpm),
            },
          }
        : {}),
      playCue: async () => {
        const p = await playStimulus({
          trial,
          bars: Number(trial.params.bars ?? 1),
          meter: ex.meter ?? h.env.meter,
          key: ex.key ?? h.env.key,
        });
        runtime.plays += 1;
        await p.done;
      },
      onTake: (take) => onSingTake(ex.id, take, h.env.profile.noiseFloorDb),
    };
    return env;
  }
  if (ex.kind === "sing" && (ex.target.from === "degrees" || fromMusic)) {
    const meter = ex.meter ?? h.env.meter;
    const key = ex.key ?? h.env.key;
    const cps = h.env.bpm / 60 / METERS[meter].unitsPerBar;
    const labels = singLabelsFor(ex, h.lesson.id);
    const degrees = ex.target.from === "degrees" ? ex.target.degrees : [];
    const stim = ex.stimulus.src === "code" ? ex.stimulus : null;
    env.sing = {
      notes:
        ex.target.from === "degrees"
          ? singTargets(ex.target, null, key, meter, cps).map((t, i) => ({
              midi: t.midi,
              at: t.on,
              dur: t.off - t.on,
              // A sight-sing's lane does not number the notes: the staff is what is read.
              label: ex.mode === "sight" ? "" : (degrees[i] ?? ""),
            }))
          : (fromMusic ?? []),
      mode: ex.mode,
      tol: ex.tol,
      showTrace: ex.showTrace,
      // The widget prints the labels (numbers, or number and syllable), clicks the count-in with numerals and
      // offers home and the chords that set it; "Hear it" plays the pattern itself on the piano.
      labels,
      ...(ex.cue.countInBars > 0
        ? { countIn: { beats: ex.cue.countInBars * METERS[meter].unitsPerBar, bpm: h.env.bpm } }
        : {}),
      reference: {
        tonic: 60 + tonicPc(key.tonic),
        mode: /minor/.test(key.mode) ? "minor" : "major",
        chords: ex.cue.context !== "none",
      },
      ...(stim
        ? {
            playTarget: () => {
              void playStimulus({ code: stim.code, bars: stim.bars, meter, key })
                .then((p) => {
                  runtime.plays += 1;
                  return p.done;
                })
                .catch(() => null);
            },
          }
        : {}),
      // contracts §8.1: an echo hears the target first; every other mode hears what sets home (the cue's
      // chords), then the widget's count-in. `sight` never hears the target before the take.
      playCue: async () => {
        const echo = ex.mode === "echo";
        if (echo && stim) {
          const p = await playStimulus({
            code: stim.code,
            bars: stim.bars,
            meter,
            key,
            context: ex.cue.context,
          });
          runtime.plays += 1;
          await p.done;
          return;
        }
        const lead = await playLead({ key, context: ex.cue.context, countInBars: 0, meter, cps });
        await lead?.done;
      },
      onQuietEvidence: () => h.markDone(),
      onTake: (take) => onSingTake(ex.id, take, h.env.profile.noiseFloorDb),
    };
  }
  return env;
}

/** A static view of the stimulus where the exercise asks for one (staff to read, roll to look at). */
export function StimulusView({ ex }: { ex: Part }) {
  const h = useStepHost();
  // Wave 4: "sing from the page" shows the tune as a lead sheet (one per step, not per part of an `all`).
  const lead =
    h.exercise?.kind === "all" &&
    !("stimulus" in ex && ex.stimulus?.src === "code" && ex.stimulus.showLeadSheet)
      ? null
      : leadSheetOf(h.step, ex);
  if (lead) return <LeadSheetView spec={lead} />;
  if (ex.kind === "staff-read")
    return <CodeMusic code={ex.source} bars={ex.bars} view="staff" label="The music to read" />;
  const stim = "stimulus" in ex && ex.stimulus?.src === "code" ? ex.stimulus : null;
  if (!stim) return null;
  // `showCode`: the stimulus is read as code too ("you can see the code and hear it"), read-only; in an `all`
  // whose parts share one stimulus, once, above the first part.
  const parts = h.exercise?.kind === "all" ? (h.exercise.parts as Part[]) : null;
  const firstWithCode = parts?.find(
    (q) => "stimulus" in q && q.stimulus?.src === "code" && q.stimulus.showCode,
  );
  const shared =
    parts !== null &&
    firstWithCode !== undefined &&
    firstWithCode.id !== ex.id &&
    "stimulus" in firstWithCode &&
    firstWithCode.stimulus?.src === "code" &&
    firstWithCode.stimulus.code === stim.code;
  const code =
    stim.showCode && !shared ? (
      <figure className="rounded-card border border-border bg-surface p-3" data-testid="stimulus-code">
        <figcaption className="mb-2 text-sm text-text-2">The code</figcaption>
        <pre className="overflow-x-auto font-mono text-sm leading-relaxed">
          {stim.code.replace(/[⟪⟫]/g, "")}
        </pre>
      </figure>
    ) : null;
  const music =
    stim.showRoll || stim.showStaff ? (
      <CodeMusic
        code={stim.code}
        bars={stim.bars}
        view={stim.showStaff ? "staff" : "roll"}
        label="The music"
      />
    ) : null;
  if (!code && !music) return null;
  return (
    <>
      {code}
      {music}
    </>
  );
}

/** The input of one part, in the stage slot (its Workbench) or the answer slot (its questions and widget). */
export function PartInput(p: PartInputProps) {
  const ex = p.ex;
  const env = useAnswerEnvFor(
    ex,
    p.runtime,
    p.trial,
    ex.kind === "run-investigate" ? starterOf(ex).code : null,
  );

  if (isCodeInput(ex)) {
    if (p.slot === "answer") return null;
    return <CodeStage {...p} code={p.value as string} setCode={(c) => p.onChange(c)} />;
  }

  if (ex.kind === "code-fill") {
    const values = p.value as Record<string, string>;
    if (p.slot === "stage") {
      const preview = fillBlanks(
        ex.code.starter,
        Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v || "~"])),
      );
      return <CodeStage {...p} code={stripMarkers(preview).code} setCode={() => {}} readOnly />;
    }
    return (
      <AnswerWidgetHost
        spec={answerSpecOf(ex) as AnswerSpec}
        value={values}
        onChange={(v) => p.onChange(v)}
        feedback={p.feedback}
        disabled={p.disabled}
        onSubmit={p.onSubmit}
        rung={p.rung}
        idBase={`${p.wbId}-fill`}
        label={p.label ?? "Fill the gaps"}
        {...(p.autoFocus ? { autoFocus: true } : {})}
      />
    );
  }

  if (ex.kind === "run-investigate") {
    const v = p.value as InvestigateValue;
    if (p.slot === "stage")
      return (
        <CodeStage
          {...p}
          code={v.code}
          setCode={(c) => p.onChange({ ...v, code: c })}
          workbenchFeedback={false}
        />
      );
    if (ex.questions.length === 0) return null;
    return (
      <AnswerEnvProvider value={env}>
        <ol className="flex flex-col gap-4" aria-label="Questions">
          {ex.questions.map((q: InvestigateQ, i) => (
            <li key={`${p.wbId}-q${i}`} className="flex flex-col gap-2" data-question={i + 1}>
              <p className="font-medium">
                <InlineMd text={q.prompt} />
              </p>
              <AnswerWidgetHost
                spec={questionSpec(q)}
                value={v.answers[i] as AnswerValue}
                onChange={(next) => {
                  const answers = [...v.answers];
                  answers[i] = next;
                  p.onChange({ ...v, answers });
                }}
                feedback={questionFeedback(p.feedback, i)}
                disabled={p.disabled}
                onSubmit={p.onSubmit}
                rung={p.rung}
                idBase={`${p.wbId}-q${i}`}
                label={q.prompt.replace(/[`*]/g, "")}
                {...(p.autoFocus && i === 0 ? { autoFocus: true } : {})}
              />
            </li>
          ))}
        </ol>
      </AnswerEnvProvider>
    );
  }

  // Answer kinds: stimulus and widget, all in the answer slot.
  if (p.slot === "stage") return null;
  const spec = withTrialOptions(answerSpecOf(ex), p.trial);
  if (!spec) return null;
  return (
    <AnswerEnvProvider value={env}>
      <div className="flex flex-col gap-3">
        <StimulusView ex={ex} />
        {ex.kind !== "tap" && <StimulusPlayer ex={ex} trial={p.trial} runtime={p.runtime} />}
        <AnswerWidgetHost
          spec={spec}
          value={p.value as AnswerValue}
          onChange={(v) => p.onChange(v)}
          feedback={p.feedback}
          disabled={p.disabled}
          onSubmit={p.onSubmit}
          rung={p.rung}
          idBase={`${p.wbId}-answer`}
          label={p.label ?? `Your answer: ${ex.prompt.replace(/[`*]/g, "")}`}
          {...(p.autoFocus ? { autoFocus: true } : {})}
        />
      </div>
    </AnswerEnvProvider>
  );
}

/** A question's share of the step feedback: its slot's mark only. */
function questionFeedback(fb: AnswerFeedback, i: number): AnswerFeedback {
  if (fb.state !== "wrong") return fb.state === "revealed" ? { state: "idle" } : fb;
  const mark = fb.marks?.find((m) => m.part === i);
  return mark ? { state: "wrong", marks: [{ part: 0, ok: false }] } : { state: "correct" };
}
