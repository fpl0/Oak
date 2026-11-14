// U16.L03 ♭III & Minor Plagal. ♭III is the last of the four chords a major key borrows from the minor key on
// the same home note: E♭ in C, a major chord on the lowered 3rd. It is C minor's home chord (C E♭ G) with its
// root stepped down to B♭, and I–♭III–IV is three major chords climbing, the sound of riff rock and sixties
// soul. Seen side by side, iv, ♭VI, ♭VII and ♭III are C minor's chords inside a C major song: that mixing is
// modal mixture. And iv falling to I at the end of a phrase is the plagal cadence the learner knows (U06.L07)
// with a minor IV. What the learner has: iv (U16.L01), ♭VI and ♭VII (U16.L02), the minor key's own triads,
// where all four live (U10.L04), the plagal cadence (U06.L07), the chromatic step strings `2b`, `5b`, `6b`
// (U15.L01). Not yet: borrowing in a minor key (U16.L04), borrowed chords under a known tune and found by ear
// (U16.L05). Spec: content/specs/U16.md.
//
// How it is graded (AUTHORING §17, §19.6): the Play from the page step writes `changes` by name from a lead
// sheet with the numerals in the prompt and is graded as chords, pitch classes and lowest note per onset
// (`pcset`, `bass: true`); numerals are an `rn-palette` with `allow: ["triads", "borrowed"]`, read by degree,
// chroma and quality (`iii` for ♭III is `harmony.rn-degree`, `IV` for iv `harmony.rn-case`); the ear step is
// four fixed endings with a three-way choice (`fam.har.cadence` has no minor plagal category). The Make's one
// required rule is `contains-rn` with `bIII`: the starter has none, a loop with the key's own E minor fails.
import {
  defineLesson,
  type HintLadder,
  type IdentifyEx,
  type KeySpec,
  type LeadSheetSpec,
} from "@oak/content-kit";

const BPM = 100;
const TEMPO = `setcpm(${BPM}/4)\n\n`;
const code = (...lines: string[]) => `${TEMPO}${lines.join("\n")}`;

const ladder = (nudge: string, pointer: string, partial: string): HintLadder => [
  { text: nudge },
  { text: pointer },
  { text: partial },
  "auto",
];

const C: KeySpec = { tonic: "C", mode: "major" };
const D: KeySpec = { tonic: "D", mode: "major" };
const F: KeySpec = { tonic: "F", mode: "major" };
const G: KeySpec = { tonic: "G", mode: "major" };

/** One string drives the chords and the bass (U08.L04): change the chords once and the bass follows. */
const changes = (form: string) => `const changes = "${form}"\n`;
/** Organ stabs in 3 + 3 + 2, the riff-rock and soul push. */
const CHORDS = 'chords: chord(changes).voicing().struct("x ~ ~ x ~ ~ x ~").s("organ")';
const BASS = 'bass: chord(changes).rootNotes(2).s("ebass")';
const mel = (pattern: string, scale = "C4:major") => `mel: n("${pattern}").scale("${scale}").s("crunch")`;
const loop = (form: string, ...lines: string[]) => code(changes(form), CHORDS, BASS, ...lines);
/** One chord a bar, held: the graded steps read (and report) each chord once. */
const HELD = 'chords: chord(changes).voicing().s("organ")';
const held = (form: string, ...lines: string[]) => code(changes(form), HELD, BASS, ...lines);

/**
 * The hook's tune: G, the note C major and E♭ major share, opens each bar; B♭ (`6b`, ♭7) passes over E♭, and
 * A♭ (`5b`, ♭6) replaces A over F minor. No note sits a half step above a chord note.
 */
const HOOK_TUNE = mel(
  "<[4 ~ 4 2] [4 ~ 6b 4] [5 ~ 5 3] [4 ~ ~ ~] [4 ~ 4 2] [4 ~ 6b 4] [5b ~ 5b 3] [4 ~ ~ ~]>",
);
const HOOK = loop("<C Eb F C C Eb Fm C>", HOOK_TUNE);
/** The same riff with the key's own chord on 3, E minor, and B (`6`) in its place over it. */
const HOOK_PLAIN = loop("<C Em F C>", mel("<[4 ~ 4 2] [4 ~ 6 4] [5 ~ 5 3] [4 ~ ~ ~]>"));

/** S2: C minor, then E♭ major. */
const CM_THEN_EB = code('chords: chord("<Cm Eb>").voicing().s("organ")');
/** S3: home, ♭III, IV and iv, one held chord a bar. */
const FOUR_CHORDS = held("<C Eb F Fm>");

/**
 * S4, Play from the page: four bars in D major whose tune is the hook's shape (5 ♭7 5 over ♭III, ♭6 over iv).
 * In D, ♭III is F, IV is G and iv is G minor: three white-key roots.
 */
const PAGE_TUNE = mel("<[4 ~ 4 2] [4 ~ 6b 4] [5 ~ 5 3] [5b ~ 5b 3]>", "D4:major");
const page = (form: string) => held(form, PAGE_TUNE);
const PAGE_STARTER = page("<⟪D D D D⟫>");
const PAGE_SOLUTION = page("<D F G Gm>");
/** The lead sheet: the tune and only bar 1's symbol (the starter already holds it); the rest would give it away. */
const LEAD_SHEET: LeadSheetSpec = {
  melody: "mel",
  chords: { chart: [{ bar: 1, beat: 1, symbol: "D" }] },
  title: "Four bars in D",
};

/** S5: the four chords again, in G major, read as numerals. */
const NUMBER_IT = held("<G Bb C Cm>");

/** S6: an ending heard and not seen: a bar of home, the chord before it, home again. */
const ENDING_OPTIONS = [
  { id: "authentic", label: "V to I" },
  { id: "plagal", label: "IV to I: the plagal cadence" },
  { id: "minor-plagal", label: "iv to I: the plagal cadence with a minor IV" },
];
type Ending = "authentic" | "plagal" | "minor-plagal";
const HEARD: Record<Ending, string> = {
  authentic:
    "That was V to I: the chord before home had the leading note, a half step under home, pulling up.",
  plagal:
    "That was IV to I: the chord before home was major and the line inside it fell a whole step, la to sol.",
  "minor-plagal":
    "That was iv to I: the chord before home was minor, and its le fell a half step to sol as home arrived.",
};
const endingHints = (): HintLadder =>
  ladder(
    "Is the chord before home bright or dark? Does any note in it pull up into home?",
    "V has the leading note that rises to home. IV and iv do not: both fall into home, and only iv sounds minor.",
    "Hear it again, slower. Hum the note that moves inside the chord as home arrives: a whole step down, or a half step?",
  );
const OTHER: Record<Ending, Ending> = {
  authentic: "plagal",
  plagal: "minor-plagal",
  "minor-plagal": "plagal",
};
const ending = (id: string, prompt: string, key: KeySpec, form: string, answer: Ending): IdentifyEx => ({
  kind: "identify",
  id,
  version: 1,
  role: "check",
  key,
  prompt,
  skills: [
    { skill: "H13", w: 0.6 },
    { skill: "H03", w: 0.4 },
  ],
  hints: endingHints(),
  stimulus: {
    src: "code",
    code: code(
      `chords: chord("${form}").voicing().s("organ")`,
      `bass: chord("${form}").rootNotes(2).s("ebass")`,
    ),
    bars: 3,
    showCode: false,
  },
  cue: { context: "none", countInBars: 0, click: false, replays: -1 },
  answer: { ui: "choice", options: ENDING_OPTIONS },
  correct: { choice: [answer] },
  feedbackText: { "id.wrong": HEARD[answer] },
  tests: [
    { name: answer, response: { answer: { choice: [answer] } }, expect: "pass" },
    {
      name: `heard as ${OTHER[answer]}`,
      response: { answer: { choice: [OTHER[answer]] } },
      expect: "fail",
      feedback: ["id.wrong"],
    },
  ],
});

/**
 * The Make: a two-chord riff, C and F, that keeps to 1, 2 and 5 (C, D, G): none of them sits a half step above a
 * note of C, F, E♭, A♭, B♭ or F minor, so any chord of the minor side can go under it.
 */
const RIFF = mel("<[7 ~ ~ 4 ~ ~ 8 7] [4 ~ ~ 8 ~ ~ 7 ~]>");
const MAKE_STARTER = loop("<C F C F>", RIFF);
const MAKE_MINIMAL = loop("<C Eb F Fm>", RIFF);

/** Drums from the Band; chords and bass are the learner's, so the rules read them (AUTHORING §8 rule 5). */
const DRUMS = { band: "band.axis-4bar", tracks: ["drums"] } as const;
const NONE = { roll: false, staff: false, keyboard: false } as const;
const ROLL = { roll: true, staff: false, keyboard: false } as const;
const LEAD = { roll: false, staff: "lead", keyboard: false } as const;

export default defineLesson({
  id: "U16.L03",
  version: 1,
  title: "♭III & Minor Plagal",
  objective:
    "I can use ♭III beside iv, ♭VI and ♭VII, name all four as C minor's chords, and hear iv close into I.",
  key: C,
  meter: "4/4",
  bpm: BPM,
  introduces: [],
  practises: ["H13"],
  terms: [{ id: "term.modal-mixture", step: "S3" }],
  canDo: ["cd.write.borrowed-chords"],
  wrapAt: "S4",
  steps: [
    {
      id: "S1",
      kind: "listen",
      title: "Three chords climbing",
      minutes: 0.75,
      ui: { panels: ROLL, rollLabels: "degree", band: DRUMS },
      example: { id: "hook", code: HOOK, bars: 8 },
      exercise: {
        kind: "listen",
        id: "three-chords-climbing",
        version: 1,
        role: "practice",
        prompt:
          "Press Play: a riff on organ stabs and an overdriven guitar, first over the key's own chords, then with a new chord in bar 2 and the sad IV near the end. Listen to bar 2 each time.",
        skills: [{ skill: "H13", w: 1 }],
        hints: null,
        tests: [],
        items: [
          {
            code: HOOK_PLAIN,
            caption: "C, E minor, F, C: every chord is the key's own.",
            bars: 4,
          },
          {
            code: HOOK,
            caption: "C, E♭, F, C, then C, E♭, F minor, C: three major chords climbing, then the sad IV.",
            bars: 8,
          },
        ],
      },
    },
    {
      id: "S2",
      kind: "predict",
      title: "Step the root down",
      minutes: 0.5,
      ui: { panels: NONE },
      exercise: {
        kind: "predict",
        id: "step-the-root-down",
        version: 1,
        role: "practice",
        prompt:
          '`chord("<Cm Eb>")` starts on C minor, the home chord of the parallel minor: C, E♭ and G. Step its C down a whole step to B♭ and keep the rest. Which chord is B♭, E♭ and G?',
        skills: [{ skill: "H13", w: 1 }],
        hints: null,
        tests: [],
        code: CM_THEN_EB,
        bars: 2,
        mode: "choose",
        choices: [
          { id: "eb-major", label: "E♭ major: E♭, G and B♭" },
          { id: "g-minor", label: "G minor" },
          { id: "bb-major", label: "B♭ major" },
        ],
        correct: ["eb-major"],
      },
    },
    {
      id: "S3",
      kind: "investigate",
      title: "Whose chords",
      minutes: 1,
      ui: { panels: ROLL, rollLabels: "degree", initialPanels: ["chords"] },
      example: { id: "four-chords", code: FOUR_CHORDS, bars: 4 },
      exercise: {
        kind: "run-investigate",
        id: "whose-chords",
        version: 1,
        role: "practice",
        prompt:
          "Run it with the chord band open: C, E♭, F and F minor, one chord a bar. Read each chord's degrees on the roll and decide which key each one belongs to.",
        skills: [{ skill: "H13", w: 1 }],
        feedbackText: {
          "investigate.wrong":
            "Not quite. A chord belongs to C minor when it holds E♭, A♭ or B♭ and nothing from C major in their place. Check each bar's degrees on the roll.",
        },
        hints: ladder(
          "Which notes does C minor have that C major does not?",
          "C minor lowers 3, 6 and 7: E♭, A♭ and B♭. A chord with one of them comes from the minor side.",
          "F major holds A, so it is C major's own. For E♭ major, check its three notes one by one against C major.",
        ),
        code: { starter: FOUR_CHORDS },
        mustPlayLoops: 1,
        questions: [
          {
            q: "choice",
            prompt: "Which chords of the loop come from C minor?",
            options: [
              { id: "eb-fm", label: "E♭ and F minor" },
              { id: "eb-f", label: "E♭ and F" },
              { id: "f-fm", label: "F and F minor" },
            ],
            correct: ["eb-fm"],
          },
          { q: "number", prompt: "How many of E♭ major's three notes belong to C major?", correct: 1 },
        ],
        tests: [
          { name: "both right", response: { answer: { choice: ["eb-fm"], number: 1 } }, expect: "pass" },
          {
            name: "E♭ and F: F major counted as borrowed",
            response: { answer: { choice: ["eb-f"], number: 1 } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
          {
            name: "two notes counted",
            response: { answer: { choice: ["eb-fm"], number: 2 } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
        ],
      },
    },
    {
      id: "S4",
      kind: "modify",
      title: "Play from the page",
      minutes: 1.5,
      graded: true,
      // U16's "Play from the page" (AUTHORING §4): the tune is shown only as a lead sheet with bar 1's symbol and
      // no others (they would give the answer away); the numerals are in the prompt, the key signature says the key.
      ui: { panels: LEAD, leadSheet: LEAD_SHEET, band: DRUMS },
      example: { id: "the-page", code: code(PAGE_TUNE), bars: 4 },
      exercise: {
        kind: "code-modify",
        id: "play-from-the-page",
        version: 1,
        role: "check",
        key: D,
        prompt:
          "The page holds four bars of a tune in D major: two sharps, F♯ and C♯. The numerals of the four bars are I, ♭III, IV, iv. Bar 1 is D. Write the four chords by name in `changes`; the starter has D in every bar.",
        skills: [{ skill: "H13", w: 1 }],
        code: { starter: PAGE_STARTER },
        reference: { solutions: [PAGE_SOLUTION], bars: 4 },
        // A chord is its notes: the pitch classes at each onset and the lowest one (contracts §6.7).
        matcher: { m: "pcset", perOnset: true, bass: true, tracks: ["chords"] },
        constraints: [{ c: "edit-only-regions", feedback: "code.edit-outside" }],
        target: { audible: true, showRoll: false },
        feedbackText: {
          "harmony.pcset":
            "Bar {bar}: your chord has {got}; the page wants {exp}. Find each root's degree in D major first, then lower it where the numeral has a flat.",
        },
        srs: [{ family: "fam.har.rn", mode: "review-if-due" }],
        hints: ladder(
          "Which letters stand on degrees 1, 3 and 4 of D major?",
          "D, F♯ and G. ♭III lowers the root on 3 a half step and puts a major chord on it; iv is the minor chord on 4.",
          "Bar 1 stays D and bar 3 is `G`. Bar 2's root is F♯ lowered; bar 4 is bar 3 made minor.",
        ),
        tests: [
          { name: "reference", response: { code: PAGE_SOLUTION }, expect: "pass" },
          { name: "each bar in brackets", response: { code: page("<[D] [F] [G] [Gm]>") }, expect: "pass" },
          {
            name: "unchanged: D in every bar",
            response: { code: page("<D D D D>") },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "F#m for F: the key's own iii",
            response: { code: page("<D F#m G Gm>") },
            expect: "fail",
            feedback: ["harmony.pcset"],
          },
          {
            name: "G in the last bar: IV for iv",
            response: { code: page("<D F G G>") },
            expect: "fail",
            feedback: ["harmony.pcset"],
          },
          {
            // `Fmaj` is how some charts print it, not how Strudel reads it: the lint names the spelling.
            name: "Fmaj written out",
            response: { code: page("<D Fmaj G Gm>") },
            expect: "fail",
            feedback: ["code.unknown-chord"],
          },
        ],
      },
    },
    {
      id: "S5",
      kind: "quiz",
      title: "Number the riff",
      minutes: 1,
      graded: true,
      ui: { panels: NONE },
      exercise: {
        kind: "identify",
        id: "number-the-riff",
        version: 1,
        role: "check",
        key: G,
        prompt:
          "The same four chords in G major, shown as code. Write the numeral of each bar: a flat where the root is a lowered degree, upper case for major, lower case for minor.",
        skills: [
          { skill: "H13", w: 0.6 },
          { skill: "N06", w: 0.4 },
        ],
        hints: ladder(
          "On which degree of G major does each root stand? Is any root outside the key?",
          "G is 1 and C is 4. B♭ is not in G major: it is degree 3, B, lowered a half step.",
          "Bars 1 and 3 are I and IV. Bar 2 is a major chord on the lowered 3rd; bar 4 is bar 3 made minor.",
        ),
        stimulus: { src: "code", code: NUMBER_IT, bars: 4, showCode: true },
        cue: { context: "none", countInBars: 0, click: false, replays: -1 },
        answer: { ui: "rn-palette", slots: 4, allow: ["triads", "borrowed"] },
        correct: { rn: ["I", "bIII", "IV", "iv"] },
        srs: [{ family: "fam.har.rn", mode: "review-if-due" }],
        tests: [
          { name: "I ♭III IV iv", response: { answer: { rn: ["I", "bIII", "IV", "iv"] } }, expect: "pass" },
          {
            name: "the flat sign as written",
            response: { answer: { rn: ["I", "♭III", "IV", "iv"] } },
            expect: "pass",
          },
          {
            name: "iii for ♭III: the key's own chord on 3",
            response: { answer: { rn: ["I", "iii", "IV", "iv"] } },
            expect: "fail",
            feedback: ["harmony.rn-degree"],
          },
          {
            name: "III without its flat",
            response: { answer: { rn: ["I", "III", "IV", "iv"] } },
            expect: "fail",
            feedback: ["harmony.rn-degree"],
          },
          {
            name: "IV for iv",
            response: { answer: { rn: ["I", "bIII", "IV", "IV"] } },
            expect: "fail",
            feedback: ["harmony.rn-case"],
          },
        ],
      },
    },
    {
      id: "S6",
      kind: "ear",
      title: "Which close",
      minutes: 1.25,
      graded: true,
      ui: { panels: NONE },
      exercise: {
        kind: "all",
        id: "which-close",
        version: 1,
        role: "check",
        prompt:
          "Four endings, heard and not seen, each in its own key: a bar of home, one chord, and home again. Which chord brings it home: V, IV, or the sad iv?",
        skills: [
          { skill: "H13", w: 0.6 },
          { skill: "H03", w: 0.4 },
        ],
        hints: endingHints(),
        tests: [],
        parts: [
          ending("close-in-c", "Ending 1, in C major.", C, "<C G C>", "authentic"),
          ending("close-in-f", "Ending 2, in F major.", F, "<F Bb F>", "plagal"),
          ending("close-in-g", "Ending 3, in G major.", G, "<G Cm G>", "minor-plagal"),
          ending("close-in-d", "Ending 4, in D major.", D, "<D Gm D>", "minor-plagal"),
        ],
      },
    },
    {
      id: "S7",
      kind: "make",
      title: "Your riff",
      minutes: 2.75,
      ui: { panels: ROLL, rollLabels: "degree", band: DRUMS, initialPanels: ["chords"] },
      exercise: {
        kind: "code-make",
        id: "your-riff",
        version: 1,
        role: "practice",
        prompt:
          "A riff over C and F with organ stabs and a bass. You have seven chords for it now: C, F and G from C major; E♭, A♭, B♭ and F minor from C minor. Write a four- or eight-bar loop that brings in E♭ and anything else from the minor side. Try closing on F minor into C.",
        skills: [{ skill: "H13", w: 1 }],
        code: { starter: MAKE_STARTER },
        bars: [4, 8],
        saveAs: "sketch",
        rubric: [
          {
            id: "flat-three",
            label: "♭III somewhere in your loop",
            required: true,
            skills: ["H13"],
            rule: "contains-rn",
            rn: ["bIII"],
            min: 1,
          },
          {
            id: "two-borrowed",
            label: "A second borrowed chord beside it",
            required: false,
            skills: ["H13"],
            rule: "contains-rn",
            rn: [],
            kind: ["borrowed"],
            min: 2,
          },
          {
            id: "riff-touches-minor",
            label: "The riff touches ♭3 or ♭7",
            required: false,
            skills: ["P06"],
            rule: "degree-set",
            track: "mel",
            anyOf: ["b3", "b7"],
          },
          {
            id: "minor-plagal-close",
            label: "The loop ends on home, after F minor",
            required: false,
            skills: ["H03"],
            rule: "cadence",
            types: ["PC"],
            at: "last",
          },
        ],
        // The override serves every rule of the rubric, suggestions included, so it stays neutral.
        feedbackText: { "rubric.unmet": "{label}: not yet." },
        hints: ladder(
          "Which of the seven chords stands on the lowered 3rd of C major?",
          "All the chords live in `changes`. Degree 3 of C major is E; lowered it is E♭, and ♭III is the major chord on it.",
          "Put that chord where a C or an F is now, for example in bar 2. Then try F minor in the last bar but one.",
        ),
        tests: [
          {
            name: "the starter as it is",
            response: { code: MAKE_STARTER },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          { name: "minimal: I ♭III IV iv", response: { code: MAKE_MINIMAL }, expect: "pass" },
          { name: "♭III with ♭VII", response: { code: loop("<C Eb Bb F>", RIFF) }, expect: "pass" },
          { name: "♭III, ♭VI and ♭VII", response: { code: loop("<C Eb Ab Bb>", RIFF) }, expect: "pass" },
          {
            name: "beyond the brief: eight bars, the riff bending to ♭7 and ♭3, closing iv into I",
            response: {
              code: loop(
                "<C Eb F C Ab Bb Fm C>",
                mel(
                  "<[7 ~ ~ 4 ~ ~ 8 7] [4 ~ ~ 6b ~ ~ 4 ~] [7 ~ ~ 4 ~ ~ 8 7] [4 ~ ~ 8 ~ ~ 7 ~] [7 ~ ~ 2b ~ ~ 5b 7] [8 ~ ~ 6b ~ ~ 3 ~] [7 ~ ~ 4 ~ ~ 5b 4] [7 ~ ~ ~ ~ ~ ~ ~]>",
                ),
              ),
            },
            expect: "pass",
          },
          {
            name: "E minor, the key's own chord on 3, with the sad IV",
            response: { code: loop("<C Em F Fm>", RIFF) },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
        ],
      },
    },
  ],
});
