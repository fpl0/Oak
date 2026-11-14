// The checkpoint player (contracts §7.6, ux §3.9): the New block of a checkpoint day. No hints and no tutor
// until the result; 12–18 items composed by the server (family trials, authored items, the Make), answered one
// at a time and graded in the browser (family items by the drill engine, authored items and the Make by the
// grader); the result shows per-skill bars with the pass lines, the practice plan on "Not yet", and "Continue
// anyway" when the rules offer it. Copy never shames: "debt" reads "worth another look".

import { decks } from "@content/families.ts";
import {
  type AttemptResponse,
  type BandRef,
  type CheckpointAttemptStart,
  type CheckpointDef,
  type CheckpointOutcome,
  type CheckpointStatus,
  checkpointFromRouteParam,
  type Exercise,
  type FlavourId,
  type GradeResult,
  type KeySpec,
  type LearnerProfile,
  type LessonDef,
  type MeterId,
  type SessionId,
  type SingEx,
  type StepDef,
  type SyllabusDef,
  type Trial,
  toLearnerProfile,
  type UnlockableId,
} from "@oak/api";
import { createRegistry, FAMILIES, gradeTrial } from "@oak/drills";
import { METERS } from "@oak/theory";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { courseGraph } from "../../../../content/index.ts";
import { unlockedAt } from "../../../../content/lib/course.ts";
import { callApi } from "../../lib/api.ts";
import { useContent } from "../../lib/content.ts";
import { lessonTitles } from "../../lib/content-model.ts";
import { formatDate, pct } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { initialPanelsOf } from "../../lib/panels.ts";
import { useCourseProgress, useProfile, useUnlocks, useVoiceState } from "../../lib/queries.ts";
import { currentSessionId, reportBlockDone, useSession } from "../../session/store.ts";
import { askChat, clearSubject, setSubject } from "../../tutor/context.ts";
import { useHotkeys } from "../../ui/keys/KeymapProvider.tsx";
import { Button, buttonClass } from "../../ui/kit/Button.tsx";
import { Card, Chip, EmptyState, Page } from "../../ui/kit/basics.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import { Meter } from "../../ui/kit/Meters.tsx";
import { ErrorState, LoadingState } from "../../ui/kit/QueryState.tsx";
import { useFocusHeader, useFocusHeaderContent } from "../../ui/shell/focus-header.ts";
import { ServicesGate } from "../../workbench/ServicesGate.tsx";
import "../../workbench/workbench.css";
import { promptOf } from "../../drills/copy.ts";
import { lessonWidgetFor } from "../answers.tsx";
import { bandMutesOf, bandSetupOf, checkpointMakeBand } from "../band.ts";
import { useCheckpointDef, useLessonContent } from "../content.ts";
import { renderer as feedbackRenderer } from "../feedback.ts";
import { type StepHost, StepHostContext } from "../frame.tsx";
import {
  familyAnswerKind,
  familyTrial,
  type GradeEnv,
  gradedLint,
  gradeStep,
  NEUTRAL_PROFILE,
} from "../grading.ts";
import { viewsOf } from "../model.ts";
import { MakeRenderer, rendererFor } from "../renderers.tsx";
import { browserGrader, catalogText, lessonServices } from "../services.ts";
import { answerMissing, registryHas, stepScopePanel } from "../wave5.ts";
import { stepMusicLenses } from "../wave6.ts";
import {
  clearRecords,
  familyAnswerSpec,
  familyResponse,
  type ItemRecord,
  isSungTrial,
  loadRecords,
  openedText,
  progressLine,
  quietNote,
  resultCopy,
  reviewTitle,
  saveRecords,
  scoreLocal,
  skillLine,
  sungItemScore,
  tracksOpenedCopy,
} from "./model.ts";

const CP_KEY = { tonic: "C", mode: "major" } as const;
const CP_BPM = 100;

export function CheckpointPlayer({ unitId }: { unitId: string }) {
  const cpId = checkpointFromRouteParam(unitId);
  const content = useContent();
  const progress = useCourseProgress();
  const def = useCheckpointDef(cpId);
  const profile = useProfile();
  const unlocks = useUnlocks();
  // Quiet mode is server state (wave3.md §5.3): sung items are set aside, never counted (contracts §7.6, §8.5).
  const voice = useVoiceState();
  const quiet = voice.data?.quiet ?? profile.data?.quiet ?? false;
  const meta = content.data?.checkpoints.find((c) => c.id === cpId);
  // The checkpoint's Make plays the Band content names for it, else its unit's last Band.
  const covered = meta?.covers.at(-1) ?? null;
  const lastLesson = content.data?.syllabus?.units.find((u) => u.id === covered)?.lessons.at(-1)?.id ?? "";
  const lastDef = useLessonContent(lastLesson);
  const makeBand = cpId ? checkpointMakeBand(cpId, lastDef.data?.def ?? null) : null;
  const title = meta ? `Checkpoint · ${meta.title}` : `Checkpoint ${unitId}`;
  usePageTitle(title);
  const [attempt, setAttempt] = useState<CheckpointAttemptStart | null>(null);
  const [outcome, setOutcome] = useState<CheckpointOutcome | null>(null);
  const [resultSketch, setResultSketch] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<unknown>(null);
  useFocusHeaderContent(title);

  // The tutor is closed until the result (contracts §10.2); the debrief opens it.
  useEffect(() => {
    if (!cpId) return;
    setSubject({
      thread: { subjectKind: "checkpoint", subjectId: cpId },
      title,
      tutorOpen: outcome !== null,
    });
    return () => clearSubject({ subjectKind: "checkpoint", subjectId: cpId });
  }, [cpId, title, outcome]);

  if (!cpId)
    return (
      <Page width="narrow">
        <EmptyState
          title="No such checkpoint"
          action={
            <Link to="/" className={buttonClass("primary")}>
              Back to Today
            </Link>
          }
        >
          “{unitId}” is not a checkpoint.
        </EmptyState>
      </Page>
    );
  if (content.isPending || progress.isPending || def.isPending)
    return (
      <Page width="narrow">
        <LoadingState label="Opening the checkpoint" />
      </Page>
    );
  if (progress.isError)
    return (
      <Page width="narrow">
        <ErrorState error={progress.error} onRetry={() => void progress.refetch()} />
      </Page>
    );
  const status = progress.data.checkpoints.find((c) => c.cpId === cpId) ?? null;
  // The tolerance the server's ladder holds (wave3.md §5.3) wins over the profile's copy.
  const learner = profile.data
    ? {
        ...toLearnerProfile(profile.data),
        ...(voice.data ? { singTolCents: voice.data.ladder.cents, quiet } : {}),
      }
    : NEUTRAL_PROFILE;

  if (outcome)
    return (
      <ResultScreen
        outcome={outcome}
        content={content.data ?? null}
        onDebrief={() => askChat("Can we go over my checkpoint together?")}
        inSession={currentSessionId() !== null}
        onContinue={() => {
          // In a session the checkpoint's Make is the Make block (wave2 §3.3): reporting it opens the Coda.
          if (resultSketch) reportBlockDone({ block: "make", source: "checkpoint", sketchId: resultSketch });
          else {
            const s = useSession.getState();
            if (s.block !== null && s.block !== "coda") s.enter("coda");
          }
        }}
      />
    );
  if (attempt)
    return (
      <ServicesGate load={lessonServices} auto>
        <Runner
          cpId={cpId}
          title={meta?.title ?? cpId}
          attempt={attempt}
          def={def.data ?? null}
          profile={learner}
          quiet={quiet}
          band={makeBand}
          flavour={profile.data?.flavour ?? "flavour.pop"}
          unlocked={[
            ...(unlocks.data?.items ?? []).map((u) => u.itemId as UnlockableId),
            ...unlockedAt(courseGraph(), content.data?.toolbox ?? [], cpId as never),
          ]}
          onDone={(o, sketchId) => {
            setOutcome(o);
            setResultSketch(sketchId);
          }}
        />
      </ServicesGate>
    );

  const start = async () => {
    setStarting(true);
    setStartError(null);
    try {
      setAttempt(await callApi("checkpoints.start", { params: { cpId } }));
    } catch (e) {
      setStartError(e);
    } finally {
      setStarting(false);
    }
  };
  return (
    <Intro
      cpId={cpId}
      title={meta?.title ?? cpId}
      covers={meta?.covers ?? []}
      status={status}
      hasItems={def.data !== null}
      starting={starting}
      error={startError}
      onStart={() => void start()}
    />
  );
}

function Intro(p: {
  cpId: string;
  title: string;
  covers: readonly string[];
  status: CheckpointStatus | null;
  hasItems: boolean;
  starting: boolean;
  error: unknown;
  onStart(): void;
}) {
  const s = p.status;
  const locked = !s || s.status === "locked";
  const done = s?.status === "passed" || s?.status === "soft-passed";
  return (
    <Page width="narrow">
      <div className="flex flex-col gap-5" data-testid="checkpoint-intro">
        <header>
          <p className="font-mono text-sm text-text-3">{p.cpId}</p>
          <h1 className="font-display text-h1 font-semibold">{p.title}</h1>
          <p className="mt-1 max-w-[60ch] text-text-2">
            A short check of {p.covers.join(" and ") || "this unit"}: about 12 minutes of mixed items, then a
            small Make. No hints, no rush. Claude goes over it with you afterwards.
          </p>
        </header>
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <Chip tone={done ? "accent" : s?.status === "failed" ? "amber" : "neutral"}>
            {done ? "passed" : s?.status === "failed" ? "not yet" : (s?.status ?? "locked")}
          </Chip>
          <span className="text-sm text-text-2">
            {s?.attempts ?? 0} attempt{s?.attempts === 1 ? "" : "s"}
            {s?.lastScore !== null && s?.lastScore !== undefined && ` · last ${pct(s.lastScore)}`}
            {s?.pendingAttemptAt && ` · unfinished since ${formatDate(s.pendingAttemptAt)}`}
          </span>
        </Card>
        {p.error ? <ErrorState error={p.error} onRetry={p.onStart} /> : null}
        {locked ? (
          <Callout tone="info" title="Not open yet">
            This checkpoint opens when the lessons it covers are done. Today has your next step.
          </Callout>
        ) : done ? (
          <Callout tone="success" title="Already passed">
            Its skills come back in your warm-ups. Studio and Practice are always open.
          </Callout>
        ) : !p.hasItems && !s?.pendingAttemptAt ? (
          <Callout tone="info" title="Not written yet">
            The items of this checkpoint are still being written. It opens here as soon as they are ready.
          </Callout>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={p.onStart}
              loading={p.starting}
              data-testid="start-checkpoint"
            >
              {s?.pendingAttemptAt
                ? "Continue where you were"
                : s?.status === "failed"
                  ? "Retake it"
                  : "Start"}
            </Button>
            {s?.softPassAvailable && (
              <span className="text-sm text-text-2">"Continue anyway" is open on this attempt.</span>
            )}
          </div>
        )}
        <Link to="/" className="text-sm text-link underline-offset-2 hover:underline">
          Back to Today
        </Link>
      </div>
    </Page>
  );
}

interface RunnerItem {
  idx: number;
  step: StepDef;
  exercise: Exercise;
  trial: Trial | null;
  kind: "family" | "authored" | "make";
  /** No widget can answer it in this version: it is skipped (level-setting skips never count). */
  unavailable: boolean;
  /** Answered by singing: level-setting, set aside in Quiet mode. */
  sung: boolean;
}

/** A plain title for an authored item that has none: what the learner does, never "a short task". */
function authoredTitle(ex: Exercise): string {
  if (ex.kind === "staff-write")
    return ex.answer.ui === "staff-input" && ex.answer.mode === "key-signature"
      ? "Write the key signature"
      : "Write it on the staff";
  if (ex.kind === "code-modify" || ex.kind === "error-hunt") return "Change the code";
  if (ex.kind === "code-make" || ex.kind === "compose-brief") return "Write it in code";
  if (ex.kind === "staff-read") return "Read it";
  if ("stimulus" in ex && ex.stimulus) return "Listen and answer";
  return "Answer this one";
}

/** The key an item is played and graded in: its own, its trial's, else the checkpoint's. */
function itemKey(ex: Exercise, trial: Trial | null, fallback: KeySpec): KeySpec {
  const tk = (trial?.params as { key?: KeySpec } | undefined)?.key;
  return ex.key ?? tk ?? fallback;
}

/** A drawn trial's own meter (`params.meter`), when it names one the course counts in. */
function trialMeter(m: unknown): MeterId | null {
  return typeof m === "string" && m in METERS ? (m as MeterId) : null;
}

const registry = createRegistry(FAMILIES, decks);
const HAS_WIDGET = registryHas(lessonWidgetFor);

/** Builds the items the runner shows from the server's composition and the checkpoint's definition. */
function buildItems(
  attempt: CheckpointAttemptStart,
  def: CheckpointDef | null,
  profile: LearnerProfile,
): RunnerItem[] {
  return attempt.items.map((spec) => {
    const base = { panels: { roll: false, staff: false as const, keyboard: false } };
    if (spec.source.kind === "make" && def) {
      return {
        idx: spec.idx,
        step: {
          id: `I${spec.idx + 1}` as StepDef["id"],
          kind: "make",
          // The Make's own name ("Eight bars home"), as its sketch is saved under it.
          title: def.make.title ?? "Your groove",
          minutes: 4,
          ui: { ...base, panels: { ...base.panels, roll: true } },
        },
        exercise: def.make,
        trial: null,
        kind: "make" as const,
        unavailable: false,
        sung: false,
      };
    }
    if (spec.source.kind === "authored") {
      const slug = spec.source.exerciseId.split("/").pop() ?? "";
      const ex = def?.authored.find((e) => e.id === slug);
      if (ex) {
        // A staff item (a key signature to write, notes to place) shows the staff; a code item the roll.
        const staffy = ex.kind === "staff-write" || ex.kind === "staff-read";
        // The staff in the item's own clef (a bass-clef or grand-staff answer, U05.L06 on), else treble.
        const clef =
          staffy && "answer" in ex && ex.answer && "clef" in ex.answer && ex.answer.clef
            ? ex.answer.clef
            : "treble";
        return {
          idx: spec.idx,
          step: {
            id: `I${spec.idx + 1}` as StepDef["id"],
            kind: staffy ? "notate" : ex.kind === "fact" ? "quiz" : "modify",
            title: ex.title ?? authoredTitle(ex),
            minutes: 1,
            ui: staffy
              ? { ...base, panels: { ...base.panels, staff: clef } }
              : { ...base, panels: { ...base.panels, roll: true } },
          },
          exercise: ex,
          trial: null,
          kind: "authored" as const,
          // Wave 5: an answer kind the app cannot draw yet (form, the 12-bar grid, the scale builder before
          // their widgets land) is set aside rather than shown as a dead end.
          unavailable: answerMissing(ex, HAS_WIDGET),
          sung: false,
        };
      }
    }
    if (spec.source.kind === "family") {
      const src = spec.source;
      const fam = registry.family(src.familyId);
      const trial = familyTrial(src.familyId, src.level, src.category, src.seed, profile);
      const cats = fam.def.categories.map((c) => c.id);
      if (isSungTrial(trial)) return sungItem(spec.idx, spec.skillId, fam.def.title, trial);
      const answer = familyAnswerSpec(familyAnswerKind(src.familyId), trial, cats, fam.def);
      // The drill runner's own words for the trial ("Which two degrees sounded together? Lower first."), as
      // the learner has met them in warm-ups; never a generic "Listen, then answer".
      const prompt = promptOf(trial as Trial<unknown>, fam.def);
      const common = {
        id: `item-${spec.idx + 1}`,
        version: 1,
        role: "checkpoint" as const,
        prompt,
        skills: [{ skill: spec.skillId, w: 1 }],
        hints: null,
        tests: [],
      };
      const p = trial.params as Record<string, unknown>;
      const tkey = (p.key as KeySpec | undefined) ?? undefined;
      // Wave 6: a trial in its own meter (fam.rhy.meter in 6/8) is counted, tapped and drawn in it.
      const tmeter = trialMeter(p.meter);
      const exercise: Exercise =
        // Reading from the page (`showStaff`, not played first): the staff, and no Play.
        p.showStaff === true && p.playFirst === false && answer && answer.ui !== "tap"
          ? {
              ...common,
              kind: "staff-read",
              ...(tkey ? { key: tkey } : {}),
              ...(tmeter ? { meter: tmeter } : {}),
              source: trial.code,
              bars: typeof p.bars === "number" ? p.bars : 2,
              answer: answer as never,
              correct: trial.expected,
            }
          : answer?.ui === "tap"
            ? {
                ...common,
                kind: "tap",
                ...(tmeter ? { meter: tmeter } : {}),
                mode: "echo",
                stimulus: { src: "generator", family: src.familyId, level: src.level, seed: src.seed },
                cue: trial.cue,
                bars: typeof trial.params.bars === "number" ? trial.params.bars : 1,
                target: "beat",
                tol: { windowMs: "auto", tempo: "locked", forgiveOffset: true, passF1: 0.8, passTiming: 0.7 },
              }
            : {
                ...common,
                kind: "identify",
                ...(tmeter ? { meter: tmeter } : {}),
                stimulus: { src: "generator", family: src.familyId, level: src.level, seed: src.seed },
                cue: trial.cue,
                answer: (answer ?? { ui: "choice", options: [] }) as never,
                correct: trial.expected,
              };
      return {
        idx: spec.idx,
        step: {
          id: `I${spec.idx + 1}` as StepDef["id"],
          kind: "ear",
          title: fam.def.title,
          minutes: 1,
          ui: base,
        },
        exercise,
        trial,
        kind: "family" as const,
        unavailable: answer === null || !HAS_WIDGET(answer),
        sung: false,
      };
    }
    // An authored item whose definition is missing: shown as unavailable and skipped.
    return {
      idx: spec.idx,
      step: { id: `I${spec.idx + 1}` as StepDef["id"], kind: "quiz", title: "An item", minutes: 1, ui: base },
      exercise: {
        kind: "listen",
        id: `missing-${spec.idx}`,
        version: 1,
        role: "checkpoint",
        prompt: "This item is not available.",
        skills: [],
        hints: null,
        tests: [],
        items: [],
      },
      trial: null,
      kind: "authored" as const,
      unavailable: true,
      sung: false,
    };
  });
}

/** A sung family item (`fam.deg.sing`, `fam.deg.resolve`, `fam.mel.echo`, `fam.mel.sight`) as a sing step. */
function sungItem(idx: number, skillId: string, title: string, trial: Trial): RunnerItem {
  const p = trial.params as Record<string, unknown>;
  const mode = (typeof p.singMode === "string" ? p.singMode : "degree") as SingEx["mode"];
  const degrees = trial.expected.degrees;
  const key = p.key as KeySpec | undefined;
  const exercise: SingEx = {
    kind: "sing",
    id: `item-${idx + 1}`,
    version: 1,
    role: "checkpoint",
    prompt:
      typeof p.prompt === "string"
        ? p.prompt
        : mode === "echo"
          ? "Listen, then sing it back."
          : mode === "sight"
            ? "Read it, then sing it."
            : "Sing the notes shown, after the chords that set home.",
    skills: [{ skill: skillId as never, w: 1 }],
    hints: null,
    tests: [],
    fallback: "skip",
    mode,
    ...(key ? { key } : {}),
    stimulus: {
      src: "code",
      code: trial.code,
      bars: typeof p.bars === "number" ? p.bars : 1,
      showCode: false,
      ...(p.showStaff === true ? { showStaff: true } : {}),
    },
    cue: trial.cue,
    target: degrees && degrees.length > 0 ? { from: "degrees", degrees } : { from: "stimulus" },
    tol: { cents: "learner", octave: "global", driftCompCents: 30, minCoverage: 0.4, passHitRate: 0.8 },
    showTrace: "live",
  };
  return {
    idx,
    step: {
      id: `I${idx + 1}` as StepDef["id"],
      kind: "sing",
      title,
      minutes: 1,
      ui: { panels: { roll: false, staff: false, keyboard: false } },
    },
    exercise,
    trial,
    kind: "family",
    unavailable: false,
    sung: true,
  };
}

function asResult(exerciseId: string, credit: number, diagnostics: GradeResult["diagnostics"]): GradeResult {
  return {
    exerciseId,
    exerciseVersion: 1,
    attemptNo: 1,
    firstAttempt: true,
    mode: "lesson",
    status: credit >= 1 ? "pass" : "fail",
    score: credit,
    adjustedScore: credit,
    dims: {},
    constraints: [],
    diagnostics,
    messages: [],
    assist: { rung: 0, tutorHints: 0, extraReplays: 0, revealed: false },
  };
}

function Runner(p: {
  cpId: string;
  title: string;
  attempt: CheckpointAttemptStart;
  def: CheckpointDef | null;
  profile: LearnerProfile;
  quiet: boolean;
  band: BandRef | null;
  flavour: FlavourId;
  unlocked: UnlockableId[];
  /** The hand-in's outcome and the Make's sketch (null when the Make was skipped). */
  onDone(o: CheckpointOutcome, makeSketchId: string | null): void;
}) {
  const qc = useQueryClient();
  const all = useRef(buildItems(p.attempt, p.def, p.profile)).current;
  // Quiet mode sets the sung items aside: they are handed in as skipped, which a level-setting item never counts.
  const items = p.quiet ? all.filter((it) => !it.sung) : all;
  const setAside = all.length - items.length;
  const [records, setRecords] = useState<ItemRecord[]>(() => loadRecords(p.cpId, p.attempt.attemptNo));
  const firstOpen = items.findIndex((it) => !records.some((r) => r.idx === it.idx));
  const [index, setIndex] = useState(firstOpen < 0 ? items.length : firstOpen);
  const [code, setCode] = useState<Record<number, string>>({});
  const [checking, setChecking] = useState(false);
  const [makeSketch, setMakeSketch] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const started = useRef(Date.now());
  const check = useRef<(() => void) | null>(null);
  const rec = new Map(records.map((r) => [r.idx, r]));
  const item = items[index] ?? null;
  // Dev and e2e: the drawn trial's answer of the item on screen (never in a production build).
  const devItem = useRef<RunnerItem | null>(null);
  const devApi = useRef<{ answer(r: AttemptResponse): Promise<void> } | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (globalThis as { __oakCheckpoint?: unknown }).__oakCheckpoint = {
      expected: () => devItem.current?.trial?.expected ?? null,
      params: () => devItem.current?.trial?.params ?? null,
      trialCode: () => devItem.current?.trial?.code ?? null,
      kind: () => devItem.current?.kind ?? null,
      /** The item's index in the attempt (`CheckpointItemSpec.idx`, the server's skill per item). */
      idx: () => devItem.current?.idx ?? null,
      exercise: () => devItem.current?.exercise ?? null,
      /** Grades and saves a response for the item on screen, then moves on (the Make: saves its sketch). */
      answer: (r: AttemptResponse) => devApi.current?.answer(r),
    };
    return () => {
      delete (globalThis as { __oakCheckpoint?: unknown }).__oakCheckpoint;
    };
  }, []);

  // The rail of items in the focus header (the page owns the title).
  const setHeader = useFocusHeader((s) => s.set);
  const railSig = items.map((it, i) => (i === index ? "c" : rec.has(it.idx) ? "d" : "t")).join("");
  useEffect(() => {
    setHeader({
      steps: items.map((it, i) => ({
        id: String(it.idx),
        label: it.step.title,
        state: railSig[i] === "c" ? "current" : railSig[i] === "d" ? "done" : "todo",
      })),
    });
  }, [railSig, items, setHeader]);
  useEffect(() => () => setHeader({ steps: null }), [setHeader]);
  useEffect(() => saveRecords(p.cpId, p.attempt.attemptNo, records), [p.cpId, p.attempt.attemptNo, records]);
  useEffect(() => {
    started.current = Date.now();
  }, [index]);
  // The session: the items are the New block; the checkpoint Make is the Make (wave2 §3.3).
  const reportedNew = useRef(false);
  useEffect(() => {
    if (reportedNew.current || !(item?.kind === "make" || index >= items.length)) return;
    reportedNew.current = true;
    reportBlockDone({ block: "new", source: "checkpoint", itemId: p.cpId, completed: true });
  }, [item?.kind, index, items.length, p.cpId]);

  useHotkeys([
    {
      id: "checkpoint-check",
      keys: "Mod+Shift+Enter",
      scope: "global",
      group: "Checkpoint",
      description: "Save the answer",
      allowInInput: true,
      when: () => check.current !== null,
      run: () => check.current?.(),
    },
  ]);

  const record = (r: ItemRecord) => setRecords((rs) => [...rs.filter((x) => x.idx !== r.idx), r]);
  const next = () => setIndex((i) => Math.min(items.length, i + 1));
  const cpKey: KeySpec = p.def?.make.key ?? CP_KEY;
  const cpBpm = typeof p.def?.make.bpm === "number" ? p.def.make.bpm : CP_BPM;
  const makeBand = bandSetupOf(p.band ?? undefined, {
    flavour: p.flavour,
    key: cpKey,
    bpm: cpBpm,
    at: p.cpId as SessionId,
  });
  // An item in its own meter (U07.CP's 3/4 tune from the page) is read, linted and graded in it.
  const itemMeter = item?.exercise.meter ?? "4/4";
  const env: GradeEnv = {
    ownerId: p.cpId,
    key: item ? itemKey(item.exercise, item.trial, cpKey) : cpKey,
    meter: itemMeter,
    bpm: cpBpm,
    unlocked: new Set(p.unlocked),
    allowPreview: false,
    profile: p.profile,
  };

  const submit = async (acceptSoftPass: boolean) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const outcome = await callApi("checkpoints.attempt", {
        params: { cpId: p.cpId },
        body: {
          sessionId: currentSessionId(),
          attemptNo: p.attempt.attemptNo,
          items: all.map((it) => {
            const r = rec.get(it.idx);
            return {
              idx: it.idx,
              score: r?.score ?? 0,
              skipped: r?.skipped ?? true,
              response: r?.response ?? { skipped: true },
              result: r?.result ?? null,
            };
          }),
          makeSketchId: makeSketch,
          acceptSoftPass,
        },
      });
      clearRecords(p.cpId, p.attempt.attemptNo);
      for (const k of ["lessons.progress", "skills.map", "unlocks.list", "session.today", "srs.due"])
        void qc.invalidateQueries({ queryKey: ["api", k] });
      p.onDone(outcome, makeSketch);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0)
    return (
      <Page width="narrow">
        <EmptyState title="Nothing to check yet">
          This checkpoint has no items ready. Today has your next step.
        </EmptyState>
      </Page>
    );

  if (!item) {
    const local = scoreLocal(p.attempt.items, rec, p.attempt.attemptNo);
    return (
      <Page width="narrow">
        <div className="flex flex-col gap-4" data-testid="checkpoint-review">
          <h2
            tabIndex={-1}
            className="font-display text-h1 font-semibold"
            ref={(el) => el?.focus({ preventScroll: true })}
          >
            {reviewTitle(records, items.length)}
          </h2>
          <p className="text-text-2">Hand it in to see how each skill went.</p>
          {quietNote(setAside) && (
            <p className="text-sm text-text-3" data-testid="quiet-set-aside">
              {quietNote(setAside)}
            </p>
          )}
          {submitError && (
            <Callout tone="attention" title="It was not handed in">
              {submitError}. Your answers are kept; try again.
            </Callout>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="lg"
              loading={submitting}
              onClick={() => void submit(false)}
              data-testid="hand-in"
            >
              Hand it in
            </Button>
            {local.softPassOffered && (
              <Button
                size="lg"
                disabled={submitting}
                onClick={() => void submit(true)}
                data-testid="continue-anyway"
              >
                Hand in and continue anyway
              </Button>
            )}
          </div>
          {local.softPassOffered && (
            <p className="text-sm text-text-3">
              "Continue anyway" opens the next lessons now; any skill under 70% comes back in your warm-ups.
            </p>
          )}
        </div>
      </Page>
    );
  }

  const done = rec.get(item.idx);
  const ex = item.exercise;
  devItem.current = item;
  const grade = async (response: AttemptResponse, override?: Exercise): Promise<GradeResult | null> => {
    setChecking(true);
    try {
      if (item.sung && item.trial) {
        if (!("sung" in response)) return null;
        const { score, noVoice } = sungItemScore(response.sung, item.trial, p.profile.singTolCents);
        return asResult(ex.id, noVoice ? 0 : score, []);
      }
      if (item.kind === "family" && item.trial) {
        const fam = registry.family(item.trial.family);
        const at = typeof item.trial.params.responseAt === "number" ? item.trial.params.responseAt : 0;
        const tr = gradeTrial(
          fam,
          item.trial,
          familyResponse(response, Date.now() - started.current, 1, at, item.trial.expected, item.trial),
          p.profile,
        );
        return asResult(ex.id, tr.credit, tr.diagnostics);
      }
      return await gradeStep(browserGrader, env, override ?? ex, response, {
        params: {},
        attemptNo: 1,
        rung: 0,
        extraReplays: 0,
        trial: item.trial,
      });
    } catch {
      return null;
    } finally {
      setChecking(false);
    }
  };
  const lessonLike = {
    id: p.cpId,
    version: 1,
    title: p.title,
    objective: "",
    key: env.key,
    meter: env.meter,
    bpm: cpBpm,
    introduces: [],
    practises: [],
    terms: [],
    canDo: [],
    steps: [item.step],
    wrapAt: item.step.id,
  } as unknown as LessonDef;

  const host: StepHost = {
    mode: "checkpoint",
    lesson: lessonLike,
    step: item.step,
    exercise: ex,
    index,
    total: items.length,
    params: {},
    seriesNo: 0,
    state: null,
    result: done?.result ?? null,
    rung: 0,
    passed: false,
    checking,
    review: false,
    env,
    voice: { quiet: p.quiet, labels: null },
    workbench: {
      lessonCtx: {
        key: env.key,
        meter: env.meter,
        defaultBpm: cpBpm,
        loopBars:
          item.kind === "make" && ex.kind === "code-make"
            ? ex.bars[1]
            : "reference" in ex && ex.reference && "bars" in ex.reference
              ? (ex.reference.bars as number)
              : 2,
      },
      lint: gradedLint(env),
      views: viewsOf(item.step),
      unit: p.cpId,
      // Wave 4: an item may open a Workbench panel (the chord band, the key panel), as a lesson step does.
      ...(initialPanelsOf(item.step.ui) ? { initialPanels: initialPanelsOf(item.step.ui) ?? {} } : {}),
      ...(stepScopePanel(item.step.ui) ? { scopePanel: stepScopePanel(item.step.ui) } : {}),
      band: item.kind === "make" ? makeBand : null,
      roll: { labels: "none", color: "part" },
      // Wave 6: a checkpoint item shows no guide-tone marks (on "write the 3rds and 7ths" they are the answer),
      // whatever the learner's switch; an item in 6/8 keeps its beat grid, which is how the meter is read.
      musicLenses: { guideTones: false, ...stepMusicLenses({ lessonId: p.cpId, meter: env.meter }) },
    },
    trial: item.trial,
    trials: [item.trial],
    code: code[item.idx] ?? null,
    setCode: (c) => setCode((m) => ({ ...m, [item.idx]: c })),
    grade,
    gradeQuiet: async (r, over) => grade(r, over),
    preview: () => {},
    setCheck: (fn) => {
      check.current = fn;
    },
    markDone: () => {},
    save: (src, title) => {
      void (async () => {
        setChecking(true);
        try {
          const result = await gradeStep(
            browserGrader,
            env,
            ex,
            { code: src },
            { params: {}, attemptNo: 1, rung: 0, extraReplays: 0 },
          );
          const saved = await callApi("sketches.create", {
            body: {
              title: title.slice(0, 120) || p.title,
              originKind: "checkpoint",
              originId: p.cpId,
              sessionId: currentSessionId(),
              code: src,
              bpm: cpBpm,
              meter: env.meter,
              key: env.key,
              analysis: null,
              note: null,
              tutorAssisted: false,
              // The Band's parts the Make leaves out stay muted in the sketch (Studio plays what was heard).
              band: makeBand
                ? {
                    bandId: makeBand.band,
                    flavour: makeBand.flavour,
                    mutes: bandMutesOf(makeBand),
                  }
                : null,
              flags: { lockedTools: [], previewTools: [] },
              ranOk: result.status !== "error",
            },
          });
          // The session hears of the Make after the hand-in (the result screen's Continue), not now: the
          // checkpoint is not over until its items are handed in.
          setMakeSketch(saved.sketch.id);
          record({
            idx: item.idx,
            score: result.status === "pass" ? 1 : result.score,
            skipped: false,
            response: { code: src },
            result,
          });
          next();
        } finally {
          setChecking(false);
        }
      })();
    },
    render: feedbackRenderer(catalogText, done?.result ?? null, ex),
    prose: null,
    banner: item.unavailable ? (
      <Callout tone="info" title="Set aside" className="mt-3">
        This kind of item can't be answered here yet. Skip it; a skipped practice-level item never counts
        against you.
      </Callout>
    ) : null,
    renderFooter: (actions: ReactNode) => (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-text-3" data-testid="checkpoint-progress">
          {progressLine(records, items.length)}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {item.kind !== "make" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                record({ idx: item.idx, score: 0, skipped: true, response: { skipped: true }, result: null });
                next();
              }}
              data-testid="skip-item"
            >
              Skip this one
            </Button>
          )}
          {item.unavailable ? null : actions}
          {item.kind !== "make" && (
            <Button
              variant={done ? "primary" : "secondary"}
              disabled={!done}
              onClick={next}
              data-testid="next-item"
            >
              Next item
            </Button>
          )}
        </div>
      </div>
    ),
  };

  devApi.current = {
    answer: async (response) => {
      if (item.kind === "make" && "code" in response) {
        host.save?.(response.code, p.title);
        return;
      }
      const result = await grade(response);
      if (!result) return;
      record({
        idx: item.idx,
        score: result.status === "error" ? 0 : result.score,
        skipped: false,
        response,
        result,
      });
      next();
    },
  };
  const Renderer =
    item.kind === "make"
      ? MakeRenderer
      : (rendererFor(ex.kind) as unknown as (props: Record<string, unknown>) => ReactNode);
  return (
    <StepHostContext value={host}>
      <Renderer
        key={item.idx}
        lesson={lessonLike}
        step={item.step}
        index={index}
        total={items.length}
        state={null}
        params={{}}
        target={20}
        sessionId={currentSessionId()}
        review={false}
        exercise={ex}
        lastResult={done?.result ?? null}
        checking={checking}
        answerWidgetFor={() => null}
        onCheck={(input: { response: AttemptResponse; result: GradeResult }) =>
          record({
            idx: item.idx,
            score: input.result.status === "error" ? 0 : input.result.score,
            skipped: input.result.status === "error",
            response: input.response,
            result: input.result,
          })
        }
        onHint={() => {}}
        onNewSeries={() => {}}
        onContinue={next}
        onCode={(c: string) => setCode((m) => ({ ...m, [item.idx]: c }))}
      />
    </StepHostContext>
  );
}

function ResultScreen({
  outcome,
  content,
  onDebrief,
  inSession,
  onContinue,
}: {
  outcome: CheckpointOutcome;
  content: { skills: { nodes: { id: string; name: string }[] }; syllabus?: SyllabusDef | null } | null;
  onDebrief(): void;
  /** Inside a session the primary action goes on to the Coda instead of back to Today. */
  inSession: boolean;
  onContinue(): void;
}) {
  const copy = resultCopy(outcome);
  const name = (id: string) => content?.skills.nodes.find((n) => n.id === id)?.name ?? id;
  const titles = lessonTitles(content?.syllabus ?? null);
  // Wave 6: a pass that met an advanced-track gate says so once (U13.CP: the Jazz and Rhythm tracks).
  const tracksCopy = tracksOpenedCopy(
    outcome.gatesOpened,
    new Map((content?.syllabus?.tracks ?? []).map((t) => [t.id, t.title])),
  );
  return (
    <Page width="narrow">
      <div
        className={`flex flex-col ${outcome.perSkill.length > 6 ? "gap-4" : "gap-5"}`}
        data-testid="checkpoint-result"
        data-passed={outcome.passed ? "1" : "0"}
      >
        <header>
          <h1
            tabIndex={-1}
            className="font-display text-h1 font-semibold"
            ref={(el) => el?.focus({ preventScroll: true })}
          >
            {copy.title}
          </h1>
          <p className="mt-1 max-w-[60ch] text-text-2">{copy.body}</p>
          <p className="mt-2 text-sm text-text-3">
            Score on the counted items: {pct(outcome.score)} (85% passes).
          </p>
        </header>
        {/* Wave 6 checkpoints count up to ten skills: the rows close up so the result's action stays on a
            1280×800 screen. */}
        <section
          aria-label="By skill"
          className={`flex flex-col ${outcome.perSkill.length > 6 ? "gap-2" : "gap-3"}`}
        >
          {outcome.perSkill.map((s) => {
            const line = skillLine(s);
            return (
              <div key={s.skillId} data-skill={s.skillId}>
                <Meter
                  value={s.mean}
                  max={1}
                  label={`${s.skillId} ${name(s.skillId)}`}
                  valueText={line.text}
                  tone={line.tone === "ok" ? "accent" : line.tone === "look" ? "amber" : "neutral"}
                  ticks={
                    s.role === "gating"
                      ? [
                          { at: 0.7, label: "70%" },
                          { at: 0.85, label: "85%" },
                        ]
                      : []
                  }
                />
              </div>
            );
          })}
        </section>
        {outcome.repairQueue.length > 0 && (
          <Callout tone="info" title="Your practice plan">
            {outcome.repairQueue.map((r) => `${r.sets} short sets for ${name(r.skillId)}`).join("; ")}, in
            your next warm-ups. Then retake it on another day.
          </Callout>
        )}
        {openedText(outcome.opened, titles) !== "" && (
          <p className="text-sm text-text-2" data-testid="checkpoint-opened">
            Open now: {openedText(outcome.opened, titles)}.
          </p>
        )}
        {tracksCopy && (
          <div data-testid="tracks-opened" data-authored={tracksCopy.authored ? "1" : "0"}>
            <Callout tone="info" title={tracksCopy.title}>
              {tracksCopy.body}
            </Callout>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {inSession ? (
            <Button variant="primary" size="lg" onClick={onContinue} data-testid="checkpoint-done">
              On to the coda
            </Button>
          ) : (
            <Link to="/" className={buttonClass("primary", "lg")} data-testid="checkpoint-done">
              Back to Today
            </Link>
          )}
          <Button size="lg" onClick={onDebrief} data-testid="debrief">
            Go over it with Claude
          </Button>
        </div>
      </div>
    </Page>
  );
}
