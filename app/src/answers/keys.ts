// Keyboard maps and value operations behind the widgets (ux §4.5, §7.10): which degree a digit picks, the Roman
// numeral palette and its keys, the chromatic typing row, reordering, the rhythm grid's counts and its audition
// code, the slider's steps and labels. Pure: tested with `bun test`.
import type { ChordQuality, Degree, DrumRole } from "@oak/api";
import { formatRN } from "@oak/theory";
import { degreeDisplay, formatNumber } from "./normalize.ts";

// --- degree pad ---------------------------------------------------------------------------------

/** The base number of a degree: `b3` → 3. */
export function degreeBase(d: Degree): number {
  return Number(d.replace(/^[b#]/, ""));
}

/**
 * The degree a digit key picks from the pad's set. Plain digits pick the set's degree on that number (the minor
 * pad shows 1 2 ♭3 4 5 ♭6 ♭7 on the same keys): the natural one when both are present. A pending `-` (flat)
 * or `+`/`#` (sharp) prefix asks for the altered one.
 */
export function degreeForDigit(
  digit: number,
  set: readonly Degree[],
  prefix: "flat" | "sharp" | null = null,
): Degree | null {
  if (digit < 1 || digit > 7) return null;
  const want = prefix === "flat" ? `b${digit}` : prefix === "sharp" ? `#${digit}` : String(digit);
  if (set.includes(want as Degree)) return want as Degree;
  if (prefix) return null;
  const onKey = set.filter((d) => degreeBase(d) === digit);
  return onKey.length === 1 ? (onKey[0] as Degree) : null;
}

/** The pad's buttons in display order: by base number, flat before natural before sharp. */
export function padOrder(set: readonly Degree[]): Degree[] {
  const rank = (d: Degree) => degreeBase(d) * 3 + (d.startsWith("b") ? 0 : d.startsWith("#") ? 2 : 1);
  return [...new Set(set)].sort((a, b) => rank(a) - rank(b));
}

/** Fills the next empty slot (or replaces the focused one); a full sequence of one slot is replaced. */
export function putSlot<T>(slots: readonly T[], length: number, item: T, at?: number): T[] {
  if (length <= 1) return [item];
  const out = [...slots];
  if (at !== undefined && at >= 0 && at < out.length) {
    out[at] = item;
    return out;
  }
  if (out.length >= length) return out;
  out.push(item);
  return out;
}

/** Backspace: removes the last filled slot. */
export function popSlot<T>(slots: readonly T[]): T[] {
  return slots.slice(0, -1);
}

// --- chord qualities ----------------------------------------------------------------------------

const QUALITY_LABEL: Partial<Record<ChordQuality, { short: string; long: string }>> = {
  maj: { short: "maj", long: "major" },
  min: { short: "min", long: "minor" },
  dim: { short: "dim", long: "diminished" },
  aug: { short: "aug", long: "augmented" },
  sus2: { short: "sus2", long: "suspended 2nd" },
  sus4: { short: "sus4", long: "suspended 4th" },
  maj7: { short: "maj7", long: "major 7th" },
  "7": { short: "7", long: "dominant 7th" },
  m7: { short: "m7", long: "minor 7th" },
  m7b5: { short: "m7♭5", long: "half-diminished 7th" },
  dim7: { short: "dim7", long: "diminished 7th" },
  mMaj7: { short: "m(maj7)", long: "minor-major 7th" },
  "6": { short: "6", long: "major 6th" },
  m6: { short: "m6", long: "minor 6th" },
  "69": { short: "6/9", long: "six-nine" },
  add9: { short: "add9", long: "added 9th" },
  "9": { short: "9", long: "dominant 9th" },
  maj9: { short: "maj9", long: "major 9th" },
  m9: { short: "m9", long: "minor 9th" },
  m11: { short: "m11", long: "minor 11th" },
  "7b9": { short: "7♭9", long: "7 flat 9" },
  "7#9": { short: "7♯9", long: "7 sharp 9" },
  "7#11": { short: "7♯11", long: "7 sharp 11" },
  "7b13": { short: "7♭13", long: "7 flat 13" },
  "13": { short: "13", long: "dominant 13th" },
  "7alt": { short: "7alt", long: "altered dominant" },
  "maj7#11": { short: "maj7♯11", long: "major 7 sharp 11" },
  "7sus4": { short: "7sus4", long: "7 suspended 4th" },
};

export function qualityLabel(q: ChordQuality): { short: string; long: string } {
  return QUALITY_LABEL[q] ?? { short: q, long: q };
}

// --- Roman numeral palette ----------------------------------------------------------------------

export type RnAllow = "triads" | "sevenths" | "inversions" | "secondary" | "borrowed";
export type HarmonicRole = "T" | "PD" | "D" | "chromatic";
export interface RnButton {
  /** Canonical (`formatRN`) text: what the slot holds and the grader parses. */
  rn: string;
  /** Printed: `vii°`, `♭VII`. */
  display: string;
  role: HarmonicRole;
  /** The digit that picks it (with Shift for sevenths, after `-` for borrowed), if any. */
  key: string | null;
}
export interface RnGroup {
  id: "T" | "PD" | "D" | "secondary" | "borrowed";
  label: string;
  buttons: RnButton[];
}

type Q = ChordQuality;
const TRIADS: Q[] = ["maj", "min", "min", "maj", "maj", "min", "dim"];
const SEVENTHS: Q[] = ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"];
/** Tonic, predominant and dominant columns (ux §4.5: T | PD | D). */
const ROLE_OF: HarmonicRole[] = ["T", "PD", "T", "PD", "D", "T", "D"];

function rnText(degree: number, quality: Q, alt: -1 | 0 | 1 = 0, inversion: 0 | 1 | 2 | 3 = 0): string {
  return formatRN({ degree: degree as 1, alt, quality, inversion });
}

/** `viio` → `vii°`, `bVII` → `♭VII`. */
export function rnDisplay(rn: string): string {
  return rn
    .split("/")
    .map((p) =>
      p
        .replace(/^b/, "♭")
        .replace(/^#/, "♯")
        .replace(/o(?=\d*$)/, "°"),
    )
    .join("/");
}

function button(rn: string, role: HarmonicRole, key: string | null): RnButton {
  return { rn, display: rnDisplay(rn), role, key };
}

/** The palette for a major key: T | PD | D columns, then applied and borrowed rows when allowed. */
export function rnPalette(allow: readonly RnAllow[]): RnGroup[] {
  const sevenths = allow.includes("sevenths");
  const triads = allow.includes("triads") || !sevenths;
  const cols: Record<"T" | "PD" | "D", RnButton[]> = { T: [], PD: [], D: [] };
  // Column order inside a role follows ux §4.5: T: I vi iii, PD: IV ii, D: V vii°.
  const order = [1, 6, 3, 4, 2, 5, 7];
  for (const deg of order) {
    const role = ROLE_OF[deg - 1] as "T" | "PD" | "D";
    if (triads) cols[role].push(button(rnText(deg, TRIADS[deg - 1] as Q), role, String(deg)));
    if (sevenths) cols[role].push(button(rnText(deg, SEVENTHS[deg - 1] as Q), role, `⇧${deg}`));
  }
  const groups: RnGroup[] = [
    { id: "T", label: "Tonic", buttons: cols.T },
    { id: "PD", label: "Predominant", buttons: cols.PD },
    { id: "D", label: "Dominant", buttons: cols.D },
  ];
  if (allow.includes("secondary"))
    groups.push({
      id: "secondary",
      label: "Applied",
      buttons: ["V/V", "V7/V", "V/ii", "V7/ii", "V/vi", "V7/vi", "V7/IV", "viio7/V"].map((rn) =>
        button(rn, "chromatic", null),
      ),
    });
  if (allow.includes("borrowed"))
    groups.push({
      id: "borrowed",
      label: "Borrowed",
      buttons: [
        button(rnText(4, "min"), "chromatic", null),
        button(rnText(3, "maj", -1), "chromatic", "-3"),
        button(rnText(6, "maj", -1), "chromatic", "-6"),
        button(rnText(7, "maj", -1), "chromatic", "-7"),
        button(rnText(2, "maj", -1), "chromatic", "-2"),
        button(rnText(2, "dim"), "chromatic", null),
      ],
    });
  return groups;
}

/** RN keys (ux §4.5): `1`–`7` the diatonic triad, `Shift+digit` the seventh, `-` then a digit a flat-degree chord. */
export function rnForKey(
  digit: number,
  o: { shift?: boolean; flat?: boolean; allow: readonly RnAllow[] },
): string | null {
  if (digit < 1 || digit > 7) return null;
  if (o.flat) {
    if (!o.allow.includes("borrowed") || ![2, 3, 6, 7].includes(digit)) return null;
    return rnText(digit, "maj", -1);
  }
  const sevenths = o.allow.includes("sevenths");
  const triads = o.allow.includes("triads") || !sevenths;
  if (o.shift) return sevenths ? rnText(digit, SEVENTHS[digit - 1] as Q) : null;
  return triads ? rnText(digit, TRIADS[digit - 1] as Q) : rnText(digit, SEVENTHS[digit - 1] as Q);
}

const FIGURES_TRIAD = ["", "6", "64"] as const;
const FIGURES_SEVENTH = ["7", "65", "43", "42"] as const;

/**
 * Applies an inversion to a palette numeral (`V7` + 1 → `V65`, `I` + 2 → `I64`); applied chords invert their
 * primary. Inversion 3 exists only for sevenths. Returns `null` when it does not apply.
 */
export function withInversion(rn: string, inversion: 0 | 1 | 2 | 3): string | null {
  const slash = rn.indexOf("/");
  const primary = slash < 0 ? rn : rn.slice(0, slash);
  const of = slash < 0 ? "" : rn.slice(slash);
  const m = /^([b#]?)(i{1,3}|iv|v|vi{0,2}|I{1,3}|IV|V|VI{0,2})(maj|o|ø|\+)?(7|65|43|42|6|64)?$/.exec(primary);
  if (!m) return null;
  const [, acc, numeral, mark = "", fig = ""] = m;
  const seventh = fig === "7" || fig === "65" || fig === "43" || fig === "42";
  if (!seventh && inversion === 3) return null;
  const figure = seventh ? FIGURES_SEVENTH[inversion] : FIGURES_TRIAD[inversion as 0 | 1 | 2];
  return `${acc}${numeral}${mark}${figure}${of}`;
}

/** `M`: swaps the case of a numeral (I ↔ i) where that names a real chord (not ø or °). */
export function toggleCase(rn: string): string {
  const slash = rn.indexOf("/");
  const primary = slash < 0 ? rn : rn.slice(0, slash);
  const rest = slash < 0 ? "" : rn.slice(slash);
  const m = /^([b#]?)([ivIV]+)(.*)$/.exec(primary);
  if (!m || /[oø+]/.test(m[3] ?? "")) return rn;
  const numeral = m[2] as string;
  const flipped = numeral === numeral.toUpperCase() ? numeral.toLowerCase() : numeral.toUpperCase();
  let tail = m[3] ?? "";
  // A lower-case maj7 is mMaj7 in Oak's dialect; keep the seventh family sensible: I maj7 ↔ i 7 (m7).
  if (tail.startsWith("maj") && flipped === flipped.toLowerCase()) tail = tail.slice(3) || "7";
  return `${m[1]}${flipped}${tail}${rest}`;
}

// --- chromatic typing row -----------------------------------------------------------------------

/** `A W S E D F T G Y H U J K` (KeyboardEvent.code) → semitones above C (ux §7.10, the workbench's map). */
export const CHROMATIC_CODES: Readonly<Record<string, number>> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
};

/** The MIDI a typing key plays: C of `octave` plus the key's offset. `null` when it is not a typing key. */
export function chromaticMidi(code: string, octave: number): number | null {
  const semis = CHROMATIC_CODES[code];
  return semis === undefined ? null : (octave + 1) * 12 + semis;
}

/** The typing letter printed on a piano key, if the key sits on the typing row for this octave. */
export function typingLetter(midi: number, octave: number): string | null {
  const off = midi - (octave + 1) * 12;
  for (const [code, semis] of Object.entries(CHROMATIC_CODES)) if (semis === off) return code.slice(3);
  return null;
}

/** The keyboard widget's value after a pick, by mode. */
export function pickKey(
  value: readonly number[],
  midi: number,
  mode: "single" | "chord" | "sequence",
): number[] {
  if (mode === "single") return value.length === 1 && value[0] === midi ? [] : [midi];
  if (mode === "chord")
    return value.includes(midi) ? value.filter((m) => m !== midi) : [...value, midi].sort((a, b) => a - b);
  return [...value, midi];
}

// --- ordering (Parsons) -------------------------------------------------------------------------

/** Moves the item at `from` to `to` (clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length) return out;
  const [item] = out.splice(from, 1);
  const at = Math.max(0, Math.min(out.length, to));
  out.splice(at, 0, item as T);
  return out;
}

/** Inserts `item` at `at` (default: the end); an item already present moves there instead. */
export function insertItem<T>(list: readonly T[], item: T, at?: number): T[] {
  const out = list.filter((x) => x !== item);
  out.splice(Math.max(0, Math.min(out.length, at ?? out.length)), 0, item);
  return out;
}

export function removeItem<T>(list: readonly T[], item: T): T[] {
  return list.filter((x) => x !== item);
}

/** A stable shuffle of the pool: the same blocks always come out in the same order (seeded by their IDs). */
export function poolOrder<T extends { id: string }>(items: readonly T[]): T[] {
  const hash = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  return [...items].sort((a, b) => hash(`${a.id}·oak`) - hash(`${b.id}·oak`) || a.id.localeCompare(b.id));
}

// --- rhythm grid --------------------------------------------------------------------------------

/** Count syllables of one beat with `per` steps: 1 → "1", 2 → "1 &", 3 → "1 & a", 4 → "1 e & a". */
export function beatSyllables(per: number): string[] {
  if (per === 2) return ["", "&"];
  if (per === 3) return ["", "&", "a"];
  if (per === 4) return ["", "e", "&", "a"];
  if (per === 1) return [""];
  return Array.from({ length: per }, (_, i) => (i === 0 ? "" : "·"));
}

/** The count printed over every step of a grid row: `1 e & a 2 e & a …`, beat numbers restart each bar. */
export function gridCounts(stepsPerBar: number, bars: number, beatsPerBar = 4): string[] {
  const per = Math.max(1, Math.round(stepsPerBar / beatsPerBar));
  const syl = beatSyllables(per);
  const out: string[] = [];
  for (let bar = 0; bar < bars; bar++)
    for (let s = 0; s < stepsPerBar; s++) {
      const beat = Math.floor(s / per) + 1;
      const i = s % per;
      out.push(i === 0 ? String(beat) : (syl[i] ?? "·"));
    }
  return out;
}

/** Which drum sound a grid row auditions with (the self-hosted pack's names). */
export const ROW_SOUND: Readonly<Record<DrumRole | "hit", string>> = {
  hit: "rim",
  kick: "bd",
  snare: "sd",
  clap: "cp",
  rim: "rim",
  hatClosed: "hh",
  hatOpen: "oh",
  tom: "lt",
  crash: "cr",
  ride: "rd",
  shaker: "sh",
  perc: "cb",
};

const ROW_LABEL: Readonly<Record<DrumRole | "hit", string>> = {
  hit: "Hits",
  kick: "Kick",
  snare: "Snare",
  clap: "Clap",
  rim: "Rim",
  hatClosed: "Closed hat",
  hatOpen: "Open hat",
  tom: "Tom",
  crash: "Crash",
  ride: "Ride",
  shaker: "Shaker",
  perc: "Perc",
};
export function rowLabel(row: DrumRole | "hit"): string {
  return ROW_LABEL[row];
}

/** STYLE §2 labels: kick, snare, hats, perc; everything else plays on `perc`, a one-row grid on `hit`… as `perc`. */
const ROW_TRACK: Readonly<Record<DrumRole | "hit", string>> = {
  hit: "perc",
  kick: "kick",
  snare: "snare",
  clap: "perc",
  rim: "perc",
  hatClosed: "hats",
  hatOpen: "hats",
  tom: "perc",
  crash: "perc",
  ride: "hats",
  shaker: "perc",
  perc: "perc",
};

/**
 * Strudel code that plays a grid (STYLE §2: one labelled line per drum, `setcpm(bpm/4)` first). Each bar is one
 * `<…>` step so several bars alternate; an empty row is left out, an empty grid is a single rest line.
 */
export function gridToCode(
  rows: readonly (DrumRole | "hit")[],
  cells: readonly (readonly boolean[])[],
  o: { stepsPerBar: number; bars: number; bpm: number; beatsPerBar?: number },
): string {
  const beats = o.beatsPerBar ?? 4;
  const lines: string[] = [`setcpm(${formatNumber(o.bpm)}/${beats})`, ""];
  const used = new Map<string, number>();
  rows.forEach((row, r) => {
    const cellsOf = cells[r] ?? [];
    if (!cellsOf.some(Boolean)) return;
    const sound = ROW_SOUND[row];
    const bars: string[] = [];
    for (let b = 0; b < o.bars; b++) {
      const steps = Array.from({ length: o.stepsPerBar }, (_, s) =>
        cellsOf[b * o.stepsPerBar + s] ? sound : "~",
      );
      bars.push(steps.join(" "));
    }
    const pat = o.bars === 1 ? bars[0] : `<${bars.map((x) => `[${x}]`).join(" ")}>`;
    const base = ROW_TRACK[row];
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    lines.push(`${n === 1 ? base : `${base}${n}`}: s("${pat}")`);
  });
  if (lines.length === 2) lines.push(`perc: s("~")`);
  return lines.join("\n");
}

// --- slider -------------------------------------------------------------------------------------

/** Snaps to the slider's step from `min`, clamped to `[min, max]`. */
export function snapToStep(v: number, min: number, max: number, step: number): number {
  const clamped = Math.max(min, Math.min(max, v));
  if (step <= 0) return clamped;
  const snapped = min + Math.round((clamped - min) / step) * step;
  return Math.max(min, Math.min(max, Math.round(snapped * 1e6) / 1e6));
}

/** How a slider value reads: `96 BPM`, `40%`, `0.33 (triplet swing)`. */
export function sliderText(
  v: number | null,
  o: { unit?: string; format?: "number" | "percent" | "swing" },
): string {
  if (v === null) return "Not set";
  if (o.format === "percent") return `${Math.round(v * 100)}%`;
  if (o.format === "swing") {
    if (Math.abs(v) < 1e-6) return "0 (straight)";
    if (Math.abs(v - 1 / 3) < 0.005) return "1/3 (triplet swing)";
    return formatNumber(Math.round(v * 100) / 100);
  }
  return o.unit ? `${formatNumber(v)} ${o.unit}` : formatNumber(v);
}

/** The degrees a sequence answer shows in its slots: `♭3` etc. (re-exported for widgets). */
export const slotText = degreeDisplay;
