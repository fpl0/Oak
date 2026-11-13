// A dev-only lesson with every Wave 4 step shape the player renders, in one place, before the U05–U07 authors
// have written them all (the Wave 3 fixture's idea): U05.L08's second chance at the voicing gate in G, U05.L07's
// hand-voiced cadence with its gate box and unlock moment, a staged chord dictation (bass, quality, numerals), a
// by-ear transcription in parts (bass first), a lead sheet to read from, a step that opens a Workbench panel over
// the grand staff, notes written in the bass clef, and a Make. Loaded only in a dev build, at
// /learn/U05.L99?preview=true (nothing is saved), with its own gate rule so the gate logic runs on it. Every
// musical answer here is checked by `wave4-fixture.test.ts` against the real grader and headless Strudel.
import { defineLesson, type HintLadder, type LessonDef, type Matcher } from "@oak/content-kit";
import type { GateRule } from "../gate.ts";

const BPM = 88;
const T = `setcpm(${BPM}/4)\n\n`;

export const FIXTURE4_ID = "U05.L99";
/** The session whose tools the fixture is played with: through U05.L06 (stacks in `n`, the grand staff). */
export const FIXTURE4_CONTEXT = "U05.L06";
/** The fixture's own gate (the content's is `U05.L07/hand-voiced-cadence`). */
export const FIXTURE4_GATE: GateRule = {
  exercise: `${FIXTURE4_ID}/hand-voiced-cadence`,
  variants: [`${FIXTURE4_ID}/hand-voiced-cadence-again`],
  minScore: 0.9,
};

/** A root bass under I IV V I. */
const bass = (key: string) => `bass: n("<0 3 4 0>").scale("${key}").s("piano")`;
const chords = (pattern: string, key: string) => `chords: n("${pattern}").scale("${key}").s("piano")`;
/**
 * I IV V I voiced by hand, every voice moving a 3rd or less and back round the loop: C E G → C F A (C held) →
 * B D G → C E G (G held). In degrees from 0: [0,2,4] [0,3,5] [-1,1,4] [0,2,4].
 */
export const SMOOTH = "<[0,2,4] [0,3,5] [-1,1,4] [0,2,4]>";
/** The same chords in root position: every change jumps a 4th or a 5th. */
export const JUMPY = "<[0,2,4] [3,5,7] [4,6,8] [0,2,4]>";
export const CADENCE_C = `${T}${chords(SMOOTH, "C4:major")}\n${bass("C2:major")}`;
export const CADENCE_C_JUMPY = `${T}${chords(JUMPY, "C4:major")}\n${bass("C2:major")}`;
export const CADENCE_G = `${T}${chords(SMOOTH, "G3:major")}\n${bass("G2:major")}`;
export const CADENCE_G_JUMPY = `${T}${chords(JUMPY, "G3:major")}\n${bass("G2:major")}`;

/** The four-chord loop: I V vi IV in C, a triad on every bass note. */
export const LOOP = "<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>";
export const LOOP_CODE = `${T}${chords(LOOP, "C3:major")}\nbass: n("<0 4 5 3>").scale("C2:major").s("piano")`;
const PARTS_STARTER = `${T}bass: n("<0 ~ ~ ~>").scale("C2:major").s("piano")\nchords: n("<[0,2,4] ~ ~ ~>").scale("C3:major").s("piano")`;
export const PARTS_REF = `${T}bass: n("<0 4 5 3>").scale("C2:major").s("piano")\n${chords(LOOP, "C3:major")}`;
/** The bass right, the chords of bars 3 and 4 still G B D: the chords part fails, the bass passes. */
export const PARTS_BASS_ONLY = `${T}bass: n("<0 4 5 3>").scale("C2:major").s("piano")\n${chords("<[0,2,4] [4,6,8] [4,6,8] [4,6,8]>", "C3:major")}`;
/** The bass a step off in bar 2. */
export const PARTS_BASS_WRONG = `${T}bass: n("<0 3 5 3>").scale("C2:major").s("piano")\nchords: n("<[0,2,4] ~ ~ ~>").scale("C3:major").s("piano")`;

const TUNE = `${T}melody: n("<[4 ~ 2 4] [6 ~ 4 ~] [5 ~ 7 5] [5 ~ 3 ~]>").scale("C4:major").s("piano")\n${chords(LOOP, "C3:major")}`;

const ladder = (a: string, b: string, c: string): HintLadder => [
  { text: a },
  { text: b },
  { text: c },
  "auto",
];

const gateMatcher: Matcher = {
  m: "all",
  of: [
    { m: "pcset", perOnset: true, bass: false, tracks: ["chords"] },
    {
      m: "rubric",
      rules: [
        {
          id: "smooth",
          label: "Every voice moves a 3rd or less",
          required: true,
          skills: ["C01"],
          rule: "voice-leading",
          track: "chords",
          maxMovePerVoice: 3,
        },
      ],
    },
  ],
};

const fixture: LessonDef = defineLesson({
  id: FIXTURE4_ID,
  version: 1,
  title: "Wave 4 step kinds",
  objective: "Every Wave 4 step the player renders, in one place.",
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: BPM,
  introduces: [],
  practises: ["C01"],
  terms: [],
  canDo: [],
  wrapAt: "S4",
  steps: [
    {
      id: "S1",
      kind: "modify",
      title: "One check first",
      minutes: 1.5,
      graded: true,
      gateCheck: true,
      ui: { panels: { roll: true, staff: false, keyboard: false }, rollLabels: "degree" },
      exercise: {
        kind: "code-modify",
        id: "hand-voiced-cadence-again",
        version: 1,
        role: "check",
        key: { tonic: "G", mode: "major" },
        prompt:
          "The cadence in G: I, IV, V, I over the bass. Voice the chords so every voice moves a 3rd or less, or holds its note.",
        skills: [{ skill: "C01", w: 1 }],
        code: { starter: CADENCE_G_JUMPY },
        reference: { solutions: [CADENCE_G], bars: 4 },
        matcher: gateMatcher,
        target: { audible: true, showRoll: false },
        hints: ladder(
          "Which note do I and IV share? Keep it where it is.",
          "From IV to V nothing is shared: move the lowest voice down a step, the others down.",
          "Start from `[0,2,4]`, then `[0,3,5]`. V starts one below the root.",
        ),
        tests: [
          { name: "smooth", response: { code: CADENCE_G }, expect: "pass" },
          {
            name: "root position jumps",
            response: { code: CADENCE_G_JUMPY.replace("[0,2,4]>", "[7,9,11]>") },
            expect: "fail",
          },
        ],
      },
    },
    {
      id: "S2",
      kind: "modify",
      title: "Voice it by hand",
      minutes: 1.5,
      graded: true,
      ui: { panels: { roll: true, staff: false, keyboard: false }, rollLabels: "degree" },
      exercise: {
        kind: "code-modify",
        id: "hand-voiced-cadence",
        version: 1,
        role: "check",
        prompt:
          "I, IV, V, I in C over the bass. Voice the chords so every voice moves a 3rd or less, or holds its note.",
        skills: [{ skill: "C01", w: 1 }],
        code: { starter: CADENCE_C_JUMPY },
        reference: { solutions: [CADENCE_C], bars: 4 },
        matcher: gateMatcher,
        target: { audible: true, showRoll: false },
        hints: ladder(
          "Which note do I and IV share? Keep it where it is.",
          "From IV to V nothing is shared: move the lowest voice down a step, the others down.",
          "Start from `[0,2,4]`, then `[0,3,5]`. V starts one below the root.",
        ),
        tests: [
          { name: "smooth", response: { code: CADENCE_C }, expect: "pass" },
          {
            name: "root position jumps",
            response: { code: CADENCE_C_JUMPY.replace("[0,2,4]>", "[7,9,11]>") },
            expect: "fail",
          },
        ],
      },
    },
    {
      id: "S3",
      kind: "dictate",
      title: "Bass first, then the chords",
      minutes: 2,
      graded: true,
      ui: { panels: { roll: false, staff: false, keyboard: false } },
      exercise: {
        kind: "dictation",
        id: "bass-then-chords",
        version: 1,
        role: "check",
        domain: "harmony",
        prompt:
          "Four chords, one a bar. Write the bass degree under each, then each chord's quality, then its numeral.",
        skills: [{ skill: "C01", w: 1 }],
        stimulus: { src: "code", code: LOOP_CODE, bars: 4, showCode: false },
        cue: { context: "none", countInBars: 0, click: false, replays: -1 },
        answer: { ui: "rn-palette", slots: 4, allow: ["triads"] },
        stages: ["bass", "quality", "rn"],
        stageAnswers: {
          bass: {
            ui: "degree-pad",
            set: ["1", "2", "3", "4", "5", "6", "7"],
            sequenceLen: 4,
            syllables: false,
          },
          quality: { ui: "quality-pad", set: ["maj", "min", "dim", "aug"] },
          rn: { ui: "rn-palette", slots: 4, allow: ["triads"] },
        },
        reference: { solutions: [LOOP_CODE], bars: 4 },
        matcher: {
          m: "harmony",
          level: "rn",
          qualityDepth: "triad",
          inversion: false,
          harmonicRhythm: "given",
        },
        hints: ladder(
          "Loop bar 1: the lowest note is home. Then bar 2.",
          "The bass goes up to 5, then up a step, then down to 4.",
          "Major, major, minor, major: the one minor chord sits on 6.",
        ),
        tests: [
          {
            name: "all three stages",
            response: {
              answer: {
                stages: {
                  bass: ["1", "5", "6", "4"],
                  quality: ["maj", "maj", "min", "maj"],
                  rn: ["I", "V", "vi", "IV"],
                },
              },
            },
            expect: "pass",
          },
          {
            name: "the bass of bar 3 a step low",
            response: {
              answer: {
                stages: {
                  bass: ["1", "5", "5", "4"],
                  quality: ["maj", "maj", "min", "maj"],
                  rn: ["I", "V", "vi", "IV"],
                },
              },
            },
            expect: "fail",
          },
        ],
      },
    },
    {
      id: "S4",
      kind: "dictate",
      title: "The bass, then the chords",
      minutes: 2.5,
      ui: { panels: { roll: true, staff: false, keyboard: false }, rollLabels: "degree" },
      exercise: {
        kind: "dictation",
        id: "loop-in-parts",
        version: 1,
        role: "check",
        domain: "harmony",
        prompt:
          "Write the loop down by ear: the bass first, one note a bar, then a triad on every bass note.",
        skills: [{ skill: "C01", w: 1 }],
        stimulus: { src: "code", code: PARTS_REF, bars: 4, showCode: false },
        cue: { context: "none", countInBars: 0, click: false, replays: -1 },
        answer: { ui: "code", starter: PARTS_STARTER },
        reference: { solutions: [PARTS_REF], bars: 4 },
        matcher: {
          m: "all",
          of: [
            { m: "melody", pitch: "absolute", wPitch: 0.8, wRhythm: 0.2, rhythmTol: [1, 16], track: "bass" },
            { m: "pcset", perOnset: true, bass: false, tracks: ["chords"] },
          ],
        },
        byEar: {
          ab: true,
          rates: [1, 0.75],
          accepts: "exact",
          parts: [
            {
              track: "bass",
              label: "The bass: one note a bar",
              matcher: {
                m: "melody",
                pitch: "absolute",
                wPitch: 0.8,
                wRhythm: 0.2,
                rhythmTol: [1, 16],
                track: "bass",
              },
            },
            {
              track: "chords",
              label: "The chords: a triad on every bass note",
              matcher: { m: "pcset", perOnset: true, bass: false, tracks: ["chords"] },
            },
          ],
        },
        hints: ladder(
          "Loop bar 2 alone. Is the bass higher or lower than in bar 1?",
          "The bass plays 1, 5, 6 and 4: `n` 0, 4, 5 and 3.",
          "Stack `+2, +2` on every bass degree for the chords.",
        ),
        tests: [
          { name: "the loop", response: { code: PARTS_REF }, expect: "pass" },
          { name: "bars 3 and 4 still on G", response: { code: PARTS_BASS_ONLY }, expect: "fail" },
        ],
      },
    },
    {
      id: "S5",
      kind: "quiz",
      title: "From the page",
      minutes: 0.75,
      ui: {
        panels: { roll: false, staff: "lead", keyboard: false },
        leadSheet: {
          melody: "melody",
          chords: {
            chart: [
              { bar: 1, beat: 1, symbol: "C" },
              { bar: 2, beat: 1, symbol: "G" },
              { bar: 3, beat: 1, symbol: "Am" },
              { bar: 4, beat: 1, symbol: "F" },
            ],
          },
          title: "Four chords",
        },
      },
      exercise: {
        kind: "identify",
        id: "read-the-chart",
        version: 1,
        role: "check",
        prompt: "Read the lead sheet. Which chord is under the tune in bar 3?",
        skills: [{ skill: "C01", w: 1 }],
        stimulus: { src: "code", code: TUNE, bars: 4, showCode: false, showLeadSheet: true },
        cue: { context: "none", countInBars: 0, click: false, replays: -1 },
        answer: {
          ui: "choice",
          options: [
            { id: "Am", label: "Am" },
            { id: "F", label: "F" },
            { id: "G", label: "G" },
          ],
        },
        correct: { choice: ["Am"] },
        hints: ladder(
          "Count the bars from the left.",
          "Bar 3 starts after the second bar line.",
          "It is the minor one.",
        ),
        tests: [
          { name: "Am", response: { answer: { choice: ["Am"] } }, expect: "pass" },
          { name: "F", response: { answer: { choice: ["F"] } }, expect: "fail" },
        ],
      },
    },
    {
      id: "S6",
      kind: "listen",
      title: "Two staves",
      minutes: 0.5,
      ui: {
        panels: { roll: false, staff: "grand", keyboard: false },
        initialPanels: ["key"],
      },
      exercise: {
        kind: "listen",
        id: "two-staves",
        version: 1,
        role: "practice",
        prompt: "The loop on the grand staff: the bass on the lower staff, the chords on the upper one.",
        skills: [{ skill: "C01", w: 1 }],
        hints: null,
        tests: [],
        items: [
          {
            code: LOOP_CODE.replace('scale("C3:major")', 'scale("C4:major")'),
            caption: "Bass below, chords above.",
            bars: 4,
          },
        ],
      },
    },
    {
      id: "S7",
      kind: "notate",
      title: "C major in the bass clef",
      minutes: 1,
      ui: { panels: { roll: false, staff: "bass", keyboard: false } },
      exercise: {
        kind: "staff-write",
        id: "triad-in-the-bass-clef",
        version: 1,
        role: "check",
        prompt: "In the bass clef, write C3, E3 and G3, one to a beat.",
        skills: [{ skill: "C01", w: 1 }],
        hints: ladder(
          "In the bass clef the second space from the top is C3.",
          "Each note of the triad is a line or a space higher than the last.",
          "C3 on a space, E3 on the line above it.",
        ),
        answer: {
          ui: "staff-input",
          clef: "bass",
          bars: 1,
          palette: { durations: ["4"], accidentals: false, ties: false, rests: false },
        },
        expect: { e: "pitches", spelled: ["C3", "E3", "G3"], order: "sequence", withOctave: true },
        tests: [
          { name: "C E G", response: { staff: "C3:4 E3:4 G3:4" }, expect: "pass" },
          { name: "an octave up", response: { staff: "C4:4 E4:4 G4:4" }, expect: "fail" },
        ],
      },
    },
    {
      id: "S8",
      kind: "make",
      title: "Your own cadence",
      minutes: 2,
      ui: { panels: { roll: true, staff: false, keyboard: false }, rollLabels: "degree" },
      exercise: {
        kind: "code-make",
        id: "own-cadence",
        version: 1,
        role: "practice",
        prompt: "Voice your own I, IV, V, I and give it a rhythm.",
        skills: [{ skill: "C01", w: 1 }],
        code: { starter: CADENCE_C_JUMPY },
        bars: [4, 8],
        saveAs: "sketch",
        rubric: [
          {
            id: "smooth",
            label: "Every voice moves a 3rd or less",
            required: true,
            skills: ["C01"],
            rule: "voice-leading",
            track: "chords",
            maxMovePerVoice: 3,
          },
        ],
        hints: ladder("Keep the shared note.", "Move by steps.", "Start from `[0,2,4]`, then `[0,3,5]`."),
        tests: [
          { name: "smooth", response: { code: CADENCE_C }, expect: "pass" },
          { name: "jumpy", response: { code: CADENCE_C_JUMPY }, expect: "fail" },
        ],
      },
    },
  ],
});

export default fixture;
