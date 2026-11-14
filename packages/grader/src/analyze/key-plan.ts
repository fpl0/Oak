// The key in force at each bar, for rules and matchers (contracts §6.8). A rule reads a piece in the brief's key
// (item 1); a piece that changes key says so in its own code, with a patterned `.scale()` after `arrange()` or a
// lifted section const (item 4), and from that bar on every degree and numeral is read in the new key. This is
// the conservative reading the rubric uses: the declared key stands until the scale context MOVES (its tonic
// changes, or it turns from major to minor), so a tune on `C4:major pentatonic` or `A4:minor` over a piece in C
// never changes how its chords are named. `keyPlanView` (wave6-views.ts) is the view for the lenses: it prefers
// the code's own scale name.
import type { KeyPlanEntry, KeySpec, NEvent } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import {
  type ChordId,
  chromaticChordKind,
  isMinorish,
  keyFromScaleCtx,
  pcOf,
  transposeKey,
  triadCore,
} from "@oak/theory";
import type { Normalized } from "../types.ts";
import type { ChordSlot } from "./chords.ts";
import { mod12, modeOf, pitched } from "./events.ts";
import { keyEstimate, keyOf } from "./key.ts";
import { transposeAfterScaleTracks } from "./scale-context.ts";
import { sectionsFromAst } from "./sections.ts";

const stripOctave = (s: string): string => s.replace(/-?\d+(?=\s)/, "");

/** The scale context most notes of a bar carry, as a key (`null`: the bar has no note with one). */
function scaleKeyOf(events: readonly NEvent[]): KeySpec | null {
  const ctxs = events.map((e) => e.scaleCtx).filter((s): s is string => typeof s === "string");
  if (ctxs.length === 0) return null;
  const top = modeOf(ctxs.map(stripOctave));
  const full = ctxs.find((s) => stripOctave(s) === top);
  return full ? keyFromScaleCtx(full) : null;
}

export interface KeysByBarOptions {
  /** The brief's or the exercise's key: the key the piece starts in. Default: read from the piece. */
  key?: KeySpec | null;
  /** The learner's code: tracks with `.transpose()` after `.scale()` are not trusted (§6.8 item 3). */
  code?: string;
  /** An authored key plan (`ExBase.keyPlan`, `SongDef.keyPlan`): it wins over anything read from the notes. */
  keyPlan?: readonly KeyPlanEntry[];
  /** With a pickup, cycle 0 is bar 0 of an authored plan; without one, cycle 0 is bar 1. */
  pickup?: boolean;
}

/**
 * The key at every bar (index = 0-based cycle) of the first `bars` cycles. Empty when the piece has no pitch and
 * no key is declared.
 */
export function keysByBar(n: Normalized, bars: number, o: KeysByBarOptions = {}): KeySpec[] {
  const base = o.key ?? keyOf(n.all, null);
  if (!base) return [];
  if (o.keyPlan && o.keyPlan.length > 0) {
    const shift = o.pickup ? 0 : 1;
    return Array.from({ length: bars }, (_, b) => {
      let key = base;
      for (const e of o.keyPlan as readonly KeyPlanEntry[]) if (e.bar - shift <= b) key = e.key;
      return key;
    });
  }
  const distrust = new Set(o.code ? transposeAfterScaleTracks(o.code) : []);
  const notes = pitched(n.all).filter((e) => !distrust.has(e.track) && typeof e.scaleCtx === "string");
  const perBar: (KeySpec | null)[] = Array.from({ length: bars }, () => null);
  const buckets = new Map<number, NEvent[]>();
  for (const e of notes) {
    const b = R.floor(e.onset);
    if (b < 0 || b >= bars) continue;
    const list = buckets.get(b) ?? [];
    list.push(e);
    buckets.set(b, list);
  }
  for (const [b, list] of buckets) perBar[b] = scaleKeyOf(list);
  // §6.8 item 3: a section whose pitched tracks all carry `.transpose()` after `.scale()` has no context to
  // trust; it is read by ear, section by section, in the mode family of the piece (review:robustness, Wave 6).
  if (distrust.size > 0 && o.code) {
    const ast = sectionsFromAst(o.code);
    if (ast && "sections" in ast)
      for (const sec of ast.sections) {
        const from = sec.startBar;
        const to = Math.min(bars, sec.startBar + sec.bars);
        if (from >= bars) continue;
        if (perBar.slice(from, to).some((k) => k !== null)) continue;
        const ev = pitched(n.all).filter((e) => R.floor(e.onset) >= from && R.floor(e.onset) < to);
        const est = keyEstimate(ev);
        const k = (est.find((x) => isMinorish(x.key.mode) === isMinorish(base.mode)) ?? est[0])?.key;
        if (k) for (let b = from; b < to; b++) perBar[b] = k;
      }
  }
  const first = perBar.find((k) => k !== null) ?? null;
  if (!first) return Array.from({ length: bars }, () => base);
  const out: KeySpec[] = [];
  let cur: KeySpec = first;
  for (let b = 0; b < bars; b++) {
    cur = perBar[b] ?? cur;
    out.push(keyMoved(base, first, cur));
  }
  return out;
}

/** `base` moved as the scale context moved from `first` to `cur`. */
function keyMoved(base: KeySpec, first: KeySpec, cur: KeySpec): KeySpec {
  const minorNow = isMinorish(cur.mode);
  if (minorNow !== isMinorish(first.mode)) return { tonic: cur.tonic, mode: minorNow ? "minor" : "major" };
  const shift = mod12(pcOf(cur.tonic) - pcOf(first.tonic));
  if (shift === 0) return base;
  // The learner's own spelling of the new tonic when the scale names the brief's mode (D♭ major, not C♯ major).
  if (cur.mode === base.mode && mod12(pcOf(base.tonic) + shift) === pcOf(cur.tonic)) return cur;
  return transposeKey(base, shift);
}

const sameKey = (a: KeySpec, b: KeySpec): boolean =>
  pcOf(a.tonic) === pcOf(b.tonic) && isMinorish(a.mode) === isMinorish(b.mode) && a.mode === b.mode;

/** The key changes of a bar-by-bar plan: the 0-based bar each new key starts on, and how long it lasts. */
export function keyChangesByBar(
  keys: readonly KeySpec[],
): { bar: number; from: KeySpec; to: KeySpec; bars: number }[] {
  const out: { bar: number; from: KeySpec; to: KeySpec; bars: number }[] = [];
  for (let b = 1; b < keys.length; b++) {
    const prev = keys[b - 1] as KeySpec;
    const cur = keys[b] as KeySpec;
    if (sameKey(prev, cur)) continue;
    let end = b + 1;
    while (end < keys.length && sameKey(keys[end] as KeySpec, cur)) end++;
    out.push({ bar: b, from: prev, to: cur, bars: end - b });
  }
  return out;
}

const rootPos = (c: ChordId): ChordId => ({ ...c, bassPc: c.rootPc });
const sameCore = (a: ChordId | null, b: ChordId | null): boolean =>
  !!a && !!b && triadCore(a).rootPc === triadCore(b).rootPc && triadCore(a).quality === triadCore(b).quality;
/**
 * The key each chord slot is read in (aligned with `slots`). A chord takes the key of its bar, with one exception:
 * a chord from outside that key that belongs to the key the NEXT chord is in is read there. That is the dominant
 * leading into a new key: the A7 before a chorus lifted to D is D's own V7, not a secondary dominant of C.
 */
export function chordKeys(slots: readonly ChordSlot[], keys: readonly KeySpec[], base: KeySpec): KeySpec[] {
  const at = (bar0: number): KeySpec => keys[Math.max(0, Math.min(keys.length - 1, bar0))] ?? base;
  return slots.map((slot, i) => {
    const key = at(R.floor(slot.span[0]));
    const nextSlot = slots.slice(i + 1).find((x) => x.chord && !sameCore(x.chord, slot.chord));
    if (!slot.chord || !nextSlot?.chord) return key;
    const nextKey = at(R.floor(nextSlot.span[0]));
    if (pcOf(nextKey.tonic) === pcOf(key.tonic) && nextKey.mode === key.mode) return key;
    const chord = rootPos(slot.chord);
    const next = rootPos(nextSlot.chord);
    return chromaticChordKind(chord, key, next) !== "diatonic" &&
      chromaticChordKind(chord, nextKey, next) === "diatonic"
      ? nextKey
      : key;
  });
}
