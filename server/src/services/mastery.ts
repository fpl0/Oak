// Mastery (contracts §7.5, §7.7, §7.10; exercises §5.3): evidence in, per-skill P, D, R, level with
// hysteresis, debt and provisional flags out. `computeSkill` is pure and table-tested; the service
// gathers its inputs from the repositories and writes `skill_state`.
import type { Evidence, SkillMap, SkillState } from "@oak/api";
import type { SkillDef, SkillKind } from "@oak/content-kit";
import {
  cardWeight,
  EVIDENCE_WEIGHTS,
  MASTERY,
  nodeFreshness,
  nodeRetrievability,
  type ShadingCard,
} from "@oak/srs";
import type { DebtReason, MasteryLevel, SkillStateRow } from "../db/repos/mastery.ts";
import { addDays, dayIndex } from "../lib/days.ts";
import { LearnerTime, type ServiceContext } from "./context.ts";

export interface EvidenceItem {
  score: number;
  weight: number;
  day: string;
  at: string;
  sourceKind: Evidence["sourceKind"];
  sourceId: string;
}

export interface SkillInput {
  kind: SkillKind;
  evidence: readonly EvidenceItem[];
  today: string;
  /** The introducing lesson is open (available, in progress or completed). */
  lessonOpen: boolean;
  /** The introducing lesson has been started or completed, or evidence exists. */
  introduced: boolean;
  /** Linked cards with their current recall; paused cards already left out. */
  cards: readonly ShadingCard[];
  /** P/Pr nodes with a linked family: is it at `masteryLevel`? `null` when no family is linked. */
  familyAtMastery: boolean | null;
  /** Nodes in a checkpoint's range: passed or soft-passed? `null` when the node has no checkpoint. */
  checkpointPassed: boolean | null;
  /** Production node and no microphone (contracts §8.5). */
  noMic: boolean;
  previous: Pick<SkillStateRow, "level" | "debt" | "debtReason" | "provisional"> | null;
  /** Day the node was last tested in a checkpoint (for `provisional`). */
  checkpointDay: string | null;
}

export interface SkillResult {
  P: number;
  D: number;
  R: number | null;
  M: number;
  weight: number;
  level: MasteryLevel;
  debt: boolean;
  debtReason: DebtReason | null;
  provisional: boolean;
  paused: boolean;
  freshness: number;
}

const SET_SOURCES = new Set<Evidence["sourceKind"]>(["srs-set", "gym-set", "anchor-set"]);

export function tauOf(kind: SkillKind): number {
  return kind === "fact" || kind === "concept" ? MASTERY.tau : MASTERY.tauEar;
}

/** `decay = 0.5 ^ (ageDays / 45)`; `P = (Σ w·decay·s + 0.5) / (Σ w·decay + 1)`. */
export function performance(evidence: readonly EvidenceItem[], today: string): number {
  let num = MASTERY.priorNum;
  let den = MASTERY.priorDen;
  for (const e of evidence) {
    const age = Math.max(0, dayIndex(today) - dayIndex(e.day));
    const decay = 0.5 ** (age / MASTERY.halfLifeDays);
    num += e.weight * decay * e.score;
    den += e.weight * decay;
  }
  return num / den;
}

/** Distinct days in the last 60 (today included) with an evidence item ≥ 0.8. */
export function spreadDays(evidence: readonly EvidenceItem[], today: string): number {
  const from = addDays(today, -(MASTERY.daysWindow - 1));
  const days = new Set<string>();
  for (const e of evidence)
    if (e.score >= MASTERY.dayScore && e.day >= from && e.day <= today) days.add(e.day);
  return days.size;
}

export function computeSkill(input: SkillInput): SkillResult {
  const { evidence, today, kind } = input;
  const P = performance(evidence, today);
  const D = spreadDays(evidence, today);
  // The level moves only on evidence (contracts §7.5: "Low R never revokes mastery"; time away shows as
  // fading, §7.10). P decays with the age of the evidence, so judging the level by today's P would demote a
  // node after a long gap with nothing new to go on. The level, debt and lag rules read P and D as of the
  // node's latest evidence; the P returned (and M) are today's, for display and planning.
  const asOf = levelDay(evidence, today);
  const Pl = asOf === today ? P : performance(evidence, asOf);
  const Dl = asOf === today ? D : spreadDays(evidence, asOf);
  const weight = evidence.reduce((s, e) => s + e.weight, 0);
  const R = nodeRetrievability(input.cards);
  const freshness = nodeFreshness(input.cards) ?? 1;
  const tau = tauOf(kind);
  // A piece is one Make or capstone: evidence source IDs are `<exercise or sketch>#<attempt>`.
  const pieces = new Set(
    evidence.filter((e) => e.sourceKind === "rubric-rule").map((e) => e.sourceId.split("#")[0]),
  ).size;

  let level: MasteryLevel;
  if (!input.lessonOpen && evidence.length === 0) level = "new";
  else if (!input.introduced && evidence.length === 0) level = "available";
  else if (Pl < MASTERY.practiced || weight < MASTERY.minWeight) level = "learning";
  else level = "practiced";

  if (level === "practiced") {
    const familyOk = input.familyAtMastery !== false;
    const checkpointOk = input.checkpointPassed !== false;
    const creativeOk = kind !== "creative" || pieces >= MASTERY.creativePieces;
    const meets = Pl >= tau && Dl >= MASTERY.minDays && familyOk && checkpointOk && creativeOk;
    // Hysteresis: mastered → practiced only when P < τ − 0.10. Low R never revokes mastery.
    const keeps = input.previous?.level === "mastered" && Pl >= tau - MASTERY.hysteresis;
    if (meets || keeps) level = "mastered";
  } else if (
    input.previous?.level === "mastered" &&
    Pl >= tau - MASTERY.hysteresis &&
    weight >= MASTERY.minWeight
  ) {
    level = "mastered";
  }

  // Debt (§7.7) clears at P ≥ 0.80 with evidence on two days; production nodes that lag get it (§7.5).
  const evidenceDays = new Set(evidence.map((e) => e.day)).size;
  let debt = input.previous?.debt ?? false;
  let debtReason: DebtReason | null = debt ? (input.previous?.debtReason ?? null) : null;
  if (debt && Pl >= MASTERY.debtClear && evidenceDays >= MASTERY.minDays) {
    debt = false;
    debtReason = null;
  }
  if (!debt && kind === "production" && productionLags(evidence, today, Pl)) {
    debt = true;
    debtReason = "production-lag";
  }

  // Provisional (§7.5): a perceptual node in a passed checkpoint's range until a set ≥ 0.85 on a second day.
  let provisional = input.previous?.provisional ?? false;
  if (provisional) {
    const after = input.checkpointDay;
    const cleared = evidence.some(
      (e) =>
        SET_SOURCES.has(e.sourceKind) &&
        e.score >= MASTERY.provisionalSet &&
        (after === null || e.day > after),
    );
    if (cleared) provisional = false;
  }

  return {
    P,
    D,
    R,
    M: P * (R ?? 1),
    weight,
    level,
    debt,
    debtReason: debt ? debtReason : null,
    provisional,
    paused: kind === "production" && input.noMic,
    freshness,
  };
}

/**
 * The day a node's level is judged on: its latest evidence day (today when it has none). Also when that day
 * is after today (a clock stepped back): the level does not move with the clock in either direction.
 */
export function levelDay(evidence: readonly EvidenceItem[], today: string): string {
  let last = "";
  for (const e of evidence) if (e.day > last) last = e.day;
  return last === "" ? today : last;
}

/** A production node lags when it has had evidence for 14 days or more and is still below `practiced`. */
export function productionLags(evidence: readonly EvidenceItem[], today: string, P: number): boolean {
  if (evidence.length === 0 || P >= MASTERY.practiced) return false;
  let first = today;
  for (const e of evidence) if (e.day < first) first = e.day;
  return dayIndex(today) - dayIndex(first) >= 14;
}

/** Evidence weight of a source (contracts §7.5). */
export function evidenceWeight(source: Evidence["sourceKind"], categoryBonus = 0): number {
  switch (source) {
    case "step":
      return EVIDENCE_WEIGHTS.step;
    case "retry":
      return EVIDENCE_WEIGHTS.retry;
    case "predict":
      return EVIDENCE_WEIGHTS.predict;
    case "checkpoint":
      return EVIDENCE_WEIGHTS.checkpoint;
    case "srs-set":
      return EVIDENCE_WEIGHTS.srsSet + EVIDENCE_WEIGHTS.srsCategoryBonus * categoryBonus;
    case "gym-set":
      return EVIDENCE_WEIGHTS.gymSet;
    case "anchor-set":
      return EVIDENCE_WEIGHTS.anchorSet;
    case "rubric-rule":
      return EVIDENCE_WEIGHTS.rubricRule;
    case "self-transcription":
      return EVIDENCE_WEIGHTS.selfTranscription;
  }
}

/** Per-card recall for the skill map and R. Provided by the SRS service when it is wired. */
export type CardRecall = (cardId: string) => { retrievability: number; desiredRetention: number } | null;

export interface MasteryDeps {
  /** Per-card recall from the SRS service; without it nodes have `R = null` and full freshness. */
  recall?: CardRecall;
  /** The lesson status the gates compute (`locked` … `completed`). */
  lessonStatus?: (lessonId: string) => "locked" | "available" | "in_progress" | "completed";
}

export class MasteryService {
  readonly time: LearnerTime;
  readonly #recall: CardRecall;
  readonly #lessonStatus: NonNullable<MasteryDeps["lessonStatus"]>;
  constructor(
    private readonly ctx: ServiceContext,
    deps: MasteryDeps = {},
  ) {
    this.time = new LearnerTime(ctx);
    this.#recall = deps.recall ?? (() => null);
    this.#lessonStatus = deps.lessonStatus ?? ((id) => ctx.repos.lessons.progress(id)?.status ?? "locked");
  }

  /** Adds evidence (skipped for disputed or tutor-typed work by the caller) and recomputes the skills touched. */
  addEvidence(items: readonly Omit<Evidence, "at" | "day">[]): Evidence[] {
    const at = this.time.iso();
    const day = this.time.day();
    const out: Evidence[] = [];
    for (const item of items) {
      const e: Evidence = { ...item, score: Math.min(1, Math.max(0, item.score)), at, day };
      this.ctx.repos.mastery.addEvidence(e);
      out.push(e);
    }
    for (const skill of new Set(out.map((e) => e.skillId))) this.recompute(skill);
    return out;
  }

  #cards(def: SkillDef): ShadingCard[] {
    const out: ShadingCard[] = [];
    const families = this.ctx.content.familiesOfSkill(def.id);
    for (const f of families) {
      const stored = this.ctx.repos.srs.card(f.id);
      if (stored === null || stored.card.status === "paused" || stored.card.status === "retired") continue;
      const state = this.ctx.repos.srs.family(f.id);
      // A graduated family contributes through its composite card (§7.10).
      const id = stored.card.status === "graduated" && state?.compositeId ? state.compositeId : f.id;
      const r = this.#recall(id);
      if (r === null) continue;
      const perceptual = f.kind !== "concept";
      out.push({ ...r, weight: cardWeight(stored.card.kind, perceptual) });
    }
    for (const deck of this.ctx.content.source.decks) {
      if (deck.unlock.skill !== def.id) continue;
      for (const c of deck.cards) {
        const stored = this.ctx.repos.srs.card(c.id);
        if (stored === null || stored.card.status === "paused" || stored.card.status === "retired") continue;
        const r = this.#recall(c.id);
        if (r !== null) out.push({ ...r, weight: 1 });
      }
    }
    return out;
  }

  #familyAtMastery(def: SkillDef): boolean | null {
    if (def.kind !== "perceptual" && def.kind !== "production") return null;
    const families = this.ctx.content.familiesOfSkill(def.id).filter((f) => f.kind !== "concept");
    if (families.length === 0) return null;
    return families.some((f) => (this.ctx.repos.srs.family(f.id)?.level ?? 1) >= f.masteryLevel);
  }

  #checkpointPassed(def: SkillDef): boolean | null {
    const cp = def.checkpoint;
    if (cp === undefined) return null;
    return this.ctx.repos.checkpoints.attempts(cp).some((a) => a.passed || a.softPass);
  }

  #checkpointDay(def: SkillDef): string | null {
    const ev = this.ctx.repos.mastery.evidenceOf(def.id).filter((e) => e.sourceKind === "checkpoint");
    return ev.at(-1)?.day ?? null;
  }

  inputOf(skillId: string): SkillInput | null {
    const def = this.ctx.content.skill(skillId);
    if (def === null) return null;
    const status = this.#lessonStatus(def.introducedBy);
    const evidence = this.ctx.repos.mastery.evidenceOf(def.id);
    const profile = this.time.profile();
    const prev = this.ctx.repos.mastery.state(def.id);
    return {
      kind: def.kind,
      evidence,
      today: this.time.day(),
      lessonOpen: status !== "locked",
      introduced: status === "in_progress" || status === "completed" || evidence.length > 0,
      cards: this.#cards(def),
      familyAtMastery: this.#familyAtMastery(def),
      checkpointPassed: this.#checkpointPassed(def),
      noMic: profile.inputKind === "none",
      previous: prev,
      checkpointDay: this.#checkpointDay(def),
    };
  }

  recompute(skillId: string): SkillStateRow | null {
    const input = this.inputOf(skillId);
    if (input === null) return null;
    const r = computeSkill(input);
    return this.ctx.repos.mastery.saveState({
      skillId,
      P: r.P,
      R: r.R,
      D: r.D,
      level: r.level,
      debt: r.debt,
      debtReason: r.debtReason,
      provisional: r.provisional,
      paused: r.paused,
      updatedAt: this.time.iso(),
    });
  }

  /** Sets `debt` on a skill (soft pass, checkpoint level) without touching the rest. */
  setDebt(skillId: string, reason: DebtReason): void {
    const s = this.recompute(skillId);
    if (s === null) return;
    this.ctx.repos.mastery.saveState({ ...s, debt: true, debtReason: reason, updatedAt: this.time.iso() });
  }

  setProvisional(skillId: string): void {
    const s = this.recompute(skillId);
    if (s === null) return;
    this.ctx.repos.mastery.saveState({ ...s, provisional: true, updatedAt: this.time.iso() });
  }

  recomputeAll(): void {
    for (const s of this.ctx.content.skills()) this.recompute(s.id);
  }

  debts(): string[] {
    return this.ctx.repos.mastery
      .allStates()
      .filter((s) => s.debt)
      .map((s) => s.skillId);
  }

  /** `GET /api/skills/map`: every node of the graph, recomputed, with freshness and drying. */
  map(plannedCardIds: ReadonlySet<string> = new Set(), reviveSec = 0): SkillMap {
    const nodes: SkillState[] = [];
    for (const def of this.ctx.content.skills()) {
      const input = this.inputOf(def.id);
      if (input === null) continue;
      const r = computeSkill(input);
      const linked = [
        ...this.ctx.content.familiesOfSkill(def.id).map((f) => f.id as string),
        ...this.ctx.content.source.decks
          .filter((d) => d.unlock.skill === def.id)
          .flatMap((d) => d.cards.map((c) => c.id as string)),
      ];
      nodes.push({
        skillId: def.id,
        P: r.P,
        R: r.R,
        D: r.D,
        M: r.M,
        level: r.level,
        debt: r.debt,
        debtReason: r.debtReason,
        provisional: r.provisional,
        paused: r.paused,
        freshness: r.freshness,
        drying: r.freshness < 1 && linked.some((id) => plannedCardIds.has(id)),
        updatedAt: this.ctx.repos.mastery.state(def.id)?.updatedAt ?? this.time.iso(),
      });
    }
    return { nodes, reviveSec };
  }
}
