// In-memory fakes for every port. Test code only: production wires SQLite and the grader host.
import type {
  IntroducedTerms,
  LessonSource,
  ProgressSnapshot,
  ReviewSource,
  Rung,
  StepSource,
  StepState,
  SubjectFacts,
} from "../domain.ts";
import type {
  LessonContextPort,
  MonthUsage,
  ProgressPort,
  SettingsPort,
  TutorPorts,
  TutorSettings,
  UsageRow,
  UsageSink,
} from "../ports.ts";
import type { SubjectRef } from "../types.ts";
import { FakeGrader } from "./fake-grader.ts";
import {
  CATALOG,
  EXERCISE_REF,
  GRADE,
  INTRODUCED_TERMS,
  LEARNER_CODE,
  LESSON,
  MAKE_STEP,
  OPEN_FACTS,
  PROGRESS,
  SOLUTION_CODE,
  STEP,
  SYLLABUS,
  stepState,
} from "./fixtures.ts";

export { FakeGrader } from "./fake-grader.ts";
export { FixedClock, InMemoryConversationStore, InMemoryNotesStore } from "./fake-stores.ts";

import { FixedClock, InMemoryConversationStore, InMemoryNotesStore } from "./fake-stores.ts";

/** The fixture lesson: one graded step with a solution, one Make step. */
export class FakeLessons implements LessonContextPort {
  lessons = new Map<string, LessonSource>([[LESSON.id, LESSON]]);
  steps = new Map<string, StepSource>([
    [STEP.id, STEP],
    [MAKE_STEP.id, MAKE_STEP],
  ]);
  facts = new Map<string, SubjectFacts>();
  reviews = new Map<string, ReviewSource>();
  sources = { syllabus: SYLLABUS, catalog: CATALOG };

  async lesson(lessonId: string): Promise<LessonSource | null> {
    return this.lessons.get(lessonId) ?? null;
  }
  async step(lessonId: string, stepId: string): Promise<StepSource | null> {
    const s = this.steps.get(stepId);
    return s && s.lessonId === lessonId ? s : null;
  }
  async resolveExercise(ref: string): Promise<{ lessonId: string; stepId: string } | null> {
    for (const s of this.steps.values())
      if (s.exerciseRef === ref) return { lessonId: s.lessonId, stepId: s.id };
    return null;
  }
  async subject(ref: SubjectRef): Promise<SubjectFacts> {
    return this.facts.get(`${ref.subjectKind}:${ref.subjectId}`) ?? OPEN_FACTS;
  }
  async review(ref: SubjectRef): Promise<ReviewSource | null> {
    return this.reviews.get(`${ref.subjectKind}:${ref.subjectId}`) ?? null;
  }
  async prefixSources(): Promise<{ syllabus: string; catalog: string }> {
    return this.sources;
  }
}

export class FakeProgress implements ProgressPort {
  states = new Map<string, StepState>();
  progress: ProgressSnapshot = PROGRESS;
  terms: IntroducedTerms = { count: INTRODUCED_TERMS.length, recent: [...INTRODUCED_TERMS] };
  /** Every advance asked for, for "the rung moved exactly once" assertions. */
  readonly advances: { stepId: string; from: Rung; to: Rung }[] = [];

  set(stepId: string, state: Partial<StepState>): void {
    this.states.set(stepId, stepState(state));
  }
  async stepState(_lessonId: string, stepId: string): Promise<StepState> {
    return { ...(this.states.get(stepId) ?? stepState()) };
  }
  async advanceHintRung(_lessonId: string, stepId: string, max: Rung): Promise<Rung> {
    const cur = this.states.get(stepId) ?? stepState();
    const to = Math.max(cur.rung, Math.min(max, cur.rung + 1)) as Rung;
    this.advances.push({ stepId, from: cur.rung, to });
    this.states.set(stepId, { ...cur, rung: to });
    return to;
  }
  async snapshot(): Promise<ProgressSnapshot> {
    return this.progress;
  }
  async termsIntroduced(): Promise<IntroducedTerms> {
    return this.terms;
  }
}

export class FakeSettings implements SettingsPort {
  value: TutorSettings = { backend: "auto", softMonthlyUsd: 25, softWarnedMonth: null };
  async tutor(): Promise<TutorSettings> {
    return { ...this.value };
  }
  async markSoftWarned(month: string): Promise<void> {
    this.value = { ...this.value, softWarnedMonth: month };
  }
}

export class CollectingUsageSink implements UsageSink {
  readonly rows: UsageRow[] = [];
  async record(row: UsageRow): Promise<void> {
    this.rows.push(row);
  }
  async month(month: string): Promise<MonthUsage> {
    const total: MonthUsage = {
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    for (const { day, usage } of this.rows) {
      if (!day.startsWith(month)) continue;
      total.costUsd += usage.costUsd ?? 0;
      total.inputTokens += usage.inputTokens;
      total.outputTokens += usage.outputTokens;
      total.cacheReadInputTokens += usage.cacheReadInputTokens;
      total.cacheCreationInputTokens += usage.cacheCreationInputTokens;
    }
    return total;
  }
}

export interface FakePorts extends TutorPorts {
  grader: FakeGrader;
  conversations: InMemoryConversationStore;
  notes: InMemoryNotesStore;
  lessons: FakeLessons;
  progress: FakeProgress;
  settings: FakeSettings;
  usage: CollectingUsageSink;
  clock: FixedClock;
}

/** A full set of fakes around the fixture lesson, with the fixture grade wired into the grader. */
export function makePorts(): FakePorts {
  const clock = new FixedClock();
  const grader = new FakeGrader();
  grader.exercises.set(EXERCISE_REF, SOLUTION_CODE);
  grader.grades.set(`${EXERCISE_REF}\n${LEARNER_CODE}`, GRADE);
  return {
    grader,
    conversations: new InMemoryConversationStore(clock),
    notes: new InMemoryNotesStore(),
    lessons: new FakeLessons(),
    progress: new FakeProgress(),
    settings: new FakeSettings(),
    usage: new CollectingUsageSink(),
    clock,
  };
}

/** A partial override in which `undefined` means "remove this optional field". */
export type Overrides<T> = { [K in keyof T]?: T[K] | undefined };

export function override<T extends object>(base: T, over: Overrides<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out as T;
}
