// Wave 7 fixtures: one graded step per new answer kind (a jazz chord name, a voicing shape, a swing feel, a
// microtiming side, a clave, a tension, a grouping, a Euclidean rhythm, a sound comparison, and in code a swing amount,
// a Euclidean rhythm and a voicing's anchor), and the eight track capstones (JC1–JC4, RC1–RC2, AC1–AC2): each piece's
// code, the facts Oak's analysis reads from it (wave7-facts.json, generated from the code through headless Strudel and
// the grader's views; wave7.music.test.ts re-derives them and checks every musical claim) and a review anchored to
// them. The tunes are newly written for these tests (JC3's model head and JC4's standard are stand-ins, not the
// repertoire's songs). Test data only.
import type { GradeSnapshot, LessonSource, ReviewFacts, ReviewSource, StepSource } from "../domain.ts";
import type { CapstoneReview } from "../reviews.ts";
import FACTS from "./wave7-facts.json" with { type: "json" };

// --- the steps ---------------------------------------------------------------------------------------------------

export const W7_LESSON: LessonSource = {
  id: "J1.L02",
  title: "Jazz Chord Symbols",
  objective: "Read and write the chord symbols of a jazz lead sheet.",
  key: "C major",
  meter: "4/4",
  bpm: 100,
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

/** J1.L02-style (`text.jazz-chord`): four notes sound; write the chord in jazz symbols. Answer Dm7 (D–7, Dmin7). */
export const JAZZ_CHORD_STEP = step({
  lessonId: "J1.L02",
  id: "J1.L02/S5",
  kind: "quiz",
  exerciseRef: "J1.L02/name-the-stack",
  prompt:
    "Four notes sound together, from the bottom: degrees 2, 4, 6 and 1 of C major. Write the chord's symbol.",
  hints: [
    "Which note is the root: the lowest one, or another?",
    "Count from the root: is the 3rd major or minor? Is the 7th a half step or a whole step under the octave?",
    "A minor 3rd and a minor 7th over the root: the symbol has a lower-case m.",
    "Dm7",
  ],
  solutions: ["Dm7"],
  key: "C major",
  answerKind: "text",
});

/** J3.L01-style (`keyboard.voicing`): play the voicing heard on Dm7. Shape rootless A (F A C E). */
export const VOICING_STEP = step({
  lessonId: "J3.L01",
  id: "J3.L01/S4",
  kind: "ear",
  exerciseRef: "J3.L01/play-the-shape",
  prompt: "Dm7 plays twice with the bass on D. Play the same shape on the keyboard, starting from F3.",
  hints: [
    "Is the root in the chord you hear, or only in the bass?",
    "Which chord tone is lowest: the 3rd or the 7th?",
    "Four notes, stacked in thirds from that lowest note, with the 9th on top.",
    "rootless-a",
  ],
  solutions: ["rootless-a", "65 69 72 76"],
  key: "C major",
  answerKind: "keyboard",
});

/** R1.L02-style: how hard does it swing (content-kit `SWING_RATIO_OPTIONS`). */
export const SWING_STEP = step({
  lessonId: "R1.L02",
  id: "R1.L02/S6",
  kind: "ear",
  exerciseRef: "R1.L02/how-hard",
  prompt: "A ride pattern plays at 120 BPM. How long is the first note of each pair against the second?",
  hints: [
    "Tap the pairs: do they feel even, or long-short?",
    "Is the long note about one and a half times the short one, or twice it, or three times?",
    "Clap three even notes inside one beat, then join the first two: is that the long note you hear?",
    "Triplet swing (2:1)",
  ],
  solutions: ["Triplet swing (2:1)"],
  key: "C major",
  answerKind: "choice",
});

/** R1.L05-style (`MICROTIMING_OPTIONS`): where does the snare sit. */
export const MICRO_STEP = step({
  lessonId: "R1.L05",
  id: "R1.L05/S5",
  kind: "ear",
  exerciseRef: "R1.L05/where-is-the-snare",
  prompt:
    "Bars 1 and 2 play the same groove twice; in bar 2 the snare moves. Where does it sit against the hi-hat?",
  hints: [
    "Listen to the snare and the hi-hat together on beat 2: one sound or two?",
    "If two, which comes first?",
    "The hi-hat speaks first; the snare follows by a few milliseconds.",
    "Behind: it leans back, a hair late",
  ],
  solutions: ["Behind: it leans back, a hair late"],
  key: "C major",
  answerKind: "choice",
});

/** R3.L02-style (`CLAVE_OPTIONS`): name the clave and its direction. */
export const CLAVE_STEP = step({
  lessonId: "R3.L02",
  id: "R3.L02/S3",
  kind: "ear",
  exerciseRef: "R3.L02/which-clave",
  prompt: "Two bars of claves loop four times. Which pattern is it, and which bar comes first?",
  hints: [
    "Count the strokes in each bar.",
    "Does the bar with more strokes come first or second?",
    "In the bar with more strokes, does its last stroke land on beat 4 or just after it?",
    "Son clave, 2-3",
  ],
  solutions: ["Son clave, 2-3"],
  key: "C major",
  answerKind: "choice",
});

/** J2.L03-style (`TENSION_OPTIONS`): what is the held melody note over C7. Answer the ♯11 (F♯). */
export const TENSION_STEP = step({
  lessonId: "J2.L03",
  id: "J2.L03/S4",
  kind: "ear",
  exerciseRef: "J2.L03/name-the-colour",
  prompt: "The melody holds one note over C7 in bar 2. What is it against the chord?",
  hints: [
    "Is the note in the chord, or above its 7th?",
    "Count up from C: which number is it, counted past the octave?",
    "It is a half step above the 4th, the bright tension a Lydian dominant has.",
    "The ♯11",
  ],
  solutions: ["The ♯11"],
  key: "F major",
  answerKind: "choice",
});

/** R2.L01-style (`grouping` widget): the groups of a bar of 7/8. */
export const GROUPING_STEP = step({
  lessonId: "R2.L02",
  id: "R2.L02/S4",
  kind: "ear",
  exerciseRef: "R2.L02/cut-the-bar",
  prompt: "A bar of 7/8 loops with an accent at the start of each group. Cut the bar into its groups.",
  hints: [
    "Count the eighths between accents.",
    "Is the long group first or last?",
    "Two short groups, then the long one.",
    "2+2+3",
  ],
  solutions: ["2+2+3"],
  key: "C major",
  meter: "7/8",
  answerKind: "grouping",
});

/** R3.L01-style (`euclid` widget): the cinquillo as (k, n). */
export const EUCLID_STEP = step({
  lessonId: "R3.L01",
  id: "R3.L01/S5",
  kind: "ear",
  exerciseRef: "R3.L01/how-many-hits",
  prompt: "A bell pattern loops, spread as evenly as it can over a bar of eighths. Set its numbers.",
  hints: [
    "Count the hits in one bar.",
    "Count the places they could fall on: how many eighths in a bar?",
    "It is the tresillo with two notes filled in.",
    "(5,8)",
  ],
  solutions: ["(5,8)"],
  key: "C major",
  answerKind: "euclid",
});

/** A1.L02-style (`SOUND_COMPARE_OPTIONS.brightness`): the second sound against the first. */
export const SOUND_STEP = step({
  lessonId: "A1.L06",
  id: "A1.L06/S3",
  kind: "ear",
  exerciseRef: "A1.L06/compare-the-filter",
  prompt: "The same chord plays twice. How does the second sound compare with the first?",
  hints: [
    "Listen to the top of the sound: is there more or less of it?",
    "Does the second one ring or sound muffled?",
    "Its highest harmonics are cut away.",
    "Darker",
  ],
  solutions: ["Darker"],
  key: "C major",
  answerKind: "choice",
});

/** R1.L02-style code step: swing the hi-hat to 2:1 (`.swingBy(1/3, 4)`). */
export const SWING_CODE_STEP = step({
  lessonId: "R1.L02",
  id: "R1.L02/S4",
  kind: "modify",
  exerciseRef: "R1.L02/swing-the-hats",
  prompt: "The hi-hat plays straight eighths. Make it swing the way the ride in the example does.",
  starterCode: 'hats: s("hh*8").gain(.6)',
  hints: [
    "Is the example's long note twice the short one, or less?",
    "One method moves every second eighth later; it takes an amount and how many slots a cycle has.",
    "Two to one is the triplet's two-plus-one; the amount is a fraction.",
    'hats: s("hh*8").swingBy(1/3, 4).gain(.6)',
  ],
  solutions: ['hats: s("hh*8").swingBy(1/3, 4).gain(.6)'],
  key: "C major",
});

/** R3.L01-style code step: the tresillo in mini-notation (`rim(3,8)`). */
export const EUCLID_CODE_STEP = step({
  lessonId: "R3.L01",
  id: "R3.L01/S4",
  kind: "modify",
  exerciseRef: "R3.L01/spread-the-hits",
  prompt: "The rim plays every eighth. Spread three hits as evenly as you can over the bar.",
  starterCode: 'perc: s("rim*8")',
  hints: [
    "Three hits, eight places: how far apart can they be?",
    "Mini-notation can spread hits for you, with two numbers in brackets.",
    "The first number is the hits, the second the places.",
    'perc: s("rim(3,8)")',
  ],
  solutions: ['perc: s("rim(3,8)")'],
  key: "C major",
});

/** J3.L01-style code step: keep the left-hand voicings near A4 so they alternate (`.anchor("a4")`). */
export const ANCHOR_STEP = step({
  lessonId: "J3.L01",
  id: "J3.L01/S5",
  kind: "modify",
  exerciseRef: "J3.L01/keep-them-close",
  prompt: "The voicings jump at bar 3. Keep every chord's top near the same place so the shapes alternate.",
  starterCode: 'chords: chord("<Dm7 G7 C^7>").dict("lefthand").voicing().s("piano")',
  hints: [
    "Where is the highest note of each chord now?",
    "One method sets the note the voicings stay near.",
    "Pick a note above middle C, between the tops of bars 1 and 2.",
    'chords: chord("<Dm7 G7 C^7>").dict("lefthand").anchor("a4").voicing().s("piano")',
  ],
  solutions: ['chords: chord("<Dm7 G7 C^7>").dict("lefthand").anchor("a4").voicing().s("piano")'],
  key: "C major",
});

export const W7_STEPS = [
  JAZZ_CHORD_STEP,
  VOICING_STEP,
  SWING_STEP,
  MICRO_STEP,
  CLAVE_STEP,
  TENSION_STEP,
  GROUPING_STEP,
  EUCLID_STEP,
  SOUND_STEP,
  SWING_CODE_STEP,
  EUCLID_CODE_STEP,
  ANCHOR_STEP,
] as const;

/** What the learner has answered on each step: wrong, so there is something to hint about. */
export const W7_LEARNER: Record<string, string> = {
  [JAZZ_CHORD_STEP.id]: "Fmaj7",
  [VOICING_STEP.id]: "drop-2",
  [SWING_STEP.id]: "Light swing (3:2)",
  [MICRO_STEP.id]: "On the beat",
  [CLAVE_STEP.id]: "Son clave, 3-2",
  [TENSION_STEP.id]: "The 9th",
  [GROUPING_STEP.id]: "3+2+2",
  [EUCLID_STEP.id]: "(3,8)",
  [SOUND_STEP.id]: "Brighter",
  [SWING_CODE_STEP.id]: 'hats: s("hh*8").swingBy(.2, 4).gain(.6)',
  [EUCLID_CODE_STEP.id]: 'perc: s("rim(2,8)")',
  [ANCHOR_STEP.id]: 'chords: chord("<Dm7 G7 C^7>").dict("lefthand").anchor("c5").voicing().s("piano")',
};

/** What a model would write if it ignored the rules: the answer in words, tokens and other spellings. */
export const W7_LEAKY_TEXT: Record<string, string[]> = {
  [JAZZ_CHORD_STEP.id]: ["It is a D–", "7, also written Dmin7 or ", "[[chord:Dm7]]."],
  [VOICING_STEP.id]: ["Play it rootless", " A: the 3rd at the bottom", ", F A C E."],
  [SWING_STEP.id]: ["That is triplet ", "swing: the pairs are 2:", "1."],
  [MICRO_STEP.id]: ["The snare is laid ", "back, a little behind", " the hats."],
  [CLAVE_STEP.id]: ["It is son clave", ", 2-3: the two side ", "comes first."],
  [TENSION_STEP.id]: ["The held note is the sharp ", "11, written ♯11", " in a symbol."],
  [GROUPING_STEP.id]: ["Count it 2+2", "+3: two, two, ", "three."],
  [EUCLID_STEP.id]: ["It is (5,8", "): five hits over eight", " steps, the cinquillo."],
  [SOUND_STEP.id]: ["The second one is ", "darker", "."],
  [SWING_CODE_STEP.id]: ["Add .swingBy(1/3", ", 4): a 2:1 ", "triplet swing."],
  [EUCLID_CODE_STEP.id]: ["Use rim(3,8", "), the tresillo: 3 hits", " over 8."],
  [ANCHOR_STEP.id]: ['Add .anchor("a', '4") before voicing(),', " anchor a4."],
};

/** A leaky card per step: its code or explanation spells out the answer. */
export const W7_LEAKY_CARD: Record<string, { code: string; explanation: string }> = {
  [JAZZ_CHORD_STEP.id]: { code: 'chords: chord("Dm7").voicing().s("piano")', explanation: "D–7: D F A C." },
  [VOICING_STEP.id]: {
    code: 'chords: note("[f3,a3,c4,e4]").s("piano")',
    explanation: "A rootless A voicing: 3rd at the bottom.",
  },
  [SWING_STEP.id]: { code: 'drums: s("rd*8").swingBy(1/3, 4)', explanation: "Triplet swing, 2:1." },
  [MICRO_STEP.id]: { code: 'snare: s("~ sd ~ sd").late(.01)', explanation: "Laid back: behind the hats." },
  [CLAVE_STEP.id]: {
    code: 'perc: s("<[~ ~ rim ~ rim ~ ~ ~] [rim ~ ~ rim ~ ~ rim ~]>")',
    explanation: "Son clave, 2-3.",
  },
  [TENSION_STEP.id]: { code: 'mel: note("f#4").s("piano")', explanation: "The ♯11 over C7." },
  [GROUPING_STEP.id]: { code: 'drums: s("bd ~ bd ~ bd ~ ~")', explanation: "Groups of 2+2+3." },
  [EUCLID_STEP.id]: { code: 'perc: s("cb(5,8)")', explanation: "(5,8): the cinquillo." },
  [SOUND_STEP.id]: {
    code: 'pad: note("c4").lpf(400).s("sawtooth")',
    explanation: "Darker: the lpf cuts the top.",
  },
  [SWING_CODE_STEP.id]: {
    code: 'hats: s("hh*8").swingBy(1/3, 4).gain(.6)',
    explanation: "Swing the eighths.",
  },
  [EUCLID_CODE_STEP.id]: { code: 'perc: s("rim(3,8)")', explanation: "Three over eight." },
  [ANCHOR_STEP.id]: {
    code: 'chords: chord("<Dm7 G7 C^7>").dict("lefthand").anchor("a4").voicing().s("piano")',
    explanation: "Anchor them near A4.",
  },
};

/** The checker's findings on a wrong answer of each step; the first issue's expected value is the answer. */
export function w7GradeFor(s: StepSource): GradeSnapshot {
  const expected: Record<string, [number, string, string]> = {
    [JAZZ_CHORD_STEP.id]: [1, "Dm7", "Fmaj7"],
    [VOICING_STEP.id]: [1, "rootless-a", "drop-2"],
    [SWING_STEP.id]: [1, "Triplet swing (2:1)", "Light swing (3:2)"],
    [MICRO_STEP.id]: [2, "Behind: it leans back, a hair late", "On the beat"],
    [CLAVE_STEP.id]: [1, "Son clave, 2-3", "Son clave, 3-2"],
    [TENSION_STEP.id]: [2, "The ♯11", "The 9th"],
    [GROUPING_STEP.id]: [1, "2+2+3", "3+2+2"],
    [EUCLID_STEP.id]: [1, "(5,8)", "(3,8)"],
    [SOUND_STEP.id]: [1, "Darker", "Brighter"],
    [SWING_CODE_STEP.id]: [1, ".swingBy(1/3, 4)", ".swingBy(.2, 4)"],
    [EUCLID_CODE_STEP.id]: [1, "rim(3,8)", "rim(2,8)"],
    [ANCHOR_STEP.id]: [3, '.anchor("a4")', '.anchor("c5")'],
  };
  const [bar, exp, got] = expected[s.id] ?? [1, "", ""];
  return {
    status: "fail",
    score: 0.5,
    dims: { answer: 0.5 },
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

// --- the eight track capstones -------------------------------------------------------------------------------------

export const JC1_CODE = `setcpm(72/4)

const changes = "<Dm7 G7 C^7 C^7 Fm7 Bb7 Eb^7 Eb^7 Bm7b5 E7 Am7 Am7 Dm7 G7 C^7 C^7>"

chords: note("<[d3,f3,c4] [g2,f3,b3] [c3,e3,b3] [c3,e3,b3] [f2,ab2,eb3] [bb2,ab3,d4] [eb3,g3,d4] [eb3,g3,d4] [b2,d3,f3,a3] [e3,g#3,d4] [a2,c3,g3] [a2,c3,g3] [d3,f3,c4] [g2,f3,b3] [c3,e3,b3] [c3,e3,b3]>").s("piano")
bass: chord(changes).rootNotes(2).s("upright")
mel: note("<[f4@3 a4] [f4@2 d4 b3] [e4@3 g4] e4 [ab4@3 c5] [ab4@2 f4 d4] [g4@3 bb4] g4 [d5@3 c5] [b4@2 g#4 e4] [c5@3 a4] c5 [f4@3 a4] [f4@2 d4 b3] e4@2 ~>").s("vibes")
drums: s("rd*4, ~ hh ~ hh").swingBy(1/3, 4).gain(.5)`;

export const JC2_CODE = `setcpm(132/4)

const changes = "<F7 Bb7 F7 [Cm7 F7] Bb7 Bo7 F7 D7 Gm7 C7 [F7 D7] [Gm7 C7]>"

drums: s("rd*4, ~ hh ~ hh").swingBy(1/3, 4).gain(.6)
chords: chord(changes).voicing().s("piano")
bass: note("<[f2 a2 c3 b2] [bb2 c3 d3 e3] [f3 e3 eb3 d3] [c3 eb3 f3 a2] [bb2 d3 f3 c3] [d3 b2 ab2 g2] [f2 a2 c3 c#3] [d3 f#3 a3 e3] [g2 bb2 d3 b2] [c3 e3 g3 e3] [f3 a3 d3 f#3] [g3 bb3 c3 e3]>").s("upright")
mel: note("<[c5 ~ a4 c5] [d5@2 ~ ab4] [c5@3 ~] [~ eb5 d5 c5] [d5 ~ f5 d5] [ab4@2 b4 d5] [c5@3 ~] [~ a4 c5 f#5] [g5@2 f5 d5] [e5 ~ c5 bb4] [a4@2 f#4 a4] [bb4 g4 e4 ~]>").s("mutetpt").swingBy(1/3, 4)`;

// The A section of rhythm changes in B♭ and the bridge (contracts §2.6 J4.L03: 32 bars, AABA), as a contrafact.
export const JC3_CODE = `setcpm(160/4)

const changesA = "<[Bb^7 G7] [Cm7 F7] [Dm7 G7] [Cm7 F7] [Fm7 Bb7] [Eb^7 Ab7] [Dm7 G7] [Cm7 F7]>"
const changesB = "<D7 D7 G7 G7 C7 C7 F7 F7>"

const chordsA = chord(changesA).voicing().s("piano")
const chordsB = chord(changesB).voicing().s("piano")
const bassA = chord(changesA).rootNotes(2).struct("x*4").s("upright")
const bassB = chord(changesB).rootNotes(2).struct("x*4").s("upright")
const melA = note("<[f4 g4 bb4 d5] [c5@2 ~ a4] [f4 g4 bb4 d5] [c5@3 ~] [ab4 bb4 c5 eb5] [d5@2 ~ c5] [b4 c5 d5 f5] [eb5@3 ~]>").s("vibes")
const melB = note("<[f#4 a4 c5 a4] [f#4@3 ~] [f4 g4 b4 d5] [f5@3 ~] [e4 g4 bb4 g4] [e4@3 ~] [eb4 f4 a4 c5] [eb5@3 ~]>").s("vibes")

drums: s("rd*4, ~ hh ~ hh").swingBy(1/3, 4).gain(.6)
chords: arrange([8, chordsA], [8, chordsA], [8, chordsB], [8, chordsA])
bass: arrange([8, bassA], [8, bassA], [8, bassB], [8, bassA])
mel: arrange([8, melA], [8, melA], [8, melB], [8, melA])`;

// A newly written eight-bar tune in C (a stand-in for the learner's standard), reharmonised under the same melody.
export const JC4_TUNE = `note("<[e4@2 g4@2] [a4@2 e4@2] [f4@2 a4@2] [g4@3 ~] [e4@2 c5@2] [a4@2 c5@2] [d5@2 f4@2] [e4@3 ~]>")`;
export const JC4_ORIGINAL = ["C^7", "Am7", "Dm7", "G7", "C^7", "Am7", "Dm7", "G7"];
export const JC4_CODE = `setcpm(84/4)

const changes = "<C^7 [Em7 A7] Dm7 Db7 C^7 C#o7 [Dm7 Bb7] C^7>"

drums: s("rd*4, ~ hh ~ hh").swingBy(1/3, 4).gain(.5)
chords: chord(changes).voicing().s("piano")
bass: chord(changes).rootNotes(2).s("upright")
mel: ${JC4_TUNE}.s("vibes")`;

export const RC1_CODE = `setcpm(96/4)

kick: s("bd ~ ~ ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ ~ ~")
snare: s("~ ~ ~ ~ sd ~ ~ sd ~ sd ~ ~ sd ~ ~ ~").velocity("0 0 0 0 1 0 0 .3 0 .3 0 0 1 0 0 0").late(.006)
hats: s("hh*16").velocity("1 .4 .7 .4 1 .4 .7 .4 1 .4 .7 .4 1 .4 .7 .4")
bass: note("e2 ~ e2 e3 ~ ~ g2 ~ a2 ~ a2 b2 ~ d3 ~ ~").s("bass")
clav: note("[e4,g4,b4]").struct("~ x ~ ~ ~ x ~ x ~ ~ ~ x ~ ~ x ~").s("clav")`;

export const RC2_CODE = `setcpm(100/4)

perc: s("<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~] [rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~] [rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~] [~ ~ rim ~ rim ~ ~ ~] [rim ~ ~ rim ~ ~ rim ~]>")
kick: s("bd*2")
perc2: s("lt*3")
perc3: s("cb(5,16,2)")
bass: note("<[~ ~ ~ c3 ~ ~ g2 ~] [~ ~ ~ g2 ~ ~ c3 ~]>").s("bass")
keys: note("<[c4,e4,g4]>").struct("<[x ~ ~ x ~ ~ x ~] [~ ~ x ~ x ~ ~ x]>").s("piano")`;

export const AC1_TUNE = `note("<[a4@2 c5 a4] [g4@2 f4@2] [a4 c5 d5 c5] [a4@4] [bb4@2 d5 bb4] [a4@2 g4@2] [e4 g4 c5 bb4] [a4@4]>")`;
export const AC1_A_CODE = `setcpm(120/4)

drums: s("rd*4, ~ hh ~ hh").swingBy(1/3, 4).gain(.6)
chords: chord("<F^7 Dm7 Gm7 C7 Bb^7 F^7 Gm7 C7>").voicing().struct("x ~ ~ x ~ ~ ~ ~").s("piano")
bass: chord("<F^7 Dm7 Gm7 C7 Bb^7 F^7 Gm7 C7>").rootNotes(2).struct("x*4").s("upright")
mel: ${AC1_TUNE}.swingBy(1/3, 4).s("mutetpt")`;
export const AC1_B_CODE = `setcpm(140/4)

perc: s("rim(3,8)")
kick: s("bd ~ ~ bd bd ~ ~ bd")
chords: chord("<F^7 Dm7 Gm7 C7 Bb^7 F^7 Gm7 C7>").voicing().struct("x ~ x ~ ~ x ~ x").s("gtr")
bass: chord("<F^7 Dm7 Gm7 C7 Bb^7 F^7 Gm7 C7>").rootNotes(2).struct("x ~ ~ x x ~ ~ ~").s("bass")
mel: ${AC1_TUNE}.s("flute")`;

export const AC2_CODE = `setcpm(72/4)

drums: s("bd ~ ~ ~ ~ ~ ~ ~ ~ ~ bd ~ ~ ~ ~ ~, ~ ~ ~ ~ sd ~ ~ ~ ~ ~ ~ ~ sd ~ ~ ~")
hats: s("hh*16").velocity("1 .5 .8 .5").swingBy(.2, 8).gain(.6)
chords: note("<[f#3,a3,c#4,e4] [g3,b3,d4,f#4] [f#2,a2,e3,a3] [a3,c#4,d4,f#4]>").late(.006).s("rhodes")
bass: note("<d2 e2 f#2 b1>").s("bass")
mel: note("<[a4@3 b4] [d5@2 ~ c#5] [a4@4] [f#4@2 e4 d4]>").s("vibes")
pad: note("<[d4,a4] [e4,b4] [f#4,c#5] [d4,b4]>").gain(.02).s("pad")`;

const PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
export const midiOf = (n: string): number => {
  const m = /^([a-g])(b|#)?(\d)$/.exec(n) as RegExpExecArray;
  return (
    12 * (Number(m[3]) + 1) + (PC[m[1] as string] as number) + (m[2] === "b" ? -1 : m[2] === "#" ? 1 : 0)
  );
};
/** JC3: a stand-in model head (not I Got Rhythm): its first A bar is the learner's bar 1, every other bar differs. */
export const JC3_MODEL_BARS = {
  A: ["f4 g4 bb4 d5", "bb4", "c5", "bb4", "ab4", "g4", "f4", "bb4"],
  B: ["a4", "a4", "b4", "b4", "g4", "g4", "a4", "a4"],
};
export const JC3_MODEL: { onset: [number, number]; midi: number }[] = [];
[...JC3_MODEL_BARS.A, ...JC3_MODEL_BARS.A, ...JC3_MODEL_BARS.B, ...JC3_MODEL_BARS.A].forEach((bar, b) => {
  const xs = bar.split(" ");
  xs.forEach((x, i) => {
    JC3_MODEL.push({ onset: [b * xs.length + i, xs.length], midi: midiOf(x) });
  });
});
export const JC3_CHANGES = [
  ...["Bb^7", "Cm7", "Dm7", "Cm7", "Fm7", "Eb^7", "Dm7", "Cm7"],
  ...["Bb^7", "Cm7", "Dm7", "Cm7", "Fm7", "Eb^7", "Dm7", "Cm7"],
  ...["D7", "D7", "G7", "G7", "C7", "C7", "F7", "F7"],
  ...["Bb^7", "Cm7", "Dm7", "Cm7", "Fm7", "Eb^7", "Dm7", "Cm7"],
];
/** JC4: the tune's notes as `reharmView` reads the original melody (onset in cycles, MIDI). */
export const JC4_MELODY: { onset: [number, number]; midi: number }[] = [];
for (const [b, bar] of [
  "e4@2 g4@2",
  "a4@2 e4@2",
  "f4@2 a4@2",
  "g4@3",
  "e4@2 c5@2",
  "a4@2 c5@2",
  "d5@2 f4@2",
  "e4@3",
].entries()) {
  let t = 0;
  for (const x of bar.split(" ")) {
    const [n, w] = x.split("@") as [string, string];
    JC4_MELODY.push({ onset: [b * 4 + t, 4], midi: midiOf(n) });
    t += Number(w);
  }
}

/** The analysed facts of each piece (wave7.music.test.ts re-derives the Wave 7 part of each from its code). */
const F = FACTS as unknown as Record<
  "JC1" | "JC2" | "JC3" | "JC4" | "RC1" | "RC2" | "AC1a" | "AC1b" | "AC2",
  ReviewFacts
>;
export const JC1_FACTS = F.JC1;
export const JC2_FACTS = F.JC2;
export const JC3_FACTS = F.JC3;
export const JC4_FACTS = F.JC4;
export const RC1_FACTS = F.RC1;
export const RC2_FACTS = F.RC2;
export const AC1A_FACTS = F.AC1a;
export const AC1B_FACTS = F.AC1b;
export const AC2_FACTS = F.AC2;
/** `compareIdioms` of AC1's two versions (the tune kept; what the idioms change). */
export const AC1_COMPARED = (FACTS as unknown as { AC1_compare: { sameTune: boolean; axes: string[] } })
  .AC1_compare;

const source = (
  title: string,
  code: string,
  facts: ReviewFacts | null,
  over: Partial<ReviewSource> = {},
): ReviewSource => ({
  title,
  code,
  brief: "",
  analysis: facts ? `${facts.bars} bars in ${facts.key}.` : "",
  rubric: [],
  learnerNote: null,
  checklist: [],
  reference: null,
  totalBars: facts?.bars ?? null,
  revisions: 2,
  facts,
  ...over,
});

/** JC1 "ii–V Ballad": 16 bars of chained ii–Vs into C, E♭ and A minor, shells, a guide-tone melody. */
export const JC1_SOURCE = source("Three Rooms", JC1_CODE, JC1_FACTS, {
  brief:
    "A 16-bar ballad over chained ii–Vs that reach at least three keys, with a melody built on guide tones.",
});
export const JC1_REVIEW: CapstoneReview = {
  strengths: [
    {
      text: "Bars 1-8 chain two ii–Vs: [[chord:Dm7]] [[chord:G7]] land on C in bar 3, then [[chord:Fm7]] [[chord:Bb7]] land on E♭ in bar 7, while the guide-tone line steps down from F through E and E♭ to D.",
      bars: [1, 8],
    },
    {
      text: "In bar 9 the shells open into a close [[chord:Bm7b5]], and [[chord:E7]] lands on [[chord:Am7]] in bar 11: the third key arrives on its own home chord.",
      bars: [9, 11],
    },
  ],
  revisions: [
    {
      title: "Lift the low 3rd in bars 11-12",
      bars: [11, 12],
      why: "In bars 11 and 12 A2 and C3 sound 3 half steps apart, too close that low, so the chord blurs under the tune. Moving the 3rd up an octave keeps the shell clear.",
      tryCode: 'chords: note("<[a2,g3,c4] [a2,g3,c4]>").s("piano")',
      skills: ["J08"],
    },
    {
      title: "Let bar 9's C pass, not hold",
      bars: [9, 9],
      why: "Bar 9 holds C over [[chord:Bm7b5]], a half step above the chord's root: an avoid note held on the beat. Starting on D, the chord's 3rd, and passing through C keeps the colour without the clash.",
      tryCode: 'mel: note("<[d5@2 c5 b4]>").s("vibes")',
      skills: ["J07"],
    },
  ],
  listeningQuestion:
    "When the ii–V in bar 5 turns toward E♭, does the tune's A♭ make the new key arrive before the bass?",
  linerNote:
    "A slow ballad that moves through three keys on chained ii–Vs, its tune tracing the 3rds and 7ths of each chord on vibraphone.",
};

/** JC2 "Jazz Blues in F": one chorus with a hand-walked bass and a muted-trumpet head. */
export const JC2_SOURCE = source("Blue Tuesday", JC2_CODE, JC2_FACTS, {
  brief: "A jazz blues in F: two choruses, a walking bass, comping and a head.",
});
export const JC2_REVIEW: CapstoneReview = {
  strengths: [
    {
      text: "The walking bass keeps a note on every beat for twelve bars and steps into most new chords by a half step, as from bar 1 into bar 2 and from bar 7 into bar 8.",
      bars: [1, 8],
    },
    {
      text: "[[chord:Cm7]] [[chord:F7]] in bar 4 is a ii–V into [[chord:Bb7]], so bar 5 arrives like a new home for a moment.",
      bars: [4, 5],
    },
  ],
  revisions: [
    {
      title: "Put the root back on beat 1",
      bars: [6, 6],
      why: "Bar 6 starts on D, not B, so [[chord:Bo7]] arrives without its root on beat 1 and the passing chord blurs. Start the bar on B and keep A♭ on beat 3.",
      tryCode: 'bass: note("<[b2 d3 ab2 g2]>").s("upright")',
      skills: ["J11"],
    },
    {
      title: "Step into bar 9",
      bars: [8, 9],
      why: "Beat 4 of bar 8 leaps 9 half steps down to the G of bar 9. A note a step away leads into [[chord:Gm7]] the way the other bars lead into theirs.",
      tryCode: 'bass: note("<[d3 f#3 a3 a2] [g2 bb2 d3 b2]>").s("upright")',
      skills: ["J11"],
    },
  ],
  listeningQuestion:
    "In bar 11 the chords change twice: does the bass still sound as if it walks toward bar 12?",
  linerNote: "A jazz blues in F with a bass that walks every beat and a muted trumpet answering the chords.",
};

/** JC3 "Rhythm-Changes Contrafact": 32 bars, AABA, a new head over the changes. */
export const JC3_SOURCE = source("Second Story", JC3_CODE, JC3_FACTS, {
  brief: "A contrafact on rhythm changes: the 32-bar AABA changes, a new head of your own.",
});
export const JC3_REVIEW: CapstoneReview = {
  strengths: [
    {
      text: "The head is new: it repeats the model's head only in bars 1, 9 and 25, while the model's changes stay in every bar. That is what makes it a contrafact.",
      bars: [1, 32],
    },
    {
      text: "The bridge's dominants hold two bars each, [[chord:D7]] down to [[chord:F7]], and the head turns with every one of them in bars 17-24.",
      bars: [17, 24],
    },
  ],
  revisions: [
    {
      title: "Walk into each chord",
      bars: [1, 8],
      why: "The bass plays the root on every beat, so beat 4 leaps into each new chord, by 7 half steps in bars 1 and 3. A step or a half step on beat 4 would make it walk.",
      tryCode: 'bass: note("<[bb2 d3 f3 b2] [c3 eb3 f3 e3]>").s("upright")',
      skills: ["J12"],
    },
    {
      title: "Move bar 5's E♭ off the beat",
      bars: [5, 5],
      why: "Bar 5 lands on E♭ over [[chord:Bb7]] on the beat: the 11, a half step above the chord's 3rd, held where it clashes. D, the 3rd, on that beat keeps the line.",
      tryCode: 'mel: note("<[ab4 bb4 c5 d5]>").s("vibes")',
      skills: ["J12"],
    },
  ],
  listeningQuestion: "In bars 17 to 24, does the head make each dominant sound as if it is going somewhere?",
  linerNote:
    "A contrafact on rhythm changes in B♭: the borrowed changes in all 32 bars under a new vibraphone head.",
};

/** JC4 "Reharmonize a Standard": a tune in C kept note for note under new chords. */
export const JC4_SOURCE = source("New Coat", JC4_CODE, JC4_FACTS, {
  brief: "Reharmonise a standard with at least three different devices; the melody stays untouched.",
});
export const JC4_REVIEW: CapstoneReview = {
  strengths: [
    {
      text: "Three different devices, each in its own bar: a secondary ii–V in bar 2, a tritone substitution in bar 4 and a passing diminished chord in bar 6, with the tune kept note for note.",
      bars: [2, 6],
    },
    {
      text: "[[chord:Db7]] in bar 4 slides down a half step into [[chord:C^7]] in bar 5: the bass moves by step where the original's G7 would have leapt.",
      bars: [4, 5],
    },
  ],
  revisions: [
    {
      title: "Make bar 7 a backdoor",
      bars: [7, 8],
      why: "Bar 7 moves from [[chord:Dm7]] to [[chord:Bb7]], but no device is counted there. [[chord:Fm7]] before the [[chord:Bb7]] would make it the backdoor home to C.",
      tryCode: 'chords: chord("<[Fm7 Bb7] C^7>").voicing().s("piano")',
      skills: ["J13"],
    },
    {
      title: "Aim bar 2's ii–V at a minor chord",
      bars: [2, 3],
      why: "The ii–V in bar 2 aims at D major but lands on [[chord:Dm7]], a minor chord. [[chord:Em7b5]] [[chord:A7]] aims at D minor, so bar 3 sounds like the home it leads to.",
      tryCode: 'chords: chord("<C^7 [Em7b5 A7] Dm7 Db7>").voicing().s("piano")',
      skills: ["J14"],
    },
  ],
  listeningQuestion: "Over the diminished chord in bar 6, does the tune's A still sound like the same tune?",
  linerNote:
    "An old-fashioned tune in C, kept note for note under new chords: a secondary ii–V, a tritone substitution and a passing diminished chord.",
};

/** RC1 "16th-Note Funk": an E-minor groove with ghost notes and a laid-back snare. */
export const RC1_SOURCE = source("Tight Spot", RC1_CODE, RC1_FACTS, {
  brief: "A 16th-note funk groove: ghost notes, a syncopated bass, the one on bass and kick, stabs.",
});
export const RC1_REVIEW: CapstoneReview = {
  strengths: [
    {
      text: "The snare sits 15 ms behind the grid, a laid-back backbeat, while hats, bass and clav stay on it: the groove leans without dragging.",
      bars: [1, 4],
    },
    {
      text: "Eight ghost notes on the snare fill the gaps between its accents across bars 1-4, so the 16ths keep moving under the clav.",
      bars: [1, 4],
    },
  ],
  revisions: [
    {
      title: "Let the hats breathe",
      bars: [1, 4],
      why: "The hats play all sixteen 16ths only 3 dB under the loudest part, so they cover the snare's ghost notes. Playing them quieter opens the gaps the ghosts sit in.",
      tryCode: 'hats: s("hh*16").velocity("1 .4 .7 .4").gain(.5)',
      skills: ["R14"],
    },
    {
      title: "Give the clav quieter stabs",
      bars: [1, 4],
      why: "Every clav stab plays at the same level. Two quieter stabs between the accented ones would answer the snare's ghost notes.",
      tryCode:
        'clav: note("[e4,g4,b4]").struct("~ x ~ ~ ~ x ~ x ~ ~ ~ x ~ ~ x ~").velocity("1 1 .3 1 .3 1").s("clav")',
      skills: ["R14"],
    },
  ],
  listeningQuestion:
    "With the snare a hair behind, does the hi-hat feel as if it pushes ahead or just keeps time?",
  linerNote:
    "A tight E-minor funk groove: a laid-back snare full of ghost notes, a syncopated bass and clav stabs.",
};

/** RC2 "Clave & Polyrhythm": a son groove in C, three against two on the toms. */
export const RC2_SOURCE = source("Two Sides", RC2_CODE, RC2_FACTS, {
  brief:
    "A groove over a clave held for 8 bars or more, with a tresillo bass, a polyrhythm and a Euclidean part.",
});
export const RC2_REVIEW: CapstoneReview = {
  strengths: [
    {
      text: "The keys meet five clave strokes in every two-bar window as the clave is written: the montuno faces the clave all the way through.",
      bars: [1, 8],
    },
    {
      text: "Three against two sounds in all eight bars, the low tom against the kick, the two meeting on every downbeat.",
      bars: [1, 8],
    },
  ],
  revisions: [
    {
      title: "Keep the clave's direction in bars 7-8",
      bars: [7, 8],
      why: "The clave holds son 3-2 for six bars, then bars 7 and 8 start with the two side. Ending on the three side keeps every window facing the same way.",
      tryCode: 'perc: s("<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>")',
      skills: ["R18"],
    },
    {
      title: "Let the bass take a side",
      bars: [2, 2],
      why: "The bass meets as many strokes crossed as written in every window. Playing the even bars' two notes with the clave's two side, on beats 2 and 3, would tip it toward the clave as written.",
      tryCode: 'bass: note("<[~ ~ ~ c3 ~ ~ g2 ~] [~ ~ g2 ~ c3 ~ ~ ~]>").s("bass")',
      skills: ["R18"],
    },
  ],
  listeningQuestion:
    "When the clave turns around in bar 7, does the montuno still sound as if it lines up with it?",
  linerNote:
    "A son groove in C: clave, montuno and tumbao, with three against two on the toms and a Euclidean cowbell.",
};

/** AC1 "One Tune, Two Genres": the same tune as Swing (a) and Bossa (b). */
export const AC1_SOURCE: ReviewSource = source("One Song, Two Rooms", AC1_A_CODE, null, {
  brief: "The same tune in two genres: what changes and what stays.",
  totalBars: 8,
  versions: [
    { id: "a", label: "Swing", code: AC1_A_CODE, facts: AC1A_FACTS },
    { id: "b", label: "Bossa", code: AC1_B_CODE, facts: AC1B_FACTS },
  ],
  versionsCompared: AC1_COMPARED,
});
export const AC1_REVIEW: CapstoneReview = {
  strengths: [
    {
      text: "Swing and Bossa keep the same tune note for note; the sounds, the density and the groove change around it, so the melody reads as one song in two rooms.",
      bars: [1, 8],
    },
    {
      text: "In Bossa every bass note lands with the kick, a lock the Swing version never asks for: the groove sits on the floor while the tune floats.",
      bars: [1, 8],
    },
  ],
  revisions: [
    {
      title: "Bossa: leave room around the tune",
      bars: [4, 8],
      why: "Bossa plays 7 onsets a bar against Swing's 5, and its guitar strikes four times in every bar. Two strikes in bars 4 and 8, where the tune holds, would let the long notes ring.",
      tryCode:
        'chords: chord("<F^7 Dm7 Gm7 C7 Bb^7 F^7 Gm7 C7>").voicing().struct("<[x ~ x ~ ~ x ~ x]!3 [x ~ ~ ~ x ~ ~ ~]>").s("gtr")',
      skills: ["D09"],
    },
    {
      title: "Swing: let the bass move",
      bars: [1, 4],
      why: "In Swing the bass repeats each chord's root on every beat. Moving from one root to the next by step, with a half step into each chord, would carry the tune forward the way the ride does.",
      tryCode: 'bass: note("<[f2 a2 c3 c#3] [d3 c3 a2 f#2] [g2 bb2 d3 b2] [c3 bb2 g2 e2]>").s("upright")',
      skills: ["D09"],
    },
  ],
  listeningQuestion:
    "Switching from Swing to Bossa, does the tune sound like the same song or like a cousin?",
  linerNote:
    "One tune in F, twice: a swinging club version with ride and muted trumpet, and a bossa with rim, guitar and flute.",
};

/** AC2 "Neo-Soul Ballad": rootless rhodes chords in D, laid back against a swung hi-hat. */
export const AC2_SOURCE = source("Low Light", AC2_CODE, AC2_FACTS, {
  brief: "A neo-soul ballad: hand-voiced extended chords, 16th swing, a laid-back feel.",
});
export const AC2_REVIEW: CapstoneReview = {
  strengths: [
    {
      text: "The rhodes sits 20 ms behind the grid while the hats swing their 16ths: the chords lean back against a groove that keeps moving.",
      bars: [1, 4],
    },
    {
      text: "Bars 1 and 2 are rootless A voicings and bar 4 a rootless B, so the bass alone carries the roots and the rhodes stays in the middle.",
      bars: [1, 4],
    },
  ],
  revisions: [
    {
      title: "Lift bar 3's low 3rd",
      bars: [3, 4],
      why: "In bar 3 F♯2 and A2 sound 3 half steps apart, too close that low, and the laid-back chord rings into bar 4. A rootless voicing from A3 up keeps the low end clear.",
      tryCode:
        'chords: note("<[f#3,a3,c#4,e4] [g3,b3,d4,f#4] [a3,c#4,e4,g#4] [a3,c#4,d4,f#4]>").late(.006).s("rhodes")',
      skills: ["J09"],
    },
    {
      title: "Bring the pad up, or let it go",
      bars: [1, 4],
      why: "The pad sits 32 dB under the loudest part, more than 24 dB under it, so it is not heard. Raise it until it joins the chords, or leave it out.",
      tryCode: 'pad: note("<[d4,a4] [e4,b4] [f#4,c#5] [d4,b4]>").gain(.25).s("pad")',
      skills: ["D10"],
    },
  ],
  listeningQuestion: "Does the rhodes sound relaxed behind the beat, or simply late?",
  linerNote:
    "A neo-soul ballad in D: rootless rhodes chords leaning 20 ms behind a swung hi-hat, under a vibraphone tune.",
};

export const W7_CAPSTONES = [
  { id: "JC1", source: JC1_SOURCE, review: JC1_REVIEW },
  { id: "JC2", source: JC2_SOURCE, review: JC2_REVIEW },
  { id: "JC3", source: JC3_SOURCE, review: JC3_REVIEW },
  { id: "JC4", source: JC4_SOURCE, review: JC4_REVIEW },
  { id: "RC1", source: RC1_SOURCE, review: RC1_REVIEW },
  { id: "RC2", source: RC2_SOURCE, review: RC2_REVIEW },
  { id: "AC1", source: AC1_SOURCE, review: AC1_REVIEW },
  { id: "AC2", source: AC2_SOURCE, review: AC2_REVIEW },
] as const;
