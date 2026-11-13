// U05.L04 Chord Names & Arpeggios. Two things a chord can do besides sound as a block: be played one note
// at a time (`.arp()`, which picks notes out of a stack by position, counting from the lowest as 0), and be
// written down as a name (the root's letter and a sign for the quality: C, Cm, C°, C+; in Strudel's code
// `C Cm Co Caug`). What the learner has: triads stacked by hand (U05.L01), the four qualities by ear and by
// their 3rds (U05.L02–L03), the quality signs seen once in U05.L03's spelling quiz. Not yet: `chord()` and
// `.voicing()` (U05.L08, behind the gate of U05.L07), which appear here only in a read-only preview;
// inversions and slash names (U05.L05). Spec: content/specs/U05.md.
//
// How it is graded: the arpeggio step compares the notes and their onsets (`events`, absolute pitch), since
// order and timing are the point; the name is a `fact` with `normalize: "chord"`, so B°, Bo and Bdim are one
// answer. The Make's one required rule is `uses tb.arp`: the starter plays the same four triads as blocks.
import { defineLesson, type HintLadder } from "@oak/content-kit";

const BPM = 92;
const TEMPO = `setcpm(${BPM}/4)\n\n`;
const code = (...lines: string[]) => `${TEMPO}${lines.join("\n")}`;
/** The loop of Stacking Thirds: C G Am F, a triad on each note of the Band's bass (1 5 6 4). */
const LOOP = "<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>";
/** A chord line of stacked degrees in C, broken by an `.arp()` pattern. */
const broken = (stacks: string, arp: string, extra = "") =>
  `chords: n("${stacks}").arp("${arp}").scale("C3:major").s("piano")${extra}`;
/** The same stacks as blocks. */
const blocks = (stacks: string, extra = "") => `chords: n("${stacks}").scale("C3:major").s("piano")${extra}`;
const mel = (pattern: string) => `mel: n("${pattern}").scale("C4:major").s("piano")`;

const ladder = (nudge: string, pointer: string, partial: string): HintLadder => [
  { text: nudge },
  { text: pointer },
  { text: partial },
  "auto",
];

/** Up and back down, a quarter note each: C E G E | G B D B | A C E C | F A C A. */
const HOOK = code(broken(LOOP, "0 1 2 1"));
const ONE_STACK = (arp: string) => code(broken("[0,2,4]", arp));
/** The modify step: the same pattern twice as fast, eight notes a bar. */
const EIGHTHS = code(broken(LOOP, "0 1 2 1 0 1 2 1"));
const eighthsTry = (arp: string) => code(broken(LOOP, arp));

/**
 * The concept card (preview: `chord()` is U05.L08's). Each bar plays a stack written by hand, then, half a
 * bar later, the same chord by its name. The named chords come voiced by Strudel (five notes, not always
 * with the root lowest), with the same pitch classes as the hand-made stacks.
 */
const BY_NAME = code(
  'chords: note("<[[c4,e4,g4] ~] [[a3,c4,e4] ~] [[b3,d4,f4] ~] [[c4,e4,g#4] ~]>").s("piano")',
  'keys: chord("<[~ C] [~ Am] [~ Bo] [~ Caug]>").voicing().s("piano")',
);

/** The quiz: the stack on degree 7, B D F, on the treble staff. */
const NAME_IT = code('chords: note("[b3,d4,f4]").s("piano")');

/** A tune for the rich Make sketch: chord notes on the beats it plays (G E | B G | C A | A F). */
const TUNE = "<[4 ~ 2 ~] [6 ~ 4 ~] [7 ~ 5 ~] [5 ~ 3 ~]>";
const MAKE_STARTER = code(blocks(LOOP));

/** The Band's drums and its bass (C G A F, a bar each); the learner plays the chords. */
const BAND = { band: "band.axis-4bar", tracks: ["drums", "bass"] } as const;
const NONE = { roll: false, staff: false, keyboard: false } as const;
const ROLL = { roll: true, staff: false, keyboard: false } as const;

export default defineLesson({
  id: "U05.L04",
  version: 1,
  title: "Chord Names & Arpeggios",
  objective: "I can play a chord one note at a time with .arp() and read a chord's name: C, Cm, C°, C+.",
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: BPM,
  introduces: ["N05"],
  practises: [],
  terms: [
    { id: "term.arpeggio", step: "S4" },
    { id: "term.chord-symbol", step: "S6" },
  ],
  canDo: ["cd.read.chord-symbols", "cd.code.arpeggio"],
  wrapAt: "S4",
  steps: [
    {
      id: "S1",
      kind: "listen",
      title: "One note at a time",
      minutes: 0.5,
      ui: { panels: ROLL, rollLabels: "degree", band: BAND },
      example: { id: "hook", code: HOOK, bars: 4 },
      exercise: {
        kind: "listen",
        id: "one-note-at-a-time",
        version: 1,
        role: "practice",
        prompt:
          "Press Play. These are the four chords of Stacking Thirds, but the piano plays each one a note at a time: up, and back down.",
        skills: [{ skill: "N05", w: 1 }],
        hints: null,
        tests: [],
        items: [
          {
            code: HOOK,
            caption: "C, G, A minor and F, each played up and back down, over the drums and bass.",
            bars: 4,
          },
          { code: code(blocks(LOOP)), caption: "The same four chords as blocks, for comparison.", bars: 4 },
        ],
      },
    },
    {
      id: "S2",
      kind: "predict",
      title: "Which order?",
      minutes: 0.5,
      ui: { panels: NONE },
      example: { id: "one-stack", code: ONE_STACK("0 2 1"), bars: 1 },
      exercise: {
        kind: "predict",
        id: "which-order",
        version: 1,
        role: "practice",
        prompt:
          '`.arp()` picks notes out of the stack by position, counting from the lowest as 0. In what order will `n("[0,2,4]").arp("0 2 1")` play C, E and G?',
        skills: [{ skill: "N05", w: 1 }],
        hints: null,
        tests: [],
        code: ONE_STACK("0 2 1"),
        bars: 1,
        mode: "choose",
        choices: [
          { id: "c-g-e", label: "C, then G, then E" },
          { id: "c-e-g", label: "C, then E, then G" },
          { id: "c-e-d", label: "C, then E, then D: degrees 1, 3 and 2" },
        ],
        correct: ["c-g-e"],
      },
    },
    {
      id: "S3",
      kind: "investigate",
      title: "Patterns of positions",
      minutes: 1,
      ui: { panels: ROLL, rollLabels: "degree", band: BAND },
      example: { id: "the-loop", code: HOOK, bars: 4 },
      exercise: {
        kind: "run-investigate",
        id: "patterns-of-positions",
        version: 1,
        role: "practice",
        prompt:
          'Run the loop and count the notes in one bar on the roll. Then try other patterns inside `.arp("…")`, such as `2 1 0` or `0 2 1`, and watch the roll.',
        skills: [{ skill: "N05", w: 1 }],
        feedbackText: {
          "investigate.wrong":
            "Not quite. In `.arp()` each number is a position in the stack: 0 is the lowest note, 2 the highest.",
        },
        hints: ladder(
          "How many numbers are inside the quotes of `.arp()`?",
          "Each number plays one note, and the numbers share the bar equally, as in any pattern string.",
          "A line that climbs straight up starts on the lowest note and ends on the highest: which position is the lowest?",
        ),
        code: { starter: HOOK },
        mustPlayLoops: 1,
        questions: [
          {
            q: "number",
            prompt: 'With `.arp("0 1 2 1")`, how many notes does each bar play?',
            correct: 4,
          },
          {
            q: "choice",
            prompt: "Which pattern plays each chord climbing straight up, lowest to highest?",
            options: [
              { id: "up", label: "`0 1 2`" },
              { id: "down", label: "`2 1 0`" },
              { id: "skip", label: "`0 2 1`" },
            ],
            correct: ["up"],
          },
        ],
        tests: [
          { name: "both right", response: { answer: { number: 4, choice: ["up"] } }, expect: "pass" },
          {
            name: "the top down",
            response: { answer: { number: 4, choice: ["down"] } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
          {
            name: "three notes, one per position",
            response: { answer: { number: 3, choice: ["up"] } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
        ],
      },
    },
    {
      id: "S4",
      kind: "modify",
      title: "Twice as fast",
      minutes: 1.25,
      graded: true,
      ui: { panels: ROLL, rollLabels: "degree", band: BAND },
      exercise: {
        kind: "code-modify",
        id: "twice-as-fast",
        version: 1,
        role: "check",
        prompt:
          "Play the target first: every chord now goes up and back down twice in a bar, eight notes instead of four. Change the pattern inside `.arp()` to match it.",
        skills: [{ skill: "N05", w: 1 }],
        code: { starter: code(broken(LOOP, "⟪0 1 2 1⟫")) },
        reference: { solutions: [EIGHTHS], bars: 4 },
        // The order and the timing are the point here, so the notes are compared with their onsets.
        matcher: { m: "events", pitch: "absolute", rhythm: "onsets", durations: false, tracks: ["chords"] },
        constraints: [{ c: "edit-only-regions", feedback: "code.edit-outside" }],
        target: { audible: true, showRoll: false, revealRollAfter: 1 },
        // The catalog says "the melody has", and this line is the chords.
        feedbackText: {
          "melody.wrong-degree":
            "Bar {bar}, {beatLabel}: you play {got} ({gotSyl}); the target plays {exp} ({expSyl}).",
          "melody.missing-note": "Bar {bar}, {beatLabel}: the target plays {exp} here, and you have nothing.",
        },
        hints: ladder(
          "How many numbers does the pattern need for eight notes a bar?",
          "The four positions you have go up and back down once. The target does exactly that, then does it again.",
          "Each half of the bar is the old pattern: lowest, middle, highest, middle. Write that, then once more.",
        ),
        tests: [
          { name: "reference", response: { code: EIGHTHS }, expect: "pass" },
          {
            name: "the same pattern, doubled with *2",
            response: { code: eighthsTry("[0 1 2 1]*2") },
            expect: "pass",
          },
          {
            name: "unchanged",
            response: { code: eighthsTry("0 1 2 1") },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "position 3 for the way down",
            response: { code: eighthsTry("0 1 2 3 0 1 2 3") },
            expect: "fail",
            feedback: ["melody.wrong-degree"],
          },
          {
            name: "eight slots, but rests between the notes",
            response: { code: eighthsTry("0 ~ 1 ~ 2 ~ 1 ~") },
            expect: "fail",
            feedback: ["melody.missing-note"],
          },
        ],
      },
    },
    {
      id: "S5",
      kind: "concept",
      title: "Names on paper",
      minutes: 0.75,
      ui: { panels: ROLL, rollLabels: "note" },
      example: { id: "by-name", code: BY_NAME, bars: 4, preview: true },
    },
    {
      id: "S6",
      kind: "quiz",
      title: "Name the stack",
      minutes: 1,
      graded: true,
      ui: { panels: NONE },
      exercise: {
        kind: "fact",
        id: "name-the-stack",
        version: 1,
        role: "check",
        prompt:
          "A triad from the key of C, on the staff and played. Type its name: the root's letter, then the sign for its quality.",
        skills: [{ skill: "N05", w: 1 }],
        hints: ladder(
          "Which of the three notes is the root, the one the others stack on in 3rds?",
          "Count the half steps of each 3rd, from the bottom note up: 4 then 3 is major, 3 then 4 minor, 3 and 3 diminished, 4 and 4 augmented.",
          "B up to D is three half steps. Count D up to F the same way.",
        ),
        stimulus: { src: "code", code: NAME_IT, bars: 1, showCode: false, showStaff: true },
        answer: { ui: "text", normalize: "chord" },
        correct: { text: ["B°"] },
        spelling: "enharmonic",
        order: "sequence",
        srs: [
          { deck: "deck.chd.symbols", cards: ["fact.chord.Cm", "fact.chord.Cdim"], mode: "seed" },
          { family: "fam.chd.quality-triad", mode: "review-if-due" },
        ],
        tests: [
          { name: "B°", response: { answer: { text: ["B°"] } }, expect: "pass" },
          { name: "Bo, as in code", response: { answer: { text: ["Bo"] } }, expect: "pass" },
          { name: "Bdim", response: { answer: { text: ["Bdim"] } }, expect: "pass" },
          {
            name: "minor instead of diminished",
            response: { answer: { text: ["Bm"] } },
            expect: "fail",
            feedback: ["id.chord-quality"],
          },
          {
            name: "named after the middle note",
            response: { answer: { text: ["Dm"] } },
            expect: "fail",
            feedback: ["id.chord-root"],
          },
        ],
      },
    },
    {
      id: "S7",
      kind: "make",
      title: "Broken chords on the bass",
      minutes: 2.75,
      ui: { panels: ROLL, rollLabels: "degree", band: BAND },
      exercise: {
        kind: "code-make",
        id: "broken-chords-on-the-bass",
        version: 1,
        role: "practice",
        prompt:
          "The band plays drums and the bass line, degrees 1, 5, 6 and 4. Your four triads play as blocks. Break them up with `.arp()` in a pattern of your own: up, down, skipping, with gaps.",
        skills: [{ skill: "N05", w: 1 }],
        // The catalog's text is "{label}: {detail}", and a progression's detail names the chords in Roman
        // numerals (U06.L02). The same text serves every rule, so it says only "not yet".
        feedbackText: { "rubric.unmet": "{label}: not yet." },
        code: { starter: MAKE_STARTER },
        bars: [4, 8],
        saveAs: "sketch",
        rubric: [
          {
            id: "broken-with-arp",
            label: "The chords are broken with `.arp()`",
            required: true,
            skills: ["N05"],
            rule: "uses",
            tool: "tb.arp",
          },
          {
            id: "gaps",
            label: "A rhythm with gaps, not an even stream of notes",
            required: false,
            skills: ["R06"],
            rule: "uses",
            tool: "tb.mini.rest",
          },
          {
            id: "a-tune",
            label: "A tune on top",
            required: false,
            skills: ["M01"],
            rule: "tracks",
            min: 1,
            roles: ["melody"],
          },
        ],
        hints: ladder(
          "Where in the chord line do you choose which note of the stack plays when?",
          "`.arp()` goes after the stacks and before `.scale()`, with a pattern of positions: 0 the lowest note, 2 the highest.",
          'Start from `.arp("0 1 2 1")`, then change one number, or put a `~` where a note was.',
        ),
        tests: [
          {
            name: "the starter as it is",
            response: { code: MAKE_STARTER },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          { name: "minimal: up and back down", response: { code: HOOK }, expect: "pass" },
          {
            name: "beyond the brief: a gapped pattern, the room and a tune",
            response: {
              code: code(broken(LOOP, "0 ~ 2 1 [0 2] ~ 1 2", ".gain(.7).room(.3)"), mel(TUNE)),
            },
            expect: "pass",
          },
          {
            name: "broken by hand, one degree at a time, no .arp()",
            response: {
              code: code(
                'chords: n("<[0 2 4 2] [4 6 8 6] [5 7 9 7] [3 5 7 5]>").scale("C3:major").s("piano")',
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
