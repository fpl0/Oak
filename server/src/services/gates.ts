// Gates and legal orders (contracts §7.6), checkpoint composition and scoring, capstone status.
// Read-only over the repositories: what is open, what a checkpoint attempt contains, what a set of
// item scores means. The writes (evidence, unlocks, repair queue) are done by the course service.
import type {
  CapstoneStatus,
  CheckpointItemSpec,
  CheckpointOutcome,
  CheckpointStatus,
  CourseProgress,
  LessonProgress,
} from "@oak/api";
import {
  type CapstoneMeta,
  type FamilyId,
  type GateSpec,
  hashSeed,
  type LessonId,
  type SessionId,
  type SkillId,
  skillOf,
} from "@oak/content-kit";
import { CHECKPOINT, MASTERY } from "@oak/srs";
import { dayIndex } from "../lib/days.ts";
import { LearnerTime, type ServiceContext } from "./context.ts";

export type LessonStatus = LessonProgress["status"];

export class GatesService {
  readonly time: LearnerTime;
  constructor(private readonly ctx: ServiceContext) {
    this.time = new LearnerTime(ctx);
  }

  get #content() {
    return this.ctx.content;
  }
  get #repos() {
    return this.ctx.repos;
  }

  // --- simple facts -----------------------------------------------------------------------------

  lessonCompleted(id: string): boolean {
    return this.#repos.lessons.progress(id)?.status === "completed";
  }
  checkpointPassed(cpId: string): boolean {
    return this.#repos.checkpoints.attempts(cpId).some((a) => a.passed || a.softPass);
  }
  capstoneReleased(id: string): boolean {
    return this.#repos.capstones.get(id)?.status === "released";
  }

  /** Every condition of a gate holds (contracts §2.4, §4.3). */
  gateMet(gate: GateSpec): boolean {
    return this.gateMissing(gate).length === 0;
  }
  /** What is still missing, as short learner-facing phrases. */
  gateMissing(gate: GateSpec): string[] {
    const out: string[] = [];
    for (const cp of gate.checkpoints ?? [])
      if (!this.checkpointPassed(cp))
        out.push(`the ${this.#content.checkpointMeta(cp)?.title ?? cp} checkpoint`);
    for (const l of gate.lessonsCompleted ?? [])
      if (!this.lessonCompleted(l)) out.push(`the lesson “${this.#content.lessonTitle(l)}”`);
    for (const c of gate.capstones ?? [])
      if (!this.capstoneReleased(c)) out.push(`releasing ${this.#content.capstoneMeta(c)?.title ?? c}`);
    for (const f of gate.familyLevels ?? []) {
      const level = this.#repos.srs.family(f.family)?.level ?? 0;
      if (level < f.level)
        out.push(`${this.#content.family(f.family)?.title ?? f.family} at level ${f.level}`);
    }
    return out;
  }

  // --- lessons ----------------------------------------------------------------------------------

  /** Whether a lesson is open by the rules of §7.6, whatever its stored progress. */
  lessonOpen(id: string): boolean {
    const site = this.#content.lessonSite(id);
    if (site === null) return false;
    const track = site.unit.track;
    const order = this.#content.trackLessons(track);
    const index = order.indexOf(site.meta.id);
    if (track === "core") {
      // Rule 1: linear across unit boundaries.
      if (index > 0 && !this.lessonCompleted(order[index - 1] as string)) return false;
      // Rule 2: L03 and later need the most recent checkpoint before the unit.
      if (site.ordinal >= 3) {
        const cp = this.#content.checkpointBefore(site.unit.id);
        if (cp !== null && !this.checkpointPassed(cp)) return false;
      }
      return true;
    }
    // Rule 5: track gates plus the previous lesson of the track; optional lessons can be passed over.
    for (const gate of this.#content.trackGatesFor(id, site.unit.id)) if (!this.gateMet(gate)) return false;
    for (let k = index - 1; k >= 0; k--) {
      const prev = order[k] as string;
      const prevMeta = this.#content.lessonSite(prev)?.meta;
      if (prevMeta?.optional === true) continue;
      return this.lessonCompleted(prev);
    }
    return true;
  }

  lessonStatus(id: string): LessonStatus {
    const stored = this.#repos.lessons.progress(id)?.status;
    if (stored === "completed" || stored === "in_progress") return stored;
    return this.lessonOpen(id) ? "available" : "locked";
  }

  lessonProgress(id: string): LessonProgress {
    const stored = this.#repos.lessons.progress(id);
    const status = this.lessonStatus(id);
    if (stored !== null) return { ...stored, status };
    return {
      lessonId: id as LessonId,
      status,
      currentStep: null,
      splitPart: null,
      startedAt: null,
      completedAt: null,
      bestScore: null,
      completedVersion: null,
      contentHash: null,
      updatedAt: this.time.iso(),
    };
  }

  // --- checkpoints ------------------------------------------------------------------------------

  /** Rule 3: a checkpoint opens when the last lesson it covers is completed. */
  checkpointOpen(cpId: string): boolean {
    const lessons = this.#content
      .lessonsCovered(cpId)
      .filter((l) => this.#content.lessonSite(l)?.meta.optional !== true);
    if (lessons.length === 0) return false;
    return lessons.every((l) => this.lessonCompleted(l));
  }

  checkpointStatus(cpId: string): CheckpointStatus {
    const attempts = this.#repos.checkpoints.attempts(cpId);
    const finished = attempts.filter((a) => a.finishedAt !== null);
    const last = finished.at(-1) ?? null;
    const pending = attempts.find((a) => a.finishedAt === null) ?? null;
    let status: CheckpointStatus["status"];
    if (attempts.some((a) => a.passed)) status = "passed";
    else if (attempts.some((a) => a.softPass)) status = "soft-passed";
    else if (!this.checkpointOpen(cpId)) status = "locked";
    else if (last !== null) status = "failed";
    else status = "open";
    const nextNo = finished.length + 1;
    return {
      cpId: cpId as CheckpointStatus["cpId"],
      status,
      attempts: finished.length,
      lastScore: last?.score ?? null,
      softPassAvailable: softPassOffered(nextNo, last?.score ?? 0) && status === "failed",
      pendingAttemptAt: pending?.startedAt ?? null,
    };
  }

  // --- capstones --------------------------------------------------------------------------------

  capstoneStatus(id: string): CapstoneStatus {
    const meta = this.#content.capstoneMeta(id);
    const row = this.#repos.capstones.get(id);
    const missing = meta === null ? ["its content"] : this.gateMissing(meta.opensAfter);
    let status: CapstoneStatus["status"];
    if (row !== null)
      status = row.status === "released" ? "released" : row.status === "in_progress" ? "in_progress" : "open";
    else status = missing.length === 0 ? "open" : "locked";
    return {
      capstoneId: id as CapstoneStatus["capstoneId"],
      status,
      lockedReason: status === "locked" ? `Opens after ${joinWords(missing)}.` : null,
      sessionsDone: row?.sessions.length ?? 0,
      sessionsTotal: meta?.sessions ?? 0,
      sketchId: row?.sketchId ?? null,
      trackId: row?.trackId ?? null,
    };
  }

  capstoneOpen(meta: CapstoneMeta): boolean {
    return this.#repos.capstones.get(meta.id) !== null || this.gateMet(meta.opensAfter);
  }

  // --- sessions and the course ------------------------------------------------------------------

  /** Whether a map item is done: a lesson completed, a checkpoint passed, a capstone session or gym slot held. */
  sessionDone(id: string): boolean {
    if (/^GYM\.\d{2}$/.test(id)) return this.#repos.gym.list().some((g) => g.gymId === id);
    if (this.#content.lessonSite(id) !== null) return this.lessonCompleted(id);
    if (this.#content.checkpointMeta(id) !== null) return this.checkpointPassed(id);
    const m = /^(.+)\.S(\d+)$/.exec(id);
    if (m !== null) return this.#repos.capstones.get(m[1] as string)?.sessions.includes(id) ?? false;
    return false;
  }

  /** Whether a map item can be started now. */
  sessionOpen(id: string): boolean {
    if (/^GYM\.\d{2}$/.test(id)) return true;
    if (this.#content.lessonSite(id) !== null) return this.lessonOpen(id);
    if (this.#content.checkpointMeta(id) !== null) return this.checkpointOpen(id);
    const m = /^(.+)\.S(\d+)$/.exec(id);
    if (m !== null) {
      const meta = this.#content.capstoneMeta(m[1] as string);
      if (meta === null) return false;
      const done = this.#repos.capstones.get(meta.id)?.sessions ?? [];
      const n = Number(m[2]);
      return this.capstoneOpen(meta) && done.length >= n - 1;
    }
    return false;
  }

  /** The next item of the default order that is not done and can be started. */
  nextMapItem(): SessionId | null {
    for (const id of this.#content.defaultOrder())
      if (!this.sessionDone(id) && this.sessionOpen(id)) return id as SessionId;
    // Then any open track lesson.
    for (const site of this.#content.allLessons())
      if (
        site.unit.track !== "core" &&
        this.lessonStatus(site.meta.id) !== "completed" &&
        this.lessonOpen(site.meta.id)
      )
        return site.meta.id;
    return null;
  }

  courseProgress(): CourseProgress {
    const lessons = this.#content.allLessons().map((s) => this.lessonProgress(s.meta.id));
    const checkpoints = this.#content.checkpoints().map((c) => this.checkpointStatus(c.id));
    const capstones = this.#content.capstones().map((c) => this.capstoneStatus(c.id));
    const gym = this.#repos.gym.list().map((g) => ({ gymId: g.gymId, kind: g.kind, at: g.at }));
    const order = this.#content.defaultOrder();
    const trackLessons = this.#content
      .allLessons()
      .filter((s) => s.unit.track !== "core" && this.lessonStatus(s.meta.id) !== "locked")
      .map((s) => s.meta.id as string);
    const all = [...order, ...trackLessons.filter((l) => !order.includes(l as SessionId))];
    return {
      lessons,
      checkpoints,
      capstones,
      gym,
      next: this.nextMapItem(),
      mapDone: all.filter((id) => this.sessionDone(id)).length,
      mapTotal: all.length,
    };
  }

  // --- checkpoint composition and scoring ---------------------------------------------------------

  /** Item role by the kind of the skill tested (§7.6 "What gates"). */
  roleOf(skillId: string): CheckpointItemSpec["role"] {
    const kind = this.#content.skill(skillId)?.kind;
    return kind === "perceptual" || kind === "production" ? "level-setting" : "gating";
  }

  /**
   * Composes a fresh attempt: ≥ 2 items per skill in range from the recipe's families at each
   * family's mastery level, the authored items, up to 3 debt re-tests, the Make; 12 to 18 items,
   * interleaved. Items that need the mic (sung skills) are left out in Quiet mode; tapping stays.
   */
  composeCheckpoint(
    cpId: string,
    attemptNo: number,
    opts: { quiet: boolean; salt?: string } = { quiet: false },
  ): CheckpointItemSpec[] {
    const def = this.#content.checkpointDef(cpId);
    const meta = this.#content.checkpointMeta(cpId);
    if (meta === null) return [];
    const salt = opts.salt ?? "";
    // Quiet mode skips the items that need the microphone: sung skills (the voice category, or a production
    // skill whose families are all mic families). Tapping needs no mic and stays (contracts §8.5).
    const needsMic = (skill: string) => {
      const sk = this.#content.skill(skill);
      if (sk === null || sk.kind !== "production") return false;
      if (sk.category === "voice") return true;
      const fams = ((def?.recipe.families[skill as SkillId] ?? []) as string[]).map((f) =>
        this.#content.family(f),
      );
      return fams.length > 0 && fams.every((f) => f?.mic === true);
    };
    const skip = (skill: string) => opts.quiet && needsMic(skill);
    type Draft = Omit<CheckpointItemSpec, "idx">;
    const drafts: Draft[] = [];
    let n = 0;
    const familyItem = (skill: string, debt: boolean): Draft | null => {
      const fams = (def?.recipe.families[skill as SkillId] ?? []) as string[];
      const familyId = fams[n % Math.max(1, fams.length)];
      n += 1;
      if (familyId === undefined) return null;
      const fam = this.#content.family(familyId);
      const level = Math.max(1, Math.min(fam?.masteryLevel ?? 1, fam?.levels.length ?? 1));
      return {
        skillId: skill as SkillId,
        role: this.roleOf(skill),
        source: {
          kind: "family",
          familyId: familyId as FamilyId,
          level,
          category: null,
          seed: hashSeed(cpId, attemptNo, salt, n),
        },
        debt,
      } as Draft;
    };
    const perSkill = def?.recipe.perSkillMin ?? CHECKPOINT.perSkillMin;
    const authoredBySkill = new Map<string, number>();
    for (const ex of def?.authored ?? []) {
      const skill = skillOf(ex.skills[0]?.skill ?? meta.gated[0] ?? "");
      if (skip(skill)) continue;
      authoredBySkill.set(skill, (authoredBySkill.get(skill) ?? 0) + 1);
      drafts.push({
        skillId: skill as SkillId,
        role: this.roleOf(skill),
        source: { kind: "authored", exerciseId: `${cpId}/${ex.id}` },
        debt: false,
      });
    }
    const skills = [...meta.gated, ...meta.levelSetting].filter((s) => !skip(s));
    for (const skill of skills) {
      const need = perSkill - (authoredBySkill.get(skill) ?? 0);
      for (let i = 0; i < need; i++) {
        const item = familyItem(skill, false);
        if (item !== null) drafts.push(item);
      }
    }
    // Debt from earlier checkpoints: up to 3 re-test items (§7.6 soft pass, §7.7).
    const inRange = new Set<string>(skills);
    const debts = this.#repos.mastery
      .allStates()
      .filter((s) => s.debt && !inRange.has(s.skillId) && !skip(s.skillId))
      .slice(0, MASTERY.maxDebtItemsPerCheckpoint);
    for (const d of debts) {
      const fam = this.#content.familiesOfSkill(d.skillId)[0];
      if (fam === undefined) continue;
      n += 1;
      drafts.push({
        skillId: d.skillId as SkillId,
        role: this.roleOf(d.skillId),
        source: {
          kind: "family",
          familyId: fam.id,
          level: Math.max(1, this.#repos.srs.family(fam.id)?.level ?? fam.masteryLevel),
          category: null,
          seed: hashSeed(cpId, attemptNo, salt, "debt", n),
        },
        debt: true,
      });
    }
    // Pad to the minimum with extra items for gated skills; trim level-setting extras above the maximum.
    const [min, max] = def?.recipe.items ?? (CHECKPOINT.items as unknown as [number, number]);
    const makeCount = def === null ? 0 : 1;
    const gated = meta.gated.filter((s) => !skip(s));
    for (let k = 0; drafts.length + makeCount < min && gated.length > 0 && k < 64; k++) {
      const item = familyItem(gated[k % gated.length] as string, false);
      if (item !== null) drafts.push(item);
      else if (k >= gated.length) break;
    }
    while (drafts.length + makeCount > max) {
      const counts = new Map<string, number>();
      for (const d of drafts) counts.set(d.skillId, (counts.get(d.skillId) ?? 0) + 1);
      const i = drafts.findLastIndex(
        (d) => d.source.kind === "family" && !d.debt && (counts.get(d.skillId) ?? 0) > perSkill,
      );
      if (i < 0) break;
      drafts.splice(i, 1);
    }
    const ordered = interleave(drafts, hashSeed(cpId, attemptNo, salt, "order"));
    if (def !== null) {
      const makeSkill = skillOf(def.make.skills[0]?.skill ?? meta.gated[0] ?? "");
      ordered.push({ skillId: makeSkill as SkillId, role: "gating", source: { kind: "make" }, debt: false });
    }
    return ordered.map((d, idx) => ({ ...d, idx }));
  }

  /** The score of a submitted attempt (§7.6 "Pass", "Soft pass"). Pure. */
  static scoreCheckpoint(
    items: readonly CheckpointItemSpec[],
    scores: ReadonlyMap<number, { score: number; skipped: boolean }>,
    attemptNo: number,
  ): Pick<CheckpointOutcome, "score" | "passed" | "softPassOffered" | "perSkill"> {
    const bySkill = new Map<string, { role: CheckpointItemSpec["role"]; sum: number; n: number }>();
    let gSum = 0;
    let gN = 0;
    for (const item of items) {
      const s = scores.get(item.idx);
      // A skipped level-setting item (Quiet mode, no mic) is left out; a skipped gating item scores 0.
      if (s?.skipped === true && item.role === "level-setting") continue;
      const score = s === undefined || s.skipped ? 0 : Math.max(0, Math.min(1, s.score));
      const agg = bySkill.get(item.skillId) ?? { role: item.role, sum: 0, n: 0 };
      agg.sum += score;
      agg.n += 1;
      bySkill.set(item.skillId, agg);
      if (item.role === "gating") {
        gSum += score;
        gN += 1;
      }
    }
    const perSkill = [...bySkill.entries()].map(([skillId, a]) => {
      const mean = a.n === 0 ? 0 : a.sum / a.n;
      return {
        skillId: skillId as SkillId,
        role: a.role,
        mean,
        items: a.n,
        ok: mean >= CHECKPOINT.perSkillPass - SCORE_EPS,
      };
    });
    const score = gN === 0 ? 1 : gSum / gN;
    const passed = score >= CHECKPOINT.pass - SCORE_EPS && perSkill.every((p) => p.role !== "gating" || p.ok);
    return { score, passed, softPassOffered: !passed && softPassOffered(attemptNo, score), perSkill };
  }

  /** An unfinished attempt older than 3 days restarts with new items. */
  attemptStale(startedAt: string): boolean {
    const started = this.time.day(new Date(startedAt));
    return dayIndex(this.time.day()) - dayIndex(started) > CHECKPOINT.staleDays;
  }
}

/**
 * Scores are means of item scores: twelve items at exactly 0.85 sum to 10.199999999999998, a mean just under
 * the bar. A learner who scores the bar on every item has met it (contracts §7.6 "≥ 0.85").
 */
const SCORE_EPS = 1e-9;

/** "Continue anyway": a retake (attempt ≥ 2) scoring ≥ 0.75, or any attempt from the third on. */
export function softPassOffered(attemptNo: number, score: number): boolean {
  if (attemptNo >= CHECKPOINT.softPassAlwaysFromAttempt) return true;
  return attemptNo >= 2 && score >= CHECKPOINT.softPass - SCORE_EPS;
}

/** Deterministic interleave: a seeded shuffle that then avoids two items of one skill in a row where it can. */
export function interleave<T extends { skillId: string }>(items: readonly T[], seed: number): T[] {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j] as T, pool[i] as T];
  }
  const out: T[] = [];
  while (pool.length > 0) {
    const prev = out.at(-1)?.skillId;
    const i = pool.findIndex((x) => x.skillId !== prev);
    out.push(pool.splice(Math.max(0, i), 1)[0] as T);
  }
  return out;
}

function joinWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
