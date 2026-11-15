// Wave 7 seam (docs/design/wave7.md §3.1): the advanced tracks. JAZZ — chord symbols with extensions and
// alterations from the one chord table, ii–V–I in all twelve keys (major and minor), chord-scales, available
// tensions and avoid notes, voicing types recognised from sounding notes (octave-aware), turnarounds, the jazz
// blues, rhythm changes and the reharmonisation devices. RHYTHM — metric weight and syncopation, swing ratio and
// amount, displacement, microtiming from `.late()`, odd-meter groupings, hemiola, polyrhythm and polymeter periods,
// Euclidean identity, tresillo, cinquillo and clave. SOUND — the harmonics a control leaves, register roles and the
// low-interval limits, a density measure.
//
// Facts here are conventions a lesson may teach as "a common choice", never laws (w7plan B2): a chord-scale is the
// usual first choice for a chord in a context, and an avoid note is a tone that clashes when HELD over the chord;
// the grader weighs duration and resolution before it calls a tension wrong.
import type { ChordQuality, KeySpec, MeterId, MeterSpec, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import { chordOf, chordPcs, parseChordSymbol, toCode, toJazzGlyph, toLeadSheet } from "./chords.ts";
import { METERS } from "./meters.ts";
import { euclid, onsetsOf } from "./rhythm.ts";
import { scaleNotes } from "./scales.ts";
import type { ChordId, Pc } from "./types.ts";

const mod12 = (n: number): Pc => (((n % 12) + 12) % 12) as Pc;
const asChord = (c: ChordId | string): ChordId => {
  if (typeof c !== "string") return c;
  const p = parseChordSymbol(c);
  if (!p) throw new RangeError(`@oak/theory: not a chord symbol: "${c}"`);
  return p;
};

// --- JAZZ: symbols ---------------------------------------------------------------------------------------------

/** The extensions and alterations the jazz track names (contracts §2.6 J1.L02, J2.L02–L03). */
export const JAZZ_TENSION_LABELS = ["6", "9", "11", "13", "sus", "b9", "#9", "#11", "b13", "alt"] as const;
export type JazzTensionLabel = (typeof JAZZ_TENSION_LABELS)[number];

/**
 * The chord qualities the jazz track reads and writes, in teaching order. Every one is a row of the single chord
 * table (`chord-table.ts`): the three spellings below are that row's, never a second table.
 */
export const JAZZ_QUALITIES: readonly ChordQuality[] = [
  "maj7",
  "m7",
  "7",
  "m7b5",
  "dim7",
  "6",
  "m6",
  "sus4",
  "7sus4",
  "69",
  "maj9",
  "m9",
  "9",
  "m11",
  "13",
  "7b9",
  "7#9",
  "7#11",
  "7b13",
  "7alt",
  "maj7#11",
  "mMaj7",
];

export interface JazzSymbol {
  chord: ChordId;
  /** iReal / Strudel code spelling, what `chord()` takes: "C^7", "Cm7b5", "G7alt". */
  ireal: string;
  /** Lead-sheet display: "Cmaj7", "Cm7♭5". */
  leadSheet: string;
  /** Jazz glyphs: "C∆7", "Cø7", "C–7". */
  glyph: string;
  /** Tensions written in the symbol above the seventh chord: ["9", "13"], ["b9"], ["alt"]. */
  extensions: JazzTensionLabel[];
}

const QUALITY_TENSIONS: Partial<Record<ChordQuality, JazzTensionLabel[]>> = {
  "6": ["6"],
  m6: ["6"],
  "69": ["6", "9"],
  sus4: ["sus"],
  "7sus4": ["sus"],
  "9": ["9"],
  maj9: ["9"],
  m9: ["9"],
  m11: ["9", "11"],
  "13": ["9", "13"],
  "7b9": ["b9"],
  "7#9": ["#9"],
  "7#11": ["#11"],
  "7b13": ["b13"],
  "7alt": ["alt"],
  "maj7#11": ["#11"],
};

/** One chord in the three spellings of the one table, with the tensions its symbol names. */
export function jazzSymbol(chord: ChordId | string): JazzSymbol {
  const c = asChord(chord);
  return {
    chord: c,
    ireal: toCode(c),
    leadSheet: toLeadSheet(c),
    glyph: toJazzGlyph(c),
    extensions: [...(QUALITY_TENSIONS[c.quality] ?? [])],
  };
}

// --- JAZZ: ii–V–I --------------------------------------------------------------------------------------------

/** The twelve major tonics around the cycle of fourths from C, spelled with the fewest accidentals. */
export const FOURTHS_MAJOR = ["C", "F", "Bb", "Eb", "Ab", "Db", "Gb", "B", "E", "A", "D", "G"] as const;
/** The twelve minor tonics around the cycle of fourths from C (D♭ minor → C♯ minor, G♭ minor → F♯ minor). */
export const FOURTHS_MINOR = ["C", "F", "Bb", "Eb", "Ab", "C#", "F#", "B", "E", "A", "D", "G"] as const;

export type CadenceMode = "major" | "minor";
export interface TwoFiveOne {
  key: KeySpec;
  mode: CadenceMode;
  chords: [ChordId, ChordId, ChordId];
  /** Code spellings: ["Dm7", "G7", "C^7"]; ["Dm7b5", "G7alt", "Cm7"]. */
  symbols: [string, string, string];
  rn: [string, string, string];
}

/**
 * ii7–V7–Imaj7 in a major key; iiø7–V7alt–i in a minor key (contracts §2.6 J1.L03, J2.L02). The minor tonic is a
 * minor seventh by default (`tonic: "m6"` or `"mMaj7"` for the other common endings); `dominant: "7b9"` gives the
 * plainer altered dominant J2.L02 may start from (w7plan B1: one altered dominant first).
 */
export function twoFiveOne(
  tonic: string,
  mode: CadenceMode = "major",
  opts: { tonic?: "m7" | "m6" | "mMaj7"; dominant?: "7alt" | "7b9" | "7" } = {},
): TwoFiveOne {
  const key: KeySpec = { tonic, mode: mode === "major" ? "major" : "minor" };
  const notes = scaleNotes(key);
  const [i, ii, v] = [notes[0], notes[1], notes[4]] as [string, string, string];
  const chords: [ChordId, ChordId, ChordId] =
    mode === "major"
      ? [chordOf(ii, "m7"), chordOf(v, "7"), chordOf(i, "maj7")]
      : [chordOf(ii, "m7b5"), chordOf(v, opts.dominant ?? "7alt"), chordOf(i, opts.tonic ?? "m7")];
  return {
    key,
    mode,
    chords,
    symbols: chords.map((c) => toCode(c)) as [string, string, string],
    rn: mode === "major" ? ["ii7", "V7", "Imaj7"] : ["iiø7", "V7", "i7"],
  };
}

/** The ii–V–I in all twelve keys around the cycle of fourths (J2.L01 and the twelve-key practice after it). */
export function twoFiveOnesAllKeys(mode: CadenceMode = "major"): TwoFiveOne[] {
  return (mode === "major" ? FOURTHS_MAJOR : FOURTHS_MINOR).map((t) => twoFiveOne(t, mode));
}

/** A major ii–V (m7 then 7 a fourth above, or m7b5 then a dominant) and the tonic it points to. */
export function twoFiveTarget(
  ii: ChordId | string,
  v: ChordId | string,
): { tonicPc: Pc; mode: CadenceMode } | null {
  const a = asChord(ii);
  const b = asChord(v);
  if (mod12(b.rootPc - a.rootPc) !== 5) return null;
  const dominant = ["7", "9", "13", "7b9", "7#9", "7#11", "7b13", "7alt", "7sus4"].includes(b.quality);
  if (!dominant) return null;
  if (["m7", "m9", "m11"].includes(a.quality)) return { tonicPc: mod12(b.rootPc + 5), mode: "major" };
  if (a.quality === "m7b5") return { tonicPc: mod12(b.rootPc + 5), mode: "minor" };
  return null;
}

// --- JAZZ: chord-scales, tensions, avoid notes ---------------------------------------------------------------

/** Scales the jazz track names as chord-scales, as semitones above the chord root. */
export const CHORD_SCALES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  "locrian-nat2": [0, 2, 3, 5, 6, 8, 10],
  "melodic-minor": [0, 2, 3, 5, 7, 9, 11],
  "lydian-dominant": [0, 2, 4, 6, 7, 9, 10],
  altered: [0, 1, 3, 4, 6, 8, 10],
  "half-whole": [0, 1, 3, 4, 6, 7, 9, 10],
  "whole-half": [0, 2, 3, 5, 6, 8, 9, 11],
  "phrygian-dominant": [0, 1, 4, 5, 7, 8, 10],
} as const satisfies Record<string, readonly number[]>;
export type ChordScaleId = keyof typeof CHORD_SCALES;
export const CHORD_SCALE_NAMES: Readonly<Record<ChordScaleId, string>> = {
  ionian: "Ionian (major)",
  dorian: "Dorian",
  phrygian: "Phrygian",
  lydian: "Lydian",
  mixolydian: "Mixolydian",
  aeolian: "Aeolian (natural minor)",
  locrian: "Locrian",
  "locrian-nat2": "Locrian ♮2",
  "melodic-minor": "melodic minor",
  "lydian-dominant": "Lydian dominant",
  altered: "altered",
  "half-whole": "half-whole diminished",
  "whole-half": "whole-half diminished",
  "phrygian-dominant": "Phrygian dominant",
};

/**
 * The usual first chord-scale for a chord, then the common alternatives (J2.L04: Dorian, Mixolydian, Ionian,
 * Lydian per chord). Context changes the first choice: a minor seventh that is the iii or vi of `key` reads
 * Phrygian or Aeolian; a dominant resolving to a minor chord (`next`) reads Phrygian dominant.
 */
export function chordScales(
  chord: ChordId | string,
  ctx: { key?: KeySpec; next?: ChordId | string } = {},
): ChordScaleId[] {
  const c = asChord(chord);
  const next = ctx.next ? asChord(ctx.next) : null;
  const toMinor = next ? ["m7", "m6", "m9", "m11", "min", "mMaj7", "m7b5"].includes(next.quality) : false;
  const keyPc = ctx.key ? (parseChordSymbol(ctx.key.tonic)?.rootPc ?? null) : null;
  const deg = keyPc === null ? null : mod12(c.rootPc - keyPc);
  switch (c.quality) {
    case "maj7":
    case "maj9":
    case "6":
    case "69":
    case "maj":
      return deg === 5 ? ["lydian", "ionian"] : ["ionian", "lydian"];
    case "maj7#11":
      return ["lydian"];
    case "m7":
    case "m9":
    case "m11":
    case "min":
      if (deg === 4) return ["phrygian", "dorian", "aeolian"];
      if (deg === 9) return ["aeolian", "dorian"];
      return ["dorian", "aeolian"];
    case "m6":
    case "mMaj7":
      return ["melodic-minor", "dorian"];
    case "m7b5":
      return ["locrian", "locrian-nat2"];
    case "dim7":
    case "dim":
      return ["whole-half"];
    case "7alt":
      // "alt" names the altered scale: no natural 9, 5 or 13 (w7plan B2).
      return ["altered"];
    case "7#9":
      return ["half-whole", "altered"];
    case "7b9":
      return toMinor
        ? ["phrygian-dominant", "half-whole", "altered"]
        : ["half-whole", "phrygian-dominant", "altered"];
    case "7b13":
      return ["phrygian-dominant", "altered"];
    case "7#11":
      return ["lydian-dominant"];
    case "7sus4":
    case "sus4":
      return ["mixolydian", "dorian"];
    default:
      return toMinor
        ? ["phrygian-dominant", "mixolydian", "altered"]
        : ["mixolydian", "lydian-dominant", "altered"];
  }
}

const TENSION_OF_SEMIS: Readonly<Record<number, string>> = {
  10: "b7",
  11: "7",
  1: "b9",
  2: "9",
  3: "#9",
  5: "11",
  6: "#11",
  8: "b13",
  9: "13",
};

export interface Tension {
  /** "9", "b9", "#11", "13"; a sixth on a chord with no seventh is "6"; a fourth on a sus chord is a chord tone. */
  label: string;
  /** Semitones above the root, 0–11. */
  semis: number;
  pc: Pc;
  /** Sits a half step above a chord tone: clashes when held over the chord (it is fine passing or resolving). */
  avoid: boolean;
}

/**
 * The tones of a chord-scale that are not chord tones, as tensions over the chord, and which of them are avoid
 * notes by the half-step convention (a scale tone a half step above a chord tone; on a dominant the 11 over the 3rd,
 * on a major seventh the 11, in Phrygian the ♭9). The convention, not a law: a held avoid note is the clash the
 * grader names; a passing or resolving one is not (w7plan B2).
 */
export function tensionsOf(chord: ChordId | string, scale?: ChordScaleId): Tension[] {
  const c = asChord(chord);
  const sc: readonly number[] = CHORD_SCALES[scale ?? (chordScales(c)[0] as ChordScaleId)];
  const core = seventhCoreOf(c.quality);
  // Chord tones the scale holds (the altered scale has no 5th: over G7alt the ♭13 is a tension, not a clash).
  const inScale = new Set(sc.map((x) => mod12(x)));
  const tones = new Set(
    chordPcs({ ...c, quality: core })
      .map((pc) => mod12(pc - c.rootPc))
      .filter((x) => x === 0 || inScale.has(x)),
  );
  const dominant = core === "7";
  const out: Tension[] = [];
  for (const s of sc) {
    if (tones.has(mod12(s))) continue;
    const label =
      s === 9 && !hasSeventh(c.quality) ? "6" : s === 4 ? "3" : (TENSION_OF_SEMIS[s] ?? String(s));
    // A dominant's ♭9 and ♭13 are its colours, never avoid notes; its one avoid note is the 11 over the 3rd. A sus
    // chord's 3rd cancels the suspension.
    const avoid = dominant
      ? s === 5 && tones.has(4)
      : core === "sus4" || core === "7sus4"
        ? s === 4
        : tones.has(mod12(s - 1));
    out.push({ label, semis: s, pc: mod12(c.rootPc + s), avoid });
  }
  return out;
}

/** The tensions over a chord the learner may hold: `tensionsOf` without the avoid notes. */
export function availableTensions(chord: ChordId | string, scale?: ChordScaleId): Tension[] {
  return tensionsOf(chord, scale).filter((t) => !t.avoid);
}

function hasSeventh(q: ChordQuality): boolean {
  return !["maj", "min", "dim", "aug", "sus2", "sus4", "6", "m6", "69", "add9"].includes(q);
}
/** The chord tones a tension is measured against: the seventh chord under the extensions (G13 → G7). */
function seventhCoreOf(q: ChordQuality): ChordQuality {
  if (["9", "13", "7b9", "7#9", "7#11", "7b13", "7alt"].includes(q)) return "7";
  if (["maj9", "maj7#11"].includes(q)) return "maj7";
  if (["m9", "m11"].includes(q)) return "m7";
  if (q === "69") return "6";
  return q;
}

// --- JAZZ: voicing types from sounding notes (octave-aware) --------------------------------------------------

export const VOICING_TYPES = [
  "guide-tones",
  "shell",
  "rootless-a",
  "rootless-b",
  "close",
  "drop-2",
  "spread",
  "other",
] as const;
export type VoicingType = (typeof VOICING_TYPES)[number];

export interface VoicingReading {
  type: VoicingType;
  /** The chord-tone role of each sounding note, lowest first: "1" "3" "5" "7" "9" "13" … */
  roles: string[];
  /** Root absent from the sounding notes. */
  rootless: boolean;
  /** Lowest to highest note, in semitones. */
  span: number;
}

const ROLE_OF_SEMIS: Readonly<Record<number, string>> = {
  0: "1",
  1: "b9",
  2: "9",
  3: "b3",
  4: "3",
  5: "11",
  6: "b5",
  7: "5",
  8: "b13",
  9: "13",
  10: "b7",
  11: "7",
};

/**
 * What kind of voicing a set of sounding MIDI notes is over a chord (contracts §6.7; w7plan B3: octave-aware, never
 * by pitch-class set alone):
 * - `guide-tones`: only the 3rd and the 7th; `shell`: the root lowest with the 3rd and the 7th (or 6th), nothing else;
 * - `rootless-a`: no root, four notes, the 3rd lowest (3–5–7–9, on a dominant 3–13–7–9);
 * - `rootless-b`: no root, four notes, the 7th lowest (7–9–3–5, on a dominant 7–9–3–13);
 * - `close`: four or more notes within an octave, each the next chord tone up;
 * - `drop-2`: four notes whose lowest, raised an octave, gives a close voicing (the 2nd from the top dropped);
 * - `spread`: the root lowest and the rest more than an octave above it in open spacing;
 * - `other`: anything else (a dictionary voicing need not be any of these: w7plan A2).
 */
export function voicingType(midis: readonly number[], chord: ChordId | string): VoicingReading {
  const c = asChord(chord);
  const ns = [...new Set(midis.map((m) => Math.round(m)))].sort((a, b) => a - b);
  const roles = ns.map((m) => ROLE_OF_SEMIS[mod12(m - c.rootPc)] ?? "?");
  const span = ns.length > 0 ? (ns.at(-1) as number) - (ns[0] as number) : 0;
  const rootless = !roles.includes("1");
  const is3 = (r: string) => r === "3" || r === "b3";
  const is7 = (r: string) => r === "7" || r === "b7" || (c.quality === "dim7" && r === "13") || r === "13";
  const reading = (type: VoicingType): VoicingReading => ({ type, roles, rootless, span });
  const set = new Set(roles);
  if (ns.length === 2 && roles.some(is3) && roles.some((r) => r === "7" || r === "b7"))
    return reading("guide-tones");
  if (ns.length === 3 && roles[0] === "1" && roles.slice(1).some(is3) && roles.slice(1).some(is7))
    return reading("shell");
  if (
    ns.length === 4 &&
    rootless &&
    set.size === 4 &&
    roles.some(is3) &&
    roles.some((r) => r === "7" || r === "b7")
  ) {
    if (is3(roles[0] as string) && span <= 12) return reading("rootless-a");
    if ((roles[0] === "7" || roles[0] === "b7") && span <= 12) return reading("rootless-b");
  }
  if (ns.length >= 4 && isClose(ns, c)) return reading("close");
  if (ns.length === 4) {
    // Undo the drop: the lowest note an octave up must give a close voicing AND land second from the top.
    const raised = (ns[0] as number) + 12;
    const back = [...ns.slice(1), raised].sort((a, b) => a - b);
    if (back[2] === raised && isClose(back, c)) return reading("drop-2");
  }
  if (ns.length >= 3 && roles[0] === "1" && span > 12 && (ns[1] as number) - (ns[0] as number) >= 7)
    return reading("spread");
  return reading("other");
}

/** Every note the next chord tone up from the one below, within an octave. */
function isClose(ns: readonly number[], c: ChordId): boolean {
  if (ns.length < 3 || (ns.at(-1) as number) - (ns[0] as number) >= 12) return false;
  const tones = [...new Set(chordPcs(c))].map((pc) => mod12(pc - c.rootPc)).sort((a, b) => a - b);
  for (let i = 1; i < ns.length; i++) {
    const a = mod12((ns[i - 1] as number) - c.rootPc);
    const b = mod12((ns[i] as number) - c.rootPc);
    const ia = tones.indexOf(a);
    if (ia < 0 || tones[(ia + 1) % tones.length] !== b) return false;
  }
  return true;
}

/** A close voicing with its 2nd-from-top note dropped an octave: C4 E4 G4 B4 → G3 C4 E4 B4. */
export function drop2(close: readonly number[]): number[] {
  const ns = [...close].sort((a, b) => a - b);
  if (ns.length < 4) throw new RangeError("@oak/theory: drop-2 needs four notes");
  const i = ns.length - 2;
  return [(ns[i] as number) - 12, ...ns.slice(0, i), ...ns.slice(i + 1)].sort((a, b) => a - b);
}

/**
 * A rootless voicing written out (J3.L01: the A and B forms are taught as note structures first, then compared
 * with what `dict("lefthand")` gives; `mode("duck")` only drops notes equal to the anchor, never the root — w7plan
 * A1). `A`: 3–5–7–9 (dominant 3–13–7–9) from the 3rd at or above `low`; `B`: 7–9–3–5 (dominant 7–9–3–13).
 */
export function rootlessVoicing(chord: ChordId | string, form: "A" | "B", low = 52): number[] {
  const c = asChord(chord);
  const q = c.quality;
  const dominant = ["7", "9", "13", "7b9", "7#9", "7#11", "7b13", "7alt"].includes(q);
  const third = ["m7", "m9", "m11", "m7b5", "dim7", "m6", "mMaj7"].includes(q) ? 3 : 4;
  const seventh =
    q === "dim7"
      ? 9
      : ["maj7", "maj9", "mMaj7", "maj7#11"].includes(q)
        ? 11
        : q === "6" || q === "m6"
          ? 9
          : 10;
  const fifth = q === "m7b5" || q === "dim7" ? 6 : 7;
  const nine = q === "7b9" || q === "7alt" ? 1 : q === "7#9" ? 3 : 2;
  const top = dominant ? 9 : fifth;
  const steps = form === "A" ? [third, dominant ? 9 : fifth, seventh, nine] : [seventh, nine, third, top];
  const first = low + mod12(c.rootPc + (steps[0] as number) - low);
  const out = [first];
  for (const s of steps.slice(1)) {
    const prev = out.at(-1) as number;
    out.push(prev + (mod12(c.rootPc + s - prev) || 12));
  }
  return out;
}

/** A shell voicing: the root at `bass` (MIDI), then the 3rd and the 7th (`1-3-7`) or the 7th and the 3rd (`1-7-3`). */
export function shellVoicing(
  chord: ChordId | string,
  form: "1-3-7" | "1-7-3" = "1-3-7",
  bass = 43,
): number[] {
  const c = asChord(chord);
  const root = bass + mod12(c.rootPc - bass);
  const third = ["m7", "m9", "m11", "m7b5", "dim7", "m6", "mMaj7", "min"].includes(c.quality) ? 3 : 4;
  const seventh =
    c.quality === "dim7" || c.quality === "6" || c.quality === "m6"
      ? 9
      : ["maj7", "maj9", "mMaj7", "maj7#11"].includes(c.quality)
        ? 11
        : 10;
  return form === "1-3-7"
    ? [root, root + third + 12, root + seventh + 12]
    : [root, root + seventh, root + third + 12];
}

// --- JAZZ: forms -----------------------------------------------------------------------------------------------

/** One bar of a chart: the chords in it, in order (one or two per bar in the jazz track's charts). */
export type ChartBar = string[];

/** I–vi–ii–V and iii–VI–ii–V in a major key (J4.L01): one chord a bar, code spellings. */
export function turnaround(tonic: string, kind: "I-vi-ii-V" | "iii-VI-ii-V" = "I-vi-ii-V"): ChartBar[] {
  const n = scaleNotes({ tonic, mode: "major" });
  const at = (i: number) => n[i] as string;
  return kind === "I-vi-ii-V"
    ? [
        [toCode(chordOf(at(0), "maj7"))],
        [toCode(chordOf(at(5), "m7"))],
        [toCode(chordOf(at(1), "m7"))],
        [toCode(chordOf(at(4), "7"))],
      ]
    : [
        [toCode(chordOf(at(2), "m7"))],
        [toCode(chordOf(at(5), "7"))],
        [toCode(chordOf(at(1), "m7"))],
        [toCode(chordOf(at(4), "7"))],
      ];
}

/**
 * A jazz blues (J4.L02, JC2) — one common chart, not the only one: I7 | IV7 | I7 | v7 I7 | IV7 | #iv°7 | I7 | VI7 |
 * ii7 | V7 | I7 VI7 | ii7 V7. In F: F7 B♭7 F7 Cm7 F7 B♭7 B°7 F7 D7 Gm7 C7 F7 D7 Gm7 C7.
 */
export function jazzBlues(tonic = "F"): ChartBar[] {
  const n = scaleNotes({ tonic, mode: "major" });
  const at = (i: number) => n[i] as string;
  const c = (root: string, q: ChordQuality) => toCode(chordOf(root, q));
  const sharp4 = respell(mod12((parseChordSymbol(tonic)?.rootPc ?? 0) + 6), "sharp");
  return [
    [c(at(0), "7")],
    [c(at(3), "7")],
    [c(at(0), "7")],
    [c(at(4), "m7"), c(at(0), "7")],
    [c(at(3), "7")],
    [c(sharp4, "dim7")],
    [c(at(0), "7")],
    [c(at(5), "7")],
    [c(at(1), "m7")],
    [c(at(4), "7")],
    [c(at(0), "7"), c(at(5), "7")],
    [c(at(1), "m7"), c(at(4), "7")],
  ];
}

/** Rhythm changes as jazz plays them: 32 bars, AABA (J4.L03, JC3). The 1930 chorus of I Got Rhythm is 34 bars. */
export const RHYTHM_CHANGES_BARS = 32;
export const I_GOT_RHYTHM_ORIGINAL_BARS = 34;

/**
 * Rhythm changes in a major key (default B♭): A1 and A2 end on a turnaround, the bridge is III7 VI7 II7 V7 two bars
 * each (in B♭: D7 G7 C7 F7), the last A ends on the tonic. One common set of A changes; JC3 accepts the usual
 * variants (its rule is the grader's).
 */
export function rhythmChanges(tonic = "Bb"): { sections: ["A", "A", "B", "A"]; bars: ChartBar[] } {
  const n = scaleNotes({ tonic, mode: "major" });
  const at = (i: number) => n[i] as string;
  const c = (root: string, q: ChordQuality) => toCode(chordOf(root, q));
  const tPc = parseChordSymbol(tonic)?.rootPc ?? 10;
  const edim = respell(mod12(tPc + 6), "sharp");
  const a = (last: boolean): ChartBar[] => [
    [c(at(0), "maj7"), c(at(5), "m7")],
    [c(at(1), "m7"), c(at(4), "7")],
    [c(at(0), "maj7"), c(at(5), "m7")],
    [c(at(1), "m7"), c(at(4), "7")],
    [c(at(4), "m7"), c(at(0), "7")],
    [c(at(3), "maj7"), c(edim, "dim7")],
    last ? [c(at(1), "m7"), c(at(4), "7")] : [c(at(2), "m7"), c(at(5), "7")],
    last ? [c(at(0), "maj7")] : [c(at(1), "m7"), c(at(4), "7")],
  ];
  const d7 = (deg: number) => c(at(deg), "7");
  const bridge: ChartBar[] = [[d7(2)], [d7(2)], [d7(5)], [d7(5)], [d7(1)], [d7(1)], [d7(4)], [d7(4)]];
  return { sections: ["A", "A", "B", "A"], bars: [...a(false), ...a(false), ...bridge, ...a(true)] };
}

// --- JAZZ: reharmonisation devices (J5) -----------------------------------------------------------------------

export const REHARM_DEVICES = [
  "tritone sub",
  "backdoor",
  "secondary ii–V",
  "diminished passing",
  "coltrane",
] as const;
export type ReharmDevice = (typeof REHARM_DEVICES)[number];

/** ♭II7 for V7 (J5.L01): the dominant a tritone away shares its 3rd and 7th. G7 → D♭7. */
export function tritoneSub(dominant: ChordId | string): ChordId {
  const c = asChord(dominant);
  return chordOf(respell(mod12(c.rootPc + 6), "flat"), "7");
}

/** iv7–♭VII7–I (J5.L02). In C: Fm7 B♭7 C^7. */
export function backdoor(tonic: string): [ChordId, ChordId, ChordId] {
  const t = parseChordSymbol(tonic)?.rootPc ?? 0;
  return [
    chordOf(respell(mod12(t + 5), "flat"), "m7"),
    chordOf(respell(mod12(t + 10), "flat"), "7"),
    chordOf(tonic, "maj7"),
  ];
}

/** The ii–V that leads into a chord (J5.L03): into a major target ii7–V7 (into F^7: Gm7 C7), into a minor one iiø7–V7♭9 (into Dm7: Em7♭5 A7♭9). */
export function secondaryTwoFive(target: ChordId | string): [ChordId, ChordId] {
  const t = asChord(target);
  const minorTarget = ["m7", "min", "m6", "m9", "m11", "mMaj7"].includes(t.quality);
  const v = respell(mod12(t.rootPc + 7), "flat");
  const ii = respell(mod12(t.rootPc + 2), "flat");
  return minorTarget ? [chordOf(ii, "m7b5"), chordOf(v, "7b9")] : [chordOf(ii, "m7"), chordOf(v, "7")];
}

/** A diminished seventh between two chords whose roots rise a whole step (C^7 → Dm7: C♯°7). `null` otherwise. */
export function diminishedPassing(from: ChordId | string, to: ChordId | string): ChordId | null {
  const a = asChord(from);
  const b = asChord(to);
  if (mod12(b.rootPc - a.rootPc) !== 2) return null;
  return chordOf(respell(mod12(a.rootPc + 1), "sharp"), "dim7");
}

/** Coltrane changes (J5.L05, enrichment): three tonics a major third apart, each reached by its V7. From B: B^7 D7 G^7 B♭7 E♭^7 F♯7 B^7. */
export function coltraneCycle(tonic = "B"): ChordId[] {
  const t = parseChordSymbol(tonic)?.rootPc ?? 11;
  const out: ChordId[] = [chordOf(tonic, "maj7")];
  for (const k of [8, 4, 0]) {
    const next = mod12(t + k);
    out.push(chordOf(respell(mod12(next + 7), next === 6 || next === 11 ? "sharp" : "flat"), "7"));
    out.push(chordOf(k === 0 ? tonic : respell(next, "flat"), "maj7"));
  }
  return out;
}

/** The names of the twelve pitch classes with sharps or flats (the reharmonisation devices spell by direction). */
function respell(pc: Pc, prefer: "sharp" | "flat"): string {
  const sharp = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const flat = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  return (prefer === "sharp" ? sharp : flat)[pc] as string;
}

// --- RHYTHM: metric weight and syncopation (R1.L01) ----------------------------------------------------------

/**
 * Metric weight of each step of one bar on a grid of `steps` (16 for sixteenths in 4/4): the number of metric levels
 * the step starts (the bar 4, the half bar 3, the beat 2, the 8th 1, the 16th 0 in 4/4). Odd meters weigh their
 * groups (7/8 as 2+2+3: each group start is a beat). Steps must divide the bar evenly into the meter's units.
 */
export function metricWeights(meter: MeterId | MeterSpec, steps = 16): number[] {
  const m = typeof meter === "string" ? METERS[meter] : meter;
  const perUnit = steps / m.unitsPerBar;
  if (!Number.isInteger(perUnit) || perUnit < 1)
    throw new RangeError(`@oak/theory: ${steps} steps do not divide ${m.id} into its ${m.unitsPerBar} units`);
  const out = new Array<number>(steps).fill(0);
  // Beat starts: by grouping in tempo units for /4 meters, in eighths for /8 meters.
  const beatStarts: number[] = [];
  if (m.den === 8 && m.tempoUnit === "eighth") {
    let at = 0;
    for (const g of m.grouping) {
      beatStarts.push(at * perUnit);
      at += g;
    }
  } else for (let u = 0; u < m.unitsPerBar; u++) beatStarts.push(u * perUnit);
  // Levels inside a unit: a compound beat splits in three, then every level in two.
  const divisors: number[] = [];
  let d = perUnit;
  if (m.tempoUnit === "dottedQuarter" && Number.isInteger(d / 3)) {
    d /= 3;
    divisors.push(d);
  }
  while (Number.isInteger(d / 2) && d / 2 >= 1) {
    d /= 2;
    divisors.push(d);
  }
  for (let i = 0; i < steps; i++) out[i] = divisors.filter((x) => x > 1 && i % x === 0).length;
  const top = Math.max(...out) + 1;
  for (const b of beatStarts) out[b] = Math.max(out[b] as number, top);
  // The half bar in an even simple meter.
  if (m.den === 4 && m.unitsPerBar % 2 === 0) out[steps / 2] = top + 1;
  out[0] = top + 2;
  return out;
}

/**
 * Syncopation of one bar of onsets (Longuet-Higgins & Lee): every onset followed by silence on a stronger step
 * before the next onset scores the difference in weight. 0 for a rhythm on the beats.
 */
export function syncopationScore(onsets: readonly boolean[], meter: MeterId | MeterSpec = "4/4"): number {
  const w = metricWeights(meter, onsets.length);
  let total = 0;
  const on = onsetsOf(onsets);
  for (let k = 0; k < on.length; k++) {
    const i = on[k] as number;
    const nextOn = on[k + 1] ?? (on[0] as number) + onsets.length;
    for (let j = i + 1; j < nextOn; j++) {
      const wj = w[j % onsets.length] as number;
      if (wj > (w[i] as number)) {
        total += wj - (w[i] as number);
        break;
      }
    }
  }
  return total;
}

// --- RHYTHM: swing, displacement, microtiming (R1.L02, R1.L05) ------------------------------------------------

/** Long:short ratio of a swung pair from `.swingBy(amount, n)`: (1 + a) / (1 − a). 1/3 → 2 (triplet swing). */
export function swingRatio(amount: number): number {
  if (!(amount >= 0 && amount < 1)) throw new RangeError("@oak/theory: a swing amount is in [0, 1)");
  return (1 + amount) / (1 - amount);
}
/** The swingBy amount for a long:short ratio: (r − 1) / (r + 1). 3:2 → 0.2. */
export function swingAmount(ratio: number): number {
  if (!(ratio >= 1)) throw new RangeError("@oak/theory: a swing ratio is at least 1");
  return (ratio - 1) / (ratio + 1);
}
/**
 * Where the off-beat of each swung pair lands, in cycles, for `subdivision` 8 or 16 in a simple meter: the pair
 * spans one unit (8ths) or half a unit (16ths); the off-beat sits at (1 + a)/2 of it. 4/4, 8ths, a = 1/3: 1/6.
 */
export function swingOffbeat(
  amount: number,
  subdivision: 8 | 16,
  meter: MeterId | MeterSpec = "4/4",
): number {
  const m = typeof meter === "string" ? METERS[meter] : meter;
  const pair = (subdivision === 8 ? 1 : 0.5) / m.unitsPerBar;
  return (pair * (1 + amount)) / 2;
}

/** Onsets displaced by `by` (cycles), wrapped into the bar: a figure moved to another metric place (R1.L05). */
export function displace(onsets: readonly Rat[], by: Rat): Rat[] {
  return onsets.map((o) => R.frac(R.add(o, by))).sort((a, b) => R.cmp(a, b));
}

/** Milliseconds a `.late(cycles)` delays at `bpm` (1 cycle = 1 bar): `.late(1/32)` at 76 BPM in 4/4 ≈ 98.7 ms. */
export function lateMs(cycles: number, bpm: number, meter: MeterId | MeterSpec = "4/4"): number {
  const m = typeof meter === "string" ? METERS[meter] : meter;
  return cycles * (60 / bpm) * m.unitsPerBar * 1000;
}
/** The `.late()` argument (cycles) for a delay in milliseconds at `bpm`. */
export function lateFor(ms: number, bpm: number, meter: MeterId | MeterSpec = "4/4"): number {
  const m = typeof meter === "string" ? METERS[meter] : meter;
  return ms / 1000 / ((60 / bpm) * m.unitsPerBar);
}

// --- RHYTHM: odd meters, hemiola, polyrhythm, polymeter (R2) -------------------------------------------------

export interface MeterGroups {
  meter: MeterId;
  /** Group lengths in the meter's counting unit: 7/8 → [2, 2, 3]. */
  groups: number[];
  /** Where each group starts, in cycles. */
  starts: Rat[];
  /** The count Oak shows: "1 2 | 1 2 | 1 2 3". */
  count: string;
  tempoUnit: MeterSpec["tempoUnit"];
}

/** The groups of an odd meter (5/4, 7/8, 9/8i as 2+2+2+3) with where each starts and how it is counted. */
export function meterGroups(meter: MeterId | MeterSpec): MeterGroups {
  const m = typeof meter === "string" ? METERS[meter] : meter;
  const unit = m.den === 8 ? m.num : m.unitsPerBar;
  let at = 0;
  const starts: Rat[] = [];
  for (const g of m.grouping) {
    starts.push(rat(at, unit));
    at += g;
  }
  const count = m.grouping
    .map((g) => Array.from({ length: g }, (_, i) => String(i + 1)).join(" "))
    .join(" | ");
  return { meter: m.id, groups: [...m.grouping], starts, count, tempoUnit: m.tempoUnit };
}

/** Hemiola over six eighths (R2.L03): 3+3 (6/8: two dotted quarters) against 2+2+2 (3/4: three quarters). */
export function hemiola(): { sixEight: Rat[]; threeFour: Rat[] } {
  return { sixEight: [rat(0), rat(1, 2)], threeFour: [rat(0), rat(1, 3), rat(2, 3)] };
}

/** Two pulses in one span (R2.L04): 3:2 → onsets 0, 1/3, 2/3 against 0, 1/2; the composite grid is lcm(a, b). */
export function polyrhythm(a: number, b: number): { a: Rat[]; b: Rat[]; grid: number; together: Rat[] } {
  if (!(Number.isInteger(a) && Number.isInteger(b) && a > 0 && b > 0))
    throw new RangeError("@oak/theory: a polyrhythm takes two positive integers");
  const on = (n: number) => Array.from({ length: n }, (_, i) => rat(i, n));
  const grid = lcm(a, b);
  const A = on(a);
  const B = on(b);
  return { a: A, b: B, grid, together: A.filter((x) => B.some((y) => R.eq(x, y))) };
}

/**
 * Polymeter (R2.L05, `{ }%n`): a cycle of `length` steps played at `perBar` steps a bar lines up with the bar again
 * after lcm(length, perBar) / perBar bars. `{bd ~ ~}%4` → 3 bars.
 */
export function polymeterPeriod(length: number, perBar: number): number {
  return lcm(length, perBar) / perBar;
}

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}
function lcm(a: number, b: number): number {
  return Math.abs(a * b) / gcd(a, b);
}

// --- RHYTHM: Euclid, tresillo, cinquillo, clave (R3) ----------------------------------------------------------

/** Tresillo E(3,8) and cinquillo E(5,8): onset steps of one bar of eighths. */
export const TRESILLO = [0, 3, 6] as const;
export const CINQUILLO = [0, 2, 3, 5, 6] as const;

/** Which `(k, n, r)` a one-bar onset set is, if any: the smallest rotation that matches. `null` when none does. */
export function euclidIdentity(
  onsets: readonly number[],
  steps: number,
): { pulses: number; steps: number; rotation: number } | null {
  const want = [...new Set(onsets.map((o) => ((o % steps) + steps) % steps))].sort((a, b) => a - b);
  const k = want.length;
  if (k === 0 || k > steps) return null;
  for (let r = 0; r < steps; r++) {
    const got = onsetsOf(euclid(k, steps, r));
    if (got.length === want.length && got.every((x, i) => x === want[i]))
      return { pulses: k, steps, rotation: r };
  }
  return null;
}

export const CLAVE_TYPES = ["son", "rumba"] as const;
export type ClaveType = (typeof CLAVE_TYPES)[number];
export type ClaveDirection = "3-2" | "2-3";

/**
 * Clave on the two-bar eighth grid (16 steps, 8 a bar; contracts §2.6 R3.L02). Son 3-2: bar A 0 3 6, bar B 2 4 →
 * [0, 3, 6, 10, 12]; 2-3 swaps the bars. Rumba moves the three-side's last stroke from step 6 to 7.
 */
export function claveSteps(type: ClaveType, direction: ClaveDirection): number[] {
  const three = type === "son" ? [0, 3, 6] : [0, 3, 7];
  const two = [2, 4];
  return direction === "3-2" ? [...three, ...two.map((s) => s + 8)] : [...two, ...three.map((s) => s + 8)];
}

/** Which clave a two-bar onset set on the 16-step grid is (exactly), or `null`. */
export function claveOf(steps16: readonly number[]): { type: ClaveType; direction: ClaveDirection } | null {
  const want = [...new Set(steps16)].sort((a, b) => a - b).join(",");
  for (const type of CLAVE_TYPES)
    for (const direction of ["3-2", "2-3"] as const)
      if (claveSteps(type, direction).join(",") === want) return { type, direction };
  return null;
}

// --- SOUND: harmonics, registers, density (A1, A2) -----------------------------------------------------------

/** Relative amplitude of harmonic n (1-based) in the four basic waves: saw 1/n; square odd 1/n; triangle odd 1/n². */
export function waveHarmonic(wave: "sine" | "sawtooth" | "square" | "triangle", n: number): number {
  if (n < 1 || !Number.isInteger(n)) return 0;
  switch (wave) {
    case "sine":
      return n === 1 ? 1 : 0;
    case "sawtooth":
      return 1 / n;
    case "square":
      return n % 2 === 1 ? 1 / n : 0;
    case "triangle":
      return n % 2 === 1 ? 1 / (n * n) : 0;
  }
}

/**
 * The harmonics of a note a filter control leaves (A1.L02; the harmonic content a control changes): an `lpf` at
 * `cutoff` Hz passes the harmonics at or below it, an `hpf` those at or above. Harmonic n of MIDI `note` is n · f0.
 */
export function harmonicsPassed(note: number, control: "lpf" | "hpf", cutoff: number, max = 32): number[] {
  const f0 = 440 * 2 ** ((note - 69) / 12);
  const out: number[] = [];
  for (let n = 1; n <= max; n++) {
    const f = n * f0;
    if (control === "lpf" ? f <= cutoff : f >= cutoff) out.push(n);
  }
  return out;
}

/** Register roles of an arrangement (A2.L01), in MIDI notes: where each part usually sits. */
export const REGISTER_ROLES = [
  { role: "sub", low: 24, high: 40, text: "sub bass: felt more than heard" },
  { role: "bass", low: 28, high: 52, text: "bass line" },
  { role: "low-mid", low: 48, high: 60, text: "chords' lower voices; mud lives here" },
  { role: "mid", low: 55, high: 76, text: "chords, comping, most melodies" },
  { role: "high", low: 72, high: 96, text: "melody tops, pads, shimmer" },
] as const;

/**
 * Low-interval limits (A2.L01; the arranging convention, timbre-dependent — w7plan: a tendency, not a law): the
 * lowest bottom note (MIDI) at which an interval still sounds clear. Below it, the interval tends to turn to mud.
 */
export const LOW_INTERVAL_LIMITS: Readonly<Record<number, number>> = {
  1: 52, // m2: E3
  2: 51, // M2: E♭3
  3: 48, // m3: C3
  4: 46, // M3: B♭2
  5: 46, // P4: B♭2
  6: 47, // tritone: B2
  7: 34, // P5: B♭1
  8: 43, // m6: G2
  9: 41, // M6: F2
  10: 41, // m7: F2
  11: 41, // M7: F2
};

/** Whether two sounding notes sit below their low-interval limit (an octave or wider is never flagged). */
export function belowLowIntervalLimit(a: number, b: number): boolean {
  const lo = Math.min(a, b);
  const iv = Math.abs(a - b);
  if (iv === 0 || iv >= 12) return false;
  return lo < (LOW_INTERVAL_LIMITS[iv] ?? 0);
}

export interface Density {
  /** Note onsets per bar, all parts together. */
  onsetsPerBar: number;
  /** Mean number of notes sounding at each onset (chord notes counted). */
  polyphony: number;
  /** Parts (labels) with at least one note. */
  parts: number;
}

/** A density measure of a span (A2.L02 thin vs thick): onsets per bar, notes per onset, parts playing. */
export function densityOf(events: readonly { onset: number; track: string }[], bars: number): Density {
  if (bars <= 0) throw new RangeError("@oak/theory: density needs at least one bar");
  const at = new Map<string, number>();
  for (const e of events) {
    const k = e.onset.toFixed(6);
    at.set(k, (at.get(k) ?? 0) + 1);
  }
  const parts = new Set(events.map((e) => e.track)).size;
  return {
    onsetsPerBar: at.size / bars,
    polyphony: at.size === 0 ? 0 : events.length / at.size,
    parts,
  };
}
