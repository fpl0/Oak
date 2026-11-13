// Staged chord dictation (Wave 4 `dictation.stage-answers`; ux §4.5 BassFirstFlow): one card per stage, in the
// step's order (bass, then quality, then numerals). Each stage has its own widget (degree pad, a strip of
// qualities, the numeral palette) and its own check; in the sequential flow a stage opens only when the one before
// is right or shown, so the bass is always heard first. Listening sits above: "Replay" (`R`) and "Bass only"
// (`Shift+R`), with the replays left when the step counts them. A host renders this instead of one AnswerView for
// a dictation step with `stageAnswers`; it grades each stage itself (`stagedResponse(spec, value, stage)`) and passes
// one feedback per stage. A widget never grades.
import type { DictationStage, HintRung } from "@oak/api";
import { clsx } from "clsx";
import { Check, Eye, Lock, Play, Waves } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "../../ui/kit/index.ts";
import { AnswerEnvProvider, useAnswerEnv, useSubmitVerb } from "../env.tsx";
import { qualityLabel } from "../keys.ts";
import { AnswerView } from "../registry.tsx";
import type { AnswerFeedback, AnswerValue } from "../types.ts";
import { focusFirst, KeyHint } from "../ui.tsx";
import { DegreeChip } from "../widgets/DegreePad.tsx";
import { RnGlyph } from "../widgets/Harmony.tsx";
import {
  currentStage,
  STAGE_TEXT,
  type StagedFeedback,
  type StagedSpec,
  type StagedValue,
  type StageStatus,
  stageComplete,
  stageEntries,
  stageStatuses,
  stageWidget,
} from "./stages.ts";

export interface StagedListen {
  /** Plays the whole stimulus again. */
  replay?: () => void;
  /** Plays only the bass line (the stage-1 listening aid). */
  bassOnly?: () => void;
  /** Replays left (`Cue.replays`); absent or −1: unlimited. */
  replaysLeft?: number;
}

export interface StagedDictationProps {
  spec: StagedSpec;
  value: StagedValue;
  onChange(next: StagedValue): void;
  /** The learner checks one stage (its button, or Enter inside it); the host grades it and sets its feedback. */
  onCheckStage(stage: DictationStage): void;
  feedback: StagedFeedback;
  /** "Show me" on a stage after a wrong check (the host decides what a reveal costs); absent: no button. */
  onReveal?: (stage: DictationStage) => void;
  listen?: StagedListen;
  disabled?: boolean;
  label: string;
  idBase: string;
  autoFocus?: boolean;
  rung?: HintRung;
  solfege?: "numbers" | "syllables";
}

const STATUS_TEXT: Record<StageStatus, string> = {
  locked: "Locked",
  open: "Your turn",
  pending: "Checking",
  passed: "Right",
  revealed: "Shown",
};

function StatusChip({ status }: { status: StageStatus }) {
  const icon =
    status === "passed" ? (
      <Check aria-hidden className="size-3.5" />
    ) : status === "revealed" ? (
      <Eye aria-hidden className="size-3.5" />
    ) : status === "locked" ? (
      <Lock aria-hidden className="size-3.5" />
    ) : null;
  return (
    <span
      data-testid="stage-status"
      className={clsx(
        "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[0.75rem] font-medium",
        status === "passed" && "bg-accent text-on-accent",
        status === "revealed" && "border border-dashed border-accent-2 text-text-2",
        (status === "open" || status === "pending") && "bg-surface-2 text-text",
        status === "locked" && "text-text-3",
      )}
    >
      {icon}
      {STATUS_TEXT[status]}
    </span>
  );
}

/** One answered entry as the stage prints it: a degree chip, a quality, a numeral. */
function Entry({ stage, text }: { stage: DictationStage; text: string }) {
  if (stage === "bass" && /^[b#]?[1-7]$/.test(text)) return <DegreeChip degree={text as never} size="sm" />;
  return (
    <span className="inline-flex h-8 min-w-10 items-center justify-center rounded-control border border-border bg-surface px-2 text-sm font-semibold">
      {stage === "rn" ? (
        <RnGlyph rn={text} />
      ) : stage === "quality" ? (
        qualityLabel(text as never).short
      ) : (
        text
      )}
    </span>
  );
}

/**
 * A finished stage folds to its answer, so the open stage stays in view: the learner's entries, and under a
 * revealed stage the answer it was given.
 */
function StageSummary({
  stage,
  mine,
  shown,
}: {
  stage: DictationStage;
  mine: readonly string[];
  shown: readonly string[] | null;
}) {
  const spoken = (xs: readonly string[]) => xs.join(", ");
  return (
    <div className="flex flex-col gap-1.5" data-testid="stage-summary">
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-text-2">
        <span className="w-20">{shown ? "Yours:" : "Your answer:"}</span>
        <span className="sr-only">{spoken(mine)}</span>
        {mine.map((t, k) => (
          <Entry key={k} stage={stage} text={t} />
        ))}
      </p>
      {shown ? (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-text-2">
          <span className="w-20">Answer:</span>
          <span className="sr-only">{spoken(shown)}</span>
          {shown.map((t, k) => (
            <Entry key={k} stage={stage} text={t} />
          ))}
        </p>
      ) : null}
    </div>
  );
}

export function StagedDictation(p: StagedDictationProps) {
  const { spec, value, feedback, disabled } = p;
  const verb = useSubmitVerb();
  const root = useRef<HTMLDivElement>(null);
  const statuses = stageStatuses(spec, feedback);
  const current = currentStage(spec, feedback);
  const listen = p.listen;
  const left = listen?.replaysLeft;
  const outOfReplays = left !== undefined && left >= 0 && left === 0;
  const bassStatus = statuses.bass;
  const bassKnown =
    (bassStatus === "passed" || bassStatus === "revealed") && Array.isArray(value.bass)
      ? (value.bass as string[])
      : null;
  const bassShown =
    bassStatus === "revealed" && feedback.bass?.state === "revealed"
      ? (feedback.bass.correct as string[])
      : bassKnown;
  // Stage 2 of BassFirstFlow (ux §4.5): the palette lights the numerals whose chord contains each slot's bass.
  const env = useAnswerEnv();
  const rnEnv = bassShown ? { ...env, harmony: { ...env.harmony, bassDegrees: bassShown } } : env;

  // When a stage opens (the one before passed or was shown), focus moves into it if focus was in the flow.
  const lastOpen = useRef<DictationStage | null>(null);
  // Whether the learner is working inside the flow: a finished stage folds away with the focused control in it,
  // which drops focus to the body without a blur, so "inside" is remembered rather than read from the DOM.
  const within = useRef(false);
  useEffect(() => {
    const el = root.current;
    if (!el || !current) return;
    const first = lastOpen.current === null;
    const lost = document.activeElement === document.body || document.activeElement === null;
    const inside = el.contains(document.activeElement) || (within.current && lost);
    if (lastOpen.current !== current && (first ? p.autoFocus : inside)) {
      focusFirst(el.querySelector<HTMLElement>(`[data-stage="${current}"] [data-stage-body]`));
    }
    lastOpen.current = current;
  }, [current, p.autoFocus]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.nativeEvent.isComposing) return;
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    if (e.key === "r" || e.key === "R") {
      const f = e.shiftKey ? listen?.bassOnly : listen?.replay;
      if (!f || outOfReplays) return;
      e.preventDefault();
      f();
    }
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of stage cards with its own keys; a fieldset would add a legend we style apart
    <div
      ref={root}
      role="group"
      aria-label={p.label}
      data-staged={spec.stages.join(" ")}
      onKeyDown={onKeyDown}
      onFocus={() => {
        within.current = true;
      }}
      onBlur={(e) => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) within.current = false;
      }}
      className="flex min-w-0 flex-col gap-3"
    >
      {listen?.replay || listen?.bassOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          {listen.replay ? (
            <Button
              size="sm"
              data-enter="native"
              icon={<Play aria-hidden className="size-4" />}
              disabled={outOfReplays}
              onClick={listen.replay}
            >
              Replay
            </Button>
          ) : null}
          {listen.bassOnly ? (
            <Button
              size="sm"
              data-enter="native"
              icon={<Waves aria-hidden className="size-4" />}
              disabled={outOfReplays}
              onClick={listen.bassOnly}
            >
              Bass only
            </Button>
          ) : null}
          {left !== undefined && left >= 0 ? (
            <span className="text-sm text-text-2" data-testid="replays-left">
              {left === 0 ? "No replays left: answer from memory." : `Replays left: ${left}`}
            </span>
          ) : null}
          <span className="flex flex-wrap gap-x-3 text-[0.8125rem] text-text-3">
            {listen.replay ? <KeyHint keys={["R"]}>replay</KeyHint> : null}
            {listen.bassOnly ? <KeyHint keys={["⇧ R"]}>bass only</KeyHint> : null}
          </span>
        </div>
      ) : null}
      <ol className="flex flex-col gap-3">
        {spec.stages.map((stage, i) => {
          const status = statuses[stage];
          const widget = stageWidget(spec, stage);
          const text = STAGE_TEXT[stage];
          const fb: AnswerFeedback = feedback[stage] ?? { state: "idle" };
          const finished = status === "passed" || status === "revealed";
          const locked = status === "locked";
          const ready = stageComplete(spec, stage, value);
          const headId = `${p.idBase}-${stage}-h`;
          return (
            <li
              key={stage}
              data-stage={stage}
              data-status={status}
              aria-labelledby={headId}
              className={clsx(
                "flex flex-col gap-2 rounded-card border p-3",
                locked ? "border-dashed border-border bg-transparent" : "border-border bg-surface",
                status === "open" && current === stage && "border-text-3",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 id={headId} className="text-base font-semibold">
                  <span className="text-text-3 tabular-nums">{i + 1} · </span>
                  {text.title}
                </h3>
                <StatusChip status={status} />
                {!locked ? <span className="text-sm text-text-2">{text.ask}</span> : null}
              </div>
              {locked ? (
                <p className="text-sm text-text-3">{text.locked}</p>
              ) : !widget ? (
                <p className="text-sm text-text-2">
                  This stage has no answer set. Continue to the next one; nothing is lost.
                </p>
              ) : finished ? (
                <StageSummary
                  stage={stage}
                  mine={stageEntries(widget, value[stage])}
                  shown={fb.state === "revealed" ? stageEntries(widget, fb.correct) : null}
                />
              ) : (
                <div data-stage-body className="flex flex-col gap-2">
                  {stage === "rn" && bassShown ? (
                    <p
                      className="flex flex-wrap items-center gap-1.5 text-sm text-text-2"
                      data-testid="bass-reminder"
                    >
                      <span>Bass:</span>
                      {bassShown.map((d, k) => (
                        <DegreeChip key={`${k}-${d}`} degree={d as never} size="sm" />
                      ))}
                    </p>
                  ) : null}
                  <AnswerEnvProvider value={stage === "rn" ? rnEnv : env}>
                    <AnswerView
                      spec={widget}
                      value={(value[stage] ?? (widget.ui === "text" ? "" : [])) as AnswerValue}
                      onChange={(v) => p.onChange({ ...value, [stage]: v })}
                      onSubmit={() => {
                        if (!finished && ready) p.onCheckStage(stage);
                      }}
                      disabled={disabled || finished || status === "pending"}
                      feedback={fb}
                      label={`${p.label}: ${text.title}`}
                      idBase={`${p.idBase}-${stage}`}
                      {...(p.rung !== undefined ? { rung: p.rung } : {})}
                      {...(p.solfege ? { solfege: p.solfege } : {})}
                    />
                  </AnswerEnvProvider>
                  {!finished ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        data-enter="native"
                        disabled={disabled || !ready || status === "pending"}
                        onClick={() => p.onCheckStage(stage)}
                      >
                        {verb === "save" ? "Save" : "Check"} the {text.title.toLowerCase()}
                      </Button>
                      {p.onReveal && fb.state === "wrong" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          data-enter="native"
                          onClick={() => p.onReveal?.(stage)}
                        >
                          Show me
                        </Button>
                      ) : null}
                      {!ready ? (
                        <span className="text-[0.8125rem] text-text-3">Answer every chord to check.</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {current ? `${STAGE_TEXT[current].title} is open.` : "Every stage is done."}
      </p>
    </div>
  );
}
