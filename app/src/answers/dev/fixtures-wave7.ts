// The gallery's Wave 7 examples (the advanced tracks): a jazz chord symbol; the voicing builder on the keyboard
// (a shell, a rootless voicing) and on the grand staff (drop-2); the tension pick; numerals with the jazz row and
// ii–V brackets; an odd-meter grouping in 7/8 and 5/4; Euclidean numbers with and without a rotation; the clave
// pick; two-lane taps (3 against 2) and a one-lane take in 7/8; the sliders that play (swing, lay-back, a cutoff
// to match by ear); the A/B sound picks; the register map. Musical claims are checked in `fixtures-wave7.test.ts`
// with headless Strudel, @oak/theory and content-kit.
import { type Choice, CLAVE_OPTIONS, SOUND_COMPARE_OPTIONS, TENSION_OPTIONS } from "@oak/content-kit";
import { METERS, polyrhythm } from "@oak/theory";
import type { AnswerKind } from "../types.ts";
import type { Fixture } from "./fixtures.ts";

const fx = <K extends AnswerKind>(f: Fixture<K>): Fixture => f as unknown as Fixture;

/** iii–VI–ii–V in C (J4.L01's turnaround: Em7 A7 Dm7 G7), and the same with the tritone sub in bar 4. */
export const TURNAROUND = ["iii7", "VI7", "ii7", "V7"];
export const TURNAROUND_SUB = ["iii7", "VI7", "ii7", "bII7"];

/** J1.L05's shell of Dm7 (D3 F3 C4), and D F A (a triad: no 7th). */
export const SHELL_DM7 = [50, 53, 60];
export const TRIAD_DM = [50, 53, 57];
/** G7 rootless A (B3 E4 F4 A4: 3, 13, ♭7, 9), and G7 in close root position (G3 B3 D4 F4). */
export const ROOTLESS_G7 = [59, 64, 65, 69];
export const CLOSE_G7 = [55, 59, 62, 65];
/** Cmaj7 drop-2 (G3 C4 E4 B4) on the grand staff, and the close voicing it comes from. */
export const DROP2_CMAJ7 = "[G3,C4,E4,B4]:1";
export const CLOSE_CMAJ7 = "[C4,E4,G4,B4]:1";

/** Two-lane taps: 3 against 2 over two bars at 80 BPM (a bar is 3 s), from bar 1 at t = 100. */
export const LANES_BPM = 80;
export const LANES_BARS = 2;
const LANE_BAR = (4 * 60) / LANES_BPM;
const poly = polyrhythm(3, 2);
/** Lane onsets in bars: the 3 and the 2 in each bar. */
export const LANE_THREE = [0, 1].flatMap((b) => poly.a.map(([n, d]) => b + n / d));
export const LANE_TWO = [0, 1].flatMap((b) => poly.b.map(([n, d]) => b + n / d));
const laneTake = (late: number) => {
  const all = [
    ...LANE_THREE.map((o) => ({ t: 100 + o * LANE_BAR, v: 0 as const })),
    ...LANE_TWO.map((o, i) => ({ t: 100 + o * LANE_BAR + (i === 3 ? late : 0), v: 1 as const })),
  ].sort((a, b) => a.t - b.t || a.v - b.v);
  return { taps: all.map((x) => x.t), voices: all.map((x) => x.v) };
};
/** A take that is right, and one whose last tap of the 2 comes a tenth of a bar (150 ms) late (the voices are the same). */
export const LANES_RIGHT = laneTake(0);
export const LANES_LATE = laneTake(0.15);

/** 7/8 at 200 to the eighth, grouped 2+2+3: a tap on each group start. */
export const TAP_78 = [0, 2 / 7, 4 / 7] as const;
const BAR_78 = (7 * 60) / 200;

const ARRANGEMENT_CODE =
  'setcpm(90/4)\n\nbass: note("a1 e2").s("sawtooth").lpf(400)\npad: note("<[c4,e4,g4]>").s("supersaw")';

export const REGISTER_PARTS = ["Sub", "Bass line", "Pad", "Tune"];
/** Where each part sits in the gallery's example (sub C1–C2, bass A1–E2, pad C4–G4, tune C5–G5). */
export const REGISTER_NOTES: readonly (readonly number[])[] = [
  [24, 36],
  [33, 40],
  [60, 67],
  [72, 79],
];
const REGISTER_OPTIONS: Choice[] = [
  { id: "sub", label: "Sub" },
  { id: "bass", label: "Bass" },
  { id: "low-mid", label: "Low mids" },
  { id: "mid", label: "Mids" },
  { id: "high", label: "Highs" },
];

/** The A/B cards: a saw riff with the filter open (A) and closed (B). */
export const BRIGHT_A = 'note("c3 eb3 g3 bb3").s("sawtooth").lpf(4000)';
export const BRIGHT_B = 'note("c3 eb3 g3 bb3").s("sawtooth").lpf(600)';
export const BUSY_A = 's("hh*16, bd*4, ~ sd")';
export const BUSY_B = 's("hh*4, bd*2, ~ sd")';
/** The cutoff to match by ear (A1.L02's filter, heard on a saw). */
export const CUTOFF_TARGET = 1200;
export const cutoffCode = (hz: number) => `note("c2 c3").s("sawtooth").lpf(${Math.round(hz)})`;
/** Plays a cutoff through the app's audition (loaded on use: the gallery's tests never load the app's content). */
const hearCutoff = (hz: number) =>
  void import("../../lib/audition.ts").then((m) => m.auditionCode(cutoffCode(hz), 1));

export const WAVE7_FIXTURES: Fixture[] = [
  // --- jazz -----------------------------------------------------------------------------------------------------
  fx({
    id: "jazz-chord",
    kind: "text",
    title: "Jazz chord symbol",
    prompt: "Name bar 2's chord: a G dominant seventh with a flat nine.",
    spec: { ui: "text", normalize: "chord", jazz: true },
    expected: "G7(♭9)",
    sample: "G7",
    wrongMessage: "The 7th is there; listen for the colour on top.",
    env: { harmony: { chordStyle: "lead-sheet" } },
  }),
  fx({
    id: "jazz-chord-glyphs",
    kind: "text",
    title: "Jazz chord symbol, in glyphs",
    prompt: "Bar 1 is D minor with a 7th and a 9th. Write it as a chart would.",
    spec: { ui: "text", normalize: "chord", jazz: true },
    expected: "D–9",
    sample: "D–7",
    env: { harmony: { chordStyle: "jazz" } },
  }),
  fx({
    id: "voicing-shell",
    kind: "keyboard",
    title: "Voicing builder: a shell",
    prompt: "Build a shell voicing of Dm7 with D3 at the bottom.",
    spec: { ui: "keyboard", range: ["C3", "C5"], mode: "chord" },
    expected: SHELL_DM7,
    sample: TRIAD_DM,
    wrongMessage: "A shell keeps the root, the 3rd and the 7th, and leaves out the 5th.",
    env: {
      harmony: { voicing: { symbol: "Dm7", shape: "shell" } },
      keyboard: { octave: 3 },
      lenses: { degrees: false, solfege: false, noteNames: false, voicings: true },
    },
  }),
  fx({
    id: "voicing-rootless",
    kind: "keyboard",
    title: "Voicing builder: rootless, named after the check",
    prompt: "Build G7 without its root, the 3rd at the bottom: an A voicing.",
    spec: { ui: "keyboard", range: ["G3", "C5"], mode: "chord" },
    expected: ROOTLESS_G7,
    sample: CLOSE_G7,
    env: {
      harmony: { voicing: { symbol: "G7", shape: ["rootless-a", "rootless-b"] } },
      keyboard: { octave: 3 },
    },
  }),
  fx({
    id: "voicing-drop2",
    kind: "staff-input",
    title: "Voicing builder on the staff: drop-2",
    prompt: "Write Cmaj7 as a drop-2 voicing: take the close voicing and drop its second note from the top.",
    spec: {
      ui: "staff-input",
      clef: "grand",
      bars: 1,
      palette: { durations: ["1"], accidentals: true, ties: false, rests: false, chords: true },
    },
    expected: DROP2_CMAJ7,
    sample: CLOSE_CMAJ7,
    env: {
      harmony: { voicing: { symbol: "Cmaj7", shape: "drop-2" } },
      lenses: { degrees: false, solfege: false, noteNames: false, voicings: true },
    },
  }),
  fx({
    id: "tension-pick",
    kind: "choice",
    title: "Tension pick",
    prompt: "What is the melody note over the chord?",
    spec: { ui: "choice", options: [...TENSION_OPTIONS] },
    expected: ["9"],
    sample: ["11"],
    env: { tension: { chord: "Fm7", note: "G4" } },
  }),
  fx({
    id: "rn-jazz",
    kind: "rn-palette",
    title: "Numerals: the jazz row and ii–V brackets",
    prompt: "Em7 A7 Dm7 G7: name the turnaround.",
    spec: { ui: "rn-palette", slots: 4, allow: ["sevenths"] },
    expected: TURNAROUND,
    sample: TURNAROUND_SUB,
    wrongMessage: "Listen to bar 4 again: where does its root sit against bar 3's?",
    env: { harmony: { key: { tonic: "C", mode: "major" }, jazz: true } },
  }),
  // --- rhythm ---------------------------------------------------------------------------------------------------
  fx({
    id: "grouping-78",
    kind: "grouping",
    title: "Grouping: 7/8",
    prompt: "Cut the bar of 7/8 into the groups you hear.",
    spec: { ui: "grouping", meter: "7/8" },
    expected: [2, 2, 3],
    sample: [3, 2, 2],
    wrongMessage: "The long group comes last: short, short, long.",
    env: { rhythm: { bpm: 200 } },
  }),
  fx({
    id: "grouping-54",
    kind: "grouping",
    title: "Grouping: 5/4",
    prompt: "A bar of 5/4: where do the quarters group?",
    spec: { ui: "grouping", meter: "5/4" },
    expected: [3, 2],
    sample: [2, 3],
    env: { rhythm: { bpm: 140 } },
  }),
  fx({
    id: "euclid-tresillo",
    kind: "euclid",
    title: "Euclid: hits and steps",
    prompt: "The bass plays the tresillo. Which numbers make it?",
    spec: { ui: "euclid", maxSteps: 8, rotation: false },
    expected: [3, 8],
    sample: [5, 8],
    env: { rhythm: { bpm: 100, sound: "bd" } },
  }),
  fx({
    id: "euclid-rotation",
    kind: "euclid",
    title: "Euclid: with a rotation",
    prompt: "The bossa rim: five hits in sixteen, turned so the bar starts where the rim does.",
    spec: { ui: "euclid", maxSteps: 16, rotation: true },
    expected: [5, 16, 10],
    sample: [5, 16, 0],
    env: { rhythm: { bpm: 120, sound: "rim" } },
  }),
  fx({
    id: "clave-pick",
    kind: "choice",
    title: "Clave pick",
    prompt: "Which clave is this groove in?",
    spec: { ui: "choice", options: [...CLAVE_OPTIONS] },
    expected: ["son 2-3"],
    sample: ["son 3-2"],
  }),
  fx({
    id: "tap-lanes",
    kind: "tap",
    title: "Tap: two lanes, 3 against 2",
    prompt: "Left hand (F) taps the 3, right hand (J) the 2, for two bars.",
    spec: { ui: "tap" },
    expected: LANES_RIGHT.taps,
    sample: LANES_LATE.taps,
    env: {
      tap: {
        bars: LANES_BARS,
        bpm: LANES_BPM,
        stepsPerBeat: 3,
        startAt: 100,
        meter: METERS["4/4"],
        lanes: [
          { label: "Left hand: the 3", key: "f", targets: LANE_THREE },
          { label: "Right hand: the 2", key: "j", targets: LANE_TWO },
        ],
        voices: LANES_RIGHT.voices,
      },
    },
  }),
  fx({
    id: "tap-78",
    kind: "tap",
    title: "Tap: 7/8, the group starts",
    prompt: "A bar of 7/8 at 200 to the eighth: tap where each group starts.",
    spec: { ui: "tap" },
    expected: TAP_78.map((o) => 100 + o * BAR_78),
    sample: [0, 3 / 7, 4 / 7].map((o) => 100 + o * BAR_78),
    env: {
      tap: {
        bars: 1,
        bpm: 200,
        targets: [...TAP_78],
        startAt: 100,
        targetWord: "hit",
        meter: METERS["7/8"],
      },
    },
  }),
  fx({
    id: "slider-swing-play",
    kind: "slider",
    title: "Set the swing by ear",
    prompt: "Move the slider until the hi-hat swings like the record: Play yours to hear it.",
    spec: {
      ui: "slider",
      min: 0,
      max: 0.5,
      step: 0.01,
      format: "swing",
      play: "swing",
      marks: [
        { at: 0, label: "straight" },
        { at: 1 / 3, label: "triplet" },
      ],
    },
    expected: 1 / 3,
    sample: 0.2,
    env: { slider: { bpm: 120 } },
  }),
  fx({
    id: "slider-layback",
    kind: "slider",
    title: "Set the lay-back by ear",
    prompt: "How far behind the beat does the snare sit? Play yours against the record.",
    spec: { ui: "slider", min: 0, max: 60, step: 1, format: "ms", play: "layback" },
    expected: 20,
    sample: 45,
    env: { slider: { bpm: 90 } },
  }),
  // --- sound ----------------------------------------------------------------------------------------------------
  fx({
    id: "slider-cutoff",
    kind: "slider",
    title: "Match the cutoff by ear",
    prompt: "Hear the target, then move the cutoff until yours sounds the same.",
    spec: { ui: "slider", min: 100, max: 10000, step: 1, format: "hz", scale: "log", play: "control" },
    expected: CUTOFF_TARGET,
    sample: 3000,
    env: {
      slider: {
        play: hearCutoff,
        playTarget: () => hearCutoff(CUTOFF_TARGET),
      },
    },
  }),
  fx({
    id: "compare-bright",
    kind: "choice",
    title: "A/B: which is brighter",
    prompt: "Two cards, the same riff. Which is brighter?",
    spec: { ui: "choice", options: [...SOUND_COMPARE_OPTIONS.brightness] },
    expected: ["brighter"],
    sample: ["darker"],
    env: { compare: { a: BRIGHT_A, b: BRIGHT_B } },
  }),
  fx({
    id: "compare-busier",
    kind: "choice",
    title: "A/B: which is busier",
    prompt: "Two grooves. Which is busier?",
    spec: {
      ui: "choice",
      options: [
        { id: "busier", label: "Busier" },
        { id: "sparser", label: "Sparser" },
      ],
    },
    expected: ["busier"],
    sample: ["sparser"],
    env: { compare: { a: BUSY_A, b: BUSY_B } },
  }),
  fx({
    id: "register-map",
    kind: "slot-choice",
    title: "Register map",
    prompt: "Mark the register each part of the arrangement lives in.",
    spec: { ui: "slot-choice", slots: 4, options: REGISTER_OPTIONS, labels: REGISTER_PARTS },
    expected: ["sub", "bass", "mid", "high"],
    sample: ["sub", "bass", "low-mid", "high"],
    wrongMessage: "Listen to the pad again: is it down with the mud, or up where chords ring?",
    env: { code: ARRANGEMENT_CODE },
  }),
];
