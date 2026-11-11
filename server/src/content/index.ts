// The content index: the raw content set plus every lookup the services need (course order, gates,
// exercises by global ID, unlock rows by session, skills by checkpoint). Built once at start-up.
import {
  type CanDoDef,
  type CapstoneDef,
  type CapstoneMeta,
  type CheckpointDef,
  type CheckpointId,
  type CheckpointMeta,
  type Exercise,
  type FactCardDef,
  type FactDeck,
  type FamilyDef,
  flattenExercise,
  formatCapstoneSessionId,
  type GateSpec,
  type LessonDef,
  type LessonId,
  type LessonMeta,
  type SkillDef,
  type StepDef,
  skillOf,
  type TermEntry,
  type ToolEntry,
  type UnitDef,
} from "@oak/content-kit";
import type { ContentSource } from "./types.ts";

export interface ExerciseSite {
  /** `${owner}/${slug}`. */
  globalId: string;
  owner: string;
  ownerKind: "lesson" | "checkpoint" | "capstone";
  /** Local step ID (`S4`) for lesson exercises; `null` otherwise. */
  stepId: string | null;
  step: StepDef | null;
  exercise: Exercise;
  /** The top-level exercise of the step when this one is a part of an `all`. */
  parent: Exercise | null;
}

export interface LessonSite {
  meta: LessonMeta;
  unit: UnitDef;
  /** Position in the unit, 1-based (`L03` → 3). */
  ordinal: number;
  /** Position in its track's lesson order, 0-based. */
  index: number;
}

function sitesOf(at: ToolEntry["unlock"]["at"]): string[] {
  return Array.isArray(at) ? [...at] : [at];
}

export class ContentIndex {
  readonly source: ContentSource;
  readonly contentVersion: string | null;
  readonly #lessonSites = new Map<string, LessonSite>();
  readonly #lessonDefs = new Map<string, LessonDef>();
  readonly #checkpointDefs = new Map<string, CheckpointDef>();
  readonly #checkpointMeta = new Map<string, CheckpointMeta>();
  readonly #capstoneDefs = new Map<string, CapstoneDef>();
  readonly #capstoneMeta = new Map<string, CapstoneMeta>();
  readonly #skills = new Map<string, SkillDef>();
  readonly #families = new Map<string, FamilyDef>();
  readonly #decks = new Map<string, FactDeck>();
  readonly #facts = new Map<string, { deck: FactDeck; card: FactCardDef }>();
  readonly #tools = new Map<string, ToolEntry>();
  readonly #exercises = new Map<string, ExerciseSite>();
  readonly #trackOrder = new Map<string, LessonId[]>();
  /** Core units in syllabus order. */
  readonly coreUnits: UnitDef[];
  /** Core lessons in course order. */
  readonly coreLessons: LessonId[];

  constructor(source: ContentSource) {
    this.source = source;
    this.contentVersion = source.contentVersion;
    const { syllabus } = source;
    this.coreUnits = syllabus.units.filter((u) => u.track === "core");
    for (const unit of syllabus.units) {
      const order = this.#trackOrder.get(unit.track) ?? [];
      unit.lessons.forEach((meta, i) => {
        this.#lessonSites.set(meta.id, { meta, unit, ordinal: i + 1, index: order.length });
        order.push(meta.id);
      });
      this.#trackOrder.set(unit.track, order);
    }
    this.coreLessons = this.#trackOrder.get("core") ?? [];
    for (const cp of syllabus.checkpoints) this.#checkpointMeta.set(cp.id, cp);
    for (const cp of source.checkpoints) {
      this.#checkpointDefs.set(cp.id, cp);
      if (!this.#checkpointMeta.has(cp.id)) this.#checkpointMeta.set(cp.id, cp);
    }
    for (const c of syllabus.capstones) this.#capstoneMeta.set(c.id, c);
    for (const c of source.capstones) {
      this.#capstoneDefs.set(c.id, c);
      if (!this.#capstoneMeta.has(c.id)) this.#capstoneMeta.set(c.id, c);
    }
    for (const s of source.skills) this.#skills.set(s.id, s);
    for (const f of source.families) this.#families.set(f.id, f);
    for (const d of source.decks) {
      this.#decks.set(d.id, d);
      for (const card of d.cards) this.#facts.set(card.id, { deck: d, card });
    }
    for (const t of source.toolbox) this.#tools.set(t.id, t);
    for (const lesson of source.lessons) {
      this.#lessonDefs.set(lesson.id, lesson);
      for (const step of lesson.steps) {
        if (step.exercise === undefined) continue;
        this.#addExercise(lesson.id, "lesson", step, step.exercise);
      }
    }
    for (const cp of source.checkpoints) {
      for (const ex of cp.authored) this.#addExercise(cp.id, "checkpoint", null, ex);
      this.#addExercise(cp.id, "checkpoint", null, cp.make);
    }
    for (const c of source.capstones) {
      if (c.brief !== undefined) this.#addExercise(c.id, "capstone", null, c.brief);
      for (const s of c.sessionDefs)
        for (const st of s.stages ?? []) this.#addExercise(c.id, "capstone", null, st);
    }
  }

  #addExercise(
    owner: string,
    ownerKind: ExerciseSite["ownerKind"],
    step: StepDef | null,
    top: Exercise,
  ): void {
    for (const exercise of flattenExercise(top)) {
      const globalId = `${owner}/${exercise.id}`;
      if (this.#exercises.has(globalId)) continue;
      this.#exercises.set(globalId, {
        globalId,
        owner,
        ownerKind,
        stepId: step?.id ?? null,
        step,
        exercise,
        parent: exercise === top ? null : top,
      });
    }
  }

  // --- lessons and the course map ---------------------------------------------------------------

  lessonSite(id: string): LessonSite | null {
    return this.#lessonSites.get(id) ?? null;
  }
  lessonDef(id: string): LessonDef | null {
    return this.#lessonDefs.get(id) ?? null;
  }
  /** Every lesson of the syllabus, core first, then each track in syllabus order. */
  allLessons(): LessonSite[] {
    return [...this.#lessonSites.values()];
  }
  /** Lessons of one track (`core` or a track ID) in order. */
  trackLessons(track: string): LessonId[] {
    return this.#trackOrder.get(track) ?? [];
  }
  stepDef(lessonId: string, stepId: string): StepDef | null {
    return this.#lessonDefs.get(lessonId)?.steps.find((s) => s.id === stepId) ?? null;
  }
  lessonTitle(id: string): string {
    return this.#lessonDefs.get(id)?.title ?? this.#lessonSites.get(id)?.meta.title ?? id;
  }

  // --- checkpoints and capstones ----------------------------------------------------------------

  checkpointMeta(id: string): CheckpointMeta | null {
    return this.#checkpointMeta.get(id) ?? null;
  }
  checkpointDef(id: string): CheckpointDef | null {
    return this.#checkpointDefs.get(id) ?? null;
  }
  checkpoints(): CheckpointMeta[] {
    return [...this.#checkpointMeta.values()];
  }
  capstoneMeta(id: string): CapstoneMeta | null {
    return this.#capstoneMeta.get(id) ?? null;
  }
  capstoneDef(id: string): CapstoneDef | null {
    return this.#capstoneDefs.get(id) ?? null;
  }
  capstones(): CapstoneMeta[] {
    return [...this.#capstoneMeta.values()];
  }
  capstoneSessionIds(id: string): string[] {
    const meta = this.#capstoneMeta.get(id);
    if (meta === undefined) return [];
    return Array.from({ length: meta.sessions }, (_, i) => formatCapstoneSessionId(meta.id, i + 1));
  }
  /** Lessons a checkpoint covers, in course order. */
  lessonsCovered(cpId: string): LessonId[] {
    const meta = this.#checkpointMeta.get(cpId);
    if (meta === undefined) return [];
    const covered = new Set<string>(meta.covers);
    return this.source.syllabus.units
      .filter((u) => covered.has(u.id))
      .flatMap((u) => u.lessons.map((l) => l.id));
  }
  /**
   * The most recent checkpoint before a core unit: the checkpoint of the nearest earlier core unit
   * that has one (contracts §7.6 rule 2). `null` for the first units.
   */
  checkpointBefore(unitId: string): CheckpointId | null {
    const i = this.coreUnits.findIndex((u) => u.id === unitId);
    for (let k = i - 1; k >= 0; k--) {
      const cp = this.coreUnits[k]?.checkpoint;
      if (cp !== undefined) return cp;
    }
    return null;
  }
  /** Track gates whose `opens` names this lesson, its unit or this capstone. */
  trackGatesFor(id: string, unitId?: string): GateSpec[] {
    return this.source.syllabus.trackGates
      .filter(
        (g) =>
          (g.opens as string[]).includes(id) ||
          (unitId !== undefined && (g.opens as string[]).includes(unitId)),
      )
      .map((g) => g.gate);
  }
  /** The checkpoint whose pass opens this capstone's unit ("the unit's capstones open"), from its gate. */
  defaultOrder(): readonly string[] {
    return this.source.syllabus.defaultOrder;
  }

  // --- registries -------------------------------------------------------------------------------

  skill(id: string): SkillDef | null {
    return this.#skills.get(skillOf(id)) ?? this.#skills.get(id) ?? null;
  }
  skills(): readonly SkillDef[] {
    return this.source.skills;
  }
  family(id: string): FamilyDef | null {
    return this.#families.get(id) ?? null;
  }
  families(): readonly FamilyDef[] {
    return this.source.families;
  }
  deck(id: string): FactDeck | null {
    return this.#decks.get(id) ?? null;
  }
  fact(id: string): { deck: FactDeck; card: FactCardDef } | null {
    return this.#facts.get(id) ?? null;
  }
  tool(id: string): ToolEntry | null {
    return this.#tools.get(id) ?? null;
  }
  toolbox(): readonly ToolEntry[] {
    return this.source.toolbox;
  }
  /** Families that train a skill (by `FamilyDef.skills`). */
  familiesOfSkill(skillId: string): FamilyDef[] {
    return this.source.families.filter((f) => f.skills.some((s) => skillOf(s.skill) === skillId));
  }
  termsOfLesson(lessonId: string): TermEntry[] {
    const fromDef = new Set((this.#lessonDefs.get(lessonId)?.terms ?? []).map((t) => t.id as string));
    return this.source.terms.filter((t) => t.introducedBy === lessonId || fromDef.has(t.id));
  }
  canDosOf(sourceId: string): CanDoDef[] {
    const fromDef = new Set<string>([
      ...(this.#lessonDefs.get(sourceId)?.canDo ?? []),
      ...(this.#capstoneDefs.get(sourceId)?.canDo ?? []),
    ]);
    return this.source.canDos.filter((c) => c.source === sourceId || fromDef.has(c.id));
  }
  exercise(globalId: string): ExerciseSite | null {
    return this.#exercises.get(globalId) ?? null;
  }
  exercisesOfStep(lessonId: string, stepId: string): ExerciseSite[] {
    return [...this.#exercises.values()].filter((e) => e.owner === lessonId && e.stepId === stepId);
  }

  // --- unlock table -----------------------------------------------------------------------------

  /** Rows granted when `sessionId` is completed (`when: 'complete'`) or started (`when: 'start'`). */
  unlockRowsAt(sessionId: string, when: "complete" | "start"): ToolEntry[] {
    return this.source.toolbox.filter(
      (t) => t.unlock.when === when && sitesOf(t.unlock.at).includes(sessionId),
    );
  }
  /** START rows whose silent fallback site is `sessionId` (contracts §3.1 rule 12). */
  fallbackRowsAt(sessionId: string): ToolEntry[] {
    return this.source.toolbox.filter((t) => t.unlock.fallbackAt === sessionId);
  }
  /** Every session a row names. */
  unlockSites(tool: ToolEntry): string[] {
    return sitesOf(tool.unlock.at);
  }
}
