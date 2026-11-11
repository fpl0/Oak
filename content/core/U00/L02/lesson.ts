// U00.L02 Set Up & First Sing. The second onboarding session: headphones, microphone, room noise and
// bleed, tap timing, voice range and sing timing, each an app screen (`<Setup part=…/>`, ux §4.7) inside
// a concept step; then a first sung note, lenient by design (contracts §8.1 item 8), and the loop from
// U00.L01 again, this time ending on the note the learner just sang. All code is the onboarding loop, a
// preview context (contracts §3.1 rule 5a); the learner edits one `n` value. Spec: content/specs/U00.md.
import { defineLesson, type HintLadder } from "@oak/content-kit";

const BPM = 92;
const TEMPO = `setcpm(${BPM}/4)\n\n`;
const DRUMS = 'drums: s("bd ~ sd ~, hh*8").bank("RolandTR808").gain(.8)';
const BASS = 'bass: note("<c2 a1 f1 g1>").s("ebass").lpf(800)';
const CHORDS = 'chords: chord("<C Am F G>").voicing().s("rhodes").gain(.5)';
const mel = (last = "4", cells = `[4 ~ 2 4] [0 ~ ~ 2] [5 ~ 3 5] [${last} ~ ~ ~]`) =>
  `mel: n("<${cells}>").scale("C4:major").s("piano")`;
const loopOf = (...lines: string[]) => `${TEMPO}${lines.join("\n")}`;

/** The onboarding loop of U00.L01 (`ONBOARDING_LOOP` in content/specs/U00.ts), unchanged. */
const LOOP = loopOf(DRUMS, BASS, CHORDS, mel());
/**
 * Sketch 002's band lands home in bar 4 (C under the last melody note, not the loop's G): over G, the home
 * note C4 would be an unresolved sus4 a half step above the Rhodes' B. Checked with headless Strudel.
 */
const HOME_BASS = 'bass: note("<c2 a1 f1 c2>").s("ebass").lpf(800)';
const HOME_CHORDS = 'chords: chord("<C Am F C>").voicing().s("rhodes").gain(.5)';
const homeLoop = (melody: string) => loopOf(DRUMS, HOME_BASS, HOME_CHORDS, melody);
const withLast = (n: string) => homeLoop(mel(n));
/** The note to sing: the loop's home note (C4) on the piano, over the loop's first chord. */
const HOME_NOTE = loopOf(
  'chords: chord("C").voicing().s("rhodes").gain(.4)',
  'mel: n("0").scale("C4:major").s("piano")',
);

const ladder = (nudge: string, pointer: string, partial: string): HintLadder => [
  { text: nudge },
  { text: pointer },
  { text: partial },
  "auto",
];

const NONE = { roll: false, staff: false, keyboard: false } as const;
const ROLL = { roll: true, staff: false, keyboard: false } as const;

export default defineLesson({
  id: "U00.L02",
  version: 1,
  title: "Set Up & First Sing",
  objective:
    "I can sing back a note I hear, and Oak knows my headphones, my microphone, my timing and my range.",
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: BPM,
  introduces: ["V01"],
  practises: [],
  terms: [],
  canDo: ["cd.sing.first-note"],
  wrapAt: "S4",
  steps: [
    {
      id: "S1",
      kind: "concept",
      title: "Headphones on",
      minutes: 1,
      // The loop from the first session plays softly while the learner sets up; it is already a full band.
      ui: { panels: NONE, band: false },
      example: { id: "loop", code: LOOP, bars: 4, preview: true },
    },
    {
      id: "S2",
      kind: "concept",
      title: "Your microphone",
      minutes: 1.25,
      ui: { panels: NONE, band: false },
    },
    {
      id: "S3",
      kind: "concept",
      title: "Your timing",
      minutes: 1,
      ui: { panels: NONE, band: false },
    },
    {
      id: "S4",
      kind: "concept",
      title: "Your voice",
      minutes: 1.5,
      ui: { panels: NONE, band: false },
    },
    {
      id: "S5",
      kind: "sing",
      title: "Sing it back",
      minutes: 1.25,
      ui: { panels: NONE, band: false },
      exercise: {
        kind: "sing",
        id: "first-note",
        version: 1,
        role: "practice",
        prompt:
          "A piano note plays over soft keys. Hum or sing the piano's note back on any vowel and hold it steady for a moment. Higher or lower than the piano is fine.",
        skills: [{ skill: "V01", w: 1 }],
        hints: [
          { text: "Hum it quietly first, with your mouth closed. Does it feel like the same note?" },
          {
            text: "Hold one steady sound. If the trace sits above the lane, ease down; below it, lift a little.",
          },
          { text: "Hear it once more, slower, and hum along while it plays.", replay: { rate: 0.75 } },
          "auto",
        ],
        // Quiet mode or no microphone: the step is skipped, with no penalty (contracts §8.5).
        fallback: "skip",
        mode: "pitch",
        // The loop's home note, C, over the loop's own home chord (contracts §8.1 item 8: "the tonic plays
        // first"). Not the fam.pit.match generator, which picks any note in the learner's range: the Make
        // that follows asks for exactly this note. The family is still seeded for tomorrow's warm-up.
        stimulus: { src: "code", code: HOME_NOTE, bars: 1, showCode: false },
        cue: { context: "none", countInBars: 0, click: false, replays: -1 },
        target: { from: "stimulus", track: "mel" },
        // Contracts §8.1 item 8 asks for ±100 cents here; the schema stops at 70, which is also where every
        // learner's own tolerance starts (§8.2), so `learner` gives the loosest value the schema allows.
        tol: { cents: "learner", octave: "per-note", driftCompCents: 0, minCoverage: 0.4, passHitRate: 1 },
        showTrace: "live",
        srs: [{ family: "fam.pit.match", mode: "seed" }],
        tests: [],
      },
    },
    {
      id: "S6",
      kind: "make",
      title: "Sketch 002",
      minutes: 2,
      // The onboarding loop is already a full band; a Band layer would double every part.
      ui: { panels: ROLL, band: false },
      exercise: {
        kind: "code-make",
        id: "sketch-002",
        version: 1,
        role: "practice",
        prompt:
          "The loop is back, and this time the band ends on its home chord. Change the highlighted number so the tune ends on the note that feels like home too, then save.",
        skills: [
          { skill: "V01", w: 0.5 },
          { skill: "D01", w: 0.5 },
        ],
        code: { starter: homeLoop(mel("⟪4⟫")) },
        bars: [4, 4],
        saveAs: "sketch",
        rubric: [
          {
            id: "ends-home",
            label: "The tune ends on the home note",
            required: true,
            skills: ["V01"],
            rule: "ends-on-degree",
            degrees: ["1"],
            track: "mel",
          },
        ],
        hints: ladder(
          "Play the loop and hum its last note. Does the tune sound finished, or does it want to go on?",
          "The highlighted number is the last note of the tune. Other numbers in the same line already play the home note.",
          "Home is where the second stretch of the tune starts: look at the first number after the second `[`.",
        ),
        tests: [
          {
            name: "the starter ends away from home",
            response: { code: withLast("4") },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          { name: "minimal: home", response: { code: withLast("0") }, expect: "pass" },
          { name: "home, one higher up", response: { code: withLast("7") }, expect: "pass" },
          {
            name: "beyond the brief: a new tune that lands home",
            response: {
              code: homeLoop(mel("4", "[4 ~ 2 4] [5 ~ 4 2] [3 ~ 2 1] [2 1 0 ~]")),
            },
            expect: "pass",
          },
          {
            name: "ends next to home",
            response: { code: withLast("1") },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
        ],
      },
    },
  ],
});
