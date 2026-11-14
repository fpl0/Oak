// Key changes in a source (contracts §6.8; wave6.md §4.4 "Key ribbon"): a song's given key plan as spans over
// the bar timeline, the key in force at a bar (the chart of a section and the degree labels read it there, never
// in the first key), each change in words, and what the plan sounds like while the player is transposed. Names and
// distances come from @oak/theory; nothing here keeps a table of its own. Pure.
import type { KeyPlanEntry, KeySpec } from "@oak/content-kit";
import { keyDisplay, keyDistance, transposeKey } from "@oak/theory";

export interface KeySpan {
  key: KeySpec;
  /** Timeline cycles (with a pickup, cycle 0 is the pickup bar). */
  fromCycle: number;
  cycles: number;
  /** 1-based first bar as the lead sheet numbers it (0: the pickup bar). */
  fromBar: number;
  toBar: number;
}

const same = (a: KeySpec, b: KeySpec) => a.tonic === b.tonic && a.mode === b.mode;

/**
 * The spans of a key plan over a tune of `bars` full bars. `plan` is the song's (`{ bar, key }`, bar 1-based, the
 * pickup bar 0); without one the tune is in `key` throughout. Entries are sorted, clipped to the tune, and two
 * neighbours in the same key are one span. `[]` when no key is known at all.
 */
export function keySpansOf(
  plan: readonly KeyPlanEntry[] | null | undefined,
  key: KeySpec | null,
  bars: number,
  pickup: boolean,
): KeySpan[] {
  const first = pickup ? 0 : 1;
  const entries = [...(plan ?? [])]
    .filter((e) => e.bar <= bars)
    .map((e) => ({ bar: Math.max(first, Math.round(e.bar)), key: e.key }))
    .sort((a, b) => a.bar - b.bar);
  if (entries.length === 0 || (entries[0] as { bar: number }).bar > first) {
    const start = key ?? entries[0]?.key ?? null;
    if (!start) return [];
    entries.unshift({ bar: first, key: start });
  }
  const merged: { bar: number; key: KeySpec }[] = [];
  for (const e of entries) {
    const last = merged.at(-1);
    if (last && last.bar === e.bar) last.key = e.key;
    else if (!last || !same(last.key, e.key)) merged.push({ ...e });
  }
  const cycleOf = (bar: number) => (pickup ? bar : bar - 1);
  return merged.map((e, i) => {
    const toBar = (merged[i + 1]?.bar ?? bars + 1) - 1;
    return {
      key: e.key,
      fromBar: e.bar,
      toBar,
      fromCycle: cycleOf(e.bar),
      cycles: toBar - e.bar + 1,
    };
  });
}

/** The key in force at a 1-based bar (the pickup bar is 0), `null` when no plan is known. */
export function keyAtBar(spans: readonly KeySpan[], bar: number): KeySpec | null {
  let hit: KeySpec | null = spans[0]?.key ?? null;
  for (const s of spans) if (s.fromBar <= bar) hit = s.key;
  return hit;
}

/** A tune that changes key (the ribbon draws nothing for a piece in one key). */
export const changesKey = (spans: readonly KeySpan[]): boolean => spans.length > 1;

const RELATION: Record<string, string> = {
  relative: "the relative key",
  parallel: "the same home, other mode",
  dominant: "a fifth up",
  subdominant: "a fourth up",
  "up-half": "+1: up a half step",
  "up-step": "+2: up a whole step",
  "down-step": "−2: down a whole step",
};

/** A change in words: "+2: up a whole step", "a fifth up", "the relative key", "+3 half steps". */
export function keyChangeText(from: KeySpec, to: KeySpec): string {
  const d = keyDistance(from, to);
  const named = RELATION[d.relation];
  if (named) return named;
  return d.semitones <= 6 ? `+${d.semitones} half steps` : `−${12 - d.semitones} half steps`;
}

/**
 * The plan as the player sounds it: with the source transposed by `semitones` every span's key moves with it
 * (the learner's code is transposed too, so what they write stays in the keys given).
 */
export function soundingSpans(spans: readonly KeySpan[], semitones: number): KeySpan[] {
  if (semitones === 0) return [...spans];
  return spans.map((s) => ({ ...s, key: transposeKey(s.key, semitones) }));
}

export interface KeyRibbonSegment extends KeySpan {
  /** "D major". */
  text: string;
  /** The key heard while the player is transposed ("E major"), else `null`. */
  sounding: string | null;
  /** How this span's key differs from the one before ("+2: up a whole step"), `null` for the first. */
  change: string | null;
}

/** The ribbon's segments: each span's name, its change from the span before, and what a transposed player sounds. */
export function keyRibbon(spans: readonly KeySpan[], semitones = 0): KeyRibbonSegment[] {
  const heard = soundingSpans(spans, semitones);
  return spans.map((s, i) => ({
    ...s,
    text: keyDisplay(s.key),
    sounding: semitones === 0 ? null : keyDisplay((heard[i] as KeySpan).key),
    change: i === 0 ? null : keyChangeText((spans[i - 1] as KeySpan).key, s.key),
  }));
}

/** The plan in one sentence, for the givens and for screen readers: "C major, then D major from bar 25". */
export function keyPlanText(spans: readonly KeySpan[]): string {
  return spans
    .map((s, i) => (i === 0 ? keyDisplay(s.key) : `${keyDisplay(s.key)} from bar ${s.fromBar}`))
    .join(", then ");
}
