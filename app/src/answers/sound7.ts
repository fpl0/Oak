// Wave 7, the arrangement and sound track's answer logic (docs/design/wave7.md §11; contracts §2.6 A1.L05–A2.L06):
// "which is brighter / dirtier / wider / busier" as an A/B pick (content-kit `SOUND_COMPARE_OPTIONS`: the first
// id is the answer when card A is the one), "match a control by ear" (a slider on a log scale for a cutoff), and
// "mark the register each part lives in" (`REGISTER_ROLES` as the columns of a map). Pure: sound7.test.ts.
import type { Choice } from "@oak/content-kit";
import { SOUND_COMPARE_OPTIONS } from "@oak/content-kit";
import { REGISTER_ROLES } from "@oak/theory";
import { keyName } from "./normalize.ts";

/**
 * The A/B axes: content-kit's five, plus density (A2.L02, "which is busier"), which content-kit does not list yet
 * (requested; until then a step writes these two ids itself).
 */
export const COMPARE_AXES: Readonly<Record<string, readonly [Choice, Choice]>> = {
  ...(SOUND_COMPARE_OPTIONS as unknown as Record<string, readonly [Choice, Choice]>),
  density: [
    { id: "busier", label: "Busier" },
    { id: "sparser", label: "Sparser" },
  ],
};

export interface ComparePair {
  axis: string;
  /** Picked when card A is the one ("A is brighter"). */
  a: Choice;
  /** Picked when card B is the one (A is the other way: "A is darker"). */
  b: Choice;
  /** "Which is brighter?" */
  question: string;
  /** "brighter" */
  word: string;
}

/** The A/B pair a choice's two options make, in the authored order, or null for any other choice. */
export function comparePairOf(options: readonly Choice[]): ComparePair | null {
  if (options.length !== 2) return null;
  const [x, y] = options as [Choice, Choice];
  for (const [axis, [p, q]] of Object.entries(COMPARE_AXES))
    if ((x.id === p.id && y.id === q.id) || (x.id === q.id && y.id === p.id)) {
      const word = x.label.replace(/[*_`]/g, "").toLowerCase();
      return { axis, a: x, b: y, question: `Which is ${word}?`, word };
    }
  return null;
}

/** The card a stored answer means: A when it is the first id, B when the second. */
export function cardOf(pair: ComparePair, value: readonly string[]): "A" | "B" | null {
  const id = value[0];
  return id === pair.a.id ? "A" : id === pair.b.id ? "B" : null;
}

// --- registers --------------------------------------------------------------------------------------------------

export type RegisterRole = (typeof REGISTER_ROLES)[number]["role"];
export const REGISTER_IDS: readonly RegisterRole[] = REGISTER_ROLES.map((r) => r.role);

export interface RegisterBand {
  id: RegisterRole;
  label: string;
  /** "C1–E2" */
  range: string;
  text: string;
  low: number;
  high: number;
}

const BAND_LABEL: Record<RegisterRole, string> = {
  sub: "Sub",
  bass: "Bass",
  "low-mid": "Low mids",
  mid: "Mids",
  high: "Highs",
};

/** The register map's columns, low to high, from theory `REGISTER_ROLES` (the A2.L01 bands). */
export function registerBands(): RegisterBand[] {
  return REGISTER_ROLES.map((r) => ({
    id: r.role,
    label: BAND_LABEL[r.role],
    range: `${keyName(r.low, "flat")}–${keyName(r.high, "flat")}`,
    text: r.text,
    low: r.low,
    high: r.high,
  }));
}

/** Whether a slot strip's options are register bands (every id a `REGISTER_ROLES` role). */
export function isRegisterChoice(options: readonly { id: string }[]): boolean {
  return options.length >= 2 && options.every((o) => (REGISTER_IDS as readonly string[]).includes(o.id));
}

/** The bands a MIDI note sits in (they overlap: E2 is both sub and bass). */
export function bandsOf(midi: number): RegisterRole[] {
  return REGISTER_ROLES.filter((r) => midi >= r.low && midi <= r.high).map((r) => r.role);
}

// --- matching a control by ear -----------------------------------------------------------------------------------

/** A slider position (0–1) on a log scale between `min` and `max` → the value (a cutoff in Hz). */
export function fromLog(pos: number, min: number, max: number): number {
  const p = Math.max(0, Math.min(1, pos));
  return min * (max / min) ** p;
}
/** The inverse of `fromLog`. */
export function toLog(value: number, min: number, max: number): number {
  return Math.log(Math.max(min, Math.min(max, value)) / min) / Math.log(max / min);
}
/** A cutoff in Hz as it reads: "800 Hz", "2.4 kHz". */
export function hzText(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz` : `${Math.round(hz)} Hz`;
}
/** A log-scale value snapped to a pleasant step: 2 significant figures. */
export function snapLog(v: number): number {
  if (v <= 0) return 0;
  const p = 10 ** (Math.floor(Math.log10(v)) - 1);
  return Math.round(v / p) * p;
}
