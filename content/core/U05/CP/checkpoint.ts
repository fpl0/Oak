// U05.CP Triads checkpoint (contracts §7.6; AUTHORING §10). The generated items come from the chord-spelling
// family (C02, C03), the inversion family (C04, perceptual, so it only sets C04's level) and the triad-quality
// ear family (E08, level-setting). These authored items cover what no family asks: writing four triads of
// four qualities on the staff, letter by letter (C02, C03); voicing a loop by hand so the notes glide instead
// of jumping (C01, C04, C05, which no family measures); and naming a chord read off the grand staff, its
// lowest note included (N04, N05). The reading family reads the bass clef from level 3 but gives evidence
// only for N02, N03 and N07, so N04 is measured here by the authored page item alone. Then the
// checkpoint Make: a chord loop of the learner's own over the Band's drums, voiced by hand.
// Spec: content/specs/U05.md, "U05.CP Triads checkpoint".
//
// Checked after U06.L01 (the checkpoint's place in the default order), but every word stays inside U05: in
// another legal order the checkpoint comes before U06.L01, so no "diatonic", no numerals, no "cadence".
// `chord()` and `.voicing()` are open from U05.L08; the authored items stay with chords built by hand,
// because the unit is about building them. The Make allows either.
//
// Deviations from the spec, each for a musical reason:
// - build-the-qualities is a staff item in `pitches` mode (the notes of each triad, lowest first, letter by
//   letter), not `staff-expect.chords`: chords on the staff are not implemented yet (contracts §5.1). The
//   letters are what C02 and C03 test, and `pitches` grades them strictly.
// - The motion limit is three half steps, as in the voicing gate (U05.L07), not two. Two cannot voice F to
//   G (they share no note, so one voice moves a minor 3rd, or all three climb together), and a loop that
//   climbs every time round is not the smallest motion.
import { type CheckpointDef, defineCheckpoint, type Matcher } from "@oak/content-kit";

const BPM = 80;
const TEMPO = `setcpm(${BPM}/4)\n\n`;
const code = (...lines: string[]) => `${TEMPO}${lines.join("\n")}`;
/** A hand-voiced chord line: note lists, one chord a bar. */
const chords = (pattern: string, sound = "piano", extra = "") =>
  `chords: note("${pattern}").s("${sound}")${extra}`;
/** The root bass: one note a bar. */
const bass = (pattern: string, sound = "ebass") => `bass: note("${pattern}").s("${sound}").lpf(800)`;

// --- voice-the-loop -----------------------------------------------------------------------------------

/** C Am F G, one a bar, roots C2 A1 F2 G2. */
const LOOP_ROOTS = "<c2 a1 f2 g2>";
/** Every chord in root position: each change moves all three notes, the last two by a 4th or more. */
const JUMPS = "<[c4,e4,g4] [a3,c4,e4] [f3,a3,c4] [g3,b3,d4]>";
/**
 * Voice-led: C and Am share C and E, so only G moves (up to A); Am and F share A and C, so only E moves (up
 * to F); F and G share nothing, so C steps down to B, A to G, and F skips down to D (three half steps). From
 * G back to C, B and D step up and G stays: the loop closes where it started.
 */
const GLIDE = "<[c4,e4,g4] [c4,e4,a4] [c4,f4,a4] [b3,d4,g4]>";
/** The same idea from the 5th of C on top: E G C, E A C, F A C, D G B. */
const GLIDE_HIGH = "<[e4,g4,c5] [e4,a4,c5] [f4,a4,c5] [d4,g4,b4]>";
const LOOP = (pattern: string, sound = "piano", extra = "") =>
  code(bass(LOOP_ROOTS), chords(pattern, sound, extra));
const LOOP_STARTER = `${TEMPO}${bass(LOOP_ROOTS)}\n${chords(`⟪${JUMPS}⟫`)}`;
const VOICE_MATCHER: Matcher = {
  m: "all",
  of: [
    { m: "pcset", perOnset: true, bass: false, tracks: ["chords"] },
    {
      m: "rubric",
      rules: [
        {
          id: "glide",
          label: "No note moves more than three half steps at a change",
          required: true,
          skills: ["C05"],
          rule: "voice-leading",
          track: "chords",
          maxMovePerVoice: 3,
        },
      ],
    },
  ],
};

// --- name-from-the-page -------------------------------------------------------------------------------

/** F major over A: A2 alone on the bass staff, C4 F4 A4 above it on the treble staff. */
const F_OVER_A = code(bass("a2", "upright"), chords("[c4,f4,a4]"));

// --- the Make -----------------------------------------------------------------------------------------

/** Am F C G, roots A1 F2 C2 G2. */
const MAKE_ROOTS = "<a1 f2 c2 g2>";
/** The starter: every chord in root position, so every change jumps. */
const MAKE_JUMPS = "<[a3,c4,e4] [f3,a3,c4] [c4,e4,g4] [g3,b3,d4]>";
/** Voice-led: E steps to F, then F to E and A to G, then C to B and E to D; back to Am, every voice by a step. */
const MAKE_GLIDE = "<[a3,c4,e4] [a3,c4,f4] [g3,c4,e4] [g3,b3,d4]>";
const MAKE = (pattern: string, ...more: string[]) => code(bass(MAKE_ROOTS), chords(pattern), ...more);

export const checkpoint: CheckpointDef = defineCheckpoint({
  id: "U05.CP",
  title: "Triads checkpoint",
  covers: ["U05"],
  gated: ["C01", "C02", "C03", "C04", "C05", "N04", "N05"],
  levelSetting: ["E08"],
  version: 1,
  authored: [
    {
      kind: "staff-write",
      id: "build-the-qualities",
      version: 1,
      role: "checkpoint",
      prompt:
        "Write four triads on the staff, one a bar, each as its three notes from the root up: D minor, E diminished (E°), F major, C augmented (C+). Spell every note with its own letter.",
      skills: [
        { skill: "C02", w: 0.5 },
        { skill: "C03", w: 0.5 },
      ],
      hints: null,
      answer: {
        ui: "staff-input",
        clef: "treble",
        bars: 4,
        palette: { durations: ["4", "2"], accidentals: true, ties: false, rests: false },
      },
      expect: {
        e: "pitches",
        spelled: ["D4", "F4", "A4", "E4", "G4", "Bb4", "F4", "A4", "C5", "C4", "E4", "G#4"],
        order: "sequence",
        withOctave: false,
      },
      feedbackText: {
        "staff.accidental":
          "{at}: {got} should be {exp}, on the same line or space. Count the half steps of each 3rd from the root: a minor 3rd has three, a major 3rd four.",
        "staff.enharmonic":
          "{at}: {got} is the right key with the wrong letter; write {exp}. A triad skips one letter each time, so C+ is C, E and a kind of G.",
      },
      tests: [
        {
          name: "Dm, E°, F, C+",
          response: { staff: "D4:4 F4:4 A4:2 E4:4 G4:4 Bb4:2 F4:4 A4:4 C5:2 C4:4 E4:4 G#4:2" },
          expect: "pass",
        },
        {
          name: "in another octave, all quarter notes",
          response: { staff: "D5:4 F5:4 A5:4 E4:4 G4:4 Bb4:4 F4:4 A4:4 C5:4 C5:4 E5:4 G#5:4" },
          expect: "pass",
        },
        {
          name: "E° written as E minor: B natural",
          response: { staff: "D4:4 F4:4 A4:2 E4:4 G4:4 B4:2 F4:4 A4:4 C5:2 C4:4 E4:4 G#4:2" },
          expect: "fail",
          feedback: ["staff.accidental"],
        },
        {
          name: "C+ spelled with A♭",
          response: { staff: "D4:4 F4:4 A4:2 E4:4 G4:4 Bb4:2 F4:4 A4:4 C5:2 C4:4 E4:4 Ab4:2" },
          expect: "fail",
          feedback: ["staff.enharmonic"],
        },
        {
          name: "D major instead of D minor",
          response: { staff: "D4:4 F#4:4 A4:2 E4:4 G4:4 Bb4:2 F4:4 A4:4 C5:2 C4:4 E4:4 G#4:2" },
          expect: "fail",
          feedback: ["staff.accidental"],
        },
      ],
    },
    {
      kind: "code-modify",
      id: "voice-the-loop",
      version: 1,
      role: "checkpoint",
      prompt:
        "C, Am, F and G over a bass on their roots, every chord in root position, so the notes jump. Voice the chords again with the same letters, so that at every change no note moves more than three half steps. Inversions are welcome.",
      skills: [
        { skill: "C01", w: 0.3 },
        { skill: "C04", w: 0.2 },
        { skill: "C05", w: 0.5 },
      ],
      hints: null,
      code: { starter: LOOP_STARTER },
      reference: { solutions: [LOOP(GLIDE)], bars: 4 },
      matcher: VOICE_MATCHER,
      constraints: [{ c: "edit-only-regions", feedback: "code.edit-outside" }],
      feedbackText: {
        "harmony.pcset":
          "Bar {bar}: your chord has {got}; it should have {exp}. Keep each chord's three letters and change only where they sit.",
        "rubric.unmet":
          "The right chords, but at one change a note still moves more than three half steps ({detail}). Keep the notes two chords share where they are.",
      },
      target: { audible: true, showRoll: false },
      tests: [
        { name: "reference", response: { code: LOOP(GLIDE) }, expect: "pass" },
        {
          name: "the same idea from E G C",
          response: { code: LOOP(GLIDE_HIGH) },
          expect: "pass",
        },
        {
          name: "unchanged",
          response: { code: LOOP(JUMPS) },
          expect: "fail",
          feedback: ["code.unchanged"],
        },
        {
          name: "Am and F smooth, G still in root position under F",
          response: { code: LOOP("<[c4,e4,g4] [c4,e4,a4] [c4,f4,a4] [g4,b4,d5]>") },
          expect: "fail",
          feedback: ["rubric.unmet"],
        },
        {
          name: "A minor played as A major (C♯)",
          response: { code: LOOP("<[c4,e4,g4] [c#4,e4,a4] [c4,f4,a4] [b3,d4,g4]>") },
          expect: "fail",
          feedback: ["harmony.pcset"],
        },
      ],
    },
    {
      kind: "fact",
      id: "name-from-the-page",
      version: 1,
      role: "checkpoint",
      prompt:
        "A chord on the grand staff: one note on the bass staff, three on the treble staff. Write its chord symbol, with its lowest note after a slash if that is not the root.",
      skills: [
        { skill: "N04", w: 0.4 },
        { skill: "N05", w: 0.6 },
      ],
      hints: null,
      stimulus: { src: "code", code: F_OVER_A, bars: 1, showCode: false, showStaff: true },
      answer: { ui: "text", normalize: "chord" },
      correct: { text: ["F/A"] },
      // The catalog line says "Listen to both", but this item is read off the page.
      feedbackText: {
        "id.wrong":
          "Not {got}. Name the chord from its letters stacked in 3rds (F A C), then read the bass staff: its note is the lowest of all.",
      },
      spelling: "strict",
      order: "set",
      tests: [
        { name: "F/A", response: { answer: { text: ["F/A"] } }, expect: "pass" },
        { name: "the root position name: F", response: { answer: { text: ["F"] } }, expect: "fail" },
        {
          name: "the bass read on the treble staff's lines: F/C",
          response: { answer: { text: ["F/C"] } },
          expect: "fail",
        },
        { name: "named from the bass up: Am", response: { answer: { text: ["Am"] } }, expect: "fail" },
      ],
    },
  ],
  recipe: {
    items: [12, 16],
    perSkillMin: 2,
    families: {
      C02: ["fam.chd.spell"],
      C03: ["fam.chd.spell"],
      C04: ["fam.chd.inversion"],
      E08: ["fam.chd.quality-triad"],
    },
  },
  make: {
    kind: "code-make",
    id: "checkpoint-glide",
    version: 1,
    role: "checkpoint",
    title: "Chords that glide",
    prompt:
      "A four-chord loop over the drums, voiced by hand: at every change keep the notes two chords share and move the rest as little as you can. Start from these four, or choose your own.",
    skills: [{ skill: "C05", w: 1 }],
    hints: null,
    key: { tonic: "C", mode: "major" },
    bpm: BPM,
    code: { starter: MAKE(MAKE_JUMPS) },
    bars: [4, 8],
    saveAs: "sketch",
    // The detail of `voice-leading` speaks in semitones; the learner's word is half steps.
    feedbackText: { "rubric.unmet": "{label}: not yet." },
    rubric: [
      {
        id: "glide",
        label: "No note moves more than three half steps at a change",
        required: true,
        skills: ["C05"],
        rule: "voice-leading",
        track: "chords",
        maxMovePerVoice: 3,
      },
      {
        id: "an-inversion",
        label: "At least one chord in inversion over the bass",
        required: false,
        skills: ["C04"],
        rule: "chord-inversions",
        min: 1,
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
    tests: [
      {
        name: "the starter: every chord in root position",
        response: { code: MAKE(MAKE_JUMPS) },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
      { name: "minimal: the same four, voice-led", response: { code: MAKE(MAKE_GLIDE) }, expect: "pass" },
      {
        name: "beyond the brief: C/E in the bass, the chords twice a bar on the Rhodes, and a tune",
        response: {
          code: code(
            bass("<a1 f2 e2 g2>"),
            chords("<[a3,c4,e4]*2 [a3,c4,f4]*2 [g3,c4,e4]*2 [g3,b3,d4]*2>", "rhodes", ".gain(.7)"),
            'mel: n("<[4 ~ 2 ~] [5 ~ 3 2] [2 ~ 0 ~] [1 ~ ~ ~]>").scale("C5:major").s("piano")',
          ),
        },
        expect: "pass",
      },
      {
        name: "voice-led until the last chord, which jumps to G B D up high",
        response: { code: MAKE("<[a3,c4,e4] [a3,c4,f4] [g3,c4,e4] [g4,b4,d5]>") },
        expect: "fail",
        feedback: ["rubric.unmet"],
      },
    ],
  },
});
export default checkpoint;
