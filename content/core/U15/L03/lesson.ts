// U15.L03 Visiting Other Chords. Any major or minor chord of the key can have its own V7 in front of it: E7
// visits A minor (V7/vi), A7 visits D minor (V7/ii), C7 visits F (V7/IV). Each brings one note from outside
// the key, the one that leans into its target (si G♯ into A, di C♯ into D, te B♭ down to A, the 3rd of F), and
// each is named by where it goes. What the learner has: the V7 of V and its name, secondary dominant
// (U15.L02); fi, si, di and te sung and written in code (U15.L01); "C7 leans into F" heard before it had a name
// (U12.L02); one `const` driving chords and bass (U08.L04); a lead sheet read into code (U07.L09). Not yet: the
// leading-tone chord of a chord and the word tonicization (U15.L04), dominants aimed at dominants (U15.L05),
// finding them in a drill (`fam.har.chromatic`, U15.L06). V/iii is left out on purpose. Spec:
// content/specs/U15.md.
//
// How it is graded (AUTHORING §17, §19.6): a chord built on the keyboard is its pitch classes and its lowest
// note (`kb.*`); the Play from the page step writes `changes` by name and is graded as chords, pitch classes and
// lowest note per onset (`pcset`, `bass: true`), so `Bm7` for `B7` misses on a note; "which chord is it aimed
// at" is three fixed `choice` items (the drill opens in U15.L06). The Make's one required rule is
// `contains-rn` with V/vi, V/ii and V/IV and `mustResolve`: a visitor counts only where the next chord is its
// target, and the starter's Em, C and Am are the key's own (a plain C before F is I, not V/IV).
import { defineLesson, type HintLadder, type IdentifyEx, type LeadSheetSpec } from "@oak/content-kit";

const BPM = 88;
const TEMPO = `setcpm(${BPM}/4)\n\n`;
const code = (...lines: string[]) => `${TEMPO}${lines.join("\n")}`;

const ladder = (nudge: string, pointer: string, partial: string): HintLadder => [
  { text: nudge },
  { text: pointer },
  { text: partial },
  "auto",
];

/** One string drives the chords and the bass (U08.L04): change the chords once and the bass follows. */
const changes = (form: string) => `const changes = "${form}"\n`;
const CHORDS = 'chords: chord(changes).voicing().s("rhodes")';
/** The root of every chord, low on the upright: the voicing above does not always put it lowest. */
const BASS = 'bass: chord(changes).rootNotes(2).s("upright")';
const mel = (pattern: string, scale = "C4:major") => `mel: n("${pattern}").scale("${scale}").s("piano")`;
const loop = (form: string, ...lines: string[]) => code(changes(form), CHORDS, BASS, ...lines);

/**
 * The ballad turn's tune. In the hook it takes the note each visitor brings and resolves it: si to la (bars
 * 2-3), te down through the C7 (bar 4), di up to re (bars 6-7). Evaluated: G E | G♯ B G♯ | A E C | B♭ G E |
 * A F | C♯ E G | D F D | D B. The plain version has G, B and C where the hook bends.
 */
const ballad = (si: string, te: string, di: string) =>
  mel(`<[4 ~ 2 ~] [${si} ~ 6 ${si}] [5 ~ 2 0] [${te} ~ 4 2] [5 ~ 3 ~] [${di} ~ 2 4] [1 ~ 3 1] [1 ~ -1 ~]>`);
const PLAIN_TUNE = ballad("4", "6", "0");
const BENT_TUNE = ballad("4#", "6b", "0#");
const IN_KEY = "<C Em Am C F Am Dm G7>";
const VISITED = "<C E7 Am C7 F A7 Dm G7>";
const HOOK = loop(VISITED, BENT_TUNE);
const HOOK_IN_KEY = loop(IN_KEY, PLAIN_TUNE);

/** S2: a bar of C, then E7, then the chord it leans into, held. */
const PREDICT = loop("<C E7 Am Am>");

/**
 * S5, Play from the page: a tune in G major whose outside notes are each the last note of their bar and step
 * straight into the next bar (D♯ to E, F♮ to E, G♯ to A), so the staff spells them by the half step they
 * resolve through. Engraved: D B | F♯ D♯ | E B | D F♮ | E C | D G♯ | A C A | A F♯. The page shows the tune only;
 * the prompt gives the numerals I V7/vi vi V7/IV IV V7/ii ii V7.
 */
const PAGE_TUNE = mel(
  "<[4 ~ 2 ~] [6 ~ 4# ~] [5 ~ 2 ~] [4 ~ 6b ~] [5 ~ 3 ~] [4 ~ 0# ~] [1 ~ 3 1] [1 ~ -1 ~]>",
  "G4:major",
);
const page = (form: string) => loop(form, PAGE_TUNE);
const PAGE_STARTER = page("<⟪G G G G G G G G⟫>");
const PAGE_SOLUTION = page("<G B7 Em G7 C E7 Am D7>");
/**
 * The lead sheet: the tune, and only the first bar's symbol (the starter already holds it); the other seven would
 * give the answer away, so the page shows numerals for them in the prompt.
 */
const LEAD_SHEET: LeadSheetSpec = {
  melody: "mel",
  chords: { chart: [{ bar: 1, beat: 1, symbol: "G" }] },
  title: "Eight bars in G",
};

/** S6: a loop heard without its code; bar 2 holds a visitor aimed at bar 3. */
const heard = (form: string) =>
  code(
    changes(form),
    'chords: chord(changes).voicing().struct("x ~ x ~").s("rhodes")',
    'bass: chord(changes).rootNotes(2).struct("x ~ ~ x").s("upright")',
  );

/** The Make: the ballad turn on the key's own chords, with the plain tune. Three doors to open. */
const MAKE_STARTER = loop(IN_KEY, PLAIN_TUNE);
const MAKE_MINIMAL = loop("<C E7 Am C F Am Dm G7>", PLAIN_TUNE);

/** Drums from the Band; chords and bass are the learner's, so the rules read them (AUTHORING §8 rule 5). */
const DRUMS = { band: "band.axis-4bar", tracks: ["drums"] } as const;
const C_MAJOR = { tonic: "C", mode: "major" } as const;
const G_MAJOR = { tonic: "G", mode: "major" } as const;
const NONE = { roll: false, staff: false, keyboard: false } as const;
const ROLL = { roll: true, staff: false, keyboard: false } as const;
const KEYS = { roll: false, staff: false, keyboard: true } as const;
const LEAD = { roll: false, staff: "lead", keyboard: false } as const;

const TARGETS = [
  { id: "vi", label: "A minor, vi" },
  { id: "ii", label: "D minor, ii" },
  { id: "iv", label: "F, IV" },
] as const;
type Target = (typeof TARGETS)[number]["id"];

/** What the right answer sounds like: the note the visitor brings, and where it goes. */
const LISTEN_FOR: Record<Target, string> = {
  vi: "That one was aimed at A minor: its outside note is si, G♯, which climbs a half step into A.",
  ii: "That one was aimed at D minor: its outside note is di, C♯, which climbs a half step into D.",
  iv: "That one was aimed at F: home turned restless with te, B♭, which falls a half step onto A, the 3rd of F.",
};

const earPart = (n: number, form: string, target: Target, other: Target): IdentifyEx => ({
  kind: "identify",
  id: `aimed-at-${target}`,
  version: 1,
  role: "check",
  key: C_MAJOR,
  prompt: `Loop ${n}, in C major. Bar 2 is a visitor. Which chord is it aimed at?`,
  skills: [
    { skill: "H12", w: 0.6 },
    { skill: "E12a", w: 0.4 },
  ],
  hints: [
    { text: "Listen to bar 3: the visitor lands there. Is that chord minor or major?" },
    {
      text: "Hum the top of bar 2 and let it move. Si climbs into A, di climbs into D, te falls onto the A of an F chord.",
    },
    {
      text: "Hear it again, slower, and hum the bass: in bar 3 it lands a 5th below where it was in bar 2.",
      replay: { rate: 0.75 },
    },
    "auto",
  ],
  stimulus: { src: "code", code: heard(form), bars: 4, showCode: false },
  cue: { context: "none", countInBars: 1, click: false, replays: -1 },
  answer: { ui: "choice", options: [...TARGETS] },
  correct: { choice: [target] },
  feedbackText: { "id.wrong": LISTEN_FOR[target] },
  tests: [
    { name: target, response: { answer: { choice: [target] } }, expect: "pass" },
    {
      name: `heard as ${other}`,
      response: { answer: { choice: [other] } },
      expect: "fail",
      feedback: ["id.wrong"],
    },
  ],
});

export default defineLesson({
  id: "U15.L03",
  version: 1,
  title: "Visiting Other Chords",
  objective:
    "I can aim a secondary dominant at vi, ii or IV (V7/vi, V7/ii, V7/IV), hear where it lands, and name it.",
  key: C_MAJOR,
  meter: "4/4",
  bpm: BPM,
  introduces: [],
  practises: ["H12"],
  terms: [],
  canDo: ["cd.write.applied-chords"],
  wrapAt: "S4",
  steps: [
    {
      id: "S1",
      kind: "listen",
      title: "Three small arrivals",
      minutes: 1,
      ui: { panels: ROLL, rollLabels: "degree", band: DRUMS },
      example: { id: "hook", code: HOOK, bars: 8 },
      exercise: {
        kind: "listen",
        id: "three-small-arrivals",
        version: 1,
        role: "practice",
        prompt:
          "Press Play: an eight-bar soul ballad turn on the key's own chords. Then the same turn with three of its chords turned into dominant sevenths on the same roots. Listen for the three places where the harmony tilts toward the next chord and lands on it.",
        skills: [{ skill: "H12", w: 1 }],
        hints: null,
        tests: [],
        items: [
          { code: HOOK_IN_KEY, caption: "C, Em, Am, C, F, Am, Dm, G7: every chord the key's own.", bars: 8 },
          {
            code: HOOK,
            caption: "C, E7, Am, C7, F, A7, Dm, G7: three visitors, each landing on the chord after it.",
            bars: 8,
          },
        ],
      },
    },
    {
      id: "S2",
      kind: "predict",
      title: "Where E7 lands",
      minutes: 0.5,
      ui: { panels: NONE },
      exercise: {
        kind: "predict",
        id: "where-e7-lands",
        version: 1,
        role: "practice",
        prompt:
          "E7 is E, G♯, B and D. A dominant seventh leans to the chord a 5th below its root. In C major, which chord will E7 land on?",
        skills: [{ skill: "H12", w: 1 }],
        hints: null,
        tests: [],
        code: PREDICT,
        bars: 4,
        mode: "choose",
        choices: [
          { id: "a-minor", label: "A minor, vi: a 5th below E" },
          { id: "f", label: "F, IV: a half step above E" },
          { id: "c", label: "C, home: every dominant seventh goes home" },
        ],
        correct: ["a-minor"],
      },
    },
    {
      id: "S3",
      kind: "investigate",
      title: "What each visitor brings",
      minutes: 1,
      ui: { panels: ROLL, rollLabels: "note", initialPanels: ["chords"] },
      example: { id: "hook-chords", code: HOOK, bars: 8 },
      exercise: {
        kind: "run-investigate",
        id: "what-each-visitor-brings",
        version: 1,
        role: "practice",
        prompt:
          "Run the hook with the chord band open. It names each visitor by where it goes: V7/vi, V7/IV, V7/ii. Read A7 in bar 6 on the roll, then count the bars whose chord C major does not own.",
        skills: [{ skill: "H12", w: 1 }],
        feedbackText: {
          "investigate.wrong":
            "Not quite. A7 is A, C♯, E and G: one of those is a black key. For the count, G7 in bar 8 is the key's own V7; only the chords the band writes with a slash are visitors.",
        },
        hints: ladder(
          "A7 leans into D minor. Which note of A7 is a half step below D?",
          "Read bar 6 on the roll from the bottom. Three of A7's notes are white keys. For the count, look for the slashes on the chord band.",
          "A7's outside note is the leading tone of D. The band writes three numerals with a slash; G7 in bar 8 is plain V7.",
        ),
        code: { starter: HOOK },
        mustPlayLoops: 1,
        questions: [
          {
            q: "choice",
            prompt: "Which note from outside the key does A7 bring?",
            options: [
              { id: "c-sharp", label: "C♯: di, the leading tone of D" },
              { id: "b-flat", label: "B♭: te" },
              { id: "g-sharp", label: "G♯: si" },
            ],
            correct: ["c-sharp"],
          },
          {
            q: "number",
            prompt: "How many of the eight bars hold a chord that is not the key's own?",
            correct: 3,
          },
        ],
        tests: [
          { name: "both right", response: { answer: { choice: ["c-sharp"], number: 3 } }, expect: "pass" },
          {
            name: "B♭ for A7's outside note: that is C7's",
            response: { answer: { choice: ["b-flat"], number: 3 } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
          {
            name: "4 counted: G7 is the key's own",
            response: { answer: { choice: ["c-sharp"], number: 4 } },
            expect: "fail",
            feedback: ["investigate.wrong"],
          },
        ],
      },
    },
    {
      id: "S4",
      kind: "quiz",
      title: "Aim at A minor",
      minutes: 1,
      graded: true,
      ui: { panels: KEYS },
      exercise: {
        kind: "keyboard",
        id: "aim-at-a-minor",
        version: 1,
        role: "check",
        key: C_MAJOR,
        prompt:
          "Build V7/vi of C major on the keyboard, root lowest: the dominant seventh that leans into A minor.",
        skills: [{ skill: "H12", w: 1 }],
        hints: ladder(
          "A dominant seventh sits a 5th above the chord it leans into. What is a 5th above A?",
          "A 5th above A is E. E minor is the key's own chord there; the visitor is a major triad on E with a ♭7 on top.",
          "Start from E, G, B, D, the key's own seventh on E. One of those notes has to rise a half step to become A's leading tone.",
        ),
        answer: { ui: "keyboard", range: ["c3", "c5"], mode: "chord" },
        expect: { pcs: [4, 8, 11, 2], bassPc: 4 },
        pitchMode: "octave-free",
        // G for G♯ is Em7, the key's own chord on 3. The catalog names the missing note and the wrong lowest note
        // with the grader's spelling (A♭ for G♯), so these say what the visitor needs without naming it.
        feedbackText: {
          "kb.extra-note":
            "{got} doesn't belong. That is the key's own note; the visitor needs A's leading tone.",
          "kb.missing-note": "A note is missing. V7/vi has four: a major triad on E with a ♭7 on top.",
          "kb.bass": "The lowest note should be {exp}, the root: build the chord up from it.",
        },
        srs: [{ family: "fam.har.rn", mode: "review-if-due" }],
        tests: [
          { name: "E G♯ B D", response: { answer: { midi: [52, 56, 59, 62] } }, expect: "pass" },
          { name: "spread: E B D G♯", response: { answer: { midi: [52, 59, 62, 68] } }, expect: "pass" },
          {
            name: "G for G♯: Em7, the key's own chord on 3",
            response: { answer: { midi: [52, 55, 59, 62] } },
            expect: "fail",
            feedback: ["kb.extra-note", "kb.missing-note"],
          },
          {
            name: "E G♯ B: the triad, no 7th",
            response: { answer: { midi: [52, 56, 59] } },
            expect: "fail",
            feedback: ["kb.missing-note"],
          },
          {
            name: "G♯ at the bottom",
            response: { answer: { midi: [56, 59, 62, 64] } },
            expect: "fail",
            feedback: ["kb.bass"],
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
      // U15's "Play from the page" (AUTHORING §4): the tune is shown only as a lead sheet, with no chord
      // symbols; the numerals are in the prompt and the key signature says the key.
      ui: { panels: LEAD, leadSheet: LEAD_SHEET, band: DRUMS },
      example: { id: "the-page", code: code(PAGE_TUNE), bars: 8 },
      exercise: {
        kind: "code-modify",
        id: "play-from-the-page",
        version: 1,
        role: "check",
        key: G_MAJOR,
        prompt:
          "The page: eight bars of a tune in G major; only bar 1 has its symbol. Its numerals are I, V7/vi, vi, V7/IV, IV, V7/ii, ii, V7. Write the eight chords by name in `changes`; the starter has G in every bar. Each accidental on the page is a note its visitor brings.",
        skills: [{ skill: "H12", w: 1 }],
        code: { starter: PAGE_STARTER },
        reference: { solutions: [PAGE_SOLUTION], bars: 8 },
        // A chord is its notes: the pitch classes at each onset and the lowest one (contracts §6.7).
        matcher: { m: "pcset", perOnset: true, bass: true, tracks: ["chords"] },
        constraints: [{ c: "edit-only-regions", feedback: "code.edit-outside" }],
        target: { audible: true, showRoll: false },
        feedbackText: {
          "harmony.pcset":
            "Bar {bar}: your chord has {got}; the page wants {exp}. A visitor is a dominant seventh, a major triad with a ♭7, built a 5th above the root of the chord it leads to.",
        },
        srs: [{ family: "fam.har.rn", mode: "review-if-due" }],
        hints: ladder(
          "Each visitor is named by where it goes. In G major, which chords are vi, IV and ii?",
          "vi is Em, IV is C, ii is Am, and V7 is D7. A V7 aimed at a chord is the dominant seventh built a 5th above that chord's root.",
          "Bars 1 to 3 are `G B7 Em`: B is a 5th above E. Bars 4 to 8 follow the same rule.",
        ),
        tests: [
          { name: "reference", response: { code: PAGE_SOLUTION }, expect: "pass" },
          {
            name: "each bar in brackets",
            response: { code: page("<[G] [B7] [Em] [G7] [C] [E7] [Am] [D7]>") },
            expect: "pass",
          },
          {
            name: "unchanged: G in every bar",
            response: { code: page("<G G G G G G G G>") },
            expect: "fail",
            feedback: ["code.unchanged"],
          },
          {
            name: "Bm7 for B7: the key's own iii7, D for D♯",
            response: { code: page("<G Bm7 Em G7 C E7 Am D7>") },
            expect: "fail",
            feedback: ["harmony.pcset"],
          },
          {
            name: "Gmaj7 for G7: the key's own Imaj7, F♯ for F",
            response: { code: page("<G B7 Em G^7 C E7 Am D7>") },
            expect: "fail",
            feedback: ["harmony.pcset"],
          },
          {
            name: "A7 for E7: the V7 of V, a 5th above the wrong chord",
            response: { code: page("<G B7 Em G7 C A7 Am D7>") },
            expect: "fail",
            feedback: ["harmony.pcset"],
          },
        ],
      },
    },
    {
      id: "S6",
      kind: "ear",
      title: "Aimed at which chord",
      minutes: 1.25,
      graded: true,
      ui: { panels: NONE },
      exercise: {
        kind: "all",
        id: "aimed-at-which-chord",
        version: 1,
        role: "check",
        prompt:
          "Three loops of four bars, heard and not seen, each in C major with one visitor in bar 2. Which chord is it aimed at: A minor, D minor or F?",
        skills: [
          { skill: "H12", w: 0.6 },
          { skill: "E12a", w: 0.4 },
        ],
        hints: ladder(
          "Listen to bar 3: the visitor lands there. Is that chord minor or major?",
          "Hum the top of bar 2 and let it move. Si climbs into A, di climbs into D, te falls onto the A of an F chord.",
          "Two of the targets are minor. If bar 3 is major, it is F. If it is minor, sing its bass against home: A is la, D is re.",
        ),
        srs: [{ family: "fam.deg.fet-chromatic", mode: "review-if-due" }],
        tests: [],
        parts: [
          earPart(1, "<C E7 Am G7>", "vi", "ii"),
          earPart(2, "<C A7 Dm G7>", "ii", "vi"),
          earPart(3, "<C C7 F G7>", "iv", "ii"),
        ],
      },
    },
    {
      id: "S7",
      kind: "make",
      title: "Three doors",
      minutes: 2.75,
      ui: { panels: ROLL, rollLabels: "degree", band: DRUMS, initialPanels: ["chords"] },
      exercise: {
        kind: "code-make",
        id: "three-doors",
        version: 1,
        role: "practice",
        prompt:
          "The ballad turn on the key's own chords, with a bass and a tune. Em, C and Am sit a 5th above the chord after them. Open at least one door: turn one into the V7 of the chord that follows, and let the tune take the note the visitor brings. Open all three if they sound right to you.",
        skills: [{ skill: "H12", w: 1 }],
        code: { starter: MAKE_STARTER },
        bars: [4, 8],
        saveAs: "sketch",
        rubric: [
          {
            id: "a-visitor-that-lands",
            label: "A V7 aimed at vi, ii or IV that lands there",
            required: true,
            skills: ["H12"],
            rule: "contains-rn",
            rn: ["V/vi", "V/ii", "V/IV"],
            min: 1,
            mustResolve: true,
          },
          {
            id: "tune-takes-the-note",
            label: "The tune takes a note a visitor brings: si, di or te",
            required: false,
            skills: ["E12a"],
            rule: "degree-set",
            track: "mel",
            anyOf: ["#5", "#1", "b7"],
            minCount: 1,
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
        ],
        // The override serves every rule of the rubric, suggestions included, so it stays neutral; the
        // detail the rule gives for a visitor that does not land says "not home to I", wrong for a V of vi.
        feedbackText: { "rubric.unmet": "{label}: not yet." },
        hints: ladder(
          "Which chords of the turn sit right before A minor, F and D minor?",
          "Em comes before Am, C before F, Am before Dm. To aim one at the chord after it, keep its root and make it a dominant seventh.",
          "Bar 2 can become `E7`, and it lands on Am in bar 3. Then the tune's G in that bar rubs: in `n`, si is `4#`.",
        ),
        tests: [
          {
            name: "the starter as it is",
            response: { code: MAKE_STARTER },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          { name: "minimal: Em becomes E7", response: { code: MAKE_MINIMAL }, expect: "pass" },
          { name: "all three doors, the tune bent with them", response: { code: HOOK }, expect: "pass" },
          {
            name: "beyond the brief: two visitors in half bars, a new tune, the organ",
            response: {
              code: code(
                changes("<C [Em E7] Am [C C7] F A7 Dm G7>"),
                'chords: chord(changes).voicing().struct("x ~ x x ~ x ~ ~").s("organ").gain(.6)',
                BASS,
                mel("<[2 ~ 4 2] [4 ~ 6 4#] [5 ~ 4 2] [0 ~ 6b ~] [5 ~ 3 2] [0# ~ 2 4] [3 ~ 1 3] [1 ~ -1 ~]>"),
              ),
            },
            expect: "pass",
          },
          {
            name: "E7 that does not land on A minor: it goes to F",
            response: { code: loop("<C E7 F C F Am Dm G7>", PLAIN_TUNE) },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
        ],
      },
    },
  ],
});
