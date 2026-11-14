// Wave 6 fixtures: one graded step per new answer kind (seventh qualities, an applied numeral, a borrowed numeral,
// a mode named by ear, a mode built from its parent scale, a chromatic degree, a key plan, a pivot chord in two keys,
// a push), the analysed facts of the four Wave 6 capstones (C6 modal vamp, C7 chromatic colour, CF-A the album
// single, CF-T the standard transcription) and reviews anchored to them. Every musical fact here is checked with
// @oak/theory, the grader's views and headless Strudel in wave6.music.test.ts. Test data only.
import type { GradeSnapshot, LessonSource, ReviewFacts, ReviewSource, StepSource } from "../domain.ts";
import { type CheckLike, stageFacts } from "../review-facts.ts";
import type { CapstoneReview, TranscriptionReview } from "../reviews.ts";

export const W6_LESSON: LessonSource = {
  id: "U15.L02",
  title: "Five of Five",
  objective: "Hear, name and write the V chord of the V chord.",
  key: "C major",
  meter: "4/4",
  bpm: 90,
};

const step = (
  s: Pick<StepSource, "lessonId" | "id" | "kind" | "exerciseRef" | "prompt" | "hints" | "solutions" | "key"> &
    Partial<StepSource>,
): StepSource => ({
  grading: "graded",
  starterCode: null,
  constraints: [],
  rubric: null,
  knownMistakes: [],
  answerKind: null,
  ...s,
});

/** U12.L01-style: four seventh chords, one per bar; name each quality on the pad. C^7 Dm7 G7 C^7. */
export const SEVENTH_STEP = step({
  lessonId: "U12.L01",
  id: "U12.L01/S5",
  kind: "identify",
  exerciseRef: "U12.L01/name-the-sevenths",
  prompt: "Four chords play, one per bar, each built on C, D, G and C again. Name the quality of each.",
  hints: [
    "Which chords sound settled, and which one wants to move on?",
    "Listen to the top note of each chord against its root: a half step below the octave, or a whole step?",
    "One of the four has a major third under a lowered top note. The others do not.",
    "maj7 m7 7 maj7",
  ],
  solutions: ["maj7 m7 7 maj7"],
  key: "C major",
  answerKind: "quality-pad",
});

/** U15.L02-style: the numerals of C D7 G7 C on the palette; bar 1 is given. */
export const APPLIED_STEP = step({
  lessonId: "U15.L02",
  id: "U15.L02/S6",
  kind: "identify",
  exerciseRef: "U15.L02/numerals-with-a-visitor",
  prompt: "Four bars, one chord each. Bar 1 is I. Place a numeral on every bar.",
  hints: [
    "Which bar holds a note from outside the key?",
    "That chord leans on the chord after it. Which chord does it lean into?",
    "Name the outside chord by the chord it leans into, not by the degree it stands on.",
    "I V7/V V7 I",
  ],
  solutions: ["I V7/V V7 I"],
  key: "C major",
  answerKind: "rn-palette",
});

/** U16.L01-style: the numerals of D G Gm D in D major: the IV chord with its third lowered. */
export const BORROWED_STEP = step({
  lessonId: "U16.L01",
  id: "U16.L01/S5",
  kind: "identify",
  exerciseRef: "U16.L01/numerals-with-the-sad-chord",
  prompt: "Four bars in D major, one chord each. Place a numeral on every bar.",
  hints: [
    "Two bars stand on the same degree. Do they sound the same?",
    "One note changes between bar 2 and bar 3. Does the chord get brighter or darker?",
    "The darker one comes from the minor key on the same home note.",
    "I IV iv I",
  ],
  solutions: ["I IV iv I"],
  key: "D major",
  answerKind: "rn-palette",
});

/** U14.L06-style: name the mode of a vamp by ear (content-kit MODE_OPTIONS labels). */
export const MODE_STEP = step({
  lessonId: "U14.L06",
  id: "U14.L06/S5",
  kind: "identify",
  exerciseRef: "U14.L06/which-colour",
  prompt: "A vamp on G plays twice. Which scale is the tune made of?",
  hints: [
    "Is the home chord major or minor?",
    "One note is not where G major has it. Is it high in the scale or low?",
    "Compare the note just under the home note with G major's.",
    "Mixolydian (major with ♭7)",
  ],
  solutions: ["Mixolydian (major with ♭7)"],
  key: "G major",
  answerKind: "choice",
});

/** U14.L04-style: start from F major on the scale builder and change one note to make F Lydian. */
export const MODE_SCALE_STEP = step({
  lessonId: "U14.L04",
  id: "U14.L04/S4",
  kind: "identify",
  exerciseRef: "U14.L04/raise-one-note",
  prompt: "The pad holds F major. Change one note to make it Lydian, the scale you just heard.",
  hints: [
    "Play both scales. Where do they part?",
    "The note that changed sits in the lower half of the scale.",
    "It moved up, toward the note above it.",
    "1 2 3 #4 5 6 7",
  ],
  solutions: ["1 2 3 #4 5 6 7"],
  key: "F major",
  answerKind: "scale-builder",
});

/** U15.L01-style: four notes by ear on the degree pad; one leans from outside the key (sol fi sol do). */
export const CHROMATIC_STEP = step({
  lessonId: "U15.L01",
  id: "U15.L01/S5",
  kind: "dictation",
  exerciseRef: "U15.L01/the-leaning-note",
  prompt: "Listen and write the four notes of the tune, one per bar. One of them is not in the key.",
  starterCode: 'mel: n("<~ ~ ~ ~>").scale("C4:major").s("piano")',
  hints: [
    "Which bar holds the note from outside the key?",
    "Does that note lean up or down into the next one?",
    "It sits a half step under the note of bars 1 and 3.",
    "5 #4 5 1",
  ],
  solutions: ['mel: n("<4 3# 4 0>").scale("C4:major").s("piano")', "5 #4 5 1"],
  key: "C major",
  answerKind: "degree-pad",
});

/** U17.L02-style: the tune plays twice in C and lifts; write the key plan of the last four bars by ear. */
export const KEY_PLAN_STEP = step({
  lessonId: "U17.L02",
  id: "U17.L02/S4",
  kind: "modify",
  exerciseRef: "U17.L02/write-the-lift",
  prompt:
    "The tune plays for four bars in C, then again in a new key. Find the new key by ear and write the key plan.",
  starterCode: 'mel: n("<[0 2 4 2] [4 ~ 2 ~]>").scale("C4:major").s("piano")',
  hints: [
    "Sing the first note of bar 1, then the first note of bar 5. Which is higher?",
    "Count the half steps between those two notes.",
    "A patterned .scale() holds one key per stretch of bars: the first stays as it is.",
    'mel: n("<[0 2 4 2] [4 ~ 2 ~]>").scale("<C4:major!4 D4:major!4>").s("piano")',
  ],
  solutions: ['mel: n("<[0 2 4 2] [4 ~ 2 ~]>").scale("<C4:major!4 D4:major!4>").s("piano")'],
  key: "C major",
  keyPlan: [
    { bar: 1, key: "C major" },
    { bar: 5, key: "D major" },
  ],
});

/** U17.L01-style: the chord before the new key is A minor; name it in C major and in G major (slot keys). */
export const PIVOT_STEP = step({
  lessonId: "U17.L01",
  id: "U17.L01/S4",
  kind: "identify",
  exerciseRef: "U17.L01/name-the-door",
  prompt:
    "The chord before the new key is A minor. Name it twice: in the old key (C major) and in the new key (G major).",
  hints: [
    "On which degree of C major does A stand?",
    "Now count from G instead: on which degree does A stand there?",
    "It is a minor chord in both keys, so both numerals are lower case.",
    "vi ii",
  ],
  solutions: ["vi ii"],
  key: "C major",
  answerKind: "rn-palette",
});

/** U13.L01-style: make the chords arrive before the beat, as far ahead as in the example. */
export const PUSH_STEP = step({
  lessonId: "U13.L01",
  id: "U13.L01/S5",
  kind: "modify",
  exerciseRef: "U13.L01/push-the-chords",
  prompt: "In the example the chords arrive before the beat. Make yours arrive just as far ahead of it.",
  starterCode: 'chords: chord("<C F>").voicing().s("piano")',
  hints: [
    "Tap the beat and listen: does the chord land with your tap or before it?",
    "Is the gap half a beat, or a quarter of a beat?",
    "One method call moves a whole line ahead; it takes a fraction of the bar.",
    'chords: chord("<C F>").voicing().early(1/8).s("piano")',
  ],
  solutions: ['chords: chord("<C F>").voicing().early(1/8).s("piano")'],
  key: "C major",
});

export const W6_STEPS = [
  SEVENTH_STEP,
  APPLIED_STEP,
  BORROWED_STEP,
  MODE_STEP,
  MODE_SCALE_STEP,
  CHROMATIC_STEP,
  KEY_PLAN_STEP,
  PIVOT_STEP,
  PUSH_STEP,
] as const;

/** What the learner has answered on each step: wrong, so there is something to hint about. */
export const W6_LEARNER: Record<string, string> = {
  [SEVENTH_STEP.id]: "maj7 maj7 7 maj7",
  [APPLIED_STEP.id]: "I II7 V7 I",
  [BORROWED_STEP.id]: "I IV IV I",
  [MODE_STEP.id]: "My answer: Lydian (major with ♯4)",
  [MODE_SCALE_STEP.id]: "1 2 3 4 5 6 7",
  [CHROMATIC_STEP.id]: 'mel: n("<4 3 4 0>").scale("C4:major").s("piano")',
  [KEY_PLAN_STEP.id]: 'mel: n("<[0 2 4 2] [4 ~ 2 ~]>").scale("<C4:major!4 Eb4:major!4>").s("piano")',
  [PIVOT_STEP.id]: "vi vi",
  [PUSH_STEP.id]: 'chords: chord("<C F>").voicing().early(1/4).s("piano")',
};

/** What a model would write if it ignored the rules, per step: the answer in words, tokens and other spellings. */
export const W6_LEAKY_TEXT: Record<string, string[]> = {
  [SEVENTH_STEP.id]: [
    "The first is a major seventh, the second a ",
    "minor seventh, then a dominant seventh and a major seventh",
    ". Bar 2 is m7. In symbols: maj7 m7 7 maj7.",
  ],
  [APPLIED_STEP.id]: [
    "Bar 2 is five of ",
    "five: [[rn:V7/V]], the chord ",
    "[[chord:D7]] leaning into bar 3. The whole line is I V7/V V7 I.",
  ],
  [BORROWED_STEP.id]: [
    "The third chord is the minor four",
    ": [[rn:iv]], ",
    "which is [[chord:Gm]] here. I IV iv I.",
  ],
  [MODE_STEP.id]: ["It is Mixo", "lydian: major with a flat ", "7. Listen for [[deg:b7]], te."],
  [MODE_SCALE_STEP.id]: ["Raise the fourth", ": the set is 1 2 3 ♯4 ", "5 6 7, with [[deg:#4]] (fi)."],
  [CHROMATIC_STEP.id]: ["Sing sol fi ", "sol do: 5 ♯4 5 ", '1, in code n("4 3# 4 0").'],
  [KEY_PLAN_STEP.id]: ["The tune lifts to D ", "major, up a whole ", "step: write D4:major from bar 5."],
  [PIVOT_STEP.id]: ["In C it stays where you put it, and in G it is ", "[[rn:ii]]: vi then ", "ii."],
  [PUSH_STEP.id]: ["Push them an eighth ", "early: add .early(1/8)", " after voicing()."],
};

/** A leaky card per step: its code or explanation spells out the answer. */
export const W6_LEAKY_CARD: Record<string, { code: string; explanation: string }> = {
  [SEVENTH_STEP.id]: {
    code: 'chords: chord("<C^7 Dm7 G7 C^7>").voicing().s("rhodes")',
    explanation: "Major seventh, minor seventh, dominant seventh, major seventh.",
  },
  [APPLIED_STEP.id]: {
    code: 'chords: chord("<C D7 G7 C>").voicing().s("piano")',
    explanation: "D7 is V7/V: it leans into G7.",
  },
  [BORROWED_STEP.id]: {
    code: 'chords: chord("<D G Gm D>").voicing().s("piano")',
    explanation: "The sad four: G minor, iv.",
  },
  [MODE_STEP.id]: {
    code: 'mel: n("0 2 4 6").scale("G4:mixolydian").s("piano")',
    explanation: "Mixolydian has a lowered 7th.",
  },
  [MODE_SCALE_STEP.id]: {
    code: 'mel: n("0 1 2 3 4 5 6").scale("F4:lydian").s("piano")',
    explanation: "Degrees 1 2 3 #4 5 6 7: the raised fourth.",
  },
  [CHROMATIC_STEP.id]: {
    code: 'mel: n("<4 3# 4 0>").scale("C4:major").s("piano")',
    explanation: "Degree ♯4 leans up to 5.",
  },
  [KEY_PLAN_STEP.id]: {
    code: 'mel: n("<[0 2 4 2] [4 ~ 2 ~]>").scale("<C4:major!4 D4:major!4>").s("piano")',
    explanation: "It lifts to D major.",
  },
  [PIVOT_STEP.id]: {
    code: 'chords: chord("<C Am D7 G>").voicing().s("piano")',
    explanation: "A minor is vi in C and ii in G.",
  },
  [PUSH_STEP.id]: {
    code: 'chords: chord("<C F>").voicing().early(1/8).s("piano")',
    explanation: "An eighth early.",
  },
};

/** The checker's findings on a wrong answer of each step; the first issue's expected value is the answer. */
export function w6GradeFor(s: StepSource): GradeSnapshot {
  const expected: Record<string, [number, string, string]> = {
    [SEVENTH_STEP.id]: [2, "m7", "maj7"],
    [APPLIED_STEP.id]: [2, "V7/V", "II7"],
    [BORROWED_STEP.id]: [3, "iv", "IV"],
    [MODE_STEP.id]: [1, "Mixolydian", "Lydian"],
    [MODE_SCALE_STEP.id]: [1, "#4", "4"],
    [CHROMATIC_STEP.id]: [2, "#4", "4"],
    [KEY_PLAN_STEP.id]: [5, "D4:major", "Eb4:major"],
    [PIVOT_STEP.id]: [2, "ii", "vi"],
    [PUSH_STEP.id]: [1, ".early(1/8)", ".early(1/4)"],
  };
  const [bar, exp, got] = expected[s.id] ?? [1, "", ""];
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

// --- the four capstone pieces ------------------------------------------------------------------------------------

export const C6_CODE = `setcpm(100/4)

const chordsHead = chord("<Dm7 G7>").voicing()
const chordsSolo = chord("<Dm7 G7 Dm7 C>").voicing()
const bassHead = n("<0 3>").struct("x ~ x x")
const bassSolo = n("<0 3 0 6>").struct("x ~ ~ x ~ x ~ ~")
const melHead = n("<[0 2 4 5] [4 ~ 2 ~] [5 ~ 4 2] [0 ~ ~ ~]>")
const melSolo = n("<[7 5 4 2] [5 ~ ~ 4] [2 4 5 7] [6 ~ 4 ~]>")

kick: s("bd ~ ~ bd ~ ~ bd ~").gain(.8)
snare: s("~ sd ~ sd").gain(.7)
chords: arrange([8, chordsHead], [8, chordsSolo]).s("rhodes").gain(.5)
bass: arrange([8, bassHead], [8, bassSolo]).scale("D2:dorian").s("ebass").lpf(700)
mel: arrange([8, melHead], [8, melSolo]).scale("D4:dorian").s("piano").room(.2)`;

export const C7_CODE = `setcpm(96/4)

const chordsVerse = chord("<C Am D7 G7>").voicing()
const chordsChorus = chord("<F G C Am F Ab Bb C>").voicing()
const chordsChorus2 = chord("<G A D Bm G Bb C D>").voicing()
const bassVerse = n("<0 5 1 4>").struct("x ~ x ~")
const bassChorus = n("<3 4 0 5 3 5b 6b 0>").struct("x ~ x ~")
const melVerse = n("<[4 ~ 2 0] [2 ~ 0 ~] [3# ~ 4 5] [4 ~ ~ ~]>")
const melChorus = n("<[5 ~ 5 3] [4 ~ 4 ~] [4 2 0 2] [2 ~ ~ ~] [5 ~ 5 3] [5b ~ 4 ~] [6b ~ 4 3] [4 ~ ~ ~]>")

kick: s("bd ~ bd ~").gain(.8)
snare: s("~ sd ~ sd").gain(.7)
chords: arrange([8, chordsVerse], [8, chordsChorus], [8, chordsChorus2]).s("piano").gain(.5)
bass: arrange([8, bassVerse], [8, bassChorus], [8, bassChorus]).scale("<C2:major!16 D2:major!8>").s("ebass").lpf(700)
mel: arrange([8, melVerse], [8, melChorus], [8, melChorus]).scale("<C4:major!16 D4:major!8>").s("piano").room(.2)`;

/**
 * The learner's take of a 32-bar AABA standard in C (the shape CF-T asks for), sections as the passed form map gave
 * them: the bass is right in all four sections; the bridge's chords are wrong in bars 20 and 22 (the bass plays A
 * under D7 and D under G7 there). No melody yet: that stage opens when the changes have passed.
 */
export const CFT_CODE = `setcpm(120/4)

const chordsA = chord("<C E7 A7 A7 D7 G7 C G7>").voicing()
const chordsB = chord("<E7 E7 A7 D7 D7 G7 G7 G7>").voicing()
const bassA = note("<c2 e2 a1 a1 d2 g1 c2 g1>").struct("x ~ x ~")
const bassB = note("<e2 e2 a1 a1 d2 d2 g1 g1>").struct("x ~ x ~")

chords: arrange([8, chordsA], [8, chordsA], [8, chordsB], [8, chordsA]).s("piano").gain(.5)
bass: arrange([8, bassA], [8, bassA], [8, bassB], [8, bassA]).s("ebass").lpf(700)`;

/** CF-A: the pop reference single of content/specs/finale-reference.ts (wave6.music.test.ts keeps them equal). */
export const CFA_CODE = `setcpm(100/4)

const chordsVerse = chord("<C Am F G>").voicing()
const chordsChorus = chord("<F G E7 Am F G C C>").voicing()
const chordsBridge = chord("<Fm Fm C C Ab Bb G G>").voicing()
const chordsChorus2 = chord("<G A F#7 Bm G A D D>").voicing()
const bassVerse = n("<0 5 3 4>").struct("x ~ ~ x ~ x ~ ~")
const bassChorus = n("<3 4 2 5 3 4 0 0>").struct("x ~ ~ x ~ x ~ ~")
const bassBridge = n("<3 3 0 0 5b 6b 4 4>").struct("x ~ x ~")
const melVerse = n("<[4 ~ 4 2] [0 ~ ~ ~] [3 4 5 7] [7@2 6@2]>")
const melChorus = n("<[7 ~ 7 5] [8 ~ 8 ~] [9 8 6 4#] [5 ~ ~ ~] [7 ~ 7 5] [8 ~ 8 9] [7 ~ ~ ~] ~>")
const melBridge = n("<[5b ~ 4 3] [5b ~ 4 ~] [4 ~ 2 0] ~ [7 ~ 5b 4] [8 ~ 6b 3] [8 ~ ~ ~] [6 ~ ~ ~]>")

kick: s("bd ~ bd ~").gain(.8)
snare: s("~ sd ~ sd").gain(.8)
hats: s("hh*8").gain(.4)
chords: arrange([8, chordsVerse], [8, chordsChorus], [8, chordsVerse], [8, chordsChorus], [8, chordsBridge], [8, chordsChorus], [8, chordsChorus2]).s("piano").gain(.5).room(.3)
bass: arrange([8, bassVerse], [8, bassChorus], [8, bassVerse], [8, bassChorus], [8, bassBridge], [8, bassChorus], [8, bassChorus]).scale("<C2:major!48 D2:major!8>").s("ebass").lpf(700)
mel: arrange([8, melVerse], [8, melChorus], [8, melVerse], [8, melChorus], [8, melBridge], [8, melChorus], [8, melChorus]).scale("<C4:major!48 D4:major!8>").s("piano").room(.25)`;

// What Oak’s analysis reads from each piece (wave6.music.test.ts computes these with the real grader).
export const C6_FACTS: ReviewFacts = {
  key: "D dorian",
  meter: "4/4",
  bars: 16,
  pickup: false,
  chords: [
    {
      bar: 1,
      beat: 1,
      symbol: "Dm7",
      rn: "i7",
      fn: "T",
    },
    {
      bar: 2,
      beat: 1,
      symbol: "G7",
      rn: "IV7",
      fn: "PD",
    },
    {
      bar: 3,
      beat: 1,
      symbol: "Dm7",
      rn: "i7",
      fn: "T",
    },
    {
      bar: 4,
      beat: 1,
      symbol: "G7",
      rn: "IV7",
      fn: "PD",
    },
    {
      bar: 5,
      beat: 1,
      symbol: "Dm7",
      rn: "i7",
      fn: "T",
    },
    {
      bar: 6,
      beat: 1,
      symbol: "G7",
      rn: "IV7",
      fn: "PD",
    },
    {
      bar: 7,
      beat: 1,
      symbol: "Dm7",
      rn: "i7",
      fn: "T",
    },
    {
      bar: 8,
      beat: 1,
      symbol: "G7",
      rn: "IV7",
      fn: "PD",
    },
    {
      bar: 9,
      beat: 1,
      symbol: "Dm7",
      rn: "i7",
      fn: "T",
    },
    {
      bar: 10,
      beat: 1,
      symbol: "G7",
      rn: "IV7",
      fn: "PD",
    },
    {
      bar: 11,
      beat: 1,
      symbol: "Dm7",
      rn: "i7",
      fn: "T",
    },
    {
      bar: 12,
      beat: 1,
      symbol: "C",
      rn: "VII",
      fn: "D",
    },
    {
      bar: 13,
      beat: 1,
      symbol: "Dm7",
      rn: "i7",
      fn: "T",
    },
    {
      bar: 14,
      beat: 1,
      symbol: "G7",
      rn: "IV7",
      fn: "PD",
    },
    {
      bar: 15,
      beat: 1,
      symbol: "Dm7",
      rn: "i7",
      fn: "T",
    },
    {
      bar: 16,
      beat: 1,
      symbol: "C",
      rn: "VII",
      fn: "D",
    },
  ],
  harmonicRhythm: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  cadences: [],
  schemas: [
    {
      schema: "schema.dorian-vamp",
      bars: [1, 4],
    },
    {
      schema: "schema.dorian-vamp",
      bars: [5, 8],
    },
  ],
  motifs: [
    {
      track: "mel",
      bars: [1, 3],
      at: [[5, 7]],
      how: "exact",
    },
    {
      track: "mel",
      bars: [1, 1],
      at: [
        [9, 9],
        [11, 11],
        [13, 13],
        [15, 15],
      ],
      how: "rhythm",
    },
    {
      track: "mel",
      bars: [10, 10],
      at: [[14, 14]],
      how: "exact",
    },
    {
      track: "mel",
      bars: [12, 12],
      at: [[16, 16]],
      how: "exact",
    },
  ],
  ranges: [
    {
      track: "bass",
      low: "D2",
      high: "C3",
      semitones: 10,
      highBar: 12,
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
      low: "D4",
      high: "D5",
      semitones: 12,
      highBar: 9,
    },
  ],
  chordToneShare: 0.7142857142857143,
  form: {
    kind: "sections",
    sections: [
      {
        name: "Head",
        tag: "head",
        label: "head",
        letter: "A",
        bars: [1, 8],
        tracks: ["bass", "chords", "kick", "mel", "snare"],
        energy: 0.95,
        progression: [
          "Dm7 (i7)",
          "G7 (IV7)",
          "Dm7 (i7)",
          "G7 (IV7)",
          "Dm7 (i7)",
          "G7 (IV7)",
          "Dm7 (i7)",
          "G7 (IV7)",
        ],
      },
      {
        name: "Solo",
        tag: "solo",
        label: "solo",
        letter: "B",
        bars: [9, 16],
        tracks: ["bass", "chords", "kick", "mel", "snare"],
        energy: 0.96,
        progression: [
          "Dm7 (i7)",
          "G7 (IV7)",
          "Dm7 (i7)",
          "C (VII)",
          "Dm7 (i7)",
          "G7 (IV7)",
          "Dm7 (i7)",
          "C (VII)",
        ],
      },
    ],
    letters: "AB",
    problem: null,
    energy: [0.99, 0.93, 0.97, 0.9, 0.99, 0.93, 0.97, 0.9, 1, 0.93, 1, 0.92, 1, 0.93, 1, 0.92],
    contrast: [
      {
        a: "Head",
        b: "Solo",
        axes: ["pitch"],
      },
    ],
  },
  bass: {
    track: "bass",
    notes: 48,
    roles: {
      root: 48,
    },
    rootOnChange: 1,
    approaches: {
      dominant: 6,
      "diatonic-above": 2,
      "diatonic-below": 1,
    },
    grooveLock: {
      lock: 0.67,
      coverage: 0.67,
    },
  },
  modes: [
    {
      section: null,
      bars: null,
      stated: "D dorian",
      fits: ["dorian"],
      tone: {
        degree: "6",
        count: 16,
        strong: 12,
      },
      outsideNotes: 0,
      homeChordShare: 0.5,
    },
    {
      section: "Head",
      bars: [1, 8],
      stated: "D dorian",
      fits: ["dorian"],
      tone: {
        degree: "6",
        count: 8,
        strong: 6,
      },
      outsideNotes: 0,
      homeChordShare: 0.5,
    },
    {
      section: "Solo",
      bars: [9, 16],
      stated: "D dorian",
      fits: ["dorian"],
      tone: {
        degree: "6",
        count: 8,
        strong: 6,
      },
      outsideNotes: 0,
      homeChordShare: 0.5,
    },
  ],
  sevenths: {
    "7": 6,
    m7: 8,
  },
  guideLine: ["F", "F", "F", "F", "F", "F", "F", "F", "F", "F", "F", "E", "F", "F", "F", "E"],
  devices: [
    {
      device: "modal colour",
      bar: 1,
      bars: 16,
      text: "Dorian colour bar 1",
    },
    {
      device: "secondary ii–V",
      bar: 1,
      bars: 1,
      text: "secondary ii–V bar 1",
    },
    {
      device: "secondary ii–V",
      bar: 3,
      bars: 1,
      text: "secondary ii–V bar 3",
    },
    {
      device: "secondary ii–V",
      bar: 5,
      bars: 1,
      text: "secondary ii–V bar 5",
    },
    {
      device: "secondary ii–V",
      bar: 7,
      bars: 1,
      text: "secondary ii–V bar 7",
    },
    {
      device: "secondary ii–V",
      bar: 9,
      bars: 1,
      text: "secondary ii–V bar 9",
    },
    {
      device: "syncopated bass",
      bar: 9,
      bars: 1,
      text: "syncopated bass (16 notes)",
    },
    {
      device: "secondary ii–V",
      bar: 13,
      bars: 1,
      text: "secondary ii–V bar 13",
    },
  ],
  durationSec: 38.4,
  rhythm: [
    {
      track: "bass",
      pushes: 0,
      pushesOverBar: 0,
      ghosts: 0,
      ties: 0,
      dotted: 0,
      tupletBars: [],
      feel: "binary",
      syncopated: 16,
    },
  ],
  beat: {
    compound: false,
    beats: 4,
    bpm: 100,
  },
};

export const C7_FACTS: ReviewFacts = {
  key: "C major",
  meter: "4/4",
  bars: 24,
  pickup: false,
  chords: [
    {
      bar: 1,
      beat: 1,
      symbol: "C",
      rn: "I",
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
      symbol: "D7",
      rn: "V7/V",
      fn: "chromatic",
    },
    {
      bar: 4,
      beat: 1,
      symbol: "G7",
      rn: "V7",
      fn: "D",
    },
    {
      bar: 5,
      beat: 1,
      symbol: "C",
      rn: "I",
      fn: "T",
    },
    {
      bar: 6,
      beat: 1,
      symbol: "Am",
      rn: "vi",
      fn: "T",
    },
    {
      bar: 7,
      beat: 1,
      symbol: "D7",
      rn: "V7/V",
      fn: "chromatic",
    },
    {
      bar: 8,
      beat: 1,
      symbol: "G7",
      rn: "V7",
      fn: "D",
    },
    {
      bar: 9,
      beat: 1,
      symbol: "F",
      rn: "IV",
      fn: "PD",
    },
    {
      bar: 10,
      beat: 1,
      symbol: "G",
      rn: "V",
      fn: "D",
    },
    {
      bar: 11,
      beat: 1,
      symbol: "C",
      rn: "I",
      fn: "T",
    },
    {
      bar: 12,
      beat: 1,
      symbol: "Am",
      rn: "vi",
      fn: "T",
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
      symbol: "A♭",
      rn: "bVI",
      fn: "PD",
    },
    {
      bar: 15,
      beat: 1,
      symbol: "B♭",
      rn: "bVII",
      fn: "chromatic",
    },
    {
      bar: 16,
      beat: 1,
      symbol: "C",
      rn: "I",
      fn: "T",
    },
    {
      bar: 17,
      beat: 1,
      symbol: "G",
      rn: "IV",
      fn: null,
    },
    {
      bar: 18,
      beat: 1,
      symbol: "A",
      rn: "V",
      fn: null,
    },
    {
      bar: 19,
      beat: 1,
      symbol: "D",
      rn: "I",
      fn: null,
    },
    {
      bar: 20,
      beat: 1,
      symbol: "Bm",
      rn: "vi",
      fn: null,
    },
    {
      bar: 21,
      beat: 1,
      symbol: "G",
      rn: "IV",
      fn: null,
    },
    {
      bar: 22,
      beat: 1,
      symbol: "B♭",
      rn: "bVI",
      fn: null,
    },
    {
      bar: 23,
      beat: 1,
      symbol: "C",
      rn: "bVII",
      fn: null,
    },
    {
      bar: 24,
      beat: 1,
      symbol: "D",
      rn: "I",
      fn: null,
    },
  ],
  harmonicRhythm: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  cadences: [
    {
      bar: 4,
      type: "HC",
    },
    {
      bar: 8,
      type: "HC",
    },
    {
      bar: 16,
      type: "bVII-I",
    },
  ],
  schemas: [
    {
      schema: "schema.doo-wop",
      bars: [9, 12],
    },
  ],
  motifs: [
    {
      track: "mel",
      bars: [1, 1],
      at: [
        [3, 3],
        [7, 7],
        [9, 9],
        [13, 13],
        [15, 15],
        [17, 17],
        [21, 21],
        [23, 23],
      ],
      how: "rhythm",
    },
    {
      track: "mel",
      bars: [1, 2],
      at: [[5, 6]],
      how: "exact",
    },
    {
      track: "mel",
      bars: [10, 11],
      at: [[18, 19]],
      how: "transposed",
    },
    {
      track: "mel",
      bars: [14, 14],
      at: [[22, 22]],
      how: "transposed",
    },
  ],
  ranges: [
    {
      track: "bass",
      low: "C2",
      high: "C3",
      semitones: 12,
      highBar: 23,
    },
    {
      track: "chords",
      low: "C#3",
      high: "C5",
      semitones: 23,
      highBar: 1,
    },
    {
      track: "mel",
      low: "C4",
      high: "C5",
      semitones: 12,
      highBar: 23,
    },
  ],
  chordToneShare: 0.8571428571428571,
  form: {
    kind: "sections",
    sections: [
      {
        name: "Verse",
        tag: "verse",
        label: "verse",
        letter: "A",
        bars: [1, 8],
        tracks: ["bass", "chords", "kick", "mel", "snare"],
        energy: 0.93,
        progression: ["C (I)", "Am (vi)", "D7 (V7/V)", "G7 (V7)", "C (I)", "Am (vi)", "D7 (V7/V)", "G7 (V7)"],
      },
      {
        name: "Chorus",
        tag: "chorus",
        label: "chorus",
        letter: "B",
        bars: [9, 16],
        tracks: ["bass", "chords", "kick", "mel", "snare"],
        energy: 0.93,
        progression: ["F (IV)", "G (V)", "C (I)", "Am (vi)", "F (IV)", "A♭ (bVI)", "B♭ (bVII)", "C (I)"],
      },
      {
        name: "Chorus 2",
        tag: "chorus2",
        label: "chorus",
        letter: "B",
        bars: [17, 24],
        tracks: ["bass", "chords", "kick", "mel", "snare"],
        energy: 0.92,
        progression: ["G (IV)", "A (V)", "D (I)", "Bm (vi)", "G (IV)", "B♭ (bVI)", "C (bVII)", "D (I)"],
      },
    ],
    letters: "ABB",
    problem: null,
    energy: [
      0.97, 0.92, 0.96, 0.89, 0.97, 0.92, 0.96, 0.89, 0.96, 0.9, 1, 0.89, 0.96, 0.9, 0.94, 0.91, 0.92, 0.91,
      0.98, 0.88, 0.92, 0.91, 0.94, 0.9,
    ],
    contrast: [
      {
        a: "Verse",
        b: "Chorus",
        axes: [],
      },
    ],
  },
  bass: {
    track: "bass",
    notes: 48,
    roles: {
      root: 48,
    },
    rootOnChange: 1,
    approaches: {
      "diatonic-above": 5,
      dominant: 7,
      "diatonic-below": 5,
    },
    grooveLock: {
      lock: 1,
      coverage: 1,
    },
  },
  outside: [
    {
      bar: 3,
      beat: 1,
      symbol: "D7",
      rn: "V7/V",
      kind: "applied",
      target: "V",
      resolves: true,
      next: "V7",
      key: "C major",
    },
    {
      bar: 7,
      beat: 1,
      symbol: "D7",
      rn: "V7/V",
      kind: "applied",
      target: "V",
      resolves: true,
      next: "V7",
      key: "C major",
    },
    {
      bar: 14,
      beat: 1,
      symbol: "A♭",
      rn: "bVI",
      kind: "borrowed",
      target: null,
      resolves: null,
      next: "bVII",
      key: "C major",
    },
    {
      bar: 15,
      beat: 1,
      symbol: "B♭",
      rn: "bVII",
      kind: "borrowed",
      target: null,
      resolves: null,
      next: "I",
      key: "C major",
    },
    {
      bar: 22,
      beat: 1,
      symbol: "B♭",
      rn: "bVI",
      kind: "borrowed",
      target: null,
      resolves: null,
      next: "bVII",
      key: "D major",
    },
    {
      bar: 23,
      beat: 1,
      symbol: "C",
      rn: "bVII",
      kind: "borrowed",
      target: null,
      resolves: null,
      next: "I",
      key: "D major",
    },
  ],
  sevenths: {
    "7": 4,
  },
  guideLine: [
    "E",
    "C",
    "C",
    "B",
    "E",
    "C",
    "C",
    "B",
    "A",
    "B",
    "E",
    "C",
    "A",
    "C",
    "D",
    "E",
    "B",
    "C#",
    "F#",
    "D",
    "B",
    "D",
    "E",
    "F#",
  ],
  keyPlan: [
    {
      bars: [1, 16],
      key: "C major",
      source: "scale",
      move: null,
      pivots: null,
    },
    {
      bars: [17, 24],
      key: "D major",
      source: "scale",
      move: "up 2 half steps (a whole step)",
      pivots: 2,
    },
  ],
  devices: [
    {
      device: "secondary dominant",
      bar: 3,
      bars: 1,
      text: "V7/V→V7 bar 3",
    },
    {
      device: "secondary dominant",
      bar: 7,
      bars: 1,
      text: "V7/V→V7 bar 7",
    },
    {
      device: "borrowed chord",
      bar: 14,
      bars: 1,
      text: "bVI borrowed bar 14",
    },
    {
      device: "borrowed chord",
      bar: 15,
      bars: 1,
      text: "bVII borrowed bar 15",
    },
    {
      device: "modulation",
      bar: 17,
      bars: 8,
      text: "modulation to D major bar 17",
    },
    {
      device: "borrowed chord",
      bar: 22,
      bars: 1,
      text: "bVI borrowed bar 22",
    },
    {
      device: "borrowed chord",
      bar: 23,
      bars: 1,
      text: "bVII borrowed bar 23",
    },
  ],
  durationSec: 60,
};

export const CFA_FACTS: ReviewFacts = {
  key: "C major",
  meter: "4/4",
  bars: 56,
  pickup: false,
  chords: [
    {
      bar: 1,
      beat: 1,
      symbol: "C",
      rn: "I",
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
      symbol: "C",
      rn: "I",
      fn: "T",
    },
    {
      bar: 6,
      beat: 1,
      symbol: "Am",
      rn: "vi",
      fn: "T",
    },
    {
      bar: 7,
      beat: 1,
      symbol: "F",
      rn: "IV",
      fn: "PD",
    },
    {
      bar: 8,
      beat: 1,
      symbol: "G",
      rn: "V",
      fn: "D",
    },
    {
      bar: 9,
      beat: 1,
      symbol: "F",
      rn: "IV",
      fn: "PD",
    },
    {
      bar: 10,
      beat: 1,
      symbol: "G",
      rn: "V",
      fn: "D",
    },
    {
      bar: 11,
      beat: 1,
      symbol: "E7",
      rn: "V7/vi",
      fn: "chromatic",
    },
    {
      bar: 12,
      beat: 1,
      symbol: "Am",
      rn: "vi",
      fn: "T",
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
    {
      bar: 18,
      beat: 1,
      symbol: "Am",
      rn: "vi",
      fn: "T",
    },
    {
      bar: 19,
      beat: 1,
      symbol: "F",
      rn: "IV",
      fn: "PD",
    },
    {
      bar: 20,
      beat: 1,
      symbol: "G",
      rn: "V",
      fn: "D",
    },
    {
      bar: 21,
      beat: 1,
      symbol: "C",
      rn: "I",
      fn: "T",
    },
    {
      bar: 22,
      beat: 1,
      symbol: "Am",
      rn: "vi",
      fn: "T",
    },
    {
      bar: 23,
      beat: 1,
      symbol: "F",
      rn: "IV",
      fn: "PD",
    },
    {
      bar: 24,
      beat: 1,
      symbol: "G",
      rn: "V",
      fn: "D",
    },
    {
      bar: 25,
      beat: 1,
      symbol: "F",
      rn: "IV",
      fn: "PD",
    },
    {
      bar: 26,
      beat: 1,
      symbol: "G",
      rn: "V",
      fn: "D",
    },
    {
      bar: 27,
      beat: 1,
      symbol: "E7",
      rn: "V7/vi",
      fn: "chromatic",
    },
    {
      bar: 28,
      beat: 1,
      symbol: "Am",
      rn: "vi",
      fn: "T",
    },
    {
      bar: 29,
      beat: 1,
      symbol: "F",
      rn: "IV",
      fn: "PD",
    },
    {
      bar: 30,
      beat: 1,
      symbol: "G",
      rn: "V",
      fn: "D",
    },
    {
      bar: 31,
      beat: 1,
      symbol: "C",
      rn: "I",
      fn: "T",
    },
    {
      bar: 33,
      beat: 1,
      symbol: "Fm",
      rn: "iv",
      fn: "PD",
    },
    {
      bar: 35,
      beat: 1,
      symbol: "C",
      rn: "I",
      fn: "T",
    },
    {
      bar: 37,
      beat: 1,
      symbol: "A♭",
      rn: "bVI",
      fn: "PD",
    },
    {
      bar: 38,
      beat: 1,
      symbol: "B♭",
      rn: "bVII",
      fn: "chromatic",
    },
    {
      bar: 39,
      beat: 1,
      symbol: "G",
      rn: "V",
      fn: "D",
    },
    {
      bar: 41,
      beat: 1,
      symbol: "F",
      rn: "IV",
      fn: "PD",
    },
    {
      bar: 42,
      beat: 1,
      symbol: "G",
      rn: "V",
      fn: "D",
    },
    {
      bar: 43,
      beat: 1,
      symbol: "E7",
      rn: "V7/vi",
      fn: "chromatic",
    },
    {
      bar: 44,
      beat: 1,
      symbol: "Am",
      rn: "vi",
      fn: "T",
    },
    {
      bar: 45,
      beat: 1,
      symbol: "F",
      rn: "IV",
      fn: "PD",
    },
    {
      bar: 46,
      beat: 1,
      symbol: "G",
      rn: "V",
      fn: "D",
    },
    {
      bar: 47,
      beat: 1,
      symbol: "C",
      rn: "I",
      fn: "T",
    },
    {
      bar: 49,
      beat: 1,
      symbol: "G",
      rn: "IV",
      fn: null,
    },
    {
      bar: 50,
      beat: 1,
      symbol: "A",
      rn: "V",
      fn: null,
    },
    {
      bar: 51,
      beat: 1,
      symbol: "F♯7",
      rn: "V7/vi",
      fn: null,
    },
    {
      bar: 52,
      beat: 1,
      symbol: "Bm",
      rn: "vi",
      fn: null,
    },
    {
      bar: 53,
      beat: 1,
      symbol: "G",
      rn: "IV",
      fn: null,
    },
    {
      bar: 54,
      beat: 1,
      symbol: "A",
      rn: "V",
      fn: null,
    },
    {
      bar: 55,
      beat: 1,
      symbol: "D",
      rn: "I",
      fn: null,
    },
  ],
  harmonicRhythm: [
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1,
    0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0,
  ],
  cadences: [
    {
      bar: 4,
      type: "HC",
    },
    {
      bar: 8,
      type: "HC",
    },
    {
      bar: 16,
      type: "PAC",
    },
    {
      bar: 20,
      type: "HC",
    },
    {
      bar: 24,
      type: "HC",
    },
    {
      bar: 32,
      type: "PAC",
    },
    {
      bar: 36,
      type: "PC",
    },
    {
      bar: 40,
      type: "HC",
    },
    {
      bar: 48,
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
      bars: [5, 8],
    },
    {
      schema: "schema.doo-wop",
      bars: [12, 17],
    },
    {
      schema: "schema.doo-wop",
      bars: [18, 21],
    },
    {
      schema: "schema.doo-wop",
      bars: [28, 32],
    },
    {
      schema: "schema.doo-wop",
      bars: [44, 48],
    },
  ],
  motifs: [
    {
      track: "mel",
      bars: [1, 1],
      at: [
        [5, 5],
        [17, 17],
        [21, 21],
      ],
      how: "exact",
    },
    {
      track: "mel",
      bars: [1, 1],
      at: [
        [9, 9],
        [13, 13],
        [25, 25],
        [29, 29],
        [41, 41],
        [45, 45],
        [49, 49],
        [53, 53],
      ],
      how: "transposed",
    },
    {
      track: "mel",
      bars: [1, 1],
      at: [
        [14, 14],
        [30, 30],
        [33, 33],
        [35, 35],
        [37, 37],
        [38, 38],
        [46, 46],
        [54, 54],
      ],
      how: "rhythm",
    },
    {
      track: "mel",
      bars: [3, 4],
      at: [
        [7, 8],
        [19, 20],
        [23, 24],
      ],
      how: "exact",
    },
    {
      track: "mel",
      bars: [3, 3],
      at: [
        [11, 11],
        [27, 27],
        [43, 43],
        [51, 51],
      ],
      how: "rhythm",
    },
    {
      track: "mel",
      bars: [4, 4],
      at: [[34, 34]],
      how: "transposed",
    },
  ],
  ranges: [
    {
      track: "bass",
      low: "C2",
      high: "B2",
      semitones: 11,
      highBar: 52,
    },
    {
      track: "chords",
      low: "C#3",
      high: "C5",
      semitones: 23,
      highBar: 1,
    },
    {
      track: "mel",
      low: "C4",
      high: "F#5",
      semitones: 18,
      highBar: 51,
    },
  ],
  chordToneShare: 0.9318181818181818,
  form: {
    kind: "sections",
    sections: [
      {
        name: "Verse",
        tag: "verse",
        label: "verse",
        letter: "A",
        bars: [1, 8],
        tracks: ["bass", "chords", "hats", "kick", "mel", "snare"],
        energy: 0.95,
        progression: ["C (I)", "Am (vi)", "F (IV)", "G (V)", "C (I)", "Am (vi)", "F (IV)", "G (V)"],
      },
      {
        name: "Chorus",
        tag: "chorus",
        label: "chorus",
        letter: "B",
        bars: [9, 16],
        tracks: ["bass", "chords", "hats", "kick", "mel", "snare"],
        energy: 0.94,
        progression: ["F (IV)", "G (V)", "E7 (V7/vi)", "Am (vi)", "F (IV)", "G (V)", "C (I)"],
      },
      {
        name: "Verse",
        tag: "verse",
        label: "verse",
        letter: "A",
        bars: [17, 24],
        tracks: ["bass", "chords", "hats", "kick", "mel", "snare"],
        energy: 0.95,
        progression: ["C (I)", "Am (vi)", "F (IV)", "G (V)", "C (I)", "Am (vi)", "F (IV)", "G (V)"],
      },
      {
        name: "Chorus",
        tag: "chorus",
        label: "chorus",
        letter: "B",
        bars: [25, 32],
        tracks: ["bass", "chords", "hats", "kick", "mel", "snare"],
        energy: 0.94,
        progression: ["F (IV)", "G (V)", "E7 (V7/vi)", "Am (vi)", "F (IV)", "G (V)", "C (I)"],
      },
      {
        name: "Bridge",
        tag: "bridge",
        label: "bridge",
        letter: "C",
        bars: [33, 40],
        tracks: ["bass", "chords", "hats", "kick", "mel", "snare"],
        energy: 0.91,
        progression: ["Fm (iv)", "C (I)", "A♭ (bVI)", "B♭ (bVII)", "G (V)"],
      },
      {
        name: "Chorus",
        tag: "chorus",
        label: "chorus",
        letter: "B",
        bars: [41, 48],
        tracks: ["bass", "chords", "hats", "kick", "mel", "snare"],
        energy: 0.94,
        progression: ["F (IV)", "G (V)", "E7 (V7/vi)", "Am (vi)", "F (IV)", "G (V)", "C (I)"],
      },
      {
        name: "Chorus 2",
        tag: "chorus2",
        label: "chorus",
        letter: "B",
        bars: [49, 56],
        tracks: ["bass", "chords", "hats", "kick", "mel", "snare"],
        energy: 0.94,
        progression: ["G (IV)", "A (V)", "F♯7 (V7/vi)", "Bm (vi)", "G (IV)", "A (V)", "D (I)"],
      },
    ],
    letters: "ABABCBB",
    problem: null,
    energy: [
      0.98, 0.92, 0.99, 0.93, 0.98, 0.92, 0.99, 0.93, 0.97, 0.93, 1, 0.92, 0.97, 0.96, 0.94, 0.87, 0.98, 0.92,
      0.99, 0.93, 0.98, 0.92, 0.99, 0.93, 0.97, 0.93, 1, 0.92, 0.97, 0.96, 0.94, 0.87, 0.95, 0.93, 0.96, 0.85,
      0.92, 0.94, 0.89, 0.88, 0.97, 0.93, 1, 0.92, 0.97, 0.96, 0.94, 0.87, 0.95, 0.95, 1, 0.91, 0.95, 0.97,
      0.94, 0.86,
    ],
    contrast: [
      {
        a: "Verse",
        b: "Chorus",
        axes: ["pitch"],
      },
      {
        a: "Verse",
        b: "Bridge",
        axes: [],
      },
      {
        a: "Chorus",
        b: "Bridge",
        axes: ["pitch"],
      },
    ],
  },
  bass: {
    track: "bass",
    notes: 160,
    roles: {
      root: 160,
    },
    rootOnChange: 1,
    approaches: {
      "diatonic-above": 11,
      "diatonic-below": 12,
      dominant: 11,
    },
    grooveLock: {
      lock: 0.4,
      coverage: 0.57,
    },
  },
  swing: [
    {
      track: "hats",
      ratio: 1,
      swung: null,
    },
  ],
  outside: [
    {
      bar: 11,
      beat: 1,
      symbol: "E7",
      rn: "V7/vi",
      kind: "applied",
      target: "vi",
      resolves: true,
      next: "vi",
      key: "C major",
    },
    {
      bar: 27,
      beat: 1,
      symbol: "E7",
      rn: "V7/vi",
      kind: "applied",
      target: "vi",
      resolves: true,
      next: "vi",
      key: "C major",
    },
    {
      bar: 33,
      beat: 1,
      symbol: "Fm",
      rn: "iv",
      kind: "borrowed",
      target: null,
      resolves: null,
      next: "I",
      key: "C major",
    },
    {
      bar: 37,
      beat: 1,
      symbol: "A♭",
      rn: "bVI",
      kind: "borrowed",
      target: null,
      resolves: null,
      next: "bVII",
      key: "C major",
    },
    {
      bar: 38,
      beat: 1,
      symbol: "B♭",
      rn: "bVII",
      kind: "borrowed",
      target: null,
      resolves: null,
      next: "V",
      key: "C major",
    },
    {
      bar: 43,
      beat: 1,
      symbol: "E7",
      rn: "V7/vi",
      kind: "applied",
      target: "vi",
      resolves: true,
      next: "vi",
      key: "C major",
    },
    {
      bar: 51,
      beat: 1,
      symbol: "F♯7",
      rn: "V7/vi",
      kind: "applied",
      target: "vi",
      resolves: true,
      next: "vi",
      key: "D major",
    },
  ],
  sevenths: {
    "7": 4,
  },
  guideLine: [
    "E",
    "C",
    "A",
    "B",
    "E",
    "C",
    "A",
    "B",
    "A",
    "B",
    "G#",
    "C",
    "A",
    "B",
    "E",
    "C",
    "A",
    "B",
    "E",
    "C",
    "A",
    "B",
    "A",
    "B",
    "G#",
    "C",
    "A",
    "B",
    "E",
    "Ab",
    "E",
    "C",
  ],
  keyPlan: [
    {
      bars: [1, 48],
      key: "C major",
      source: "scale",
      move: null,
      pivots: null,
    },
    {
      bars: [49, 56],
      key: "D major",
      source: "scale",
      move: "up 2 half steps (a whole step)",
      pivots: 2,
    },
  ],
  devices: [
    {
      device: "syncopated bass",
      bar: 1,
      bars: 1,
      text: "syncopated bass (96 notes)",
    },
    {
      device: "suspension",
      bar: 4,
      bars: 1,
      text: "suspension bar 4",
    },
    {
      device: "suspension",
      bar: 8,
      bars: 1,
      text: "suspension bar 8",
    },
    {
      device: "secondary dominant",
      bar: 11,
      bars: 1,
      text: "V7/vi→vi bar 11",
    },
    {
      device: "suspension",
      bar: 20,
      bars: 1,
      text: "suspension bar 20",
    },
    {
      device: "suspension",
      bar: 24,
      bars: 1,
      text: "suspension bar 24",
    },
    {
      device: "secondary dominant",
      bar: 27,
      bars: 1,
      text: "V7/vi→vi bar 27",
    },
    {
      device: "borrowed chord",
      bar: 33,
      bars: 1,
      text: "iv borrowed bar 33",
    },
    {
      device: "borrowed chord",
      bar: 37,
      bars: 1,
      text: "bVI borrowed bar 37",
    },
    {
      device: "borrowed chord",
      bar: 38,
      bars: 1,
      text: "bVII borrowed bar 38",
    },
    {
      device: "secondary dominant",
      bar: 43,
      bars: 1,
      text: "V7/vi→vi bar 43",
    },
    {
      device: "modulation",
      bar: 49,
      bars: 8,
      text: "modulation to D major bar 49",
    },
    {
      device: "secondary dominant",
      bar: 51,
      bars: 1,
      text: "V7/vi→vi bar 51",
    },
  ],
  durationSec: 134.4,
  rhythm: [
    {
      track: "bass",
      pushes: 0,
      pushesOverBar: 0,
      ghosts: 0,
      ties: 0,
      dotted: 0,
      tupletBars: [],
      feel: "binary",
      syncopated: 96,
    },
    {
      track: "mel",
      pushes: 0,
      pushesOverBar: 0,
      ghosts: 0,
      ties: 0,
      dotted: 0,
      tupletBars: [],
      feel: "beat",
      syncopated: 1,
    },
  ],
  beat: {
    compound: false,
    beats: 4,
    bpm: 100,
  },
};

export const CFT_ANALYSED: ReviewFacts = {
  key: "C major",
  meter: "4/4",
  bars: 32,
  pickup: false,
  chords: [
    {
      bar: 1,
      beat: 1,
      symbol: "C",
      rn: "I",
      fn: "T",
    },
    {
      bar: 2,
      beat: 1,
      symbol: "E7",
      rn: "V7/vi",
      fn: "chromatic",
    },
    {
      bar: 3,
      beat: 1,
      symbol: "A7",
      rn: "V7/ii",
      fn: "chromatic",
    },
    {
      bar: 5,
      beat: 1,
      symbol: "D7",
      rn: "V7/V",
      fn: "chromatic",
    },
    {
      bar: 6,
      beat: 1,
      symbol: "G7",
      rn: "V7",
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
      bar: 8,
      beat: 1,
      symbol: "G7",
      rn: "V7",
      fn: "D",
    },
    {
      bar: 9,
      beat: 1,
      symbol: "C",
      rn: "I",
      fn: "T",
    },
    {
      bar: 10,
      beat: 1,
      symbol: "E7",
      rn: "V7/vi",
      fn: "chromatic",
    },
    {
      bar: 11,
      beat: 1,
      symbol: "A7",
      rn: "V7/ii",
      fn: "chromatic",
    },
    {
      bar: 13,
      beat: 1,
      symbol: "D7",
      rn: "V7/V",
      fn: "chromatic",
    },
    {
      bar: 14,
      beat: 1,
      symbol: "G7",
      rn: "V7",
      fn: "D",
    },
    {
      bar: 15,
      beat: 1,
      symbol: "C",
      rn: "I",
      fn: "T",
    },
    {
      bar: 16,
      beat: 1,
      symbol: "G7",
      rn: "V7",
      fn: "D",
    },
    {
      bar: 17,
      beat: 1,
      symbol: "E7",
      rn: "V7/vi",
      fn: "chromatic",
    },
    {
      bar: 19,
      beat: 1,
      symbol: "A7",
      rn: "V7/ii",
      fn: "chromatic",
    },
    {
      bar: 20,
      beat: 1,
      symbol: "D7/A",
      rn: "V43/V",
      fn: "chromatic",
    },
    {
      bar: 22,
      beat: 1,
      symbol: "G7/D",
      rn: "V43",
      fn: "D",
    },
    {
      bar: 25,
      beat: 1,
      symbol: "C",
      rn: "I",
      fn: "T",
    },
    {
      bar: 26,
      beat: 1,
      symbol: "E7",
      rn: "V7/vi",
      fn: "chromatic",
    },
    {
      bar: 27,
      beat: 1,
      symbol: "A7",
      rn: "V7/ii",
      fn: "chromatic",
    },
    {
      bar: 29,
      beat: 1,
      symbol: "D7",
      rn: "V7/V",
      fn: "chromatic",
    },
    {
      bar: 30,
      beat: 1,
      symbol: "G7",
      rn: "V7",
      fn: "D",
    },
    {
      bar: 31,
      beat: 1,
      symbol: "C",
      rn: "I",
      fn: "T",
    },
    {
      bar: 32,
      beat: 1,
      symbol: "G7",
      rn: "V7",
      fn: "D",
    },
  ],
  harmonicRhythm: [
    1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 1,
  ],
  cadences: [
    {
      bar: 8,
      type: "HC",
    },
    {
      bar: 16,
      type: "HC",
    },
    {
      bar: 24,
      type: "HC",
    },
    {
      bar: 32,
      type: "HC",
    },
  ],
  schemas: [],
  motifs: [
    {
      track: "bass",
      bars: [1, 1],
      at: [
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5],
        [6, 6],
        [8, 8],
        [10, 10],
        [11, 11],
        [12, 12],
        [13, 13],
        [14, 14],
        [16, 16],
        [17, 17],
        [18, 18],
        [19, 19],
        [20, 20],
        [21, 21],
        [22, 22],
        [23, 23],
        [24, 24],
        [26, 26],
        [27, 27],
        [28, 28],
        [29, 29],
        [30, 30],
        [32, 32],
      ],
      how: "transposed",
    },
    {
      track: "bass",
      bars: [1, 1],
      at: [
        [7, 7],
        [9, 9],
        [15, 15],
        [25, 25],
        [31, 31],
      ],
      how: "exact",
    },
    {
      track: "chords",
      bars: [1, 1],
      at: [
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5],
        [6, 6],
        [8, 8],
        [10, 10],
        [11, 11],
        [12, 12],
        [13, 13],
        [14, 14],
        [16, 16],
        [17, 17],
        [18, 18],
        [19, 19],
        [20, 20],
        [21, 21],
        [22, 22],
        [23, 23],
        [24, 24],
        [26, 26],
        [27, 27],
        [28, 28],
        [29, 29],
        [30, 30],
        [32, 32],
      ],
      how: "rhythm",
    },
    {
      track: "chords",
      bars: [1, 1],
      at: [
        [7, 7],
        [9, 9],
        [15, 15],
        [25, 25],
        [31, 31],
      ],
      how: "exact",
    },
  ],
  ranges: [
    {
      track: "bass",
      low: "G1",
      high: "E2",
      semitones: 9,
      highBar: 2,
    },
    {
      track: "chords",
      low: "C#3",
      high: "C5",
      semitones: 23,
      highBar: 1,
    },
  ],
  chordToneShare: null,
  form: {
    kind: "sections",
    sections: [
      {
        name: "A",
        tag: "a",
        label: "a",
        letter: "A",
        bars: [1, 8],
        tracks: ["bass", "chords"],
        energy: 0.99,
        progression: ["C (I)", "E7 (V7/vi)", "A7 (V7/ii)", "D7 (V7/V)", "G7 (V7)", "C (I)", "G7 (V7)"],
      },
      {
        name: "A",
        tag: "a",
        label: "a",
        letter: "A",
        bars: [9, 16],
        tracks: ["bass", "chords"],
        energy: 0.99,
        progression: ["C (I)", "E7 (V7/vi)", "A7 (V7/ii)", "D7 (V7/V)", "G7 (V7)", "C (I)", "G7 (V7)"],
      },
      {
        name: "B",
        tag: "b",
        label: "b",
        letter: "B",
        bars: [17, 24],
        tracks: ["bass", "chords"],
        energy: 0.99,
        progression: ["E7 (V7/vi)", "A7 (V7/ii)", "D7/A (V43/V)", "G7/D (V43)"],
      },
      {
        name: "A",
        tag: "a",
        label: "a",
        letter: "A",
        bars: [25, 32],
        tracks: ["bass", "chords"],
        energy: 0.99,
        progression: ["C (I)", "E7 (V7/vi)", "A7 (V7/ii)", "D7 (V7/V)", "G7 (V7)", "C (I)", "G7 (V7)"],
      },
    ],
    letters: "AABA",
    problem: null,
    energy: [
      0.99, 0.98, 0.99, 0.99, 0.98, 1, 0.99, 1, 0.99, 0.98, 0.99, 0.99, 0.98, 1, 0.99, 1, 0.98, 0.98, 0.99, 1,
      0.98, 0.98, 1, 1, 0.99, 0.98, 0.99, 0.99, 0.98, 1, 0.99, 1,
    ],
    contrast: [
      {
        a: "A",
        b: "B",
        axes: [],
      },
    ],
  },
  bass: {
    track: "bass",
    notes: 64,
    roles: {
      root: 60,
      fifth: 4,
    },
    rootOnChange: 0.92,
    approaches: {
      dominant: 17,
      "diatonic-above": 1,
    },
    grooveLock: null,
  },
  outside: [
    {
      bar: 2,
      beat: 1,
      symbol: "E7",
      rn: "V7/vi",
      kind: "applied",
      target: "vi",
      resolves: true,
      next: "V7/ii",
      key: "C major",
    },
    {
      bar: 3,
      beat: 1,
      symbol: "A7",
      rn: "V7/ii",
      kind: "applied",
      target: "ii",
      resolves: true,
      next: "V7/V",
      key: "C major",
    },
    {
      bar: 5,
      beat: 1,
      symbol: "D7",
      rn: "V7/V",
      kind: "applied",
      target: "V",
      resolves: true,
      next: "V7",
      key: "C major",
    },
    {
      bar: 10,
      beat: 1,
      symbol: "E7",
      rn: "V7/vi",
      kind: "applied",
      target: "vi",
      resolves: true,
      next: "V7/ii",
      key: "C major",
    },
    {
      bar: 11,
      beat: 1,
      symbol: "A7",
      rn: "V7/ii",
      kind: "applied",
      target: "ii",
      resolves: true,
      next: "V7/V",
      key: "C major",
    },
    {
      bar: 13,
      beat: 1,
      symbol: "D7",
      rn: "V7/V",
      kind: "applied",
      target: "V",
      resolves: true,
      next: "V7",
      key: "C major",
    },
    {
      bar: 17,
      beat: 1,
      symbol: "E7",
      rn: "V7/vi",
      kind: "applied",
      target: "vi",
      resolves: true,
      next: "V7/ii",
      key: "C major",
    },
    {
      bar: 19,
      beat: 1,
      symbol: "A7",
      rn: "V7/ii",
      kind: "applied",
      target: "ii",
      resolves: true,
      next: "V7/V",
      key: "C major",
    },
    {
      bar: 20,
      beat: 1,
      symbol: "D7",
      rn: "V7/V",
      kind: "applied",
      target: "V",
      resolves: true,
      next: "V7",
      key: "C major",
    },
    {
      bar: 26,
      beat: 1,
      symbol: "E7",
      rn: "V7/vi",
      kind: "applied",
      target: "vi",
      resolves: true,
      next: "V7/ii",
      key: "C major",
    },
    {
      bar: 27,
      beat: 1,
      symbol: "A7",
      rn: "V7/ii",
      kind: "applied",
      target: "ii",
      resolves: true,
      next: "V7/V",
      key: "C major",
    },
    {
      bar: 29,
      beat: 1,
      symbol: "D7",
      rn: "V7/V",
      kind: "applied",
      target: "V",
      resolves: true,
      next: "V7",
      key: "C major",
    },
  ],
  sevenths: {
    "7": 19,
  },
  guideLine: [
    "E",
    "D",
    "C#",
    "C",
    "B",
    "E",
    "F",
    "E",
    "D",
    "C#",
    "C",
    "B",
    "E",
    "F",
    "D",
    "C#",
    "C",
    "B",
    "E",
    "D",
    "C#",
    "C",
    "B",
    "E",
    "F",
  ],
  devices: [
    {
      device: "secondary dominant",
      bar: 2,
      bars: 1,
      text: "V7/vi→V7/ii bar 2",
    },
    {
      device: "secondary dominant",
      bar: 3,
      bars: 1,
      text: "V7/ii→V7/V bar 3",
    },
    {
      device: "secondary dominant",
      bar: 5,
      bars: 1,
      text: "V7/V→V7 bar 5",
    },
    {
      device: "secondary dominant",
      bar: 10,
      bars: 1,
      text: "V7/vi→V7/ii bar 10",
    },
    {
      device: "secondary dominant",
      bar: 11,
      bars: 1,
      text: "V7/ii→V7/V bar 11",
    },
    {
      device: "secondary dominant",
      bar: 13,
      bars: 1,
      text: "V7/V→V7 bar 13",
    },
    {
      device: "secondary dominant",
      bar: 17,
      bars: 1,
      text: "V7/vi→V7/ii bar 17",
    },
    {
      device: "secondary dominant",
      bar: 19,
      bars: 1,
      text: "V7/ii→V7/V bar 19",
    },
    {
      device: "secondary dominant",
      bar: 20,
      bars: 1,
      text: "V7/V→V7 bar 20",
    },
    {
      device: "secondary dominant",
      bar: 26,
      bars: 1,
      text: "V7/vi→V7/ii bar 26",
    },
    {
      device: "secondary dominant",
      bar: 27,
      bars: 1,
      text: "V7/ii→V7/V bar 27",
    },
    {
      device: "secondary dominant",
      bar: 29,
      bars: 1,
      text: "V7/V→V7 bar 29",
    },
  ],
  durationSec: 64,
};

const source = (
  title: string,
  code: string,
  facts: ReviewFacts,
  over: Partial<ReviewSource> = {},
): ReviewSource => ({
  title,
  code,
  brief: "",
  analysis: `${facts.bars} bars in ${facts.key}.`,
  rubric: [],
  learnerNote: null,
  checklist: [],
  reference: null,
  totalBars: facts.bars,
  revisions: 2,
  facts,
  ...over,
});

/** C6 "Modal Vamp" (contracts §2.4, §6.6): a D Dorian vamp, Head and Solo, eight bars each. */
export const C6_SOURCE: ReviewSource = source("Slow Burn", C6_CODE, C6_FACTS, {
  brief:
    "A modal vamp in Mixolydian or Dorian: the colour note on a strong beat, the home chord in most bars.",
  rubric: [
    { label: "Mixolydian or Dorian, with its colour note on a strong beat twice", required: true, met: true },
    { label: "The home chord sounds in at least 40% of bars", required: true, met: true },
  ],
});

export const C6_REVIEW: CapstoneReview = {
  strengths: [
    {
      text: "The tune reaches [[deg:6]] on the last beat of bar 1 and again in bar 3: the raised 6 is what makes this Dorian, and it lands where it can be heard.",
      bars: [1, 3],
    },
    {
      text: "Dm7 and G7 trade bar by bar through the Head: the home chord sounds in half the bars, and the vamp never leaves home.",
      bars: [1, 8],
    },
  ],
  revisions: [
    {
      title: "Give the Solo a rhythm of its own",
      bars: [9, 16],
      why: "Head and Solo differ on one axis only, pitch, and bars 9, 11, 13 and 15 keep the rhythm of bar 1. A new rhythm in those bars would set the two sections apart.",
      tryCode: 'mel: n("<[9 ~ 7 5] [~ 4 5 ~]>").scale("D4:dorian").s("piano")',
      skills: ["S12"],
    },
    {
      title: "Hold the raised 6 over G7",
      bars: [2, 2],
      why: "Over G7 the raised 6 is the chord's own 3rd. Holding it for the bar would let the colour note ring where the chord agrees with it.",
      tryCode: 'mel: n("<[0 2 4 5] [5@3 4]>").scale("D4:dorian").s("piano")',
      skills: ["S12"],
    },
  ],
  listeningQuestion: "In bar 12 the vamp visits C instead of G7: does the tune still sound at home on D?",
  linerNote: "A slow Dorian vamp on D whose tune keeps returning to the raised 6 over Dm7 and G7.",
};

/** C7 "Chromatic Colour": a V of V in the verse, bVI-bVII-I in the chorus, the last chorus a whole step up. */
export const C7_SOURCE: ReviewSource = source("Second Wind", C7_CODE, C7_FACTS, {
  brief:
    "A song with colour from outside the key: a secondary dominant that resolves, the run bVI bVII I, and a last chorus that lifts.",
  rubric: [
    { label: "A secondary dominant that resolves", required: true, met: true },
    { label: "bVI, bVII, I in that order", required: true, met: true },
    { label: "The last chorus lifts to a new key", required: true, met: true },
  ],
});

export const C7_REVIEW: CapstoneReview = {
  strengths: [
    {
      text: "D7 in bar 3 is [[rn:V7/V]] and bar 4 goes to G7, the chord it leans into; the tune's [[deg:#4]] in bar 3 leans up with it.",
      bars: [3, 4],
    },
    {
      text: "The chorus ends A♭, B♭, C: bVI, bVII, then home, and the tune rides the borrowed notes down in bars 14 and 15.",
      bars: [14, 16],
    },
    {
      text: "Bar 17 starts the chorus again in D major, 2 half steps up, and the borrowed run comes back in the new key at bars 22 to 24.",
      bars: [17, 24],
    },
  ],
  revisions: [
    {
      title: "Give the chorus its own shape",
      bars: [9, 16],
      why: "Verse and Chorus differ on no axis: same tracks, same register, same density. A busier bass under the chorus would make the lift in bar 17 the second step up, not the first.",
      tryCode: 'bass: n("<[3 ~ 3 4] [4 ~ 4 0]>").scale("C2:major").s("ebass")',
      skills: ["F05"],
    },
    {
      title: "Prepare the lift in bar 16",
      bars: [16, 17],
      why: "The new key arrives with no warning in bar 17. One beat of A7 at the end of bar 16 would lean into D the way D7 leans into G7 in bars 3 and 4.",
      tryCode: 'chords: chord("<[C@3 A7] D>").voicing().s("piano")',
      skills: ["H14"],
    },
  ],
  listeningQuestion: "When bar 17 arrives, do you hear the home note move before the tune starts again?",
  linerNote:
    "A three-part song in C that borrows A♭ and B♭ for its chorus and lifts a whole step for the last one.",
};

/**
 * CF-A "Album Single": the pop reference single of the finale spec (content/specs/finale-reference.ts) as the
 * learner's own song: 56 bars, 2:14, verse chorus verse chorus bridge chorus and a last chorus a whole step up.
 * The review asks for three strengths, the strongest first.
 */
export const CFA_SOURCE: ReviewSource = source("Long Way Round", CFA_CODE, CFA_FACTS, {
  brief:
    "Your single: at least two minutes, a form with a bridge, and at least four devices from the core, in a style you choose.",
  rubric: [
    { label: "At least four devices", required: true, met: true },
    { label: "The form has a bridge", required: true, met: true },
    { label: "At least two minutes", required: true, met: true },
  ],
  learnerNote: "I wanted the bridge to feel like the floor dropping.",
  strengthsWanted: 3,
});

export const CFA_REVIEW: CapstoneReview = {
  strengths: [
    {
      text: "The bridge is the strongest thing here: Fm in bar 33 lowers one note of the F every chorus begins on, then A♭ and B♭ in bars 37 and 38 climb to G. The floor does drop.",
      bars: [33, 40],
    },
    {
      text: "E7 in bar 11 leans into Am in bar 12, and the tune's [[deg:#5]] rises with it; the same move returns in bars 27 and 43, so the chorus is known by it.",
      bars: [11, 12],
    },
    {
      text: "Bar 49 starts the last chorus in D major, 2 half steps up, after 48 bars in C: five of the six devices are in the song and this one is saved for the end.",
      bars: [49, 56],
    },
  ],
  revisions: [
    {
      title: "Set the bridge apart by more than chords",
      bars: [33, 40],
      why: "Verse and Bridge differ on no axis: same tracks, same register, same density. With the drums thinned for those eight bars, the borrowed chords would have room.",
      tryCode: 'kick: s("bd ~ ~ ~")\nsnare: s("~ ~ sd ~")',
      skills: ["F05"],
    },
    {
      title: "Let the tune lead the lift",
      bars: [48, 49],
      why: "Bar 48 is silent in the tune, so the new key arrives on the chords alone. Three notes climbing into bar 49 would carry the ear from C to D.",
      tryCode: 'mel: n("<[~ 4 5 6] [8 ~ 8 6]>").scale("<C4:major D4:major>").s("piano")',
      skills: ["H14"],
    },
  ],
  listeningQuestion:
    "At bar 33, which do you notice first: the chord turning dark, or the bass leaving its pattern?",
  linerNote:
    "A two-minute single in C: a chorus marked by E7 into A minor, a bridge that borrows from C minor, and a last chorus a whole step up.",
};

/**
 * CF-T "Standard Transcription": a 32-bar AABA standard in C taken down by ear, stage by stage. The form map and
 * the bass have passed, the changes are in progress section by section, the melody is not open yet.
 */
export const CFT_CHECKS: CheckLike[] = [
  {
    checkId: "form",
    phrase: [1, 4],
    layer: "form",
    stage: null,
    open: true,
    score: 1,
    passed: true,
    revealed: false,
    passAt: 1,
  },
  {
    checkId: "bass-1",
    phrase: 1,
    layer: "bass",
    stage: null,
    open: true,
    score: 0.94,
    passed: true,
    revealed: false,
    passAt: 0.9,
  },
  {
    checkId: "bass-2",
    phrase: 2,
    layer: "bass",
    stage: null,
    open: true,
    score: 1,
    passed: true,
    revealed: false,
    passAt: 0.9,
  },
  {
    checkId: "bass-3",
    phrase: 3,
    layer: "bass",
    stage: null,
    open: true,
    score: 0.91,
    passed: true,
    revealed: false,
    passAt: 0.9,
  },
  {
    checkId: "bass-4",
    phrase: 4,
    layer: "bass",
    stage: null,
    open: true,
    score: 1,
    passed: true,
    revealed: false,
    passAt: 0.9,
  },
  {
    checkId: "changes-1",
    phrase: 1,
    layer: "chords",
    stage: null,
    open: true,
    score: 0.88,
    passed: true,
    revealed: false,
    passAt: 0.85,
  },
  {
    checkId: "changes-2",
    phrase: 2,
    layer: "chords",
    stage: null,
    open: true,
    score: 0.88,
    passed: true,
    revealed: false,
    passAt: 0.85,
  },
  {
    checkId: "changes-3",
    phrase: 3,
    layer: "chords",
    stage: null,
    open: true,
    score: 0.75,
    passed: false,
    revealed: false,
    passAt: 0.85,
  },
  {
    checkId: "changes-4",
    phrase: 4,
    layer: "chords",
    stage: null,
    open: true,
    score: null,
    passed: false,
    revealed: false,
    passAt: 0.85,
  },
  {
    checkId: "melody-1",
    phrase: 1,
    layer: "melody",
    stage: null,
    open: false,
    score: null,
    passed: false,
    revealed: false,
    passAt: 0.9,
  },
];

/** The recording's own bridge, which the learner has not found yet. It must never travel before a reveal or a pass. */
export const CFT_HIDDEN_SOURCE =
  'chords: chord("<E7 E7 A7 A7 D7 D7 G7 G7>").voicing()\nmel: note("<[b4 ~ g#4 ~] [e4 ~ ~ ~] [c#5 ~ a4 ~] [e4 ~ ~ ~]>")';
/** Literals of the hidden source no context, tool result or stream may hold before a reveal or a pass. */
export const CFT_SECRETS = ["E7 E7 A7 A7 D7 D7 G7 G7", "[c#5 ~ a4 ~]", "b4 ~ g#4"];

export const CFT_FACTS: ReviewFacts = {
  ...CFT_ANALYSED,
  stages: stageFacts(CFT_CHECKS),
};

export const CFT_SOURCE: ReviewSource = source("Five Foot Two (by ear)", CFT_CODE, CFT_FACTS, {
  brief: "A 32-bar standard taken down by ear: the form map, then the bass, the changes and the melody.",
  checklist: [],
});

/**
 * CF-T's review. The capstone workspace asks for it on the capstone thread (as X1 and X2 do), so it is a
 * `CapstoneReview` with two revisions; each try-it is the learner's own passed bass to loop, never the recording.
 */
export const CFT_REVIEW: CapstoneReview = {
  strengths: [
    {
      text: "The form map is right: three sections alike and one bridge, so bars 1 to 8 are written once and used three times.",
      bars: [1, 32],
    },
    {
      text: "The bass passed in all four sections, and under bars 2 to 6 it walks the roots E, A, D, G, each chord leaning into the next.",
      bars: [2, 6],
    },
  ],
  revisions: [
    {
      title: "Recheck the bridge's changes",
      bars: [17, 24],
      why: "The changes of section 3 stand at 75% against a mark of 85%, and in bars 20 and 22 the bass, which passed, is not on the root of the chord above it.",
      tryCode: 'bass: note("<a1 a1 d2 d2>").s("ebass")',
      skills: ["T06"],
    },
    {
      title: "Finish the last section before the tune",
      bars: [25, 32],
      why: "Section 4 has not been checked yet, and the melody opens only when the changes have passed. The form map says it matches bars 1 to 8.",
      tryCode: 'bass: note("<c2 e2 a1 a1 d2 g1 c2 g1>").s("ebass")',
      skills: ["T06"],
    },
  ],
  listeningQuestion: "In the bridge, how many bars does each chord last before the next one arrives?",
  linerNote:
    "A 32-bar standard taken down by ear: the form mapped first, the bass in all four sections, the changes most of the way.",
};

/** A ladder L8 project's review (a transcription subject): layers, what to listen for, where the take contradicts itself. */
export const L8_REVIEW: TranscriptionReview = {
  strengths: [
    {
      text: "The form map is right: three sections alike and one bridge, so bars 1 to 8 are written once and used three times.",
      bars: [1, 32],
      layer: "form",
    },
    {
      text: "The bass passed in all four sections, and under bars 2 to 6 it walks the roots E, A, D, G, each chord leaning into the next.",
      bars: [2, 6],
      layer: "bass",
    },
  ],
  revisions: [
    {
      title: "Recheck the bridge's changes",
      bars: [17, 24],
      layer: "chords",
      why: "The changes of section 3 stand at 75% against a mark of 85%, while sections 1 and 2 passed: the bridge is where the chart and the recording part.",
      listenFor:
        "Loop bars 19 and 20 at half speed and sing the bass note: does the chord above it change in bar 20?",
    },
    {
      title: "Finish the last section before the tune",
      bars: [25, 32],
      layer: "chords",
      why: "Section 4 has not been checked yet, and the melody opens only when the changes have passed. It should match the first eight bars.",
      listenFor: "Play bars 1 to 8 and bars 25 to 32 back to back: where, if anywhere, do the chords differ?",
    },
  ],
  plausibilityFlags: [
    { bars: [20, 20], issue: "Bass and chord disagree: the bass plays A while the chart says D7." },
    { bars: [22, 22], issue: "Bass and chord disagree: the bass plays D while the chart says G7." },
  ],
  listeningQuestion: "In the bridge, how many bars does each chord last before the next one arrives?",
  linerNote:
    "A 32-bar standard taken down by ear: the form mapped first, the bass in all four sections, the changes most of the way.",
};

/** A ladder L8 project on the same standard: the form stage passed, the bass stage in progress. */
export const L8_CHECKS: CheckLike[] = [
  {
    checkId: "form",
    phrase: [1, 4],
    layer: "form",
    stage: "form",
    open: true,
    score: 1,
    passed: true,
    revealed: false,
    passAt: 1,
  },
  {
    checkId: "bass",
    phrase: [1, 4],
    layer: "bass",
    stage: "bass",
    open: true,
    score: 0.78,
    passed: false,
    revealed: false,
    passAt: 0.9,
  },
  {
    checkId: "changes",
    phrase: [1, 4],
    layer: "chords",
    stage: "changes",
    open: false,
    score: null,
    passed: false,
    revealed: false,
    passAt: 0.85,
  },
  {
    checkId: "melody",
    phrase: [1, 4],
    layer: "melody",
    stage: "melody",
    open: false,
    score: null,
    passed: false,
    revealed: false,
    passAt: 0.9,
  },
];
