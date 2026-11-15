// A dev-only lesson with the Wave 7 step shape no authored lesson uses yet: three against two tapped with two
// hands (`tap.lanes`, contracts §8.4), the left hand on F with the kick's two, the right hand on J with the
// cowbell's three. R2.L04 S2 now ships the same two-lane tap (content/advanced/R2/L04/lesson.ts); this fixture
// keeps the real-time take of the two-lane pad, the `{ lanes }` response and the two-hand grade (`gradeLaneTaps`)
// in a preview that saves nothing. Loaded only in a dev build, at
// /learn/R2.L99?preview=true (nothing is saved), played with the tools of R2.L04. Every answer here is checked by
// `wave7-fixture.test.ts` against the real grader and headless Strudel.
import { defineLesson, type HintLadder, type LessonDef } from "@oak/content-kit";

export const FIXTURE7_ID = "R2.L99";
/** The session whose tools the fixture is played with: R2.L04 Polyrhythm 3:2, 4:3. */
export const FIXTURE7_CONTEXT = "R2.L04";

export const TAP_BPM = 66;
/** The kick's two and the cowbell's three, one bar each, four bars (evaluated: kick 0, 1/2; cowbell 0, 1/3, 2/3). */
export const STIMULUS = `setcpm(${TAP_BPM}/4)\n\nkick: s("bd bd")\nperc: s("cb cb cb").gain(.6)`;
/** One bar of 4/4 at 66 BPM, in seconds. */
export const BAR = (4 * 60) / TAP_BPM;
/** Seconds from bar 1 of the stimulus: the given fractions of each of four bars, to the millisecond. */
export const at = (places: readonly number[]): number[] =>
  [0, 1, 2, 3].flatMap((bar) => places.map((p) => Math.round((bar + p) * BAR * 1000) / 1000));
export const TWO = at([0, 1 / 2]);
export const THREE = at([0, 1 / 3, 2 / 3]);

const ladder = (a: string, b: string, c: string): HintLadder => [
  { text: a },
  { text: b },
  { text: c },
  "auto",
];

const NONE = { roll: false, staff: false, keyboard: false } as const;
const ROLL = { roll: true, staff: false, keyboard: false } as const;

/** S2's starter: both parts on the two. */
export const MAKE_STARTER = `setcpm(${TAP_BPM}/4)\n\nkick: s("bd bd")\nperc: ⟪s("cb cb").gain(.6)⟫`;
export const MAKE_PASS = STIMULUS;

const fixture: LessonDef = defineLesson({
  id: FIXTURE7_ID,
  version: 1,
  title: "Wave 7 step kinds",
  objective: "Three against two with two hands, in the lesson player.",
  key: { tonic: "C", mode: "minor" },
  meter: "4/4",
  bpm: TAP_BPM,
  introduces: [],
  practises: ["R17"],
  terms: [],
  canDo: [],
  wrapAt: "S1",
  steps: [
    {
      id: "S1",
      kind: "tap",
      title: "Both hands",
      minutes: 1.5,
      ui: { panels: NONE, band: false },
      exercise: {
        kind: "tap",
        id: "three-over-two-hands",
        version: 1,
        role: "practice",
        bpm: TAP_BPM,
        prompt:
          'Left hand on F with the kick, two taps a bar; right hand on J with the cowbell, three a bar. Both hands land together on the first beat of every bar. Say "nice cup of tea": nice is both hands.',
        skills: [{ skill: "R17", w: 1 }],
        hints: ladder(
          "Start with the left hand alone: it plays with the kick.",
          "The right hand plays three even taps in the time of the left hand's two.",
          "Only the first tap of each bar is shared; the other three taps fall between.",
        ),
        mode: "along",
        stimulus: { src: "code", code: STIMULUS, bars: 4, showCode: false },
        cue: { context: "none", countInBars: 1, click: false, replays: -1 },
        bars: 4,
        target: { track: "perc" },
        lanes: [
          { label: "Left hand: the 2, with the kick", track: "kick", key: "f" },
          { label: "Right hand: the 3, with the cowbell", track: "perc", key: "j" },
        ],
        tol: { windowMs: "auto", tempo: "locked", forgiveOffset: true, passF1: 0.8, passTiming: 0.7 },
        tests: [
          { name: "both hands, each on its pulse", response: { lanes: [TWO, THREE] }, expect: "pass" },
          {
            name: "both hands a little late together",
            response: { lanes: [TWO.map((t) => t + 0.03), THREE.map((t) => t + 0.03)] },
            expect: "pass",
          },
          {
            name: "the hands swapped: the three on F, the two on J",
            response: { lanes: [THREE, TWO] },
            expect: "fail",
            feedback: ["tap.lanes-swapped"],
          },
          {
            name: "the right hand silent",
            response: { lanes: [TWO, []] },
            expect: "fail",
          },
          {
            name: "the right hand tapping four, not three",
            response: { lanes: [TWO, at([0, 1 / 4, 1 / 2, 3 / 4])] },
            expect: "fail",
          },
        ],
      },
    },
    {
      id: "S2",
      kind: "make",
      title: "Write what you tapped",
      minutes: 1.5,
      ui: { panels: ROLL, rollLabels: "none", band: false },
      exercise: {
        kind: "code-make",
        id: "write-three-over-two",
        version: 1,
        role: "practice",
        title: "Three against two",
        prompt: "Give the cowbell three even notes a bar against the kick's two, in every bar.",
        skills: [{ skill: "R17", w: 1 }],
        code: { starter: MAKE_STARTER },
        bars: [4, 8],
        saveAs: "sketch",
        rubric: [
          {
            id: "three-against-two",
            label: "The cowbell's three against the kick's two, in the same bars",
            required: true,
            skills: ["R17"],
            rule: "polyrhythm",
            a: "perc",
            b: "kick",
            ratio: [3, 2],
            minBars: 4,
          },
        ],
        hints: ladder(
          "How many notes a bar does the cowbell play now?",
          "The cowbell needs a number of even notes the kick's two does not share.",
          "Only the cowbell's string changes; the kick stays as it is.",
        ),
        tests: [
          { name: "the starter as it is", response: { code: MAKE_STARTER }, expect: "fail" },
          { name: "the cowbell on three", response: { code: MAKE_PASS }, expect: "pass" },
        ],
      },
    },
  ],
});

export default fixture;
