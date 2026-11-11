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
  Trial,
} from "@oak/api";
import { fillBlanks, stripMarkers } from "@oak/api";
import { normalize, singTargets } from "@oak/grader";
import { METERS } from "@oak/theory";
import { Play, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { type AnswerEnv, AnswerEnvProvider, appAudio } from "../answers/env.tsx";
import { emptyValue, isComplete, responseOf } from "../answers/response.ts";
import type { AnswerFeedback, AnswerKind, AnswerSpec, AnswerSpecOf, AnswerValue } from "../answers/types.ts";
import { auditionCode } from "../lib/audition.ts";
import { analyzeCode } from "../lib/grader-client.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Workbench, type WorkbenchProps } from "../workbench/Workbench.tsx";
import { lessonWidgetFor } from "./answers.tsx";
import { type Playing, playStimulus } from "./audio.ts";
import { InlineMd, useStepHost } from "./frame.tsx";
import { answerSpecOf, questionSpec, revealCode } from "./model.ts";
import { CodeMusic } from "./music.tsx";

type Part = Exclude<Exercise, AllEx>;

/** Mutable per-input runtime: the AudioContext time of bar 1 of the last tap take. */
export interface InputRuntime {
  tapStart: number | null;
  plays: number;
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

export function isCodeInput(ex: Exercise): boolean {
  return CODE_INPUT.has(ex.kind);
}

/** The starter of a code part as the editor shows it (clean), and its editable regions. */
export function starterOf(ex: Exercise): { code: string; editable: CodeRange[] | null } {
  if ("code" in ex && ex.code && typeof ex.code === "object" && "starter" in ex.code) {
    const c = stripMarkers(ex.code.starter);
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
  return spec ? emptyValue(spec as AnswerSpecOf<AnswerKind>) : null;
}

export function inputReady(ex: Part, value: unknown): boolean {
  if (isCodeInput(ex)) return typeof value === "string";
  if (ex.kind === "run-investigate") {
    const v = value as InvestigateValue;
    return ex.questions.every((q, i) => isComplete(questionSpec(q), v.answers[i] as AnswerValue));
  }
  const spec = answerSpecOf(ex);
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
  const r = responseOf(spec, value as AnswerValue);
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

function useWorkbenchBase(ex: Part, variant: "full" | "compact"): Omit<WorkbenchProps, "id" | "code"> {
  const h = useStepHost();
  const base = h.workbench;
  const lessonCtx = {
    ...base.lessonCtx,
    ...(ex.key ? { key: ex.key } : {}),
    ...(ex.meter ? { meter: ex.meter } : {}),
  };
  return { ...base, lessonCtx, variant };
}

/** The Workbench of a code part, its A/B target and its marks. */
function CodeStage(p: PartInputProps & { code: string; setCode(code: string): void; readOnly?: true }) {
  const base = useWorkbenchBase(p.ex, p.variant ?? "full");
  const { editable } = starterOf(p.ex);
  const reference = revealCode(p.ex);
  const audible =
    "target" in p.ex && p.ex.target && typeof p.ex.target === "object" && "audible" in p.ex.target
      ? p.ex.target.audible
      : false;
  return (
    <Workbench
      {...base}
      id={p.wbId}
      code={p.code}
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
      target={reference && audible ? { code: reference, audible: "fromHint2" } : null}
      onChange={(c) => p.setCode(c)}
      onEvaluated={(o) => {
        if (o.ok) p.onRun?.(o.code);
      }}
    />
  );
}

function AnswerWidgetHost(p: {
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

/** The answer environment of a part: calibration, quiet mode, the tap take and the notes to sing. */
function useAnswerEnvFor(
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
  const env: AnswerEnv = { profile: h.env.profile, quiet: h.env.profile.quiet, audio: appAudio };
  if (code !== null) env.code = code;
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
  if (ex.kind === "sing" && (ex.target.from === "degrees" || fromMusic)) {
    const meter = ex.meter ?? h.env.meter;
    const key = ex.key ?? h.env.key;
    const cps = h.env.bpm / 60 / METERS[meter].unitsPerBar;
    env.sing = {
      notes:
        ex.target.from === "degrees"
          ? singTargets(ex.target, null, key, meter, cps).map((t, i) => ({
              midi: t.midi,
              at: t.on,
              dur: t.off - t.on,
              label: ex.target.from === "degrees" ? (ex.target.degrees[i] ?? "") : "",
            }))
          : (fromMusic ?? []),
      mode: ex.mode,
      tol: ex.tol,
      showTrace: ex.showTrace,
      playCue: async () => {
        if (ex.stimulus.src !== "code") return;
        const p = await playStimulus({ code: ex.stimulus.code, bars: ex.stimulus.bars, meter, key });
        runtime.plays += 1;
        await p.done;
      },
    };
  }
  return env;
}

/** A static view of the stimulus where the exercise asks for one (staff to read, roll to look at). */
function StimulusView({ ex }: { ex: Part }) {
  if (ex.kind === "staff-read")
    return <CodeMusic code={ex.source} bars={ex.bars} view="staff" label="The music to read" />;
  if ("stimulus" in ex && ex.stimulus?.src === "code" && (ex.stimulus.showRoll || ex.stimulus.showStaff))
    return (
      <CodeMusic
        code={ex.stimulus.code}
        bars={ex.stimulus.bars}
        view={ex.stimulus.showStaff ? "staff" : "roll"}
        label="The music"
      />
    );
  return null;
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
  const spec = answerSpecOf(ex);
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
