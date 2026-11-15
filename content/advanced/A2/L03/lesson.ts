// A2.L03 Counter-Melody & Re-Voicing per Section (spec: content/specs/A2.md). A counter-melody is a second tune
// that moves against the main one: it moves when the tune holds, and when both move it often goes the other way,
// so the ear can follow two lines at once. It sits in its own register and never doubles the tune for long.
// Re-voicing the chords per section is an optional stretch (contracts 1.8: one required idea; A2.L06 and AC1
// apply the stretch).
//
// Written for the learner at the gate (AUTHORING §20.1): A2 opens after U10.CP and A1.L07, so the tools are the
// A2 loop's (minor, degree stacks, `arrange()` from U09) and nothing of U11 onward. The loop is the A2 loop in
// A minor at 90 BPM (Am F C G) over `band.aeolian-4bar`'s drums; the second line is labelled `vox` (STYLE §2:
// a second melody line).
//
// The corrections-pass standard (AUTHORING §20.2) on S4 and the Make: S4 reads where the strings START their notes
// in bar 4 (`onsets` with `contains` and `excludes`, so notes with the tune's, or on every beat, fail) and which
// notes they are (`degree-set`, notes of the bar's G chord), and keeps the tune as it was (`events` on `mel`); the
// Make reads the counter-line's motion against the tune and any doubling of it (`counter-melody`). A part more than
// 24 dB under the loudest sounds no notes to the grader, so a line turned down to nothing fails both. Each pins
// wrong answers that use the right function (the right notes on the tune's beats; the tune's own notes copied an
// octave down; a line that moves in step with the tune; the right notes at `.gain(.02)`) and passes three other
// right answers.
import { defineLesson, type HintLadder, type RubricRule } from "@oak/content-kit";

const BPM = 90;
const TEMPO = `setcpm(${BPM}/4)\n\n`;
const code = (...lines: string[]) => `${TEMPO}${lines.join("\n")}`;

const ladder = (nudge: string, pointer: string, partial: string): HintLadder => [
  { text: nudge },
  { text: pointer },
  { text: partial },
  "auto",
];

/** The A2 loop: the roots low, Am F C G as close triads from C3 to E4, the tune above them. */
const BASS = 'bass: note("<a1 f1 c2 g1>").s("sawtooth").lpf(400)';
const CHORD_DEGREES = "<[0,2,4] [-2,0,2] [-5,-3,-1] [-1,1,3]>";
const CHORDS = `chords: n("${CHORD_DEGREES}").scale("A3:minor").s("piano").gain(.5)`;
/** E C A | C A | E C E | B G: every note on a beat is in its chord. */
const TUNE_DEGREES = "<[4 ~ 2 0] [2 ~ 0 ~] [4 2 4 ~] [1 ~ 6 ~]>";
const TUNE = `mel: n("${TUNE_DEGREES}").scale("A4:minor").s("square").lpf(2000).gain(.5)`;
/**
 * The strings' counter-line, under the tune: A3 C4 | A3 C4 | C4 E4 | B3 G3. It rises while the tune falls (bar 1),
 * fills the tune's gaps (bars 2–4), and every note is in its bar's chord.
 */
const VOX_DEGREES = "<[~ ~ 0 2] [~ 0 2 ~] [2 ~ ~ 4] [~ 1 ~ -1]>";
const vox = (degrees: string, at = "A3", tail = "") =>
  `vox: n("${degrees}").scale("${at}:minor").s("strings").gain(.5)${tail}`;

const LOOP = code(BASS, CHORDS, TUNE);
const HOOK = code(BASS, CHORDS, TUNE, vox(VOX_DEGREES));
/** The tune copied an octave down, note for note: a doubling, not a second tune. */
const DOUBLED = code(BASS, CHORDS, TUNE, vox(TUNE_DEGREES));

/** S2: the same bar of the tune three times, with three kinds of second line under it. */
const THREE_LINES = code(
  'bass: note("a1").s("sawtooth").lpf(400)',
  'chords: n("[0,2,4]").scale("A3:minor").s("piano").gain(.5)',
  'mel: n("[2 ~ 0 ~]").scale("A4:minor").s("square").lpf(2000).gain(.5)',
  vox("<[~ 4 ~ 2] [4 ~ 2 ~] [2 ~ 0 ~]>"),
);

/** S4: the counter-line's bar 4 is empty. */
const ANSWER_STARTER = code(BASS, CHORDS, TUNE, vox("<[~ ~ 0 2] [~ 0 2 ~] [2 ~ ~ 4] [⟪~ ~ ~ ~⟫]>"));
const bar4 = (cell: string, at = "A3", tail = "") =>
  code(BASS, CHORDS, TUNE, vox(`<[~ ~ 0 2] [~ 0 2 ~] [2 ~ ~ 4] [${cell}]>`, at, tail));

/** S6 (optional): verse and chorus; the chorus's chords spread wide. */
const SPREAD = "<[-7,4,9] [-9,2,7] [-12,-1,4] [-8,3,8]>";
const sections = (chorus: string, verse = CHORD_DEGREES) =>
  code(
    `const chordsVerse = n("${verse}")`,
    `const chordsChorus = n("${chorus}")`,
    "",
    BASS,
    'chords: arrange([4, chordsVerse], [4, chordsChorus]).scale("A3:minor").s("piano").gain(.5)',
    TUNE,
    vox(VOX_DEGREES),
  );
const SPREAD_STARTER = code(
  `const chordsVerse = n("${CHORD_DEGREES}")`,
  `const chordsChorus = n("⟪${CHORD_DEGREES}⟫")`,
  "",
  BASS,
  'chords: arrange([4, chordsVerse], [4, chordsChorus]).scale("A3:minor").s("piano").gain(.5)',
  TUNE,
  vox(VOX_DEGREES),
);

/** The Make: the loop with an empty second line. */
const MAKE_STARTER = code(BASS, CHORDS, TUNE, vox("~"));
const withVox = (line: string) => code(BASS, CHORDS, TUNE, line);

const NONE = { roll: false, staff: false, keyboard: false } as const;
const ROLL = { roll: true, staff: false, keyboard: false } as const;
const DRUMS = { band: "band.aeolian-4bar", tracks: ["drums"] } as const;

/** Bar 4 of the counter-line: notes that start in the tune's gaps (beats 2 and 4), never with its notes. */
const IN_THE_GAPS: RubricRule = {
  id: "in-the-gaps",
  label: "Bar 4: the strings start their notes while the tune is silent",
  required: true,
  skills: ["D09", "M07"],
  rule: "onsets",
  track: "vox",
  contains: [
    [1, 4],
    [3, 4],
  ],
  excludes: [
    [0, 1],
    [1, 2],
  ],
  perBar: true,
  section: { bars: [4, 4] },
};
/** Bar 4 of the counter-line: notes of its chord, G (G B D: degrees ♭7, 2 and 4 of A minor). */
const NOTES_OF_G: RubricRule = {
  id: "notes-of-g",
  label: "Bar 4: notes of the G chord",
  required: true,
  skills: ["D09"],
  rule: "degree-set",
  track: "vox",
  subsetOf: ["b7", "2", "4"],
  section: { bars: [4, 4] },
};

export default defineLesson({
  id: "A2.L03",
  version: 1,
  title: "Counter-Melody & Re-Voicing per Section",
  objective: "I can write a second line that answers the tune instead of copying it.",
  key: { tonic: "A", mode: "minor" },
  meter: "4/4",
  bpm: BPM,
  introduces: [],
  practises: ["D09", "M07"],
  terms: [{ id: "term.counter-melody", step: "S3" }],
  canDo: ["cd.compose.counter-melody"],
  wrapAt: "S4",
  steps: [
    {
      id: "S1",
      kind: "listen",
      title: "Two lines",
      minutes: 0.5,
      ui: { panels: ROLL, band: DRUMS },
      example: { id: "hook", code: HOOK, bars: 4 },
      exercise: {
        kind: "listen",
        id: "two-lines",
        version: 1,
        role: "practice",
        prompt:
          "Press Play: the A minor loop with a strings line under the tune, then the loop without it. Follow the strings the first time.",
        skills: [{ skill: "D09", w: 1 }],
        hints: null,
        tests: [],
        items: [
          { code: HOOK, caption: "The tune, and a strings line that fills its gaps.", bars: 4 },
          { code: LOOP, caption: "The same loop, the tune alone over the chords.", bars: 4 },
        ],
      },
    },
    {
      id: "S2",
      kind: "predict",
      title: "Which line stands out?",
      minutes: 0.5,
      ui: { panels: NONE },
      exercise: {
        kind: "predict",
        id: "which-line-stands-out",
        version: 1,
        role: "practice",
        prompt:
          "The same two tune notes three times, with a strings line under them. Bar 1 plays between the tune's notes, bar 2 starts each note with the tune's, bar 3 copies the tune an octave down. In which bar will the strings be easiest to hear as a tune of their own?",
        skills: [{ skill: "D09", w: 1 }],
        hints: null,
        tests: [],
        code: THREE_LINES,
        bars: 3,
        mode: "choose",
        choices: [
          { id: "gaps", label: "Bar 1: it moves while the tune holds" },
          { id: "together", label: "Bar 2: it moves exactly with the tune" },
          { id: "octave", label: "Bar 3: an octave below the tune, note for note" },
        ],
        correct: ["gaps"],
      },
    },
    {
      id: "S3",
      kind: "investigate",
      title: "When the strings move",
      minutes: 1,
      ui: { panels: ROLL },
      example: { id: "two-lines", code: HOOK, bars: 4 },
      exercise: {
        kind: "run-investigate",
        id: "when-the-strings-move",
        version: 1,
        role: "practice",
        prompt:
          "Run the loop and watch the tune and the strings on the roll, bar by bar. Look at where each line starts its notes, and which way each one goes.",
        skills: [
          { skill: "D09", w: 0.5 },
          { skill: "M07", w: 0.5 },
        ],
        feedbackText: {
          "investigate.wrong":
            "Not quite. On the roll, find the beats where the tune starts nothing and see whether a strings note starts there, bar by bar. In bar 1, compare the strings' last two notes with the tune's.",
        },
        hints: ladder(
          "In which bars do the strings play while the tune is silent?",
          "Go one bar at a time: a strings note that starts on an empty beat of the tune counts. Bar 1's strings notes both start with tune notes.",
          "Bars 2 and 4 each have one. In bar 1 the tune steps down from C to A: look at the strings on the same two beats.",
        ),
        code: { starter: HOOK },
        mustPlayLoops: 1,
        questions: [
          {
            q: "number",
            prompt:
              "In how many of the four bars does a strings note start on a beat where the tune starts none?",
            correct: 3,
          },
          {
            q: "choice",
            prompt: "In bar 1, while the tune steps down on beats 3 and 4, which way do the strings go?",
            options: [
              { id: "up", label: "Up" },
              { id: "down", label: "Down" },
              { id: "stays", label: "They stay on one note" },
            ],
            correct: ["up"],
          },
        ],
        tests: [
          { name: "both right", response: { answer: { choice: ["up"], number: 3 } }, expect: "pass" },
          {
            name: "the strings heard following the tune down",
            response: { answer: { choice: ["down"], number: 3 } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
          {
            name: "every bar counted",
            response: { answer: { choice: ["up"], number: 4 } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
        ],
      },
    },
    {
      id: "S4",
      kind: "modify",
      title: "Answer in bar 4",
      minutes: 1.25,
      graded: true,
      ui: { panels: ROLL, band: DRUMS },
      exercise: {
        kind: "code-modify",
        id: "answer-in-bar-4",
        version: 1,
        role: "check",
        prompt:
          "Bar 4 of the strings line is empty. The tune plays B on beat 1 and G on beat 3, and is silent after each. Answer it: two strings notes, one in each of those silences, on notes of the G chord (G, B or D). Leave the tune as it is.",
        skills: [
          { skill: "D09", w: 0.6 },
          { skill: "M07", w: 0.4 },
        ],
        code: { starter: ANSWER_STARTER },
        reference: { solutions: [HOOK], bars: 4 },
        matcher: {
          m: "all",
          of: [
            { m: "rubric", rules: [IN_THE_GAPS, NOTES_OF_G] },
            { m: "events", pitch: "absolute", rhythm: "onsets", durations: false, tracks: ["mel"] },
          ],
        },
        target: { audible: true, showRoll: false },
        // The override serves both rules of the rubric, so it stays neutral and names no notes.
        feedbackText: { "rubric.unmet": "{label}: not yet." },
        hints: ladder(
          "On which beats of bar 4 is the tune silent?",
          "The bracket for bar 4 holds four steps, one per beat; `~` is a beat where the strings rest. `n` counts from 0, so degree 5 is `n` 4.",
          "The tune is silent on beats 2 and 4. Of G, B and D, B is degree 2 of A minor; find the other two the same way.",
        ),
        tests: [
          { name: "reference: B then G", response: { code: HOOK }, expect: "pass" },
          { name: "D then B", response: { code: bar4("~ 3 ~ 1") }, expect: "pass" },
          { name: "G then D", response: { code: bar4("~ -1 ~ 3") }, expect: "pass" },
          { name: "B then G an octave lower", response: { code: bar4("~ -6 ~ -8") }, expect: "pass" },
          {
            name: "unchanged",
            response: { code: bar4("~ ~ ~ ~") },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "the right notes, but on the tune's beats 1 and 3",
            response: { code: bar4("1 ~ -1 ~") },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "the tune's own B and G copied an octave down, with the tune",
            response: { code: bar4("1 ~ 6 ~") },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "in the gaps, but A and F: not notes of G",
            response: { code: bar4("~ 0 ~ 5") },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "the right notes, turned down until they are not heard",
            response: {
              code: bar4("~ 1 ~ -1", "A3", "").replace('.s("strings").gain(.5)', '.s("strings").gain(.02)'),
            },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "the strings answered, but the tune's bar 4 edited too",
            response: {
              code: code(
                BASS,
                CHORDS,
                'mel: n("<[4 ~ 2 0] [2 ~ 0 ~] [4 2 4 ~] [1 ~ 4 ~]>").scale("A4:minor").s("square").lpf(2000).gain(.5)',
                vox(VOX_DEGREES),
              ),
            },
            expect: "fail",
            feedback: ["melody.wrong-degree"],
          },
        ],
      },
    },
    {
      id: "S5",
      kind: "ear",
      title: "Its own tune?",
      minutes: 1.25,
      graded: true,
      ui: { panels: NONE },
      exercise: {
        kind: "identify",
        id: "its-own-tune",
        version: 1,
        role: "check",
        prompt:
          "The loop again, with a different strings line under the tune. Is it a second tune of its own, or the tune again, lower down?",
        skills: [{ skill: "D09", w: 1 }],
        hints: [
          { text: "Does each strings note start on its own, or together with a note of the tune?" },
          { text: "Follow the strings' shape: up where the tune goes up, down where it goes down?" },
          { text: "Hear it again, slower, and listen to the strings alone.", replay: { rate: 0.75 } },
          "auto",
        ],
        stimulus: { src: "code", code: DOUBLED, bars: 4, showCode: false },
        cue: { context: "none", countInBars: 0, click: false, replays: -1 },
        answer: {
          ui: "choice",
          options: [
            { id: "own", label: "A second tune of its own" },
            { id: "copy", label: "The tune again, lower down" },
          ],
        },
        correct: { choice: ["copy"] },
        feedbackText: {
          "id.wrong":
            "Not this one. Every strings note started together with a note of the tune and went the same way it did.",
        },
        srs: [{ family: "fam.snd.roles", mode: "review-if-due" }],
        tests: [
          { name: "the copy", response: { answer: { choice: ["copy"] } }, expect: "pass" },
          {
            name: "its own tune",
            response: { answer: { choice: ["own"] } },
            expect: "fail",
            feedback: ["id.wrong"],
          },
        ],
      },
    },
    {
      id: "S6",
      kind: "modify",
      title: "Spread the chorus",
      minutes: 1.25,
      optional: true,
      ui: { panels: ROLL, band: DRUMS, initialPanels: ["form"] },
      exercise: {
        kind: "code-modify",
        id: "spread-the-chorus",
        version: 1,
        role: "practice",
        prompt:
          "For the longer session: eight bars, a verse and a chorus, the chords packed close in both. Spread the chorus's chords: drop each root an octave and lift each 3rd an octave, so the middle, where the strings play, opens up.",
        skills: [{ skill: "D09", w: 1 }],
        code: { starter: SPREAD_STARTER },
        reference: { solutions: [sections(SPREAD)], bars: 8 },
        matcher: {
          m: "rubric",
          rules: [
            {
              id: "spread-chorus",
              label: "The chorus's chords spread: no two of their notes closer than a 4th",
              required: true,
              skills: ["D09"],
              rule: "custom",
              fn: "stack-intervals",
              params: {
                track: "chords",
                semitones: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
              },
              section: { section: "chorus" },
            },
          ],
        },
        constraints: [{ c: "must-use", tool: "tb.arrange", feedback: "code.must-use" }],
        target: { audible: true, showRoll: false },
        feedbackText: { "rubric.unmet": "{label}: not yet." },
        hints: ladder(
          "In the chorus's stacks, which two notes sit closest together?",
          "In each stack the lowest number is the root and the next one up the 3rd. Seven steps of `n` make an octave in this scale.",
          "For the first chord, the root 0 becomes -7. Do the same to the 3rd, upward.",
        ),
        tests: [
          { name: "reference", response: { code: sections(SPREAD) }, expect: "pass" },
          {
            name: "spread upward instead: the root kept, the 3rd lifted",
            response: { code: sections("<[0,4,9] [-2,2,7] [-5,-1,4] [-1,3,8]>") },
            expect: "pass",
          },
          {
            name: "spread, with the root doubled",
            response: { code: sections("<[-7,0,4,9] [-9,-2,2,7] [-12,-5,-1,4] [-8,-1,3,8]>") },
            expect: "pass",
          },
          {
            name: "spread and struck twice a bar",
            response: { code: sections("<[-7,4,9]*2 [-9,2,7]*2 [-12,-1,4]*2 [-8,3,8]*2>") },
            expect: "pass",
          },
          {
            name: "unchanged",
            response: { code: sections(CHORD_DEGREES) },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "the verse spread instead of the chorus",
            response: { code: sections(CHORD_DEGREES, SPREAD) },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "the chorus lifted an octave, still close",
            response: { code: sections("<[7,9,11] [5,7,9] [2,4,6] [6,8,10]>") },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
        ],
      },
    },
    {
      id: "S7",
      kind: "make",
      title: "A second line",
      minutes: 2.75,
      ui: { panels: ROLL, band: DRUMS },
      exercise: {
        kind: "code-make",
        id: "a-second-line",
        version: 1,
        role: "practice",
        prompt:
          "The loop with its tune and an empty strings line. Write a counter-melody: let it move when the tune holds, go the other way when both move, and keep to its own register, under or over the tune. Any sound you like; strings, a pad or a soft synth work well.",
        skills: [
          { skill: "D09", w: 0.6 },
          { skill: "M07", w: 0.4 },
        ],
        code: { starter: MAKE_STARTER },
        bars: [4, 8],
        saveAs: "sketch",
        rubric: [
          {
            id: "answers-the-tune",
            label: "A second line that answers the tune",
            required: true,
            skills: ["D09", "M07"],
            rule: "custom",
            fn: "counter-melody",
            params: { melody: "mel", counter: "vox", minIndependence: 0.5 },
          },
          {
            id: "own-register",
            label: "The second line in its own register, under the tune",
            required: false,
            skills: ["D09"],
            rule: "range",
            track: "vox",
            within: ["c3", "g4"],
          },
          {
            id: "chord-tones-on-beats",
            label: "Notes of the chord on the beats",
            required: false,
            skills: ["M07"],
            rule: "chord-tones-strong",
            minRatio: 0.6,
            melody: "vox",
            harmony: "chords",
            strength: "beat",
          },
        ],
        // The override serves every rule of the rubric, suggestions included, so it stays neutral.
        feedbackText: { "rubric.unmet": "{label}: not yet." },
        hints: ladder(
          "Where does the tune leave room for another line to speak?",
          "On the roll, find the beats where the tune starts nothing, and the places where it steps down. A second line can start a note on the first and step up against the second.",
          "Start with one bar: two notes of its chord, both on beats where the tune is silent.",
        ),
        tests: [
          {
            name: "the starter as it is",
            response: { code: MAKE_STARTER },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          { name: "the strings line of the lesson", response: { code: HOOK }, expect: "pass" },
          {
            name: "minimal: a slow line, one long note a bar against the tune's steps",
            response: { code: withVox(vox("<4 2 -1 1>")) },
            expect: "pass",
          },
          {
            name: "over the tune: high notes in its gaps",
            response: { code: withVox(vox("<[~ 7 ~ ~] [~ 9 ~ 7] [~ ~ ~ 9] [~ 8 ~ 10]>", "A4")) },
            expect: "pass",
          },
          {
            name: "beyond the brief: a triangle line in the gaps, with room, two bars each way",
            response: {
              code: withVox(
                'vox: n("<[~ 2 4 2] [~ 0 2 4] [~ 4 ~ 2] [~ 3 1 -1]>").scale("A3:minor").s("triangle").gain(.45).room(.3)',
              ),
            },
            expect: "pass",
          },
          {
            name: "the tune copied an octave down: a doubling",
            response: { code: DOUBLED },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "a line that moves exactly with the tune, a 3rd below",
            response: { code: withVox(vox("<[2 ~ 0 -2] [0 ~ -2 ~] [2 0 2 ~] [-1 ~ 4 ~]>", "A4")) },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "the strings line of the lesson, turned down until it is not heard",
            response: { code: withVox(vox(VOX_DEGREES, "A3", "").replace(".gain(.5)", ".gain(.02)")) },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
        ],
      },
    },
  ],
});
