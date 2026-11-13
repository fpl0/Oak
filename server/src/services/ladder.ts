// The generated transcription ladder L1–L4 (contracts §2.9, §6.12; docs/design/wave4.md §5.4): the learner's level
// and realism, the next item from `@oak/drills` `generateLadderPiece` (hidden code on the server, stimulus events to
// the browser), exact grading through the grader's ladder entry on the learner host, graded passes (what
// milestones and level-ups count), the realism rule from each session's best score, and the offered level-up.
import type {
  LadderItem,
  LadderNext,
  LadderState,
  LadderSubmit,
  LadderSubmitResult,
  TranscriptionDetail,
} from "@oak/api";
import type {
  GradeResult,
  KeySpec,
  LintContext,
  MeterId,
  PickupSpec,
  SwingSpec,
  UnlockableId,
} from "@oak/content-kit";
import { skillOf } from "@oak/content-kit";
import {
  type GradeRequest,
  LADDER_PASS,
  type LadderGradeRequest,
  ladderGradedPass,
  ladderGradeRequest,
  nextRealism,
  type RealismLevel,
} from "@oak/grader";
import { tx } from "../db/index.ts";
import type { StoredTranscription } from "../db/repos/library.ts";
import type { LadderSessionRow } from "../db/repos/wave4.ts";
import { ApiError, badRequest, conflict, notFound } from "../errors.ts";
import { familyForLayer } from "./capstone-sessions.ts";
import { LearnerTime, newId, type ServiceContext } from "./context.ts";
import type { LadderGenerator, LibraryService } from "./library.ts";
import { evidenceWeight, type MasteryService } from "./mastery.ts";
import type { SrsPort } from "./ports.ts";
import type { StreakService } from "./streak.ts";
import type { UnlocksService } from "./unlocks.ts";

export type LadderLevelNo = 1 | 2 | 3 | 4;
type Stage = "bass" | "quality" | "rn";

/** Level-up (wave4.md §5.4): graded passes at the current level, at realism R2 or higher, on this many days. */
export const LEVEL_UP_PASSES = 2;
export const LEVEL_UP_MIN_REALISM = 2;
/** Sessions `ladder.get` reports (oldest first). */
export const LADDER_HISTORY = 10;

export interface LadderDeps {
  library: LibraryService;
  mastery: MasteryService;
  streak: StreakService;
  unlocks: UnlocksService;
  srs: () => SrsPort | null;
  /** The learner host's `grade` (`GraderHost.grade`): learner code never runs in the server's own realm. */
  grade: (req: GradeRequest) => Promise<GradeResult>;
  generator?: LadderGenerator;
}

/** The layer a level (and an L3 stage) transcribes, for evidence. */
function layerOf(level: number, stage: Stage | null): "melody" | "bass" | "chords" | null {
  if (level === 1) return null;
  if (level === 2) return "bass";
  if (level === 3) return stage === null || stage === "bass" ? "bass" : "chords";
  return "melody";
}

export class LadderService {
  readonly time: LearnerTime;
  constructor(
    private readonly ctx: ServiceContext,
    private readonly d: LadderDeps,
  ) {
    this.time = new LearnerTime(ctx);
  }
  get #repos() {
    return this.ctx.repos;
  }

  /** `GET /ladder`. */
  state(): LadderState {
    const s = this.#repos.ladder.state();
    const sessions = this.#repos.ladder.sessions();
    const gradedPasses: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0 };
    for (const t of this.#repos.transcriptions.list())
      if (t.sourceKind === "generated" && t.gradedPass === true && t.ladderLevel !== null)
        gradedPasses[String(t.ladderLevel)] = (gradedPasses[String(t.ladderLevel)] ?? 0) + 1;
    return {
      level: s.level,
      realism: s.realism,
      history: sessions.slice(-LADDER_HISTORY).map((r) => ({
        level: r.level,
        realism: r.startRealism,
        score: r.bestScore,
        passed: r.passed,
        day: r.day,
        gymId: r.gymId as LadderState["history"][number]["gymId"],
      })),
      gradedPasses,
      levelUp: this.#levelUp(s.level, sessions),
    };
  }

  #levelUp(level: number, sessions: readonly LadderSessionRow[]): LadderState["levelUp"] {
    if (level >= 4) return null;
    const days = new Set(
      sessions
        .filter((r) => r.level === level && r.gradedPass && r.startRealism >= LEVEL_UP_MIN_REALISM)
        .map((r) => r.day),
    );
    if (days.size < LEVEL_UP_PASSES) return null;
    return {
      to: (level + 1) as LadderLevelNo,
      reason: `Two graded passes at L${level}, realism R${LEVEL_UP_MIN_REALISM} or higher, on two different days.`,
    };
  }

  /** `PUT /ladder`: take the offered level-up, or move down any time. A new level starts at R0. */
  setLevel(level: number): LadderState {
    tx(this.#repos.db, () => {
      const s = this.#repos.ladder.state();
      if (level === s.level) return;
      const up = this.#levelUp(s.level, this.#repos.ladder.sessions());
      if (level > s.level && (up === null || up.to !== level))
        throw conflict(
          up === null
            ? `L${level} opens after two graded passes at L${s.level} at realism R2 or higher, on two days`
            : `the next level is L${up.to}`,
        );
      this.#repos.ladder.saveState(level, 0, this.time.iso());
    });
    return this.state();
  }

  /** The realism a gym session's ladder item is drawn at: the learner's, one up on an even slot without audio. */
  realismFor(level: number, fallback: boolean): RealismLevel {
    const s = this.#repos.ladder.state();
    const base = level === s.level ? s.realism : 0;
    return Math.min(4, base + (fallback ? 1 : 0)) as RealismLevel;
  }

  /** `POST /ladder/items`: the next generated item, created as a `generated` transcription project. */
  async next(body: LadderNext): Promise<LadderItem> {
    if (this.d.generator === undefined)
      throw new ApiError("unavailable", "the ladder generator is not available yet");
    const s = this.#repos.ladder.state();
    const level = (body.level ?? s.level) as LadderLevelNo;
    if (level > s.level) {
      const up = this.#levelUp(s.level, this.#repos.ladder.sessions());
      if (up === null || up.to !== level)
        throw conflict(`L${level} is not open yet; the ladder is at L${s.level}`);
    }
    let realism: number = level === s.level ? s.realism : 0;
    let gymId: string | null = null;
    if (body.gymId !== null) {
      const gym = this.#repos.gym.list().find((g) => g.gymId === body.gymId);
      if (gym === undefined) throw notFound(`gym session ${body.gymId}`);
      gymId = gym.gymId;
      // The gym session fixed its realism when it started (an even slot without audio: one level up).
      if (gym.kind === "ladder" && gym.realism !== null && (gym.ladderLevel ?? level) === level)
        realism = gym.realism;
    }
    const seed = body.seed ?? Math.floor(Math.random() * 2 ** 31);
    const completed = new Set(
      this.#repos.lessons
        .allProgress()
        .filter((p) => p.status === "completed")
        .map((p) => p.lessonId as string),
    );
    const piece = this.d.generator(level, realism, seed, { completed });
    const id = newId("tr");
    const at = this.time.iso();
    const t: StoredTranscription = {
      id,
      sourceKind: "generated",
      player: "pattern",
      audioId: null,
      songId: null,
      title: piece.title,
      artist: null,
      key: piece.key,
      bpm: piece.bpm,
      meter: piece.meter,
      downbeatS: null,
      fineTuneCents: 0,
      ladderLevel: level,
      realism,
      regions: [],
      checklist: {},
      selfScore: null,
      currentVersion: 0,
      status: "in_progress",
      review: null,
      createdAt: at,
      updatedAt: at,
      hiddenCode: piece.code,
      gradedPass: false,
      gymId: gymId as StoredTranscription["gymId"],
      ladder: {
        seed,
        given: {
          bpm: piece.given.bpm,
          meter: piece.given.meter,
          key: piece.given.key,
          pickup: piece.given.pickup as { units: [number, number] } | null,
          bars: piece.given.bars,
        },
        cycles: piece.bars,
        stages: piece.stages,
        swing: piece.swing as { subdivision: number; amount: number } | null,
        title: piece.title,
        stimulus: {
          events: piece.events,
          cps: piece.cps,
          bars: piece.bars,
          preload: piece.preload,
          performance: piece.performance,
        },
      },
    };
    tx(this.#repos.db, () => {
      this.#repos.transcriptions.insert(t);
      if (gymId !== null) this.#repos.gym.setTranscription(gymId, id);
    });
    const project: TranscriptionDetail = await this.d.library.transcription(id);
    return {
      itemId: id,
      level,
      realism,
      seed,
      stages: piece.stages,
      given: {
        bpm: piece.given.bpm,
        meter: piece.given.meter,
        key: piece.given.key,
        pickup: piece.given.pickup,
        bars: piece.given.bars,
      },
      project,
    };
  }

  /**
   * The answer key of a stored item as code the learner could write (dev seeds and tests only; never served): the
   * generator is deterministic, so the item is regenerated from its seed and checked against the stored reference.
   */
  answerOf(itemId: string, stage: Stage | null): string | null {
    const t = this.#repos.transcriptions.get(itemId);
    if (t === null || t.ladder === undefined || t.ladder === null || this.d.generator === undefined)
      return null;
    const completed = new Set(
      this.#repos.lessons
        .allProgress()
        .filter((p) => p.status === "completed")
        .map((p) => p.lessonId as string),
    );
    const piece = this.d.generator(t.ladderLevel ?? 1, t.realism ?? 0, t.ladder.seed, { completed });
    if (piece.code !== t.hiddenCode) return null;
    return stage === null ? piece.answer : (piece.stageAnswers?.[stage] ?? null);
  }

  /** The grader's item for a stored ladder project (the hidden reference stays here). */
  #item(t: StoredTranscription, stage: Stage | null): LadderGradeRequest["item"] {
    const l = t.ladder as NonNullable<StoredTranscription["ladder"]>;
    return {
      itemId: `lad.${t.ladderLevel}.${l.seed}`,
      level: t.ladderLevel as LadderLevelNo,
      ...(stage === null ? {} : { stage }),
      reference: t.hiddenCode as string,
      bars: l.cycles,
      key: l.given.key as KeySpec,
      meter: l.given.meter as MeterId,
      bpm: l.given.bpm,
      ...(l.given.pickup === null ? {} : { pickup: l.given.pickup as PickupSpec }),
      ...(l.swing === null ? {} : { swing: l.swing as SwingSpec }),
    };
  }

  /**
   * `POST /ladder/items/:id/submissions`: grade exactly against the hidden reference (pass ≥ 0.85), save the
   * version, record the session's best score and apply the realism rule (contracts §6.12). L3 is staged:
   * `bass`, then `quality`, then `rn`, each open once the one before passed or was revealed.
   */
  async submit(itemId: string, body: LadderSubmit): Promise<LadderSubmitResult> {
    const t = this.#repos.transcriptions.get(itemId);
    if (t === null) throw notFound(`ladder item ${itemId}`);
    if (t.sourceKind !== "generated" || t.ladder === undefined || t.ladder === null || t.hiddenCode === null)
      throw conflict("this project is not a generated ladder item");
    const stages = t.ladder.stages;
    const stage: Stage | null = body.stage ?? null;
    if (stages !== null && stages.length > 0) {
      if (stage === null) throw badRequest("this item is checked stage by stage: name the stage");
      const i = stages.indexOf(stage);
      if (i < 0) throw badRequest(`this item has no stage ${stage}`);
      const versions = this.#repos.transcriptions.versions(itemId);
      for (const prev of stages.slice(0, i)) {
        const cleared = versions.some(
          (v) =>
            v.stage === prev &&
            v.result !== null &&
            ((v.result.status === "pass" && v.result.score >= LADDER_PASS) || v.result.assist.revealed),
        );
        if (!cleared) throw conflict(`the ${stage} stage opens once the ${prev} stage passes`);
      }
    } else if (stage !== null) throw badRequest("this item has no stages");

    const lint: LintContext = {
      profile: "graded",
      unlocked: this.d.unlocks.usableIn(null) as Set<UnlockableId>,
      allowPreview: false,
      meter: t.ladder.given.meter as MeterId,
      key: t.ladder.given.key as KeySpec,
    };
    const prior = this.#repos.transcriptions.versions(itemId).filter((v) => (v.stage ?? null) === stage);
    const graded = prior.filter((v) => v.result !== null && v.result.status !== "error").length;
    const req = ladderGradeRequest({
      item: this.#item(t, stage),
      code: body.code,
      ctx: {
        params: {},
        attemptNo: graded + 1,
        firstAttempt: graded === 0,
        rung: body.rung,
        tutorHints: 0,
        extraReplays: 0,
        lint,
      },
    });
    const raw = await this.d.grade(req);
    // The hint rung is the client's for a ladder item (no step row); rung 4 is a reveal: never a graded pass.
    const result: GradeResult = {
      ...raw,
      assist: { ...raw.assist, rung: body.rung, revealed: raw.assist.revealed || body.rung >= 4 },
    };
    const isGraded = result.status !== "error";
    const passed = result.status === "pass" && result.score >= LADDER_PASS - 1e-9;

    let otherWork: { familyId: string; credit: number; gym: boolean } | null = null;
    const out = tx(this.#repos.db, () => {
      const version = this.d.library.saveTranscriptionVersion(itemId, {
        code: body.code,
        result,
        ranOk: isGraded,
        stage,
      });
      const fresh = this.#repos.transcriptions.get(itemId) as StoredTranscription;
      const versions = this.#repos.transcriptions.versions(itemId);
      const stageGraded = (s: Stage | null) =>
        versions.some((v) => (v.stage ?? null) === s && v.result !== null && ladderGradedPass(v.result));
      const gradedPass =
        stages !== null && stages.length > 0 ? stages.every((s) => stageGraded(s)) : ladderGradedPass(result);
      const last = stages === null || stages.length === 0 || stage === stages.at(-1);
      this.#repos.transcriptions.update({
        ...fresh,
        gradedPass: fresh.gradedPass === true || gradedPass,
        status: fresh.status === "done" || (passed && last) ? "done" : fresh.status,
        updatedAt: this.time.iso(),
      });

      // The session's best score (an Oak session, else the learner day) feeds the realism rule.
      const s = this.#repos.ladder.state();
      const day = this.time.day();
      const key =
        body.sessionId !== null && this.#repos.sessions.get(body.sessionId) !== null
          ? body.sessionId
          : `day:${day}`;
      const prev = this.#repos.ladder.session(key);
      const now = this.time.iso();
      const row: LadderSessionRow = {
        sessionKey: key,
        level: t.ladderLevel ?? s.level,
        startRealism: prev?.startRealism ?? s.realism,
        bestScore: isGraded ? Math.max(prev?.bestScore ?? 0, result.score) : (prev?.bestScore ?? 0),
        passed: (prev?.passed ?? false) || passed,
        gradedPass: (prev?.gradedPass ?? false) || gradedPass,
        day: prev?.day ?? day,
        gymId: t.gymId ?? prev?.gymId ?? null,
        firstAt: prev?.firstAt ?? now,
        at: now,
      };
      this.#repos.ladder.saveSession(row);
      let realismChange: LadderSubmitResult["realismChange"] = null;
      // Realism moves with items at the learner's own level; the session's best score decides (so a better item
      // later in the same session can undo a drop an earlier one caused). Announced once, in the Coda.
      if (isGraded && row.level === s.level) {
        const history = this.#repos.ladder
          .sessions()
          .filter((r) => r.sessionKey !== key)
          .concat([row])
          .map((r) => ({
            level: r.level as LadderLevelNo,
            realism: r.startRealism as RealismLevel,
            score: r.bestScore,
          }));
        const to = nextRealism(history, row.startRealism as RealismLevel);
        if (to !== s.realism) this.#repos.ladder.saveState(s.level, to, now);
        if (to !== row.startRealism) realismChange = { from: row.startRealism, to };
      }

      // Evidence (contracts §7.4–§7.5): the item's first graded answer per stage, never a revealed or machine one.
      if (isGraded && graded === 0 && !result.assist.revealed) {
        const layer = layerOf(t.ladderLevel ?? 1, stage);
        const fam = layer === null ? null : familyForLayer(this.ctx.content, layer);
        if (fam !== null) {
          const skills = [...new Set(fam.skills.map((x) => skillOf(x.skill)))];
          this.d.mastery.addEvidence(
            skills.map((skillId) => ({
              skillId: skillId as never,
              category: null,
              score: Math.max(0, Math.min(1, result.score)),
              weight: evidenceWeight("gym-set"),
              sourceKind: "gym-set" as const,
              sourceId: `ladder/${itemId}${stage === null ? "" : `.${stage}`}`,
            })),
          );
          otherWork = { familyId: fam.id, credit: result.score, gym: t.gymId !== null };
        }
      }
      return { result, passed, gradedPass, realismChange, version };
    });
    // A graded transcription step reviews its family's card when due within 2 days, else moves only its level
    // (contracts §7.4): melodic dictation items are what "gym sets" toward X1's family level are made of.
    const ow = otherWork as { familyId: string; credit: number; gym: boolean } | null;
    const srs = this.d.srs();
    if (ow !== null && srs?.otherWork !== undefined)
      await srs.otherWork({
        source: ow.gym ? "gym" : "practice",
        familyId: ow.familyId,
        meanCredit: ow.credit,
      });
    return { ...out, ladder: this.state() };
  }
}
