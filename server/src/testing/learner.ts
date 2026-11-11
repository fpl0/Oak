// Test support (not a test file): a simulated learner that uses Oak ONLY through its HTTP API, as the app
// does: Today's plan, sessions, warm-up drill sets and fact reviews, lesson steps (attempts, hints, reveal),
// lesson completion with a saved Make, checkpoints, capstones, the Coda. Grading happens in the browser in
// the real app; here the learner posts the grade a browser would have computed (`gradeResult`).
import type {
  CapstoneReleaseResult,
  CheckpointAttemptStart,
  CheckpointOutcome,
  DrillFinish,
  DrillSession,
  LessonCompleteResult,
  LessonSteps,
  Session,
  SessionPlan,
  SessionSummary,
  StepAttemptResult,
  StepState,
  WarmupItem,
} from "@oak/api";
import type { LessonDef } from "@oak/content-kit";
import type { ContentSource } from "../content/types.ts";
import { gradeResult, type Harness } from "./harness.ts";

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    what: string,
  ) {
    super(`${what} → ${status} ${JSON.stringify(body)}`);
  }
}

/** Deterministic pseudo-random numbers for credits and response times. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DayLog {
  day: string;
  plan: SessionPlan;
  session: Session | null;
  warmup: { item: WarmupItem; finish: DrillFinish | null }[];
  summary: SessionSummary | null;
  complete: LessonCompleteResult | null;
  checkpoint: CheckpointOutcome | null;
  release: CapstoneReleaseResult | null;
}

export class SimLearner {
  readonly rand: () => number;
  /** Mean credit of a drill set (85% by default, one set in ten below 0.65, contracts §7.4 simulation). */
  meanCredit = 0.85;

  constructor(
    readonly h: Harness,
    readonly content: ContentSource,
    seed = 7,
  ) {
    this.rand = rng(seed);
  }

  async api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await this.h.json<T>(method, path, body);
    if (r.status < 200 || r.status >= 300) throw new ApiFailure(r.status, r.body, `${method} ${path}`);
    return r.body;
  }

  lesson(id: string): LessonDef {
    const def = this.content.lessons.find((l) => l.id === id);
    if (def === undefined) throw new Error(`no lesson ${id} in the test content`);
    return def;
  }

  today(): Promise<SessionPlan> {
    return this.api<SessionPlan>("GET", "/api/session/today");
  }

  async startSession(plan: SessionPlan): Promise<Session> {
    return this.api<Session>("POST", "/api/session/start", {
      kind: plan.kind,
      mapItemId: plan.mapItemId,
      targetMinutes: plan.targetMinutes,
    });
  }

  async sketch(title: string, originKind: string, originId: string | null, sessionId: string | null) {
    const r = await this.api<{ sketch: { id: string; currentVersion: number } }>("POST", "/api/sketches", {
      title,
      originKind,
      originId,
      sessionId,
      code: 's("bd ~ sd ~, hh*8")',
      bpm: 96,
      meter: "4/4",
      key: null,
      analysis: null,
      note: null,
      tutorAssisted: false,
      band: null,
      flags: { lockedTools: [], previewTools: [] },
      ranOk: true,
    });
    return r.sketch;
  }

  /** One warm-up item done through the drill API (or `srs/review` for fact cards). */
  async doItem(sessionId: string, item: WarmupItem): Promise<DrillFinish | null> {
    if (item.kind === "listen") return null;
    const facts = item.cardIds.filter((c) => this.content.decks.some((d) => d.cards.some((x) => x.id === c)));
    if (item.familyId === null && item.members.length === 0) {
      for (const cardId of facts)
        await this.api("POST", "/api/srs/review", {
          cardId,
          drillSessionId: null,
          outcome: {
            meanCredit: this.rand() < this.meanCredit ? 1 : 0,
            medianRtMs: 2500,
            extraReplays: 0,
            hintRung: 0,
            revealed: false,
            playedLevel: null,
            meanAbsCents: null,
          },
        });
      return null;
    }
    const familyIds = item.familyId !== null ? [item.familyId] : item.members;
    const purpose = item.kind === "anchor" ? "anchor" : item.kind === "repair" ? "repair" : "srs";
    const drill = await this.api<DrillSession>("POST", "/api/drills/sessions", {
      sessionId,
      purpose,
      familyIds,
      warmupItemId: item.id,
    });
    const weak = this.rand() < 0.1;
    const trials = [];
    for (let idx = 0; idx < Math.max(1, drill.trialsPlanned); idx++) {
      const familyId = familyIds[idx % familyIds.length] as string;
      const cats = drill.openCategories[familyId] ?? [];
      const p = weak ? 0.5 : this.meanCredit;
      const credit = this.rand() < p ? 1 : 0;
      trials.push({
        idx,
        familyId,
        seed: idx + 1,
        level: drill.levels[familyId] ?? 1,
        category: cats[idx % Math.max(1, cats.length)] ?? "all",
        params: {},
        response: { answer: null, taps: null, sung: null, skipped: false },
        credit,
        correct: credit === 1,
        rtMs: 1500 + Math.round(this.rand() * 1500),
        replays: 0,
        confusion: null,
        centsError: null,
        at: this.h.clock.now().toISOString(),
      });
    }
    await this.api("POST", `/api/drills/sessions/${drill.id}/trials`, { trials });
    return this.api<DrillFinish>("POST", `/api/drills/sessions/${drill.id}/finish`);
  }

  async attempt(
    lessonId: string,
    stepId: string,
    exerciseId: string,
    score: number,
    sessionId: string | null,
    exerciseVersion = 1,
  ): Promise<StepAttemptResult> {
    return this.api<StepAttemptResult>("POST", `/api/lessons/${lessonId}/steps/${stepId}/attempts`, {
      sessionId,
      exerciseId,
      exerciseVersion,
      seriesNo: 0,
      params: null,
      response: { code: "x" },
      result: gradeResult({ exerciseId: `${lessonId}/${exerciseId}`, score }),
      extraReplays: 0,
      activeMs: 20_000,
      tutorAssisted: false,
    });
  }

  /** Every step of a lesson: graded steps passed (first try unless `struggle` names the step), then the Make. */
  async doLesson(
    lessonId: string,
    sessionId: string,
    opts: { struggle?: string } = {},
  ): Promise<{ rail: LessonSteps; hints: StepState[] }> {
    const def = this.lesson(lessonId);
    const hints: StepState[] = [];
    for (const step of def.steps) {
      await this.api("PUT", `/api/lessons/${lessonId}/position`, {
        sessionId,
        stepId: step.id,
        splitPart: null,
        wrapped: false,
      });
      const ex = step.exercise;
      if (ex === undefined) continue;
      if (opts.struggle === step.id) {
        await this.attempt(lessonId, step.id, ex.id, 0.4, sessionId, ex.version);
        hints.push(
          await this.api<StepState>("POST", `/api/lessons/${lessonId}/steps/${step.id}/hints`, {
            reveal: false,
          }),
        );
        await this.attempt(lessonId, step.id, ex.id, 0.5, sessionId, ex.version);
        hints.push(
          await this.api<StepState>("POST", `/api/lessons/${lessonId}/steps/${step.id}/hints`, {
            reveal: false,
          }),
        );
      }
      await this.attempt(lessonId, step.id, ex.id, 0.9 + this.rand() * 0.1, sessionId, ex.version);
    }
    return { rail: await this.api<LessonSteps>("GET", `/api/lessons/${lessonId}/steps`), hints };
  }

  async completeLesson(lessonId: string, sessionId: string): Promise<LessonCompleteResult> {
    const def = this.lesson(lessonId);
    const sk = await this.sketch(`${def.title} — Make`, "lesson-make", lessonId, sessionId);
    return this.api<LessonCompleteResult>("POST", `/api/lessons/${lessonId}/complete`, {
      sessionId,
      sketchId: sk.id,
      lessonVersion: def.version,
      contentHash: `hash-${def.version}`,
      splitPart: null,
    });
  }

  /** A checkpoint attempt: gating items at `gating`, level-setting items at `levelSetting`. */
  async checkpoint(
    cpId: string,
    sessionId: string | null,
    scores: { gating: number; levelSetting: number; acceptSoftPass?: boolean },
  ): Promise<{ start: CheckpointAttemptStart; outcome: CheckpointOutcome }> {
    const route = cpId.replace(/\.CP$/, "");
    const start = await this.api<CheckpointAttemptStart>("POST", `/api/checkpoints/${route}/start`);
    const sk = await this.sketch(`${cpId} Make`, "checkpoint", cpId, sessionId);
    const outcome = await this.api<CheckpointOutcome>("POST", `/api/checkpoints/${route}/attempts`, {
      sessionId,
      attemptNo: start.attemptNo,
      items: start.items.map((i) => ({
        idx: i.idx,
        score: i.role === "gating" ? scores.gating : scores.levelSetting,
        skipped: false,
        response: { code: "" },
        result: null,
      })),
      makeSketchId: sk.id,
      acceptSoftPass: scores.acceptSoftPass ?? false,
    });
    return { start, outcome };
  }

  async endSession(
    sessionId: string,
    minutes = { warmup: 4, main: 9, make: 4, coda: 1 },
  ): Promise<SessionSummary> {
    return this.api<SessionSummary>("POST", `/api/session/${sessionId}/end`, {
      wrappedEarly: false,
      phaseMs: {
        warmup: minutes.warmup * 60_000,
        main: minutes.main * 60_000,
        make: minutes.make * 60_000,
        coda: minutes.coda * 60_000,
      },
    });
  }
}
