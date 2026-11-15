// A1.L01 Waves & Harmonics (the side-lesson exemplar; spec: content/specs/A1.md). Every pitched note is a
// stack of sine waves at 1, 2, 3, 4 … times its frequency: the harmonic series. A wave's colour is which of
// those harmonics it has and how loud each is: a sine has only the first, a square and a triangle only the odd
// ones, a sawtooth all of them. `.scope()` (unlocked here) opens Oak's scope panel and draws the shape;
// `.partials([…])` (unlocked here) sets the level of each harmonic of a sawtooth, square or triangle.
//
// A side lesson (contracts §2.6): it opens once U03.L02 is done and may be taken at any point after, so it uses
// only what U03.L02 guarantees (note names, `n` with `.scale()`, the four waves of U02.L06, labels, `.gain()`),
// plus `.scope()` and `.partials()`. No `ebass`, no `.lpf()` (C1.S1 and U03.L03 are not guaranteed before it),
// no `,` inside mini-notation (U04.L03), no chords by name, no singing on syllables.
//
// It starts from a loop like the learner's own (C1's shape: kick, snare, hats, a note-name bass and a two-bar
// riff) with every pitched part on a sine, and ends with that loop voiced on waves whose harmonics the learner
// chose. The Band plays the chords only (the learner's code has the drums, bass and riff).
//
// How it is graded: S5 checks the `.partials()` list with `arg-matches` (four harmonics switched on) while an
// `events` match keeps the riff's notes; S6 names a wave by ear; the Make requires two or more harmonics chosen
// with `.partials()` (`control-set`, carry f4).
// S3 and S4 open the scope panel from the step (`initialPanels: ["scope"]`, feature `panel.wave5`) and S4–S5 draw
// the harmonics probe beside the riff (`ui.probe: { kind: "harmonics", track: "mel" }`, feature `step.probe`);
// the learner's own `.scope()` opens the same panel anywhere else.
import { defineLesson, type HintLadder } from "@oak/content-kit";

const BPM = 100;
const TEMPO = `setcpm(${BPM}/4)\n\n`;
const code = (...lines: string[]) => `${TEMPO}${lines.join("\n")}`;

const ladder = (nudge: string, pointer: string, partial: string): HintLadder => [
  { text: nudge },
  { text: pointer },
  { text: partial },
  "auto",
];

/** The learner's kind of loop (C1's shape): three drum lines, a bass in note names, a riff in degrees. */
const DRUMS = ['kick: s("bd ~ bd ~")', 'snare: s("~ sd ~ sd")', 'hats: s("hh*8").gain(.5)'];
/** C | F under the Band's I | IV: root, root, the 5th below (g1 under C, c2 under F). */
const BASS_NOTES = "<[c2 ~ c2 g1] [f1 ~ f1 c2]>";
/** G G E G – E C – | A A F A – F C –: every note on a beat is in the Band's chord (C, then F). */
const RIFF = "<[4 4 2 4 ~ 2 0 ~] [5 5 3 5 ~ 3 0 ~]>";
/** The bass and the riff with their sound: `tail` is everything after the notes (`.s("sine")`). */
const bass = (tail: string) => `bass: note("${BASS_NOTES}")${tail}`;
const riff = (tail: string) => `mel: n("${RIFF}").scale("C4:major")${tail}`;

/** Every pitched part on a sine: the thin version, the Make's starter. */
const THIN = code(...DRUMS, bass('.s("sine")'), riff('.s("sine")'));
/** The same notes on waves with harmonics, each shaped with `.partials()`. */
const FULL = code(
  ...DRUMS,
  bass('.s("sawtooth").partials([1, 1, 1, 1, 1, 1])'),
  riff('.s("square").partials([1, 1, 1, 1, 1]).gain(.8)'),
);

/** S2–S3: one c3 on each wave in turn, a bar each. */
const FOUR_WAVES = 'mel: note("c3").s("<sine triangle square sawtooth>")';
/** S4: a sawtooth a2, then the first six notes of its harmonic series on a sine (110, 220 … 660 Hz). */
const INSIDE = 'mel: note("<a2 [a2 a3 e4 a4 c#5 e5]>").s("<sawtooth sine>").scope()';

/** S5: the riff over the drums on a sawtooth with only its first harmonic: it sounds like a sine. */
const BUILD_STARTER = code(...DRUMS, riff('.s("sawtooth").partials([1, ⟪0, 0, 0⟫])'));
const built = (list: string) => code(...DRUMS, riff(`.s("sawtooth").partials([${list}])`));
const BUILD_SOLUTION = built("1, 1, 1, 1");

/** S6: the bass line on a square, heard without the code. */
const BASS_ON = (wave: string) => code(...DRUMS, bass(`.s("${wave}")`));

const NONE = { roll: false, staff: false, keyboard: false } as const;
const ROLL = { roll: true, staff: false, keyboard: false } as const;
const CHORDS = { band: "band.two-chord-vamp", tracks: ["chords"] } as const;

export default defineLesson({
  id: "A1.L01",
  version: 1,
  title: "Waves & Harmonics",
  objective: "I can see a wave's shape, hear its harmonics, and choose them with `.partials()`.",
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: BPM,
  introduces: ["D02"],
  practises: [],
  terms: [
    { id: "term.frequency", step: "S4" },
    { id: "term.harmonic-series", step: "S5" },
  ],
  canDo: ["cd.code.harmonics"],
  wrapAt: "S5",
  steps: [
    {
      id: "S1",
      kind: "listen",
      title: "Thin or full",
      minutes: 0.5,
      ui: { panels: ROLL, band: CHORDS },
      example: { id: "hook", code: FULL, bars: 2 },
      exercise: {
        kind: "listen",
        id: "thin-or-full",
        version: 1,
        role: "practice",
        prompt: "Press Play: one loop, twice. Same notes, same drums. Listen to the bass and the riff.",
        skills: [{ skill: "D02", w: 1 }],
        hints: null,
        tests: [],
        items: [
          { code: THIN, caption: "Bass and riff on a sine: thin, far away.", bars: 2 },
          { code: FULL, caption: "The same notes on waves with more inside them.", bars: 2 },
        ],
      },
    },
    {
      id: "S2",
      kind: "predict",
      title: "Which is brightest?",
      minutes: 0.5,
      ui: { panels: NONE },
      exercise: {
        kind: "predict",
        id: "which-is-brightest",
        version: 1,
        role: "practice",
        prompt:
          "One note, c3, on each of the four waves in turn, a bar each: sine, triangle, square, sawtooth. Which bar will sound the brightest?",
        skills: [{ skill: "D02", w: 1 }],
        hints: null,
        tests: [],
        code: code(FOUR_WAVES),
        bars: 4,
        mode: "choose",
        choices: [
          { id: "sine", label: "Bar 1, the sine" },
          { id: "triangle", label: "Bar 2, the triangle" },
          { id: "square", label: "Bar 3, the square" },
          { id: "sawtooth", label: "Bar 4, the sawtooth" },
        ],
        correct: ["sawtooth"],
      },
    },
    {
      id: "S3",
      kind: "investigate",
      title: "See the wave",
      minutes: 1,
      ui: { panels: NONE, initialPanels: ["scope"] },
      example: { id: "see-the-wave", code: code(`${FOUR_WAVES}.scope()`), bars: 4 },
      exercise: {
        kind: "run-investigate",
        id: "see-the-wave",
        version: 1,
        role: "practice",
        prompt:
          "`.scope()` at the end of a line opens the scope: a picture of the wave as it plays. Run it and watch each bar.",
        skills: [{ skill: "D02", w: 1 }],
        feedbackText: {
          "investigate.wrong":
            "Not quite. Watch bar 1 and bar 4 again: one draws a round curve, the other climbs slowly and falls straight down.",
        },
        hints: ladder(
          "Which bar's picture has no corners at all?",
          "The waves are named after their shapes. Which name sounds like a slope and a cliff?",
          "Bar 1, the sine, is the round one. Now find the slope and the cliff.",
        ),
        code: { starter: code(`${FOUR_WAVES}.scope()`) },
        mustPlayLoops: 1,
        questions: [
          { q: "number", prompt: "Which bar, 1 to 4, draws a smooth, round curve?", correct: 1 },
          {
            q: "choice",
            prompt: "Which one climbs slowly and drops straight down?",
            options: [
              { id: "triangle", label: "Triangle" },
              { id: "square", label: "Square" },
              { id: "sawtooth", label: "Sawtooth" },
            ],
            correct: ["sawtooth"],
          },
        ],
        tests: [
          {
            name: "both right",
            response: { answer: { number: 1, choice: ["sawtooth"] } },
            expect: "pass",
          },
          {
            name: "square for the ramp",
            response: { answer: { number: 1, choice: ["square"] } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
        ],
      },
    },
    {
      id: "S4",
      kind: "investigate",
      title: "Notes inside a note",
      minutes: 1,
      ui: { panels: NONE, initialPanels: ["scope"], probe: { kind: "harmonics", track: "mel" } },
      example: { id: "notes-inside", code: code(INSIDE), bars: 2 },
      exercise: {
        kind: "run-investigate",
        id: "notes-inside",
        version: 1,
        role: "practice",
        prompt:
          "Bar 1: a2 on a sawtooth. Bar 2: six notes on a sine, from that same a2 upward. A wave repeats a number of times each second: a2 repeats 110 times. Run it, then answer.",
        skills: [{ skill: "D02", w: 1 }],
        feedbackText: {
          "investigate.wrong":
            "Not quite. a3 is a2 an octave up: the scope draws twice as many waves in the same space. Then each next note adds another 110.",
        },
        hints: ladder(
          "What happens to the picture when a note goes up an octave?",
          "An octave up, the wave repeats twice as often. Bar 2 starts at 110, then 220.",
          "110, 220, then 330: what does each next note add?",
        ),
        code: { starter: code(INSIDE) },
        mustPlayLoops: 1,
        questions: [
          {
            q: "number",
            prompt: "a2 repeats 110 times a second. How many times does a3 repeat?",
            correct: 220,
          },
          {
            q: "choice",
            prompt: "Bar 2 goes 110, 220, then about 330 … How do the six notes climb?",
            options: [
              { id: "add", label: "Each one adds about another 110" },
              { id: "double", label: "Each one doubles" },
              { id: "same", label: "Each one is an octave above the last" },
            ],
            correct: ["add"],
          },
        ],
        tests: [
          {
            name: "both right",
            response: { answer: { number: 220, choice: ["add"] } },
            expect: "pass",
          },
          {
            name: "an octave each time",
            response: { answer: { number: 220, choice: ["same"] } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
          {
            name: "half for an octave up",
            response: { answer: { number: 55, choice: ["add"] } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
        ],
      },
    },
    {
      id: "S5",
      kind: "modify",
      title: "Build a sawtooth",
      minutes: 1.25,
      graded: true,
      ui: { panels: ROLL, probe: { kind: "harmonics", track: "mel" } },
      exercise: {
        kind: "code-modify",
        id: "build-a-sawtooth",
        version: 1,
        role: "check",
        prompt:
          "The riff is on a sawtooth, but `.partials()` keeps only the bottom note of its stack, so it sounds like a sine. Each number is one note of the stack, from the bottom: 1 on, 0 off. Switch on the next three.",
        skills: [{ skill: "D02", w: 1 }],
        code: { starter: BUILD_STARTER },
        reference: { solutions: [BUILD_SOLUTION], bars: 2 },
        matcher: {
          m: "events",
          pitch: "absolute",
          rhythm: "onsets",
          durations: false,
          tracks: ["mel"],
        },
        constraints: [
          { c: "edit-only-regions", feedback: "code.edit-outside" },
          {
            c: "arg-matches",
            fn: "partials",
            argIndex: 0,
            pattern: "^\\[\\s*1(?:\\.0*)?(?:\\s*,\\s*1(?:\\.0*)?){3}(?:\\s*,\\s*0?(?:\\.0*)?)*\\s*\\]$",
            feedback: "code.arg-mismatch",
          },
        ],
        target: { audible: true, showRoll: false },
        feedbackText: {
          "melody.wrong-degree":
            "Bar {bar}: the riff's notes changed. Change only the list inside `.partials()`.",
          "code.arg-mismatch":
            "Not yet: the list is {got}. Four notes of the stack on is four 1s; the sawtooth itself makes each one quieter than the last.",
        },
        hints: ladder(
          "How many numbers are in the list, and how many of them are 1?",
          "The first number is the bottom note of the stack, the second the next one up, and so on. A 0 leaves that one out.",
          "The second one on is `[1, 1, 0, 0]`. Two to go.",
        ),
        tests: [
          { name: "reference", response: { code: BUILD_SOLUTION }, expect: "pass" },
          { name: "written tight", response: { code: built("1,1,1,1") }, expect: "pass" },
          {
            name: "unchanged",
            response: { code: built("1, 0, 0, 0") },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "the riff's notes changed as well",
            response: {
              code: code(
                ...DRUMS,
                `mel: n("<[4 4 2 4 ~ 2 0 ~] [5 5 3 5 ~ 3 2 ~]>").scale("C4:major").s("sawtooth").partials([1, 1, 1, 1])`,
              ),
            },
            expect: "fail",
            feedback: ["code.edit-outside"],
          },
          {
            name: "harmonic 4 left off",
            response: { code: built("1, 1, 1, 0") },
            expect: "fail",
            feedback: ["code.arg-mismatch"],
          },
          {
            name: "the sawtooth's own levels written in as well",
            response: { code: built("1, .5, .33, .25") },
            expect: "fail",
            feedback: ["code.arg-mismatch"],
          },
        ],
      },
    },
    {
      id: "S6",
      kind: "ear",
      title: "Odd ones only",
      minutes: 1.25,
      graded: true,
      ui: { panels: NONE },
      exercise: {
        kind: "identify",
        id: "odd-ones-only",
        version: 1,
        role: "check",
        prompt:
          "The bass line on one of three waves. Sine: harmonic 1 only. Square: the odd harmonics, 1, 3, 5 … Sawtooth: every one. Which is it?",
        skills: [{ skill: "D02", w: 1 }],
        hints: [
          { text: "Is the bass round and soft, or does it buzz?" },
          {
            text: "A sine has nothing above its first harmonic. A sawtooth has every harmonic and buzzes. A square, with only the odd ones, sounds hollow, like a clarinet.",
          },
          { text: "Hear it again, slower, and listen above the low note.", replay: { rate: 0.75 } },
          "auto",
        ],
        stimulus: { src: "code", code: BASS_ON("square"), bars: 2, showCode: false },
        cue: { context: "none", countInBars: 0, click: false, replays: -1 },
        answer: {
          ui: "choice",
          options: [
            { id: "sine", label: "Sine: harmonic 1 only" },
            { id: "square", label: "Square: the odd harmonics" },
            { id: "sawtooth", label: "Sawtooth: every harmonic" },
          ],
        },
        correct: { choice: ["square"] },
        feedbackText: {
          "id.wrong":
            "Not this one: the bass had something above its low note, but not every harmonic. It was the square: 1, 3, 5 …, hollow rather than buzzy.",
        },
        tests: [
          { name: "square", response: { answer: { choice: ["square"] } }, expect: "pass" },
          {
            name: "sawtooth",
            response: { answer: { choice: ["sawtooth"] } },
            expect: "fail",
            feedback: ["id.wrong"],
          },
          {
            name: "sine",
            response: { answer: { choice: ["sine"] } },
            expect: "fail",
            feedback: ["id.wrong"],
          },
        ],
      },
    },
    {
      id: "S7",
      kind: "make",
      title: "Voice your loop",
      minutes: 2.75,
      ui: { panels: ROLL, band: CHORDS },
      exercise: {
        kind: "code-make",
        id: "voice-your-loop",
        version: 1,
        role: "practice",
        prompt:
          "Your kind of loop, with the bass and the riff on a sine. Give each a wave with harmonics, and choose the harmonics of at least one with `.partials()`: a full bass under a riff that cuts through. Add `.scope()` to a line to see it.",
        skills: [{ skill: "D02", w: 1 }],
        code: { starter: THIN },
        bars: [2, 8],
        saveAs: "sketch",
        rubric: [
          {
            id: "harmonics-chosen",
            label: "One part's harmonics chosen with .partials()",
            required: true,
            skills: ["D02"],
            // Carry f4 (corrections pass): what is heard, not the call. `.partials([1])` or `[1, 0, 0]` is one
            // harmonic, a sine; two or more harmonics change the sound.
            rule: "custom",
            fn: "control-set",
            params: { control: "partials", above: 1, call: "partials", example: "[1, 1, 1, 1]" },
          },
          {
            id: "a-wave-with-harmonics",
            label: "A part on a sawtooth, square or triangle",
            required: false,
            skills: ["D02"],
            rule: "sounds",
            anyOf: ["snd.wave.sawtooth", "snd.wave.square", "snd.wave.triangle"],
          },
          {
            id: "bass-and-riff",
            label: "Drums, a bass and a riff",
            required: false,
            skills: ["D01"],
            rule: "tracks",
            min: 3,
            roles: ["drums", "bass", "melody"],
          },
        ],
        // The override serves every rule of the rubric, suggestions included, so it stays neutral.
        feedbackText: { "rubric.unmet": "{label}: not yet." },
        hints: ladder(
          "Which part sounds the thinnest? What could you give it?",
          "A sawtooth has every harmonic, a square the odd ones. `.partials([…])` after the wave sets each one: 1 on, 0 off.",
          'Try the bass first: `.s("sawtooth").partials([1, 1, 1, 1, 1, 1])` keeps six harmonics.',
        ),
        tests: [
          {
            name: "the starter as it is",
            response: { code: THIN },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "minimal: the bass on six harmonics",
            response: {
              code: code(...DRUMS, bass('.s("sawtooth").partials([1, 1, 1, 1, 1, 1])'), riff('.s("sine")')),
            },
            expect: "pass",
          },
          { name: "beyond the brief: both parts shaped", response: { code: FULL }, expect: "pass" },
          {
            name: "new waves, harmonics not chosen",
            response: { code: code(...DRUMS, bass('.s("sawtooth")'), riff('.s("square")')) },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "the riff on a triangle with three harmonics",
            response: {
              code: code(...DRUMS, bass('.s("sine")'), riff('.s("triangle").partials([1, 0, 1, 0, 1])')),
            },
            expect: "pass",
          },
          {
            name: "the bass on two harmonics only",
            response: { code: code(...DRUMS, bass('.s("sawtooth").partials([1, 1])'), riff('.s("sine")')) },
            expect: "pass",
          },
          {
            name: "right function, one harmonic: still a sine",
            response: {
              code: code(...DRUMS, bass('.s("sawtooth").partials([1, 0, 0, 0])'), riff('.s("sine")')),
            },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "the harmonics chosen, then the part muted",
            response: {
              code: code(...DRUMS, bass('.s("sawtooth").partials([1, 1, 1, 1]).gain(0)'), riff('.s("sine")')),
            },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
        ],
      },
    },
  ],
});
