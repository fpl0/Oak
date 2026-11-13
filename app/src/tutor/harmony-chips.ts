// Where a chord or a numeral the tutor names sounds in the music on screen (Wave 4, ux §6.4): a `[[chord:Am]]` or
// `[[rn:vi]]` chip lights the bars it sounds in on the roll and the staff. The bars come from the subject's chord
// map (`TutorSubject.harmony`, which a surface fills from the Workbench's `harmonyView`), else from the code's
// first `chord("…")` pattern read statically. Two chords are the same when @oak/theory reads the same root,
// quality and bass from them; a numeral is turned into its chord in the subject's key first. Pure.
import { type ChordId, chordOfRoman, type KeySpec, parseChordWithBass, romanText } from "@oak/theory";

/** One chord of the piece on screen: 1-based display bar (0 = a pickup bar), optional beat. */
export interface ChordAt {
  bar: number;
  beat?: number;
  /** Lead-sheet or code symbol ("G/B", "Am", "Bo"). */
  symbol: string;
  /** The numeral the analysis read, when it has one (Oak's dialect, "V6"). */
  rn?: string | null;
}

/** Splits a mini-notation sequence at its top level: `C [F G] Am` → `C`, `[F G]`, `Am`. */
function topLevel(src: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of src) {
    if (ch === "[" || ch === "<" || ch === "{") depth++;
    if (ch === "]" || ch === ">" || ch === "}") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const symbolOf = (item: string) => item.replace(/[!@*].*$/, "").trim();

/**
 * The chords of the first `chord("…")` pattern, bar by bar. `<C G Am F>` is one chord per bar; `C G` (no angle
 * brackets) is one bar; `[F G]` inside angle brackets shares a bar. Anything it cannot read gives no entries.
 */
export function chordMapFromCode(code: string | null | undefined, key: KeySpec | null = null): ChordAt[] {
  if (!code) return [];
  const m = /\bchord\(\s*["'`]([^"'`]{1,400})["'`]/.exec(code);
  if (!m) return [];
  const src = (m[1] as string).trim();
  const perBar = src.startsWith("<") && src.endsWith(">") ? topLevel(src.slice(1, -1)) : [`[${src}]`];
  const out: ChordAt[] = [];
  perBar.forEach((item, i) => {
    const inner = item.startsWith("[") && item.endsWith("]") ? topLevel(item.slice(1, -1)) : [item];
    const beats = inner.length;
    inner.forEach((sym, j) => {
      const symbol = symbolOf(sym);
      if (symbol === "~" || symbol === "" || !parseChordWithBass(symbol)) return;
      const entry: ChordAt = { bar: i + 1, symbol };
      if (beats > 1) entry.beat = 1 + Math.round((j * 4) / beats);
      if (key) {
        try {
          entry.rn = romanText(parseChordWithBass(symbol) as ChordId, key);
        } catch {
          entry.rn = null;
        }
      }
      out.push(entry);
    });
  });
  return out;
}

const same = (a: ChordId, b: ChordId) =>
  a.rootPc === b.rootPc && a.quality === b.quality && a.bassPc === b.bassPc;

/** Bars (ascending, unique) where the chord or numeral of a token sounds. */
export function barsWhere(
  map: readonly ChordAt[],
  token: { kind: "chord" | "rn"; value: string },
  key: KeySpec | null,
): number[] {
  let want: ChordId | null = null;
  if (token.kind === "chord") want = parseChordWithBass(token.value);
  else if (key) want = chordOfRoman(token.value, key);
  const bars = new Set<number>();
  for (const c of map) {
    const have = parseChordWithBass(c.symbol);
    const byChord = want !== null && have !== null && same(want, have);
    // Without a key to build the numeral's chord, the analysis's own numeral is compared as written.
    const byNumeral =
      want === null && token.kind === "rn" && c.rn !== undefined && c.rn !== null && c.rn === token.value;
    if (byChord || byNumeral) bars.add(c.bar);
  }
  return [...bars].sort((a, b) => a - b);
}

/** Consecutive bars as runs: 3 4 7 → [3–4], [7–7]. */
export function runsOf(bars: readonly number[]): { from: number; to: number }[] {
  const runs: { from: number; to: number }[] = [];
  for (const b of bars) {
    const last = runs.at(-1);
    if (last && b === last.to + 1) last.to = b;
    else runs.push({ from: b, to: b });
  }
  return runs;
}

/** "bar 3", "bars 3 and 7", "bars 1, 5 and 8". */
export function barsPhrase(bars: readonly number[]): string {
  if (bars.length === 0) return "";
  if (bars.length === 1) return `bar ${bars[0]}`;
  return `bars ${bars.slice(0, -1).join(", ")} and ${bars.at(-1)}`;
}

/** The part of the grader's `HarmonyView` a chord map is read from (structural: no grader import here). */
export interface HarmonyViewLike {
  slots: readonly { symbol: string; rn: string | null }[];
  beats: readonly { bar: number; beat: number; chord: number | null; change: boolean }[];
}

/**
 * The chord map of an analysed piece (`harmonyView`, as the Workbench holds it): one entry where each chord
 * starts, with the bar as the views number it (1-based, a pickup bar 0) and the numeral in Oak's dialect.
 */
export function chordAtsOfView(view: HarmonyViewLike | null | undefined): ChordAt[] {
  if (!view) return [];
  const out: ChordAt[] = [];
  for (const b of view.beats) {
    if (!b.change || b.chord === null) continue;
    const slot = view.slots[b.chord];
    if (!slot) continue;
    const entry: ChordAt = { bar: b.bar, symbol: slot.symbol, rn: slot.rn };
    if (b.beat > 1) entry.beat = b.beat;
    out.push(entry);
  }
  return out;
}
