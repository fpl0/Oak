// The Transcription Gym (contracts §2.5, §9.1; docs/design/wave4.md §5.5): the slot rule's state for Today and
// Transcribe, what the next gym session holds, and starting one (`gym.start`): the learner's own ordinals, odd
// sessions graded ladder at the learner's level and realism, even sessions own audio (a ladder session one realism
// level up without an audio project).
import type { GymPlan, GymSession, SessionSummary } from "@oak/api";
import { tx } from "../db/index.ts";
import { conflict, notFound } from "../errors.ts";
import type { CapstoneSessionsService } from "./capstone-sessions.ts";
import { LearnerTime, type ServiceContext } from "./context.ts";
import type { GatesService } from "./gates.ts";
import type { LadderService } from "./ladder.ts";
import { MAX_GYM, sessionsSinceTranscription, transcriptionSlotDue } from "./session-plan.ts";

/** The part of the planner's course port the gym reads (`CourseAdapter` in srs-wiring.ts). */
export interface GymCoursePort {
  next(): { id: string } | null;
  history(): string[];
  /** Wave 6: CF-T's next session while it is open and unfinished (it then fills the slot). */
  nextCftSession?(): string | null;
  /** d19: reviews-only sessions since the last transcription session. */
  reviewSessionsSinceTranscription?(): number;
  coreStage?(): "in-progress" | "lessons-done" | "complete";
}

export interface GymDeps {
  gates: GatesService;
  ladder: LadderService;
  capstoneSessions: CapstoneSessionsService;
  course: () => GymCoursePort;
}

/** The capstone whose gate the gym reports while closed (contracts §6.6: "Two more gym sets open X1"). */
export const GYM_GATED_CAPSTONE = "X1";

export class GymService {
  readonly time: LearnerTime;
  constructor(
    private readonly ctx: ServiceContext,
    private readonly d: GymDeps,
  ) {
    this.time = new LearnerTime(ctx);
  }

  /** The next free `GYM.nn` of the learner's own history. */
  nextOrdinal(): number {
    return this.ctx.repos.gym.list().reduce((m, g) => Math.max(m, Number(g.gymId.slice(4))), 0) + 1;
  }

  /** The own-audio project an even slot continues: the most recently touched one that is not done. */
  audioProject(): string | null {
    return (
      this.ctx.repos.transcriptions.list().find((t) => t.sourceKind === "own-audio" && t.status !== "done")
        ?.id ?? null
    );
  }

  /** `GET /gym`. */
  plan(): GymPlan {
    const course = this.d.course();
    const history = course.history();
    const core = sessionsSinceTranscription(history);
    const active = core !== null;
    // d19: reviews-only sessions count towards the slot like core sessions.
    const reviews = active ? (course.reviewSessionsSinceTranscription?.() ?? 0) : 0;
    // Once the core is complete only the reviews-only sessions since count (wave6.md §5.5).
    const coreCounts = (course.coreStage?.() ?? "in-progress") !== "complete";
    const since = core === null ? null : (coreCounts ? core : 0) + reviews;
    const next = active ? course.next() : null;
    const xNext = next !== null && /^X\d+\.S\d+$/.test(next.id);
    const slotDue = active && transcriptionSlotDue(history, next?.id ?? null, reviews, coreCounts);
    const cfT = this.cft(course.nextCftSession?.() ?? null);
    const n = this.nextOrdinal();
    const audio = this.audioProject();
    const ladder = n % 2 === 1 || audio === null;
    const fallback = n % 2 === 0 && audio === null;
    const level = this.ctx.repos.ladder.state().level;
    const x1 =
      this.ctx.content.capstoneMeta(GYM_GATED_CAPSTONE) === null
        ? null
        : this.d.capstoneSessions.gate(GYM_GATED_CAPSTONE);
    return {
      active,
      sinceLast: since ?? 0,
      slotDue,
      next:
        !active || (xNext && (since ?? 0) >= 4) || n > MAX_GYM || cfT?.takesSlot === true
          ? null
          : {
              gymId: `GYM.${String(n).padStart(2, "0")}` as NonNullable<GymPlan["next"]>["gymId"],
              kind: ladder ? "ladder" : "own-audio",
              ladderLevel: ladder ? level : null,
              realism: ladder ? this.d.ladder.realismFor(level, fallback) : null,
              ownAudioFallback: fallback,
              transcriptionId: ladder ? null : audio,
            },
      history: this.ctx.repos.gym.list(),
      x1: x1 !== null && !x1.open ? x1 : null,
      cfT,
    };
  }

  /**
   * Wave 6 (contracts §2.5; wave6.md §5.2): CF-T beside the gym. From U15.L01 on, while it is open and unfinished,
   * the transcription slot is its next session (`takesSlot`, and the plan's `next` is `null`); once released the
   * slots are gym sessions again. `null` before its gate is met.
   */
  cft(nextSessionId: string | null): GymPlan["cfT"] {
    const meta = this.ctx.content.capstoneMeta("CF-T");
    if (meta === null || !this.d.gates.capstoneOpen(meta)) return null;
    const row = this.ctx.repos.capstones.get("CF-T");
    const status = row?.status === "released" ? "released" : row === null ? "open" : "in_progress";
    const sketch = row?.sketchId == null ? null : this.ctx.repos.sketches.get(row.sketchId);
    return {
      status:
        status === "in_progress" && (row?.sessions.length ?? 0) === 0 && sketch === null ? "open" : status,
      nextSessionId:
        status === "released" ? null : (nextSessionId as NonNullable<GymPlan["cfT"]>["nextSessionId"]),
      takesSlot: status !== "released" && nextSessionId !== null,
      songId: sketch?.tags.find((t) => t.startsWith("song.")) ?? null,
    };
  }

  /**
   * Wave 5 (c10, wave5.md §5.4): what a gym day's Coda shows. Ladder: the level and realism the session was drawn
   * at, its best score, whether it made a graded pass, the realism change it caused and the level-up it opened, each
   * announced in this session's Coda only. Own audio: the project's checklist, the versions saved and the regions
   * marked today. `null` when the session started no gym session.
   */
  summary(sessionId: string): SessionSummary["gym"] {
    const g = this.ctx.repos.gym.list().find((x) => x.sessionId === sessionId);
    if (g === undefined) return null;
    const t = g.transcriptionId === null ? null : this.ctx.repos.transcriptions.get(g.transcriptionId);
    const day = this.time.day();
    if (g.kind === "own-audio") {
      const versionsToday =
        t === null
          ? 0
          : this.ctx.repos.transcriptions
              .versions(t.id)
              .filter((v) => this.time.day(new Date(v.createdAt)) === day).length;
      return {
        gymId: g.gymId as NonNullable<SessionSummary["gym"]>["gymId"],
        kind: "own-audio",
        transcriptionId: g.transcriptionId,
        title: t?.title ?? "Your own audio",
        ladder: null,
        ownAudio: {
          checklist: Object.fromEntries(
            Object.entries(t?.checklist ?? {}).filter(([, v]) => Number.isFinite(v) && v >= 0 && v <= 2),
          ),
          versionsToday,
          regions: t?.regions.length ?? 0,
        },
      };
    }
    const row = this.ctx.repos.ladder.session(sessionId);
    const state = this.ctx.repos.ladder.state();
    const level = g.ladderLevel ?? row?.level ?? state.level;
    const realism = g.realism ?? row?.startRealism ?? state.realism;
    const realismChange =
      row !== null && row.level === state.level && row.startRealism !== state.realism
        ? { from: row.startRealism, to: state.realism }
        : null;
    return {
      gymId: g.gymId as NonNullable<SessionSummary["gym"]>["gymId"],
      kind: "ladder",
      transcriptionId: g.transcriptionId,
      title: t?.title ?? "Transcription Gym: ladder",
      ladder: {
        level,
        realism,
        bestScore: row === null ? null : Math.max(0, Math.min(1, row.bestScore)),
        gradedPass: row?.gradedPass ?? false,
        realismChange,
        levelUp: this.d.ladder.levelUpEarnedBy(sessionId),
      },
      ownAudio: null,
    };
  }

  /**
   * `POST /gym/sessions`: a gym session takes the next ordinal. A ladder session records the level and realism it
   * is drawn at (the learner's; one realism level up when an even slot falls back for want of an audio project).
   */
  start(body: {
    sessionId: string | null;
    kind: "ladder" | "own-audio";
    transcriptionId: string | null;
    /** Wave 7: the source served after the core (`own:<id>`, `song:<id>` …); absent or null: none recorded. */
    source?: string | null | undefined;
  }): GymSession {
    return tx(this.ctx.repos.db, () => {
      // One gym session per Oak session: a retried start (a reload, a second tab, a double click) is answered with
      // the session already started, never a second ordinal (the slot rule counts every GYM.nn).
      const sessionId =
        body.sessionId !== null && this.ctx.repos.sessions.get(body.sessionId) !== null
          ? body.sessionId
          : null;
      const started =
        sessionId === null ? undefined : this.ctx.repos.gym.list().find((g) => g.sessionId === sessionId);
      if (started !== undefined) {
        if (started.kind !== body.kind)
          throw conflict(`${started.gymId} was already started as a ${started.kind} session`);
        return started;
      }
      const n = this.nextOrdinal();
      if (n > MAX_GYM) throw conflict(`GYM.${MAX_GYM} was the last gym session`);
      if (body.transcriptionId !== null && this.ctx.repos.transcriptions.get(body.transcriptionId) === null)
        throw notFound(`transcription ${body.transcriptionId}`);
      const level = this.ctx.repos.ladder.state().level;
      const fallback = body.kind === "ladder" && n % 2 === 0 && this.audioProject() === null;
      return this.ctx.repos.gym.insert({
        gymId: `GYM.${String(n).padStart(2, "0")}`,
        sessionId,
        kind: body.kind,
        ladderLevel: body.kind === "ladder" ? level : null,
        realism: body.kind === "ladder" ? this.d.ladder.realismFor(level, fallback) : null,
        transcriptionId: body.transcriptionId,
        at: this.time.iso(),
        ...(body.source ? { source: body.source } : {}),
      });
    });
  }
}
