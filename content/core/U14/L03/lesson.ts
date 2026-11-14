// U14.L03 Dorian ♮6. Dorian is natural minor with one note raised, the 6th: D minor has B♭, D Dorian has B.
// That one note turns the minor iv chord into a major IV, and i–IV, two chords back and forth, is the groove of
// funk and soul. It is an old colour too: the sea shanty Drunken Sailor climbs through it. What the learner has:
// natural minor and its syllables, do-based (U10), melodic minor's raised 6th and 7th on the way up (U10.L08),
// U14.L01's move on major (one note changed, a new colour; a mode, a characteristic tone), U14.L02's ♭VII, seventh
// chords by name (U12.L01, U12.L04), the bass on `.rootNotes(2)` (U08), lead sheets (U07.L09). Not yet: Lydian
// (U14.L04), Phrygian (U14.L05), the same major IV as a visitor in a minor key (U16.L04). Spec: content/specs/U14.md.
//
// Repertoire (contracts §2.8): song.drunken-sailor (trad., D Dorian), the verse, eight bars as commonly sung, with
// the values of the usual 2/4 print doubled into 4/4 (quarters and eighths, two half notes to end): no dot, no
// tie, no pickup. The registry entry is `verified: false` and has no answer key yet; the step's reference is
// this lesson's own code, and a verified print wins if it differs. Its chords as Oak harmonizes it, i i VII VII
// i i VII i (Dm Dm C C Dm Dm C Dm), are shown on the lead sheet and left alone: i–IV is the groove's, not the
// tune's. Scarborough Fair, which contracts §2.3 also names, is not used (unit spec: 3/4 with a dotted figure in
// every phrase, and its familiar Dorian tune may not be the one in the registry's 1891 source).
//
// Evaluated (headless Strudel): the hook's tune plays A4 . B♭4 A4 . F4 D4 . | B♭4 . A4 F4 . E4 F4 . on D minor
// and the same with B4 on D Dorian; `Dm7` voices F3 C4 D4 F4 C5, `Gm7` G3 B♭3 D4 F4 B♭4 and `G7` G3 D4 F4 G4 B4;
// the bass plays the roots D2 and G2 in a three-three-two rhythm. `n("[3,5,7]")` plays G3 B♭3 D4 on D minor and
// G3 B3 D4 on D Dorian. Drunken Sailor on D4:dorian plays A A A A A A | A D F A | G G G G G G | G C E G |
// A A A A A A | A B C D | C A G E | D D: its one B is bar 6, beat 2, the climb sol la te do.
//
// How it is graded: S4 makes the groove Dorian, the scale word and the second chord, graded as notes on the
// tune (`events`, absolute pitch) and as a chord with its bass (`pcset` per onset); S5 is the unit's Play from
// the page: the last three bars of Drunken Sailor read from the lead sheet and written in `n` (`events`, onsets
// and lengths). The sung climb is never graded into the lesson and has a Quiet path. The Make's one required
// rule is `contains-rn` with `IV`, read in D Dorian: the starter has only i, and `<Dm7 Gm7>` fails with a
// detail that says IV is G major, with B.
import { defineLesson, type HintLadder, type KeySpec, type Matcher } from "@oak/content-kit";

const BPM = 100;
const TEMPO = `setcpm(${BPM}/4)\n\n`;
const code = (...lines: string[]) => `${TEMPO}${lines.join("\n")}`;

const ladder = (nudge: string, pointer: string, partial: string): HintLadder => [
  { text: nudge },
  { text: pointer },
  { text: partial },
  "auto",
];

/**
 * The lesson starts on D minor, the scale the learner knows (the lesson's `key`, so a starter may sit on it:
 * check 13); every step that is on the new scale declares D Dorian.
 */
const D_DOR: KeySpec = { tonic: "D", mode: "dorian" };

/** One string drives the chords and the bass (U08.L04). */
const changes = (form: string) => `const changes = "${form}"\n`;
/** Rhodes stabs between the beats and a finger bass in three-three-two: the groove of the unit's funk loops. */
const RHODES = 'chords: chord(changes).voicing().struct("~ x ~ x ~ ~ x ~").s("rhodes")';
const FINGER = 'bass: chord(changes).rootNotes(2).struct("x ~ ~ x ~ ~ x ~").s("fingerbass").lpf(800)';
const mel = (tune: string, scale = "D4:dorian") => `mel: n("${tune}").scale("${scale}").s("piano")`;
const groove = (form: string, ...lines: string[]) => code(changes(form), RHODES, FINGER, ...lines);

/** The hook's tune: bar 1 over i, bar 2 over the chord on 4. Its 6th (`n` 5) comes once a bar. */
const TUNE = "<[4 ~ 5 4 ~ 2 0 ~] [5 ~ 4 2 ~ 1 2 ~]>";
/** S1: two bars of D minor with Gm7, then two of D Dorian with G7, one patterned `.scale()`. */
const HOOK = groove("<Dm7 Gm7 Dm7 G7>", mel(TUNE, "<D4:minor!2 D4:dorian!2>"));
/** The Dorian groove on its own. */
const DORIAN_GROOVE = groove("<Dm7 G7>", mel(TUNE));

/** S2: home up to home, bar 1 on D minor, bar 2 on D Dorian. */
const TWO_SCALES = code('mel: n("0 1 2 3 4 5 6 7").scale("<D4:minor D4:dorian>").s("piano")');
/** S3: the triad on degree 4, bar 1 on D minor, bar 2 on D Dorian. */
const STACK_ON_FOUR = code('chords: n("[3,5,7]").scale("<D3:minor D3:dorian>").s("rhodes")');

/** S4: the groove in D minor; the target is the same groove in D Dorian, with G7 for Gm7. */
const MODIFY_STARTER = groove("<Dm7 ⟪Gm7⟫>", mel(TUNE, "D4:⟪minor⟫"));
const MODIFY_SOLUTION = DORIAN_GROOVE;
const MODIFY_MATCHER: Matcher = {
  m: "all",
  of: [
    { m: "pcset", perOnset: true, bass: true, tracks: ["chords"] },
    { m: "events", pitch: "absolute", rhythm: "onsets", durations: false, tracks: ["mel"] },
  ],
};

/** S5: Drunken Sailor's verse (see the header), with Oak's chords on a strummed guitar. */
const SAILOR_HEAD = "[4 [4 4] 4 [4 4]] [4 0 2 4] [3 [3 3] 3 [3 3]] [3 -1 1 3] [4 [4 4] 4 [4 4]]";
const SAILOR_TAIL = "[4 5 6 7] [6 4 3 1] [0@2 0@2]";
const SHANTY_CHORDS = 'chords: chord("<Dm Dm C C Dm Dm C Dm>").voicing().s("acgtr").gain(.5)';
const sailor = (tail: string) => code(SHANTY_CHORDS, mel(`<${SAILOR_HEAD} ${tail}>`));
const SAILOR = sailor(SAILOR_TAIL);
/** The code holds bars 1 to 5; bars 6, 7 and 8 are rests until the learner writes them. */
const PAGE_STARTER = sailor("⟪~ ~ ~⟫");
const PAGE_MATCHER: Matcher = {
  m: "events",
  pitch: "absolute",
  rhythm: "onsets+durations",
  durations: true,
  tracks: ["mel"],
};

/** S6: the climb of bar 6 over a held D, sol la te do; then the minor climb, sol le te do, to compare. */
const HELD_D = 'bass: note("d2").s("fingerbass").lpf(800)';
const CLIMB = code(HELD_D, mel("<[4 5 6 7] ~>"));
const MINOR_CLIMB = code(HELD_D, mel("<[4 5 6 7] ~>", "D4:minor"));

/**
 * The Make: one chord, Dm7, with a line that never touches the 6th (A F A F D | G F D F A). It is minor and
 * nothing more: no major IV, no B.
 */
const MAKE_LINE = "<[4 ~ 2 4 ~ 2 0 ~] [3 ~ 2 0 ~ 2 4 ~]>";
const MAKE_STARTER = groove("<Dm7 Dm7>", mel(MAKE_LINE));
/** The smallest change that passes: the second Dm7 becomes G7. */
const MAKE_MINIMAL = groove("<Dm7 G7>", mel(MAKE_LINE));

/** Drums from the Band; chords, bass and line are the learner's, so the rules read them (AUTHORING §8 rule 5). */
const DRUMS = { band: "band.axis-4bar", tracks: ["drums"] } as const;
const NONE = { roll: false, staff: false, keyboard: false } as const;
const ROLL = { roll: true, staff: false, keyboard: false } as const;
const LEAD = { roll: false, staff: "lead", keyboard: false } as const;

export default defineLesson({
  id: "U14.L03",
  version: 1,
  title: "Dorian ♮6",
  objective: "I can turn minor into Dorian by raising its 6th, and write a groove over i and the major IV.",
  key: { tonic: "D", mode: "minor" },
  meter: "4/4",
  bpm: BPM,
  introduces: [],
  practises: ["S12", "H11"],
  terms: [{ id: "term.dorian", step: "S3" }],
  canDo: ["cd.compose.dorian"],
  wrapAt: "S4",
  steps: [
    {
      id: "S1",
      kind: "listen",
      title: "Minor with air",
      minutes: 0.75,
      ui: { panels: ROLL, rollLabels: "note", band: DRUMS, initialPanels: ["chords"] },
      example: { id: "hook", code: HOOK, bars: 4 },
      exercise: {
        kind: "listen",
        id: "minor-with-air",
        key: D_DOR,
        version: 1,
        role: "practice",
        prompt:
          "Press Play: a two-chord groove on the Rhodes over a finger bass, with a piano line on top. Two bars in D minor, then the same two bars with one note of the scale raised. Listen for the lift.",
        skills: [{ skill: "S12", w: 1 }],
        hints: null,
        tests: [],
        items: [
          {
            code: HOOK,
            caption:
              "Two bars in D minor, heavy and closed; then the same numbers with one note a half step higher, and the second chord turns major.",
            bars: 4,
          },
          {
            code: DORIAN_GROOVE,
            caption: "The second colour on its own: still minor, with air in it. It never needs to resolve.",
            bars: 2,
          },
        ],
      },
    },
    {
      id: "S2",
      kind: "predict",
      title: "Which note moves",
      minutes: 0.5,
      ui: { panels: NONE },
      exercise: {
        kind: "predict",
        id: "which-note-moves",
        version: 1,
        role: "practice",
        prompt:
          "Eight notes from home up to home. Bar 1 is on `D4:minor`; bar 2 has the same numbers on the scale of the second groove. Which note moves in bar 2, and which way?",
        skills: [{ skill: "S12", w: 1 }],
        hints: null,
        tests: [],
        code: TWO_SCALES,
        bars: 2,
        mode: "choose",
        choices: [
          { id: "sixth-up", label: "The 6th, up a half step" },
          { id: "third-up", label: "The 3rd, up a half step" },
          { id: "seventh-down", label: "The 7th, down a half step" },
        ],
        correct: ["sixth-up"],
      },
    },
    {
      id: "S3",
      kind: "investigate",
      title: "The chord on 4",
      minutes: 1,
      ui: { panels: ROLL, rollLabels: "note", initialPanels: ["chords"] },
      example: { id: "stack-on-four", code: STACK_ON_FOUR, bars: 2 },
      exercise: {
        kind: "run-investigate",
        id: "the-chord-on-four",
        version: 1,
        role: "practice",
        prompt:
          "The triad on degree 4, bar 1 on D minor and bar 2 on the new scale. Run it with the chord band open and compare the two bars on the roll.",
        skills: [
          { skill: "S12", w: 0.5 },
          { skill: "H11", w: 0.5 },
        ],
        feedbackText: {
          "investigate.wrong":
            "Not quite. Read the middle note of each chord: B♭ in bar 1, B in bar 2. Then count the keys from A, degree 5, up to that B.",
        },
        hints: ladder(
          "Which note of the bar 1 chord is not in the bar 2 chord?",
          "G and D stay. The middle note is degree 6 of the scale, the note that moved in the last step.",
          "B♭ became B. A chord with a B♭ on G is G minor; with the B it is the other quality.",
        ),
        code: { starter: STACK_ON_FOUR },
        mustPlayLoops: 1,
        questions: [
          {
            q: "choice",
            prompt: "Which chord is bar 2?",
            options: [
              { id: "g-major", label: "G major: G, B and D" },
              { id: "g-minor", label: "G minor: G, B♭ and D" },
              { id: "b-flat-major", label: "B♭ major: B♭, D and F" },
            ],
            correct: ["g-major"],
          },
          {
            q: "number",
            prompt: "In bar 2, how many half steps from degree 5, A, up to the 6th?",
            correct: 2,
          },
        ],
        tests: [
          {
            name: "both right",
            response: { answer: { choice: ["g-major"], number: 2 } },
            expect: "pass",
          },
          {
            name: "G minor: that is bar 1",
            response: { answer: { choice: ["g-minor"], number: 2 } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
          {
            name: "one half step: A to B♭, in minor",
            response: { answer: { choice: ["g-major"], number: 1 } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
        ],
      },
    },
    {
      id: "S4",
      kind: "modify",
      title: "Make it Dorian",
      minutes: 1.25,
      graded: true,
      ui: { panels: ROLL, rollLabels: "degree", band: DRUMS, initialPanels: ["chords"] },
      exercise: {
        kind: "code-modify",
        id: "make-it-dorian",
        key: D_DOR,
        version: 1,
        role: "check",
        prompt:
          "The groove in D minor. Play the target: the same groove in D Dorian. Change the scale word, and the second chord to the key's own seventh chord on degree 4, `G7`.",
        skills: [
          { skill: "S12", w: 0.5 },
          { skill: "H11", w: 0.5 },
        ],
        code: { starter: MODIFY_STARTER },
        reference: { solutions: [MODIFY_SOLUTION], bars: 2 },
        matcher: MODIFY_MATCHER,
        constraints: [{ c: "edit-only-regions", feedback: "code.edit-outside" }],
        target: { audible: true, showRoll: false, revealRollAfter: 1 },
        feedbackText: {
          "harmony.pcset":
            "Bar {bar}: your chord has {got}; the target has {exp}. In D Dorian the chord on degree 4 has B, the raised 6th, and the 7th of G7 is F.",
          "melody.wrong-degree":
            "Bar {bar}, {beatLabel}: your {line} plays {got} ({gotSyl}); the target has {exp} ({expSyl}). The tune needs the new scale word too.",
        },
        srs: [
          { family: "fam.key.mode", mode: "review-if-due" },
          { family: "fam.key.scale-spell", mode: "review-if-due" },
        ],
        hints: ladder(
          "Two things decide the colour here: the scale under the tune, and the notes of the second chord. Which of them still says minor?",
          "The word after the colon in `.scale()` names the scale. The second chord has B♭; in the new scale degree 6 is B.",
          'The tune becomes `.scale("D4:dorian")`. The second chord keeps its root and its 7th and loses the m.',
        ),
        tests: [
          { name: "reference", response: { code: MODIFY_SOLUTION }, expect: "pass" },
          {
            name: "the chord in brackets",
            response: { code: groove("<Dm7 [G7]>", mel(TUNE)) },
            expect: "pass",
          },
          {
            name: "unchanged",
            response: { code: groove("<Dm7 Gm7>", mel(TUNE, "D4:minor")) },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "only the scale word: Gm7 still has B♭ against the tune's B",
            response: { code: groove("<Dm7 Gm7>", mel(TUNE)) },
            expect: "fail",
            feedback: ["harmony.pcset"],
          },
          {
            name: "only the chord: the tune still plays B♭",
            response: { code: groove("<Dm7 G7>", mel(TUNE, "D4:minor")) },
            expect: "fail",
            feedback: ["melody.wrong-degree"],
          },
          {
            name: "Gmaj7 for G7: F♯ is not in D Dorian",
            response: { code: groove("<Dm7 G^7>", mel(TUNE)) },
            expect: "fail",
            feedback: ["harmony.pcset"],
          },
        ],
      },
    },
    {
      id: "S5",
      kind: "modify",
      title: "Play from the page",
      minutes: 1.5,
      graded: true,
      // U14's "Play from the page" (AUTHORING §4): the target is shown only as a lead sheet, no roll. A tune in a
      // mode is printed as folk collections print it, in the mode's own signature (no sharps or flats here).
      ui: { panels: LEAD, leadSheet: { melody: "mel", chords: "chords", title: "Drunken Sailor" } },
      example: { id: "the-shanty", code: SAILOR, bars: 8 },
      exercise: {
        kind: "code-modify",
        id: "play-from-the-page",
        key: D_DOR,
        version: 1,
        role: "check",
        prompt:
          "Drunken Sailor, an old sea shanty in D Dorian: eight bars on the page, with its chords above. The code plays bars 1 to 5 and rests after them. Write bars 6, 7 and 8 in `n`.",
        skills: [
          { skill: "N08", w: 0.6 },
          { skill: "S12", w: 0.4 },
        ],
        code: { starter: PAGE_STARTER },
        reference: { solutions: [SAILOR], bars: 8 },
        matcher: PAGE_MATCHER,
        constraints: [{ c: "edit-only-regions", feedback: "code.edit-outside" }],
        target: { audible: true, showRoll: false },
        srs: [{ family: "fam.deg.tonic", mode: "review-if-due" }],
        feedbackText: {
          "melody.wrong-degree":
            "Bar {bar}, {beatLabel}: you have {got} ({gotSyl}); the page has {exp} ({expSyl}). Count lines and spaces up from home, D; `n` is the degree minus one.",
          "melody.missing-note":
            "Bar {bar}, {beatLabel}: the page has a note starting here. Bar 8 is two half notes, each two beats long.",
        },
        hints: ladder(
          "Read bar 6 on the page. Where does it start, and which way does it move?",
          "Bar 6 starts on A, the note of bar 5, and climbs by step in quarter notes. `n` counts from 0: A is degree 5, `n` 4.",
          "Bar 6 is `[4 5 6 7]`. Bar 7 comes back down from C, and bar 8 is two half notes on home.",
        ),
        tests: [
          { name: "reference", response: { code: SAILOR }, expect: "pass" },
          {
            name: "the half notes written with _",
            response: { code: sailor("[4 5 6 7] [6 4 3 1] [0 _ 0 _]") },
            expect: "pass",
          },
          {
            name: "unchanged",
            response: { code: sailor("~ ~ ~") },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "the degree numbers written as n",
            response: { code: sailor("[5 6 7 8] [7 5 4 2] [1@2 1@2]") },
            expect: "fail",
            feedback: ["melody.wrong-degree"],
          },
          {
            name: "bar 8 as one long note",
            response: { code: sailor("[4 5 6 7] [6 4 3 1] [0@4]") },
            expect: "fail",
            feedback: ["melody.missing-note"],
          },
        ],
      },
    },
    {
      id: "S6",
      kind: "sing",
      title: "Sol la te do",
      minutes: 1.25,
      ui: { panels: NONE },
      example: { id: "the-minor-climb", code: MINOR_CLIMB, bars: 2 },
      exercise: {
        kind: "sing",
        id: "sol-la-te-do",
        key: D_DOR,
        version: 1,
        role: "practice",
        prompt:
          "The climb of bar 6 over a held D: sol, la, te, do. Hear it, then sing it on syllables. La is the raised 6th, a whole step above sol. Sing in your own range.",
        skills: [
          { skill: "V03", w: 0.6 },
          { skill: "S12", w: 0.4 },
        ],
        hints: [
          { text: "Hum the held D: that is do, where the climb ends." },
          { text: "Sol to la is a whole step, la to te a half step, te to do a whole step again." },
          { text: "Hear it again, slower, and hum along before you sing.", replay: { rate: 0.75 } },
          "auto",
        ],
        // Quiet mode or no microphone: name the four degrees instead (contracts §8.5); singing never gates.
        fallback: "identify",
        mode: "degree",
        stimulus: { src: "code", code: CLIMB, bars: 2, showCode: false },
        cue: { context: "tonic-chord", countInBars: 1, click: false, replays: -1 },
        target: { from: "degrees", degrees: ["5", "6", "b7", "1"], octaves: [0, 0, 0, 1] },
        labels: "syllables",
        tol: { cents: "learner", octave: "global", driftCompCents: 30, minCoverage: 0.4, passHitRate: 0.8 },
        showTrace: "live",
        srs: [{ family: "fam.deg.tonic", mode: "evidence-only" }],
        tests: [],
      },
    },
    {
      id: "S7",
      kind: "make",
      title: "Your Dorian groove",
      minutes: 2.75,
      ui: { panels: ROLL, rollLabels: "degree", band: DRUMS, initialPanels: ["chords"] },
      exercise: {
        kind: "code-make",
        id: "your-dorian-groove",
        key: D_DOR,
        version: 1,
        role: "practice",
        prompt:
          "A groove that sits on one chord, Dm7, on Rhodes and finger bass, with a short line on D Dorian. It is minor and nothing more. Give it its second chord, the major IV (G or G7), and let your line touch the raised 6, B. Then work on the groove: push a chord, give the bass its own rhythm.",
        skills: [{ skill: "H11", w: 1 }],
        code: { starter: MAKE_STARTER },
        bars: [2, 8],
        saveAs: "sketch",
        rubric: [
          {
            id: "the-major-four",
            label: "The major IV chord in your groove",
            required: true,
            skills: ["H11"],
            rule: "contains-rn",
            rn: ["IV"],
            min: 1,
          },
          {
            id: "line-sings-la",
            label: "Your line plays the raised 6",
            required: false,
            skills: ["S12"],
            rule: "degree-set",
            track: "mel",
            contains: ["6"],
          },
          {
            id: "bass-on-roots",
            label: "The bass on each chord's root",
            required: false,
            skills: ["B01"],
            rule: "bass-line",
            track: "bass",
            harmony: "chords",
            roots: { on: "change", minRatio: 0.75 },
          },
          {
            id: "bass-off-the-beat",
            label: "Bass notes between the beats",
            required: false,
            skills: ["R09"],
            rule: "syncopation",
            track: "bass",
            min: 2,
          },
        ],
        // The override serves every rule of the rubric, suggestions included, so it stays neutral.
        feedbackText: { "rubric.unmet": "{label}: not yet." },
        hints: ladder(
          "Which chord does Dorian have that D minor does not, and is it in your groove?",
          "The chord on degree 4 of D Dorian is G major, with B. Both chords live in `changes`.",
          "Turn the second Dm7 into the chord you wrote in the modify step.",
        ),
        tests: [
          {
            name: "the starter as it is",
            response: { code: MAKE_STARTER },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          { name: "minimal: the second bar becomes G7", response: { code: MAKE_MINIMAL }, expect: "pass" },
          {
            name: "the triad G, with a line that touches B",
            response: { code: groove("<Dm7 G>", mel("<[4 ~ 2 4 ~ 2 0 ~] [3 ~ 5 3 ~ 1 4 ~]>")) },
            expect: "pass",
          },
          {
            name: "beyond the brief: four bars, the Rhodes pushed, a bass of its own",
            response: {
              code: code(
                changes("<Dm7 G7 Dm7 [G7 G]>"),
                'chords: chord(changes).voicing().struct("x ~ ~ x ~ ~ x ~").early(1/8).s("rhodes")',
                'bass: chord(changes).rootNotes(2).struct("x ~ x ~ ~ x ~ x").s("fingerbass").lpf(800)',
                mel("<[4 ~ 5 4 ~ 2 0 ~] [5 ~ 4 3 ~ 5 6 ~] [7 ~ 6 4 ~ 2 0 ~] [3 ~ 5 ~ 4 ~ ~ ~]>"),
              ),
            },
            expect: "pass",
          },
          {
            name: "the minor iv: Gm7 has B♭",
            response: { code: groove("<Dm7 Gm7>", mel(MAKE_LINE)) },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
        ],
      },
    },
  ],
});
