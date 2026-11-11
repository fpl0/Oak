// U02.L05 Moving Melodies. Every note has a number (c4 = 60, one per half step), so moving a whole line is
// adding the same number to each note: `.transpose(n)`, with a plain number only (interval strings and
// patterned amounts are U04.L02's, so the patterned hook is a preview example). Unlocks note(60) and
// .transpose(). Spec: content/specs/U02.md.
import { defineLesson, type HintLadder } from "@oak/content-kit";

const BPM = 96;
const TEMPO = `setcpm(${BPM}/4)\n\n`;
const mel = (notes: string, extra = "") => `${TEMPO}mel: note("${notes}").s("piano")${extra}`;
const RIFF_NOTES = "c4 e4 g4 e4";
/** The riff with an optional link between `note()` and `.s()` (pitch before sound, STYLE §1.5). */
const riff = (link = "", notes = RIFF_NOTES) => `${TEMPO}mel: note("${notes}")${link}.s("piano")`;

const ladder = (nudge: string, pointer: string, partial: string): HintLadder => [
  { text: nudge },
  { text: pointer },
  { text: partial },
  "auto",
];

/** The Band carries drums, bass and chords; the learner writes the line on top. */
const BAND = { band: "band.two-chord-vamp" } as const;
const ROLL_KEYS = { roll: true, staff: false, keyboard: true } as const;
const ROLL = { roll: true, staff: false, keyboard: false } as const;
const NONE = { roll: false, staff: false, keyboard: false } as const;

/** The hook as Strudel writes it: a patterned transpose, read-only (preview) until U04.L02. */
// The amounts follow the Band (C, F, C, F): up 5 is the F chord itself (what S4 and the Make build on), up
// 7 sits over C as its bright upper notes. An earlier 0 2 4 0 put F♯ over the F chord and G♯ over C.
const HOOK_PREVIEW = `${TEMPO}mel: note("${RIFF_NOTES}").transpose("<0 5 7 0>").s("piano")`;
/** The same four bars spelled out note by note: evaluated, they give identical events. */
const HOOK = mel("<[c4 e4 g4 e4] [f4 a4 c5 a4] [g4 b4 d5 b4] [c4 e4 g4 e4]>");

/** Before U03.L02 feedback names places and letters, never degrees, solfège or keys. */
const NOTE_FEEDBACK = {
  "melody.octave":
    "Bar {bar}, {beatLabel}: the right letter, but {dir} than asked. Check the number after the letter.",
  "melody.wrong-degree": "Bar {bar}, {beatLabel}: a different note from the one asked for.",
  "melody.missing-note": "Bar {bar}, {beatLabel}: a note is missing here.",
  "melody.extra-note": "Bar {bar}, {beatLabel}: one note too many here.",
} as const;

/** Two bars for the ear: the riff, then a second version. */
const pair = (second: string) => mel(`<[${RIFF_NOTES}] [${second}]>`);
const ID_WRONG = {
  "id.wrong": "Not this time. Hum the riff, then the second line: did the shape stay the same?",
} as const;
const SAME_OR_NOT = [
  { id: "moved", label: "The same tune, moved up" },
  { id: "different", label: "A different tune" },
];

export default defineLesson({
  id: "U02.L05",
  version: 1,
  title: "Moving Melodies",
  objective: "I can give a note its number and move a whole line up or down by half steps with .transpose().",
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: BPM,
  introduces: ["P06"],
  practises: ["P05"],
  terms: [
    { id: "term.midi-number", step: "S2" },
    { id: "term.transpose", step: "S3" },
    { id: "term.chromatic-scale", step: "S5" },
  ],
  canDo: ["cd.code.transpose"],
  wrapAt: "S4",
  steps: [
    {
      id: "S1",
      kind: "listen",
      title: "The same tune, climbing",
      minutes: 0.5,
      ui: { panels: ROLL_KEYS, rollLabels: "note", band: BAND },
      example: { id: "hook", code: HOOK_PREVIEW, bars: 4, preview: true },
      exercise: {
        kind: "listen",
        id: "same-tune-climbing",
        version: 1,
        role: "practice",
        prompt: "Press Play. One short riff, three times, each time higher, then back where it began.",
        skills: [{ skill: "P06", w: 1 }],
        hints: null,
        tests: [],
        items: [{ code: HOOK, caption: "A piano riff over the band, four bars on repeat.", bars: 4 }],
      },
    },
    {
      id: "S2",
      kind: "investigate",
      title: "Notes as numbers",
      minutes: 1,
      ui: { panels: ROLL_KEYS, rollLabels: "note" },
      exercise: {
        kind: "run-investigate",
        id: "notes-as-numbers",
        version: 1,
        role: "practice",
        prompt:
          "`note()` also takes numbers: these three play `c4 d4 e4`. Run it, then try 61, 63 and other numbers in the gap.",
        skills: [{ skill: "P05", w: 1 }],
        feedbackText: {
          "investigate.wrong": "Not quite. Watch the keyboard: which key does each number light?",
        },
        hints: ladder(
          "What happens on the keyboard when a number goes up by one?",
          "Each number is one key, black or white. 60 is `c4`, 61 the black key above it, 62 is `d4`.",
          "64 is `e4`. Is there a black key between `e4` and `f4`?",
        ),
        code: { starter: mel("60 62 64 ~") },
        mustPlayLoops: 1,
        questions: [
          {
            q: "number",
            prompt: "Which number plays `f4`?",
            correct: 65,
          },
          {
            q: "choice",
            prompt: "What does adding 1 to a number do?",
            options: [
              { id: "half", label: "Moves the note up one key, black or white: a half step" },
              { id: "white", label: "Moves the note up one white key" },
              { id: "octave", label: "Moves the note up one octave" },
            ],
            correct: ["half"],
          },
        ],
        tests: [
          { name: "both right", response: { answer: { number: 65, choice: ["half"] } }, expect: "pass" },
          {
            name: "counted two for every letter",
            response: { answer: { number: 66, choice: ["half"] } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
          {
            name: "one white key",
            response: { answer: { number: 65, choice: ["white"] } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
        ],
      },
    },
    {
      id: "S3",
      kind: "investigate",
      title: "Move every note",
      minutes: 1,
      ui: { panels: ROLL_KEYS, rollLabels: "note" },
      exercise: {
        kind: "run-investigate",
        id: "move-every-note",
        version: 1,
        role: "practice",
        prompt:
          "Run it, then delete `.transpose(2)` and run it again. Compare the two on the roll and the keys.",
        skills: [{ skill: "P06", w: 1 }],
        feedbackText: {
          "investigate.wrong": "Not quite. Put `.transpose(2)` back and compare the labels on the roll.",
        },
        hints: ladder(
          "Which notes changed when you removed it: one of them, or all four?",
          "Compare each label on the roll with and without it. `c4` became `d4`: how many half steps is that?",
          "`e4` became `f#4`, two half steps up, not the white key `f4`.",
        ),
        code: { starter: riff(".transpose(2)") },
        mustPlayLoops: 1,
        questions: [
          {
            q: "choice",
            prompt: "What did `.transpose(2)` do to the riff?",
            options: [
              { id: "all-half-steps", label: "Moved every note up two half steps: the same tune, higher" },
              { id: "first", label: "Moved only the first note" },
              { id: "white-keys", label: "Moved every note up two white keys" },
            ],
            correct: ["all-half-steps"],
          },
          {
            q: "number",
            prompt: "How many octaves up would `.transpose(12)` move it?",
            correct: 1,
          },
        ],
        tests: [
          {
            name: "both right",
            response: { answer: { choice: ["all-half-steps"], number: 1 } },
            expect: "pass",
          },
          {
            name: "white keys",
            response: { answer: { choice: ["white-keys"], number: 1 } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
          {
            name: "twelve octaves",
            response: { answer: { choice: ["all-half-steps"], number: 12 } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
        ],
      },
    },
    {
      id: "S4",
      kind: "modify",
      title: "Up five half steps",
      minutes: 1.25,
      graded: true,
      ui: { panels: ROLL_KEYS, rollLabels: "note" },
      exercise: {
        kind: "code-modify",
        id: "up-five",
        version: 1,
        role: "check",
        prompt: "Move the whole riff up five half steps. Use `.transpose()`, not new note names.",
        skills: [
          { skill: "P06", w: 0.5 },
          { skill: "P03", w: 0.5 },
        ],
        code: { starter: `${TEMPO}mel: note("${RIFF_NOTES}")⟪.s("piano")⟫` },
        reference: { solutions: [riff(".transpose(5)")], bars: 1 },
        matcher: {
          m: "all",
          of: [
            { m: "events", pitch: "absolute", rhythm: "onsets", durations: false },
            // Names the commonest slip (the right tune, moved by the wrong amount) as melody.transposed.
            { m: "melody", pitch: "key-relative", wPitch: 1, wRhythm: 0, rhythmTol: [1, 16] },
          ],
        },
        constraints: [{ c: "must-use", tool: "tb.transpose", feedback: "code.must-use" }],
        target: { audible: true, showRoll: true },
        feedbackText: {
          ...NOTE_FEEDBACK,
          "melody.wrong-degree":
            "Bar {bar}, {beatLabel}: a different note from the one asked for. Count the half steps again.",
          "melody.transposed": "The right tune, moved by a different number of half steps than five.",
          // A move of 17 or -7 lands on the right letters an octave out: point at the number in `.transpose()`.
          "melody.octave":
            "Bar {bar}, {beatLabel}: the right letter, but {dir} than asked, an octave out. Twelve half steps make an octave: check the number in `.transpose()`.",
        },
        hints: ladder(
          "Which method moves every note by the same number of half steps?",
          '`.transpose()` goes between `note(…)` and `.s("piano")`; the number in it counts half steps.',
          "`.transpose(2)` moved the riff up two half steps. You need a bigger number.",
        ),
        srs: [{ family: "fam.pit.steps", mode: "review-if-due" }],
        tests: [
          { name: "reference", response: { code: riff(".transpose(5)") }, expect: "pass" },
          {
            name: "written as numbers",
            response: { code: riff(".transpose(5)", "60 64 67 64") },
            expect: "pass",
          },
          {
            name: "unchanged",
            response: { code: riff() },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "counted white keys: four",
            response: { code: riff(".transpose(4)") },
            expect: "fail",
            feedback: ["melody.transposed"],
          },
          {
            name: "five half steps and an octave",
            response: { code: riff(".transpose(17)") },
            expect: "fail",
            feedback: ["melody.octave"],
          },
          {
            name: "moved by hand, one note wrong",
            response: { code: riff("", "f4 a4 c5 a#4") },
            expect: "fail",
            feedback: ["code.must-use", "melody.wrong-degree"],
          },
        ],
      },
    },
    {
      id: "S5",
      kind: "modify",
      title: "Every key in a row",
      minutes: 1,
      graded: true,
      ui: { panels: ROLL_KEYS, rollLabels: "note" },
      exercise: {
        kind: "code-fill",
        id: "every-key",
        version: 1,
        role: "check",
        prompt:
          "Fill the three gaps so the line climbs from `c4` to `b4` one half step at a time, every key in turn.",
        skills: [{ skill: "P06", w: 1 }],
        code: { starter: mel("c4 c#4 d4 ⟦1⟧ e4 f4 ⟦2⟧ g4 g#4 a4 ⟦3⟧ b4") },
        blanks: [
          { id: "1", input: "text", maxLen: 4 },
          { id: "2", input: "text", maxLen: 4 },
          { id: "3", input: "text", maxLen: 4 },
        ],
        reference: { solutions: [mel("c4 c#4 d4 d#4 e4 f4 f#4 g4 g#4 a4 a#4 b4")], bars: 1 },
        matcher: { m: "events", pitch: "absolute", rhythm: "onsets", durations: false },
        feedbackText: NOTE_FEEDBACK,
        hints: ladder(
          "Which keys are missing between `d4` and `e4`, between `f4` and `g4`, and between `a4` and `b4`?",
          "Each gap is a black key. Name it from the white key below it with a `#`.",
          "The first gap is `d#4`. The other two follow the same way.",
        ),
        tests: [
          { name: "sharps", response: { blanks: { "1": "d#4", "2": "f#4", "3": "a#4" } }, expect: "pass" },
          {
            name: "flats, the same keys",
            response: { blanks: { "1": "eb4", "2": "gb4", "3": "bb4" } },
            expect: "pass",
          },
          {
            name: "a white key in the first gap",
            response: { blanks: { "1": "e4", "2": "f#4", "3": "a#4" } },
            expect: "fail",
            feedback: ["fill.blank-wrong"],
          },
          {
            name: "a gap left empty",
            response: { blanks: { "1": "d#4", "2": "", "3": "a#4" } },
            expect: "fail",
            feedback: ["fill.blank-empty"],
          },
        ],
      },
    },
    {
      id: "S6",
      kind: "ear",
      title: "Moved, or new?",
      minutes: 1.25,
      graded: true,
      ui: { panels: NONE },
      exercise: {
        kind: "all",
        id: "moved-or-new",
        version: 1,
        role: "check",
        prompt:
          "Each clip plays the riff, then a second line. Is the second the same tune moved up, or a different tune?",
        skills: [{ skill: "P06", w: 1 }],
        hints: ladder(
          "Hum the riff, then hum the second line. Did the shape of your humming change?",
          "A moved tune keeps every distance: same ups and downs, by the same amounts, just higher.",
          "Listen to the second bar as if the first did not exist. Could you sing it to the same shape?",
        ),
        tests: [],
        parts: [
          {
            kind: "identify",
            id: "moved-two",
            version: 1,
            role: "check",
            prompt: "The riff, then a second line. Same tune moved up, or a different tune?",
            skills: [{ skill: "P06", w: 1 }],
            hints: ladder(
              "Does the second line climb and fall back like the first?",
              "Hum both. Moved tunes keep their shape.",
              "Listen again at a slower speed and hum along.",
            ),
            stimulus: { src: "code", code: pair("d4 f#4 a4 f#4"), bars: 2, showCode: false },
            cue: { context: "none", countInBars: 0, click: false, replays: 2 },
            answer: { ui: "choice", options: SAME_OR_NOT },
            feedbackText: ID_WRONG,
            correct: { choice: ["moved"] },
            tests: [
              { name: "moved", response: { answer: { choice: ["moved"] } }, expect: "pass" },
              { name: "different", response: { answer: { choice: ["different"] } }, expect: "fail" },
            ],
          },
          {
            kind: "identify",
            id: "new-shape",
            version: 1,
            role: "check",
            prompt: "The riff, then a second line. Same tune moved up, or a different tune?",
            skills: [{ skill: "P06", w: 1 }],
            hints: ladder(
              "Does the second line climb and fall back like the first?",
              "The riff goes up, up, then down. Does the second line?",
              "Listen again at a slower speed and hum along.",
            ),
            stimulus: { src: "code", code: pair("g4 e4 d4 a4"), bars: 2, showCode: false },
            cue: { context: "none", countInBars: 0, click: false, replays: 2 },
            answer: { ui: "choice", options: SAME_OR_NOT },
            feedbackText: ID_WRONG,
            correct: { choice: ["different"] },
            tests: [
              { name: "different", response: { answer: { choice: ["different"] } }, expect: "pass" },
              { name: "moved", response: { answer: { choice: ["moved"] } }, expect: "fail" },
            ],
          },
          {
            kind: "identify",
            id: "moved-five",
            version: 1,
            role: "check",
            prompt: "The riff, then a second line. Same tune moved up, or a different tune?",
            skills: [{ skill: "P06", w: 1 }],
            hints: ladder(
              "Does the second line climb and fall back like the first?",
              "Hum both. Moved tunes keep their shape, however far they move.",
              "Listen again at a slower speed and hum along.",
            ),
            stimulus: { src: "code", code: pair("f4 a4 c5 a4"), bars: 2, showCode: false },
            cue: { context: "none", countInBars: 0, click: false, replays: 2 },
            answer: { ui: "choice", options: SAME_OR_NOT },
            feedbackText: ID_WRONG,
            correct: { choice: ["moved"] },
            tests: [
              { name: "moved", response: { answer: { choice: ["moved"] } }, expect: "pass" },
              { name: "different", response: { answer: { choice: ["different"] } }, expect: "fail" },
            ],
          },
        ],
      },
    },
    {
      id: "S7",
      kind: "make",
      title: "A riff and its copy",
      minutes: 2.5,
      ui: { panels: ROLL, rollLabels: "note", band: BAND },
      exercise: {
        kind: "code-make",
        id: "riff-and-copy",
        version: 1,
        role: "practice",
        prompt:
          "Write a riff, then play it again higher or lower with `.transpose()`: on a second line, or in a second bar.",
        skills: [{ skill: "P06", w: 1 }],
        code: { starter: riff() },
        bars: [1, 4],
        saveAs: "sketch",
        rubric: [
          {
            id: "moved-copy",
            label: "Moves a line with `.transpose()`",
            required: true,
            skills: ["P06"],
            rule: "uses",
            tool: "tb.transpose",
          },
          {
            id: "two-lines",
            label: "The riff and its copy on two lines",
            required: false,
            skills: ["P06"],
            rule: "tracks",
            min: 2,
            roles: ["melody"],
          },
          {
            id: "number-note",
            label: "A note written as a number",
            required: false,
            skills: ["P05"],
            rule: "uses",
            tool: "tb.note.midi",
          },
        ],
        hints: ladder(
          "Where could a second copy of the riff go?",
          'Copy the `mel` line to a new line labelled `vox` (a second melody line), and put `.transpose()` before its `.s("piano")`.',
          "`.transpose(12)` on the copy doubles the riff an octave up. Other numbers give other colours.",
        ),
        tests: [
          {
            name: "the starter as it is",
            response: { code: riff() },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "minimal: an octave double",
            response: { code: `${riff()}\nvox: note("${RIFF_NOTES}").transpose(12).s("piano")` },
            expect: "pass",
          },
          {
            name: "beyond the brief: the copy follows the band's second chord",
            response: {
              code: `${TEMPO}mel: note("<[c4 e4 g4 e4] ~>").s("piano")\nvox: note("<~ [60 64 67 64]>").transpose(5).s("piano")`,
            },
            expect: "pass",
          },
          {
            name: "copied by hand",
            response: { code: `${riff()}\nvox: note("f4 a4 c5 a4").s("piano")` },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
        ],
      },
    },
  ],
});
