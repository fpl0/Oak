// The key tools of the Workbench (Wave 3): names, signatures and spelled scales for the key-signature panel
// (tb.feature.keysig, U03.L06), the ring of the circle-of-fifths widget (tb.feature.circle, U03.L07), the facts
// line over the staff, and the one code edit they make: moving every `.scale("…")` argument to another key. The
// learner's code is never touched by a preview; "Use this key" is one explicit edit of the arguments only.
// Every fact comes from @oak/theory. Pure.
import type { KeySpec } from "@oak/content-kit";
import type { Score } from "@oak/notation";
import {
  fifthsNeighbours,
  fifthsOfKey,
  keyFromFifths,
  keyFromScaleCtx,
  scaleNotes,
  signatureOf,
  transposeKey,
} from "@oak/theory";
import type { PieceKeySpan } from "./model.ts";

/** "F#" → "F♯", "Bb" → "B♭". */
export function glyph(name: string): string {
  return name.replace(/#/g, "♯").replace(/(?<=[A-G])b/g, "♭");
}

/** "D major", "F♯ minor". */
export function keyName(k: KeySpec): string {
  return `${glyph(k.tonic)} ${k.mode}`;
}

export const sameKey = (a: KeySpec | null, b: KeySpec | null): boolean =>
  a === b || (a !== null && b !== null && a.tonic === b.tonic && a.mode === b.mode);

/** The signature of a key in words: "2 sharps: F♯ C♯", "1 flat: B♭", "no sharps or flats". */
export function signatureText(k: KeySpec): string {
  const sig = signatureOf(k);
  const list = sig.sharps.length ? sig.sharps : sig.flats;
  if (list.length === 0) return "no sharps or flats";
  const kind = sig.sharps.length ? "sharp" : "flat";
  return `${list.length} ${kind}${list.length === 1 ? "" : "s"}: ${list.map(glyph).join(" ")}`;
}

/** "2♯", "3♭", "0" (the compact form on the ring and the staff facts). */
export function signatureShort(fifths: number): string {
  if (fifths === 0) return "no ♯/♭";
  return fifths > 0 ? `${fifths}♯` : `${-fifths}♭`;
}

/** The key's scale spelled from its tonic, degree numbers alongside: [{ degree: 1, name: "D" }, …]. */
export function spelledScale(k: KeySpec): { degree: number; name: string }[] {
  return scaleNotes(k).map((n, i) => ({ degree: i + 1, name: glyph(n) }));
}

/** The panel's neighbours: one fifth either way, the relative and the parallel key. */
export function neighbours(k: KeySpec): { label: string; key: KeySpec; hint: string }[] {
  const n = fifthsNeighbours(k);
  const plusOne = signatureShort(fifthsOfKey(n.clockwise));
  const minusOne = signatureShort(fifthsOfKey(n.counterclockwise));
  return [
    { label: "A fifth up", key: n.clockwise, hint: plusOne },
    { label: "A fifth down", key: n.counterclockwise, hint: minusOne },
    { label: "Relative", key: n.relative, hint: "same signature" },
    { label: "Parallel", key: n.parallel, hint: "same tonic" },
  ];
}

/** The ring: twelve signatures from 0 clockwise (C, G, D … F), each with its major and relative minor key. */
export interface RingSlot {
  /** −5 … 6 (F♯ major / D♯ minor at six sharps; G♭ is its enharmonic twin). */
  fifths: number;
  major: KeySpec;
  minor: KeySpec;
  /** Position clockwise from the top, 0 … 11. */
  index: number;
}

export function ring(): RingSlot[] {
  const out: RingSlot[] = [];
  for (let i = 0; i < 12; i++) {
    const fifths = i <= 6 ? i : i - 12;
    out.push({
      fifths,
      major: keyFromFifths(fifths, "major"),
      minor: keyFromFifths(fifths, "minor"),
      index: i,
    });
  }
  return out;
}

/** The ring slot of a key (by signature, any mode); a key beyond six sharps or five flats wraps around. */
export function slotOf(k: KeySpec): number {
  const f = fifthsOfKey(k);
  return (((f % 12) + 12) % 12) as number;
}

/** The key with slot `index`'s signature in `mode` (a minor piece stays minor when it moves). */
export function keyOfSlot(index: number, mode: KeySpec["mode"]): KeySpec {
  const fifths = index <= 6 ? index : index - 12;
  if (mode === "major" || mode === "minor") return keyFromFifths(fifths, mode);
  // Any other mode keeps its mode: the tonic whose key in that mode has this signature.
  for (let g = -7; g <= 7; g++) {
    const k: KeySpec = { tonic: keyFromFifths(g, "major").tonic, mode };
    if (fifthsOfKey(k) === fifths) return k;
  }
  return keyFromFifths(fifths, "major");
}

// --- the facts line over the staff --------------------------------------------------------------------------

/** "Treble clef", "Bass clef", "Grand staff", "Percussion staff". */
export function staffClefText(score: Score | null): string | null {
  if (!score) return null;
  const clefs = score.staves.map((s) => s.clef);
  const pitched = clefs.filter((c) => c !== "perc");
  const parts: string[] = [];
  if (pitched.includes("treble") && pitched.includes("bass")) parts.push("Grand staff");
  else if (pitched.includes("bass")) parts.push("Bass clef");
  else if (pitched.includes("treble")) parts.push("Treble clef");
  if (clefs.includes("perc")) parts.push(parts.length ? "drums" : "Percussion staff");
  return parts.join(" + ") || null;
}

/**
 * The keys of bars [from, to): "D major · 2♯", or "C major → G major" when a patterned `.scale()` changes key on
 * the page. `fallback` (the score's own key) when no span covers them.
 */
export function keySummary(
  spans: readonly PieceKeySpan[],
  from: number,
  to: number,
  fallback: KeySpec | null,
): string | null {
  const keys: KeySpec[] = [];
  for (const s of spans) {
    if (s.to <= from + 1e-9 || s.from >= to - 1e-9) continue;
    if (!keys.some((k) => sameKey(k, s.key))) keys.push(s.key);
  }
  if (keys.length === 0 && fallback) keys.push(fallback);
  if (keys.length === 0) return null;
  if (keys.length === 1) {
    const k = keys[0] as KeySpec;
    return `${keyName(k)} · ${signatureShort(fifthsOfKey(k))}`;
  }
  // A key change every bar would make a line longer than the staff: the first and last, and how many.
  if (keys.length > 3)
    return `${keyName(keys[0] as KeySpec)} → … → ${keyName(keys[keys.length - 1] as KeySpec)} (${keys.length} keys)`;
  return keys.map(keyName).join(" → ");
}

/** Every key of the stretch in order (the full text behind a shortened `keySummary`). */
export function keyList(spans: readonly PieceKeySpan[], from: number, to: number): string {
  const keys: KeySpec[] = [];
  for (const s of spans) {
    if (s.to <= from + 1e-9 || s.from >= to - 1e-9) continue;
    if (!keys.some((k) => sameKey(k, s.key))) keys.push(s.key);
  }
  return keys.map(keyName).join(" → ");
}

// --- the .scale() arguments ---------------------------------------------------------------------------------

/** A key written inside a `.scale("…")` string: its text range in the code and what it says. */
export interface ScaleToken {
  from: number;
  to: number;
  text: string;
  tonic: string;
  octave: number | null;
  /** The mode as written ("major", "harmonic:minor"). */
  modeText: string;
  key: KeySpec | null;
}

const SCALE_CALL = /\.scale\(\s*(["'`])([^"'`]*)\1\s*\)/g;
const KEY_TOKEN = /([A-Ga-g](?:##|bb|#|b)?)(-?\d)?:([A-Za-z]+(?::[A-Za-z]+)*)/g;

/** Every key inside a string-literal `.scale()` argument, in code order (a patterned one gives several). */
export function scaleTokens(code: string): ScaleToken[] {
  const out: ScaleToken[] = [];
  SCALE_CALL.lastIndex = 0;
  for (let m = SCALE_CALL.exec(code); m; m = SCALE_CALL.exec(code)) {
    const inner = m[2] as string;
    const innerAt = m.index + (m[0].indexOf(m[1] as string) + 1);
    KEY_TOKEN.lastIndex = 0;
    for (let t = KEY_TOKEN.exec(inner); t; t = KEY_TOKEN.exec(inner)) {
      const tonic = t[1] as string;
      const modeText = t[3] as string;
      out.push({
        from: innerAt + t.index,
        to: innerAt + t.index + t[0].length,
        text: t[0],
        tonic,
        octave: t[2] === undefined ? null : Number(t[2]),
        modeText,
        key: keyFromScaleCtx(`${tonic} ${modeText.replace(/:/g, " ")}`),
      });
    }
  }
  return out;
}

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function tonicPc(t: string): number {
  const letter = (t[0] ?? "C").toUpperCase();
  const acc = t.slice(1);
  const alt = acc === "#" ? 1 : acc === "##" ? 2 : acc === "b" ? -1 : acc === "bb" ? -2 : 0;
  return (LETTER_PC[letter] ?? 0) + alt;
}

/** Semitones from `a`'s tonic to `b`'s, the nearer way (−6 … +5): C → G is −5 (down a fourth), G → C is +5. */
export function nearestShift(a: KeySpec, b: KeySpec): number {
  const d = (((tonicPc(b.tonic) - tonicPc(a.tonic)) % 12) + 12) % 12;
  return d > 5 ? d - 12 : d;
}

export interface KeyMove {
  /** The code with every key moved; `null` when there is nothing to move (no string `.scale()` argument). */
  code: string | null;
  /** Each replaced range of the original code, for one editor transaction. */
  changes: { from: number; to: number; insert: string }[];
  /** Semitones every key moved by. */
  shift: number;
}

/**
 * Moves the piece from `from` to `to`: every key token in the `.scale()` arguments moves by the same nearer
 * shift (a patterned `<C4:major G4:major>` stays a progression of keys), the octave follows the tonic across C,
 * the mode text stays as written. A token in `from` takes `to`'s spelling; the others the plainest spelling.
 */
export function moveKey(code: string, from: KeySpec, to: KeySpec): KeyMove {
  const tokens = scaleTokens(code);
  const shift = nearestShift(from, to);
  if (tokens.length === 0) return { code: null, changes: [], shift };
  const changes = tokens.map((t) => {
    const own = t.key ?? { tonic: t.tonic.toUpperCase(), mode: "major" as const };
    const next = sameKey(own, from) ? to : transposeKey(own, shift);
    let octave = t.octave;
    if (octave !== null) {
      const midi = (octave + 1) * 12 + tonicPc(t.tonic) + shift;
      // The new tonic's own octave number: C♭ and B♯ sit across the octave line from their pitch.
      octave = Math.floor((midi - tonicPc(next.tonic)) / 12) - 1;
    }
    return { from: t.from, to: t.to, insert: `${next.tonic}${octave === null ? "" : octave}:${t.modeText}` };
  });
  let out = "";
  let at = 0;
  for (const c of changes) {
    out += code.slice(at, c.from) + c.insert;
    at = c.to;
  }
  out += code.slice(at);
  return { code: out, changes, shift };
}
