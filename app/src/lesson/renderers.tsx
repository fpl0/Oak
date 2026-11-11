// The step renderers (docs/design/wave2.md §3.2 `rendererFor`): one per exercise kind of contracts §5.4.
// Listen, predict, the Make and multi-part `all` steps have their own; every other kind (run, investigate,
// modify, fill, error hunt, order, quiz, ear, dictation, notation, sing, tap, transcription) is the single-input
// renderer over `PartInput`. Renderers grade in the browser through the host and report with `onCheck`.
import type { AllEx, AttemptResponse, Exercise, ExerciseKind, GradeResult } from "@oak/api";
import { Check, CircleDashed } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { AnswerFeedback, AnswerSpec } from "../answers/types.ts";
import { IS_MAC } from "../ui/keys/KeymapProvider.tsx";
import { Button } from "../ui/kit/Button.tsx";
import { Kbd } from "../ui/kit/basics.tsx";
import { useWorkbenchServices } from "../workbench/services.tsx";
import { Workbench } from "../workbench/Workbench.tsx";
import { answerFeedback, issueLines, revealValue, summaryOf, viewFor } from "./feedback.ts";
import { InlineMd, StepLayout, useStepHost } from "./frame.tsx";
import {
  type InputRuntime,
  type InvestigateValue,
  initialInput,
  inputReady,
  inputResponse,
  isCodeInput,
  PartInput,
  starterOf,
} from "./inputs.tsx";
import { answerSpecOf, revealCode } from "./model.ts";
import type { ExerciseRenderer, ExerciseRendererProps, RendererFor } from "./types.ts";

type Part = Exclude<Exercise, AllEx>;

const CHECK_KEYS = IS_MAC ? "⌘⇧↵" : "Ctrl+Shift+Enter";

function extraReplays(ex: Exercise, rt: InputRuntime): number {
  const replays = "cue" in ex && ex.cue ? ex.cue.replays : -1;
  return replays < 0 ? 0 : Math.max(0, rt.plays - 1 - replays);
}

/** In a checkpoint the widgets show no verdict, only that a check runs. */
function quietIn(mode: "lesson" | "checkpoint", checking: boolean): AnswerFeedback | null {
  if (mode !== "checkpoint") return null;
  return checking ? { state: "pending" } : { state: "idle" };
}

/** The check flow every renderer shares: grade in the browser, then report to the host. */
function useCheck(props: ExerciseRendererProps, build: () => AttemptResponse | null, rt: InputRuntime) {
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

function CheckButton({
  onClick,
  disabled,
  label: wanted = "Check",
}: {
  onClick(): void;
  disabled: boolean;
  label?: string;
}) {
  const h = useStepHost();
  const label = h.mode === "checkpoint" ? "Save answer" : wanted;
  return (
    <Button
      variant={h.passed ? "secondary" : "primary"}
      onClick={onClick}
      disabled={disabled || h.review}
      loading={h.checking}
      data-testid="check"
      title={`${label} (${CHECK_KEYS})`}
    >
      {label} <Kbd tone={h.passed ? "default" : "inverse"}>{CHECK_KEYS}</Kbd>
    </Button>
  );
}

/** The step's own feedback line(s), redacted to the rung; announced politely. */
export function StepFeedback({ detail }: { detail: boolean }) {
  const h = useStepHost();
  const r = h.result;
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
  const lines = detail || r.status === "error" ? issueLines(view) : [];
  const tone =
    r.status === "pass"
      ? "border-accent bg-lane-in"
      : r.status === "error"
        ? "border-accent-2"
        : "border-issue/60";
  return (
    <section
      aria-live="polite"
      aria-label="Check result"
      className={`rounded-control border-l-2 px-3 py-2 ${tone}`}
      data-testid="step-feedback"
      data-status={r.status}
    >
      <p className="font-medium" data-testid="step-feedback-summary">
        {r.status === "ungraded" ? "Noted." : summaryOf(view, r)}
      </p>
      {lines.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {lines.map((l) => (
            <li key={l.key} data-testid="feedback-line">
              <span className="text-text-2">{l.where}</span>
              {l.what && <span>: {l.what}</span>}
              {l.fix && <span className="text-accent"> → {l.fix}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Rung 4 on a code step: the solution, with the lines that differ marked, and Apply. */
function RevealCard({ ex, current, apply }: { ex: Exercise; current: string; apply(code: string): void }) {
  const h = useStepHost();
  const code = revealCode(ex);
  if (h.rung < 4 || !code) return null;
  const mine = new Set(current.split("\n"));
  return (
    <section
      className="rounded-card border border-border bg-surface p-3"
      aria-label="The answer"
      data-testid="reveal"
    >
      <p className="text-sm font-medium">One way to write it</p>
      <pre className="mt-2 overflow-x-auto rounded-control bg-surface-2 p-2 font-mono text-sm leading-relaxed">
        {code.split("\n").map((line, i) => (
          <div key={`${i}-${line}`} className={mine.has(line) ? "" : "bg-accent/15"}>
            {line || " "}
          </div>
        ))}
      </pre>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={() => apply(code)} data-testid="apply-reveal">
          Use this code
        </Button>
        <span className="text-sm text-text-3">Highlighted lines differ from yours.</span>
      </div>
    </section>
  );
}

// --- the single-input renderer ----------------------------------------------------------------------

function SingleRenderer(props: ExerciseRendererProps) {
  const h = useStepHost();
  const ex = h.exercise as Part;
  const rt = useRef<InputRuntime>({ tapStart: null, plays: 0 }).current;
  const code = isCodeInput(ex);
  const [local, setLocal] = useState<unknown>(() => {
    const v = initialInput(ex);
    if (ex.kind === "run-investigate" && h.code !== null) return { ...(v as InvestigateValue), code: h.code };
    return v;
  });
  const value = code ? (h.code ?? starterOf(ex).code) : local;
  const setValue = (v: unknown) => {
    if (code) h.setCode(v as string);
    else {
      setLocal(v);
      if (ex.kind === "run-investigate") h.setCode((v as InvestigateValue).code);
    }
  };
  const ready = inputReady(ex, value);
  const isRun = ex.kind === "run-investigate" && ex.questions.length === 0;
  const { check, checked } = useCheck(props, () => (ready ? inputResponse(ex, value, rt) : null), rt);
  const spec: AnswerSpec | null = answerSpecOf(ex);
  const feedback =
    quietIn(h.mode, h.checking) ??
    answerFeedback({
      result: h.result,
      checking: h.checking,
      rung: h.rung,
      spec,
      reveal: revealValue(ex, spec, h.trial),
    });
  const autoCheck =
    "code" in ex && typeof ex.code === "object" && ex.code !== null && "autoCheckOnRun" in ex.code
      ? ex.code.autoCheckOnRun !== false
      : true;
  const common = {
    ex,
    value,
    onChange: setValue,
    wbId: `l-${h.step.id.toLowerCase()}-${h.seriesNo}`,
    feedback,
    result: h.result,
    rung: h.rung,
    disabled: h.checking || h.review,
    onSubmit: () => void check(),
    runtime: rt,
    trial: h.trial,
    passed: h.passed,
    workbenchFeedback: code && h.mode === "lesson",
    autoFocus: !code && ex.kind !== "run-investigate",
    onRun: () => {
      if (isRun || ex.kind === "run-investigate") h.markDone();
      // ux §3.5: after the first explicit Check, every successful Run checks again.
      if (code && checked && autoCheck && !h.passed) void check();
    },
  };
  const stage = <PartInput {...common} slot="stage" />;
  const hasStage = code || ex.kind === "code-fill" || ex.kind === "run-investigate";
  return (
    <StepLayout
      {...(hasStage ? { stage } : {})}
      answer={
        <>
          <PartInput {...common} slot="answer" />
          {isRun ? (
            <p className="text-sm text-text-2">
              Press <Kbd>{IS_MAC ? "⌘↵" : "Ctrl+Enter"}</Kbd> in the editor, or Play, and watch the roll.
            </p>
          ) : null}
          <StepFeedback detail={!code} />
          {code || ex.kind === "code-fill" ? (
            <RevealCard ex={ex} current={typeof value === "string" ? value : ""} apply={(c) => setValue(c)} />
          ) : null}
        </>
      }
      actions={isRun ? null : <CheckButton onClick={() => void check()} disabled={!ready || h.checking} />}
    />
  );
}

// --- listen -------------------------------------------------------------------------------------------

function ListenRenderer() {
  const h = useStepHost();
  const ex = h.exercise as Extract<Exercise, { kind: "listen" }>;
  const [i, setI] = useState(0);
  const item = ex.items[i] ?? ex.items[0];
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const markDone = h.markDone;
  if (!item) return <StepLayout />;
  return (
    <StepLayout
      stage={
        <div className="flex flex-col gap-3">
          {ex.items.length > 1 && (
            <fieldset className="flex gap-2">
              <legend className="sr-only">Loops</legend>
              {ex.items.map((it, n) => (
                <Button
                  key={it.code}
                  size="sm"
                  variant={n === i ? "primary" : "secondary"}
                  aria-pressed={n === i}
                  onClick={() => setI(n)}
                >
                  Loop {n + 1}
                </Button>
              ))}
            </fieldset>
          )}
          <p className="text-sm text-text-2">
            <InlineMd text={item.caption} />
          </p>
          <Workbench
            {...h.workbench}
            id={`l-${h.step.id.toLowerCase()}-${i}`}
            code={item.code}
            readOnly
            lessonCtx={{ ...h.workbench.lessonCtx, loopBars: item.bars }}
            onEvaluated={(o) => {
              if (!o.ok) return;
              // ux §3.2: a listen step is complete once one full loop has played.
              if (timer.current !== null) window.clearTimeout(timer.current);
              const loopMs = (item.bars / (o.cps ?? 0.5)) * 1000;
              timer.current = window.setTimeout(markDone, loopMs);
            }}
          />
        </div>
      }
      answer={
        <p className="text-sm text-text-2">
          Press Play (or <Kbd>Space</Kbd> on the workbench) and listen to the whole loop.
        </p>
      }
    />
  );
}

// --- predict ------------------------------------------------------------------------------------------

function PredictRenderer(props: ExerciseRendererProps) {
  const h = useStepHost();
  const ex = h.exercise as Extract<Exercise, { kind: "predict" }>;
  const rt = useRef<InputRuntime>({ tapStart: null, plays: 0 }).current;
  const [value, setValue] = useState<unknown>(() => initialInput(ex));
  const answered = h.result !== null || (h.state?.attempts ?? 0) > 0 || h.review;
  const ready = inputReady(ex, value);
  const { check } = useCheck(props, () => (ready ? inputResponse(ex, value, rt) : null), rt);
  useEffect(() => {
    if (answered) h.markDone();
  }, [answered, h.markDone]);
  const right = h.result ? h.result.score >= 1 : null;
  return (
    <StepLayout
      stage={
        answered ? (
          <Workbench
            {...h.workbench}
            id={`l-${h.step.id.toLowerCase()}-run`}
            code={ex.code}
            readOnly
            lessonCtx={{ ...h.workbench.lessonCtx, loopBars: ex.bars }}
          />
        ) : (
          <figure className="rounded-card border border-border bg-surface p-3">
            <figcaption className="mb-2 text-sm text-text-2">
              The code. Read it, then make your guess.
            </figcaption>
            <pre className="overflow-x-auto font-mono text-sm leading-relaxed" data-testid="predict-code">
              {ex.code}
            </pre>
          </figure>
        )
      }
      answer={
        <>
          <PartInput
            ex={ex}
            value={value}
            onChange={setValue}
            slot="answer"
            wbId={`l-${h.step.id.toLowerCase()}`}
            feedback={{ state: "idle" }}
            result={null}
            rung={0}
            disabled={answered || h.checking}
            onSubmit={() => void check()}
            runtime={rt}
            trial={null}
            autoFocus={!answered}
            label="Your guess"
          />
          {answered && (
            <p
              role="status"
              className="rounded-control border-l-2 border-accent bg-lane-in px-3 py-2"
              data-testid="predict-outcome"
            >
              {right === false
                ? "Now press Play and listen: it does something else. That gap is where the learning is."
                : right === true
                  ? "Now press Play and hear whether it does what you guessed."
                  : "Now press Play and compare it with what you expected."}
            </p>
          )}
        </>
      }
      actions={
        answered ? null : (
          <CheckButton onClick={() => void check()} disabled={!ready} label="Lock in my guess" />
        )
      }
    />
  );
}

// --- multi-part steps ---------------------------------------------------------------------------------

function AllRenderer(props: ExerciseRendererProps) {
  const h = useStepHost();
  const ex = h.exercise as AllEx;
  const parts = ex.parts;
  const runtimes = useRef<InputRuntime[]>(parts.map(() => ({ tapStart: null, plays: 0 }))).current;
  const [values, setValues] = useState<unknown[]>(() => parts.map((p) => initialInput(p)));
  const ready = parts.every((p, i) => inputReady(p, values[i]));
  const rt: InputRuntime = { tapStart: null, plays: runtimes.reduce((a, r) => a + r.plays, 0) };
  const { check } = useCheck(
    props,
    () =>
      ready ? { parts: parts.map((p, i) => inputResponse(p, values[i], runtimes[i] as InputRuntime)) } : null,
    rt,
  );
  const anyCode = parts.some((p) => isCodeInput(p) || p.kind === "code-fill" || p.kind === "run-investigate");
  const fb =
    quietIn(h.mode, h.checking) ??
    answerFeedback({ result: h.result, checking: h.checking, rung: h.rung, spec: null, reveal: null });
  const cards: ReactNode = (
    <ol className="flex flex-col gap-4" aria-label="Parts">
      {parts.map((p, i) => {
        const set = (v: unknown) =>
          setValues((vs) => {
            const next = [...vs];
            next[i] = v;
            return next;
          });
        const partProps = {
          ex: p,
          value: values[i],
          onChange: set,
          wbId: `l-${h.step.id.toLowerCase()}-p${i + 1}-${h.seriesNo}`,
          feedback: partFeedback(fb, h.result),
          result: null as GradeResult | null,
          rung: h.rung,
          disabled: h.checking || h.review,
          onSubmit: () => void check(),
          runtime: runtimes[i] as InputRuntime,
          trial: h.trials[i] ?? null,
          variant: "compact" as const,
        };
        return (
          <li key={p.id} className="rounded-card border border-border bg-surface p-3" data-part={i + 1}>
            <p className="mb-2 text-sm font-medium">
              <span className="mr-2 text-text-3">{i + 1}.</span>
              <InlineMd text={p.prompt} />
            </p>
            <div className="flex flex-col gap-3">
              <PartInput {...partProps} slot="stage" />
              <PartInput {...partProps} slot="answer" />
            </div>
          </li>
        );
      })}
    </ol>
  );
  return (
    <StepLayout
      {...(anyCode ? { stage: cards } : {})}
      answer={
        <>
          {anyCode ? null : cards}
          <StepFeedback detail />
        </>
      }
      actions={<CheckButton onClick={() => void check()} disabled={!ready || h.checking} label="Check all" />}
    />
  );
}

/** Parts of an `all` share the step's verdict; a pass marks them all correct. */
function partFeedback(fb: ReturnType<typeof answerFeedback>, r: GradeResult | null) {
  if (fb.state === "correct" || fb.state === "pending") return fb;
  return r && r.status === "fail"
    ? ({ state: "idle" } as const)
    : fb.state === "revealed"
      ? ({ state: "idle" } as const)
      : fb;
}

// --- the Make -----------------------------------------------------------------------------------------

function MakeRenderer() {
  const h = useStepHost();
  const ex = h.exercise as Extract<Exercise, { kind: "code-make" | "compose-brief" }>;
  const starter = starterOf(ex);
  const code = h.code ?? starter.code;
  const editorId = `l-${h.step.id.toLowerCase()}-make`;
  const { oak } = useWorkbenchServices();
  // The starter's marked spot (`⟪4⟫`: "change the highlighted number") gets the dashed target box until the
  // learner edits; the whole Make stays editable. Without it the prompt pointed at a highlight nobody could see.
  const pristine = code === starter.code && (starter.editable?.length ?? 0) > 0;
  useEffect(() => {
    if (!pristine) return;
    const mark = () => {
      const ed = oak.editors.get(editorId);
      if (!ed || ed.disposed) return false;
      ed.setMarks((starter.editable ?? []).map((range) => ({ range, kind: "target" as const })));
      return true;
    };
    if (mark()) return;
    const t = window.setInterval(() => {
      if (mark()) window.clearInterval(t);
    }, 150);
    return () => window.clearInterval(t);
  });
  const [title, setTitle] = useState(h.lesson.title);
  const seq = useRef(0);
  const r = h.result;
  const live = async (src: string) => {
    const my = ++seq.current;
    const result = await h.gradeQuiet({ code: src }).catch(() => null);
    if (my === seq.current) h.preview(result);
  };
  const rubric = ex.rubric;
  const okOf = (id: string) => r?.rubric?.find((x) => x.ruleId === id)?.ok;
  const required = rubric.find((x) => x.required);
  const requiredOk = required ? okOf(required.id) === true : true;
  const beyond = r?.diagnostics.some((d) => d.id === "make.beyond-brief") ?? false;
  const lockedDiag = r?.diagnostics.find((d) => d.id.startsWith("code.locked")) ?? null;
  const blocked = lockedDiag !== null;
  const save = () => h.save?.(code, title.trim() || h.lesson.title);
  // The list follows the code as it changes (debounced), and every Run checks at once.
  const liveRef = useRef(live);
  liveRef.current = live;
  useEffect(() => {
    const t = window.setTimeout(() => void liveRef.current(code), 700);
    return () => window.clearTimeout(t);
  }, [code]);
  useEffect(() => {
    h.setCheck(() => void live(code));
    return () => h.setCheck(null);
  });
  return (
    <StepLayout
      stage={
        <Workbench
          {...h.workbench}
          id={editorId}
          tutorBars
          code={code}
          onChange={(c) => h.setCode(c)}
          onEvaluated={(o) => {
            // A refused run (a locked tool) is graded too, so the list says why in words.
            if (o.ok) h.markDone();
            void live(o.code);
          }}
        />
      }
      answer={
        <>
          <section aria-label="What the Make asks for" data-testid="make-checklist">
            <p className="text-sm text-text-2">
              {ex.kind === "code-make" ? `${ex.bars[0]} to ${ex.bars[1]} bars. ` : ""}Run it to tick the list.
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {rubric.map((rule) => {
                const ok = okOf(rule.id);
                return (
                  <li
                    key={rule.id}
                    className="flex items-start gap-2 text-sm"
                    data-rule={rule.id}
                    data-ok={ok ? "1" : "0"}
                  >
                    {ok ? (
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                    ) : (
                      <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-text-3" />
                    )}
                    <span>
                      <InlineMd text={rule.label} />
                      {rule.required ? (
                        <span className="text-text-3"> (the one that counts today)</span>
                      ) : null}
                      <span className="sr-only">{ok ? ", done" : ", not yet"}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
          {beyond && (
            <p
              role="status"
              className="rounded-control border-l-2 border-accent bg-lane-in px-3 py-2 text-sm"
              data-testid="beyond-brief"
            >
              You went past today's brief. Nice.
            </p>
          )}
          {blocked && (
            <p
              role="status"
              className="rounded-control border-l-2 border-accent-2 px-3 py-2 text-sm"
              data-testid="locked-tool"
            >
              {lockedDiag ? h.render(lockedDiag) : null}
            </p>
          )}
          {r?.status === "error" && !blocked && (
            <p role="status" className="rounded-control border-l-2 border-accent-2 px-3 py-2 text-sm">
              The code did not run yet: {r.messages[0]?.text ?? "check the editor for the marked spot."}
            </p>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-2">Sketch title</span>
            <input
              type="text"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9 rounded-control border border-border bg-surface px-2"
              data-testid="sketch-title"
            />
          </label>
        </>
      }
      actions={
        <Button variant="primary" onClick={save} loading={h.checking} data-testid="save-sketch">
          {r && !requiredOk ? "Save anyway" : "Save sketch"}
        </Button>
      }
      answerFirst
    />
  );
}

// --- the registry -------------------------------------------------------------------------------------

const RENDERERS: Partial<Record<ExerciseKind, ExerciseRenderer<never>>> = {
  listen: ListenRenderer as unknown as ExerciseRenderer<never>,
  predict: PredictRenderer as unknown as ExerciseRenderer<never>,
  all: AllRenderer as unknown as ExerciseRenderer<never>,
  "code-make": MakeRenderer as unknown as ExerciseRenderer<never>,
  "compose-brief": SingleRenderer as unknown as ExerciseRenderer<never>,
};

export const rendererFor: RendererFor = <K extends ExerciseKind>(kind: K) =>
  (RENDERERS[kind] ?? SingleRenderer) as unknown as ExerciseRenderer<K>;

/** The Make renderer for a compose-brief used as a step's Make (capstone-style lesson Makes). */
export { MakeRenderer };
