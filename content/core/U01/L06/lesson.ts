// U01.L06 Sixteenths & 1-e-&-a. Four sounds to a beat, counted 1-e-&-a, and the toms that run into the
// next bar. Tools in reach: everything up to U01.L05 (rests, [ ], @, _, gain, banks, one line per drum),
// plus `!` and the toms lt mt ht, which unlock here. `< >` waits for U01.L07, so the tom run plays in
// every bar. The word for a tom run at the end of a phrase is U01.L07's term: here it is "a tom run".
// Spec: content/specs/U01.md.
import { defineLesson, type HintLadder } from "@oak/content-kit";

const BPM = 92;
const TEMPO = `setcpm(${BPM}/4)\n\n`;
const KICK = 'kick: s("bd ~ bd ~")';
const BACKBEAT = 'snare: s("~ sd ~ sd")';
/** With a tom run on beat 4, the snare keeps beat 2 only and leaves 4 to the toms. */
const SNARE_TWO = 'snare: s("~ sd ~ ~")';
const hats = (pattern: string) => `hats: s("${pattern}").gain(.5)`;
const toms = (pattern: string) => `perc: s("~ ~ ~ ${pattern}")`;
const code = (...lines: string[]) => `${TEMPO}${lines.join("\n")}`;

/** The hook: kick on 1 and 3, snare on 2, sixteen hats, and a tom run down through beat 4. */
const HOOK = code(KICK, SNARE_TWO, hats("hh*16"), toms("[ht ht mt lt]"));
/** The groove S3 and S4 work on: a plain backbeat under sixteen hats. */
const SIXTEENTHS = code(KICK, BACKBEAT, hats("hh*16"));
const withHats = (pattern: string) => code(KICK, BACKBEAT, hats(pattern));
const withToms = (pattern: string) => code(KICK, SNARE_TWO, hats("hh*16"), toms(pattern));

const ladder = (nudge: string, pointer: string, partial: string): HintLadder => [
  { text: nudge },
  { text: pointer },
  { text: partial },
  "auto",
];

/** The Band plays bass and chords under the learner's drums. */
const BAND = { band: "band.two-chord-vamp", tracks: ["bass", "chords"] } as const;
const ROLL = { roll: true, staff: false, keyboard: false } as const;
/** Drum hits are one-shots: only where they start matters, never the length of their slot. */
const DRUM_MATCH = {
  m: "events",
  pitch: "absolute",
  rhythm: "onsets",
  durations: false,
  sound: "drum-role",
} as const;
/** Toms all share the drum role "tom": high and mid are told apart by their sound names. */
const SOUND_MATCH = {
  m: "events",
  pitch: "absolute",
  rhythm: "onsets",
  durations: false,
  sound: "s",
} as const;

export default defineLesson({
  id: "U01.L06",
  version: 1,
  title: "Sixteenths & 1-e-&-a",
  objective: "I can count a beat as 1-e-&-a and write four sounds to a beat.",
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: BPM,
  introduces: ["R07"],
  practises: [],
  terms: [{ id: "term.sixteenth-note", step: "S3" }],
  canDo: ["cd.read.sixteenths"],
  wrapAt: "S4",
  steps: [
    {
      id: "S1",
      kind: "listen",
      title: "Four to a beat",
      minutes: 0.5,
      ui: { panels: ROLL, band: BAND },
      example: { id: "hook", code: HOOK, bars: 4 },
      exercise: {
        kind: "listen",
        id: "four-to-a-beat",
        version: 1,
        role: "practice",
        prompt:
          "Press Play and nod on the beat. Then say the count under the roll with it: one-e-and-a, two-e-and-a.",
        skills: [{ skill: "R07", w: 1 }],
        hints: null,
        tests: [],
        items: [{ code: HOOK, caption: "Busy hats, a backbeat and a tom run on beat 4.", bars: 4 }],
      },
    },
    {
      id: "S2",
      kind: "predict",
      title: "Count the hats",
      minutes: 0.5,
      ui: { panels: { roll: false, staff: false, keyboard: false } },
      example: { id: "hats-16", code: SIXTEENTHS, bars: 1 },
      exercise: {
        kind: "predict",
        id: "count-the-hats",
        version: 1,
        role: "practice",
        prompt:
          "The hats line says `hh*16`, and the bar has four beats. Before you run it: how many hats land in each beat?",
        skills: [{ skill: "R07", w: 1 }],
        hints: null,
        tests: [],
        code: SIXTEENTHS,
        bars: 1,
        mode: "count",
        correct: 4,
      },
    },
    {
      id: "S3",
      kind: "investigate",
      title: "Find the e",
      minutes: 1,
      ui: { panels: { roll: true, staff: "perc", keyboard: false } },
      example: { id: "count-it", code: SIXTEENTHS, bars: 1 },
      exercise: {
        kind: "run-investigate",
        id: "find-the-e",
        version: 1,
        role: "practice",
        prompt:
          "Run it and count along: 1 e & a, 2 e & a, 3 e & a, 4 e & a. Then click the hat on the e of 3.",
        skills: [{ skill: "R07", w: 1 }],
        hints: ladder(
          "Which hat starts beat 3, and which one comes straight after it?",
          "Beat 3 is where the second kick lands. Its four hats are counted 3, e, &, a.",
          "The hat on beat 3 itself sits under the kick; the e is the next hat to its right.",
        ),
        code: { starter: SIXTEENTHS },
        mustPlayLoops: 1,
        questions: [
          {
            q: "click-roll",
            prompt: "Click the hat on the e of 3.",
            target: { drum: "hatClosed", bar: 1, beat: 3.25 },
          },
        ],
        tests: [
          { name: "the e of 3", response: { click: "hats|1|9/16|hh|0" }, expect: "pass" },
          {
            name: "the and of 3",
            response: { click: "hats|1|5/8|hh|0" },
            expect: "fail",
            feedback: ["investigate.not-here"],
          },
          {
            name: "the e of 2",
            response: { click: "hats|1|5/16|hh|0" },
            expect: "fail",
            feedback: ["investigate.not-here"],
          },
        ],
      },
    },
    {
      id: "S4",
      kind: "modify",
      title: "Sixteen hats",
      minutes: 1.25,
      graded: true,
      ui: { panels: ROLL },
      exercise: {
        kind: "code-modify",
        id: "sixteen-hats",
        version: 1,
        role: "check",
        prompt:
          "The hats play once per beat. Make them play four times per beat, sixteen in the bar. Leave the kick and snare as they are.",
        skills: [{ skill: "R07", w: 1 }],
        code: { starter: code(KICK, BACKBEAT, 'hats: s("⟪hh*4⟫").gain(.5)') },
        reference: { solutions: [withHats("hh*16"), withHats("[hh hh hh hh]*4")], bars: 1 },
        matcher: DRUM_MATCH,
        target: { audible: true, showRoll: true },
        hints: ladder(
          "How many hats does a bar of four beats need if each beat gets four?",
          "The number after `*` says how many times the sound plays in the bar.",
          "`hh*8` would give two per beat. You need twice that.",
        ),
        srs: [{ family: "fam.rhy.count", mode: "review-if-due" }],
        tests: [
          { name: "reference", response: { code: withHats("hh*16") }, expect: "pass" },
          { name: "one beat, four times", response: { code: withHats("[hh hh hh hh]*4") }, expect: "pass" },
          { name: "a star inside a star", response: { code: withHats("[hh*4]*4") }, expect: "pass" },
          {
            name: "unchanged",
            response: { code: withHats("hh*4") },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "two per beat",
            response: { code: withHats("hh*8") },
            expect: "fail",
            feedback: ["rhythm.missing"],
          },
          {
            name: "four squeezed into the whole bar",
            response: { code: withHats("[hh hh hh hh]") },
            expect: "fail",
            feedback: ["rhythm.missing"],
          },
          {
            name: "too many",
            response: { code: withHats("hh*32") },
            expect: "fail",
            feedback: ["rhythm.extra"],
          },
        ],
      },
    },
    {
      id: "S5",
      kind: "modify",
      title: "A tom run",
      minutes: 1.5,
      graded: true,
      ui: { panels: ROLL },
      exercise: {
        kind: "code-modify",
        id: "tom-run",
        version: 1,
        role: "check",
        prompt:
          "Put four toms into beat 4: the high tom `ht` twice, then the mid tom `mt` twice. Write each pair with `!`, as in `ht!2`.",
        skills: [{ skill: "R07", w: 1 }],
        code: { starter: code(KICK, SNARE_TWO, hats("hh*16"), 'perc: s("~ ~ ~ ⟪~⟫")') },
        reference: { solutions: [withToms("[ht!2 mt!2]")], bars: 1 },
        matcher: SOUND_MATCH,
        constraints: [{ c: "must-use", tool: "tb.mini.replicate", feedback: "code.must-use" }],
        target: { audible: true, showRoll: true },
        feedbackText: { "code.must-use": "Write each pair with `!`: `mt!2` stands for `mt mt`." },
        hints: ladder(
          "How do you fit four sounds into the space of one beat?",
          "Square brackets squeeze what is inside them into one beat. The last `~` is beat 4.",
          "`[ht!2 …]` plays two high toms in the first half of the beat. The mid toms take the second half.",
        ),
        srs: [{ family: "fam.rhy.count", mode: "evidence-only" }],
        tests: [
          { name: "reference", response: { code: withToms("[ht!2 mt!2]") }, expect: "pass" },
          { name: "one pair spelled out", response: { code: withToms("[ht ht mt!2]") }, expect: "pass" },
          {
            name: "unchanged",
            response: { code: withToms("~") },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "no brackets: the run spills over the bar",
            response: { code: withToms("ht!2 mt!2") },
            expect: "fail",
            feedback: ["rhythm.extra"],
          },
          {
            name: "all four written out",
            response: { code: withToms("[ht ht mt mt]") },
            expect: "fail",
            feedback: ["code.must-use"],
          },
        ],
      },
    },
    {
      id: "S6",
      kind: "tap",
      title: "Echo it back",
      minutes: 1.5,
      ui: { panels: { roll: false, staff: false, keyboard: false } },
      exercise: {
        kind: "tap",
        id: "echo-sixteenths",
        version: 1,
        role: "practice",
        prompt: "Listen to one bar, then tap it back. Count 1-e-&-a under your breath while it plays.",
        skills: [
          { skill: "E01", w: 0.5 },
          { skill: "R07", w: 0.5 },
        ],
        hints: ladder(
          "Which beat of the bar was the busiest?",
          "Say the count while it plays and notice the words that got a sound.",
          "Tap the beats first, then add the quick sounds inside the busy beat.",
        ),
        mode: "echo",
        stimulus: { src: "generator", family: "fam.rhy.echo", level: 3 },
        cue: { context: "none", countInBars: 1, click: true, replays: 2 },
        bars: 1,
        target: {},
        tol: { windowMs: "auto", tempo: "locked", forgiveOffset: true, passF1: 0.8, passTiming: 0.7 },
        srs: [{ family: "fam.rhy.echo", mode: "review-if-due" }],
        tests: [],
      },
    },
    {
      id: "S7",
      kind: "make",
      title: "Your busy groove",
      minutes: 2.5,
      ui: { panels: ROLL, band: BAND },
      exercise: {
        kind: "code-make",
        id: "busy-groove",
        version: 1,
        role: "practice",
        prompt:
          "Write a groove over the band with four sounds in at least one beat. Beat 1 must be counted out in full: a sound on 1, e, & and a.",
        skills: [{ skill: "R07", w: 1 }],
        code: { starter: code(KICK, BACKBEAT, hats("hh*8")) },
        bars: [1, 2],
        saveAs: "sketch",
        rubric: [
          {
            id: "beat-one-in-four",
            label: "Beat 1 split into four sounds (1-e-&-a)",
            required: true,
            skills: ["R07"],
            rule: "onsets",
            track: "@drums",
            contains: [
              [0, 1],
              [1, 16],
              [1, 8],
              [3, 16],
            ],
            perBar: true,
          },
          {
            id: "toms",
            label: "A tom run with the low tom `lt`",
            required: false,
            skills: ["R07"],
            rule: "sounds",
            contains: ["snd.drum.lt"],
          },
          {
            id: "replicate",
            label: "Uses `!` to repeat a sound",
            required: false,
            skills: ["R07"],
            rule: "uses",
            tool: "tb.mini.replicate",
          },
        ],
        hints: ladder(
          "Which line could play four times as often as the beat?",
          "The hats play eight times in the bar now: two per beat. Beat 1 needs four.",
          "`hh*16` covers every beat. `[hh hh hh hh] hh hh hh` covers beat 1 alone.",
        ),
        tests: [
          {
            name: "the starter: two per beat",
            response: { code: code(KICK, BACKBEAT, hats("hh*8")) },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          { name: "minimal", response: { code: code(KICK, BACKBEAT, hats("hh*16")) }, expect: "pass" },
          {
            name: "beat 1 only, on the kick line",
            response: { code: code('kick: s("[bd bd bd bd] ~ bd ~")', BACKBEAT, hats("hh*8")) },
            expect: "pass",
          },
          {
            name: "beyond the brief",
            response: {
              code: code(
                'kick: s("bd [~ bd] bd ~").bank("RolandTR909")',
                SNARE_TWO,
                'hats: s("[hh hh hh hh] [hh hh] [hh hh] [hh!3 ~]").gain(.5)',
                toms("[ht mt lt!2]"),
              ),
            },
            expect: "pass",
          },
          {
            name: "sixteenths on beat 2 only",
            response: { code: code(KICK, BACKBEAT, 'hats: s("hh [hh hh hh hh] hh hh").gain(.5)') },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
        ],
      },
    },
  ],
});
