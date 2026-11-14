// The gallery's Wave 6 examples (rhythm II, sevenths, modes, chromatic harmony, key changes, the form map): staff
// input with ties, dots and triplets, in 6/8, as a rhythm-only line and over a swing; grids of 6 and 24 steps;
// taps for a push, triplets and 6/8; the five seventh qualities, their names and their keys; numerals with
// sevenths, "V7 of …", borrowed chords, a colour mode and a pivot chord in two keys; the mode pick and the scale
// that starts from a scale; the chromatic degree pad; where a key changes, as a bar timeline; the guide-tone pick;
// compound intervals; and the form map of a 32-bar AABA tune. Musical claims are checked in
// `fixtures-wave6.test.ts` with headless Strudel and @oak/theory.
import type { Degree, KeySpec } from "@oak/api";
import { MODE_OPTIONS } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import type { AnswerKind } from "../types.ts";
import type { Fixture } from "./fixtures.ts";
import { playSection } from "./fixtures-wave5.ts";

const fx = <K extends AnswerKind>(f: Fixture<K>): Fixture => f as unknown as Fixture;

const C_MAJOR: KeySpec = { tonic: "C", mode: "major" };
const G_MAJOR: KeySpec = { tonic: "G", mode: "major" };
const D_MAJOR: KeySpec = { tonic: "D", mode: "major" };
const A_MINOR: KeySpec = { tonic: "A", mode: "minor" };
export const G_MIXOLYDIAN: KeySpec = { tonic: "G", mode: "mixolydian" };

const LENSES_ON = { degrees: true, solfege: true, noteNames: false } as const;

/** U13.L03's figure: a dotted quarter and an eighth, then a note tied over the bar line. */
export const RHYTHM_TIED = "E4:4. F4:8 G4:4 A4:4~ | A4:4 G4:4 E4:2";
export const RHYTHM_UNTIED = "E4:4. F4:8 G4:4 A4:4 | A4:4 G4:4 E4:2";
/** U13.L05: a triplet on beat 1, then quarters. */
export const RHYTHM_TRIPLET = "C5:8t D5:8t E5:8t G5:4 E5:4 C5:4";
export const RHYTHM_NO_TRIPLET = "C5:8 D5:8 G5:4 E5:4 C5:4";
/** U13.L04: two bars of 6/8, the dotted quarter as the beat. */
export const RHYTHM_68 = "E4:4. E4:8 F4:8 G4:8 | A4:4. G4:4.";
export const RHYTHM_68_WRONG = "E4:4 E4:8 E4:8 F4:8 G4:8 | A4:4. G4:4.";
/** Rhythm dictation on one line (`fam.rhy.dictation` level 7): dotted quarter, eighth, a triplet, a quarter. */
export const RHYTHM_LINE = "B4:4. B4:8 B4:8t B4:8t B4:8t B4:4";
export const RHYTHM_LINE_WRONG = "B4:4 B4:4 B4:8t B4:8t B4:8t B4:4";
/** A swung line written straight (U11.L07 on the staff): eighths, printed with "Swing 8ths". */
export const RHYTHM_SWUNG = "C5:8 D5:8 E5:8 G5:8 E5:4 C5:4";

/** A 6/8 groove on a six-step grid, two bars: the beat on 1 and 4, a pickup into bar 2. */
export const GRID_68 = [[true, false, false, true, false, false, true, false, false, true, false, true]];
export const GRID_68_WRONG = [[true, false, true, false, true, false, true, false, false, true, false, true]];
/** One bar of 24 steps: a sixteenth-note triplet roll into beat 2, then the beats. */
export const GRID_24 = [
  Array.from(
    { length: 24 },
    (_, i) => i === 0 || i === 3 || i === 4 || i === 5 || i === 6 || i === 12 || i === 18,
  ),
];
export const GRID_24_WRONG = [Array.from({ length: 24 }, (_, i) => i % 6 === 0)];

/** Taps, in bars from bar 1. A push: 1, the "and" of 2, 4. Triplets on beat 1. 6/8: 1 la li 2. */
export const TAP_PUSH = [0, 0.375, 0.75] as const;
export const TAP_TRIPLETS = [0, 1 / 12, 2 / 12, 0.25, 0.5, 0.75] as const;
export const TAP_68 = [0, 1 / 6, 2 / 6, 0.5] as const;
export const TAP6_BPM = 90;
export const TAP_68_BPM = 60;

const tapTimes = (onsets: readonly number[], barSec: number, offs: readonly number[] = []) =>
  onsets.map((b, i) => 100 + b * barSec + (offs[i] ?? 0));
const BAR_44 = (4 * 60) / TAP6_BPM;
const BAR_68 = (2 * 60) / TAP_68_BPM;

/** The loop of U12.L01 in sevenths, and the numerals a learner writes for it (U12.L04 S4). */
export const SEVENTH_LOOP = ["Imaj7", "vi7", "ii7", "V7"];
/** C, D7, G7, C: the secondary dominant of U15.L02 ("five of five"). */
export const APPLIED_LOOP = ["I", "V7/V", "V7", "I"];
/** U17.CP's eight bars in G: G E7 Am Cm G E♭ F G. */
export const COLOURS_G = ["I", "V7/ii", "ii", "iv", "I", "bVI", "bVII", "I"];
/** U14.L02: I ♭VII IV in G Mixolydian (G F C). */
export const MIXOLYDIAN_LOOP = ["I", "bVII", "IV"];
/** U17.L01: Am named in C major and in G major. */
export const PIVOT = ["vi", "ii"];

/** One octave of each scale from G, for the mode pick's audio cards. */
export const MODE_SCALES: Readonly<Record<string, string>> = {
  major: 'setcpm(100/4)\n\nmel: n("0 1 2 3 4 5 6 7").scale("G4:major").s("piano")',
  mixolydian: 'setcpm(100/4)\n\nmel: n("0 1 2 3 4 5 6 7").scale("G4:mixolydian").s("piano")',
  lydian: 'setcpm(100/4)\n\nmel: n("0 1 2 3 4 5 6 7").scale("G4:lydian").s("piano")',
  minor: 'setcpm(100/4)\n\nmel: n("0 1 2 3 4 5 6 7").scale("G4:minor").s("piano")',
  dorian: 'setcpm(100/4)\n\nmel: n("0 1 2 3 4 5 6 7").scale("G4:dorian").s("piano")',
  phrygian: 'setcpm(100/4)\n\nmel: n("0 1 2 3 4 5 6 7").scale("G4:phrygian").s("piano")',
};

/** U15.L01's pad: the key's degrees around ♯4 (fi) and ♭7 (te). */
export const CHROMATIC_PAD: Degree[] = ["4", "#4", "5", "6", "b7", "7", "1"];

/** The 32-bar AABA tune of the form map: bars 1, 9, 17 and 25 start its sections. */
export const FORM_MAP = ["1:A", "9:A", "17:B", "25:A"];
const AABA = ["A", "A", "B", "A"] as const;

export const WAVE6_FIXTURES: Fixture[] = [
  // --- rhythm II on the staff ---------------------------------------------------------------------------
  fx({
    id: "staff-rhythm",
    kind: "staff-input",
    title: "Staff input: dots and a tie",
    prompt: "Write it as heard: a dotted quarter and an eighth, a quarter, then an A held over the bar line.",
    spec: {
      ui: "staff-input",
      clef: "treble",
      bars: 2,
      palette: { durations: ["2", "4", "4.", "8"], accidentals: false, ties: true, rests: true },
    },
    expected: RHYTHM_TIED,
    sample: RHYTHM_UNTIED,
    wrongMessage: "The A at the end of bar 1 is held into bar 2: one note, tied over the bar line.",
  }),
  fx({
    id: "staff-triplets",
    kind: "staff-input",
    title: "Staff input: a triplet",
    prompt: "Beat 1 is three notes in the time of two: C D E as a triplet, then G E C as quarters.",
    spec: {
      ui: "staff-input",
      clef: "treble",
      bars: 1,
      palette: { durations: ["4", "8", "8t"], accidentals: false, ties: false, rests: true },
    },
    expected: RHYTHM_TRIPLET,
    sample: RHYTHM_NO_TRIPLET,
    wrongMessage: "Beat 1 has three notes, not two: a triplet.",
  }),
  fx({
    id: "staff-68",
    kind: "staff-input",
    title: "Staff input: 6/8",
    prompt: "Two bars of 6/8. The beat is the dotted quarter: one, la li, two …",
    spec: {
      ui: "staff-input",
      clef: "treble",
      bars: 2,
      palette: { durations: ["4.", "4", "8"], accidentals: false, ties: false, rests: true },
    },
    expected: RHYTHM_68,
    sample: RHYTHM_68_WRONG,
    wrongMessage: "The first note fills the whole first beat: a dotted quarter.",
    env: { staff: { meter: METERS["6/8"] } },
  }),
  fx({
    id: "staff-rhythm-line",
    kind: "staff-input",
    title: "Staff input: a rhythm on one line",
    prompt: "Write the rhythm you heard. Every note sits on the middle line: only the lengths matter.",
    spec: {
      ui: "staff-input",
      clef: "treble",
      bars: 1,
      palette: { durations: ["4", "4.", "8", "8t"], accidentals: false, ties: true, rests: true },
    },
    expected: RHYTHM_LINE,
    sample: RHYTHM_LINE_WRONG,
    wrongMessage: "The first note is longer than a beat: a dotted quarter, then an eighth.",
    env: { staff: { rhythmOnly: true } },
  }),
  fx({
    id: "staff-swing",
    kind: "staff-input",
    title: "Staff input: written straight, played swung",
    prompt: "Write the swung line as it stands on paper: plain eighths under “Swing 8ths”.",
    spec: {
      ui: "staff-input",
      clef: "treble",
      bars: 1,
      palette: { durations: ["4", "8"], accidentals: false, ties: false, rests: true },
    },
    expected: RHYTHM_SWUNG,
    sample: "C5:8 D5:8 E5:4 E5:4 C5:4",
    env: { staff: { swing: { subdivision: 8, amount: 1 / 3 } } },
  }),
  // --- grids and taps ------------------------------------------------------------------------------------
  fx({
    id: "grid-68",
    kind: "grid",
    title: "Rhythm grid: 6/8",
    prompt: "Two bars of 6/8, six eighths each. Mark the hits.",
    spec: { ui: "grid", rows: ["hit"], stepsPerBar: 6, bars: 2 },
    expected: GRID_68,
    sample: GRID_68_WRONG,
    wrongMessage: "Bar 1 is felt in two: hits on 1 and on 2, each with two eighths after it.",
    env: { grid: { meter: METERS["6/8"], bpm: 60 } },
  }),
  fx({
    id: "grid-24",
    kind: "grid",
    title: "Rhythm grid: sixteenth-note triplets",
    prompt: "One bar, six steps to a beat. A roll of three leads into beat 2.",
    spec: { ui: "grid", rows: ["hit"], stepsPerBar: 24, bars: 1 },
    expected: GRID_24,
    sample: GRID_24_WRONG,
    env: { grid: { meter: METERS["4/4"], bpm: 72 } },
  }),
  fx({
    id: "tap-push",
    kind: "tap",
    title: "Tap: a push",
    prompt: "Tap the chords: on 1, pushed to the “and” of 2, and on 4.",
    spec: { ui: "tap" },
    expected: tapTimes(TAP_PUSH, BAR_44),
    // Beat 3 tapped on the beat instead of the push before it.
    sample: tapTimes([0, 0.5, 0.75], BAR_44, [0.01, -0.012, 0.02]),
    env: {
      tap: {
        bars: 1,
        bpm: TAP6_BPM,
        stepsPerBeat: 2,
        targets: [...TAP_PUSH],
        startAt: 100,
        targetWord: "hit",
        meter: METERS["4/4"],
      },
    },
  }),
  fx({
    id: "tap-triplets",
    kind: "tap",
    title: "Tap: triplets",
    prompt: "Tap three to the beat on beat 1, then the beats: 1 trip let, 2, 3, 4.",
    spec: { ui: "tap" },
    expected: tapTimes(TAP_TRIPLETS, BAR_44),
    // Two taps on beat 1 instead of three.
    sample: tapTimes([0, 0.125, 0.25, 0.5, 0.75], BAR_44, [0.008, 0, -0.01, 0.015, 0]),
    env: {
      tap: {
        bars: 1,
        bpm: TAP6_BPM,
        stepsPerBeat: 3,
        targets: [...TAP_TRIPLETS],
        startAt: 100,
        targetWord: "hit",
        meter: METERS["4/4"],
      },
    },
  }),
  fx({
    id: "tap-68",
    kind: "tap",
    title: "Tap: 6/8",
    prompt: "One bar of 6/8 at 60 to the dotted quarter: tap 1 la li, then 2.",
    spec: { ui: "tap" },
    expected: tapTimes(TAP_68, BAR_68),
    sample: tapTimes([0, 0.25, 0.5], BAR_68, [0.01, 0, 0.02]),
    env: {
      tap: {
        bars: 1,
        bpm: TAP_68_BPM,
        targets: [...TAP_68],
        startAt: 100,
        targetWord: "hit",
        meter: METERS["6/8"],
      },
    },
  }),
  // --- seventh chords ------------------------------------------------------------------------------------
  fx({
    id: "quality-sevenths",
    kind: "quality-pad",
    title: "Chord quality: the five sevenths",
    prompt: "B D F A: which seventh chord is it?",
    spec: { ui: "quality-pad", set: ["maj7", "7", "m7", "m7b5", "dim7"] },
    expected: ["m7b5"],
    sample: ["m7"],
    wrongMessage: "The 5th is F, not F♯: a half step lower than in Bm7.",
  }),
  fx({
    id: "text-chord-seventh",
    kind: "text",
    title: "Chord name: a seventh chord",
    prompt: "B D F A, with B at the bottom. Name the chord.",
    spec: { ui: "text", normalize: "chord" },
    expected: "Bm7b5",
    sample: "Bm7",
    wrongMessage: "Bm7 has F♯. With F it is half-diminished: Bm7♭5, also written Bø.",
    env: { harmony: { sevenths: true } },
  }),
  fx({
    id: "keyboard-seventh",
    kind: "keyboard",
    title: "Keyboard: build a seventh chord",
    prompt: "Build Fmaj7, F lowest: the F major triad and the white key a half step below the next F.",
    spec: { ui: "keyboard", range: ["C3", "C5"], mode: "chord" },
    expected: [53, 57, 60, 64],
    sample: [53, 57, 60, 63],
    wrongMessage: "The top note is E, the white key just below F: a major 7th above the root.",
    env: { harmony: { key: C_MAJOR, nameChords: "live" }, keyboard: { octave: 3 } },
  }),
  fx({
    id: "guide-tones",
    kind: "keyboard",
    title: "Guide tones: the 3rd and the 7th",
    prompt: "G7 is G B D F. Pick its two guide tones.",
    spec: { ui: "keyboard", range: ["C4", "C6"], mode: "chord" },
    expected: [65, 71],
    sample: [62, 65],
    wrongMessage: "D is the 5th. The guide tones are the 3rd and the 7th.",
    env: { harmony: { guideChord: "G7" } },
  }),
  fx({
    id: "text-interval-compound",
    kind: "text",
    title: "Interval: beyond the octave",
    prompt: "C up to the E above the next C: an octave plus a major 3rd. Name it.",
    spec: { ui: "text", normalize: "interval" },
    expected: "M10",
    sample: "M3",
    wrongMessage: "That is the 3rd inside the octave. Add the octave: a 10th.",
    env: { harmony: { compoundIntervals: true } },
  }),
  // --- numerals ------------------------------------------------------------------------------------------
  fx({
    id: "rn-sevenths",
    kind: "rn-palette",
    title: "Numerals with sevenths",
    prompt: "Cmaj7 Am7 Dm7 G7: write the numerals with their sevenths.",
    spec: { ui: "rn-palette", slots: 4, allow: ["sevenths"] },
    expected: SEVENTH_LOOP,
    sample: ["Imaj7", "vi7", "IVmaj7", "V7"],
    wrongMessage: "Bar 3 is Dm7: the seventh chord on degree 2.",
    env: { harmony: { key: C_MAJOR } },
  }),
  fx({
    id: "rn-applied",
    kind: "rn-palette",
    title: "Numerals: V7 of V",
    prompt: "C D7 G7 C. Bar 2 is not in the key: name it by where it leans.",
    spec: { ui: "rn-palette", slots: 4, allow: ["triads", "sevenths", "secondary"] },
    expected: APPLIED_LOOP,
    sample: ["I", "V7/ii", "V7", "I"],
    wrongMessage: "D7 leans to G, the V of the key: it is V7 of V.",
    env: { harmony: { key: C_MAJOR } },
  }),
  fx({
    id: "rn-colours",
    kind: "rn-palette",
    title: "Numerals: applied and borrowed, eight bars",
    prompt: "G E7 Am Cm | G E♭ F G, in G major. Name every chord.",
    spec: { ui: "rn-palette", slots: 8, allow: ["triads", "sevenths", "secondary", "borrowed"] },
    expected: COLOURS_G,
    sample: ["I", "V7/ii", "ii", "IV", "I", "bVI", "bVII", "I"],
    wrongMessage: "Bar 4 is C minor: the IV with its 3rd lowered, borrowed from G minor.",
    env: { harmony: { key: G_MAJOR } },
  }),
  fx({
    id: "rn-mixolydian",
    kind: "rn-palette",
    title: "Numerals in G Mixolydian",
    prompt: "G F C, in G Mixolydian. Name the three chords.",
    spec: { ui: "rn-palette", slots: 3, allow: ["triads"] },
    expected: MIXOLYDIAN_LOOP,
    sample: ["I", "v", "IV"],
    wrongMessage: "F major sits a whole step under home: ♭VII, the mode's own chord.",
    env: { harmony: { key: G_MIXOLYDIAN } },
  }),
  fx({
    id: "rn-pivot",
    kind: "rn-palette",
    title: "A pivot chord: one chord, two names",
    prompt: "C Am D7 G: the music moves from C major to G major through Am. Name Am in each key.",
    spec: {
      ui: "rn-palette",
      slots: 2,
      allow: ["triads"],
      labels: ["In C major", "In G major"],
      slotKeys: [C_MAJOR, G_MAJOR],
    },
    expected: PIVOT,
    sample: ["vi", "vi"],
    wrongMessage: "In G major, A is degree 2: Am is ii there.",
    env: { harmony: { key: C_MAJOR } },
  }),
  // --- modes and chromatic degrees ------------------------------------------------------------------------
  fx({
    id: "choice-mode",
    kind: "choice",
    title: "Which mode",
    prompt: "A tune on G with F natural in it and a major 3rd. Which scale is it in?",
    spec: {
      ui: "choice",
      layout: "audio-cards",
      options: MODE_OPTIONS.filter((o) => ["major", "mixolydian", "minor", "dorian"].includes(o.id)).map(
        (o) => ({
          ...o,
          audio: MODE_SCALES[o.id] ?? "",
        }),
      ),
    },
    expected: ["mixolydian"],
    sample: ["dorian"],
    env: { facts: true, harmony: { key: G_MAJOR } },
  }),
  fx({
    id: "scale-from",
    kind: "scale-builder",
    title: "Scale builder: one note away from major",
    prompt: "This is G major. Change one note to make G Mixolydian.",
    spec: {
      ui: "scale-builder",
      tonic: "G",
      input: "degrees",
      from: "major",
      palette: ["1", "2", "3", "4", "5", "6", "b7", "7"],
    },
    expected: ["1", "2", "3", "4", "5", "6", "b7"],
    sample: ["1", "2", "3", "4", "5", "6", "7"],
    wrongMessage: "Nothing has moved yet: this is still G major.",
    env: { facts: true, lenses: LENSES_ON },
  }),
  fx({
    id: "scale-from-keys",
    kind: "scale-builder",
    title: "Scale builder: from minor, on the keys",
    prompt: "This is D natural minor. Raise one note to make D Dorian.",
    spec: { ui: "scale-builder", tonic: "D", input: "keyboard", from: "minor" },
    expected: [62, 64, 65, 67, 69, 71, 72],
    sample: [62, 64, 65, 67, 69, 70, 72],
    wrongMessage: "Nothing has moved yet: this is still D natural minor.",
    env: { facts: true },
  }),
  fx({
    id: "degree-chromatic",
    kind: "degree-pad",
    title: "Chromatic degrees, solfège lens on",
    prompt: "In C major, the note leaned up into G. Which degree was it?",
    spec: { ui: "degree-pad", set: CHROMATIC_PAD, syllables: false },
    expected: ["#4"],
    sample: ["b7"],
    wrongMessage: "♭7 leans down to 6. This one leaned up into 5.",
    env: { lenses: LENSES_ON },
  }),
  fx({
    id: "degree-chromatic-seq",
    kind: "degree-pad",
    title: "Chromatic degrees in a line",
    prompt: "Four notes: sol, fi, sol, do. Write their degrees.",
    spec: { ui: "degree-pad", set: CHROMATIC_PAD, sequenceLen: 4, syllables: true },
    expected: ["5", "#4", "5", "1"],
    sample: ["5", "4", "5", "1"],
  }),
  // --- key changes ---------------------------------------------------------------------------------------
  fx({
    id: "key-change-bars",
    kind: "bar-buttons",
    title: "Where the key changes",
    prompt: "Eight bars that start in C major. In which bar does the new key begin?",
    spec: { ui: "bar-buttons", bars: 8 },
    expected: [5],
    sample: [4],
    wrongMessage: "Bar 4 still ends on C's own chords. Listen for the bar where every note sits higher.",
    env: { keyChange: { from: C_MAJOR, to: D_MAJOR } },
  }),
  fx({
    id: "key-change-choice",
    kind: "choice",
    title: "Did it change key?",
    prompt: "Does the key change? If it does, in which bar does the new key begin?",
    spec: {
      ui: "choice",
      options: ["none", "2", "3", "4", "5", "6", "7", "8"].map((id) => ({
        id,
        label: id === "none" ? "No key change" : `Bar ${id}`,
      })),
    },
    expected: ["5"],
    sample: ["none"],
    env: { keyChange: { from: C_MAJOR, to: D_MAJOR } },
  }),
  fx({
    id: "choice-pivot",
    kind: "choice",
    title: "Pick the pivot chord",
    prompt: "C Am D7 G moves from C major to G major. Which chord belongs to both keys?",
    spec: {
      ui: "choice",
      options: ["Am", "D7", "G7"].map((id) => ({ id, label: id })),
    },
    expected: ["Am"],
    sample: ["D7"],
    env: { keyChange: { from: C_MAJOR, to: G_MAJOR } },
  }),
  // --- the form map --------------------------------------------------------------------------------------
  fx({
    id: "form-map",
    kind: "form",
    title: "Form map: cut the tune into sections",
    prompt:
      "A 32-bar tune. Cut the strip where each new section begins, then name the sections with letters.",
    spec: {
      ui: "form",
      sections: 4,
      vocabulary: "letters",
      input: "map",
      bars: 32,
      sectionBars: [8, 8, 8, 8],
    },
    expected: FORM_MAP,
    sample: ["1:A", "17:B", "25:A"],
    wrongMessage: "The first sixteen bars are one eight-bar section played twice.",
    env: { slots: { play: (i) => playSection(AABA[i] ?? "A") } },
  }),
];

export { A_MINOR as W6_A_MINOR, C_MAJOR as W6_C_MAJOR, D_MAJOR as W6_D_MAJOR, G_MAJOR as W6_G_MAJOR };
