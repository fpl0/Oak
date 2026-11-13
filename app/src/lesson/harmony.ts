// Pure harmony helpers of the lesson host (Wave 4): the chords of a hand voicing as `chord()` mini-notation for
// the voicing gate's unlock moment, and a lead sheet's chart as notation labels. The chord identities always come
// from the grader's harmony view (`harmonyView`), never from a table here. No DOM (`bun test`).
import type { ChordLabel } from "@oak/notation";

/** The chord symbols of a hand-voiced piece, bar by bar, as `chord()` mini-notation: `<C F G C>`. */
export function chordPatternOf(
  slots: readonly { code: string }[],
  barOf: (slot: number) => number,
  bars: number,
): string | null {
  if (slots.length === 0) return null;
  const perBar: string[][] = Array.from({ length: bars }, () => []);
  slots.forEach((s, i) => {
    const b = barOf(i);
    if (b >= 0 && b < bars) perBar[b]?.push(s.code);
  });
  // A bar with no new chord holds the one before (a chord held over a bar line).
  let last = slots[0]?.code ?? "";
  const cells = perBar.map((cs) => {
    if (cs.length === 0) return last;
    last = cs[cs.length - 1] as string;
    return cs.length === 1 ? (cs[0] as string) : `[${cs.join(" ")}]`;
  });
  return cells.length === 1 ? (cells[0] as string) : `<${cells.join(" ")}>`;
}

/** A chart entry (bar 1-based, 0 = pickup) → a notation label (0-based cycle; with a pickup, cycle 0 is bar 0). */
export function chartLabels(
  chart: readonly { bar: number; beat: number; symbol: string }[],
  pickup: boolean,
): ChordLabel[] {
  return chart.map((c) => ({ bar: pickup ? c.bar : c.bar - 1, beat: c.beat, symbol: c.symbol }));
}
