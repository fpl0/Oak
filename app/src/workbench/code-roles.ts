// Location roles. A hap's locations hold EVERY contributing mini-notation atom, later-applied first
// (interfaces §3, spike S2): for `note("c4").s("piano")` the first entry is the word `piano`. The views
// need the atom that MADE the event (the note, the step, the chord, the drum sound), so every location is
// classified by the call whose string argument holds it. Works on raw `{start,end}` live-hap locations
// and on `CodeRange`s alike. Pure.
import type { CodeRange } from "@oak/content-kit";

const QUOTES = new Set(['"', "'", "`"]);
const IDENT = /[A-Za-z0-9_$]/;

/**
 * The function whose string argument contains offset `from`: `note`, `n`, `s`, `chord`, `scale`, `bank`…
 * `null` when the offset is not inside a call's string argument.
 */
export function callOf(code: string, from: number): string | null {
  let i = Math.min(from, code.length) - 1;
  // Mini-notation atoms never contain quotes: the nearest quote to the left opens the string.
  while (i >= 0 && !QUOTES.has(code[i] as string)) i--;
  if (i < 0) return null;
  i--;
  while (i >= 0 && /\s/.test(code[i] as string)) i--;
  if (code[i] !== "(") return null;
  i--;
  while (i >= 0 && /\s/.test(code[i] as string)) i--;
  const end = i + 1;
  while (i >= 0 && IDENT.test(code[i] as string)) i--;
  const name = code.slice(i + 1, end);
  return name.length > 0 && !/^\d/.test(name) ? name : null;
}

/** Calls whose atoms make the pitch of an event. */
export const PITCH_ROLES: readonly string[] = ["note", "n", "chord", "freq", "midinote"];
/** Calls whose atoms make an unpitched (drum) event. */
export const SOUND_ROLES: readonly string[] = ["s", "sound"];

export interface RoledRange extends CodeRange {
  fn: string | null;
}

export function roleRanges(code: string, ranges: readonly CodeRange[]): RoledRange[] {
  return ranges.map((r) => ({ from: r.from, to: r.to, fn: callOf(code, r.from) }));
}

/**
 * The ranges that made the event, by role: the pitch atoms for a pitched event, the sound atoms for a
 * drum hit. Falls back to the earliest-applied atom (the last entry) when no location has the role.
 */
export function primaryRanges(code: string, ranges: readonly CodeRange[], pitched: boolean): CodeRange[] {
  if (ranges.length === 0) return [];
  const roled = roleRanges(code, ranges);
  const wanted = pitched ? PITCH_ROLES : SOUND_ROLES;
  for (const role of wanted) {
    const hits = roled.filter((r) => r.fn === role);
    if (hits.length > 0) return hits.map(({ from, to }) => ({ from, to }));
  }
  if (!pitched) {
    // A drum written as note("…").s("bd") still has its `s` atom; a pitched role is the next best.
    for (const role of PITCH_ROLES) {
      const hits = roled.filter((r) => r.fn === role);
      if (hits.length > 0) return hits.map(({ from, to }) => ({ from, to }));
    }
  }
  const last = ranges[ranges.length - 1] as CodeRange;
  return [{ from: last.from, to: last.to }];
}

/** `{start,end}` (Strudel) → `{from,to}` (Oak). */
export function toRanges(locs: readonly { start: number; end: number }[]): CodeRange[] {
  return locs.map((l) => ({ from: l.start, to: l.end }));
}

/** Two half-open ranges overlap; a caret (empty range) touching an atom counts. */
export function overlaps(a: CodeRange, b: CodeRange): boolean {
  if (a.from === a.to) return a.from >= b.from && a.from <= b.to;
  if (b.from === b.to) return b.from >= a.from && b.from <= a.to;
  return a.from < b.to && b.from < a.to;
}
