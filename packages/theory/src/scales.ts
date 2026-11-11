// Scales, keys, degrees, `n` steps and key-aware spelling.
import type { Degree, KeySpec, ScaleId, ScaleMode } from "@oak/content-kit";
import { chordNotes } from "./chords.ts";
import {
  accidentalText,
  addFifths,
  DEGREE_SEMIS,
  degreeFifths,
  degreeLabel,
  fifthsOf,
  fromFifths,
  LETTERS,
  midiOfSpelled,
  mod,
  nameOf,
  octaveFor,
  parseDegreeLabel,
  parsePcName,
  pcOfSpelled,
  type Spelled,
} from "./pitch.ts";
import type { ChordId, DegreeInfo, KeySignature, Pc, ScaleRef, SpelledPitch } from "./types.ts";

export interface ScaleDef {
  /** The name as Strudel takes it after the tonic: "major", "harmonic:minor". */
  strudelName: string;
  /** Oak's `ScaleMode`, or `null` for the jazz chord-scales that are not key modes. */
  mode: ScaleMode | null;
  id: ScaleId;
  /** Degrees relative to the major scale, from the tonic up. */
  degrees: Degree[];
  /** Names Strudel also takes for the same scale. */
  aliases: string[];
}

const deg = (s: string): Degree[] => s.split(" ") as Degree[];

/** Every scale Oak teaches (STYLE §3.5), measured against Strudel 1.2.6's `.scale()`. */
export const SCALES: readonly ScaleDef[] = [
  {
    strudelName: "major",
    mode: "major",
    id: "scale.major",
    degrees: deg("1 2 3 4 5 6 7"),
    aliases: ["ionian"],
  },
  {
    strudelName: "minor",
    mode: "minor",
    id: "scale.minor",
    degrees: deg("1 2 b3 4 5 b6 b7"),
    aliases: ["aeolian"],
  },
  {
    strudelName: "harmonic:minor",
    mode: "harmonic minor",
    id: "scale.harmonic-minor",
    degrees: deg("1 2 b3 4 5 b6 7"),
    aliases: [],
  },
  {
    strudelName: "melodic:minor",
    mode: "melodic minor",
    id: "scale.melodic-minor",
    degrees: deg("1 2 b3 4 5 6 7"),
    aliases: [],
  },
  { strudelName: "dorian", mode: "dorian", id: "scale.dorian", degrees: deg("1 2 b3 4 5 6 b7"), aliases: [] },
  {
    strudelName: "phrygian",
    mode: "phrygian",
    id: "scale.phrygian",
    degrees: deg("1 b2 b3 4 5 b6 b7"),
    aliases: [],
  },
  { strudelName: "lydian", mode: "lydian", id: "scale.lydian", degrees: deg("1 2 3 #4 5 6 7"), aliases: [] },
  {
    strudelName: "mixolydian",
    mode: "mixolydian",
    id: "scale.mixolydian",
    degrees: deg("1 2 3 4 5 6 b7"),
    aliases: [],
  },
  {
    strudelName: "locrian",
    mode: "locrian",
    id: "scale.locrian",
    degrees: deg("1 b2 b3 4 b5 b6 b7"),
    aliases: [],
  },
  {
    strudelName: "major:pentatonic",
    mode: "major pentatonic",
    id: "scale.major-pentatonic",
    degrees: deg("1 2 3 5 6"),
    aliases: ["pentatonic"],
  },
  {
    strudelName: "minor:pentatonic",
    mode: "minor pentatonic",
    id: "scale.minor-pentatonic",
    degrees: deg("1 b3 4 5 b7"),
    aliases: [],
  },
  {
    strudelName: "blues",
    mode: "blues",
    id: "scale.blues",
    degrees: deg("1 b3 4 b5 5 b7"),
    aliases: ["minor:blues"],
  },
  {
    strudelName: "altered",
    mode: null,
    id: "scale.altered",
    degrees: deg("1 b2 #2 3 #4 b6 b7"),
    aliases: [],
  },
  {
    strudelName: "lydian:dominant",
    mode: null,
    id: "scale.lydian-dominant",
    degrees: deg("1 2 3 #4 5 6 b7"),
    aliases: [],
  },
  { strudelName: "bebop", mode: null, id: "scale.bebop", degrees: deg("1 2 3 4 5 6 b7 7"), aliases: [] },
  {
    strudelName: "bebop:major",
    mode: null,
    id: "scale.bebop",
    degrees: deg("1 2 3 4 5 #5 6 7"),
    aliases: [],
  },
];

const BY_NAME = new Map<string, ScaleDef>();
for (const s of SCALES) for (const n of [s.strudelName, ...s.aliases]) BY_NAME.set(n, s);
export function scaleDefByName(strudelName: string): ScaleDef | null {
  return BY_NAME.get(strudelName.trim().replace(/\s+/g, ":")) ?? null;
}
export function scaleDefOf(mode: ScaleMode): ScaleDef {
  return SCALES.find((s) => s.mode === mode) as ScaleDef;
}

/** Modes with their characteristic tone (exercises §3.6) and brightness order (Lydian brightest). */
export const MODES = [
  { mode: "lydian", characteristic: ["#4"], brightness: 7, parentDegree: 4 },
  { mode: "major", characteristic: ["4", "7"], brightness: 6, parentDegree: 1 },
  { mode: "mixolydian", characteristic: ["b7"], brightness: 5, parentDegree: 5 },
  { mode: "dorian", characteristic: ["6"], brightness: 4, parentDegree: 2 },
  { mode: "minor", characteristic: ["b6"], brightness: 3, parentDegree: 6 },
  { mode: "phrygian", characteristic: ["b2"], brightness: 2, parentDegree: 3 },
  { mode: "locrian", characteristic: ["b5"], brightness: 1, parentDegree: 7 },
] as const satisfies readonly {
  mode: ScaleMode;
  characteristic: readonly Degree[];
  brightness: number;
  parentDegree: number;
}[];

/** The characteristic degrees of a mode (Dorian ♮6, Mixolydian ♭7, ...); `[]` for the non-diatonic scales. */
export function characteristicTones(mode: ScaleMode): Degree[] {
  return [...(MODES.find((m) => m.mode === mode)?.characteristic ?? [])];
}

// --- keys ------------------------------------------------------------------------------------------

export function tonicOf(key: KeySpec): Spelled {
  const t = parsePcName(key.tonic);
  if (!t) throw new RangeError(`@oak/theory: not a key tonic: "${key.tonic}"`);
  return t;
}
const degParts = (d: string) => {
  const p = parseDegreeLabel(d);
  if (!p) throw new RangeError(`@oak/theory: not a degree: "${d}"`);
  return p;
};

/** Spelled notes of a key's scale from the tonic up, each letter once where the scale has seven notes. */
export function scaleNotes(key: KeySpec): string[] {
  const t = tonicOf(key);
  return scaleDefOf(key.mode).degrees.map((d) => {
    const p = degParts(d);
    return nameOf(addFifths(t, degreeFifths(p.num, p.alt)));
  });
}
export function scalePcs(key: KeySpec): Pc[] {
  return scaleNotes(key).map((n) => pcOfSpelled(parsePcName(n) as Spelled));
}

/** Semitones of a degree above the tonic: "b3" → 3, "#4" → 6. */
export function degreeSemitones(degree: Degree): number {
  const p = degParts(degree);
  return mod((DEGREE_SEMIS[p.num - 1] as number) + p.alt, 12);
}

const SYLLABLES: Record<string, string> = {
  "1": "do",
  "#1": "di",
  b2: "ra",
  "2": "re",
  "#2": "ri",
  b3: "me",
  "3": "mi",
  "4": "fa",
  "#4": "fi",
  b5: "se",
  "5": "sol",
  "#5": "si",
  b6: "le",
  "6": "la",
  "#6": "li",
  b7: "te",
  "7": "ti",
};
/** Movable-do syllable of a degree, do-based minor (♭3 = me, ♭6 = le, ♭7 = te). */
export function syllableOf(degree: Degree): string {
  return SYLLABLES[degree] ?? "?";
}

/** The label a chromatic pitch gets when the key's scale does not contain it (♭3 ♯4 ♭6 ♭7 ♭2 in major). */
const CHROMATIC_LABEL_MAJOR: Record<number, Degree> = { 1: "b2", 3: "b3", 6: "#4", 8: "b6", 10: "b7" };
const CHROMATIC_LABEL_MINOR: Record<number, Degree> = { 1: "b2", 4: "3", 6: "#4", 9: "6", 11: "7" };
const MINORISH = new Set<ScaleMode>([
  "minor",
  "harmonic minor",
  "melodic minor",
  "dorian",
  "phrygian",
  "locrian",
  "minor pentatonic",
  "blues",
]);
export const isMinorish = (mode: ScaleMode): boolean => MINORISH.has(mode);

/** The degree label of `semitones` above the tonic in a key: the scale's own label first. */
export function degreeLabelIn(semitones: number, key: KeySpec): Degree {
  const s = mod(semitones, 12);
  const own = scaleDefOf(key.mode).degrees.find((d) => degreeSemitones(d) === s);
  if (own) return own;
  const table = isMinorish(key.mode) ? CHROMATIC_LABEL_MINOR : CHROMATIC_LABEL_MAJOR;
  const fromTable = table[s];
  if (fromTable) return fromTable;
  return (["1", "b2", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"] as Degree[])[s] as Degree;
}

/** The degree of a MIDI note in a key, relative to the major scale, with its syllable and `n` step. */
export function degreeOf(midi: number, key: KeySpec): DegreeInfo {
  const semitones = mod(Math.round(midi) - pcOfSpelled(tonicOf(key)), 12);
  const degree = degreeLabelIn(semitones, key);
  const p = degParts(degree);
  return {
    degree,
    num: p.num,
    alt: p.alt,
    semitones,
    syllable: syllableOf(degree),
    step: strudelStep(degree, key),
  };
}

/**
 * The `n` value that plays `degree` in `key`'s own scale: an integer for scale tones (degree 5 → 4), or
 * a chromatic step string for the others (STYLE §6: ♯4 in major is "3#", ♭7 is "6b", ♭3 is "2b").
 * `"7b"` is never produced: in C major it plays B♮.
 */
export function strudelStep(degree: Degree, key: KeySpec): number | string {
  const want = degParts(degree);
  const degs = scaleDefOf(key.mode).degrees.map(degParts);
  const exact = degs.findIndex((d) => d.num === want.num && d.alt === want.alt);
  if (exact >= 0) return exact;
  const semis = degreeSemitones(degree);
  if (degs.length === 7) {
    const i = degs.findIndex((d) => d.num === want.num);
    const diff = want.alt - (degs[i] as { alt: number }).alt;
    return `${i}${diff > 0 ? "#".repeat(diff) : "b".repeat(-diff)}`;
  }
  // Pentatonic and blues: a flat label alters the scale tone above, otherwise the one below.
  const st = degs.map((d) => mod((DEGREE_SEMIS[d.num - 1] as number) + d.alt, 12));
  if (want.alt < 0) {
    for (let i = 0; i < st.length; i++) {
      const diff = (st[i] as number) - semis;
      if (diff > 0 && diff <= 2) return `${i}${"b".repeat(diff)}`;
    }
  }
  for (let i = st.length - 1; i >= 0; i--) {
    const diff = semis - (st[i] as number);
    if (diff > 0 && diff <= 2) return `${i}${"#".repeat(diff)}`;
  }
  return `${st.length}${"b".repeat(12 - semis)}`;
}

const STEP_RE = /^(-?\d+)([#bsf]*)$/;
function scaleSemis(def: ScaleDef): number[] {
  return def.degrees.map((d) => mod(degreeSemitones(d), 12));
}

/** MIDI of an `n` step (number or "3#") in a `.scale()` such as "C4:major", exactly as Strudel resolves it. */
export function stepToMidi(step: number | string, scale: ScaleRef): number {
  const def = scaleDefByName(scale.strudelName);
  if (!def) throw new RangeError(`@oak/theory: unknown scale "${scale.strudelName}"`);
  let index: number;
  let shift = 0;
  if (typeof step === "number") {
    if (!Number.isInteger(step)) throw new RangeError(`@oak/theory: fractional step ${step}`);
    index = step;
  } else {
    const m = STEP_RE.exec(step.trim());
    if (!m) throw new RangeError(`@oak/theory: not a scale step: "${step}"`);
    index = Number(m[1]);
    for (const ch of m[2] ?? "") shift += ch === "#" || ch === "s" ? 1 : -1;
  }
  const semis = scaleSemis(def);
  const len = semis.length;
  const tonic = parsePcName(scale.tonic);
  if (!tonic) throw new RangeError(`@oak/theory: not a tonic: "${scale.tonic}"`);
  const base = midiOfSpelled(tonic, scale.octave ?? 3);
  return base + (semis[mod(index, len)] as number) + 12 * Math.floor(index / len) + shift;
}

const SCALE_ARG = /^([A-Ga-g](?:##|bb|#|b)?)(-?\d+)?:(.+)$/;
/** A `.scale()` argument taken apart, for any scale Strudel knows that Oak uses (jazz chord-scales included). */
export function parseScaleArg(text: string): { tonic: string; octave: number | null; def: ScaleDef } | null {
  const m = SCALE_ARG.exec(text.trim());
  if (!m) return null;
  const def = scaleDefByName(m[3] as string);
  if (!def) return null;
  const t = parsePcName(m[1] as string);
  if (!t) return null;
  return { tonic: nameOf(t), octave: m[2] === undefined ? null : Number(m[2]), def };
}

/** Parses a `.scale()` argument: "C4:major", "A3:harmonic:minor", "C:major" (octave null). */
export function parseScaleName(text: string): ScaleRef | null {
  const a = parseScaleArg(text);
  if (!a || a.def.mode === null) return null;
  return { tonic: a.tonic, octave: a.octave, mode: a.def.mode, strudelName: a.def.strudelName };
}
/** "C4:major", "A3:harmonic:minor". The octave is always written (STYLE). */
export function formatScaleName(key: KeySpec, octave: number): string {
  return `${nameOf(tonicOf(key))}${octave}:${scaleDefOf(key.mode).strudelName}`;
}
/** `hap.context.scale` ("D4 major", "A3 harmonic minor", "eb4 major") to a key; `null` for chord-scales. */
export function keyFromScaleCtx(scaleCtx: string): KeySpec | null {
  const m = /^([A-Ga-g](?:##|bb|#|b)?)(-?\d+)?[\s:]+(.+)$/.exec(scaleCtx.trim());
  if (!m) return null;
  const def = scaleDefByName((m[3] as string).trim());
  if (!def || def.mode === null) return null;
  const t = parsePcName(m[1] as string);
  if (!t) return null;
  return { tonic: nameOf(t), mode: def.mode };
}

// --- key signatures and related keys ------------------------------------------------------------------

/** Fifths of the key signature relative to the tonic, per mode. */
const SIG_OFFSET: Record<ScaleMode, number> = {
  major: 0,
  minor: -3,
  "harmonic minor": -3,
  "melodic minor": -3,
  dorian: -2,
  phrygian: -4,
  lydian: 1,
  mixolydian: -1,
  locrian: -5,
  "major pentatonic": 0,
  "minor pentatonic": -3,
  blues: -3,
};
const ABC_MODE: Record<ScaleMode, string> = {
  major: "",
  minor: "m",
  "harmonic minor": "m",
  "melodic minor": "m",
  dorian: "dor",
  phrygian: "phr",
  lydian: "lyd",
  mixolydian: "mix",
  locrian: "loc",
  "major pentatonic": "",
  "minor pentatonic": "m",
  blues: "m",
};

export function keySignature(key: KeySpec): KeySignature {
  const t = tonicOf(key);
  const accidentals = fifthsOf(t) + SIG_OFFSET[key.mode];
  const notes: string[] = [];
  if (accidentals > 0) for (let i = 0; i < accidentals; i++) notes.push(nameOf(fromFifths(6 + i)));
  else for (let i = 0; i < -accidentals; i++) notes.push(nameOf(fromFifths(-2 - i)));
  return { accidentals, notes, abcK: `${nameOf(t)}${ABC_MODE[key.mode]}` };
}

/** The major and minor key with a given signature (−7 flats to +7 sharps). */
export function keysWithSignature(accidentals: number): { major: KeySpec; minor: KeySpec } {
  return {
    major: { tonic: nameOf(fromFifths(accidentals)), mode: "major" },
    minor: { tonic: nameOf(fromFifths(accidentals + 3)), mode: "minor" },
  };
}

/** The circle of fifths from C clockwise: 12 positions, sharps up to F♯ (6), then flats (D♭ = −5 ... F = −1). */
export function circleOfFifths(): {
  accidentals: number;
  major: KeySpec;
  minor: KeySpec;
  enharmonic?: KeySpec;
}[] {
  const out: { accidentals: number; major: KeySpec; minor: KeySpec; enharmonic?: KeySpec }[] = [];
  for (let i = 0; i < 12; i++) {
    const acc = i <= 6 ? i : i - 12;
    const k = keysWithSignature(acc);
    const entry: { accidentals: number; major: KeySpec; minor: KeySpec; enharmonic?: KeySpec } = {
      accidentals: acc,
      ...k,
    };
    if (acc === 6) entry.enharmonic = { tonic: "Gb", mode: "major" };
    out.push(entry);
  }
  return out;
}

export function relativeKey(key: KeySpec): KeySpec {
  const t = tonicOf(key);
  switch (key.mode) {
    case "major":
      return { tonic: nameOf(addFifths(t, 3)), mode: "minor" };
    case "major pentatonic":
      return { tonic: nameOf(addFifths(t, 3)), mode: "minor pentatonic" };
    case "minor pentatonic":
    case "blues":
      return { tonic: nameOf(addFifths(t, -3)), mode: "major pentatonic" };
    default:
      // Minors and the modes: the major key with the same signature.
      return { tonic: nameOf(fromFifths(fifthsOf(t) + SIG_OFFSET[key.mode])), mode: "major" };
  }
}
export function parallelKey(key: KeySpec): KeySpec {
  if (key.mode === "major pentatonic") return { tonic: key.tonic, mode: "minor pentatonic" };
  if (key.mode === "minor pentatonic" || key.mode === "blues")
    return { tonic: key.tonic, mode: "major pentatonic" };
  return { tonic: key.tonic, mode: isMinorish(key.mode) ? "major" : "minor" };
}

/** `key` moved by a number of semitones, spelled with at most 6 accidentals (a tie, F♯/G♭ major, takes flats). */
export function transposeKey(key: KeySpec, semitones: number): KeySpec {
  const t = tonicOf(key);
  const pc = mod(pcOfSpelled(t) + semitones, 12);
  const off = SIG_OFFSET[key.mode];
  let best: Spelled | null = null;
  let bestAcc = 99;
  for (let f = -15; f <= 15; f++) {
    const s = fromFifths(f);
    if (pcOfSpelled(s) !== pc || Math.abs(s.alt) > 1) continue;
    const acc = f + off;
    if (Math.abs(acc) < Math.abs(bestAcc) || (Math.abs(acc) === Math.abs(bestAcc) && acc < bestAcc)) {
      best = s;
      bestAcc = acc;
    }
  }
  return { tonic: nameOf(best ?? fromFifths(0)), mode: key.mode };
}

// --- spelling ------------------------------------------------------------------------------------------

function spelledPitch(s: Spelled, midi: number): SpelledPitch {
  const oct = octaveFor(s, midi);
  return { midi, name: `${nameOf(s)}${oct}`, letter: LETTERS[s.letter] as string, alt: s.alt, oct };
}

/**
 * Spells a MIDI note from context, never from the code's own spelling (`.scale()` spells accidentals
 * backwards). Chord-tone spelling wins over key-scale spelling, which wins over melodic direction; a note
 * outside all three gets the key's chromatic label (♭3 ♯4 ♭6 ♭7 ♭2 in major; raised 6 and 7 in minor).
 */
export function spellMidi(
  midi: number,
  ctx: { key: KeySpec | null; chord?: ChordId; direction?: 1 | -1 },
): SpelledPitch {
  const m = Math.round(midi);
  const pc = mod(m, 12);
  if (ctx.chord) {
    const hit = chordNotes(ctx.chord)
      .map((n) => parsePcName(n) as Spelled)
      .find((s) => pcOfSpelled(s) === pc && Math.abs(s.alt) <= 2);
    if (hit) return spelledPitch(hit, m);
  }
  const key = ctx.key ?? { tonic: "C", mode: "major" as const };
  const t = tonicOf(key);
  const semis = mod(pc - pcOfSpelled(t), 12);
  const own = scaleDefOf(key.mode).degrees.find((d) => degreeSemitones(d) === semis);
  // Minor keys also own the raised 6 and 7 (melodic and harmonic minor).
  const extra =
    isMinorish(key.mode) && key.mode !== "dorian" && (semis === 9 || semis === 11)
      ? String(semis === 9 ? 6 : 7)
      : null;
  let label: string | null = own ?? extra;
  if (!label && ctx.direction) {
    // Ascending: raise the letter below; descending: lower the letter above.
    const below = [0, 2, 4, 5, 7, 9, 11].filter((x) => x < semis).length;
    label = ctx.direction === 1 ? degreeLabel(below, 1) : degreeLabel(below + 1, -1);
    const p = parseDegreeLabel(label);
    if (!p || p.num < 1 || p.num > 7 || mod((DEGREE_SEMIS[p.num - 1] as number) + p.alt, 12) !== semis)
      label = null;
  }
  label ??= degreeLabelIn(semis, key);
  const p = degParts(label);
  let s = addFifths(t, degreeFifths(p.num, p.alt));
  if (Math.abs(s.alt) > 2) s = fromFifths(fifthsOf(s) + (s.alt > 0 ? -12 : 12));
  return spelledPitch(s, m);
}

/** A spelled note name for display: "E♭4" with Unicode accidentals. */
export function displayName(p: SpelledPitch | string): string {
  const name = typeof p === "string" ? p : p.name;
  const m = /^([A-G])([#b]*)(-?\d+)?$/.exec(name);
  if (!m) return name;
  const alt = [...(m[2] ?? "")].reduce((a, ch) => a + (ch === "#" ? 1 : -1), 0);
  return `${m[1]}${accidentalText(alt, true)}${m[3] ?? ""}`;
}

/** Diatonic triads (or sevenths) on each scale degree of a seven-note key. Minor keys use natural minor. */
export function diatonicChordTones(key: KeySpec, size: 3 | 4): { root: string; notes: string[] }[] {
  const notes = scaleNotes(key);
  if (notes.length !== 7) throw new RangeError(`@oak/theory: ${key.mode} has no diatonic chords`);
  return notes.map((root, i) => ({
    root,
    notes: Array.from({ length: size }, (_, k) => notes[(i + 2 * k) % 7] as string),
  }));
}
