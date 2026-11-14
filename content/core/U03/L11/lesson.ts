// U03.L11 Melody Workshop. A melody of eight bars pauses half-way on an open degree and comes home to 1 at
// the end, the way the harmony under it does. The Band is new: `band.phrase-8bar`, I IV I V | I IV V I, one
// chord a bar. `acgtr` unlocks here (contracts §3.2), so the lesson's tune is on acoustic guitar from the
// first step. What the learner has: degrees in `n` and keys as one word (U03.L02–L05), syllables (U03.L08),
// leaps and `.legato()` (U03.L09), a phrase answered by its own shape (U03.L10). Not yet: the word for an
// ending made by chords (U06.L04); in this lesson it is "a comma" and "home". Spec: content/specs/U03.md.
import { defineLesson, type HintLadder } from "@oak/content-kit";

const BPM = 96;
const TEMPO = `setcpm(${BPM}/4)\n\n`;
/** A line written in degrees over C major, on acoustic guitar unless said otherwise. */
const deg = (pattern: string, sound = "acgtr", key = "C4:major", extra = "") =>
  `${TEMPO}mel: n("${pattern}").scale("${key}").s("${sound}")${extra}`;
/** Eight bars as one `< >` pattern. */
const bars = (b: readonly string[]) => `<${b.join(" ")}>`;

const ladder = (nudge: string, pointer: string, partial: string): HintLadder => [
  { text: nudge },
  { text: pointer },
  { text: partial },
  "auto",
];

/**
 * The tune, bar by bar, over I IV I V | I IV V I. Bar 4 pauses on 5 (G) over V; bar 8 lands on 1 over I.
 * Bars 5 and 1 are the same, so the second half starts like the first. Every held note is a chord tone.
 */
const TUNE = [
  "[0 2 4 2]",
  "[3 ~ 2 ~]",
  "[2 4 7 4]",
  "[6 ~ 4 ~]",
  "[0 2 4 2]",
  "[5 ~ 4 ~]",
  "[3 2 1 ~]",
  "[0 ~ ~ ~]",
] as const;
const with_ = (i: number, bar: string) => TUNE.map((b, j) => (j === i ? bar : b));
const HOOK = deg(bars(TUNE));

/** S3: the draft stops on 2 (D) in bar 8, over the I chord: it has not got home. */
const OFF_HOME = "[1 ~ ~ ~]";
/** S4: the draft's bar 5 walks home at once (5 3 1), so the tune sounds over at its half-way point. */
const TOO_SOON = "[4 2 0 ~]";
/** S6: bars 7–8, sung back: 4 3 2 | 1 (fa mi re | do). */
const LAST_TWO = deg("<[3 2 1 ~] [0 ~ ~ ~]>");
/** The Make's outline: a pause on 5 in bar 4, but bar 8 stops on 2. On piano until the learner picks. */
const OUTLINE = "<[0 2 4 ~] [3 ~ 2 ~] [4 ~ ~ ~] [4 ~ ~ ~] [0 2 4 ~] [3 ~ 2 ~] [1 ~ ~ ~] [1 ~ ~ ~]>";

/** The Band takes the key of the learner's `.scale()`. */
const BAND = { band: "band.phrase-8bar", followsLearnerKey: true } as const;
const NONE = { roll: false, staff: false, keyboard: false } as const;
const ROLL = { roll: true, staff: false, keyboard: false } as const;
const ROLL_STAFF = { roll: true, staff: "treble", keyboard: false } as const;

export default defineLesson({
  id: "U03.L11",
  version: 1,
  title: "Melody Workshop",
  objective: "I can write an eight-bar melody that pauses half-way and comes home to 1 at the end.",
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: BPM,
  introduces: [],
  practises: ["M01", "S03"],
  terms: [],
  canDo: ["cd.compose.melody-on-1"],
  wrapAt: "S4",
  steps: [
    {
      id: "S1",
      kind: "listen",
      title: "Eight bars",
      minutes: 0.5,
      ui: { panels: ROLL, rollLabels: "degree+solfege", band: BAND },
      example: { id: "hook", code: HOOK, bars: 8 },
      exercise: {
        kind: "listen",
        id: "eight-bars",
        version: 1,
        role: "practice",
        prompt: "Press Play. Eight bars on acoustic guitar over a new band. Listen for where it rests.",
        skills: [{ skill: "M01", w: 1 }],
        hints: null,
        tests: [],
        items: [{ code: HOOK, caption: "Eight bars that pause half-way and end at home.", bars: 8 }],
      },
    },
    {
      id: "S2",
      kind: "investigate",
      title: "Comma and full stop",
      minutes: 1,
      ui: { panels: ROLL_STAFF, rollLabels: "degree+solfege", staffLabels: "degree+solfege", band: BAND },
      example: { id: "tune", code: HOOK, bars: 8 },
      exercise: {
        kind: "run-investigate",
        id: "comma-and-full-stop",
        version: 1,
        role: "practice",
        prompt:
          "Run it and follow the labels. One bar in the middle sounds like a comma: a pause that wants to go on. The last bar sounds like a full stop.",
        skills: [
          { skill: "M01", w: 0.7 },
          { skill: "E04", w: 0.3 },
        ],
        feedbackText: {
          "investigate.wrong":
            "Not quite. Play bars 2, 4 and 6 again: after which one does the tune hold a note that sounds open, not finished?",
        },
        hints: ladder(
          "Which bars end with a held note? Of those, which sounds most like a pause?",
          "A comma rests on an open degree, such as 5. A full stop rests on 1. Read the labels on the held notes.",
          "Bar 2 rests on 3, bars 4 and 6 on 5. Of those two, which one comes right before the tune starts over?",
        ),
        code: { starter: HOOK },
        mustPlayLoops: 1,
        questions: [
          {
            q: "choice",
            prompt: "Which bar sounds like a comma?",
            options: [
              { id: "bar-2", label: "Bar 2" },
              { id: "bar-4", label: "Bar 4" },
              { id: "bar-6", label: "Bar 6" },
            ],
            correct: ["bar-4"],
          },
          { q: "number", prompt: "On which degree does bar 8 end?", correct: 1 },
        ],
        tests: [
          { name: "both right", response: { answer: { choice: ["bar-4"], number: 1 } }, expect: "pass" },
          {
            name: "bar 2",
            response: { answer: { choice: ["bar-2"], number: 1 } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
          {
            name: "the n, not the degree",
            response: { answer: { choice: ["bar-4"], number: 0 } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
        ],
      },
    },
    {
      id: "S3",
      kind: "modify",
      title: "Bring it home",
      minutes: 1.25,
      graded: true,
      ui: { panels: ROLL_STAFF, rollLabels: "degree+solfege", staffLabels: "degree+solfege", band: BAND },
      exercise: {
        kind: "code-modify",
        id: "bring-it-home",
        version: 1,
        role: "check",
        prompt: "This draft stops in bar 8 without getting home. Change bar 8 so the tune ends on 1.",
        skills: [
          { skill: "M01", w: 0.6 },
          { skill: "E04", w: 0.4 },
        ],
        code: {
          starter: deg(`<${TUNE.slice(0, 7).join(" ")} ⟪${OFF_HOME}⟫>`),
        },
        reference: { solutions: [HOOK], bars: 8 },
        // Any way home passes: one note, a walk down, the 1 an octave up.
        matcher: {
          m: "rubric",
          rules: [
            {
              id: "ends-home",
              label: "Ends on 1",
              required: true,
              skills: ["M01"],
              rule: "ends-on-degree",
              track: "@melody",
              degrees: ["1"],
            },
          ],
        },
        constraints: [{ c: "edit-only-regions", feedback: "code.edit-outside" }],
        target: { audible: true, showRoll: false },
        hints: ladder(
          "Sing bar 7 and bar 8. Does the last note sound finished?",
          "Bar 8 holds `n` 1: degree 2, re, one note above home. Which `n` plays home?",
          "Keep the bar's rhythm, one note and then three beats of rest, and change only its number to home's.",
        ),
        srs: [{ family: "fam.deg.fet-major", mode: "evidence-only" }],
        tests: [
          { name: "reference", response: { code: HOOK }, expect: "pass" },
          { name: "held with @", response: { code: deg(bars(with_(7, "[0@4]"))) }, expect: "pass" },
          {
            name: "a walk down to home",
            response: { code: deg(bars(with_(7, "[2 1 0 ~]"))) },
            expect: "pass",
          },
          { name: "home an octave up", response: { code: deg(bars(with_(7, "[7 ~ ~ ~]"))) }, expect: "pass" },
          {
            name: "unchanged",
            response: { code: deg(bars(with_(7, OFF_HOME))) },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "ends on 5",
            response: { code: deg(bars(with_(7, "[4 ~ ~ ~]"))) },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "bar 7 changed as well",
            response: { code: deg(bars([...TUNE.slice(0, 6), "[3 2 2 ~]", "[0 ~ ~ ~]"])) },
            expect: "fail",
            feedback: ["code.edit-outside"],
          },
        ],
      },
    },
    {
      id: "S4",
      kind: "modify",
      title: "Start again",
      minutes: 1,
      graded: true,
      ui: { panels: ROLL_STAFF, rollLabels: "degree+solfege", staffLabels: "degree+solfege", band: BAND },
      exercise: {
        kind: "code-modify",
        id: "start-again",
        version: 1,
        role: "check",
        prompt:
          "In this draft, bar 5 walks straight home and the tune sounds over half-way. Make bar 5 start the second half the way bar 1 starts the first.",
        skills: [{ skill: "M01", w: 1 }],
        code: {
          starter: deg(`<${TUNE.slice(0, 4).join(" ")} ⟪${TOO_SOON}⟫ ${TUNE.slice(5).join(" ")}>`),
        },
        reference: { solutions: [HOOK], bars: 8 },
        // Bar 5 repeats bar 1's steps, exactly or moved; only bar 5 can change.
        matcher: {
          m: "rubric",
          rules: [
            {
              id: "reuse",
              label: "Bar 5 reuses the shape of bar 1",
              required: true,
              skills: ["M01"],
              // Corrections pass: bar 5 against bar 1 only. `motif-reuse` took any earlier bar, so bar 5 written as
              // bar 2's `[3 ~ 2 ~]` or bar 3's `[2 4 7 4]` passed. The shape is compared in half steps, at any
              // height (`minSemis: 0`: bar 1 itself is the reference's answer).
              rule: "custom",
              fn: "transposed-copy",
              params: { track: "@melody", pairs: [[1, 5]], minSemis: 0 },
            },
          ],
        },
        constraints: [{ c: "edit-only-regions", feedback: "code.edit-outside" }],
        target: { audible: true, showRoll: false },
        // The check compares half steps: bar 1 moved by one degree (1 3 5 3 to 2 4 6 4) turns its major 3rds
        // into minor ones and does not count, so the hint names the moves that keep the shape.
        feedbackText: {
          "rubric.unmet":
            "{label}: not yet. Bar 5 needs bar 1's exact shape, every distance the same in half steps: its four numbers, all four plus 7 for the octave above, or the same distances from another note (F A C A keeps them).",
        },
        hints: ladder(
          "Sing bar 1, then bar 5. Which one sounds like a beginning?",
          "Copy bar 1's four numbers into bar 5, or add 7 to each of them: the same notes an octave up.",
          "Bar 1 climbs 1, 3, 5 and drops back to 3. Bar 5 can do exactly that, from home or from the 1 above.",
        ),
        tests: [
          { name: "reference", response: { code: HOOK }, expect: "pass" },
          {
            name: "bar 1 an octave up",
            response: { code: deg(bars(with_(4, "[7 9 11 9]"))) },
            expect: "pass",
          },
          {
            name: "unchanged",
            response: { code: deg(bars(with_(4, TOO_SOON))) },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "a new idea in bar 5",
            response: { code: deg(bars(with_(4, "[4 ~ 2 ~]"))) },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            // The old hint ("move all four by the same amount") led here: one degree up, the 3rds change size.
            name: "bar 1 moved up one degree",
            response: { code: deg(bars(with_(4, "[1 3 5 3]"))) },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            // The outside review's counterexamples: bar 5 copies another earlier bar, not bar 1.
            name: "bar 5 copies bar 2",
            response: { code: deg(bars(with_(4, "[3 ~ 2 ~]"))) },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "bar 5 copies bar 3",
            response: { code: deg(bars(with_(4, "[2 4 7 4]"))) },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            // F A C A keeps every half step of C E G E: the same shape a 4th up.
            name: "bar 1's shape a 4th up, from F",
            response: { code: deg(bars(with_(4, "[3 5 7 5]"))) },
            expect: "pass",
          },
          {
            name: "bar 1 an octave down",
            response: { code: deg(bars(with_(4, "[-7 -5 -3 -5]"))) },
            expect: "pass",
          },
          {
            name: "bars 5 and 6 both rewritten",
            response: { code: deg(bars([...TUNE.slice(0, 4), "[0 2 4 2]", "[3 ~ 2 ~]", ...TUNE.slice(6)])) },
            expect: "fail",
            feedback: ["code.edit-outside"],
          },
        ],
      },
    },
    {
      id: "S5",
      kind: "ear",
      title: "Any degree",
      minutes: 1.25,
      graded: true,
      ui: { panels: NONE },
      exercise: {
        kind: "identify",
        id: "any-degree",
        version: 1,
        role: "check",
        prompt: "Chords set home, then one note. Which degree is it? Any of the seven.",
        skills: [
          { skill: "E04", w: 0.5 },
          { skill: "E05", w: 0.5 },
        ],
        hints: [
          { text: "Hum the note, then sing to do on syllables. Which way is shorter, up or down?" },
          { text: "1, 3 and 5 sound at rest. 2, 4, 6 and 7 lean: 7 pulls up to 1, 4 settles down to 3." },
          { text: "Hear it again, slower, and sing the way home from it.", replay: { rate: 0.75 } },
          "auto",
        ],
        stimulus: { src: "generator", family: "fam.deg.fet-major", level: 3 },
        cue: { context: "cadence", countInBars: 0, click: false, replays: 2 },
        answer: { ui: "degree-pad", set: ["1", "2", "3", "4", "5", "6", "7"], syllables: true },
        correct: {},
        srs: [{ family: "fam.deg.fet-major", mode: "review-if-due" }],
        tests: [],
      },
    },
    {
      id: "S6",
      kind: "sing",
      title: "Sing the ending",
      minutes: 1,
      ui: { panels: NONE },
      exercise: {
        kind: "sing",
        id: "sing-the-ending",
        version: 1,
        role: "practice",
        prompt:
          "Chords set home, then the guitar plays the last two bars of the tune. Sing them back: fa, mi, re, then do, held.",
        skills: [
          { skill: "V03", w: 0.6 },
          { skill: "M01", w: 0.4 },
        ],
        hints: [
          { text: "Hum do first, the note the chords end on. Where is fa from there?" },
          { text: "Fa is three notes of the scale above do. From there, step down one note at a time." },
          { text: "Hear it again, slower, and sing along the second time.", replay: { rate: 0.75 } },
          "auto",
        ],
        // Quiet mode or no microphone: "hear it in your head" (contracts §8.5); singing never gates.
        fallback: "skip",
        mode: "echo",
        stimulus: { src: "code", code: LAST_TWO, bars: 2, showCode: false },
        cue: { context: "cadence", countInBars: 1, click: false, replays: -1 },
        target: { from: "reference", reference: { solutions: [LAST_TWO], bars: 2 }, track: "mel" },
        labels: "syllables",
        tol: { cents: "learner", octave: "global", driftCompCents: 30, minCoverage: 0.4, passHitRate: 0.8 },
        showTrace: "after",
        srs: [{ family: "fam.deg.resolve", mode: "evidence-only" }],
        tests: [],
      },
    },
    {
      id: "S7",
      kind: "make",
      title: "Your eight bars",
      minutes: 3,
      ui: { panels: ROLL, rollLabels: "degree+solfege", band: BAND },
      exercise: {
        kind: "code-make",
        id: "your-eight-bars",
        version: 1,
        role: "practice",
        // The catalog's text for a `uses` rule names the tool ID; the label says it in words.
        feedbackText: { "rubric.unmet": "{label}: not yet." },
        prompt:
          'Write an eight-bar melody over the band. Let bar 4 pause on an open degree and bar 8 **come home to 1**. Acoustic guitar suits it: `.s("acgtr")`.',
        skills: [{ skill: "M01", w: 1 }],
        code: { starter: deg(OUTLINE, "piano") },
        bars: [8, 16],
        saveAs: "sketch",
        rubric: [
          {
            id: "home",
            label: "Ends on 1",
            required: true,
            skills: ["M01"],
            rule: "ends-on-degree",
            track: "@melody",
            degrees: ["1"],
          },
          { id: "eight", label: "Eight bars", required: false, skills: ["M01"], rule: "bars", min: 8 },
          {
            id: "steps",
            label: "Mostly steps, a few leaps",
            required: false,
            skills: ["M01"],
            rule: "step-ratio",
            track: "@melody",
            min: 0.6,
          },
          {
            id: "again",
            label: "Bars 5–6 come back to bars 1–2",
            required: false,
            skills: ["M01"],
            rule: "motif-reuse",
            track: "@melody",
            minRatio: 0.25,
            unitBars: 1,
          },
          {
            id: "guitar",
            label: "On acoustic guitar",
            required: false,
            skills: ["S03"],
            rule: "sounds",
            contains: ["snd.acgtr"],
          },
        ],
        hints: ladder(
          "Play the outline. Which bar sounds unfinished, and which degree would finish it?",
          "The band's last chord is home's own chord. The last note of bar 8 decides how the tune ends.",
          "Bars 1–4 can stay as they are; fill bars 5–7 with your own notes, then end bar 8 on the degree the chords end on.",
        ),
        tests: [
          {
            name: "the starter as it is",
            response: { code: deg(OUTLINE, "piano") },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "minimal: bar 8 goes home",
            response: {
              code: deg(
                "<[0 2 4 ~] [3 ~ 2 ~] [4 ~ ~ ~] [4 ~ ~ ~] [0 2 4 ~] [3 ~ 2 ~] [1 ~ ~ ~] [0 ~ ~ ~]>",
                "piano",
              ),
            },
            expect: "pass",
          },
          {
            name: "beyond the brief: guitar, legato, hats, a leap to the high 1",
            response: {
              code: `${TEMPO}hats: s("hh*8").gain(.3)\nmel: n("<[0 2 4 2] [3 ~ 2 ~] [2 4 7 4] [6 ~ 4 ~] [0 2 4 2] [5 ~ 7 ~] [6 4 [3 2] 1] [0@4]>").scale("C4:major").legato(.9).s("acgtr")`,
            },
            expect: "pass",
          },
          {
            name: "ends on 5",
            response: { code: deg(bars(with_(7, "[4 ~ ~ ~]"))) },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
        ],
      },
    },
  ],
});
