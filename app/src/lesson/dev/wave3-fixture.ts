// A dev-only lesson that puts every Wave 3 step kind the player renders in one place (the gate sample's idea,
// for U03–U04 shapes not yet in the course): a passive-listen block, a key signature to write in order, notes to
// write on a staff with a key signature, a by-ear transcription with its source hidden, a sight-sing with an
// identify fallback, and a Make. Loaded only in a dev build, at /learn/U04.L99?preview=true (nothing is saved),
// for the lesson suite (app/src/lesson/e2e/wave3.pw.ts) and for looking at the surfaces by hand. Every musical
// answer here is checked by `wave3-fixture.test.ts` against the real grader and headless Strudel.
import { defineLesson, type LessonDef } from "@oak/content-kit";

const BPM = 90;
const T = `setcpm(${BPM}/4)\n\n`;
const deg = (pattern: string, key = "C4:major") => `${T}mel: n("${pattern}").scale("${key}").s("piano")`;

/** Hot Cross Buns (traditional): 3 2 1, then 1 1 1 1 2 2 2 2 in eighths. */
export const BUNS = "<[2 1 0 ~] [0 0 0 0 1 1 1 1]>";
/** The same tune with the second bar's last four notes a step too high: the first wrong bar is 2. */
export const BUNS_WRONG = "<[2 1 0 ~] [0 0 0 0 2 2 2 2]>";
export const BUNS_CODE = deg(BUNS);
/** In G: any key counts (`accepts: "any-key"`). */
export const BUNS_IN_G = deg(BUNS, "G4:major");

export const FIXTURE_ID = "U04.L99";
/** The session the fixture is played as (its tools): everything through U04. */
export const FIXTURE_CONTEXT = "U04.L04";

const fixture: LessonDef = defineLesson({
  id: FIXTURE_ID,
  version: 1,
  title: "Wave 3 step kinds",
  objective: "Every Wave 3 step the player renders, in one place.",
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: BPM,
  introduces: [],
  practises: ["N03", "E07", "V04", "E06"],
  terms: [],
  canDo: [],
  wrapAt: "S3",
  steps: [
    {
      id: "S1",
      kind: "listen",
      title: "Pairs, named as they play",
      minutes: 0.75,
      ui: { panels: { roll: false, staff: false, keyboard: false } },
      exercise: {
        kind: "listen",
        id: "pairs-named",
        version: 1,
        role: "practice",
        prompt: "Just listen: three pairs of notes in a key, each named as it plays.",
        skills: [{ skill: "E06", w: 1 }],
        hints: null,
        tests: [],
        items: [],
        passive: { family: "fam.int.in-key", level: 3, items: 3, reveal: "with", gapBeats: 1 },
      },
    },
    {
      id: "S2",
      kind: "notate",
      title: "D major's key signature",
      minutes: 1,
      graded: true,
      ui: { panels: { roll: false, staff: "treble", keyboard: false } },
      exercise: {
        kind: "staff-write",
        id: "d-major-signature",
        version: 1,
        role: "check",
        prompt: "Write the key signature of D major: its sharps, in the order they are written.",
        skills: [{ skill: "N03", w: 1 }],
        hints: [
          { text: "How many sharps does D major have?" },
          { text: "Sharps are always written in the same order: F, C, G, D, A, E, B." },
          { text: "D major has two: the first two of that order." },
          "auto",
        ],
        answer: {
          ui: "staff-input",
          clef: "treble",
          bars: 1,
          palette: { durations: ["4"], accidentals: true, ties: false, rests: false },
          mode: "key-signature",
        },
        expect: { e: "key-signature", key: { tonic: "D", mode: "major" }, order: "sequence" },
        tests: [
          { name: "F# then C#", response: { answer: { text: ["F#", "C#"] } }, expect: "pass" },
          {
            name: "only F#",
            response: { answer: { text: ["F#"] } },
            expect: "fail",
            feedback: ["keysig.count"],
          },
        ],
      },
    },
    {
      id: "S3",
      kind: "notate",
      title: "G major on the staff",
      minutes: 1.25,
      graded: true,
      ui: { panels: { roll: false, staff: "treble", keyboard: false } },
      exercise: {
        kind: "staff-write",
        id: "g-major-on-the-staff",
        version: 1,
        role: "check",
        key: { tonic: "G", mode: "major" },
        prompt:
          "Write the G major scale from G4 up to G5, one note to a beat. The key signature is already there.",
        skills: [{ skill: "N03", w: 1 }],
        hints: [
          { text: "Which note of the scale does the key signature change?" },
          { text: "The sharp on the top line makes every F an F♯." },
          { text: "G A B C, then D E F♯ G." },
          "auto",
        ],
        answer: {
          ui: "staff-input",
          clef: "treble",
          bars: 2,
          palette: { durations: ["4"], accidentals: true, ties: false, rests: false },
          key: { tonic: "G", mode: "major" },
        },
        expect: {
          e: "pitches",
          spelled: ["G4", "A4", "B4", "C5", "D5", "E5", "F#5", "G5"],
          order: "sequence",
          withOctave: true,
        },
        tests: [
          {
            name: "the scale",
            response: { staff: "G4:4 A4:4 B4:4 C5:4 | D5:4 E5:4 F#5:4 G5:4" },
            expect: "pass",
          },
          {
            name: "F natural",
            response: { staff: "G4:4 A4:4 B4:4 C5:4 | D5:4 E5:4 F5:4 G5:4" },
            expect: "fail",
          },
        ],
      },
    },
    {
      id: "S4",
      kind: "dictate",
      title: "A tune by ear",
      minutes: 1.75,
      graded: true,
      ui: { panels: { roll: true, staff: false, keyboard: false } },
      exercise: {
        kind: "dictation",
        id: "buns-by-ear",
        version: 1,
        role: "check",
        prompt: "Play the tune. Write it with `n`, two bars, in any key you like.",
        skills: [{ skill: "E07", w: 1 }],
        hints: [
          { text: "Which note does the tune end on? Is it home?" },
          { text: "Bar 1 steps down to home; bar 2 repeats two notes, four times each." },
          { text: "Bar 1 is `[2 1 0 ~]`." },
          "auto",
        ],
        domain: "melody",
        stimulus: { src: "code", code: BUNS_CODE, bars: 2, showCode: false },
        cue: { context: "none", countInBars: 0, click: false, replays: -1 },
        answer: { ui: "code", starter: deg("<⟪[0 ~ ~ ~] [0 ~ ~ ~]⟫>") },
        reference: { solutions: [BUNS_CODE], bars: 2 },
        matcher: {
          m: "melody",
          pitch: "transposition-invariant",
          wPitch: 0.7,
          wRhythm: 0.3,
          rhythmTol: [1, 16],
        },
        byEar: { ab: true, rates: [1, 0.75, 0.5], accepts: "any-key" },
        tests: [
          { name: "the tune", response: { code: BUNS_CODE }, expect: "pass" },
          { name: "in G", response: { code: BUNS_IN_G }, expect: "pass" },
          { name: "bar 2 too high", response: { code: deg(BUNS_WRONG) }, expect: "fail" },
        ],
      },
    },
    {
      id: "S5",
      kind: "sing",
      title: "Sight-sing it",
      minutes: 1,
      ui: { panels: { roll: false, staff: false, keyboard: false } },
      exercise: {
        kind: "sing",
        id: "sight-sing",
        version: 1,
        role: "practice",
        prompt: "Read the five notes, then sing them on syllables after the chords that set home.",
        skills: [{ skill: "V04", w: 1 }],
        hints: [
          { text: "Hum home first." },
          { text: "It steps up from do to mi and back." },
          { text: "do re mi re do." },
          "auto",
        ],
        fallback: "identify",
        mode: "sight",
        stimulus: { src: "code", code: deg("0 1 2 1 0 ~ ~ ~"), bars: 1, showCode: false, showStaff: true },
        cue: { context: "cadence", countInBars: 1, click: false, replays: -1 },
        target: { from: "degrees", degrees: ["1", "2", "3", "2", "1"], rhythm: "1 2 3 2 1 ~ ~ ~" },
        labels: "syllables",
        tol: { cents: "learner", octave: "global", driftCompCents: 30, minCoverage: 0.4, passHitRate: 0.8 },
        showTrace: "live",
        tests: [],
      },
    },
    {
      id: "S6",
      kind: "make",
      title: "A two-bar answer",
      minutes: 2,
      ui: { panels: { roll: true, staff: false, keyboard: false }, rollLabels: "degree+solfege" },
      exercise: {
        kind: "code-make",
        id: "two-bar-answer",
        version: 1,
        role: "practice",
        title: "Sketch W3",
        prompt: "Answer the tune with two bars of your own that end on home.",
        skills: [{ skill: "V04", w: 1 }],
        code: { starter: deg("<[2 1 0 ~] [4 3 2 ~]>") },
        bars: [2, 4],
        saveAs: "sketch",
        rubric: [
          {
            id: "home",
            label: "Ends on 1, home",
            required: true,
            skills: ["V04"],
            rule: "ends-on-degree",
            track: "@melody",
            degrees: ["1"],
          },
        ],
        hints: [
          { text: "Where does the second bar end?" },
          { text: "Home is `n` 0." },
          { text: "End bar 2 on 0." },
          "auto",
        ],
        tests: [
          { name: "starter ends on 3", response: { code: deg("<[2 1 0 ~] [4 3 2 ~]>") }, expect: "fail" },
          { name: "ends home", response: { code: deg("<[2 1 0 ~] [4 3 1 0]>") }, expect: "pass" },
        ],
      },
    },
  ],
});

export default fixture;
