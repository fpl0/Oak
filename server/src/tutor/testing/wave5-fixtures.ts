// Wave 5 fixtures: one graded step per new answer kind (a form, a 12-bar chart, a scale built as a set, a minor
// dictation, a bass line), the analysed facts of the four Wave 5 capstones (C3 verse–chorus, C4 minor ballad,
// C5 12-bar shuffle, X2 blues transcription) and reviews anchored to them. Every musical fact here is checked with
// @oak/theory and headless Strudel in wave5.music.test.ts. Test data only.
import type { GradeSnapshot, LessonSource, ReviewFacts, ReviewSource, StepSource } from "../domain.ts";
import type { CapstoneReview, TranscriptionReview } from "../reviews.ts";

export const W5_LESSON: LessonSource = {
  id: "U11.L06",
  title: "Quick Change",
  objective: "Hear and chart the 12-bar blues with a quick change.",
  key: "C major",
  meter: "4/4",
  bpm: 100,
};

/** U09.L03-style: name each section as it plays. Verse chorus verse chorus bridge chorus = ABABCB. */
export const FORM_STEP: StepSource = {
  lessonId: "U09.L03",
  id: "U09.L03/S5",
  kind: "identify",
  grading: "graded",
  exerciseRef: "U09.L03/name-the-sections",
  prompt: "The song plays six four-bar sections. Name each one as it plays.",
  starterCode: null,
  constraints: [],
  rubric: null,
  hints: [
    "Which section comes back with the same chords every time?",
    "Bars 17-20 sound like nothing before them. What is a section that comes once called?",
    "Three different sections: the one that starts, the one that returns, and the one that comes once.",
    "verse chorus verse chorus bridge chorus",
  ],
  knownMistakes: [],
  solutions: ["verse chorus verse chorus bridge chorus"],
  key: "C major",
  answerKind: "form",
};

/** U11.L06-style: chart a quick-change blues with a turnaround, in numerals. Bar 1 is given. */
export const GRID_STEP: StepSource = {
  lessonId: "U11.L06",
  id: "U11.L06/S4",
  kind: "identify",
  grading: "graded",
  exerciseRef: "U11.L06/chart-the-quick-change",
  prompt: "Listen to the twelve bars and fill the chart, one numeral per bar. Bar 1 is I7.",
  starterCode: null,
  constraints: [],
  rubric: null,
  hints: [
    "Where does the chord first leave home?",
    "Listen to bar 2: does it stay on I7?",
    "A standard blues stays on I7 for four bars; this one does not.",
    "I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7",
  ],
  knownMistakes: [],
  solutions: ["I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7"],
  key: "C major",
  answerKind: "bar-grid",
};

/** U11.L03-style: build the C blues scale as a set of degrees. */
export const SCALE_STEP: StepSource = {
  lessonId: "U11.L03",
  id: "U11.L03/S4",
  kind: "identify",
  grading: "graded",
  exerciseRef: "U11.L03/build-the-blues-scale",
  prompt: "Tick the degrees of the blues scale on the pad.",
  starterCode: null,
  constraints: [],
  rubric: null,
  hints: [
    "Start from the minor pentatonic you built in U11.L02.",
    "One note is added between two of its degrees.",
    "It sits a half step above 4.",
    "1 b3 4 b5 5 b7",
  ],
  knownMistakes: [],
  solutions: ["1 b3 4 b5 5 b7"],
  key: "C blues",
  answerKind: "scale-builder",
};

/**
 * U10.L03-style dictation in A minor: the tune is degrees 1 ♭3 5 4 (n 0 2 4 3 on A minor: A C E D), sung
 * do me sol fa.
 */
export const MINOR_DICTATION_STEP: StepSource = {
  lessonId: "U10.L03",
  id: "U10.L03/S5",
  kind: "dictation",
  grading: "graded",
  exerciseRef: "U10.L03/minor-tune-by-ear",
  prompt: "Listen and write the four notes of the tune, one per bar.",
  starterCode: 'mel: n("<~ ~ ~ ~>").scale("A3:minor").s("piano")',
  constraints: [],
  rubric: null,
  hints: [
    "Is the first note home?",
    "Bar 2 is the dark note of the key.",
    "Bar 3 is the top of the minor triad.",
    "1 b3 5 4",
  ],
  knownMistakes: [],
  solutions: ['mel: n("<0 2 4 3>").scale("A3:minor").s("piano")', "1 b3 5 4"],
  key: "A minor",
  answerKind: "dictation",
};

/** U08.L03-style bass line under Am F C G in A minor: root, fifth, octave, fifth; the last note G♯1 approaches A1. */
export const BASS_LINE_STEP: StepSource = {
  lessonId: "U08.L03",
  id: "U08.L03/S5",
  kind: "write-code",
  grading: "graded",
  exerciseRef: "U08.L03/root-fifth-octave",
  prompt: "Fill each bar with root, fifth, octave, fifth, and lead the last bar back to A with a half step.",
  starterCode: 'bass: note("<a1 f1 c2 g1>").s("ebass")',
  constraints: [],
  rubric: null,
  hints: [
    "Which note of each chord is its fifth?",
    "The octave is the root twelve half steps up.",
    "Under F, count seven half steps up from the root for the fifth.",
    'bass: note("<[a1 e2 a2 e2] [f1 c2 f2 c2] [c2 g2 c3 g2] [g1 d2 g2 g#1]>").s("ebass")',
  ],
  knownMistakes: [],
  solutions: ['bass: note("<[a1 e2 a2 e2] [f1 c2 f2 c2] [c2 g2 c3 g2] [g1 d2 g2 g#1]>").s("ebass")'],
  key: "A minor",
  answerKind: null,
};

export const W5_STEPS = [FORM_STEP, GRID_STEP, SCALE_STEP, MINOR_DICTATION_STEP, BASS_LINE_STEP] as const;

/** What the learner has typed on each step: a wrong answer, so there is something to hint about. */
export const W5_LEARNER: Record<string, string> = {
  [FORM_STEP.id]: "My answer: verse verse chorus chorus bridge chorus",
  [GRID_STEP.id]: "I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 I7",
  [SCALE_STEP.id]: "1 b3 4 5 b7",
  [MINOR_DICTATION_STEP.id]: 'mel: n("<0 1 4 3>").scale("A3:minor").s("piano")',
  [BASS_LINE_STEP.id]: 'bass: note("<[a1 a1 a1 a1] [f1 f1 f1 f1] [c2 c2 c2 c2] [g1 g1 g1 g1]>").s("ebass")',
};

/** What a model would write if it ignored the rules, per step: the answer in tokens, words and other spellings. */
export const W5_LEAKY_TEXT: Record<string, string[]> = {
  [FORM_STEP.id]: [
    "The song goes verse, chorus, ",
    "verse, chorus, bridge and chorus",
    ". As letters that is ABABCB.",
  ],
  [GRID_STEP.id]: ["Bar 2 is [[rn:IV7]] ", "here, and the last line runs V7 ", "IV7 I7 V7."],
  [SCALE_STEP.id]: ["The blues scale is 1, ♭3, 4, ", "♭5, 5 and ♭7: add ", "[[deg:b5]]."],
  [MINOR_DICTATION_STEP.id]: ["Sing it: do me ", "sol fa, that is 1 ♭3 5 ", '4, or n("0 2 4 3").'],
  [BASS_LINE_STEP.id]: ["Under Am try a1 ", "e2 a2 e2, and end on ", "[[note:G#1]]."],
};

/** A leaky card per step: its code or explanation spells out the answer. */
export const W5_LEAKY_CARD: Record<string, { code: string; explanation: string }> = {
  [FORM_STEP.id]: {
    code: "chords: arrange([4, chordsVerse], [4, chordsChorus], [4, chordsVerse], [4, chordsChorus], [4, chordsBridge], [4, chordsChorus])",
    explanation: "Verse chorus verse chorus bridge chorus.",
  },
  [GRID_STEP.id]: {
    code: 'chords: chord("<C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7>").voicing().s("piano")',
    explanation: "I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7, with the quick change.",
  },
  [SCALE_STEP.id]: {
    code: 'mel: n("0 1 2 3 4 5").scale("C4:blues").s("piano")',
    explanation: "The degrees 1 b3 4 b5 5 b7.",
  },
  [MINOR_DICTATION_STEP.id]: {
    code: 'mel: n("<0 2 4 3>").scale("A3:minor").s("piano")',
    explanation: "Degrees 1 ♭3 5 4.",
  },
  [BASS_LINE_STEP.id]: {
    code: 'bass: note("<[a1 e2 a2 e2] [f1 c2 f2 c2] [c2 g2 c3 g2] [g1 d2 g2 g#1]>").s("ebass")',
    explanation: "Root, fifth, octave, fifth.",
  },
};

/** The checker's findings on a wrong answer of each step; the first issue's expected value is the answer. */
export function w5GradeFor(step: StepSource): GradeSnapshot {
  const expected: Record<string, [number, string, string]> = {
    [FORM_STEP.id]: [5, "chorus", "verse"],
    [GRID_STEP.id]: [2, "IV7", "I7"],
    [SCALE_STEP.id]: [1, "b5", "missing"],
    [MINOR_DICTATION_STEP.id]: [2, "b3", "2"],
    [BASS_LINE_STEP.id]: [1, "e2", "a1"],
  };
  const [bar, exp, got] = expected[step.id] ?? [1, "", ""];
  return {
    status: "fail",
    score: 0.75,
    dims: { answer: 0.75 },
    counts: { missing: 0, extra: 0, wrong: 1 },
    issues: [
      {
        where: { track: null, bar, beat: 1, code: null },
        severity: "error",
        feedback: "answer.wrong",
        direction: null,
        concept: "the part at fault",
        what: `Bar ${bar} is not what the music plays there.`,
        fix: `Use ${exp} in bar ${bar}.`,
        expected: exp,
        got,
      },
    ],
    warnings: [],
  };
}

// --- capstone facts ----------------------------------------------------------------------------------------------

/**
 * C3 "Verse–Chorus Demo" (C3_CODE): verse C Am F G, chorus F G C C, V C V C, four bars each, 16 bars. The bass rests
 * in the verses and plays roots with the kick in the choruses; the chorus adds the tambourine. What formView,
 * contrastAxes, bassView and harmonyView compute for C3_CODE (wave5.music.test.ts).
 */
export const C3_CODE = [
  "setcpm(100/4)",
  'const chordsVerse = chord("<C Am F G>").voicing().s("piano")',
  'const chordsChorus = chord("<F G C C>").voicing().s("piano")',
  'const melVerse = n("<[0 2 4 2] [4 ~ 2 ~] [3 2 1 ~] [1 ~ ~ ~]>").scale("C4:major").s("piano")',
  'const melChorus = n("<[5 5 4 5] [7 ~ 6 ~] [4 4 2 4] [7 ~ ~ ~]>").scale("C4:major").s("piano")',
  'const bassChorus = note("<[f2 ~ f2 f2] [g2 ~ g2 g2] [c2 ~ c2 c2] [c2 ~ c2 c2]>").s("ebass")',
  'const kickChorus = s("bd ~ bd bd")',
  'const tambChorus = s("~ tb ~ tb")',
  "chords: arrange([4, chordsVerse], [4, chordsChorus], [4, chordsVerse], [4, chordsChorus])",
  "mel: arrange([4, melVerse], [4, melChorus], [4, melVerse], [4, melChorus])",
  "bass: arrange([4, silence], [4, bassChorus], [4, silence], [4, bassChorus])",
  'kick: arrange([4, s("bd ~ ~ ~")], [4, kickChorus], [4, s("bd ~ ~ ~")], [4, kickChorus])',
  "tamb: arrange([4, silence], [4, tambChorus], [4, silence], [4, tambChorus])",
].join("\n");

export const C3_FACTS: ReviewFacts = {
  key: "C major",
  meter: "4/4",
  bars: 16,
  pickup: false,
  chords: [
    {
      bar: 1,
      beat: 1,
      symbol: "C/E",
      rn: "I6",
      fn: "T",
    },
    {
      bar: 2,
      beat: 1,
      symbol: "Am",
      rn: "vi",
      fn: "T",
    },
    {
      bar: 3,
      beat: 1,
      symbol: "F",
      rn: "IV",
      fn: "PD",
    },
    {
      bar: 4,
      beat: 1,
      symbol: "G",
      rn: "V",
      fn: "D",
    },
    {
      bar: 5,
      beat: 1,
      symbol: "F",
      rn: "IV",
      fn: "PD",
    },
    {
      bar: 6,
      beat: 1,
      symbol: "G",
      rn: "V",
      fn: "D",
    },
    {
      bar: 7,
      beat: 1,
      symbol: "C",
      rn: "I",
      fn: "T",
    },
    {
      bar: 10,
      beat: 1,
      symbol: "Am",
      rn: "vi",
      fn: "T",
    },
    {
      bar: 11,
      beat: 1,
      symbol: "F",
      rn: "IV",
      fn: "PD",
    },
    {
      bar: 12,
      beat: 1,
      symbol: "G",
      rn: "V",
      fn: "D",
    },
    {
      bar: 13,
      beat: 1,
      symbol: "F",
      rn: "IV",
      fn: "PD",
    },
    {
      bar: 14,
      beat: 1,
      symbol: "G",
      rn: "V",
      fn: "D",
    },
    {
      bar: 15,
      beat: 1,
      symbol: "C",
      rn: "I",
      fn: "T",
    },
  ],
  harmonicRhythm: [1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0],
  cadences: [
    {
      bar: 4,
      type: "HC",
    },
    {
      bar: 8,
      type: "PAC",
    },
    {
      bar: 12,
      type: "HC",
    },
    {
      bar: 16,
      type: "PAC",
    },
  ],
  schemas: [
    {
      schema: "schema.doo-wop",
      bars: [1, 4],
    },
    {
      schema: "schema.doo-wop",
      bars: [5, 10],
    },
  ],
  motifs: [
    {
      track: "mel",
      bars: [1, 1],
      at: [
        [5, 5],
        [7, 7],
        [13, 13],
        [15, 15],
      ],
      how: "rhythm",
    },
    {
      track: "mel",
      bars: [1, 3],
      at: [[9, 11]],
      how: "exact",
    },
    {
      track: "mel",
      bars: [6, 6],
      at: [[14, 14]],
      how: "exact",
    },
  ],
  ranges: [
    {
      track: "bass",
      low: "C2",
      high: "G2",
      semitones: 7,
      highBar: 6,
    },
    {
      track: "chords",
      low: "E3",
      high: "C5",
      semitones: 20,
      highBar: 1,
    },
    {
      track: "mel",
      low: "C4",
      high: "C5",
      semitones: 12,
      highBar: 6,
    },
  ],
  chordToneShare: 0.7142857142857143,
  form: {
    kind: "sections",
    sections: [
      {
        name: "Verse",
        tag: "verse",
        label: "verse",
        letter: "A",
        bars: [1, 4],
        tracks: ["chords", "kick", "mel"],
        energy: 0.62,
        progression: ["C/E (I6)", "Am (vi)", "F (IV)", "G (V)"],
      },
      {
        name: "Chorus",
        tag: "chorus",
        label: "chorus",
        letter: "B",
        bars: [5, 8],
        tracks: ["bass", "chords", "kick", "mel", "tamb"],
        energy: 0.96,
        progression: ["F (IV)", "G (V)", "C (I)"],
      },
      {
        name: "Verse",
        tag: "verse",
        label: "verse",
        letter: "A",
        bars: [9, 12],
        tracks: ["chords", "kick", "mel"],
        energy: 0.62,
        progression: ["C (I)", "Am (vi)", "F (IV)", "G (V)"],
      },
      {
        name: "Chorus",
        tag: "chorus",
        label: "chorus",
        letter: "B",
        bars: [13, 16],
        tracks: ["bass", "chords", "kick", "mel", "tamb"],
        energy: 0.96,
        progression: ["F (IV)", "G (V)", "C (I)"],
      },
    ],
    letters: "ABAB",
    problem: null,
    energy: [0.67, 0.61, 0.64, 0.57, 0.99, 0.91, 1, 0.93, 0.67, 0.61, 0.64, 0.57, 0.99, 0.91, 1, 0.93],
    contrast: [
      {
        a: "Verse",
        b: "Chorus",
        axes: ["density", "register", "instrumentation", "pitch", "energy"],
      },
    ],
  },
  bass: {
    track: "bass",
    notes: 24,
    roles: {
      root: 24,
    },
    rootOnChange: 1,
    approaches: {
      "diatonic-below": 2,
      dominant: 3,
    },
    grooveLock: {
      lock: 1,
      coverage: 0.75,
    },
  },
};

const source = (title: string, code: string, facts: ReviewFacts, revisions: 1 | 2): ReviewSource => ({
  title,
  code,
  brief: "",
  analysis: `Tempo and bars: ${facts.bars} bars.`,
  rubric: [],
  learnerNote: null,
  checklist: [],
  reference: null,
  totalBars: facts.bars,
  revisions,
  facts,
});

export const C3_SOURCE: ReviewSource = {
  ...source("Lights On", C3_CODE, C3_FACTS, 1),
  brief: "A verse–chorus demo: verse chorus verse chorus, with a chorus that lifts.",
  rubric: [
    { label: "Verse chorus verse chorus", required: true, met: true },
    { label: "The chorus contrasts with the verse on two axes or more", required: true, met: true },
    { label: "The bass locks with the kick", required: true, met: true },
  ],
  learnerNote: "Does the chorus lift enough?",
};

export const C3_REVIEW: CapstoneReview = {
  strengths: [
    {
      text: "The Chorus brings in the bass and the tambourine, so its energy is 96% against the Verse's 62%.",
      bars: [5, 8],
    },
    {
      text: "Every bass note in the Chorus lands on a kick, so bass and kick sound like one instrument.",
      bars: [13, 16],
    },
  ],
  revisions: [
    {
      title: "Give the second Verse one new detail",
      bars: [9, 12],
      why: "The melody of bars 9-11 repeats bars 1-3 exactly, at the same 62% energy. One new detail in the second Verse keeps the song moving toward the last Chorus.",
      tryCode: 'hats: s("hh*8").gain(.4)',
      skills: ["F02"],
    },
  ],
  listeningQuestion:
    "When the second Verse starts in bar 9, does the song feel like it went back or moved on?",
  linerNote: "A verse–chorus demo in C whose chorus lifts on the bass, the tambourine and a higher tune.",
};

/** C4 "Minor Indie Ballad": the Aeolian loop i VI III VII in A minor, then a chorus on VI VII i i. */
export const C4_CODE = [
  "setcpm(76/4)",
  'const chordsVerse = chord("<Am F C G>").voicing().s("piano")',
  'const chordsChorus = chord("<F G Am Am>").voicing().s("piano")',
  'const melVerse = n("<[0 ~ 2 ~] [5 ~ 4 ~] [4 2 1 ~] [1 ~ ~ ~]>").scale("A3:minor").s("piano")',
  'const melChorus = n("<[5 ~ 5 4] [6 ~ 4 ~] [7 ~ 4 2] [0 ~ ~ ~]>").scale("A3:minor").s("piano")',
  "chords: arrange([4, chordsVerse], [4, chordsChorus], [4, chordsVerse], [4, chordsChorus])",
  "mel: arrange([4, melVerse], [4, melChorus], [4, melVerse], [4, melChorus])",
].join("\n");

export const C4_FACTS: ReviewFacts = {
  key: "A minor",
  meter: "4/4",
  bars: 16,
  pickup: false,
  chords: [
    {
      bar: 1,
      beat: 1,
      symbol: "Am",
      rn: "i",
      fn: "T",
    },
    {
      bar: 2,
      beat: 1,
      symbol: "F",
      rn: "VI",
      fn: "T",
    },
    {
      bar: 3,
      beat: 1,
      symbol: "C/E",
      rn: "III6",
      fn: "T",
    },
    {
      bar: 4,
      beat: 1,
      symbol: "G",
      rn: "VII",
      fn: "D",
    },
    {
      bar: 5,
      beat: 1,
      symbol: "F",
      rn: "VI",
      fn: "T",
    },
    {
      bar: 6,
      beat: 1,
      symbol: "G",
      rn: "VII",
      fn: "D",
    },
    {
      bar: 7,
      beat: 1,
      symbol: "Am",
      rn: "i",
      fn: "T",
    },
    {
      bar: 10,
      beat: 1,
      symbol: "F",
      rn: "VI",
      fn: "T",
    },
    {
      bar: 11,
      beat: 1,
      symbol: "C/E",
      rn: "III6",
      fn: "T",
    },
    {
      bar: 12,
      beat: 1,
      symbol: "G",
      rn: "VII",
      fn: "D",
    },
    {
      bar: 13,
      beat: 1,
      symbol: "F",
      rn: "VI",
      fn: "T",
    },
    {
      bar: 14,
      beat: 1,
      symbol: "G",
      rn: "VII",
      fn: "D",
    },
    {
      bar: 15,
      beat: 1,
      symbol: "Am",
      rn: "i",
      fn: "T",
    },
  ],
  harmonicRhythm: [1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0],
  cadences: [
    {
      bar: 8,
      type: "bVII-I",
    },
    {
      bar: 16,
      type: "bVII-I",
    },
  ],
  schemas: [
    {
      schema: "schema.aeolian",
      bars: [1, 4],
    },
    {
      schema: "schema.aeolian",
      bars: [6, 11],
    },
  ],
  motifs: [
    {
      track: "mel",
      bars: [1, 3],
      at: [[9, 11]],
      how: "exact",
    },
    {
      track: "mel",
      bars: [5, 5],
      at: [
        [7, 7],
        [15, 15],
      ],
      how: "rhythm",
    },
    {
      track: "mel",
      bars: [5, 6],
      at: [[13, 14]],
      how: "exact",
    },
  ],
  ranges: [
    {
      track: "chords",
      low: "E3",
      high: "C5",
      semitones: 20,
      highBar: 1,
    },
    {
      track: "mel",
      low: "A3",
      high: "A4",
      semitones: 12,
      highBar: 7,
    },
  ],
  chordToneShare: 0.7857142857142857,
  form: {
    kind: "sections",
    sections: [
      {
        name: "Verse",
        tag: "verse",
        label: "verse",
        letter: "A",
        bars: [1, 4],
        tracks: ["chords", "mel"],
        energy: 0.93,
        progression: ["Am (i)", "F (VI)", "C/E (III6)", "G (VII)"],
      },
      {
        name: "Chorus",
        tag: "chorus",
        label: "chorus",
        letter: "B",
        bars: [5, 8],
        tracks: ["chords", "mel"],
        energy: 0.93,
        progression: ["F (VI)", "G (VII)", "Am (i)"],
      },
      {
        name: "Verse",
        tag: "verse",
        label: "verse",
        letter: "A",
        bars: [9, 12],
        tracks: ["chords", "mel"],
        energy: 0.93,
        progression: ["Am (i)", "F (VI)", "C/E (III6)", "G (VII)"],
      },
      {
        name: "Chorus",
        tag: "chorus",
        label: "chorus",
        letter: "B",
        bars: [13, 16],
        tracks: ["chords", "mel"],
        energy: 0.93,
        progression: ["F (VI)", "G (VII)", "Am (i)"],
      },
    ],
    letters: "ABAB",
    problem: null,
    energy: [0.93, 0.95, 1, 0.83, 0.99, 0.88, 0.97, 0.88, 0.93, 0.95, 1, 0.83, 0.99, 0.88, 0.97, 0.88],
    contrast: [
      {
        a: "Verse",
        b: "Chorus",
        axes: [],
      },
    ],
  },
};

export const C4_SOURCE: ReviewSource = {
  ...source("Grey Morning", C4_CODE, C4_FACTS, 1),
  brief: "A minor indie ballad on the Aeolian loop, with a chorus that rises.",
};

export const C4_REVIEW: CapstoneReview = {
  strengths: [
    {
      text: "The Verse is the Aeolian loop, Am F C/E G (i VI III6 VII), so the key is dark from bar 1.",
      bars: [1, 4],
    },
    {
      text: "The melody climbs to A4 in bar 7 over Am (i), home in A minor, an octave above where it starts.",
      bars: [7, 7],
    },
  ],
  revisions: [
    {
      title: "Lift the Chorus on a second axis",
      bars: [5, 8],
      why: "Oak finds no contrast axis between the Verse and the Chorus: same tracks, same energy. A bass or busier drums from bar 5 would let the Chorus lift.",
      tryCode: 'bass: note("<f2 g2 a2 a2>").s("ebass")',
      skills: ["F06"],
    },
  ],
  listeningQuestion:
    "In bar 7, does the return to A minor sound like an arrival or like the loop starting again?",
  linerNote: "A minor ballad on the Aeolian loop whose chorus climbs to the octave before settling home.",
};

/** C5 "12-Bar Shuffle" in C: one quick-change chorus with a turnaround, swung hats at ratio 2. */
export const C5_CODE = [
  "setcpm(100/4)",
  'chords: chord("<C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7>").voicing().s("piano")',
  'bass: note("<c2 f2 c2 c2 f2 f2 c2 c2 g2 f2 c2 g2>").s("ebass")',
  'hats: s("hh*8").swingBy(1/3, 4)',
  'riff: n("<[0 2 3 4] ~ [0 2 3 4] ~ [3 5 6 7] ~ [0 2 3 4] ~ [4 6 7 8] [3 5 6 7] [0 2 3 4] ~>").scale("C4:blues").s("piano")',
].join("\n");

export const C5_FACTS: ReviewFacts = {
  key: "C blues",
  meter: "4/4",
  bars: 12,
  pickup: false,
  chords: [
    {
      bar: 1,
      beat: 1,
      symbol: "C7",
      rn: "I7",
      fn: "T",
    },
    {
      bar: 2,
      beat: 1,
      symbol: "F7",
      rn: "IV7",
      fn: "PD",
    },
    {
      bar: 3,
      beat: 1,
      symbol: "C7",
      rn: "I7",
      fn: "T",
    },
    {
      bar: 5,
      beat: 1,
      symbol: "F7",
      rn: "IV7",
      fn: "PD",
    },
    {
      bar: 7,
      beat: 1,
      symbol: "C7",
      rn: "I7",
      fn: "T",
    },
    {
      bar: 9,
      beat: 1,
      symbol: "G7",
      rn: "V7",
      fn: "D",
    },
    {
      bar: 10,
      beat: 1,
      symbol: "F7",
      rn: "IV7",
      fn: "PD",
    },
    {
      bar: 11,
      beat: 1,
      symbol: "C7",
      rn: "I7",
      fn: "T",
    },
    {
      bar: 12,
      beat: 1,
      symbol: "G7",
      rn: "V7",
      fn: "D",
    },
  ],
  harmonicRhythm: [1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1],
  cadences: [
    {
      bar: 4,
      type: "PC",
    },
    {
      bar: 8,
      type: "PC",
    },
    {
      bar: 12,
      type: "HC",
    },
  ],
  schemas: [],
  motifs: [
    {
      track: "chords",
      bars: [1, 1],
      at: [
        [2, 2],
        [5, 5],
        [6, 6],
        [9, 9],
        [10, 10],
        [12, 12],
      ],
      how: "rhythm",
    },
    {
      track: "chords",
      bars: [1, 1],
      at: [
        [3, 3],
        [4, 4],
        [7, 7],
        [8, 8],
        [11, 11],
      ],
      how: "exact",
    },
    {
      track: "riff",
      bars: [1, 1],
      at: [
        [3, 3],
        [7, 7],
        [11, 11],
      ],
      how: "exact",
    },
    {
      track: "riff",
      bars: [1, 1],
      at: [
        [5, 5],
        [9, 9],
        [10, 10],
      ],
      how: "rhythm",
    },
  ],
  ranges: [
    {
      track: "bass",
      low: "C2",
      high: "G2",
      semitones: 7,
      highBar: 9,
    },
    {
      track: "chords",
      low: "E3",
      high: "C5",
      semitones: 20,
      highBar: 1,
    },
    {
      track: "riff",
      low: "C4",
      high: "F5",
      semitones: 17,
      highBar: 9,
    },
  ],
  chordToneShare: 0.5,
  form: {
    kind: "through",
    sections: [],
    letters: "AAA",
    problem: null,
    energy: [1, 0.82, 1, 0.84, 0.99, 0.82, 1, 0.84, 0.99, 0.99, 1, 0.81],
    contrast: [],
  },
  bass: {
    track: "bass",
    notes: 12,
    roles: {
      root: 12,
    },
    rootOnChange: 1,
    approaches: {
      dominant: 2,
      "diatonic-above": 1,
    },
    grooveLock: null,
  },
  blues: {
    variant: "quick-change",
    turnaround: true,
    jazz: false,
    choruses: 1,
    wrongBars: [],
    bars: ["C7", "F7", "C7", "C7", "F7", "F7", "C7", "C7", "G7", "F7", "C7", "G7"],
    allDominant: true,
  },
  swing: [
    {
      track: "hats",
      ratio: 2,
      swung: 8,
    },
  ],
};

export const C5_SOURCE: ReviewSource = {
  ...source("Back Porch Shuffle", C5_CODE, C5_FACTS, 2),
  brief: "A 12-bar shuffle in C: dominant sevenths, swung eighths, a riff that answers itself.",
};

export const C5_REVIEW: CapstoneReview = {
  strengths: [
    {
      text: "Bar 2 visits F7 and comes home in bar 3: the quick change gives the first line a lift.",
      bars: [2, 3],
    },
    { text: "The hats swing at a ratio of 2, long-short, so the whole groove shuffles.", bars: [1, 12] },
  ],
  revisions: [
    {
      title: "Answer the riff in bar 10",
      bars: [9, 10],
      why: "The riff peaks at F5 over G7 in bar 9 and keeps the same rhythm over F7 in bar 10. A shorter answer in bar 10 would let the line breathe before home.",
      tryCode: 'riff: n("<[3 5 6 ~]>").scale("C4:blues").s("piano")',
      skills: ["M08"],
    },
    {
      title: "Let the turnaround lean on G7",
      bars: [12, 12],
      why: "Bar 12 is the turnaround on G7. A bass walking up to G, as in bar 9, would point harder back to bar 1.",
      tryCode: 'bass: note("<[c2 e2 f2 f#2]>").s("ebass")',
      skills: ["H10"],
    },
  ],
  listeningQuestion: "When bar 12 turns back to bar 1, does the G7 pull you into the next chorus?",
  linerNote: "A quick-change shuffle in C whose blues-scale riff answers itself over swung hats.",
};

/** X2 "Blues Transcription": St. Louis Blues' 12-bar strain in G, bass passed, changes passed, melody in progress. */
export const X2_HIDDEN_SOURCE =
  'bass: note("<g1 c2 g1 g1 c2 c2 g1 g1 d2 c2 g1 d2>").s("ebass")\nmel: note("<[g4 bb4 b4 d5] ~ [c5 bb4 g4 ~] ~>").s("piano")';

/** What Oak's analysis reads from X2_LEARNER_CODE in G blues (wave5.music.test.ts). */
export const X2_ANALYSED: ReviewFacts = {
  key: "G blues",
  meter: "4/4",
  bars: 12,
  pickup: false,
  chords: [
    {
      bar: 1,
      beat: 1,
      symbol: "G7",
      rn: "I7",
      fn: "T",
    },
    {
      bar: 2,
      beat: 1,
      symbol: "C7",
      rn: "IV7",
      fn: "PD",
    },
    {
      bar: 3,
      beat: 1,
      symbol: "G7",
      rn: "I7",
      fn: "T",
    },
    {
      bar: 5,
      beat: 1,
      symbol: "C7",
      rn: "IV7",
      fn: "PD",
    },
    {
      bar: 7,
      beat: 1,
      symbol: "G7",
      rn: "I7",
      fn: "T",
    },
    {
      bar: 9,
      beat: 1,
      symbol: "D7",
      rn: "V7",
      fn: "D",
    },
    {
      bar: 10,
      beat: 1,
      symbol: "C7",
      rn: "IV7",
      fn: "PD",
    },
    {
      bar: 11,
      beat: 1,
      symbol: "G7",
      rn: "I7",
      fn: "T",
    },
    {
      bar: 12,
      beat: 1,
      symbol: "D7",
      rn: "V7",
      fn: "D",
    },
  ],
  harmonicRhythm: [1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1],
  cadences: [
    {
      bar: 4,
      type: "PC",
    },
    {
      bar: 8,
      type: "PC",
    },
    {
      bar: 12,
      type: "HC",
    },
  ],
  schemas: [],
  motifs: [
    {
      track: "mel",
      bars: [1, 1],
      at: [
        [5, 5],
        [9, 9],
      ],
      how: "exact",
    },
  ],
  ranges: [
    {
      track: "bass",
      low: "G1",
      high: "D2",
      semitones: 7,
      highBar: 9,
    },
    {
      track: "chords",
      low: "E3",
      high: "C5",
      semitones: 20,
      highBar: 2,
    },
    {
      track: "mel",
      low: "G4",
      high: "D5",
      semitones: 7,
      highBar: 1,
    },
  ],
  chordToneShare: 0.5,
  form: {
    kind: "through",
    sections: [],
    letters: "AAA",
    problem: null,
    energy: [1, 0.82, 0.83, 0.83, 0.99, 0.82, 0.83, 0.83, 0.98, 0.82, 0.83, 0.82],
    contrast: [],
  },
  bass: {
    track: "bass",
    notes: 12,
    roles: {
      root: 12,
    },
    rootOnChange: 1,
    approaches: {
      dominant: 2,
      "diatonic-above": 1,
    },
    grooveLock: null,
  },
  blues: {
    variant: "quick-change",
    turnaround: true,
    jazz: false,
    choruses: 1,
    wrongBars: [],
    bars: ["G7", "C7", "G7", "G7", "C7", "C7", "G7", "G7", "D7", "C7", "G7", "D7"],
    allDominant: true,
  },
  swing: [
    {
      track: "hats",
      ratio: 2,
      swung: 8,
    },
  ],
};

/** The analysis plus the checks of X2 so far: bass passed at 0.94, changes at 0.88, melody line 1 at 0.71. */
export const X2_FACTS: ReviewFacts = {
  ...X2_ANALYSED,
  stages: [
    {
      check: "bass",
      layer: "bass",
      stage: "bass",
      phrase: "phrases 1-3",
      score: 0.94,
      passed: true,
      revealed: false,
      passAt: 0.9,
      open: true,
    },
    {
      check: "changes",
      layer: "chords",
      stage: "changes",
      phrase: "phrases 1-3",
      score: 0.88,
      passed: true,
      revealed: false,
      passAt: 0.85,
      open: true,
    },
    {
      check: "melody-1",
      layer: "melody",
      stage: "melody",
      phrase: "phrase 1",
      score: 0.71,
      passed: false,
      revealed: false,
      passAt: 0.85,
      open: true,
    },
  ],
};

/** The learner's transcription so far (their own code: bass and changes, the melody of line 1 half right). */
export const X2_LEARNER_CODE = [
  "setcpm(90/4)",
  'bass: note("<g1 c2 g1 g1 c2 c2 g1 g1 d2 c2 g1 d2>").s("ebass")',
  'chords: chord("<G7 C7 G7 G7 C7 C7 G7 G7 D7 C7 G7 D7>").voicing().s("piano")',
  'mel: note("<[g4 a4 b4 d5] ~ ~ ~>").s("piano")',
  'hats: s("hh*8").swingBy(1/3, 4)',
].join("\n");

export const X2_SOURCE: ReviewSource = {
  ...source("St. Louis Blues (strain)", X2_LEARNER_CODE, X2_FACTS, 2),
  brief:
    "Transcribe the 12-bar strain of St. Louis Blues: bass, then the changes, then the melody line by line.",
};

/** X2 is a capstone: its review is a capstone review with two revisions (contracts §10.6). */
export const X2_REVIEW: CapstoneReview = {
  strengths: [
    {
      text: "The bass is set down at 94%: roots on every change, the quick change in bar 2 included.",
      bars: [1, 4],
    },
    {
      text: "The changes read I7 IV7 I7 through all twelve bars at 88%, the turnaround on D7 in bar 12.",
      bars: [9, 12],
    },
  ],
  revisions: [
    {
      title: "Recheck the melody's second note",
      bars: [1, 1],
      why: "The melody of line 1 is at 71% against a mark of 85%. Loop bar 1 slowly and listen to how the second note leans on the third.",
      tryCode: 'mel: note("<[g4 ~ ~ ~]>").s("piano")',
      skills: ["M04"],
    },
    {
      title: "Hear where line 1 ends",
      bars: [3, 4],
      why: "Bars 2-4 of the melody are still empty. The tune answers itself in bar 3 over the return to G7.",
      tryCode: 'mel: note("<~ ~ [g4 ~ ~ ~] ~>").s("piano")',
      skills: ["M04"],
    },
  ],
  listeningQuestion: "In bar 1, does the melody's second note sound bluer than the first?",
  linerNote:
    "A transcription of St. Louis Blues' 12-bar strain: bass and changes set down, the melody under way.",
};

/** A ladder L6 transcription of the same strain (a transcription review: one revision; no reference until passed). */
export const L6_SOURCE: ReviewSource = {
  ...source("St. Louis Blues (L6)", X2_LEARNER_CODE, X2_FACTS, 1),
  brief: "Transcribe “St. Louis Blues”.",
  rubric: [],
};

export const L6_REVIEW: TranscriptionReview = {
  strengths: [
    { text: "The bass follows the roots of every change, bar 2's C7 included.", bars: [1, 4], layer: "bass" },
    { text: "The hats swing long-short at a ratio of 2.", bars: [1, 12], layer: "drums" },
  ],
  revisions: [
    {
      title: "Finish the melody of line 1",
      bars: [1, 4],
      layer: "melody",
      why: "Only bar 1 of the melody is written, and the check has it at 71%.",
      listenFor:
        "Listen for whether the second note of bar 1 is a step above the first or a half step below the third.",
    },
  ],
  plausibilityFlags: [],
  listeningQuestion: "Does the tune in bar 3 repeat bar 1 or answer it?",
  linerNote: "A blues transcription with the bass and changes in place and the melody begun.",
};
