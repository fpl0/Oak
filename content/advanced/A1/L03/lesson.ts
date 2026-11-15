// A1.L03 Envelopes (spec: content/specs/A1.md). Every note has a shape in time, its envelope: how fast it
// starts (attack), how fast it falls (decay), the level it holds while the note lasts (sustain) and how long
// it rings after it ends (release), each set with `.attack() .decay() .sustain() .release()` (`tb.adsr`,
// unlocked here). A pluck is a fast attack and a short decay to nothing; a pad is a slow attack, full sustain
// and a long release.
//
// A side lesson (contracts §2.6): it opens once U03.L02 is done, so it uses only what U03.L02 guarantees plus
// A1's own unlocks (`.scope()`, `.partials()`, the filters of A1.L02, the envelope here). No `ebass`, no `,`
// inside mini-notation, no chords by name, no `arrange()`.
//
// It starts from the A1 loop as A1.L02 leaves it (filtered, every note in its default shape) and ends with a
// bass that punches and stops under a riff that swells in and rings on. The Band plays the chords only.
//
// How it is graded: S4 and S5 are "match this sound" steps on the `controls` matcher, which applies
// superdough's envelope rules to what the code leaves out (`.decay(.2)` alone falls to nothing; `.attack()`
// alone holds at full level), with `edit-only-regions` keeping the notes; S6 is a `fam.snd.params` level 3
// ear step (softer start or longer tail); the Make requires an envelope you hear (`control-set` with
// `envelope: true`, carry f4). S3 opens
// the scope panel and S3–S5 draw the `envelope` probe beside the part they shape (`ui.probe`, feature
// `step.probe`).
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

/** The A1 loop (A1.L01): three drum lines, a bass in note names, a riff in degrees. */
const DRUMS = ['kick: s("bd ~ bd ~")', 'snare: s("~ sd ~ sd")', 'hats: s("hh*8").gain(.5)'];
/** C | F under the Band's I | IV: root, root, the 5th below (g1 under C, c2 under F). */
const BASS_NOTES = "<[c2 ~ c2 g1] [f1 ~ f1 c2]>";
/** G G E G – E C – | A A F A – F C –: every note on a beat is in the Band's chord (C, then F). */
const RIFF = "<[4 4 2 4 ~ 2 0 ~] [5 5 3 5 ~ 3 0 ~]>";
/** The same riff on quarter notes, room for a slow start: G – E – | A – F –. */
const RIFF_LONG = "<[4 ~ 2 ~] [5 ~ 3 ~]>";
const bass = (tail: string) => `bass: note("${BASS_NOTES}")${tail}`;
const riff = (tail: string) => `mel: n("${RIFF}").scale("C4:major")${tail}`;
const riffLong = (tail: string) => `mel: n("${RIFF_LONG}").scale("C4:major")${tail}`;

/** The loop as A1.L02 leaves it: filtered, every note in its default shape. The Make's starter. */
const FILTERED = code(...DRUMS, bass('.s("sawtooth").lpf(500)'), riff('.s("square").lpf(2000).gain(.8)'));
/** The hook: a plucked bass under a riff that swells in and rings on. */
const SHAPED = code(
  ...DRUMS,
  bass('.s("sawtooth").lpf(500).decay(.2).sustain(0)'),
  riffLong('.s("square").attack(.3).release(.8).gain(.7)'),
);

/** S2: one held c4, its start slower each bar. */
const SWELL = 'mel: note("c4").s("sawtooth").attack("<0 .1 .3 .6>").gain(.7)';
/** S3: one quarter note with all four stages set. */
const ONE_NOTE = 'mel: note("c4 ~ ~ ~").s("sawtooth").attack(.3).decay(.2).sustain(.5).release(.8).scope()';

/** S4: the bass over the drums; only its shape changes. */
const bassWith = (tail: string) => code(...DRUMS, bass(`.s("sawtooth").lpf(500)${tail}`));
const PLUCK_STARTER = bassWith("⟪⟫");
const PLUCK_SOLUTION = bassWith(".decay(.2).sustain(0)");

/** S5: the riff on quarter notes over the drums; only its shape changes. */
const padWith = (tail: string) => code(...DRUMS, riffLong(`.s("square")${tail}.gain(.7)`));
const PAD_STARTER = padWith("⟪⟫");
const PAD_SOLUTION = padWith(".attack(.3).release(.8)");

const NONE = { roll: false, staff: false, keyboard: false } as const;
const ROLL = { roll: true, staff: false, keyboard: false } as const;
const CHORDS = { band: "band.two-chord-vamp", tracks: ["chords"] } as const;

export default defineLesson({
  id: "A1.L03",
  version: 1,
  title: "Envelopes",
  objective:
    "I can shape how each note starts, falls, holds and ends with `.attack() .decay() .sustain() .release()`.",
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: BPM,
  introduces: ["D04"],
  practises: [],
  terms: [{ id: "term.envelope", step: "S3" }],
  canDo: ["cd.code.envelopes"],
  wrapAt: "S4",
  steps: [
    {
      id: "S1",
      kind: "listen",
      title: "Pluck and swell",
      minutes: 0.5,
      ui: { panels: ROLL, band: CHORDS },
      example: { id: "hook", code: SHAPED, bars: 2 },
      exercise: {
        kind: "listen",
        id: "pluck-and-swell",
        version: 1,
        role: "practice",
        prompt:
          "Press Play: the loop from Filters, then the same loop with every note given a shape. Listen to how each bass note stops and how each riff note starts.",
        skills: [{ skill: "D04", w: 1 }],
        hints: null,
        tests: [],
        items: [
          { code: FILTERED, caption: "Every note in its default shape: on at once, off at once.", bars: 2 },
          {
            code: SHAPED,
            caption:
              "The bass punches and stops; the riff, on fewer and longer notes, swells in and rings on.",
            bars: 2,
          },
        ],
      },
    },
    {
      id: "S2",
      kind: "predict",
      title: "A slower start",
      minutes: 0.5,
      ui: { panels: NONE },
      exercise: {
        kind: "predict",
        id: "a-slower-start",
        version: 1,
        role: "practice",
        prompt:
          "One c4 held for a whole bar, four bars. `.attack()` sets how many seconds a note takes to reach full level: 0, then 0.1, 0.3 and 0.6. What changes from bar to bar?",
        skills: [{ skill: "D04", w: 1 }],
        hints: null,
        tests: [],
        code: code(SWELL),
        bars: 4,
        mode: "choose",
        choices: [
          { id: "fade-in", label: "It fades in more slowly each bar" },
          { id: "shorter", label: "It gets shorter each bar" },
          { id: "higher", label: "It gets higher each bar" },
        ],
        correct: ["fade-in"],
      },
    },
    {
      id: "S3",
      kind: "investigate",
      title: "Four stages",
      minutes: 1,
      ui: { panels: NONE, initialPanels: ["scope"], probe: { kind: "envelope", track: "mel" } },
      example: { id: "four-stages", code: code(ONE_NOTE), bars: 1 },
      exercise: {
        kind: "run-investigate",
        id: "four-stages",
        version: 1,
        role: "practice",
        prompt:
          "One note, one beat long, with all four controls set. Run it and watch the scope: the wave grows, falls back to half, holds, then dies away after the beat. Which control does what?",
        skills: [{ skill: "D04", w: 1 }],
        feedbackText: {
          "investigate.wrong":
            "Not quite. Four controls, four stages in order: the start, the fall, the level held while the note lasts, and the tail after it ends.",
        },
        hints: ladder(
          "The note lasts one beat. What do you hear after that beat is over?",
          "The controls come in the order they happen to the note: start, fall, hold, and what happens after the note ends.",
          "`.attack(.3)` is the start and `.decay(.2)` the fall. Two left.",
        ),
        code: { starter: code(ONE_NOTE) },
        mustPlayLoops: 1,
        questions: [
          {
            q: "choice",
            prompt: "Which control makes the note ring on after it ends?",
            options: [
              { id: "attack", label: "`.attack()`" },
              { id: "sustain", label: "`.sustain()`" },
              { id: "release", label: "`.release()`" },
            ],
            correct: ["release"],
          },
          {
            q: "number",
            prompt: "For how many seconds does it ring on after the note ends?",
            correct: 0.8,
            tol: 0.05,
          },
        ],
        tests: [
          {
            name: "both right",
            response: { answer: { number: 0.8, choice: ["release"] } },
            expect: "pass",
          },
          {
            name: "sustain for the tail",
            response: { answer: { number: 0.8, choice: ["sustain"] } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
          {
            name: "the sustain level read as seconds",
            response: { answer: { number: 0.5, choice: ["release"] } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
        ],
      },
    },
    {
      id: "S4",
      kind: "modify",
      title: "Pluck the bass",
      minutes: 1.25,
      graded: true,
      ui: { panels: ROLL, probe: { kind: "envelope", track: "bass" } },
      exercise: {
        kind: "code-modify",
        id: "pluck-the-bass",
        version: 1,
        role: "check",
        prompt:
          "Play the target, then yours. In the target each bass note hits and dies away fast, even while it is held: a pluck. Give the bass that shape.",
        skills: [{ skill: "D04", w: 1 }],
        code: { starter: PLUCK_STARTER },
        reference: { solutions: [PLUCK_SOLUTION], bars: 2 },
        matcher: {
          m: "controls",
          track: "bass",
          controls: [
            { control: "decay", scale: "linear", tol: 0.1 },
            { control: "sustain", scale: "linear", tol: 0.1 },
          ],
        },
        constraints: [{ c: "edit-only-regions", feedback: "code.edit-outside" }],
        target: { audible: true, showRoll: false },
        hints: ladder(
          "Which stage of the note do you need: the start, the fall, the hold or the tail?",
          "The fall is `.decay()`, in seconds; the level the note holds after it is `.sustain()`, from 0 to 1.",
          "The target holds nothing after its fall, so its sustain is 0. How fast does it fall: a fifth of a second, or two seconds?",
        ),
        tests: [
          { name: "reference", response: { code: PLUCK_SOLUTION }, expect: "pass" },
          {
            name: "decay alone: the sustain falls to nothing",
            response: { code: bassWith(".decay(.25)") },
            expect: "pass",
          },
          {
            name: "unchanged",
            response: { code: bassWith("") },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "sustain 0 alone: every note a click",
            response: { code: bassWith(".sustain(0)") },
            expect: "fail",
            feedback: ["code.control-off"],
          },
          {
            name: "the tail set instead of the fall",
            response: { code: bassWith(".release(.2)") },
            expect: "fail",
            feedback: ["code.control-off"],
          },
          {
            name: "the bass's notes changed as well",
            response: {
              code: code(
                ...DRUMS,
                'bass: note("<[c2 ~ c2 g1] [f1 ~ f1 g1]>").s("sawtooth").lpf(500).decay(.2).sustain(0)',
              ),
            },
            expect: "fail",
            feedback: ["code.edit-outside"],
          },
        ],
      },
    },
    {
      id: "S5",
      kind: "modify",
      title: "Swell the riff",
      minutes: 1.25,
      graded: true,
      ui: { panels: ROLL, probe: { kind: "envelope", track: "mel" } },
      exercise: {
        kind: "code-modify",
        id: "swell-the-riff",
        version: 1,
        role: "check",
        prompt:
          "The riff on longer notes, G and E, then A and F. In the target each note swells in and rings on after it ends, like a pad. Match it with two controls.",
        skills: [{ skill: "D04", w: 1 }],
        code: { starter: PAD_STARTER },
        reference: { solutions: [PAD_SOLUTION], bars: 2 },
        matcher: {
          m: "controls",
          track: "mel",
          controls: [
            { control: "attack", scale: "linear", tol: 0.15 },
            { control: "release", scale: "linear", tol: 0.3 },
          ],
        },
        constraints: [{ c: "edit-only-regions", feedback: "code.edit-outside" }],
        target: { audible: true, showRoll: false },
        hints: ladder(
          "Which two stages does the target change: the start, the fall, the hold or the tail?",
          "The start is `.attack()` and the tail `.release()`, both in seconds. A beat here lasts 0.6 seconds.",
          "The swell takes about half a beat. Now the tail: longer or shorter than a beat?",
        ),
        tests: [
          { name: "reference", response: { code: PAD_SOLUTION }, expect: "pass" },
          { name: "close enough", response: { code: padWith(".attack(.25).release(1)") }, expect: "pass" },
          {
            name: "unchanged",
            response: { code: padWith("") },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "the swell without the tail",
            response: { code: padWith(".attack(.3)") },
            expect: "fail",
            feedback: ["code.control-off"],
          },
          {
            name: "three seconds for three tenths",
            response: { code: padWith(".attack(3).release(.8)") },
            expect: "fail",
            feedback: ["code.control-off"],
          },
          {
            name: "the riff's notes changed as well",
            response: {
              code: code(
                ...DRUMS,
                'mel: n("<[4 ~ 2 ~] [5 ~ 4 ~]>").scale("C4:major").s("square").attack(.3).release(.8).gain(.7)',
              ),
            },
            expect: "fail",
            feedback: ["code.edit-outside"],
          },
        ],
      },
    },
    {
      id: "S6",
      kind: "ear",
      title: "Start or tail",
      minutes: 1.25,
      graded: true,
      ui: { panels: NONE },
      exercise: {
        kind: "identify",
        id: "start-or-tail",
        version: 1,
        role: "check",
        prompt:
          "One phrase, twice. Between bar 1 and bar 2 one stage of the envelope changed. Softer start, or longer tail?",
        skills: [{ skill: "D04", w: 1 }],
        hints: [
          { text: "Listen to the first moment of each note in bar 2, then to the gap after it." },
          {
            text: "A longer attack blurs the start of each note; a longer release fills the gaps between notes.",
          },
          { text: "Hear it again, slower, and listen to the gaps.", replay: { rate: 0.75 } },
          "auto",
        ],
        stimulus: { src: "generator", family: "fam.snd.params", level: 3 },
        cue: { context: "none", countInBars: 0, click: false, replays: -1 },
        answer: {
          ui: "choice",
          options: [
            { id: "slow-attack", label: "Softer start (longer attack)" },
            { id: "long-release", label: "Longer tail (longer release)" },
          ],
        },
        correct: {},
        srs: [{ family: "fam.snd.params", mode: "review-if-due" }],
        tests: [],
      },
    },
    {
      id: "S7",
      kind: "make",
      title: "Shape your loop",
      minutes: 2.75,
      ui: { panels: ROLL, band: CHORDS },
      exercise: {
        kind: "code-make",
        id: "shape-your-loop",
        version: 1,
        role: "practice",
        prompt:
          "The loop from Filters, every note in its default shape. Give the bass a shape and the riff another: a punchy pluck, a slow swell, a long tail. Or bring a loop of your own.",
        skills: [{ skill: "D04", w: 1 }],
        code: { starter: FILTERED },
        bars: [2, 8],
        saveAs: "sketch",
        rubric: [
          {
            id: "a-shape",
            label: "A part shaped with attack, decay, sustain or release",
            required: true,
            skills: ["D04"],
            // Carry f4 (corrections pass): what is heard, not the call. The envelope superdough plays must differ
            // from the default: a start of 20 ms or more, a tail of 100 ms or more, or a fall to .4 or under.
            // `.attack(.001)` or `.sustain(.6)` is where the sound already is.
            rule: "custom",
            fn: "control-set",
            params: { envelope: true },
          },
          {
            id: "two-shapes",
            label: "Two or more envelope controls",
            required: false,
            skills: ["D04"],
            rule: "uses",
            tool: "tb.adsr",
            min: 2,
          },
          {
            id: "filter-envelope-too",
            label: "A part plucked with .lpenv() as well",
            required: false,
            skills: ["D03"],
            rule: "uses",
            tool: "tb.lpenv",
          },
        ],
        // The override serves every rule of the rubric, suggestions included, so it stays neutral.
        feedbackText: { "rubric.unmet": "{label}: not yet." },
        hints: ladder(
          "Which part should punch, and which should float?",
          "A pluck falls fast to nothing: `.decay()` with `.sustain(0)`. A swell starts slowly and rings on: `.attack()` with `.release()`.",
          "Try the bass first: a decay of a fifth of a second and nothing held.",
        ),
        tests: [
          {
            name: "the starter as it is",
            response: { code: FILTERED },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "minimal: the bass plucked",
            response: {
              code: code(
                ...DRUMS,
                bass('.s("sawtooth").lpf(500).decay(.15)'),
                riff('.s("square").lpf(2000).gain(.8)'),
              ),
            },
            expect: "pass",
          },
          { name: "beyond the brief: pluck and swell", response: { code: SHAPED }, expect: "pass" },
          {
            name: "the riff swelling in, on a line of its own",
            response: {
              code: code(
                ...DRUMS,
                bass('.s("sawtooth").lpf(500)'),
                riff('.s("square").lpf(2000).attack(.2).gain(.8)'),
              ),
            },
            expect: "pass",
          },
          {
            name: "a long tail on the riff",
            response: {
              code: code(
                ...DRUMS,
                bass('.s("sawtooth").lpf(500)'),
                riff('.s("square").lpf(2000).release(.6).gain(.8)'),
              ),
            },
            expect: "pass",
          },
          {
            name: "right function, the default shape written out",
            response: {
              code: code(
                ...DRUMS,
                bass('.s("sawtooth").lpf(500).attack(.001).sustain(.6)'),
                riff('.s("square").lpf(2000).gain(.8)'),
              ),
            },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "plucked, then muted",
            response: {
              code: code(
                ...DRUMS,
                bass('.s("sawtooth").lpf(500).decay(.15).gain(0)'),
                riff('.s("square").lpf(2000).gain(.8)'),
              ),
            },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "short notes with .clip() instead",
            response: {
              code: code(
                ...DRUMS,
                bass('.s("sawtooth").lpf(500).clip(.5)'),
                riff('.s("square").lpf(2000).gain(.8)'),
              ),
            },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
        ],
      },
    },
  ],
});
