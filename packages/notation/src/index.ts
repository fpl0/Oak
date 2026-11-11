// @oak/notation: events in, NotationModel out, ABC text out. Notation is always rendered from code by
// this engine; nobody hand-writes ABC. Isomorphic: abcjs itself is only touched by the app's StaffView.
// Promote spikes/s4-notation (quantize.ts, abc.ts) and fix its recorded gotchas.
import type { NEvent, Rat } from "@oak/content-kit";
import type { AbcOptions, AbcResult, NotationInput, Score } from "./types.ts";

export * from "./types.ts";

function todo(name: string): never {
  throw new Error(`@oak/notation: ${name} is not implemented yet`);
}

/**
 * The pipeline: straighten a declared swing → key context → voices and staves → bars (split at integer
 * cycles into tie chains; bar 0 partial for a pickup) → beat groups from `meter.grouping` → tuplets
 * (p ≤ 9, else snap and set `approximate`) → durations → spelling by @oak/theory → Score.
 */
export function buildScore(input: NotationInput): Score {
  return todo(`buildScore(${input.events.length} events, ${input.meter.id})`);
}
/**
 * ABC for abcjs 6.7.2. Every note or chord carries ONE decoration `!class=oak-eN!` placed before the
 * chord brackets and after a tuplet marker; a rest carries none. Chord symbols are emitted in display
 * form (`h7` is never printed literally). `L:1/16`.
 */
export function toAbc(score: Score, opts?: AbcOptions): AbcResult {
  return todo(`toAbc(${score.bars} bars, ${opts?.barsPerLine})`);
}
/** `buildScore` + `toAbc`. */
export function notate(input: NotationInput, opts?: AbcOptions): { score: Score; abc: AbcResult } {
  const score = buildScore(input);
  return { score, abc: toAbc(score, opts) };
}
/** The `n`s of the items sounding at `cycle` (for `.oak-playing`; highlighting is driven by Strudel's clock, never abcjs timing). */
export function activeNotes(score: Score, cycle: number): number[] {
  return todo(`activeNotes(${score.bars}, ${cycle})`);
}
/** The staff-input answer model back to events (spelled pitches kept in `written`). */
export function scoreToEvents(score: Score, track?: string): NEvent[] {
  return todo(`scoreToEvents(${score.bars}, ${track})`);
}
/** The note-list DSL of content tests: 'C4:4 D4:8 r:8 [C4,E4]:2' → events (durations as 1/n of a whole note). */
export function parseNoteList(dsl: string, opts?: { track?: string; start?: Rat }): NEvent[] {
  return todo(`parseNoteList(${dsl}, ${opts?.track})`);
}
/** Where a drum sound sits on the percussion staff and which notehead it takes (bd F4, sd C5, hh G5 with x heads). */
export function drumStaffPosition(s: string): { pitch: string; head: "normal" | "x" } | null {
  return todo(`drumStaffPosition(${s})`);
}
