// The dev seeder (`POST /api/dev/seed`, OAK_DEV=1 only): wipes the learner's data and fast-forwards to a named
// point of the default order so other areas' e2e can start where they need to ("after U01.L03", "C0 ready",
// "10-day gap"). It drives the real services, one simulated day per map session with the dev clock moved
// into the past, so unlocks, terms, SRS cards (seeded and reviewed in warm-ups), evidence, can-dos, the
// streak and session telemetry all look as if a learner had done the work. It ends yesterday (or `gapDays`
// ago): today is a fresh day. /dev/listen verdicts survive the wipe (they are QA data, not the learner's).
import type {
  DevClock as DevClockDto,
  DevSeedPoint,
  DevSeedRequest,
  DevSeedResult,
  DrillTrialRecord,
  WarmupItem,
} from "@oak/api";
import { ONBOARDING_STEPS } from "@oak/api";
import type { Exercise, GradeResult, HintRung } from "@oak/content-kit";
import type { AppDeps } from "../deps.ts";
import { ApiError, badRequest } from "../errors.ts";
import { finishDrill, reviewCard } from "../routes/practice.ts";
import { LearnerTime } from "./context.ts";
import type { DevClock } from "./dev-clock.ts";

const DAY_MS = 86_400_000;

export const SEED_POINTS: readonly DevSeedPoint[] = [
  { point: "fresh", description: "No data at all: the welcome screen and onboarding from the start." },
  { point: "onboarded", description: "Onboarding (U00.L01) finished yesterday; today's lesson is U00.L02." },
  {
    point: "after <SessionId>",
    description:
      "Every default-order session up to and including <SessionId> completed, one per day, the last yesterday (after U01.L03, after U01.CP, after C0.S1).",
  },
  { point: "U01.CP due", description: "U02.L01 done yesterday: today's New block is the U01 checkpoint." },
  {
    point: "U01.CP failed",
    description: "U01.CP failed once (repair sets queued in the warm-up); retake due.",
  },
  {
    point: "U01.CP failed twice",
    description: "Two failed U01.CP attempts, the second at 0.80: the next attempt offers a soft pass.",
  },
  { point: "C0 ready", description: "U01.CP passed yesterday: C0 is open and today's New block is C0.S1." },
  {
    point: "C0 in progress",
    description: "C0.S1 started yesterday with a draft whose requirements check passed; not released yet.",
  },
  { point: "C0 released", description: "C0 released to the album yesterday (Side A track 1, version 1)." },
  { point: "U02.CP due", description: "U03.L01 done yesterday: today's New block is the U02 checkpoint." },
  {
    point: "C1 ready",
    description: "U02.CP passed yesterday: C1 is open; ebass and .lpf() unlock when C1.S1 starts.",
  },
  { point: "C1 in progress", description: "C1.S1 started yesterday with a passing draft; not released yet." },
  { point: "C1 released", description: "C1 released to the album yesterday." },
  {
    point: "<N>-day gap",
    description:
      "After U01.L03 with N days missed since the last activity (3, 10, 21: the return policy of contracts §7.9).",
  },
];

/** What a point expands to. */
interface SeedPlan {
  /** The last default-order item to complete (`null`: nothing). */
  upTo: string | null;
  /** After `upTo`: failed attempts of a checkpoint, or an unreleased capstone draft. */
  extra: { kind: "cp-failed"; cpId: string; times: 1 | 2 } | { kind: "draft"; capstoneId: string } | null;
  gapDays: number | null;
}

export function needDevClock(d: AppDeps): DevClock {
  if (d.devClock === null) throw new ApiError("unavailable", "the dev clock exists only with OAK_DEV=1");
  return d.devClock;
}

export function clockState(d: AppDeps): DevClockDto {
  const s = needDevClock(d).state();
  return {
    now: s.now.toISOString(),
    day: new LearnerTime(d.services.ctx).day(s.now),
    offsetMs: s.offsetMs,
    frozen: s.frozen,
  };
}

/** Parses a seed point against the default order. Throws 400 for an unknown point or session. */
export function planSeed(point: string, order: readonly string[]): SeedPlan {
  const p = point.trim();
  const lower = p.toLowerCase();
  const before = (id: string): string | null => {
    const i = order.indexOf(id);
    if (i < 0) throw badRequest(`${id} is not in the default order`);
    return i === 0 ? null : (order[i - 1] as string);
  };
  const inOrder = (id: string): string => {
    if (!order.includes(id)) throw badRequest(`${id} is not in the default order`);
    return id;
  };
  if (lower === "fresh") return { upTo: null, extra: null, gapDays: null };
  if (lower === "onboarded") return { upTo: inOrder("U00.L01"), extra: null, gapDays: null };
  let m = /^after\s+(\S+)$/i.exec(p);
  if (m !== null) return { upTo: inOrder((m[1] as string).toUpperCase()), extra: null, gapDays: null };
  m = /^(U\d{2}\.CP)\s+due$/i.exec(p);
  if (m !== null) return { upTo: before((m[1] as string).toUpperCase()), extra: null, gapDays: null };
  m = /^(U\d{2}\.CP)\s+failed(\s+twice)?$/i.exec(p);
  if (m !== null) {
    const cpId = (m[1] as string).toUpperCase();
    return { upTo: before(cpId), extra: { kind: "cp-failed", cpId, times: m[2] ? 2 : 1 }, gapDays: null };
  }
  m = /^(C\d+)\s+(ready|in progress|released)$/i.exec(p);
  if (m !== null) {
    const cap = (m[1] as string).toUpperCase();
    const sessions = order.filter((id) => id.startsWith(`${cap}.S`));
    if (sessions.length === 0) throw badRequest(`${cap} is not in the default order`);
    const state = (m[2] as string).toLowerCase();
    if (state === "released") return { upTo: sessions.at(-1) as string, extra: null, gapDays: null };
    return {
      upTo: before(sessions[0] as string),
      extra: state === "in progress" ? { kind: "draft", capstoneId: cap } : null,
      gapDays: null,
    };
  }
  m = /^(\d{1,3})[- ]day gap$/i.exec(p);
  if (m !== null) return { upTo: inOrder("U01.L03"), extra: null, gapDays: Number(m[1]) };
  throw badRequest(
    `unknown seed point "${point}"; GET /api/dev/seed lists them (${SEED_POINTS.map((s) => s.point).join(", ")})`,
  );
}

/** A tiny seeded generator so a seed is the same every time. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A passing (or failing) grade for an authored exercise, with every rubric rule met when it passes. */
export function syntheticGrade(globalId: string, ex: Exercise, score: number): GradeResult {
  const rubric =
    "rubric" in ex && Array.isArray(ex.rubric)
      ? (ex.rubric as { id: string; required: boolean }[]).map((r) => ({
          ruleId: r.id,
          required: r.required,
          ok: score >= 0.8,
        }))
      : undefined;
  return {
    exerciseId: globalId,
    exerciseVersion: ex.version ?? 1,
    attemptNo: 1,
    firstAttempt: true,
    mode: ex.kind === "compose-brief" ? "capstone" : "lesson",
    status: score >= 0.8 ? "pass" : "fail",
    score,
    adjustedScore: score,
    dims: {},
    constraints: [],
    ...(rubric === undefined ? {} : { rubric }),
    diagnostics: [],
    messages: [],
    assist: { rung: 0 as HintRung, tutorHints: 0, extraReplays: 0, revealed: false },
  };
}

const PHASE_MS = { warmup: 240_000, main: 540_000, make: 240_000, coda: 60_000 };
const EMPTY_FLAGS = { lockedTools: [], previewTools: [] };

class Seeder {
  readonly done: string[] = [];
  readonly sketchIds: string[] = [];
  capstoneSketchId: string | null = null;
  trackId: string | null = null;
  readonly #rand: () => number;

  constructor(
    private readonly d: AppDeps,
    private readonly target: 15 | 20 | 25,
    private readonly practice: boolean,
  ) {
    this.#rand = rng(0x0a4c);
  }

  get #s() {
    return this.d.services;
  }

  sketch(
    title: string,
    originKind: "lesson-make" | "capstone" | "checkpoint",
    originId: string,
    code: string,
  ) {
    const saved = this.#s.library.createSketch({
      title,
      originKind,
      originId,
      code,
      bpm: 100,
      meter: "4/4",
      key: { tonic: "C", mode: "major" },
      analysis: null,
      note: null,
      tutorAssisted: false,
      band: null,
      flags: EMPTY_FLAGS,
      ranOk: true,
      sessionId: null,
    });
    this.sketchIds.push(saved.sketch.id);
    return saved.sketch;
  }

  /** One warm-up of today's plan, every set done at about 85% credit (one in ten below 0.65). */
  async warmup(sessionId: string): Promise<void> {
    const srs = this.d.srs();
    if (srs === null || !this.practice) return;
    const due = await srs.due({ budgetSec: null, more: false });
    for (const item of due.items) await this.#set(sessionId, item);
  }

  async #set(sessionId: string, item: WarmupItem): Promise<void> {
    const content = this.d.content;
    const facts = item.cardIds.filter((c) => content.fact(c) !== null);
    if (item.kind === "listen") return;
    if (facts.length > 0 && item.familyId === null && item.members.length === 0) {
      for (const cardId of facts)
        await reviewCard(this.d, {
          cardId,
          drillSessionId: null,
          outcome: {
            meanCredit: this.#rand() < 0.1 ? 0 : 1,
            medianRtMs: 2500,
            extraReplays: 0,
            hintRung: 0,
            revealed: false,
            playedLevel: null,
            meanAbsCents: null,
          },
        });
      return;
    }
    const familyIds = (item.familyId !== null ? [item.familyId] : item.members).filter(
      (f) => content.family(f) !== null,
    );
    if (familyIds.length === 0) return;
    const srs = this.d.srs();
    if (srs === null) return;
    const purpose = item.kind === "anchor" ? "anchor" : item.kind === "repair" ? "repair" : "srs";
    const drill = await srs.startDrill({ sessionId, purpose, familyIds, warmupItemId: item.id });
    const at = this.d.clock.now().toISOString();
    const weak = this.#rand() < 0.1;
    const trials: DrillTrialRecord[] = [];
    for (let idx = 0; idx < Math.max(1, drill.trialsPlanned); idx++) {
      const familyId = familyIds[idx % familyIds.length] as DrillTrialRecord["familyId"];
      const cats = drill.openCategories[familyId] ?? [];
      const credit = weak ? (this.#rand() < 0.5 ? 0 : 1) : this.#rand() < 0.86 ? 1 : 0.5;
      trials.push({
        idx,
        familyId,
        seed: idx + 1,
        level: drill.levels[familyId] ?? 1,
        category: cats[idx % Math.max(1, cats.length)] ?? "all",
        params: {},
        response: { answer: null, taps: null, sung: null, skipped: false },
        credit,
        correct: credit >= 0.8,
        rtMs: 1800 + Math.round(this.#rand() * 1200),
        replays: 0,
        confusion: null,
        centsError: null,
        at,
      });
    }
    await srs.recordTrials(drill.id, trials);
    await finishDrill(this.d, drill.id);
  }

  end(sessionId: string): void {
    this.#s.sessions.end(sessionId, { wrappedEarly: false, phaseMs: PHASE_MS });
  }

  /** One map session on the current (simulated) day. */
  async item(id: string): Promise<void> {
    const content = this.d.content;
    if (content.lessonSite(id) !== null) return this.#lesson(id);
    if (content.checkpointMeta(id) !== null) return this.#checkpoint(id, 0.95);
    if (/^GYM\.\d{2}$/.test(id)) {
      const ses = this.#s.sessions.start({ kind: "gym", mapItemId: null, targetMinutes: this.target });
      await this.warmup(ses.id);
      this.#s.course.gymStart({ sessionId: ses.id, kind: "ladder", transcriptionId: null });
      this.end(ses.id);
      this.done.push(id);
      return;
    }
    const m = /^(.+)\.S(\d+)$/.exec(id);
    if (m !== null && content.capstoneMeta(m[1] as string) !== null)
      return this.#capstone(m[1] as string, id, true);
    throw badRequest(`the seeder does not know how to complete ${id}`);
  }

  async #lesson(lessonId: string): Promise<void> {
    const s = this.#s;
    const ses = s.sessions.start({
      kind: "lesson",
      mapItemId: lessonId as never,
      targetMinutes: this.target,
    });
    await this.warmup(ses.id);
    const def = this.d.content.lessonDef(lessonId);
    if (lessonId === "U00.L01") {
      const sk = this.sketch(
        "Sketch 001",
        "lesson-make",
        lessonId,
        lessonMakeCode(def?.steps.at(-1)?.exercise),
      );
      await s.onboarding.put({
        step: "coda",
        completed: [...ONBOARDING_STEPS],
        skipped: [],
        firstEdit: 4,
        sketchId: sk.id,
        finished: true,
      });
      this.end(ses.id);
      this.done.push(lessonId);
      return;
    }
    if (def !== null) {
      for (const step of def.steps) {
        const ex = step.exercise;
        if (ex === undefined) continue;
        const globalId = `${lessonId}/${ex.id}`;
        await s.course.attempt(lessonId, step.id, {
          sessionId: ses.id,
          exerciseId: ex.id,
          exerciseVersion: ex.version ?? 1,
          seriesNo: 0,
          params: {},
          response: { code: "" },
          result: syntheticGrade(globalId, ex, 0.9 + this.#rand() * 0.1),
          extraReplays: 0,
          tutorAssisted: false,
        } as never);
      }
      const last = def.steps.at(-1);
      if (last !== undefined)
        s.course.position(lessonId, { sessionId: ses.id, stepId: last.id, splitPart: null, wrapped: false });
    } else {
      // No lesson file yet: evidence for the skills it introduces, as a first pass would give.
      const meta = this.d.content.lessonSite(lessonId)?.meta;
      s.mastery.addEvidence(
        [...(meta?.introduces ?? []), ...(meta?.practises ?? [])].map((skillId) => ({
          skillId,
          category: null,
          score: 0.9,
          weight: 1,
          sourceKind: "step" as const,
          sourceId: `${lessonId}/seed`,
        })),
      );
    }
    const title = def?.title ?? this.d.content.lessonTitle(lessonId);
    const sk = this.sketch(title, "lesson-make", lessonId, lessonMakeCode(def?.steps.at(-1)?.exercise));
    await s.course.complete(
      lessonId,
      {
        sessionId: ses.id,
        sketchId: sk.id,
        lessonVersion: def?.version ?? 1,
        contentHash: this.d.content.contentVersion ?? "unbuilt",
        splitPart: null,
      },
      { allowUnauthored: true },
    );
    this.end(ses.id);
    this.done.push(lessonId);
  }

  /** One checkpoint attempt at `score` on every item; 0.95 passes, 0.5 fails, 0.8 fails gating at 0.85. */
  async #checkpoint(cpId: string, score: number): Promise<void> {
    const s = this.#s;
    const ses = s.sessions.start({
      kind: "checkpoint",
      mapItemId: cpId as never,
      targetMinutes: this.target,
    });
    await this.warmup(ses.id);
    const start = s.course.checkpointStart(cpId);
    const sk = this.sketch(`${cpId} groove`, "checkpoint", cpId, CHECKPOINT_GROOVE);
    s.course.checkpointSubmit(cpId, {
      sessionId: ses.id,
      attemptNo: start.attemptNo,
      items: start.items.map((i) => ({
        idx: i.idx,
        score,
        skipped: false,
        response: { code: "" },
        result: null,
      })),
      makeSketchId: sk.id,
      acceptSoftPass: false,
    });
    this.end(ses.id);
    if (score >= 0.85) this.done.push(cpId);
  }

  async failCheckpoint(cpId: string, attempt: number): Promise<void> {
    await this.#checkpoint(cpId, attempt === 1 ? 0.5 : 0.8);
  }

  /** A capstone session: a draft whose check passes, then the session completed (or released, the last one). */
  async #capstone(capstoneId: string, sessionId: string, finish: boolean): Promise<void> {
    const s = this.#s;
    const content = this.d.content;
    const ses = s.sessions.start({
      kind: "capstone",
      mapItemId: sessionId as never,
      targetMinutes: this.target,
    });
    await this.warmup(ses.id);
    const meta = content.capstoneMeta(capstoneId);
    const title = meta?.title.replace(/^[A-Z0-9-]+\s+/, "") ?? capstoneId;
    const brief = content.capstoneDef(capstoneId)?.brief;
    const sk =
      this.capstoneSketchId === null || s.library.sketch(this.capstoneSketchId).originId !== capstoneId
        ? this.sketch(`${title} (draft)`, "capstone", capstoneId, capstoneDraftCode(brief))
        : s.library.sketch(this.capstoneSketchId);
    this.capstoneSketchId = sk.id;
    const result =
      brief === undefined
        ? syntheticGrade(
            `${capstoneId}/brief`,
            { kind: "compose-brief", id: "brief" } as unknown as Exercise,
            0.95,
          )
        : syntheticGrade(`${capstoneId}/${brief.id}`, brief, 0.95);
    s.course.capstoneCheck(capstoneId, { sketchId: sk.id, sketchVersion: sk.currentVersion, result });
    if (finish) {
      const last = content.capstoneSessionIds(capstoneId).at(-1);
      if (sessionId === last) {
        const r = s.release.release(capstoneId, {
          sessionId: ses.id,
          sketchId: sk.id,
          sketchVersion: sk.currentVersion,
          title,
          flavour: null,
          linerNotesMd: `${title}: the first take.`,
          theoryTags: [],
          includeReviewNote: false,
        });
        this.trackId = r.track.id;
      } else
        s.course.capstoneCompleteSession(capstoneId, {
          capstoneSessionId: sessionId,
          sketchId: sk.id,
          flavour: null,
        });
      this.done.push(sessionId);
    }
    this.end(ses.id);
  }

  async draft(capstoneId: string): Promise<void> {
    const first = this.d.content.capstoneSessionIds(capstoneId)[0];
    if (first === undefined) throw badRequest(`capstone ${capstoneId} has no sessions`);
    await this.#capstone(capstoneId, first, false);
  }
}

export async function seedLearner(d: AppDeps, body: DevSeedRequest): Promise<DevSeedResult> {
  const clock = needDevClock(d);
  const order = d.content.defaultOrder();
  const plan = planSeed(body.point, order);
  const gapDays = body.gapDays ?? plan.gapDays ?? 0;
  const items = plan.upTo === null ? [] : order.slice(0, order.indexOf(plan.upTo) + 1);
  const extraDays = plan.extra === null ? 0 : plan.extra.kind === "cp-failed" ? plan.extra.times : 1;
  const days = items.length + extraDays;

  // Wipe, keeping the /dev/listen verdicts.
  const marks = d.repos.listen.list();
  d.services.backup.reset();
  for (const m of marks) d.repos.listen.put(m);
  const target = body.targetMinutes ?? 20;
  const seeder = new Seeder(d, target, body.practice ?? true);

  const now = clock.now();
  // Item k on its own day; the last one `gapDays + 1` days before today (0 missed days: yesterday).
  const dayAt = (k: number) => new Date(now.getTime() - (gapDays + 1 + (days - 1 - k)) * DAY_MS);
  await clock.at(days === 0 ? now : dayAt(0), () => {
    // The profile exists from the first simulated day: the first week's goal and the day count start there.
    const p = d.repos.profile.get();
    if (body.targetMinutes !== undefined && p.targetMinutes !== body.targetMinutes)
      d.repos.profile.patch({ targetMinutes: body.targetMinutes });
  });
  let k = 0;
  for (const id of items) {
    await clock.at(dayAt(k), () => seeder.item(id));
    k++;
  }
  if (plan.extra?.kind === "cp-failed")
    for (let n = 1; n <= plan.extra.times; n++) {
      const cpId = plan.extra.cpId;
      await clock.at(dayAt(k), () => seeder.failCheckpoint(cpId, n));
      k++;
    }
  if (plan.extra?.kind === "draft") {
    const capId = plan.extra.capstoneId;
    await clock.at(dayAt(k), () => seeder.draft(capId));
    k++;
  }
  const time = new LearnerTime(d.services.ctx);
  return {
    point: body.point,
    done: seeder.done,
    next: d.services.gates.nextMapItem(),
    day: time.day(),
    lastActiveDay: days === 0 ? null : time.day(dayAt(days - 1)),
    gapDays: days === 0 ? 0 : gapDays,
    sketchIds: seeder.sketchIds,
    capstoneSketchId: seeder.capstoneSketchId,
    trackId: seeder.trackId,
  };
}

/**
 * A seeded capstone draft: the brief's own first passing test (content CI grades it), else its starter. Real
 * course code, so the seeded piece runs under the learner's unlocks in the browser.
 */
export function capstoneDraftCode(brief: Exercise | undefined): string {
  return firstPassingCode(brief) ?? 'setcpm(100/4)\n\ndrums: s("bd ~ sd ~")';
}

/** A seeded lesson Make: the Make's own first passing test (real course code), else its starter. */
export function lessonMakeCode(make: Exercise | undefined): string {
  return firstPassingCode(make) ?? 'setcpm(96/4)\n\ndrums: s("bd ~ sd ~")';
}

function firstPassingCode(ex: Exercise | undefined): string | null {
  const b = ex as
    | { tests?: { expect: string; response?: { code?: string } }[]; code?: { starter?: string } }
    | undefined;
  const pass = b?.tests?.find((t) => t.expect === "pass" && typeof t.response?.code === "string");
  return pass?.response?.code ?? b?.code?.starter ?? null;
}

/** A seeded checkpoint Make: labelled parts with tools every checkpoint from U01.CP on has unlocked. */
export const CHECKPOINT_GROOVE =
  'setcpm(100/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8")';
