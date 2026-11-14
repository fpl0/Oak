// U17.L03 Hearing Key Changes. You hear a key change before you can name it: home has moved. Three questions
// find it. Does the old do still sound like home at the end? In which bar did the first new note arrive? Was
// there a door (a shared chord, then the new key's V) or did the music just lift? The hook is the phrase of
// Pivot Chords bent another way: the same door, Am, then E7, and A minor is home (the relative minor, U10.L02,
// now arrived at instead of started in). What the learner has: the move through a pivot chord (U17.L01), the
// lift with no door and its two sizes (U17.L02), applied dominants found by ear (U15.L06), the minor's major V
// (U10.L06), sections with one `arrange()` per track and the key plan after it (U09.L02, U17.L02). Not yet:
// naming the new key by ear and writing a tune down through the change (U17.L04). Spec: content/specs/U17.md.
//
// How it is graded (AUTHORING §19.7): "where" is the drill `fam.har.modulation` at level 1 (`bar-buttons`: no
// key change, or the bar where the new key begins), seeded here; "how" is three fixed items, each a `choice`
// among no key change, a pivot chord and a direct lift (the ids of `KEY_CHANGE_OPTIONS`). The sung step is
// never graded and never gates; Quiet mode names the note instead. The Make's one required rule is
// `modulation` to the relative minor: the piece's key plan ends in A minor. The starter's bridge only starts on
// Am and stays in C, and fails.
import {
  type Choice,
  defineLesson,
  type HintLadder,
  type IdentifyEx,
  type KeySpec,
  type SingEx,
} from "@oak/content-kit";

const BPM = 92;
const TEMPO = `setcpm(${BPM}/4)\n\n`;
const code = (...lines: string[]) => `${TEMPO}${lines.join("\n")}`;

const ladder = (nudge: string, pointer: string, partial: string): HintLadder => [
  { text: nudge },
  { text: pointer },
  { text: partial },
  "auto",
];

const C_MAJOR: KeySpec = { tonic: "C", mode: "major" };
const G_MAJOR: KeySpec = { tonic: "G", mode: "major" };

/** One string drives the chords and the bass (U08.L04): change the chords once and the bass follows. */
const changes = (form: string) => `const changes = "${form}"\n`;
const CHORDS = 'chords: chord(changes).voicing().s("rhodes")';
/** The root of every chord, low on the upright: the voicing above does not always put it lowest. */
const BASS = 'bass: chord(changes).rootNotes(2).s("upright")';
const mel = (pattern: string, scale: string) => `mel: n("${pattern}").scale("${scale}").s("piano")`;
const loop = (form: string, ...lines: string[]) => code(changes(form), CHORDS, BASS, ...lines);

/**
 * The hook: C Am F G, C Am, then E7 and Am. The tune: G E G | E C | A F A | G | G E G | E C, then the end of
 * a phrase read in A harmonic minor, 5 7 5 | 1' (E G♯ E | A). One new note, G♯ in bar 7, and A is home.
 */
const HOOK = loop(
  "<C Am F G C Am E7 Am>",
  mel(
    "<[4 ~ 2 4] [2 ~ 0 ~] [5 ~ 3 5] [4 ~ ~ ~] [4 ~ 2 4] [2 ~ 0 ~] [4 ~ 6 4] [7 ~ ~ ~]>",
    "<C4:major!6 A3:harmonic:minor!2>",
  ),
);

/** S1: the chorus of Truck-Driver, lifted from C to D at bar 5 with no door. */
const LIFT = code(
  'chords: chord("<C G Am F D A Bm G>").voicing().struct("x*4").s("piano")',
  'bass: n("<0 4 5 3>").struct("x ~ x x").scale("<C2:major!4 D2:major!4>").s("ebass").lpf(700)',
  mel("<[4 ~ 4 5] [4 ~ 1 ~] [5 ~ 5 7] [7 ~ 5 ~]>", "<C4:major!4 D4:major!4>"),
);

/**
 * The verse of Pivot Chords (S2, S3, S5): E G E | C | F A F | G | E G E | C E, then either home in C (F A F |
 * G, C over G C) or the move to G (D F♯ D | G, read in G: `G3:major` keeps the tune where it was).
 */
const VERSE_FOUR = "[2 ~ 4 2] [0 ~ ~ ~] [3 ~ 5 3] [4 ~ ~ ~]";
const FIRST_SIX = `${VERSE_FOUR} [2 ~ 4 2] [0 ~ 2 ~]`;
const PIVOT_TO_G = loop(
  "<C Am F G C Am D7 G>",
  mel(`<${FIRST_SIX} [4 ~ 6 4] [7 ~ ~ ~]>`, "<C4:major!6 G3:major!2>"),
);
const HOME_IN_C = loop("<C Am F G C Am F [G C]>", mel(`<${FIRST_SIX} [3 ~ 5 3] [4 ~ 7 ~]>`, "C4:major"));
const FOUR_BARS = loop("<C Am F G>", mel(`<${VERSE_FOUR}>`, "C4:major"));

/** S5: a visit, not a move. D7 leads to G for a bar (fi in the tune), and the phrase comes home to C. */
const VISIT = loop(
  "<C Am D7 G C F G C>",
  mel("<[2 ~ 4 2] [0 ~ ~ ~] [3# ~ 5 3#] [4 ~ ~ ~] [2 ~ 4 2] [3 ~ 5 3] [4 ~ 1 ~] [0 ~ ~ ~]>", "C4:major"),
);
/** S5: the narrow lift. Four bars in C, the same four a half step higher, in D♭. */
const HALF_LIFT = loop("<C Am F G Db Bbm Gb Ab>", mel(`<${VERSE_FOUR}>`, "<C4:major!4 Db4:major!4>"));

/** "How did it get there?": the three answers, with the ids of `KEY_CHANGE_OPTIONS`. */
const HOW: Choice[] = [
  { id: "none", label: "No key change" },
  { id: "pivot", label: "Through a pivot chord" },
  { id: "direct", label: "Direct: it lifts with no door" },
];

const howHints = (): HintLadder => [
  { text: "At the very end, is the first chord of the piece still home?" },
  {
    text: "If home has moved, listen to the bar before the first new note. A chord that fits both keys there is a door; no such bar means a lift.",
  },
  {
    text: "Hear it again, slower. Sing the first note of the piece over the last bar, then find where the music turned.",
    replay: { rate: 0.75 },
  },
  "auto",
];
const howPart = (
  id: string,
  prompt: string,
  stimulus: string,
  answer: string,
  wrong: string,
): IdentifyEx => ({
  kind: "identify",
  id,
  version: 1,
  role: "check",
  prompt,
  skills: [
    { skill: "E13", w: 0.7 },
    { skill: "H14", w: 0.3 },
  ],
  hints: howHints(),
  stimulus: { src: "code", code: stimulus, bars: 8, showCode: false },
  cue: { context: "none", countInBars: 1, click: false, replays: -1 },
  answer: { ui: "choice", options: HOW },
  correct: { choice: [answer] },
  // The catalog's `id.wrong` names the option ids ("That was pivot, not none").
  feedbackText: { "id.wrong": wrong },
  tests: [
    { name: answer, response: { answer: { choice: [answer] } }, expect: "pass" },
    ...HOW.filter((o) => o.id !== answer).map((o) => ({
      name: o.id,
      response: { answer: { choice: [o.id] } },
      expect: "fail" as const,
      feedback: ["id.wrong" as const],
    })),
  ],
});

/** S3: do, sung before the phrase in C and after it in G. Numbers stay on screen; nothing is graded. */
const TOL = {
  cents: "learner",
  octave: "global",
  driftCompCents: 30,
  minCoverage: 0.4,
  passHitRate: 0.8,
} as const;
const singDo = (
  id: string,
  prompt: string,
  key: KeySpec,
  stimulus: string,
  bars: number,
  hints: HintLadder,
): SingEx => ({
  kind: "sing",
  id,
  version: 1,
  role: "practice",
  prompt,
  skills: [
    { skill: "E13", w: 0.6 },
    { skill: "V03", w: 0.4 },
  ],
  hints,
  key,
  // Quiet mode or no microphone: name the note instead (contracts §8.5); singing never gates.
  fallback: "identify",
  mode: "degree",
  stimulus: { src: "code", code: stimulus, bars, showCode: false },
  cue: { context: "tonic-chord", countInBars: 1, click: false, replays: -1 },
  target: { from: "degrees", degrees: ["1"], rhythm: "x _ _ _" },
  labels: "syllables",
  tol: TOL,
  showTrace: "live",
  tests: [],
});

/**
 * The Make: a verse in C and a four-bar bridge that starts on Am and never leaves C (Am Dm G C, the tune in C:
 * G E G | A F A | G B G | C). Moved to A minor (Am Dm E7 Am, the key plan after `arrange()`), the same numbers
 * become E C E | F D F | E G♯ E | A.
 */
interface SongParts {
  bridge?: string;
  plan?: string;
  melBridge?: string;
  verse?: string;
  sections?: string;
}
const song = (o: SongParts = {}) => {
  const bridge = o.bridge ?? "<Am Dm G C>";
  const verse = o.verse ?? "<C Am F G>";
  const sections = o.sections ?? "[4, {r}Verse], [4, {r}Bridge]";
  const arranged = (role: string) => `arrange(${sections.replaceAll("{r}", role)})`;
  return code(
    `const chordsVerse = chord("${verse}").voicing()`,
    `const chordsBridge = chord("${bridge}").voicing()`,
    `const bassVerse = chord("${verse}").rootNotes(2)`,
    `const bassBridge = chord("${bridge}").rootNotes(2)`,
    'const melVerse = n("<[4 ~ 2 4] [2 ~ 0 ~] [5 ~ 3 5] [4 ~ ~ ~]>")',
    `const melBridge = n("${o.melBridge ?? "<[4 ~ 2 4] [5 ~ 3 5] [4 ~ 6 4] [7 ~ ~ ~]>"}")`,
    "",
    `chords: ${arranged("chords")}.s("rhodes")`,
    `bass: ${arranged("bass")}.s("upright")`,
    `mel: ${arranged("mel")}.scale("${o.plan ?? "C4:major"}").s("piano")`,
  );
};
const MAKE_STARTER = song();
const MAKE_MINIMAL = song({ bridge: "<Am Dm E7 Am>", plan: "<C4:major!4 A3:harmonic:minor!4>" });

/** Drums from the Band; chords, bass and tune are the learner's, so the rules read them (AUTHORING §8 rule 5). */
const DRUMS = { band: "band.axis-4bar", tracks: ["drums"] } as const;
const NONE = { roll: false, staff: false, keyboard: false } as const;
const ROLL = { roll: true, staff: false, keyboard: false } as const;

export default defineLesson({
  id: "U17.L03",
  version: 1,
  title: "Hearing Key Changes",
  objective:
    "I can hear whether a song has changed key, find the bar where the new key begins, and tell a move through a pivot chord from a lift.",
  key: C_MAJOR,
  meter: "4/4",
  bpm: BPM,
  introduces: ["E13"],
  practises: [],
  terms: [],
  canDo: ["cd.hear.key-change"],
  // Pop and indie take piano and electric bass for the Rhodes and the upright; the notes never change.
  flavours: {
    "flavour.pop": { sounds: { "snd.rhodes": "snd.piano", "snd.upright": "snd.ebass" } },
    "flavour.indie": { sounds: { "snd.rhodes": "snd.piano", "snd.upright": "snd.ebass" } },
  },
  wrapAt: "S4",
  steps: [
    {
      id: "S1",
      kind: "listen",
      title: "Where is home now",
      minutes: 1,
      ui: { panels: ROLL, rollLabels: "note", band: DRUMS },
      example: { id: "hook", code: HOOK, bars: 8 },
      exercise: {
        kind: "listen",
        id: "where-is-home-now",
        version: 1,
        role: "practice",
        prompt:
          "Two pieces, eight bars each. Hum the very first note of each, and keep it in your ear. When the piece ends, hum it again: does it still sound like home?",
        skills: [{ skill: "E13", w: 1 }],
        hints: null,
        tests: [],
        items: [
          {
            code: LIFT,
            caption:
              "The chorus of Truck-Driver: at bar 5 everything starts again a whole step higher, in D.",
            bars: 8,
          },
          {
            code: HOOK,
            caption: "C, Am, then E7 in bar 7 brings G♯, and A minor is home. The first C no longer is.",
            bars: 8,
          },
        ],
      },
    },
    {
      id: "S2",
      kind: "compare",
      title: "Home or away",
      minutes: 0.75,
      ui: { panels: NONE },
      exercise: {
        kind: "identify",
        id: "home-or-away",
        version: 1,
        role: "practice",
        prompt:
          "Two cards, the same first four bars, from Pivot Chords. One verse comes back home to C at the end; the other has moved. Which card ends in a new home?",
        skills: [{ skill: "E13", w: 1 }],
        hints: ladder(
          "After each card, sing the first chord's root, C. Does it settle the music or pull against it?",
          "The card that moved ends on a chord that is not C, and C sounds like a stranger after it.",
          "Listen to bar 7 of each card: one brings in F♯, the other stays on the key's own chords.",
        ),
        stimulus: { src: "code", code: FOUR_BARS, bars: 4, showCode: false },
        cue: { context: "none", countInBars: 0, click: false, replays: -1 },
        answer: {
          ui: "choice",
          layout: "audio-cards",
          options: [
            { id: "first", label: "Card 1", audio: PIVOT_TO_G },
            { id: "second", label: "Card 2", audio: HOME_IN_C },
          ],
        },
        correct: { choice: ["first"] },
        // The catalog's `id.wrong` names the option ids ("That was second, not first").
        feedbackText: {
          "id.wrong":
            "Card 2 comes home: its last bar is G, then C, and C still sounds like the end. Card 1 brings in D7 and stops on G, which is now home. Play both again.",
        },
        tests: [
          { name: "card 1", response: { answer: { choice: ["first"] } }, expect: "pass" },
          {
            name: "card 2: the one that comes home",
            response: { answer: { choice: ["second"] } },
            expect: "fail",
            feedback: ["id.wrong"],
          },
        ],
      },
    },
    {
      id: "S3",
      kind: "sing",
      title: "Sing home, twice",
      minutes: 1,
      ui: { panels: NONE },
      exercise: {
        kind: "all",
        id: "sing-home-twice",
        version: 1,
        role: "practice",
        prompt:
          "Two short tasks, one note each. First sing do before the verse sets out from C. Then hear the whole verse and sing do again where it ends: home has moved, so do has too. The numbers stay on screen. Sing in your own range.",
        skills: [
          { skill: "E13", w: 0.6 },
          { skill: "V03", w: 0.4 },
        ],
        hints: [
          { text: "Do is the note the music would end on if it stopped right now." },
          {
            text: "The first do is C. The second is the root of the last chord you hear, a 5th above the first.",
          },
          { text: "Hear it again, slower, and hum along before you sing.", replay: { rate: 0.75 } },
          "auto",
        ],
        fallback: "identify",
        tests: [],
        parts: [
          singDo(
            "do-in-c",
            "The verse's opening in C. Then sing do, held, in your own range. In numbers: 1.",
            C_MAJOR,
            FOUR_BARS,
            4,
            [
              { text: "Hum the first note of the bass and keep it: that is do." },
              { text: "Do is C here, the root of the first chord." },
              { text: "Hear it again, slower, and hum along before you sing.", replay: { rate: 0.75 } },
              "auto",
            ],
          ),
          singDo(
            "do-in-g",
            "The whole verse, through its door into G. Then sing the new do, held: G is home now, so it is 1.",
            G_MAJOR,
            PIVOT_TO_G,
            8,
            [
              { text: "Hum the last note of the bass and keep it: that is the new do." },
              { text: "The new do is G, a 5th above the old one." },
              { text: "Hear it again, slower, and hum along before you sing.", replay: { rate: 0.75 } },
              "auto",
            ],
          ),
        ],
      },
    },
    {
      id: "S4",
      kind: "ear",
      title: "Did it change key",
      minutes: 1.5,
      graded: true,
      ui: { panels: NONE },
      exercise: {
        kind: "identify",
        id: "did-it-change-key",
        version: 1,
        role: "check",
        prompt:
          "Pieces of eight bars, heard one at a time: chords over a bass, each in a key of its own. Some lift by a half or a whole step; some stay home. If the key changes, mark the bar where the new key begins.",
        skills: [{ skill: "E13", w: 1 }],
        hints: [
          { text: "Hum the first bass note. At the end, is it still home?" },
          {
            text: "If home has moved, the new key begins at the first bar that sounds higher than the phrase before it.",
          },
          {
            text: "Hear it again, slower, and hum the bass bar by bar: the lift is the bar where your hum has to jump.",
            replay: { rate: 0.75 },
          },
          "auto",
        ],
        // Level 1: a direct lift by a half or a whole step after three to five bars, or no key change.
        stimulus: { src: "generator", family: "fam.har.modulation", level: 1 },
        cue: { context: "none", countInBars: 1, click: false, replays: -1 },
        answer: { ui: "bar-buttons", bars: 8 },
        correct: {},
        srs: [{ family: "fam.har.modulation", mode: "seed" }],
        tests: [],
      },
    },
    {
      id: "S5",
      kind: "quiz",
      title: "How did it get there",
      minutes: 1.5,
      graded: true,
      ui: { panels: NONE },
      exercise: {
        kind: "all",
        id: "how-did-it-get-there",
        version: 1,
        role: "check",
        prompt:
          "Three pieces, eight bars each, heard one at a time. For each: did the key change and, if it did, through a pivot chord or with no door at all?",
        skills: [
          { skill: "E13", w: 0.7 },
          { skill: "H14", w: 0.3 },
        ],
        hints: howHints(),
        tests: [],
        srs: [{ family: "fam.har.chromatic", mode: "review-if-due" }],
        parts: [
          howPart(
            "how-1",
            "Piece 1.",
            VISIT,
            "none",
            "Piece 1 has a chord from outside the key, D7 in bar 3, but it is a visit: the next bar is G and the phrase comes straight back to C, which is still home at the end. A move stays.",
          ),
          howPart(
            "how-2",
            "Piece 2.",
            HOOK,
            "pivot",
            "Piece 2 moves to A minor, and it uses a door: bar 6 is Am, which C major owns as well, then E7 brings G♯ and the music stays in A minor. A lift would have no chord between the two keys.",
          ),
          howPart(
            "how-3",
            "Piece 3.",
            HALF_LIFT,
            "direct",
            "Piece 3 changes key with nothing to prepare it: at bar 5 the same four bars start again a half step higher. No chord sits between the two keys, so it is direct.",
          ),
        ],
      },
    },
    {
      id: "S6",
      kind: "make",
      title: "A bridge somewhere else",
      minutes: 2.75,
      ui: { panels: ROLL, rollLabels: "note", band: DRUMS, initialPanels: ["chords", "form"] },
      exercise: {
        kind: "code-make",
        id: "a-bridge-somewhere-else",
        version: 1,
        role: "practice",
        key: C_MAJOR,
        prompt:
          "A verse in C and a bridge that starts on Am but never leaves C. Move the bridge to A minor: bring in A minor's own V, E7, before an Am, and give the tune a key plan after `arrange()` so its bridge numbers mean A harmonic minor. The loop takes you back to C.",
        skills: [{ skill: "H14", w: 1 }],
        code: { starter: MAKE_STARTER },
        bars: [8, 16],
        saveAs: "sketch",
        rubric: [
          {
            id: "bridge-in-a-minor",
            label: "The bridge moves to A minor, the relative minor",
            required: true,
            // Writing the move practises H14; hearing your own bridge arrive somewhere else is this lesson's E13.
            skills: ["E13", "H14"],
            rule: "modulation",
            to: "relative",
          },
          {
            // Read in the key in force: in the starter's bridge G→C is a V going home, so a numeral rule would be
            // met before the learner starts. A dominant seventh in the bridge is not.
            id: "a-v7-in-the-bridge",
            label: "A dominant seventh in the bridge, like A minor's own E7",
            required: false,
            skills: ["H14"],
            rule: "chord-qualities",
            track: "chords",
            contains: ["7"],
            depth: "seventh",
            section: { section: "bridge" },
          },
          {
            id: "a-different-place",
            label: "The bridge differs from the verse in two ways",
            required: false,
            skills: ["F03"],
            rule: "contrast",
            a: { section: "verse" },
            b: { section: "bridge" },
            axes: ["pitch", "harmony", "register", "density", "energy"],
            minAxes: 2,
          },
        ],
        // The override serves every rule of the rubric, suggestions included, so it stays neutral.
        feedbackText: { "rubric.unmet": "{label}: not yet." },
        hints: ladder(
          "Which chord of A minor pulls hardest into Am, the way G7 pulls into C?",
          "A minor's V is built a 5th above A, and in harmonic minor it is major, with G♯. Put it in `chordsBridge` and `bassBridge` before an Am. The tune's `.scale()` needs a key plan: four bars of C major, then four of A minor.",
          'The bridge chords can go Am, Dm, E7, Am. For the tune, start `.scale("<C4:major!4` and finish it with A harmonic minor in the octave below.',
        ),
        tests: [
          {
            name: "the starter as it is",
            response: { code: MAKE_STARTER },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "minimal: E7 in the bridge and a key plan",
            response: { code: MAKE_MINIMAL },
            expect: "pass",
          },
          {
            name: "beyond the brief: verse twice, a new bridge tune in natural minor over E, strings",
            response: {
              code: song({
                sections: "[4, {r}Verse], [4, {r}Verse], [4, {r}Bridge]",
                bridge: "<Am F E Am>",
                melBridge: "<[2 ~ 0 2] [2 ~ 0 ~] [4 ~ 1 4] [0 ~ ~ ~]>",
                plan: "<C4:major!8 A3:minor!4>",
              }).replace('.s("rhodes")', '.s("strings").gain(.6)'),
            },
            expect: "pass",
          },
          {
            name: "E7 in the bridge, the tune left in C",
            response: { code: song({ bridge: "<Am Dm E7 Am>" }) },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
          {
            name: "a lift to D instead",
            response: {
              code: song({
                bridge: "<D Bm G A>",
                plan: "<C4:major!4 D4:major!4>",
                melBridge: "<[4 ~ 2 4] [0 ~ ~ ~] [3 ~ 5 3] [4 ~ ~ ~]>",
              }),
            },
            expect: "fail",
            feedback: ["rubric.unmet"],
          },
        ],
      },
    },
  ],
});
