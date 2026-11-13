// A dev-only lesson with every Wave 5 step shape the lesson player hosts, in one place, before the U08–U11 and A1
// authors have written them all (the Wave 3 and 4 fixtures' idea): a verse–chorus song in A minor with one
// arrange() per track and the form map open, the form of a tune by ear (the `form` answer, AABA), the twelve-bar
// blues on the chart (`bar-grid`), the A minor pentatonic built on the pad (`scale-builder`), a minor scale sung
// do-based (Quiet mode has its fallback), a shuffle tapped along with the swung hats, the harmonics on Oak's scope
// with the probe beside the sound, a "match this sound" step graded on the filter's cutoff (`controls`), and a
// Make whose required line is a bass on the roots (`bass-line`). Loaded only in a dev build, at
// /learn/U11.L99?preview=true (nothing is saved), played with the tools of U11.L06 plus A1's sound tools. Every
// musical answer here is checked by `wave5-fixture.test.ts` against the real grader and headless Strudel.
import { defineLesson, type HintLadder, type LessonDef } from "@oak/content-kit";

const BPM = 96;
const T = `setcpm(${BPM}/4)\n\n`;
const code = (...lines: string[]) => `${T}${lines.join("\n")}`;

export const FIXTURE5_ID = "U11.L99";
/** The session whose tools the fixture is played with: through U11.L06 (arrange, minor, the blues scale). */
export const FIXTURE5_CONTEXT = "U11.L06";
/** A1's sound tools on top (a side lesson's, not in the default order): the scope, partials, filters, envelope. */
export const FIXTURE5_EXTRA = [
  "tb.scope",
  "tb.partials",
  "tb.lpf",
  "tb.hpf",
  "tb.lpq",
  "tb.lpenv",
  "tb.adsr",
];

const ladder = (a: string, b: string, c: string): HintLadder => [
  { text: a },
  { text: b },
  { text: c },
  "auto",
];

const NONE = { roll: false, staff: false, keyboard: false } as const;
const ROLL = { roll: true, staff: false, keyboard: false } as const;

// --- S1: a verse–chorus song in A minor, one arrange() per track -----------------------------------------

/** Verse i VI III VII (Am F C G, the Aeolian loop), chorus VI VII i i (F G Am Am). */
const CONSTS = [
  'const chordsVerse = chord("<Am F C G>").voicing()',
  'const chordsChorus = chord("<F G Am Am>").voicing()',
  'const bassVerse = n("<0 5 2 6>").scale("A1:minor")',
  'const bassChorus = n("<5 6 0 0>").scale("A1:minor")',
  'const melVerse = n("<[2 ~ 0 2] [2 ~ 0 ~] [4 ~ 2 ~] [3 ~ 1 ~]>").scale("A3:minor")',
  'const melChorus = n("<[7 ~ 5 ~] [6 ~ 8 ~] [7 ~ 9 7] [7 ~ ~ ~]>").scale("A3:minor")',
].join("\n");
const vcvc = (v: string, c: string) => `arrange([4, ${v}], [4, ${c}], [4, ${v}], [4, ${c}])`;
export const SONG = `${T}${CONSTS}\n\nchords: ${vcvc("chordsVerse", "chordsChorus")}.s("piano")\nbass: ${vcvc("bassVerse", "bassChorus")}.s("sawtooth").lpf(500)\nmel: ${vcvc("melVerse", "melChorus")}.s("piano")`;

// --- S2: AABA by ear ------------------------------------------------------------------------------------

/** A (C A C) twice, B (D C B G, down past home), A again: one bar each, in A minor. */
export const AABA = code('mel: n("<[2 0 2 ~] [2 0 2 ~] [3 2 1 -1] [2 0 2 ~]>").scale("A3:minor").s("piano")');

// --- S6: a shuffle --------------------------------------------------------------------------------------

/** Swung eighths on the hats over a backbeat: each off-beat lands two thirds through its beat. */
export const SHUFFLE = code(
  'hats: s("hh*8").swingBy(1/3, 4)',
  'snare: s("~ sd ~ sd")',
  'kick: s("bd ~ bd ~")',
);
const BEAT = 60 / BPM;
/** One bar of the swung eighths, in seconds from the bar line: on the beat, then two thirds through it. */
export const SWUNG_TAPS = [0, 1, 2, 3].flatMap((b) => [b * BEAT, (b + 2 / 3) * BEAT]);
/** The same eighths straight (the off-beat halfway): what a learner who does not feel the swing taps. */
export const STRAIGHT_TAPS = [0, 1, 2, 3].flatMap((b) => [b * BEAT, (b + 1 / 2) * BEAT]);

// --- S7: harmonics on the scope ---------------------------------------------------------------------------

export const HARMONICS = code('mel: note("<a2 [a2 a3 e4 a4 c#5 e5]>").s("<sawtooth sine>").scope()');

// --- S8: match this sound -------------------------------------------------------------------------------

const BASSLINE = 'bass: note("<[a1 ~ a1 e2] [f1 ~ f1 c2]>").s("sawtooth")';
export const MATCH_STARTER = code(`${BASSLINE}.lpf(⟪4000⟫)`);
export const MATCH_REFERENCE = code(`${BASSLINE}.lpf(400)`);
const matchWith = (hz: string) => code(`${BASSLINE}.lpf(${hz})`);

// --- S9: the Make -----------------------------------------------------------------------------------------

const MAKE_CHORDS = 'chords: chord("<Am F C G>").voicing().s("piano")';
export const MAKE_STARTER = code(
  MAKE_CHORDS,
  'bass: n("<0 0 0 0>").scale("A1:minor").s("sawtooth").lpf(500)',
);
export const MAKE_PASS = code(MAKE_CHORDS, 'bass: n("<0 5 2 6>").scale("A1:minor").s("sawtooth").lpf(500)');
/** The roots on beat 1, the fifth on beat 3: still a bass on the roots. */
export const MAKE_PASS_FIFTHS = code(
  MAKE_CHORDS,
  'bass: n("<[0 ~ 4 ~] [5 ~ 9 ~] [2 ~ 6 ~] [6 ~ 10 ~]>").scale("A1:minor").s("sawtooth").lpf(500)',
);

const fixture: LessonDef = defineLesson({
  id: FIXTURE5_ID,
  version: 1,
  title: "Wave 5 step shapes",
  objective: "Every Wave 5 step shape the lesson player hosts, in one place.",
  key: { tonic: "A", mode: "minor" },
  meter: "4/4",
  bpm: BPM,
  introduces: [],
  practises: [],
  terms: [],
  canDo: [],
  wrapAt: "S5",
  steps: [
    {
      id: "S1",
      kind: "listen",
      title: "Verse and chorus in minor",
      minutes: 0.75,
      ui: { panels: ROLL, rollLabels: "degree", initialPanels: ["form"] },
      example: { id: "song", code: SONG, bars: 16 },
      exercise: {
        kind: "listen",
        id: "verse-chorus-minor",
        version: 1,
        role: "practice",
        prompt:
          "Press Play: a verse on the Aeolian loop, then a chorus that climbs, twice. The form map shows each section.",
        skills: [{ skill: "F02", w: 1 }],
        hints: null,
        tests: [],
        items: [{ code: SONG, caption: "Verse, chorus, verse, chorus.", bars: 16 }],
      },
    },
    {
      id: "S2",
      kind: "ear",
      title: "Which form?",
      minutes: 1,
      graded: true,
      ui: { panels: NONE },
      exercise: {
        kind: "identify",
        id: "which-form",
        version: 1,
        role: "check",
        prompt: "Four one-bar sections. Give each a letter: the first is A, a new one is the next letter.",
        skills: [{ skill: "F03", w: 1 }],
        hints: ladder(
          "Which bars sound the same as bar 1?",
          "Bars 1, 2 and 4 are the same tune; bar 3 goes somewhere else.",
          "A, A, then something new, then …",
        ),
        stimulus: { src: "code", code: AABA, bars: 4, showCode: false },
        cue: { context: "none", countInBars: 0, click: false, replays: -1 },
        answer: { ui: "form", sections: 4, vocabulary: "letters", input: "label" },
        correct: { sections: ["A", "A", "B", "A"] },
        tests: [
          { name: "AABA", response: { answer: { sections: ["A", "A", "B", "A"] } }, expect: "pass" },
          {
            name: "the same shape in other letters",
            response: { answer: { sections: ["B", "B", "C", "B"] } },
            expect: "pass",
          },
          { name: "ABAB", response: { answer: { sections: ["A", "B", "A", "B"] } }, expect: "fail" },
        ],
      },
    },
    {
      id: "S3",
      kind: "quiz",
      title: "The twelve bars",
      minutes: 1.25,
      ui: { panels: NONE },
      exercise: {
        kind: "fact",
        id: "twelve-bars",
        version: 1,
        role: "check",
        key: { tonic: "C", mode: "major" },
        prompt: "Fill in the twelve-bar blues in C, a numeral a bar. Bar 1 is given.",
        skills: [{ skill: "F04", w: 1 }],
        hints: ladder(
          "Which chord comes back most?",
          "Four bars of home, two of IV, two of home, then V, IV, home, V.",
          "Bars 5 and 6 are IV7; bar 9 is V7.",
        ),
        answer: { ui: "bar-grid", bars: 12, perRow: 4, entry: "rn", qualities: ["7"], given: [1] },
        correct: { rn: ["I7", "IV7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"] },
        spelling: "enharmonic",
        order: "sequence",
        tests: [
          {
            name: "the quick change",
            response: {
              answer: { rn: ["I7", "IV7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"] },
            },
            expect: "pass",
          },
          {
            name: "V7 in bar 10",
            response: {
              answer: { rn: ["I7", "IV7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "V7", "I7", "V7"] },
            },
            expect: "fail",
          },
        ],
      },
    },
    {
      id: "S4",
      kind: "quiz",
      title: "Build the minor pentatonic",
      minutes: 1,
      ui: { panels: NONE },
      exercise: {
        kind: "fact",
        id: "minor-pentatonic",
        version: 1,
        role: "check",
        key: { tonic: "A", mode: "minor" },
        prompt:
          "Tick the five degrees of the A minor pentatonic: the minor scale without its two half steps.",
        skills: [{ skill: "S09", w: 1 }],
        hints: ladder(
          "Which two notes of the minor scale sit a half step from a neighbour?",
          "Leave out 2 and ♭6.",
          "1, ♭3, 4 and 5 are in. One more.",
        ),
        answer: {
          ui: "scale-builder",
          tonic: "A",
          input: "degrees",
          palette: ["1", "2", "b3", "3", "4", "5", "b6", "6", "b7", "7"],
        },
        correct: { degrees: ["1", "b3", "4", "5", "b7"] },
        spelling: "enharmonic",
        order: "set",
        tests: [
          {
            name: "the five",
            response: { answer: { degrees: ["1", "b3", "4", "5", "b7"] } },
            expect: "pass",
          },
          {
            name: "in another order",
            response: { answer: { degrees: ["b7", "5", "4", "b3", "1"] } },
            expect: "pass",
          },
          {
            name: "the major pentatonic",
            response: { answer: { degrees: ["1", "2", "3", "5", "6"] } },
            expect: "fail",
          },
        ],
      },
    },
    {
      id: "S5",
      kind: "sing",
      title: "Sing up to me",
      minutes: 1,
      ui: { panels: NONE },
      exercise: {
        kind: "sing",
        id: "sing-to-me",
        version: 1,
        role: "practice",
        prompt: "Hear home, then sing do re me and back to do. In minor, 1 is still do.",
        skills: [{ skill: "V02", w: 1 }],
        hints: ladder(
          "Hum do before you start.",
          "Me is a half step lower than the mi you know.",
          "Sing do re mi, then lower the last one a little.",
        ),
        mode: "degree",
        labels: "syllables",
        stimulus: {
          src: "code",
          code: code('chords: chord("<Am>").voicing().s("piano")'),
          bars: 1,
          showCode: false,
        },
        cue: { context: "tonic-chord", countInBars: 1, click: true, replays: -1 },
        target: { from: "degrees", degrees: ["1", "2", "b3", "1"] },
        tol: { cents: "learner", octave: "global", driftCompCents: 30, minCoverage: 0.4, passHitRate: 0.8 },
        showTrace: "live",
        fallback: "identify",
        tests: [],
      },
    },
    {
      id: "S6",
      kind: "tap",
      title: "Tap the shuffle",
      minutes: 1,
      graded: true,
      ui: { panels: NONE },
      exercise: {
        kind: "tap",
        id: "tap-the-shuffle",
        version: 1,
        role: "check",
        swing: { subdivision: 8, amount: 1 / 3 },
        prompt: "Tap along with the hats for one bar: long, short, long, short. Eight taps.",
        skills: [{ skill: "R13", w: 1 }],
        hints: ladder(
          "Is the tap after each beat halfway, or later?",
          "Each off-beat lands two thirds of the way to the next beat.",
          "Say 'one-and' with a long 'one' and a short 'and'.",
        ),
        mode: "along",
        stimulus: { src: "code", code: SHUFFLE, bars: 1, showCode: false },
        cue: { context: "none", countInBars: 1, click: false, replays: -1 },
        bars: 1,
        target: { track: "hats" },
        tol: { windowMs: "auto", tempo: "locked", forgiveOffset: true, passF1: 0.8, passTiming: 0.7 },
        tests: [
          { name: "swung", response: { taps: SWUNG_TAPS }, expect: "pass" },
          {
            name: "on the beats only",
            response: { taps: [0, 1, 2, 3].map((b) => b * BEAT) },
            expect: "fail",
          },
        ],
      },
    },
    {
      id: "S7",
      kind: "investigate",
      title: "Harmonics on the scope",
      minutes: 1,
      ui: { panels: NONE, initialPanels: ["scope"], probe: { kind: "harmonics" } },
      example: { id: "harmonics", code: HARMONICS, bars: 2 },
      exercise: {
        kind: "run-investigate",
        id: "harmonics-on-the-scope",
        version: 1,
        role: "practice",
        prompt: "Run it and watch the scope: a sawtooth a2, then its first six harmonics on sines.",
        skills: [{ skill: "D02", w: 1 }],
        hints: ladder(
          "Look at the shape the scope draws in bar 1.",
          "The sawtooth climbs slowly and drops straight down.",
          "Bar 2 stacks the notes the sawtooth already holds.",
        ),
        code: { starter: HARMONICS },
        mustPlayLoops: 1,
        questions: [
          {
            q: "choice",
            prompt: "Which wave climbs slowly and drops straight down?",
            options: [
              { id: "sawtooth", label: "The sawtooth" },
              { id: "sine", label: "The sine" },
            ],
            correct: ["sawtooth"],
          },
        ],
        tests: [
          { name: "the sawtooth", response: { answer: { choice: ["sawtooth"] } }, expect: "pass" },
          { name: "the sine", response: { answer: { choice: ["sine"] } }, expect: "fail" },
        ],
      },
    },
    {
      id: "S8",
      kind: "modify",
      title: "Match this sound",
      minutes: 1.5,
      graded: true,
      ui: { panels: ROLL, probe: { kind: "filter", track: "bass" } },
      exercise: {
        kind: "code-modify",
        id: "match-the-cutoff",
        version: 1,
        role: "check",
        prompt:
          "Play B, the sound to match, then yours. Move the cutoff in `.lpf()` until the two sound the same.",
        skills: [{ skill: "D03", w: 1 }],
        hints: ladder(
          "Is yours brighter or darker than B?",
          "Lower the number: fewer high harmonics get through.",
          "Within half an octave of a few hundred is close enough.",
        ),
        code: { starter: MATCH_STARTER },
        reference: { solutions: [MATCH_REFERENCE], bars: 2 },
        matcher: { m: "controls", controls: [{ control: "lpf", scale: "log", tol: 0.5 }], track: "bass" },
        constraints: [{ c: "edit-only-regions", feedback: "code.edit-outside" }],
        target: { audible: true, showRoll: false },
        tests: [
          { name: "400", response: { code: MATCH_REFERENCE }, expect: "pass" },
          { name: "within half an octave", response: { code: matchWith("500") }, expect: "pass" },
          { name: "two octaves too bright", response: { code: matchWith("1600") }, expect: "fail" },
        ],
      },
    },
    {
      id: "S9",
      kind: "make",
      title: "A bass on the roots",
      minutes: 2,
      ui: { panels: ROLL, rollLabels: "degree" },
      exercise: {
        kind: "code-make",
        id: "roots-in-minor",
        version: 1,
        role: "practice",
        prompt: "Give the Aeolian loop a bass: the root of each chord, at least on beat 1.",
        skills: [{ skill: "B01", w: 1 }],
        hints: ladder(
          "What is the lowest note of Am? Of F?",
          "In A minor the roots are degrees 1, 6, 3 and 7: n 0, 5, 2 and 6.",
          "The first two bars are `0 5`.",
        ),
        code: { starter: MAKE_STARTER },
        bars: [4, 8],
        saveAs: "sketch",
        rubric: [
          {
            id: "roots",
            label: "The bass plays each chord's root when the chord changes",
            required: true,
            skills: ["B01"],
            rule: "bass-line",
            track: "bass",
            roots: { on: "change", minRatio: 0.75 },
          },
        ],
        tests: [
          { name: "starter", response: { code: MAKE_STARTER }, expect: "fail" },
          { name: "the roots", response: { code: MAKE_PASS }, expect: "pass" },
          { name: "roots and fifths", response: { code: MAKE_PASS_FIFTHS }, expect: "pass" },
        ],
      },
    },
  ],
});

export default fixture;
