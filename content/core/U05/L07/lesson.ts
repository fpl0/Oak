// U05.L07 Voice Leading by Hand. From one chord to the next, keep the notes the two chords share and move
// every other note to the nearest note of the new chord. C F G C voiced that way, three notes over a root
// bass: [c4,e4,g4] [c4,f4,a4] [b3,d4,g4] [c4,e4,g4]. F and G share no note, so one voice there skips a 3rd
// (F4 down to D4, three half steps) while the others step; every other move is a step or nothing. What the
// learner has: triads stacked by hand (U05.L01), qualities (U05.L02–L03), chord names (U05.L04), inversions
// and the lowest note (U05.L05), the grand staff (U05.L06), half steps (U02.L03), note names with an octave
// (U02). Not yet: Roman numerals as names (U06.L02), "cadence" (U06.L04), "voicing" (U05.L08), "chord tone"
// (U07.L03), `chord()` and `.voicing()` (U05.L08, behind the gate this lesson holds).
// Spec: content/specs/U05.md.
//
// S5 is THE GATE CHECK for `chord()` and `.voicing()` (contracts §3.1 rule 6, toolbox VOICING_GATE): the
// exercise id `hand-voiced-cadence` is fixed, its pass mark is the gate's 0.9, and the evidence is code only.
// Chords are graded as chords (`pcset` per onset, no bass: the bass track plays the roots) and the motion with
// the `voice-leading` rubric rule, which reads each chord's notes in the order they are written as voices.
// The gate allows three half steps per voice, not the spec's two: with two, C F G C cannot return to its
// first chord (F to G has no common tone, so every voice must rise and the loop climbs), and the spec's own
// hook, the textbook voicing, moves F4 to D4. S4 and the Make keep two: there it works and it loops.
// Hand voicings are note lists (STYLE §5.3 rule 6).
import { defineLesson, type HintLadder, type Matcher } from "@oak/content-kit";

const BPM = 80;
const TEMPO = `setcpm(${BPM}/4)\n\n`;
const code = (...lines: string[]) => `${TEMPO}${lines.join("\n")}`;
/** A hand-voiced chord line: note lists, one chord a bar. */
const chords = (pattern: string, extra = "") => `chords: note("${pattern}").s("piano")${extra}`;
/** The root bass: one note a bar. */
const bass = (pattern: string) => `bass: note("${pattern}").s("ebass").lpf(800)`;
const mel = (pattern: string) => `mel: n("${pattern}").scale("C4:major").s("piano")`;

const ladder = (nudge: string, pointer: string, partial: string): HintLadder => [
  { text: nudge },
  { text: pointer },
  { text: partial },
  "auto",
];

/** C F G C over its roots, every chord in root position: all three notes leap together at every change. */
const JUMP = "<[c4,e4,g4] [f4,a4,c5] [g4,b4,d5] [c4,e4,g4]>";
/**
 * The same four chords voice-led: C stays into F while E and G step up to F and A; then down by steps to
 * B D G (no note shared with F A C); G stays into C while B and D step to C and E.
 */
const SMOOTH = "<[c4,e4,g4] [c4,f4,a4] [b3,d4,g4] [c4,e4,g4]>";
const ROOTS = "<c2 f2 g2 c2>";
const HOOK = code(bass(ROOTS), chords(SMOOTH));
const HOOK_JUMP = code(bass(ROOTS), chords(JUMP));

/** S3: the first change alone, C to F. */
const C_TO_F = code(bass("<c2 f2>"), chords("<[c4,e4,g4] [c4,f4,a4]>"));

/** S4: C, then the chord on degree 5 (G), over C and G in the bass. */
const TWO = (bar2: string) => code(bass("<c2 g2>"), chords(`<[c4,e4,g4] ${bar2}>`));
const TWO_STARTER = `${TEMPO}${bass("<c2 g2>")}\n${chords("⟪<[c4,e4,g4] [g4,b4,d5]>⟫")}`;

/** S5, the gate: the whole progression to voice; the bass is given. */
const GATE_STARTER = `${TEMPO}${bass(ROOTS)}\n${chords(`⟪${JUMP}⟫`)}`;
const GATE_MATCHER: Matcher = {
  m: "all",
  of: [
    { m: "pcset", perOnset: true, bass: false, tracks: ["chords"] },
    {
      m: "rubric",
      rules: [
        {
          id: "hand-voiced",
          label: "Three voices, shared notes held, no note moving more than three half steps",
          required: true,
          skills: ["C05"],
          rule: "voice-leading",
          track: "chords",
          maxMovePerVoice: 3,
          voices: 3,
          commonTones: true,
          noCrossing: true,
        },
      ],
    },
  ],
};

/**
 * The Make: the four-chord loop of Stacking Thirds (C G Am F) over the Band's bass, written as note lists in
 * root position, so the notes leap at the first and last change. Voice-led: [c4,e4,g4] [b3,d4,g4]
 * [c4,e4,a4] [c4,f4,a4].
 */
const MAKE_STARTER = code(chords("<[c4,e4,g4] [g3,b3,d4] [a3,c4,e4] [f3,a3,c4]>"));
const LOOP_LED = "<[c4,e4,g4] [b3,d4,g4] [c4,e4,a4] [c4,f4,a4]>";
/** A tune of chord notes over the loop (G E G | B G | A C A | A F), from Stacking Thirds. */
const TUNE = "<[4 ~ 2 4] [6 ~ 4 ~] [5 ~ 7 5] [5 ~ 3 ~]>";

/** Drums from the Band under the listening and the gate; the bass is in the code. */
const DRUMS = { band: "band.axis-4bar", tracks: ["drums"] } as const;
/** The Make: the Band's drums and its 1 5 6 4 bass (C G A F); the learner voices the chords. */
const BAND = { band: "band.axis-4bar", tracks: ["drums", "bass"] } as const;
const NONE = { roll: false, staff: false, keyboard: false } as const;
const ROLL = { roll: true, staff: false, keyboard: false } as const;
const ROLL_GRAND = { roll: true, staff: "grand", keyboard: false } as const;

export default defineLesson({
  id: "U05.L07",
  version: 1,
  title: "Voice Leading by Hand",
  objective:
    "I can voice a progression by hand so each note moves as little as possible: shared notes stay, the rest move to the nearest note.",
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: BPM,
  introduces: ["C05"],
  practises: [],
  terms: [
    { id: "term.common-tone", step: "S3" },
    { id: "term.voice-leading", step: "S4" },
  ],
  canDo: ["cd.write.voice-leading"],
  wrapAt: "S4",
  steps: [
    {
      id: "S1",
      kind: "listen",
      title: "Jump or glide",
      minutes: 0.5,
      ui: { panels: ROLL, rollLabels: "note", band: DRUMS },
      example: { id: "hook", code: HOOK, bars: 4 },
      exercise: {
        kind: "listen",
        id: "jump-or-glide",
        version: 1,
        role: "practice",
        prompt:
          "The same four chords twice, C F G C, over the same bass. Listen to the top of the chords in each.",
        skills: [{ skill: "C05", w: 1 }],
        hints: null,
        tests: [],
        items: [
          { code: HOOK_JUMP, caption: "Every chord stacked from its root: all three notes leap.", bars: 4 },
          { code: HOOK, caption: "The same chords, the notes barely moving.", bars: 4 },
        ],
      },
    },
    {
      id: "S2",
      kind: "compare",
      title: "One hand",
      minutes: 0.5,
      ui: { panels: NONE, band: DRUMS },
      exercise: {
        kind: "identify",
        id: "one-hand",
        version: 1,
        role: "practice",
        prompt: "Which version sounds like one hand gliding from chord to chord on the keys?",
        skills: [{ skill: "C05", w: 1 }],
        hints: ladder(
          "In which version does the top of the chords stay in one place?",
          "Follow the highest note of each chord. In one card it climbs and falls a long way; in the other it hardly moves.",
          "Card B starts each chord from its root. Is that the one that glides?",
        ),
        stimulus: { src: "code", code: HOOK, bars: 4, showCode: false },
        cue: { context: "none", countInBars: 0, click: false, replays: -1 },
        answer: {
          ui: "choice",
          layout: "audio-cards",
          options: [
            { id: "smooth", label: "Card A", audio: HOOK },
            { id: "jumping", label: "Card B", audio: HOOK_JUMP },
          ],
        },
        correct: { choice: ["smooth"] },
        // The catalog's `id.wrong` names the option ids.
        feedbackText: {
          "id.wrong":
            "Card B is the one that leaps: every chord starts again from its root. Card A keeps its notes close.",
        },
        tests: [
          { name: "smooth", response: { answer: { choice: ["smooth"] } }, expect: "pass" },
          {
            name: "jumping",
            response: { answer: { choice: ["jumping"] } },
            expect: "fail",
            feedback: ["id.wrong"],
          },
        ],
      },
    },
    {
      id: "S3",
      kind: "investigate",
      title: "What stays",
      minutes: 1,
      ui: { panels: ROLL_GRAND, rollLabels: "note", staffLabels: "degree" },
      example: { id: "c-to-f", code: C_TO_F, bars: 2 },
      exercise: {
        kind: "run-investigate",
        id: "what-stays",
        version: 1,
        role: "practice",
        prompt:
          "Run the first change: C `[c4,e4,g4]`, then F `[c4,f4,a4]`. Compare the two lists note by note.",
        skills: [{ skill: "C05", w: 1 }],
        feedbackText: {
          "investigate.wrong":
            "Not quite. Read the two lists in order: first note, middle note, top note. Which one is written the same in both?",
        },
        hints: ladder(
          "C is C E G and F is F A C. Which letter is in both?",
          "The note both chords have can stay exactly where it is. The other two each move to a neighbour.",
          "E moves to F. Count the half steps on the keyboard: is there a black key between them?",
        ),
        code: { starter: C_TO_F },
        mustPlayLoops: 1,
        questions: [
          {
            q: "choice",
            prompt: "Which note stays where it is?",
            options: [
              { id: "c", label: "C" },
              { id: "e", label: "E" },
              { id: "g", label: "G" },
            ],
            correct: ["c"],
          },
          {
            q: "number",
            prompt: "How many half steps does E move to reach F?",
            correct: 1,
          },
        ],
        tests: [
          { name: "both right", response: { answer: { choice: ["c"], number: 1 } }, expect: "pass" },
          {
            name: "G read as staying",
            response: { answer: { choice: ["g"], number: 1 } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
          {
            name: "a whole step",
            response: { answer: { choice: ["c"], number: 2 } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
        ],
      },
    },
    {
      id: "S4",
      kind: "modify",
      title: "C to G",
      minutes: 1.25,
      graded: true,
      ui: { panels: ROLL, rollLabels: "note", band: DRUMS },
      exercise: {
        kind: "code-modify",
        id: "c-to-g",
        version: 1,
        role: "check",
        prompt:
          "Bar 2 plays G B D, the chord on degree 5, stacked from its root: every note leaps up. Rewrite it so each note of C moves to the nearest note of G, and G stays where it is.",
        skills: [{ skill: "C05", w: 1 }],
        code: { starter: TWO_STARTER },
        reference: { solutions: [TWO("[b3,d4,g4]")], bars: 2 },
        matcher: {
          m: "all",
          of: [
            { m: "pcset", perOnset: true, bass: false, tracks: ["chords"] },
            {
              m: "rubric",
              rules: [
                {
                  id: "nearest",
                  label: "Every note moves by a step or stays",
                  required: true,
                  skills: ["C05"],
                  rule: "voice-leading",
                  track: "chords",
                  maxMovePerVoice: 2,
                },
              ],
            },
          ],
        },
        constraints: [{ c: "edit-only-regions", feedback: "code.edit-outside" }],
        target: { audible: true, showRoll: false, revealRollAfter: 1 },
        feedbackText: {
          "harmony.pcset":
            "Bar {bar}: your chord has {got}; G is {exp}. Keep all three letters, G, B and D, and only move where they sit.",
          "rubric.unmet":
            "A note still leaps. Write the new chord in the order of the old one, lowest first, each note close to the one above it in the list.",
        },
        hints: ladder(
          "C E G and G B D: which letter is in both?",
          "G stays as `g4`. C goes to the nearest of B and D; E goes to the other. Write them lowest first.",
          "The top note stays `g4`, and E moves down a whole step. Where does C go?",
        ),
        tests: [
          { name: "reference", response: { code: TWO("[b3,d4,g4]") }, expect: "pass" },
          {
            name: "both chords an octave higher",
            response: { code: code(bass("<c2 g2>"), chords("<[c5,e5,g5] [b4,d5,g5]>")) },
            expect: "pass",
          },
          {
            name: "unchanged",
            response: { code: TWO("[g4,b4,d5]") },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "root position below: every note falls a 4th",
            response: { code: TWO("[g3,b3,d4]") },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "B left out",
            response: { code: TWO("[d4,d4,g4]") },
            expect: "fail",
            feedback: ["harmony.pcset"],
          },
          {
            name: "the bass changed",
            response: { code: code(bass("<c2 g1>"), chords("<[c4,e4,g4] [b3,d4,g4]>")) },
            expect: "fail",
            feedback: ["code.edit-outside"],
          },
        ],
      },
    },
    {
      id: "S5",
      kind: "modify",
      title: "Four chords by hand",
      minutes: 1.5,
      graded: true,
      ui: { panels: ROLL_GRAND, rollLabels: "note", staffLabels: "degree", band: DRUMS },
      exercise: {
        kind: "code-modify",
        // The voicing gate (toolbox VOICING_GATE): this id is fixed.
        id: "hand-voiced-cadence",
        version: 1,
        role: "check",
        pass: 0.9,
        prompt:
          "Now all four: C F G C, three notes each, over the bass. Hold every note two neighbouring chords share, move each other note as little as you can (three half steps at most), and keep the three in the same order, lowest to highest.",
        skills: [{ skill: "C05", w: 1 }],
        code: { starter: GATE_STARTER },
        reference: { solutions: [HOOK], bars: 4 },
        matcher: GATE_MATCHER,
        constraints: [{ c: "edit-only-regions", feedback: "code.edit-outside" }],
        target: { audible: true, showRoll: false, revealRollAfter: 1 },
        feedbackText: {
          "harmony.pcset":
            "Bar {bar}: your chord has {got}; it should have {exp}. Move notes, but keep the chord's three letters.",
          "rubric.unmet": "Not yet. The lines below name the bar and the note.",
          "harmony.voice-leap":
            "Bar {bar}: {from} leaps {semis} half steps to {to}. {nearest} is the nearest note of the new chord; move at most {max}.",
          "harmony.common-tone":
            "Bar {bar}: {pc} is in both chords. Keep the {note} where it is, in the same place in the list.",
          "harmony.voice-crossing":
            "Bar {bar}: the note that went from {low} to {lowTo} ends above the one that went from {high} to {highTo}. Keep the three in order, lowest first.",
          "harmony.voice-count": "Bar {bar}: {notes} is {got} notes; write {exp}, one for each voice.",
        },
        hints: ladder(
          "Which note do C and F share? Which do G and C share?",
          "Hold the shared note in its place in the list. F and G share none, so there every note moves: find a near note of G for each, and use all three letters.",
          "Bar 2 keeps C at the bottom and steps E and G up. Into G, C goes down a half step to B and A down a whole step. Which letter of G is left for F?",
        ),
        tests: [
          { name: "reference", response: { code: HOOK }, expect: "pass" },
          {
            name: "another smooth path: D G B, then E G C",
            response: { code: code(bass(ROOTS), chords("<[c4,e4,g4] [c4,f4,a4] [d4,g4,b4] [e4,g4,c5]>")) },
            expect: "pass",
          },
          {
            name: "an octave higher",
            response: { code: code(bass(ROOTS), chords("<[c5,e5,g5] [c5,f5,a5] [b4,d5,g5] [c5,e5,g5]>")) },
            expect: "pass",
          },
          {
            name: "unchanged",
            response: { code: code(bass(ROOTS), chords(JUMP)) },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "root position, a different way: F and G below",
            response: { code: code(bass(ROOTS), chords("<[c4,e4,g4] [f3,a3,c4] [g3,b3,d4] [c4,e4,g4]>")) },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "a note missing from F",
            response: { code: code(bass(ROOTS), chords("<[c4,e4,g4] [c4,f4] [b3,d4,g4] [c4,e4,g4]>")) },
            expect: "fail",
            feedback: ["harmony.pcset"],
          },
          {
            name: "the right notes, written so the middle and top voices swap at every change",
            response: { code: code(bass(ROOTS), chords("<[c4,e4,g4] [c4,a4,f4] [b3,d4,g4] [c4,g4,e4]>")) },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
        ],
      },
    },
    {
      id: "S6",
      kind: "make",
      title: "The loop, by hand",
      minutes: 2.75,
      ui: { panels: ROLL, rollLabels: "note", band: BAND },
      exercise: {
        kind: "code-make",
        id: "loop-by-hand",
        version: 1,
        role: "practice",
        prompt:
          "The band plays drums and the bass of Stacking Thirds: C, G, A, F. The chords here start from their roots and leap. Rewrite them so every note moves by a step or stays, then make the loop yours.",
        skills: [{ skill: "C05", w: 1 }],
        feedbackText: { "rubric.unmet": "{label}: not yet." },
        code: { starter: MAKE_STARTER },
        bars: [4, 8],
        saveAs: "sketch",
        rubric: [
          {
            id: "smooth",
            label: "Every note of the chords moves by a step or stays",
            required: true,
            skills: ["C05"],
            rule: "voice-leading",
            track: "chords",
            maxMovePerVoice: 2,
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
          {
            id: "middle",
            label: "Chords in the middle, between the bass and the tune",
            required: false,
            skills: ["C05"],
            rule: "range",
            track: "chords",
            within: ["c3", "c5"],
          },
        ],
        hints: ladder(
          "Which note do C and G share? Which do A minor and F share?",
          "Keep the first chord as it is. From C E G, the nearest notes of G are B, D and G itself: write them in the same order.",
          "Bars 1 and 2 are C E G, then B D G. From B D G, B steps up to C and D up to E. What does G move to?",
        ),
        tests: [
          {
            name: "the starter as it is",
            response: { code: MAKE_STARTER },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          { name: "minimal: the loop voice-led", response: { code: code(chords(LOOP_LED)) }, expect: "pass" },
          {
            name: "beyond the brief: two hits a bar, a tune, the room",
            response: {
              code: code(
                chords(
                  "<[[c4,e4,g4] ~ [c4,e4,g4] ~] [[b3,d4,g4] ~ [b3,d4,g4] ~] [[c4,e4,a4] ~ [c4,e4,a4] ~] [[c4,f4,a4] ~ [c4,f4,a4] ~]>",
                  ".room(.3)",
                ),
                mel(TUNE),
              ),
            },
            expect: "pass",
          },
          {
            name: "stacked degrees from the root, as in Stacking Thirds",
            response: {
              code: code('chords: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>").scale("C3:major").s("piano")'),
            },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
        ],
      },
    },
  ],
});
