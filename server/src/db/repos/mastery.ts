// evidence, skill_state.
import type { Evidence } from "@oak/api";
import { all, bool, type Db, get, int, run } from "../index.ts";

export interface EvidenceRow extends Evidence {
  id: number;
}
interface EvRow {
  id: number;
  skill_id: string;
  category: string | null;
  at: string;
  day: string;
  score: number;
  weight: number;
  source_kind: string;
  source_id: string;
}
const toEvidence = (r: EvRow): EvidenceRow => ({
  id: r.id,
  skillId: r.skill_id as Evidence["skillId"],
  category: r.category,
  at: r.at,
  day: r.day,
  score: r.score,
  weight: r.weight,
  sourceKind: r.source_kind as Evidence["sourceKind"],
  sourceId: r.source_id,
});

export type MasteryLevel = "new" | "available" | "learning" | "practiced" | "mastered";
export type DebtReason = "soft-pass" | "production-lag" | "checkpoint-level";
export interface SkillStateRow {
  skillId: string;
  P: number;
  R: number | null;
  D: number;
  level: MasteryLevel;
  debt: boolean;
  debtReason: DebtReason | null;
  provisional: boolean;
  paused: boolean;
  updatedAt: string;
}
interface StateRow {
  skill_id: string;
  P: number;
  R: number | null;
  D: number;
  level: string;
  debt: number;
  debt_reason: string | null;
  provisional: number;
  paused: number;
  updated_at: string;
}
const toState = (r: StateRow): SkillStateRow => ({
  skillId: r.skill_id,
  P: r.P,
  R: r.R,
  D: r.D,
  level: r.level as MasteryLevel,
  debt: bool(r.debt),
  debtReason: r.debt_reason as DebtReason | null,
  provisional: bool(r.provisional),
  paused: bool(r.paused),
  updatedAt: r.updated_at,
});

export class MasteryRepo {
  constructor(private readonly db: Db) {}

  addEvidence(e: Evidence): EvidenceRow {
    const { lastInsertRowid } = run(
      this.db,
      "INSERT INTO evidence (skill_id, category, at, day, score, weight, source_kind, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      e.skillId,
      e.category,
      e.at,
      e.day,
      e.score,
      e.weight,
      e.sourceKind,
      e.sourceId,
    );
    return { ...e, id: lastInsertRowid };
  }
  evidenceOf(skillId: string): EvidenceRow[] {
    return all<EvRow>(this.db, "SELECT * FROM evidence WHERE skill_id = ? ORDER BY at, id", skillId).map(
      toEvidence,
    );
  }
  allEvidence(): EvidenceRow[] {
    return all<EvRow>(this.db, "SELECT * FROM evidence ORDER BY at, id").map(toEvidence);
  }
  /** Wave 5 (c11): whether a source (by ID prefix) already gave evidence of this kind on a learner day. */
  hasEvidenceOn(sourceKind: string, sourceIdPrefix: string, day: string): boolean {
    return (
      (get<{ n: number }>(
        this.db,
        "SELECT COUNT(*) AS n FROM evidence WHERE source_kind = ? AND substr(source_id, 1, ?) = ? AND day = ?",
        sourceKind,
        sourceIdPrefix.length,
        sourceIdPrefix,
        day,
      )?.n ?? 0) > 0
    );
  }
  /** Removes the evidence one source produced (a disputed attempt gives none, contracts §11.8). Returns the skills touched. */
  removeEvidenceOf(sourceKinds: readonly string[], sourceId: string): string[] {
    const marks = sourceKinds.map(() => "?").join(", ");
    const skills = all<{ skill_id: string }>(
      this.db,
      `SELECT DISTINCT skill_id FROM evidence WHERE source_id = ? AND source_kind IN (${marks})`,
      sourceId,
      ...sourceKinds,
    ).map((r) => r.skill_id);
    run(
      this.db,
      `DELETE FROM evidence WHERE source_id = ? AND source_kind IN (${marks})`,
      sourceId,
      ...sourceKinds,
    );
    return skills;
  }
  skillsWithEvidence(): string[] {
    return all<{ skill_id: string }>(this.db, "SELECT DISTINCT skill_id FROM evidence").map(
      (r) => r.skill_id,
    );
  }

  state(skillId: string): SkillStateRow | null {
    const row = get<StateRow>(this.db, "SELECT * FROM skill_state WHERE skill_id = ?", skillId);
    return row === null ? null : toState(row);
  }
  allStates(): SkillStateRow[] {
    return all<StateRow>(this.db, "SELECT * FROM skill_state ORDER BY skill_id").map(toState);
  }
  saveState(s: SkillStateRow): SkillStateRow {
    run(
      this.db,
      `INSERT INTO skill_state (skill_id, P, R, D, level, debt, debt_reason, provisional, paused, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (skill_id) DO UPDATE SET P = excluded.P, R = excluded.R, D = excluded.D, level = excluded.level,
         debt = excluded.debt, debt_reason = excluded.debt_reason, provisional = excluded.provisional,
         paused = excluded.paused, updated_at = excluded.updated_at`,
      s.skillId,
      s.P,
      s.R,
      s.D,
      s.level,
      int(s.debt),
      s.debt ? s.debtReason : null,
      int(s.provisional),
      int(s.paused),
      s.updatedAt,
    );
    return s;
  }
}
