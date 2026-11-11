// A fake lesson step. In production this comes from .generated/lesson-text + the grader.
// The solution-bearing fields are exactly the ones redaction.ts gates by hint rung.

export interface NoteSummary {
  note: string;
  midi: number;
  degree: number;
}

export interface Issue {
  id: string;
  bar: number;
  beat: string;
  kind: 'wrong-degree' | 'wrong-pitch' | 'missing-note' | 'extra-note';
  where: string; // rung 0+
  what: string; // rung 1+
  fix: string; // rung 3+
  expected: NoteSummary; // rung 3+
  got: NoteSummary; // always (it is the learner's own output)
}

export interface TargetHap {
  onset: number;
  duration: number;
  midi: number;
}

export interface LessonFixture {
  lessonId: string;
  title: string;
  objectives: string[];
  rubric: string[];
  targetId: string;
  /** Rung 4 only. */
  solution: { code: string; explanation: string };
  /** Rung 4 only: the complete expected event list. */
  targetHaps: TargetHap[];
  /** What the checker found for the fixture learner code. */
  issues: Issue[];
}

export const LEARNER_CODE = 'n("0 2 4 6").scale("D:dorian")';

export const LESSON: LessonFixture = {
  lessonId: 'u03.04',
  title: 'Scale degrees in code',
  objectives: ['Play an arpeggio that ends on the octave', 'Read n() as zero-based scale steps'],
  rubric: ['Four notes per cycle', 'Stays in the given scale', 'Ends one octave above the start'],
  targetId: 'u03.04#arpeggio-1358',
  solution: {
    code: 'n("0 2 4 7").scale("D:dorian")',
    explanation: 'Degree 8 is the octave, and n() counts from zero, so the last step is 7.',
  },
  targetHaps: [
    { onset: 0, duration: 0.25, midi: 62 },
    { onset: 0.25, duration: 0.25, midi: 65 },
    { onset: 0.5, duration: 0.25, midi: 69 },
    { onset: 0.75, duration: 0.25, midi: 74 },
  ],
  issues: [
    {
      id: 'i1',
      bar: 1,
      beat: '4',
      kind: 'wrong-degree',
      where: 'Bar 1, beat 4',
      what: 'The last note stops one step short of where the arpeggio is heading.',
      fix: 'degree 8 (n 7)',
      expected: { note: 'D5', midi: 74, degree: 8 },
      got: { note: 'C5', midi: 72, degree: 7 },
    },
  ],
};

/**
 * Strings that must never reach the model (or the browser) below the stated rung.
 * Checked against the raw JSON of every request and every SSE frame.
 */
export const LEAK_MARKERS = {
  /** Present only from rung 4. */
  solution: [
    LESSON.solution.code,
    '0 2 4 7',
    LESSON.solution.explanation,
    'the last step is 7',
    '"targetHaps"',
    '"target_haps"',
    '"solution"',
    'solution:',
  ],
  /** Present only from rung 3. */
  fix: [LESSON.issues[0]!.fix, 'n 7', '"D5"', '"midi":74', '"expected"'],
  /** Present only from rung 1. */
  what: [LESSON.issues[0]!.what, 'one step short'],
} as const;
