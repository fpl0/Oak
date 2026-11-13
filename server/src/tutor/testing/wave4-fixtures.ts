// Wave 4 fixtures: one graded step per new answer kind (numerals, chord symbols, a hand voice-leading step, a
// bass dictation by ear), the analysed facts of a four-chord song, and reviews anchored to them. Every musical
// fact here was checked with @oak/theory and headless Strudel (review-facts.test.ts and wave4-music.test.ts).
// Test data only.
import type { GradeSnapshot, LessonSource, ReviewFacts, ReviewSource, StepSource } from "../domain.ts";
import type { CapstoneReview, TranscriptionReview } from "../reviews.ts";

export const W4_LESSON: LessonSource = {
  id: "U06.L02",
  title: "Roman Numerals",
  objective: "Name chords by the degree they stand on.",
  key: "C major",
  meter: "4/4",
  bpm: 90,
};

/** U06.L02-style: name the numerals of C G Am F in C major. Answer I V vi IV (the chords are shown). */
export const RN_STEP: StepSource = {
  lessonId: "U06.L02",
  id: "U06.L02/S5",
  kind: "identify",
  grading: "graded",
  exerciseRef: "U06.L02/numerals-of-the-loop",
  prompt: "The loop plays C G Am F. Pick the numeral of each chord in C major.",
  starterCode: 'chords: chord("<C G Am F>").voicing().s("piano")',
  constraints: [],
  rubric: null,
  hints: [
    "Count up from the tonic: which degree is each chord's root on?",
    "Bar 3: the root is the sixth note of the scale. Is the chord major or minor?",
    "Lower case means minor: the chord on degree 2 in C is ii.",
    "I V vi IV",
  ],
  knownMistakes: [
    { feedback: "harmony.rn-case", description: "Wrote VI for a minor chord.", variantCode: "I V VI IV" },
  ],
  solutions: ["I V vi IV"],
  key: "C major",
  answerKind: "rn-palette",
};

/** Spell the chords of I vi IV V in G: G Em C D. The step is in G inside a lesson in C. */
export const CHORD_STEP: StepSource = {
  lessonId: "U06.L02",
  id: "U06.L02/S6",
  kind: "identify",
  grading: "graded",
  exerciseRef: "U06.L02/numerals-to-chords",
  prompt: "Write the chord symbols of I vi IV V in G major.",
  starterCode: null,
  constraints: [],
  rubric: null,
  hints: [
    "Start from the scale of G: which notes are degrees 1, 6, 4 and 5?",
    "The chord on degree 6 is minor; the other three are major.",
    "In C the same numerals are C Am F G.",
    "G Em C D",
  ],
  knownMistakes: [],
  solutions: ["G Em C D"],
  key: "G major",
  answerKind: "text",
};

/** U05.L07 hand-voiced cadence: I V6 I with the common tone G held (c4 e4 g4 → b3 d4 g4 → c4 e4 g4). */
export const VOICING_STEP: StepSource = {
  lessonId: "U05.L07",
  id: "U05.L07/S5",
  kind: "write-code",
  grading: "graded",
  exerciseRef: "U05.L07/hand-voiced-cadence",
  prompt: "Voice I V I so that every note moves to the nearest note of the next chord.",
  starterCode: 'chords: note("<[c4,e4,g4] [~] [c4,e4,g4]>").s("piano")',
  constraints: ["Keep the common tone"],
  rubric: null,
  hints: [
    "Which note do C and G share?",
    "Keep G where it is; move each other note by a step.",
    "From F A C to C E G, the C stays and the others step down.",
    'chords: note("<[c4,e4,g4] [b3,d4,g4] [c4,e4,g4]>").s("piano")',
  ],
  knownMistakes: [
    {
      feedback: "harmony.voice-leap",
      description: "Jumped every voice up to root position G.",
      variantCode: 'chords: note("<[c4,e4,g4] [g4,b4,d5] [c4,e4,g4]>").s("piano")',
    },
  ],
  solutions: ['chords: note("<[c4,e4,g4] [b3,d4,g4] [c4,e4,g4]>").s("piano")'],
  key: "C major",
  answerKind: "voice-leading",
};

/** By ear: the bass of a four-chord loop, degrees 1 5 6 4 (n 0 4 5 3) in C. */
export const DICTATION_STEP: StepSource = {
  lessonId: "U06.L05",
  id: "U06.L05/S4",
  kind: "dictation",
  grading: "graded",
  exerciseRef: "U06.L05/bass-first",
  prompt: "Listen to the loop and write the bass, one note per bar.",
  starterCode: 'bass: n("<~ ~ ~ ~>").scale("C2:major").s("bass")',
  constraints: [],
  rubric: null,
  hints: [
    "Is the first bass note home?",
    "Bar 2 jumps up to the note the loop leans on most.",
    "Sing up the scale from 1 until you match bar 3.",
    "1 5 6 4",
  ],
  knownMistakes: [],
  solutions: ['bass: n("<0 4 5 3>").scale("C2:major").s("bass")', "1 5 6 4"],
  key: "C major",
  answerKind: "chord-dictation",
};

export const W4_STEPS = [RN_STEP, CHORD_STEP, VOICING_STEP, DICTATION_STEP] as const;

/** What a model would write if it ignored the rules, per step: the answer in tokens and in words. */
export const LEAKY_TEXT: Record<string, string[]> = {
  [RN_STEP.id]: ["The loop goes [[rn:I]] [[rn:V]] ", "[[rn:vi]] [[rn:IV]]. Bar 3 is vi, ", "so try that."],
  [CHORD_STEP.id]: ["In G it is G", " Em C D. The chord on 6 is [[chord:Em]]."],
  [VOICING_STEP.id]: ["Move to [[note:B3]] and ", "D4 under the held G: b3 d4 g4."],
  [DICTATION_STEP.id]: ["The bass is 1 5 ", '6 4, or in code n("0 4 5 3").'],
};

/** A leaky card per step: its code or explanation spells out the answer. */
export const LEAKY_CARD: Record<string, { code: string; explanation: string }> = {
  [RN_STEP.id]: { code: 'chords: chord("<C G Am F>").s("piano")', explanation: "These are I V vi IV." },
  [CHORD_STEP.id]: { code: 'chords: chord("<G Em C D>").s("piano")', explanation: "The four chords." },
  [VOICING_STEP.id]: {
    code: 'chords: note("<[c4,e4,g4] [b3,d4,g4] [c4,e4,g4]>").s("piano")',
    explanation: "Common tone held.",
  },
  [DICTATION_STEP.id]: { code: 'bass: n("<0 4 5 3>").scale("C2:major").s("bass")', explanation: "The bass." },
};

/** The checker's findings on a wrong answer of each step; the first issue's expected value is the answer. */
export function gradeFor(step: StepSource): GradeSnapshot {
  const expected: Record<string, [string, string]> = {
    [RN_STEP.id]: ["vi", "VI"],
    [CHORD_STEP.id]: ["Em", "E"],
    [VOICING_STEP.id]: ["b3 d4 g4", "g4 b4 d5"],
    [DICTATION_STEP.id]: ["degree 6, n 5", "degree 5, n 4"],
  };
  const [exp, got] = expected[step.id] ?? ["", ""];
  return {
    status: "fail",
    score: 0.75,
    dims: { harmony: 0.75 },
    counts: { missing: 0, extra: 0, wrong: 1 },
    issues: [
      {
        where: { track: null, bar: 3, beat: 1, code: null },
        severity: "error",
        feedback: "harmony.wrong-chord",
        direction: null,
        concept: "the chord on degree 6",
        what: "Bar 3 is not the chord the loop plays there.",
        fix: `Use ${exp} in bar 3.`,
        expected: exp,
        got,
      },
    ],
    warnings: [],
  };
}

/**
 * C2-like (SONG_CODE): C G Am F C G, then F–G in bar 7 and C: I V vi IV I V IV–V I, the axis schema in bars 1–4,
 * a PAC in bar 8 (melody on 1 over root-position I). The melody of bar 1 returns exactly in bar 5, the rhythm of
 * bars 1–2 in bars 3–4 and bar 2's in bars 6 and 7; its range is
 * C4–A4 with the A4 only in bar 6; every strong-beat melody note is a chord tone. What harmonyView and
 * analyzePiece compute for SONG_CODE (review-facts.music.test.ts).
 */
export const SONG_FACTS: ReviewFacts = {
  key: "C major",
  meter: "4/4",
  bars: 8,
  pickup: false,
  chords: [
    { bar: 1, beat: 1, symbol: "C", rn: "I", fn: "T" },
    { bar: 2, beat: 1, symbol: "G", rn: "V", fn: "D" },
    { bar: 3, beat: 1, symbol: "Am", rn: "vi", fn: "T" },
    { bar: 4, beat: 1, symbol: "F", rn: "IV", fn: "PD" },
    { bar: 5, beat: 1, symbol: "C", rn: "I", fn: "T" },
    { bar: 6, beat: 1, symbol: "G", rn: "V", fn: "D" },
    { bar: 7, beat: 1, symbol: "F", rn: "IV", fn: "PD" },
    { bar: 7, beat: 3, symbol: "G", rn: "V", fn: "D" },
    { bar: 8, beat: 1, symbol: "C", rn: "I", fn: "T" },
  ],
  harmonicRhythm: [1, 1, 1, 1, 1, 1, 2, 1],
  cadences: [{ bar: 8, type: "PAC" }],
  schemas: [{ schema: "schema.axis", bars: [1, 4] }],
  motifs: [
    { track: "mel", bars: [1, 2], at: [[3, 4]], how: "rhythm" },
    { track: "mel", bars: [1, 1], at: [[5, 5]], how: "exact" },
    {
      track: "mel",
      bars: [2, 2],
      at: [
        [6, 6],
        [7, 7],
      ],
      how: "rhythm",
    },
  ],
  ranges: [{ track: "mel", low: "C4", high: "A4", semitones: 9, highBar: 6 }],
  chordToneShare: 1,
};

export const SONG_CODE = [
  "setcpm(90/4)",
  'chords: chord("<C G Am F C G [F G] C>").voicing().s("piano")',
  'bass: n("<0 4 5 3 0 4 [3 4] 0>").scale("C2:major").s("bass")',
  'mel: n("<[0 2 4 2] [4 3 1 ~] [2 0 2 0] [3 2 0 ~] [0 2 4 2] [4 5 4 ~] [3 1 1 ~] [0 ~ ~ ~]>").scale("C4:major").s("piano")',
].join("\n");

export const SONG_REVIEW_SOURCE: ReviewSource = {
  title: "Four-Chord Song",
  code: SONG_CODE,
  brief: "A song on the axis loop that ends with a cadence.",
  analysis: "Tempo: 90 BPM; 8 bars.",
  rubric: [
    { label: "Bars 1-6 are the loop", required: true, met: true },
    { label: "Ends with a cadence", required: true, met: true },
  ],
  learnerNote: "Is the ending strong enough?",
  checklist: [],
  reference: null,
  totalBars: 8,
  revisions: 1,
  facts: SONG_FACTS,
};

/** A C2 review anchored to the facts: bars, chords and numerals exactly as they are listed. */
export const SONG_REVIEW: CapstoneReview = {
  strengths: [
    {
      text: "The melody of bar 1 comes back exactly in bar 5, so the second half answers the first.",
      bars: [5, 5],
    },
    { text: "Bar 7 moves IV to V within the bar, so the cadence in bar 8 lands with weight.", bars: [7, 8] },
  ],
  revisions: [
    {
      title: "Let bar 6 climb once more",
      bars: [6, 6],
      why: "The highest note, A4, already sits in bar 6 over G. Holding it a beat longer makes the climax clear before the cadence.",
      tryCode: 'mel: n("<[4 5 ~ 4]>").scale("C4:major").s("piano")',
      skills: ["M01"],
    },
  ],
  listeningQuestion: "In bar 8, does the melody's last note feel like home over the C chord?",
  linerNote:
    "A four-chord song on the axis loop whose opening motif returns halfway and closes on a full cadence.",
};

export const OWN_AUDIO_SOURCE: ReviewSource = {
  title: "Kitchen radio song",
  code: 'bass: n("<0 4 5 3>").scale("C2:major").s("bass")\nchords: chord("<C G Am F>").s("piano")',
  brief: "Transcribe “Kitchen radio song” from your own recording.",
  analysis: "Tempo: 90 BPM; 4 bars.",
  rubric: [],
  learnerNote: null,
  checklist: ["contour: 1/2", "rhythm: 2/2", "landing: 1/2", "bass: 2/2", "chords: 1/2"],
  reference: null,
  totalBars: 4,
  revisions: 1,
  facts: {
    ...SONG_FACTS,
    bars: 4,
    chords: SONG_FACTS.chords.slice(0, 4),
    harmonicRhythm: [1, 1, 1, 1],
    cadences: [],
    motifs: [],
    ranges: [{ track: "bass", low: "C2", high: "A2", semitones: 9, highBar: 3 }],
    chordToneShare: null,
  },
};

export const OWN_AUDIO_REVIEW: TranscriptionReview = {
  strengths: [
    { text: "The bass changes on each downbeat and follows the chord roots.", bars: [1, 4], layer: "bass" },
    { text: "The chords keep the loop's order through all four bars.", bars: [1, 4], layer: "chords" },
  ],
  revisions: [
    {
      title: "Check bar 3's chord quality",
      bars: [3, 3],
      layer: "chords",
      why: "Your checklist marks the chords as half sure; bar 3 is the only minor chord, the easiest place to slip.",
      listenFor: "Loop bar 3 and listen for whether it sounds darker than bar 1.",
    },
  ],
  plausibilityFlags: [],
  listeningQuestion: "Does the bass in bar 4 step down or leap into bar 1 when the loop repeats?",
  linerNote: "A transcription of a home recording that sets down the bass and the four-chord loop above it.",
};
