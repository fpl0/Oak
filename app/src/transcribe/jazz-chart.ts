// A jazz chart taken down by ear and checked bar by bar (Wave 7: the jazz track's sources; J4.L04 reads a standard,
// the gym's jazz items, JC4's analysis reads the chart the song gives). Symbols are read with @oak/theory's one
// chord table, whatever the spelling (`D-7` = `D–7` = `Dm7`, `C∆7` = `C^7` = `Cmaj7`, `Bø` = `Bm7b5`), and compared
// by root, quality, extensions and bass, never by string (contracts §6.6). A wrong bar is named with what is wrong
// in the learner's OWN symbol ("the ♯9 you wrote"), never with the chord that sounds (corrections rule d: no
// feedback below rung 4 names the answer). Pure, so every rule is unit-tested.

import type { ChordSymbolStyle } from "@oak/notation";
import type { ChordId } from "@oak/theory";
import { jazzSymbol, parseChordWithBass, SEVENTH_CORE, toJazzGlyph, toLeadSheet } from "@oak/theory";

/** One bar of a chart: one chord symbol or two (the second from the bar's middle), in any spelling. */
export type JazzChartBar = readonly string[];

/** Bars a jazz chart passes at, like a standard's changes stage (`STANDARD_LADDER_PASS.changes`). */
export const JAZZ_CHART_PASS = 0.85;

export type JazzSlotVerdict =
  | "ok"
  | "empty"
  | "unreadable"
  | "root"
  | "quality"
  | "extension-wrong"
  | "extension-missing"
  | "bass";

export interface JazzBarResult {
  /** 1-based. */
  bar: number;
  ok: boolean;
  /** The first thing wrong in the bar (`ok` when nothing is). */
  verdict: JazzSlotVerdict | "count";
  /** One sentence for the bar; `null` when it is right. Never names the expected chord. */
  text: string | null;
}

export interface JazzChartCheck {
  bars: JazzBarResult[];
  /** Right bars over all bars. */
  score: number;
  passed: boolean;
  /** "9 of 12 bars right." */
  summary: string;
}

/** A tension label as the learner reads it: `#9` → ♯9, `b13` → ♭13. */
export const tensionText = (label: string): string => label.replace(/#/g, "♯").replace(/b(?=\d)/g, "♭");

/** The chord a symbol names, or `null`; ♭ ♯ and the glyph spellings (∆ – ø °) are read. */
export function readJazzChord(symbol: string): ChordId | null {
  const s = symbol.trim();
  if (!s) return null;
  return parseChordWithBass(s.replace(/♭/g, "b").replace(/♯/g, "#"));
}

/**
 * The symbol as the chart prints it in the learner's chosen style, from the one chord table (`toLeadSheet`:
 * "Cmaj7", "B°7", "F9/A"; `toJazzGlyph`: "C∆7", "Bø7", "D–7"); unreadable text is shown as typed.
 */
export function chartSymbolText(symbol: string, style: ChordSymbolStyle = "lead-sheet"): string {
  const c = readJazzChord(symbol);
  if (!c) return symbol.trim();
  return style === "jazz" ? toJazzGlyph(c) : toLeadSheet(c);
}

/** What one written chord gets wrong against the one that sounds. */
export function compareJazzChord(
  expected: string,
  got: string,
): { verdict: JazzSlotVerdict; wrong: string[] } {
  if (!got.trim()) return { verdict: "empty", wrong: [] };
  const g = readJazzChord(got);
  if (!g) return { verdict: "unreadable", wrong: [] };
  const e = readJazzChord(expected);
  if (!e) throw new RangeError(`not a chord symbol: ${expected}`);
  if (e.rootPc !== g.rootPc) return { verdict: "root", wrong: [] };
  if (SEVENTH_CORE[e.quality] !== SEVENTH_CORE[g.quality]) return { verdict: "quality", wrong: [] };
  const want = new Set<string>(jazzSymbol(e).extensions);
  const have = jazzSymbol(g).extensions;
  const wrong = have.filter((x) => !want.has(x));
  if (wrong.length > 0) return { verdict: "extension-wrong", wrong };
  if ([...want].some((x) => !have.includes(x as never))) return { verdict: "extension-missing", wrong: [] };
  if (e.bassPc !== g.bassPc) return { verdict: "bass", wrong: [] };
  return { verdict: "ok", wrong: [] };
}

function slotText(
  bar: number,
  v: { verdict: JazzSlotVerdict; wrong: string[] },
  got: string,
  two: boolean,
  i: number,
): string {
  const where = two ? `Bar ${bar}, ${i === 0 ? "first" : "second"} chord` : `Bar ${bar}`;
  switch (v.verdict) {
    case "empty":
      return `${where}: no chord written yet.`;
    case "unreadable":
      return `${where}: "${got.trim()}" isn't a chord symbol Oak reads (try a root, then m7, 7, ∆7, ø7 or °7).`;
    case "root":
      return `${where}: the root isn't the one the bass and the chord sound. Loop the bar and hum its lowest note.`;
    case "quality":
      return `${where}: the root is right; the chord's quality is another. Listen to its third and seventh.`;
    case "extension-wrong":
      return `${where}: the chord underneath is right; the ${v.wrong.map(tensionText).join(" and ")} you wrote ${v.wrong.length > 1 ? "aren't" : "isn't"} the colour on top.`;
    case "extension-missing":
      return `${where}: the chord underneath is right; there is a colour on top your chart leaves out.`;
    case "bass":
      return `${where}: the chord is right; the bass is on another note.`;
    case "ok":
      return "";
  }
}

/**
 * Checks a chart bar by bar. A bar is right when it has as many chords as sound in it and each is right in root,
 * quality, extensions and bass. The text names the first problem of each wrong bar.
 */
export function checkJazzChart(
  expected: readonly JazzChartBar[],
  got: readonly JazzChartBar[],
  pass: number = JAZZ_CHART_PASS,
): JazzChartCheck {
  const bars: JazzBarResult[] = expected.map((want, i) => {
    const bar = i + 1;
    const have = (got[i] ?? []).filter((s) => s.trim() !== "");
    if (have.length === 0)
      return { bar, ok: false, verdict: "empty", text: `Bar ${bar}: no chord written yet.` };
    if (have.length !== want.length)
      return {
        bar,
        ok: false,
        verdict: "count",
        text:
          want.length > have.length
            ? `Bar ${bar}: the harmony moves inside this bar; your chart has one chord there.`
            : `Bar ${bar}: one chord holds the whole bar; your chart changes inside it.`,
      };
    for (let k = 0; k < want.length; k++) {
      const v = compareJazzChord(want[k] as string, have[k] as string);
      if (v.verdict !== "ok")
        return {
          bar,
          ok: false,
          verdict: v.verdict,
          text: slotText(bar, v, have[k] as string, want.length > 1, k),
        };
    }
    return { bar, ok: true, verdict: "ok", text: null };
  });
  const right = bars.filter((b) => b.ok).length;
  const score = bars.length === 0 ? 0 : right / bars.length;
  return {
    bars,
    score,
    passed: score >= pass - 1e-9,
    summary: `${right} of ${bars.length} bar${bars.length === 1 ? "" : "s"} right.`,
  };
}

/** The chart's text cells, one line per bar: `"Dm7 G7"` → `["Dm7", "G7"]` (a bar of two chords). */
export function parseChartCell(text: string): string[] {
  return text
    .split(/[\s|,]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 2);
}
