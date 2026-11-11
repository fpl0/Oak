// The Strudel function catalog (architecture §3.4): one entry per name a learner can type. It feeds the
// Toolbox cards (through content/toolbox.ts), autocomplete, and the tutor's cached prefix
// (content/.generated/tutor/catalog.md). Every example is evaluated headlessly by content CI and may use
// only tools that are unlocked at the entry's own unlock site in every legal order.
import type { ToolId } from "@oak/content-kit";

export const FN_KINDS = ["function", "method", "control", "signal", "mini", "syntax", "argument"] as const;
/**
 * function: called on its own (`s`, `note`, `arrange`). method: reshapes a pattern in time or pitch.
 * control: sets how each event sounds. signal: a continuous value source. mini: an operator inside a
 * pattern string. syntax: a way of writing the file (labels, `const`, tempo lines). argument: a named
 * value of another function (`dict("triads")`).
 */
export type FnKind = (typeof FN_KINDS)[number];

export interface FnEntry {
  /** As written in code: `scale`, `swingBy`, `~`, `<a b>`. Unique in the catalog. */
  name: string;
  /** Other spellings of the same thing (`sound` for `s`). */
  aliases?: string[];
  /** The row of the unlock table that unlocks it. */
  tool: ToolId;
  kind: FnKind;
  signature: string;
  /** Plain language for an adult programmer who is new to music: what you hear, then how it is written. */
  explanation: string;
  /** A whole file in the Oak dialect (content/STYLE.md): it evaluates, and it is not silent. */
  example: string;
  /** Traps that make no error and no silence. */
  gotchas?: string[];
  /** How to hear the same thing on strudel.cc when it is not the same code. Absent = the same code. */
  strudelCc?: string;
}

/** `setcpm(bpm/4)`, a blank line, then the tracks: the file shape of STYLE §1 in 4/4. */
export const ex = (bpm: number, ...tracks: string[]): string => `setcpm(${bpm}/4)\n\n${tracks.join("\n")}`;
/** The same with `const` definitions between the tempo line and the tracks. */
export const exConst = (bpm: number, consts: string[], ...tracks: string[]): string =>
  `setcpm(${bpm}/4)\n\n${consts.join("\n")}\n\n${tracks.join("\n")}`;
/** A file in another meter: `units` is the divisor of the tempo line (contracts §6.9). */
export const exMeter = (bpm: number, units: number, ...tracks: string[]): string =>
  `setcpm(${bpm}/${units})\n\n${tracks.join("\n")}`;

export function defineFns(entries: FnEntry[]): readonly FnEntry[] {
  for (const e of entries) {
    if (!/^tb\.[A-Za-z0-9]+(\.[A-Za-z0-9-]+)*$/.test(e.tool))
      throw new Error(`catalog: "${e.name}" names "${e.tool}", which is not a tool ID`);
    if (!e.example.startsWith("setcpm("))
      throw new Error(`catalog: the example of "${e.name}" has no tempo line`);
    if (e.explanation.trim() === "" || e.signature.trim() === "")
      throw new Error(`catalog: "${e.name}" needs a signature and an explanation`);
  }
  return Object.freeze(entries.map((e) => Object.freeze(e)));
}
