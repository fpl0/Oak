// Generated transcription-ladder material (contracts §2.9, §6.12; U07 spec "The ladder"): L1 drum loops,
// L2 bass lines, L3 four-chord loops (bass first) and L4 short melodies, each from a seed, at a realism
// level R0 (bare, slow, one layer) to R4 (full arrangement, faster, swung where idiomatic, the target part
// buried, a vocal-like lead). Never authored by hand. A piece is the hidden reference code with its events,
// what the learner is given (tempo, meter, key, pickup, bars), the answer key (the target layer as the
// learner would write it, in degrees) and the performance hints the pattern-source player applies on top
// (`@oak/strudel` `realismSpec(level, { target, swung, vocalLead })`). The code is always on the grid:
// humanised timing, swing, room and detune are the player's, so grading tolerances never change with realism.
//
// Musical rules (checked by golden and property tests in ladder.test.ts):
//   - every part is in the learner's vocabulary at the gym (U07.L01 on): major keys with up to 2 accidentals
//     (4 from R2), the schemas of U06 (the four-chord loop and its rotations, doo-wop, three-chord rock),
//     triads, rhythms of quarters, eighths, halves and wholes, and a one-beat pickup only once U07.L08 is
//     done (`opts.completed`);
//   - bass lines move to the nearest root and stay in E1–D3; chords are voice-led close triads above G3;
//   - a melody has a chord tone on every strong beat (1 and 3), moves by step at R0–R1 and leaps at most
//     2 + R degrees from R2 (turning back by step after a leap), stays between degrees 1 and 8 in the learner's
//     comfortable range, and ends on 1 over I; a 4-bar melody is a question (ends on a note of V) and an
//     answer that brings bar 1's motif back.

import type {
  Degree,
  KeySpec,
  LearnerProfile,
  MeterId,
  NEvent,
  PickupSpec,
  SwingSpec,
} from "@oak/content-kit";
import { CLAVE_GRIDS, rat } from "@oak/content-kit";
import { buildPiece, type TrackSpec } from "./build.ts";
import { barNode, gridBeats } from "./gen/rhythm.ts";
import {
  CHORD_SUFFIX,
  CHORD_TONES,
  degreeOfMidi,
  formatRn,
  keysFor,
  mod,
  type RnChord,
  rnRoot,
  stepToMidi,
  tonicMidi,
} from "./kernel.ts";
import { closeVoices, rn, spellVoiced, voiceProgression } from "./music.ts";
import { atom, chordOf, type Node, print as printPat, rest, seq } from "./pat.ts";
import { KITS } from "./pools.ts";
import { createRng, hashString } from "./rng.ts";
import type { Rng } from "./types.ts";

export type LadderLevelNo = 1 | 2 | 3 | 4;
export type LadderRealism = 0 | 1 | 2 | 3 | 4;
export type LadderStageId = "bass" | "quality" | "rn";
export type LadderFlavour = "pop" | "jazz-soul";

/**
 * Vocabulary the generator may use beyond the gym's default (the course through U07.L03, where GYM.01 sits in
 * the default order): each feature names the lesson that teaches it. `completed` (lesson IDs) turns a feature
 * on; without it only the default vocabulary is used.
 */
export const LADDER_FEATURE_GATES = {
  /** A one-beat pickup before bar 1 (L4, from R2). */
  pickup: "U07.L08",
  // --- the advanced tracks (Wave 7): the gym after the core serves the grooves and changes the tracks teach,
  // each only once its lesson is done (half of the items of the level, from R1).
  /** L1: the jazz ride pattern on the jazz kit, swung by the player (J1.L01 "Swing Feel & the Ride"). */
  ride: "J1.L01",
  /** L1: sixteenth-note funk drums with ghost notes on the snare (R1.L03 "The One"). */
  funk16: "R1.L03",
  /** L1: a son or rumba clave on the rim over the groove, 3-2 or 2-3 (R3.L02 "Clave Direction"). */
  clave: "R3.L02",
  /** L2: a walking bass, four to the bar: root on 1, a chord tone on 3, a step into the next root on 4 (J3.L04). */
  walking: "J3.L04",
  /** L3: the ii–V–I in seventh chords (J1.L03), answered on the triad core like every L3 loop. */
  twoFive: "J1.L03",
  /** L3: the I–vi–ii–V turnaround in seventh chords (J4.L01). */
  turnaround: "J4.L01",
} as const;
export type LadderFeature = keyof typeof LADDER_FEATURE_GATES;

export interface LadderOptions {
  /** Lessons the learner has completed: unlocks `LADDER_FEATURE_GATES` features. */
  completed?: ReadonlySet<string>;
}

/** What the learner is told before transcribing (contracts §6.12: tempo, meter, key and pickup are given). */
export interface LadderGiven {
  bpm: number;
  meter: MeterId;
  key: KeySpec;
  pickup: PickupSpec | null;
  /** Bars of the item, the pickup bar not counted. */
  bars: number;
  /** L1: the drum sounds by name (`bd`, `sd`, `hh`, `oh`, `cp`). */
  sounds: string[] | null;
  /** L3: chords per bar (always 1). */
  chordsPerBar: number | null;
}

/** One chord of an L3 loop in every form the learner may answer with. */
export interface LadderChord {
  bar: number;
  degree: Degree;
  quality: "maj" | "min" | "dim";
  /** "vi" (Oak's ASCII dialect, `viio` for vii°). */
  rn: string;
  /** Lead-sheet symbol: "Am", "B°". */
  symbol: string;
  /** Strudel `chord()` symbol: "Am", "Bo". */
  code: string;
}

export interface LadderPiece {
  /** The hidden reference code (never shown; the browser gets events). */
  code: string;
  events: NEvent[];
  cps: number;
  /** Cycles the reference plays: `given.bars`, plus 1 when there is a pickup bar. */
  bars: number;
  preload: string[];
  level: LadderLevelNo;
  realism: LadderRealism;
  seed: number;
  bpm: number;
  meter: MeterId;
  key: KeySpec;
  pickup: PickupSpec | null;
  /** Swing feel the player adds (R2+ jazz-soul items); the code itself is straight. */
  swing: SwingSpec | null;
  flavour: LadderFlavour;
  given: LadderGiven;
  /** Tracks the learner transcribes (labels of the reference). */
  target: string[];
  /** L3 is staged, bass first; `null` for the other levels. */
  stages: LadderStageId[] | null;
  /** The answer key as code the learner could write: the target layer only, in degrees. */
  answer: string;
  /** L3: the answer of each stage (quality and rn answer with the bass and the chords). */
  stageAnswers: Record<LadderStageId, string> | null;
  /** L3 chords, one a bar. */
  chords: LadderChord[] | null;
  /** L2 and L4: the target line as 1-based degrees, in time order. */
  degrees: Degree[] | null;
  /** Hints for `@oak/strudel` `realismSpec(level, { seed, target, swung, vocalLead })`. */
  performance: { target: string; swung: boolean; vocalLead: "tenor" | "choir" | null };
  /** The advanced tracks' material the item uses (`LADDER_FEATURE_GATES`), when it uses one. */
  feature?: LadderFeature;
  /** A short title for the gym screen ("Drum loop · 2 bars"). */
  title: string;
}
/** The gym screen's title of an item with a track feature. */
export const TRACK_TITLES: Readonly<Record<LadderFeature, string>> = {
  pickup: "Short melody",
  ride: "Jazz ride",
  funk16: "Sixteenth-note funk",
  clave: "Clave groove",
  walking: "Walking bass",
  twoFive: "ii–V–I in sevenths",
  turnaround: "Turnaround in sevenths",
};

/** The structural `LadderItemSpec` of `@oak/grader` (`gradeLadder`), built from a piece. */
export interface LadderItemFields {
  itemId: string;
  level: LadderLevelNo;
  stage?: LadderStageId;
  reference: string;
  bars: number;
  key: KeySpec;
  meter: MeterId;
  bpm: number;
  pickup?: PickupSpec;
  swing?: SwingSpec;
}
export function ladderItemOf(piece: LadderPiece, stage?: LadderStageId): LadderItemFields {
  return {
    itemId: `lad.${piece.level}.${piece.seed}`,
    level: piece.level,
    ...(stage ? { stage } : {}),
    reference: piece.code,
    bars: piece.bars,
    key: piece.key,
    meter: piece.meter,
    bpm: piece.bpm,
    ...(piece.pickup ? { pickup: piece.pickup } : {}),
  };
}

// --- material -----------------------------------------------------------------------------------

/** The loops of U06 (H04, H05), each with the realism level from which it may be drawn. */
export const LADDER_LOOPS: readonly { id: string; chords: readonly RnChord[]; from: LadderRealism }[] = [
  { id: "axis", chords: [rn("1", "maj"), rn("5", "maj"), rn("6", "min"), rn("4", "maj")], from: 0 },
  { id: "three-chord", chords: [rn("1", "maj"), rn("4", "maj"), rn("5", "maj"), rn("4", "maj")], from: 0 },
  { id: "axis-vi", chords: [rn("6", "min"), rn("4", "maj"), rn("1", "maj"), rn("5", "maj")], from: 1 },
  { id: "doo-wop", chords: [rn("1", "maj"), rn("6", "min"), rn("4", "maj"), rn("5", "maj")], from: 1 },
  { id: "axis-IV", chords: [rn("4", "maj"), rn("1", "maj"), rn("5", "maj"), rn("6", "min")], from: 2 },
  { id: "plagal-rock", chords: [rn("1", "maj"), rn("5", "maj"), rn("4", "maj"), rn("1", "maj")], from: 2 },
  { id: "fifties-ii", chords: [rn("1", "maj"), rn("6", "min"), rn("2", "min"), rn("5", "maj")], from: 3 },
  { id: "axis-V", chords: [rn("5", "maj"), rn("6", "min"), rn("4", "maj"), rn("1", "maj")], from: 3 },
];

/** The advanced tracks' loops of seventh chords (one a bar), each with the feature that opens it. */
export const JAZZ_LOOPS: readonly { id: string; chords: readonly RnChord[]; feature: LadderFeature }[] = [
  {
    id: "ii-V-I",
    chords: [rn("2", "m7"), rn("5", "7"), rn("1", "maj7"), rn("1", "maj7")],
    feature: "twoFive",
  },
  {
    id: "I-ii-V-I",
    chords: [rn("1", "maj7"), rn("2", "m7"), rn("5", "7"), rn("1", "maj7")],
    feature: "twoFive",
  },
  {
    id: "I-vi-ii-V",
    chords: [rn("1", "maj7"), rn("6", "m7"), rn("2", "m7"), rn("5", "7")],
    feature: "turnaround",
  },
];

/** Kick patterns on a 16-step bar, with the realism level from which they appear (U01 grooves). */
const KICKS: readonly { hits: number[]; from: LadderRealism }[] = [
  { hits: [0, 8], from: 0 },
  { hits: [0, 4, 8, 12], from: 0 },
  { hits: [0, 6, 8], from: 1 },
  { hits: [0, 8, 10], from: 1 },
  { hits: [0, 3, 8], from: 2 },
  { hits: [0, 6, 10], from: 2 },
  { hits: [0, 3, 6, 10], from: 3 },
  { hits: [0, 7, 10], from: 3 },
];
/** Variations for the last bar of a 2- or 4-bar drum loop: an extra kick or a push into bar 1. */
const KICK_TURNS: readonly number[][] = [[14], [11, 14], [15], [10, 11]];

const TEMPO: Readonly<Record<LadderRealism, [number, number]>> = {
  0: [72, 84],
  1: [76, 90],
  2: [80, 96],
  3: [84, 104],
  4: [88, 112],
};

/** Strudel sounds of the two flavours the course is written in (content/flavours.ts). */
const SOUNDS: Readonly<Record<LadderFlavour, { bass: string; chords: string; lead: string }>> = {
  pop: { bass: "ebass", chords: "piano", lead: "piano" },
  "jazz-soul": { bass: "upright", chords: "rhodes", lead: "vibes" },
};

const feature = (opts: LadderOptions | undefined, f: LadderFeature): boolean =>
  opts?.completed?.has(LADDER_FEATURE_GATES[f]) === true;
/** The track features of a level the learner has opened. */
const TRACK_FEATURES: Readonly<Record<1 | 2 | 3, readonly LadderFeature[]>> = {
  1: ["ride", "funk16", "clave"],
  2: ["walking"],
  3: ["twoFive", "turnaround"],
};
/** One track feature for this item, or none: from R1, half the items once at least one is open. */
function trackFeature(
  rng: Rng,
  level: LadderLevelNo,
  realism: LadderRealism,
  opts: LadderOptions | undefined,
): LadderFeature | null {
  if (level === 4 || realism === 0) return null;
  const open = TRACK_FEATURES[level].filter((f) => feature(opts, f));
  if (open.length === 0 || rng.next() >= 0.5) return null;
  return rng.pick(open);
}

// --- the tracks' grooves (L1) and lines (L2) -------------------------------------------------------

/** Steps (16 a bar) of the ride's spang-a-lang: 1, 2, the "and" of 2, 3, 4, the "and" of 4. */
export const RIDE_STEPS = [0, 4, 6, 8, 12, 14] as const;
/** Sixteenth-note funk kicks (R1.L03), the backbeat on 2 and 4 and the ghost notes around it. */
export const FUNK_KICKS: readonly number[][] = [
  [0, 3, 8, 11],
  [0, 6, 9, 12],
  [0, 3, 6, 10],
  [0, 7, 10],
];
export const FUNK_GHOSTS: readonly number[][] = [
  [7, 9, 15],
  [3, 7, 10],
  [6, 9, 14],
  [2, 7, 11, 15],
];
/** The clave of an item on the 16-step grid, from content-kit's `CLAVE_GRIDS` (two bars). */
function claveBars(type: "son" | "rumba", dir: "3-2" | "2-3"): number[][] {
  return CLAVE_GRIDS[type][dir].map((bar) => bar.map(([n, d]) => (n * 16) / d));
}

/** L1 track grooves: the drum lines of the item (labels STYLE §2), the sounds it names, its swing. */
function trackDrums(
  rng: Rng,
  f: LadderFeature,
  realism: LadderRealism,
  bars: number,
): { tracks: TrackSpec[]; sounds: string[]; swung: boolean; flavour: LadderFlavour } {
  const node = (steps: readonly number[], word: string) => barNode(gridBeats([...steps], 4, 4), word);
  if (f === "ride") {
    // The jazz kit: the ride's pattern, the hi-hat foot on 2 and 4, a feathered kick on the beat at R3+.
    const tracks: TrackSpec[] = [
      { label: "drums", src: "s", pat: node(RIDE_STEPS, "rd"), bank: "jazzkit", gain: 0.6 },
      { label: "hats", src: "s", pat: node([4, 12], "hh"), bank: "jazzkit", gain: 0.5 },
    ];
    if (realism >= 3)
      tracks.push({ label: "kick", src: "s", pat: node([0, 8], "bd"), bank: "jazzkit", gain: 0.35 });
    return {
      tracks,
      sounds: ["rd", "hh", ...(realism >= 3 ? ["bd"] : [])],
      swung: true,
      flavour: "jazz-soul",
    };
  }
  if (f === "funk16") {
    // Busy everywhere except the one: sixteenth hats, the kick on 1 and around it, ghost notes on the snare.
    const kick = rng.pick(FUNK_KICKS);
    // Two ghost notes at least, never on a kick or the backbeat.
    const ghosts = rng.pick(FUNK_GHOSTS).filter((g) => !kick.includes(g));
    for (const g of [7, 9, 14, 2, 10, 15])
      if (ghosts.length < 2 && !kick.includes(g) && !ghosts.includes(g)) ghosts.push(g);
    ghosts.sort((a, b) => a - b);
    const tracks: TrackSpec[] = [
      { label: "kick", src: "s", pat: node(kick, "bd") },
      { label: "snare", src: "s", pat: node([4, 12], "sd") },
      { label: "perc", src: "s", pat: node(ghosts, "sd"), gain: 0.25 },
      { label: "hats", src: "s", pat: seq([atom("hh", 16)]), gain: 0.45 },
    ];
    return { tracks, sounds: ["bd", "sd", "hh"], swung: false, flavour: "pop" };
  }
  // A clave on the rim over a groove that keeps both bars the same (the kick on 1 and the "and" of 2 and 4).
  const bank = realism >= 2 ? rng.pick(KITS.filter((k): k is string => k !== null)) : undefined;
  const kit = bank ? { bank } : {};
  const type = realism >= 3 ? rng.pick(["son", "rumba"] as const) : "son";
  const dir = rng.pick(["3-2", "2-3"] as const);
  const clave = claveBars(type, dir);
  const claveNodes = Array.from({ length: bars }, (_, b) => node(clave[b % 2] as number[], "rim"));
  const tracks: TrackSpec[] = [
    { label: "kick", src: "s", pat: node([0, 6, 12], "bd"), ...kit },
    { label: "hats", src: "s", pat: seq([atom("hh", 8)]), gain: 0.4, ...kit },
    { label: "perc", src: "s", pat: { t: "alt", items: claveNodes }, ...kit },
  ];
  return { tracks, sounds: ["bd", "hh", "rim"], swung: false, flavour: "pop" };
}

/**
 * A walking bass bar (J3.L04) as scale steps, four quarters: the root on 1, a chord tone (the 3rd or the 5th) on
 * 3, a passing step between them on 2, and on 4 the scale step next to the NEXT bar's root (a step into it, from
 * above or below, whichever is nearer beat 3). Diatonic: every approach is one or two half steps.
 */
export function walkingBar(root: number, next: number, rng: Rng, high = 11): number[] {
  // Walk up from a low root, down from a high one, so the line stays in the bass's register.
  const up = root <= high - 4;
  const three = up ? root + rng.pick([2, 4]) : root - 3;
  const two = up ? (three - root === 4 ? root + 2 : root + 1) : root - 1;
  const approach = Math.abs(next + 1 - three) <= Math.abs(next - 1 - three) ? next + 1 : next - 1;
  return [root, two, three, approach];
}

/** The key pool of an item: up to 2 accidentals at R0–R1, 4 from R2 (major keys only before U10). */
export function ladderKeys(realism: LadderRealism): KeySpec[] {
  return keysFor(realism >= 2 ? "≤4acc" : "≤2acc", "major");
}

// --- helpers ------------------------------------------------------------------------------------

const DEGREE_NUM = (d: Degree): number => Number(/\d/.exec(d)?.[0] ?? "1");
/** Scale step (0-based `n`) of a chord's root: degree 1 → 0. */
const rootStep = (c: RnChord): number => DEGREE_NUM(c.degree) - 1;
/** Chord tones of a diatonic triad as scale steps mod 7. */
const chordSteps = (c: RnChord): number[] => [0, 2, 4].map((k) => mod(rootStep(c) + k, 7));

/** The triad a seventh chord is graded on at L3 (`qualityDepth: "triad"`): Dm7 → minor, G7 and Cmaj7 → major. */
const TRIAD_CORE: Readonly<Partial<Record<RnChord["quality"], LadderChord["quality"]>>> = {
  maj: "maj",
  min: "min",
  dim: "dim",
  maj7: "maj",
  "7": "maj",
  m7: "min",
  m7b5: "dim",
};
function chordInfo(c: RnChord, key: KeySpec, bar: number): LadderChord {
  const root = rnRoot(c, key);
  const quality = TRIAD_CORE[c.quality] ?? "maj";
  const core: RnChord = { ...c, quality };
  // The symbol and code name the chord that sounds (a seventh in a jazz loop); quality and rn its triad core.
  return {
    bar,
    degree: c.degree,
    quality,
    rn: formatRn(core),
    symbol: `${root.replace(/#/g, "♯").replace(/(?<=[A-G])b/g, "♭")}${CHORD_SUFFIX[c.quality].lead}`,
    code: `${root}${CHORD_SUFFIX[c.quality].code}`,
  };
}

/** Root steps of a bass line moving to the nearest root, kept in E1–D3 (`.scale("<tonic>2:major")`). */
function bassRoots(chords: readonly RnChord[], key: KeySpec, high = 50): number[] {
  const out: number[] = [];
  let prev: number | null = null;
  for (const c of chords) {
    const r = rootStep(c);
    const options = [r, r - 7].filter((s) => {
      const m = stepToMidi(s, key, 2);
      return m >= 28 && m <= high;
    });
    const ref = prev;
    const dist = (x: number): number =>
      ref === null ? (x === r ? 0 : 1) : Math.abs(stepToMidi(x, key, 2) - stepToMidi(ref, key, 2));
    const pick: number = [...options].sort((a, b) => dist(a) - dist(b))[0] ?? r;
    out.push(pick);
    prev = pick;
  }
  return out;
}

/** A bass figure for one bar as (step | null) eighths or longer values, by realism. */
function bassBar(rng: Rng, root: number, next: number, realism: LadderRealism): Node {
  const r = String(root);
  const oct = String(root + 7);
  const fifth = String(root + 4);
  // An approach note a step from the next root (the passing tone of U07.L04).
  const approach = String(
    next > root && next - 1 !== root ? next - 1 : next + 1 === root ? next - 1 : next + 1,
  );
  switch (realism) {
    case 0:
      return seq([atom(r)]);
    case 1:
      return rng.pick([
        seq([atom(r), atom(r)]),
        seq([atom(r), atom(r)], [3, 1]),
        seq([atom(r), rest, rest, atom(r)]),
      ]);
    case 2:
      return rng.pick([
        seq([atom(r), rest, atom(oct), atom(fifth)]),
        seq([atom(r), atom(fifth), atom(oct), atom(fifth)]),
        seq([atom(r), rest, atom(r), atom(oct)]),
      ]);
    default: {
      const eighths = rng.pick([
        [r, null, r, null, oct, null, fifth, approach],
        [r, null, null, r, null, r, approach, null],
        [r, r, null, r, oct, null, r, approach],
      ]);
      return seq(eighths.map((v) => (v === null ? rest : atom(v))));
    }
  }
}

/** One bar of drums (16 steps) as `kick`, `snare` and `hats` nodes. */
function drumBar(
  kick: readonly number[],
  snare: readonly number[],
  snareSound: string,
): { k: Node; s: Node } {
  return {
    k: barNode(gridBeats(kick, 4, 4), "bd"),
    s: barNode(gridBeats(snare, 4, 4), snareSound),
  };
}
/** One node, or `< … >` over the bars when they differ. */
function overBars(nodes: readonly Node[]): Node {
  const texts = nodes.map((n) => JSON.stringify(n));
  if (texts.every((t) => t === texts[0])) return nodes[0] as Node;
  return { t: "alt", items: [...nodes] };
}

interface DrumPart {
  tracks: TrackSpec[];
  sounds: string[];
}
function drumPart(
  rng: Rng,
  realism: LadderRealism,
  bars: number,
  opts: { pickupBar: boolean; gain?: number; flavour: LadderFlavour },
): DrumPart {
  const kick = rng.pick(KICKS.filter((k) => k.from <= realism)).hits;
  const turn = realism >= 1 ? rng.pick(KICK_TURNS) : [];
  const halfTime = realism >= 2 && rng.next() < 0.2;
  const snare = halfTime ? [8] : [4, 12];
  const snareSound = realism >= 4 && rng.next() < 0.5 ? "cp" : "sd";
  const bank = realism >= 2 ? rng.pick(KITS.filter((k): k is string => k !== null)) : undefined;
  const kickBars: Node[] = [];
  const snareBars: Node[] = [];
  const hatBars: Node[] = [];
  const openHat = realism >= 2 && rng.next() < 0.5;
  const sixteenths = realism >= 4;
  for (let b = 0; b < bars; b++) {
    const last = b === bars - 1;
    const k = last && turn.length > 0 ? [...new Set([...kick, ...turn])].sort((x, y) => x - y) : kick;
    // A snare fill on the last beat of a 4-bar loop.
    const s = last && bars >= 4 ? [...snare, 13, 14, 15] : snare;
    const d = drumBar(k, s, snareSound);
    kickBars.push(d.k);
    snareBars.push(d.s);
    const hats = sixteenths
      ? seq([atom("hh", 16)])
      : openHat && last
        ? seq([...Array.from({ length: 7 }, () => atom("hh")), atom("oh")])
        : seq([atom("hh", 8)]);
    hatBars.push(hats);
  }
  const lead = (nodes: Node[]): Node =>
    opts.pickupBar ? { t: "alt", items: [seq([rest]), ...nodes] } : overBars(nodes);
  const kit = bank ? { bank } : {};
  const tracks: TrackSpec[] = [
    { label: "kick", src: "s", pat: lead(kickBars), ...kit, ...(opts.gain ? { gain: opts.gain } : {}) },
    {
      label: "snare",
      src: "s",
      pat: lead(snareBars),
      ...kit,
      ...(opts.gain ? { gain: opts.gain * 0.9 } : {}),
    },
    { label: "hats", src: "s", pat: lead(hatBars), ...kit, gain: (opts.gain ?? 0.8) * 0.6 },
  ];
  const sounds = ["bd", snareSound, "hh", ...(openHat && !sixteenths ? ["oh"] : [])];
  return { tracks, sounds };
}

/** Upper structures of a loop (close triads around E4), as note names per chord. */
function chordVoices(chords: readonly RnChord[], key: KeySpec, center = 62): string[][] {
  return closeVoices(chords, key, center).map((v) => spellVoiced(v, key));
}

/** The chord rhythm of a bar: sustained at R0–R2, a comping figure from R3 (every bar starts on beat 1). */
function compBar(rng: Rng, notes: readonly string[], realism: LadderRealism): Node {
  const c = chordOf(notes);
  if (realism <= 2) return seq([c]);
  return rng.pick([seq([c, c], [3, 1]), seq([c, rest, c, c], [3, 1, 2, 2]), seq([c, c, rest, c])]);
}

/** Degrees as `n` text: `<a b c d>` over bars. */
const altText = (items: readonly string[]): string =>
  items.every((x) => x === items[0]) ? (items[0] as string) : `<${items.join(" ")}>`;

// --- melody (L4) --------------------------------------------------------------------------------

/** Rhythms of a bar in eighths (sum 8). `end` rhythms finish on a long note on beat 1 or 3. */
const RHYTHMS: Readonly<Record<"plain" | "eighths", number[][]>> = {
  plain: [
    [2, 2, 2, 2],
    [4, 2, 2],
    [2, 2, 4],
    [4, 4],
  ],
  eighths: [
    [1, 1, 2, 2, 2],
    [2, 1, 1, 2, 2],
    [2, 2, 1, 1, 2],
    [2, 2, 2, 1, 1],
    [1, 1, 1, 1, 2, 2],
  ],
};
const ENDINGS: readonly number[][] = [[2, 2, 4], [4, 4], [8], [1, 1, 2, 4]];

/** The chords of a 2- or 4-bar melody (1 or 2 a bar, halves); the last bar ends on I. */
const MELODY_HARMONY: Readonly<Record<2 | 4, RnChord[][][]>> = {
  2: [
    [
      [rn("1", "maj"), rn("4", "maj")],
      [rn("5", "maj"), rn("1", "maj")],
    ],
    [
      [rn("1", "maj"), rn("6", "min")],
      [rn("5", "maj"), rn("1", "maj")],
    ],
    [[rn("1", "maj")], [rn("5", "maj"), rn("1", "maj")]],
    [
      [rn("1", "maj"), rn("5", "maj")],
      [rn("4", "maj"), rn("1", "maj")],
    ],
  ],
  4: [
    [[rn("1", "maj")], [rn("5", "maj")], [rn("1", "maj")], [rn("5", "maj"), rn("1", "maj")]],
    [
      [rn("1", "maj"), rn("4", "maj")],
      [rn("1", "maj"), rn("5", "maj")],
      [rn("1", "maj"), rn("4", "maj")],
      [rn("5", "maj"), rn("1", "maj")],
    ],
    [[rn("1", "maj")], [rn("4", "maj"), rn("5", "maj")], [rn("1", "maj")], [rn("4", "maj"), rn("1", "maj")]],
    [
      [rn("1", "maj"), rn("6", "min")],
      [rn("4", "maj"), rn("5", "maj")],
      [rn("1", "maj"), rn("6", "min")],
      [rn("5", "maj"), rn("1", "maj")],
    ],
  ],
};

interface Slot {
  bar: number;
  /** Offset in eighths inside the bar. */
  at: number;
  len: number;
  strong: boolean;
  chord: RnChord;
  /** Last note of the phrase, or the question's last note (bar 2 of 4). */
  role: "end" | "half" | null;
}

function slotsOf(harmony: readonly RnChord[][], rhythms: readonly number[][]): Slot[] {
  const out: Slot[] = [];
  rhythms.forEach((r, bar) => {
    let at = 0;
    const chords = harmony[bar] as RnChord[];
    r.forEach((len, i) => {
      const chord = (chords.length === 2 && at >= 4 ? chords[1] : chords[0]) as RnChord;
      const lastOfBar = i === r.length - 1;
      const role =
        bar === rhythms.length - 1 && lastOfBar
          ? "end"
          : rhythms.length === 4 && bar === 1 && lastOfBar
            ? "half"
            : null;
      out.push({ bar, at, len, strong: at === 0 || at === 4, chord, role });
      at += len;
    });
  });
  return out;
}

/** Fills the slots with scale steps by a randomized depth-first search under the module's melodic rules. */
function melodyPitches(
  rng: Rng,
  slots: readonly Slot[],
  realism: LadderRealism,
  copy: ReadonlyMap<number, number>,
): number[] | null {
  const lo = 0;
  const hi = 7;
  const leapMax = realism <= 1 ? 1 : Math.min(5, 2 + realism);
  const out: number[] = [];
  let budget = 4000;
  const ok = (i: number, p: number): boolean => {
    const s = slots[i] as Slot;
    if (p < lo || p > hi) return false;
    const prev = out[i - 1];
    const prev2 = out[i - 2];
    if (s.strong && !chordSteps(s.chord).includes(mod(p, 7))) return false;
    if (s.role === "end" && p !== 0 && p !== 7) return false;
    if (s.role === "half" && !chordSteps(rn("5", "maj")).includes(mod(p, 7))) return false;
    if (prev !== undefined) {
      const iv = p - prev;
      if (Math.abs(iv) > leapMax) return false;
      if (s.role === "end" && Math.abs(iv) > 2) return false;
      if (prev2 !== undefined) {
        const before = prev - prev2;
        // Turn back by step after a leap of a 4th or more.
        if (Math.abs(before) >= 3 && (Math.sign(iv) === Math.sign(before) || Math.abs(iv) > 2)) return false;
        if (iv === 0 && before === 0) return false;
      }
    }
    return true;
  };
  const dfs = (i: number): boolean => {
    if (i === slots.length) return true;
    if (--budget <= 0) return false;
    const forced = copy.get(i);
    const prev = out[i - 1];
    let cands: number[];
    if (forced !== undefined) cands = [forced];
    else if (prev === undefined) cands = rng.shuffle([0, 2, 4, 7].filter((p) => p >= lo && p <= hi));
    else {
      const moves = [-1, 1, -2, 2, 0, -3, 3, -4, 4, -5, 5];
      const weights = moves.map((m) => (Math.abs(m) === 1 ? 6 : Math.abs(m) === 2 ? 3 : m === 0 ? 1 : 1));
      const ordered: number[] = [];
      const pool = [...moves];
      const w = [...weights];
      while (pool.length > 0) {
        const m = rng.weighted(pool, w);
        const k = pool.indexOf(m);
        pool.splice(k, 1);
        w.splice(k, 1);
        ordered.push(prev + m);
      }
      cands = ordered;
    }
    for (const p of cands) {
      if (!ok(i, p)) continue;
      out.push(p);
      if (dfs(i + 1)) return true;
      out.pop();
    }
    return false;
  };
  return dfs(0) ? out : null;
}

/** A tune worth taking down: at least four different notes over a span of a 4th or more, few repeats. */
function lively(steps: readonly number[]): boolean {
  const distinct = new Set(steps).size;
  const span = Math.max(...steps) - Math.min(...steps);
  let repeats = 0;
  for (let i = 1; i < steps.length; i++) if (steps[i] === steps[i - 1]) repeats++;
  return distinct >= 4 && span >= 3 && repeats <= Math.floor(steps.length / 4);
}

/** A bar of notes as nested beats: eighth pairs `[a b]`, longer notes with `@` weights in beats. */
export function melodyBarNode(steps: readonly number[], rhythm: readonly number[]): Node {
  const items: Node[] = [];
  const w: number[] = [];
  let i = 0;
  while (i < rhythm.length) {
    const len = rhythm[i] as number;
    if (len === 1 && rhythm[i + 1] === 1) {
      items.push(seq([atom(steps[i] as number), atom(steps[i + 1] as number)]));
      w.push(1);
      i += 2;
    } else {
      items.push(atom(steps[i] as number));
      w.push(len / 2);
      i += 1;
    }
  }
  return w.every((x) => x === 1) ? seq(items) : seq(items, w);
}

/** The melody's tonic octave: degrees 1–8 sit inside the learner's comfortable range (or nearest it). */
function melodyOctave(key: KeySpec, profile: LearnerProfile, steps: readonly number[]): number {
  let best = 4;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const o of [2, 3, 4, 5]) {
    const lo = Math.min(...steps.map((s) => stepToMidi(s, key, o)));
    const hi = Math.max(...steps.map((s) => stepToMidi(s, key, o)));
    const cost = Math.max(0, profile.comfLow - lo) + Math.max(0, hi - profile.comfHigh);
    if (cost < bestCost - 1e-9) {
      best = o;
      bestCost = cost;
    }
  }
  return best;
}

/** A tune over chords (L4 and melodic dictation): its harmony per bar, rhythms in eighths and scale steps. */
export interface Tune {
  harmony: RnChord[][];
  rhythms: number[][];
  steps: number[];
}
/**
 * Composes a 2- or 4-bar tune under the module's melodic rules, at the given realism (R0–R1: quarters and
 * halves, steps only; from R2: eighth pairs and leaps up to 2 + R degrees). `requireNct`: at least one
 * passing or neighbour tone on a weak eighth (U07.L04). Deterministic in the RNG; `null` only if no tune fits.
 */
export function composeTune(
  rng: Rng,
  bars: 2 | 4,
  realism: LadderRealism,
  opts: { requireNct?: boolean } = {},
): Tune | null {
  let made: Tune | null = null;
  for (let attempt = 0; attempt < 200 && !made; attempt++) {
    // Strict first (count near 6 + R notes per two bars, a lively line), then a little looser.
    const strict = attempt < 120;
    const harmony = rng.pick(MELODY_HARMONY[bars]);
    const target = 6 + realism;
    const pool = realism >= 2 ? [...RHYTHMS.plain, ...RHYTHMS.eighths] : RHYTHMS.plain;
    const rhythms: number[][] = [];
    for (let b = 0; b < bars; b++) {
      if (b === bars - 1) rhythms.push(rng.pick(ENDINGS.filter((e) => realism >= 2 || !e.includes(1))));
      else if (bars === 4 && b === 1)
        rhythms.push(
          rng.pick(
            [
              [2, 2, 4],
              [4, 4],
              [2, 1, 1, 4],
            ].filter((e) => realism >= 2 || !e.includes(1)),
          ),
        );
      else if (bars === 4 && b === 2) rhythms.push(rhythms[0] as number[]);
      else rhythms.push(rng.pick(pool));
    }
    const count = rhythms.reduce((s, r) => s + r.length, 0);
    const want = bars === 4 ? Math.round(target * 1.6) : target;
    if (Math.abs(count - want) > (strict ? 2 : 4)) continue;
    const slots = slotsOf(harmony, rhythms);
    // The answer brings bar 1's motif back (bar 3 = bar 1, same chords) in a 4-bar melody.
    const steps = melodyPitches(rng, slots, realism, new Map());
    if (!steps || (strict && !lively(steps))) continue;
    if (opts.requireNct && !hasNct(slots, steps)) continue;
    if (bars === 4) {
      const n0 = (rhythms[0] as number[]).length;
      const n1 = (rhythms[1] as number[]).length;
      const copy = new Map<number, number>();
      for (let i = 0; i < n0; i++) {
        copy.set(i, steps[i] as number);
        copy.set(n0 + n1 + i, steps[i] as number);
      }
      const again = melodyPitches(rng, slots, realism, copy);
      if (!again || (strict && !lively(again))) continue;
      made = { harmony: harmony.map((h) => [...h]), rhythms, steps: again };
    } else made = { harmony: harmony.map((h) => [...h]), rhythms, steps };
  }
  return made;
}

/** A weak-beat note outside its chord, approached and left by step: a passing or neighbour tone. */
function hasNct(slots: readonly Slot[], steps: readonly number[]): boolean {
  return slots.some((s, i) => {
    if (s.strong || i === 0 || i === steps.length - 1) return false;
    const p = steps[i] as number;
    if (chordSteps(s.chord).includes(mod(p, 7))) return false;
    return Math.abs(p - (steps[i - 1] as number)) === 1 && Math.abs(p - (steps[i + 1] as number)) === 1;
  });
}

// --- the generator ------------------------------------------------------------------------------

/**
 * One ladder item: L1 to L4 at realism R0 to R4, deterministic in (level, realism, seed, profile range,
 * completed features).
 */
export function generateLadderPiece(
  level: LadderLevelNo,
  realism: LadderRealism,
  seed: number,
  profile: LearnerProfile,
  opts: LadderOptions = {},
): LadderPiece {
  const rng = createRng(hashString(`ladder|${level}|${realism}|${seed}`));
  const [tLo, tHi] = TEMPO[realism];
  const bpm = rng.int(tLo, tHi);
  const key = rng.pick(ladderKeys(realism));
  const flavour: LadderFlavour = realism >= 2 && rng.next() < 0.5 ? "jazz-soul" : "pop";
  const sounds = SOUNDS[flavour];
  const swung = flavour === "jazz-soul";
  const vocalLead = level === 4 && realism >= 4 ? rng.pick(["tenor", "choir"] as const) : null;
  const base = { level, realism, seed, bpm, meter: "4/4" as MeterId, key, flavour };
  const swing: SwingSpec | null = swung ? { subdivision: 8, amount: 1 / 3 } : null;

  if (level === 1) {
    const bars = realism >= 3 ? 4 : 2;
    const tf = trackFeature(rng, level, realism, opts);
    if (tf) {
      const groove = trackDrums(rng, tf, realism, bars);
      const piece = buildPiece({ bpm, bars, tracks: groove.tracks });
      const answer = buildPiece({
        bpm,
        bars,
        tracks: groove.tracks.map(({ bank: _b, gain: _g, ...t }) => t),
      }).code;
      return {
        ...base,
        flavour: groove.flavour,
        code: piece.code,
        events: piece.events,
        cps: piece.cps,
        bars,
        preload: piece.preload,
        pickup: null,
        swing: groove.swung ? { subdivision: 8, amount: 1 / 3 } : null,
        given: { bpm, meter: "4/4", key, pickup: null, bars, sounds: groove.sounds, chordsPerBar: null },
        target: groove.tracks.map((t) => t.label),
        stages: null,
        answer,
        stageAnswers: null,
        chords: null,
        degrees: null,
        performance: { target: groove.tracks[0]?.label ?? "drums", swung: groove.swung, vocalLead: null },
        feature: tf,
        title: `${TRACK_TITLES[tf]} · ${bars} bars`,
      };
    }
    const drums = drumPart(rng, realism, bars, { pickupBar: false, flavour });
    const piece = buildPiece({ bpm, bars, tracks: drums.tracks });
    const answer = buildPiece({
      bpm,
      bars,
      tracks: drums.tracks.map(({ bank: _b, gain: _g, ...t }) => t),
    }).code;
    return {
      ...base,
      code: piece.code,
      events: piece.events,
      cps: piece.cps,
      bars,
      preload: piece.preload,
      pickup: null,
      swing,
      given: { bpm, meter: "4/4", key, pickup: null, bars, sounds: drums.sounds, chordsPerBar: null },
      target: drums.tracks.map((t) => t.label),
      stages: null,
      answer,
      stageAnswers: null,
      chords: null,
      degrees: null,
      performance: { target: "kick", swung, vocalLead: null },
      title: `Drum loop · ${bars} bars`,
    };
  }

  if (level === 2 || level === 3) {
    const tf = trackFeature(rng, level, realism, opts);
    // A jazz loop of the chosen feature (or, under a walking bass, any jazz loop the learner has met).
    const jazzPool = JAZZ_LOOPS.filter(
      (l) => feature(opts, l.feature) && (tf === "walking" || l.feature === tf),
    );
    const loopChords: readonly RnChord[] =
      tf && jazzPool.length > 0
        ? rng.pick(jazzPool).chords
        : rng.pick(LADDER_LOOPS.filter((l) => l.from <= realism)).chords;
    const chords = [...loopChords];
    const bars = chords.length;
    // Figures with an octave keep the roots low enough for the octave to stay a bass note (≤ A3).
    const roots = bassRoots(chords, key, realism >= 2 || tf === "walking" ? 45 : 50);
    const bassNodes = roots.map((r, i) => {
      const next = roots[(i + 1) % roots.length] as number;
      if (tf !== "walking") return bassBar(rng, r, next, realism);
      // Up from a root low enough that its 5th stays under A2, down from a higher one.
      const high = stepToMidi(r + 4, key, 2) <= 45 ? r + 4 : r;
      const walk = walkingBar(r, next, rng, high);
      // Never under E1: approach a low root from above.
      if (stepToMidi(walk[3] as number, key, 2) < 28) walk[3] = next + 1;
      return seq(walk.map((x) => atom(String(x))));
    });
    const bassTrack: TrackSpec = {
      label: "bass",
      src: "n",
      pat: { t: "alt", items: bassNodes },
      key,
      octave: 2,
      s: level === 2 && realism >= 3 ? "upright" : sounds.bass,
      ...(realism >= 3 && level === 2 ? { gain: 0.5 } : {}),
    };
    const tracks: TrackSpec[] = [];
    const wantDrums = realism >= 2;
    if (wantDrums)
      tracks.push(...drumPart(rng, realism, bars, { pickupBar: false, flavour, gain: 0.7 }).tracks);
    // Seventh chords sound as sevenths (a jazz loop's Rhodes); the U06 loops as close triads.
    const sevenths = chords.some((c) => CHORD_TONES[c.quality].semis.length === 4);
    const voices = sevenths
      ? voiceProgression(chords, key).map((v) => spellVoiced(v, key).slice(1))
      : chordVoices(chords, key);
    const wantChords = level === 3 || realism >= 3;
    if (wantChords)
      tracks.push({
        label: "chords",
        src: "note",
        // L3's chords hold for the bar (the harmonic rhythm is given: one chord a bar); L2's comp from R3.
        pat: {
          t: "alt",
          items: voices.map((v) => (level === 3 ? seq([chordOf(v)]) : compBar(rng, v, realism))),
        },
        s: level === 3 && realism === 0 ? "piano" : sounds.chords,
        gain: level === 3 && realism >= 3 ? 0.3 : 0.45,
      });
    tracks.push(bassTrack);
    if (level === 3 && realism >= 4) {
      // A lead line on top: the loop's chord tones, a decoy the ear must look past.
      const lead = chords.map((c) => seq([atom(rootStep(c) + 2 + 7), atom(rootStep(c) + 4 + 7)], [3, 1]));
      tracks.push({
        label: "mel",
        src: "n",
        pat: { t: "alt", items: lead },
        key,
        octave: 4,
        s: sounds.lead,
        gain: 0.5,
      });
    }
    const piece = buildPiece({ bpm, bars, tracks });
    const bassText = altText(bassNodes.map((n) => printNode(n)));
    const bassAnswer = `setcpm(${bpm}/4)\n\nbass: n("${bassText}").scale("${key.tonic}2:major").s("${sounds.bass}")`;
    const info = chords.map((c, i) => chordInfo(c, key, i + 1));
    const chordAnswer = `chords: n("${sevenths ? "[0,2,4,6]" : "[0,2,4]"}").add(n("<${chords.map(rootStep).join(" ")}>")).scale("${key.tonic}3:major").s("piano")`;
    const bassDegrees = piece.events
      .filter((e) => e.track === "bass" && e.midi !== null)
      .map((e) => degreeOfMidi(e.midi as number, key));
    if (level === 2)
      return {
        ...base,
        code: piece.code,
        events: piece.events,
        cps: piece.cps,
        bars,
        preload: piece.preload,
        pickup: null,
        swing,
        given: { bpm, meter: "4/4", key, pickup: null, bars, sounds: null, chordsPerBar: null },
        target: ["bass"],
        stages: null,
        answer: bassAnswer,
        stageAnswers: null,
        chords: null,
        degrees: bassDegrees,
        performance: { target: "bass", swung: swung || tf === "walking", vocalLead: null },
        ...(tf
          ? { feature: tf, swing: { subdivision: 8, amount: 1 / 3 }, flavour: "jazz-soul" as const }
          : {}),
        title: tf === "walking" ? `Walking bass · ${bars} bars` : `Bass line · ${bars} bars`,
      };
    return {
      ...base,
      code: piece.code,
      events: piece.events,
      cps: piece.cps,
      bars,
      preload: piece.preload,
      pickup: null,
      swing,
      given: { bpm, meter: "4/4", key, pickup: null, bars, sounds: null, chordsPerBar: 1 },
      target: ["bass", "chords"],
      stages: ["bass", "quality", "rn"],
      answer: `${bassAnswer}\n${chordAnswer}`,
      stageAnswers: {
        bass: bassAnswer,
        quality: `${bassAnswer}\n${chordAnswer}`,
        rn: `${bassAnswer}\n${chordAnswer}`,
      },
      chords: info,
      degrees: bassDegrees,
      performance: { target: "chords", swung: swung || tf !== null, vocalLead: null },
      ...(tf ? { feature: tf, swing: { subdivision: 8, amount: 1 / 3 }, flavour: "jazz-soul" as const } : {}),
      title: tf ? `${TRACK_TITLES[tf]} · ${bars} bars` : `Four-chord loop · ${bars} bars`,
    };
  }

  // L4: a short melody.
  const bars = realism >= 3 ? 4 : 2;
  const made = composeTune(rng, bars as 2 | 4, realism);
  if (!made) throw new Error(`ladder L4: no melody for seed ${seed} at R${realism}`);
  const { harmony, rhythms, steps } = made;
  // A one-beat pickup (U07.L08): 5 below home into 1, or a step into the first note.
  const withPickup = feature(opts, "pickup") && realism >= 2 && rng.next() < 0.5;
  const first = steps[0] as number;
  const pickupStep = first === 0 ? -3 : first === 7 ? 4 : first - 1;
  const octave = melodyOctave(key, profile, withPickup ? [...steps, pickupStep] : steps);
  const melBars: Node[] = [];
  let i = 0;
  for (const r of rhythms) {
    melBars.push(melodyBarNode(steps.slice(i, i + r.length), r));
    i += r.length;
  }
  const pickupBar = seq([rest, rest, rest, atom(pickupStep)]);
  const allMel = withPickup ? [pickupBar, ...melBars] : melBars;
  const cycles = allMel.length;
  const lead = (nodes: Node[]): Node => ({ t: "alt", items: withPickup ? [seq([rest]), ...nodes] : nodes });
  const tracks: TrackSpec[] = [];
  if (realism >= 3)
    tracks.push(...drumPart(rng, realism, bars, { pickupBar: withPickup, flavour, gain: 0.6 }).tracks);
  if (realism >= 2) {
    const roots = bassRoots(harmony.flat(), key);
    let r = 0;
    const bassNodes = harmony.map((h) => seq(h.map(() => atom(roots[r++] as number))));
    tracks.push({ label: "bass", src: "n", pat: lead(bassNodes), key, octave: 2, s: sounds.bass, gain: 0.6 });
  }
  if (realism >= 1) {
    const flat = harmony.flat();
    // Under the tune, not over it: the chords centre a 5th below the melody's middle.
    const voices = chordVoices(flat, key, Math.max(55, tonicMidi(key.tonic, octave) + 6 - 7));
    let k = 0;
    const chordNodes = harmony.map((h) => seq(h.map(() => chordOf(voices[k++] as string[]))));
    tracks.push({
      label: "chords",
      src: "note",
      pat: lead(chordNodes),
      s: sounds.chords,
      gain: realism >= 3 ? 0.35 : 0.4,
    });
  }
  const leadSound = vocalLead ?? (realism >= 2 ? sounds.lead : "piano");
  tracks.push({ label: "mel", src: "n", pat: { t: "alt", items: allMel }, key, octave, s: leadSound });
  const piece = buildPiece({ bpm, bars: cycles, tracks });
  const pickup: PickupSpec | null = withPickup ? { units: rat(1, 1) } : null;
  const melText = `<${allMel.map(printNode).join(" ")}>`;
  const answer = `setcpm(${bpm}/4)\n\nmel: n("${melText}").scale("${key.tonic}${octave}:major").s("piano")`;
  const degrees = piece.events
    .filter((e) => e.track === "mel" && e.midi !== null)
    .map((e) => degreeOfMidi(e.midi as number, key));
  return {
    ...base,
    code: piece.code,
    events: piece.events,
    cps: piece.cps,
    bars: cycles,
    preload: piece.preload,
    pickup,
    swing,
    given: { bpm, meter: "4/4", key, pickup, bars, sounds: null, chordsPerBar: null },
    target: ["mel"],
    stages: null,
    answer,
    stageAnswers: null,
    chords: null,
    degrees,
    performance: { target: "mel", swung, vocalLead },
    title: `Short melody · ${bars} bars${withPickup ? " with a pickup" : ""}`,
  };
}

function printNode(n: Node): string {
  const t = printPat(n).text;
  // A bar printed bare at the top level needs brackets inside `< >`.
  return n.t === "seq" && (n.items.length > 1 || n.w) ? `[${t}]` : t;
}
