// STYLE §5.2 ("Which dictionary knows which symbol"), read from content/STYLE.md itself, and the measure that
// turns the notes a dictionary voiced into the table's ✓ / — / ✗. Shared by wave4.pw.ts (the adapter's realm in
// the browser) and style-chords.test.ts (headless Strudel against @oak/theory's `chordInDict`).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROWS } from "../../theory/src/chord-table.ts";
import { chordOf, chordPcs, noteToMidi, parseChordSymbol } from "../../theory/src/index.ts";

export const ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
/** Every root spelling a lesson writes (STYLE §5.1: uppercase with `#` or `b`): the twelve and their enharmonics. */
export const ROOT_SPELLINGS = [...ROOTS, "C#", "D#", "Gb", "G#", "A#"] as const;
export const DICTS = ["ireal", "ireal-ext", "triads", "lefthand", "guidetones"] as const;
export type Dict = (typeof DICTS)[number];
export type Status = "ok" | "missing" | "wrong";
export interface StyleCell {
  suffix: string;
  dict: Dict;
  status: Status;
}

/** STYLE §5.2, parsed from content/STYLE.md: the tests follow the table wherever it changes. */
export function styleTable(): StyleCell[] {
  const md = readFileSync(resolve(import.meta.dirname, "../../../content/STYLE.md"), "utf8");
  const start = md.indexOf("| Symbol | `ireal` (default)");
  if (start < 0) throw new Error("STYLE §5.2 table not found");
  const lines = md.slice(start).split("\n");
  const rows = lines.slice(
    2,
    lines.findIndex((l, i) => i > 1 && !l.startsWith("|")),
  );
  const cells: StyleCell[] = [];
  const mark = (c: string): Status => (c === "✓" ? "ok" : c === "✗" ? "wrong" : "missing");
  for (const row of rows) {
    const [head, ...cols] = row
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cols.length !== DICTS.length || head === undefined) throw new Error(`bad STYLE row: ${row}`);
    const codes = [...head.matchAll(/`C([^`]*)`/g)].map((m) => m[1] as string);
    if (codes.length > 0) {
      for (const suffix of codes)
        cols.forEach((c, i) => {
          cells.push({ suffix, dict: DICTS[i] as Dict, status: mark(c) });
        });
    } else {
      // "minor-major seventh": each cell names the spelling that dictionary takes, or —.
      cols.forEach((c, i) => {
        const code = /`C([^`]*)`/.exec(c)?.[1];
        cells.push({ suffix: code ?? "m^7", dict: DICTS[i] as Dict, status: code ? "ok" : "missing" });
      });
    }
  }
  return cells;
}

export const pcsOf = (notes: readonly unknown[]): number[] =>
  [
    ...new Set(
      notes
        .map((n) => (typeof n === "number" ? n : typeof n === "string" ? noteToMidi(n) : null))
        .filter((m): m is number => m !== null && Number.isFinite(m))
        .map((m) => ((Math.round(m) % 12) + 12) % 12),
    ),
  ].sort((a, b) => a - b);

/** What a dictionary did with `symbol`: ok = ≥ 2 notes, every one a chord tone or the row's usual tension. */
export function statusOf(symbol: string, notes: readonly unknown[]): Status {
  const c = parseChordSymbol(symbol);
  if (!c) throw new Error(`@oak/theory cannot read ${symbol}`);
  const row = ROWS.find((r) => r.quality === c.quality);
  const root = chordPcs(chordOf(c.root, c.quality))[0] as number;
  const allowed = new Set([...chordPcs(c), ...(row?.tensions ?? []).map((t) => (t + root) % 12)]);
  const pcs = pcsOf(notes);
  if (pcs.length === 0) return "missing";
  return pcs.length >= 2 && pcs.every((p) => allowed.has(p)) ? "ok" : "wrong";
}
