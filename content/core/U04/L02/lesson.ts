// U04.L02 Major, Minor, Perfect. Two 3rds can differ in size: C up to E is four half steps, E up to G three.
// The count of degrees names the interval's number; the count of half steps names its quality (major, minor,
// perfect). In code the name is a string for `.transpose()`: `"3M"` (a major 3rd up), `"5P"`, `"6M"`. A
// named move is a fixed number of half steps, so the harmony lines are written in note names (`.transpose()`
// after `.scale()` is a key change to the lint). The tritone (6 half steps) waits for U04.L03; augmented and
// diminished as words for U05.L03. Spec: content/specs/U04.md.
import { defineLesson, type HintLadder } from "@oak/content-kit";

const BPM = 92;
const TEMPO = `setcpm(${BPM}/4)\n\n`;
const notes = (label: string, pattern: string, link = "", extra = "") =>
  `${label}: note("${pattern}")${link}.s("piano")${extra}`;

const ladder = (nudge: string, pointer: string, partial: string): HintLadder => [
  { text: nudge },
  { text: pointer },
  { text: partial },
  "auto",
];

/** The hook: a riff doubled a perfect 5th above. Over the vamp (C, then F) every copy fits the chords. */
const HOOK_RIFF = "<[c4 e4 g4 e4] [f4 d4 c4 ~]>";
const HOOK = `${TEMPO}${notes("mel", HOOK_RIFF)}\n${notes("vox", HOOK_RIFF, '.transpose("5P")', ".gain(.6)")}`;

/** Two 3rds, one bar each: C up to E (4 half steps), then E up to G (3). */
const TWO_THIRDS = `${TEMPO}${notes("mel", "<[c4 ~ e4 ~] [e4 ~ g4 ~]>")}`;
/** The concept card: a major 3rd, a minor 3rd, a perfect 5th and the octave, all from C. */
const FROM_C = `${TEMPO}${notes("mel", "<[c4 ~ e4 ~] [c4 ~ eb4 ~] [c4 ~ g4 ~] [c4 ~ c5 ~]>")}`;

/**
 * The modify riff uses only C, F and G (degrees 1, 4 and 5): a major 3rd above each of them (E, A, B) is
 * still in C major, so the copy stays in the key.
 */
const RIFF = "<[c4 g4 f4 g4] [c4 ~ f4 g4]>";
const pair = (link: string, voxExtra = ".gain(.6)") =>
  `${TEMPO}${notes("mel", RIFF)}\n${notes("vox", RIFF, link, voxExtra)}`;

/** The Make's riff, also only 1, 4 and 5: a major 3rd, a major 6th or a perfect 5th above keeps it in C. */
const MAKE_RIFF = "<[c4 g4 c4 ~] [f4 g4 f4 ~]>";
const makePair = (link: string, voxExtra = ".gain(.6)") =>
  `${TEMPO}${notes("mel", MAKE_RIFF)}\n${notes("vox", MAKE_RIFF, link, voxExtra)}`;

const BAND = { band: "band.two-chord-vamp" } as const;
const NONE = { roll: false, staff: false, keyboard: false } as const;
const ROLL = { roll: true, staff: false, keyboard: false } as const;
const ROLL_KEYS = { roll: true, staff: false, keyboard: true } as const;
const ROLL_STAFF = { roll: true, staff: "treble", keyboard: false } as const;

export default defineLesson({
  id: "U04.L02",
  version: 1,
  title: "Major, Minor, Perfect",
  objective:
    'I can tell a major interval from a minor one by its half steps, and move a line by a named interval with .transpose("3M").',
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: BPM,
  introduces: ["I02"],
  practises: [],
  terms: [{ id: "term.interval-quality", step: "S4" }],
  canDo: ["cd.read.interval-quality"],
  wrapAt: "S4",
  steps: [
    {
      id: "S1",
      kind: "listen",
      title: "Open and strong",
      minutes: 0.5,
      ui: { panels: ROLL, rollLabels: "degree+solfege", band: BAND },
      example: { id: "hook", code: HOOK, bars: 2 },
      exercise: {
        kind: "listen",
        id: "open-and-strong",
        version: 1,
        role: "practice",
        prompt: 'Press Play. `vox` plays the riff again, a 5th higher. Find `.transpose("5P")` in its line.',
        skills: [{ skill: "I02", w: 1 }],
        hints: null,
        tests: [],
        items: [{ code: HOOK, caption: "A riff and its copy a 5th above, over the band.", bars: 2 }],
      },
    },
    {
      id: "S2",
      kind: "investigate",
      title: "Two kinds of 3rd",
      minutes: 1,
      // Letters on the roll here: the step counts half steps on the keyboard, key by key.
      ui: { panels: ROLL_KEYS, rollLabels: "note" },
      example: { id: "two-thirds", code: TWO_THIRDS, bars: 2 },
      exercise: {
        kind: "run-investigate",
        id: "two-kinds-of-third",
        version: 1,
        role: "practice",
        prompt:
          "C up to E is a 3rd, and so is E up to G: three letters each. Run it, watch the keyboard, and count the half steps inside each one.",
        skills: [{ skill: "I02", w: 1 }],
        feedbackText: {
          "investigate.wrong":
            "Not quite. Count keys on the keyboard, black ones too: every key you move up is one half step.",
        },
        hints: ladder(
          "Do the two bars sound the same distance apart, or is one wider?",
          "Count half steps on the keyboard: every key up is one, black or white. Start counting after the lower note.",
          "C up to E passes C♯, D and D♯ on the way: four half steps. Now count from E.",
        ),
        code: { starter: TWO_THIRDS },
        mustPlayLoops: 1,
        questions: [
          {
            q: "choice",
            prompt: "Which 3rd is wider?",
            options: [
              { id: "c-e", label: "Bar 1: C up to E" },
              { id: "e-g", label: "Bar 2: E up to G" },
              { id: "same", label: "Neither: a 3rd is a 3rd" },
            ],
            correct: ["c-e"],
          },
          { q: "number", prompt: "How many half steps from E up to G?", correct: 3 },
        ],
        tests: [
          { name: "both right", response: { answer: { choice: ["c-e"], number: 3 } }, expect: "pass" },
          {
            name: "every 3rd the same",
            response: { answer: { choice: ["same"], number: 3 } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
          {
            name: "counted the white keys, both ends",
            response: { answer: { choice: ["c-e"], number: 2 } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
        ],
      },
    },
    {
      id: "S3",
      kind: "concept",
      title: "Names for every size",
      minutes: 0.75,
      ui: { panels: ROLL_KEYS, rollLabels: "note" },
      example: { id: "from-c", code: FROM_C, bars: 4 },
    },
    {
      id: "S4",
      kind: "modify",
      title: "Name the distance",
      minutes: 1.25,
      graded: true,
      ui: { panels: ROLL_STAFF, rollLabels: "degree+solfege", staffLabels: "degree+solfege" },
      exercise: {
        kind: "code-modify",
        id: "name-the-distance",
        version: 1,
        role: "check",
        prompt:
          "`vox` follows `mel` four half steps higher, written as a number. Write the same move by its name instead: a string in `.transpose()`. The sound must not change.",
        skills: [
          { skill: "I02", w: 0.8 },
          { skill: "I01", w: 0.2 },
        ],
        code: {
          starter: `${TEMPO}${notes("mel", RIFF)}\n${notes("vox", RIFF, ".transpose(⟪4⟫)", ".gain(.6)")}`,
        },
        reference: { solutions: [pair('.transpose("3M")')], bars: 2 },
        matcher: { m: "events", pitch: "absolute", rhythm: "onsets", durations: false },
        constraints: [{ c: "must-use", tool: "tb.transpose.interval", feedback: "code.must-use" }],
        target: { audible: true, showRoll: true },
        feedbackText: {
          "code.must-use": "Name the distance: a string in quotes inside `.transpose()`, not a number.",
          // Not the learner's note: a minor 3rd or a 4th up from this riff lands outside C major, and the catalog
          // would name it with a chromatic degree and syllable ("b3 (me)") the course has not taught yet.
          "melody.wrong-degree":
            "Bar {bar}, {beatLabel}: four half steps above `mel` is {exp} ({expSyl}), and your note is not it. Check the number and the letter: `M` is major, `m` is minor.",
        },
        hints: ladder(
          "Four half steps up from C: which letter is that, and which of the two 3rds you counted is it?",
          'A name in code is the number, then `M` for major, `m` for minor or `P` for perfect, in quotes: `"5P"` is a perfect 5th.',
          "Four half steps is the wider 3rd, C up to E: a major 3rd. Write its number, then the letter for major.",
        ),
        srs: [{ family: "fam.code.functions", mode: "evidence-only" }],
        tests: [
          { name: "reference", response: { code: pair('.transpose("3M")') }, expect: "pass" },
          {
            name: "the same move, vox softer",
            response: { code: pair('.transpose("3M")', ".gain(.4)") },
            expect: "pass",
          },
          {
            name: "unchanged",
            response: { code: pair(".transpose(4)") },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "a minor 3rd: lowercase m",
            response: { code: pair('.transpose("3m")') },
            expect: "fail",
            feedback: ["melody.wrong-degree"],
          },
          {
            name: "no quality: a bare number in quotes",
            response: { code: pair('.transpose("4")') },
            expect: "fail",
            feedback: ["code.must-use"],
          },
          {
            name: "a perfect 4th",
            response: { code: pair('.transpose("4P")') },
            expect: "fail",
            feedback: ["melody.wrong-degree"],
          },
        ],
      },
    },
    {
      id: "S5",
      kind: "quiz",
      title: "Spell it",
      minutes: 1,
      graded: true,
      ui: { panels: NONE },
      exercise: {
        kind: "identify",
        id: "spell-it",
        version: 1,
        role: "check",
        prompt:
          "Oak names a note and a distance above it. Write the note at the top. Count letters for the number first, then half steps for major or perfect.",
        skills: [{ skill: "I02", w: 1 }],
        hints: ladder(
          "Which letter does the number land on, counting the bottom letter as 1?",
          "The number picks the letter; the half steps pick its sharp or flat. Count the half steps from the bottom note to that letter, then compare with the size you need.",
          "A major 3rd above D: the letter is F, three letters up. D up to F is three half steps, one short of four, so it is F♯.",
        ),
        stimulus: { src: "generator", family: "fam.int.spell", level: 1 },
        cue: { context: "none", countInBars: 0, click: false, replays: -1 },
        answer: { ui: "text", normalize: "note" },
        correct: {},
        srs: [{ family: "fam.int.spell", mode: "seed" }],
        tests: [],
      },
    },
    {
      id: "S6",
      kind: "ear",
      title: "Back to home",
      minutes: 1.25,
      graded: true,
      ui: { panels: NONE },
      exercise: {
        kind: "identify",
        id: "back-to-home",
        version: 1,
        role: "check",
        prompt:
          "Chords set home. Then one note, and a step or a leap down to home. Enter both degrees: the first note, then 1.",
        skills: [{ skill: "E06", w: 1 }],
        hints: [
          { text: "Hum the first note again. Which syllable is it, if the last one is do?" },
          { text: "Sing down from the first note to do on syllables. Each syllable you pass is one degree." },
          { text: "Hear it again, slower, and sing the scale down with it.", replay: { rate: 0.75 } },
          "auto",
        ],
        stimulus: { src: "generator", family: "fam.int.in-key", level: 2 },
        cue: { context: "cadence", countInBars: 0, click: false, replays: 2 },
        answer: {
          ui: "degree-pad",
          set: ["1", "2", "3", "4", "5", "6", "7"],
          sequenceLen: 2,
          syllables: true,
        },
        correct: {},
        srs: [{ family: "fam.int.in-key", mode: "review-if-due" }],
        tests: [],
      },
    },
    {
      id: "S7",
      kind: "make",
      title: "A named harmony",
      minutes: 2.5,
      ui: { panels: ROLL, rollLabels: "degree+solfege", band: BAND },
      exercise: {
        kind: "code-make",
        id: "named-harmony",
        version: 1,
        role: "practice",
        // The catalog's text for a `uses` rule names the tool ID; the label says it in words.
        feedbackText: { "rubric.unmet": "{label}: not yet." },
        prompt:
          'Write a riff and a harmony line that follows it a named distance away, with `.transpose("…")`. Try a 3rd, a 6th or a 5th, and keep the one you like.',
        skills: [{ skill: "I02", w: 1 }],
        code: { starter: makePair(".transpose(7)") },
        bars: [1, 4],
        saveAs: "sketch",
        rubric: [
          {
            id: "named",
            label: "The harmony is moved by a named interval",
            required: true,
            skills: ["I02"],
            rule: "uses",
            tool: "tb.transpose.interval",
          },
          {
            id: "two-voices",
            label: "Two melody lines",
            required: false,
            skills: ["I01"],
            rule: "tracks",
            roles: ["melody"],
            min: 2,
          },
          {
            id: "softer",
            label: "The harmony a little softer, with `.gain()`",
            required: false,
            skills: ["I01"],
            rule: "uses",
            tool: "tb.gain",
          },
        ],
        hints: ladder(
          "How does `vox` say how far it moves now: with a number, or with a name?",
          'A name goes in quotes: the number of the interval, then `M`, `m` or `P`. `"3M"` is a major 3rd.',
          'Seven half steps is a perfect 5th. Write that as a name, or try `"6M"`, a major 6th, nine half steps.',
        ),
        tests: [
          {
            name: "the starter as it is",
            response: { code: makePair(".transpose(7)") },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          { name: "minimal: a major 3rd", response: { code: makePair('.transpose("3M")') }, expect: "pass" },
          {
            name: "beyond the brief: a new riff, a 6th above, hats",
            response: {
              code: `${TEMPO}hats: s("hh*8").gain(.35)\n${notes("mel", "<[c4 ~ g4 c4] [f4 g4 [f4 c4] ~]>")}\n${notes("vox", "<[c4 ~ g4 c4] [f4 g4 [f4 c4] ~]>", '.transpose("6M")', ".gain(.5)")}`,
            },
            expect: "pass",
          },
          {
            name: "a 6th by number",
            response: { code: makePair(".transpose(9)") },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
        ],
      },
    },
  ],
});
