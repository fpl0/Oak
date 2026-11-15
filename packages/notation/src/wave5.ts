// Wave 5 (docs/design/wave5.md §3.3): section labels from the section list, the 12-bar chart (four bars a line,
// chord symbols, a slash per beat, every bar written out) as a layout (`chartLayout`, the DOM view in
// `@oak/notation/render` `renderChart`) and as engraved ABC (`chartAbc`, slash noteheads under the symbols), and the
// display of dominant sevenths. Pure. Minor key signatures with raised 6 and 7 as accidentals, blue notes and
// approach tones spelled by direction, section labels and "Swing 8ths" on the staff are engraved by `buildScore` +
// `toAbc` (spelling through `@oak/theory`).
import type { KeySpec, MeterSpec, SwingSpec } from "@oak/content-kit";
import { chordSymbol } from "@oak/theory";
import { abcChordText } from "./abc.ts";
import { chordDisplay, jazzChordDisplay, keySig } from "./theory-port.ts";
import type { NotationWarning, SectionMark } from "./types.ts";

/** One section of the list `sectionsFromAst` / `formView` gives (0-based `startBar`). */
export interface SectionSpanInput {
  label: string;
  tag: string;
  startBar: number;
  bars: number;
}

const titleCase = (tag: string): string => {
  const m = /^([a-z]+)(\d+)?$/.exec(tag);
  if (!m) return tag;
  const word = (m[1] as string).charAt(0).toUpperCase() + (m[1] as string).slice(1);
  return m[2] ? `${word} ${m[2]}` : word;
};

/**
 * The marks a staff draws for a piece's sections: "Verse", "Chorus", "Chorus 2" over the first bar of each, a
 * double barline before every section after the first. `startBar`/`bars` of the engraved window (default: all)
 * keep only marks inside it.
 */
export function sectionMarks(
  sections: readonly SectionSpanInput[],
  window?: { startBar: number; bars: number },
): SectionMark[] {
  const marks = sections.map((s, i) => ({
    bar: s.startBar,
    text: titleCase(s.tag),
    tag: s.tag,
    doubleBar: i > 0,
  }));
  if (!window) return marks;
  return marks.filter((m) => m.bar >= window.startBar && m.bar < window.startBar + window.bars);
}

// --- the 12-bar chart -------------------------------------------------------------------------------

export interface ChartInput {
  /** Chords in code spelling with their 0-based bar and 1-based beat (as `NotationInput.chords`). */
  chords: readonly { bar: number; beat: number; symbol: string }[];
  /** Bars in the chart (12 for one chorus, 24 for two). */
  bars: number;
  /**
   * 0-based cycle of the chart's first bar (default 0). With a pickup the host passes 1, so the chart starts on the
   * first full bar and numbers it 1 (c4). A chord that started before the first bar is shown on it.
   */
  startBar?: number;
  meter: MeterSpec;
  key: KeySpec | null;
  /** Default 4 (contracts: a 12-bar chart is three lines of four). */
  barsPerLine?: number;
  swing?: SwingSpec;
  title?: string;
  /** Section marks over the chart (a chart of a sectioned piece). */
  sections?: readonly SectionMark[];
  /**
   * Wave 7: the chord-symbol style, as `NotationInput.chordStyle` (default lead-sheet). A learner who turned on jazz
   * glyphs (J1.L02) reads the chart in the same names as the chord band and the staff (D–7, C∆7, Bø7).
   */
  chordStyle?: "lead-sheet" | "jazz";
}
export interface ChartChord {
  /** 1-based beat inside the bar. */
  beat: number;
  /** Display text ("B♭7", "C°"). */
  text: string;
  /** The symbol as given (code spelling). */
  symbol: string;
}
export interface ChartBar {
  /** 1-based bar number. */
  bar: number;
  /** Chords that start in this bar; empty when the previous chord carries on (drawn as slashes only). */
  chords: ChartChord[];
  /** One slash per beat (`meter.unitsPerBar`); a beat that starts a chord shows the symbol over its slash. */
  slashes: number;
  /** The chord sounding at beat 1 (carried from an earlier bar when this bar has none). */
  sounding: string | null;
  /** A section mark at this bar. */
  section: SectionMark | null;
}
export interface ChartLayout {
  title: string | null;
  /** "Swing 8ths" / "Swing 16ths", as the staff prints it (contracts §6.10 item 3). */
  swingText: string | null;
  lines: ChartBar[][];
}

/** A chord chart: bars in lines of four, chord symbols where they change, a slash per beat. */
export function chartLayout(input: ChartInput): ChartLayout {
  const per = Math.max(1, input.barsPerLine ?? 4);
  const start = Math.max(0, Math.floor(input.startBar ?? 0));
  const sorted = [...input.chords].sort((a, b) => a.bar - b.bar || a.beat - b.beat);
  const beats = input.meter.unitsPerBar;
  const style = input.chordStyle ?? "lead-sheet";
  const chartChordText = (symbol: string): string => chartChordTextIn(symbol, style);
  // The chord sounding when the chart starts (it began in an earlier bar, or in the pickup).
  const before = sorted.filter((c) => c.bar < start);
  const prior = before[before.length - 1];
  let sounding: string | null = prior ? chartChordText(prior.symbol) : null;
  const bars: ChartBar[] = [];
  for (let b = start; b < start + Math.max(0, input.bars); b++) {
    const inBar = sorted.filter((c) => c.bar === b);
    const first = inBar[0];
    const carried = first && first.beat <= 1 ? null : sounding;
    const chords = inBar.map((c) => ({ beat: c.beat, text: chartChordText(c.symbol), symbol: c.symbol }));
    // The first bar always names its chord, also one carried in from before the chart.
    if (b === start && carried !== null && prior)
      chords.unshift({ beat: 1, text: carried, symbol: prior.symbol });
    const atOne = first && first.beat <= 1 ? chartChordText(first.symbol) : carried;
    const last = inBar[inBar.length - 1];
    if (last) sounding = chartChordText(last.symbol);
    bars.push({
      bar: b - start + 1,
      chords,
      slashes: beats,
      sounding: atOne,
      section: input.sections?.find((s) => s.bar === b) ?? null,
    });
  }
  const lines: ChartBar[][] = [];
  for (let i = 0; i < bars.length; i += per) lines.push(bars.slice(i, i + per));
  return {
    title: input.title ?? null,
    swingText: input.swing ? (input.swing.subdivision === 8 ? "Swing 8ths" : "Swing 16ths") : null,
    lines,
  };
}

/** Spoken text of one bar: "Bar 9: C7" / "Bar 6: F7, then F°7 on beat 3" / "Bar 2: F7 continues". */
export function chartBarText(bar: ChartBar): string {
  const head = bar.section ? `${bar.section.text}, bar ${bar.bar}` : `Bar ${bar.bar}`;
  if (bar.chords.length === 0)
    return bar.sounding ? `${head}: ${bar.sounding} continues` : `${head}: no chord`;
  const [first, ...rest] = bar.chords;
  const parts = [
    first && first.beat > 1 && bar.sounding
      ? `${bar.sounding}, then ${first.text} on beat ${first.beat}`
      : (first?.text ?? ""),
    ...rest.map((c) => `then ${c.text} on beat ${c.beat}`),
  ];
  return `${head}: ${parts.join(", ")}`;
}

/**
 * A chord symbol as a chart prints it (lead-sheet display, Unicode accidentals): "Bb7" → "B♭7", "Co" → "C°".
 * Dominant sevenths keep the plain "7" (the staff engraves the same through abcjs `chordSymbolDisplay`).
 */
export function chartChordText(symbol: string): string {
  return chordSymbol(symbol, "lead-sheet") ?? symbol;
}
/** A chord symbol as a chart prints it in a style: lead-sheet (`chartChordText`) or jazz glyphs (D–7, C∆7, Bø7). */
export function chartChordTextIn(symbol: string, style: "lead-sheet" | "jazz"): string {
  return style === "jazz" ? jazzChordDisplay(symbol) : chartChordText(symbol);
}

// --- the chart engraved (slash noteheads) -------------------------------------------------------------

export interface ChartAbcOptions {
  /** Class prefix of a bar's slashes: `oak-cb3` on every slash of chart bar 3 (1-based). Default "oak-cb". */
  classPrefix?: string;
  /** Number the first bar of every line after the first (default true). */
  barNumbers?: boolean;
}
export interface ChartAbc {
  abc: string;
  layout: ChartLayout;
  /** Chord placements the chart could not draw where they stand (a chord off the beat, two on one beat). */
  warnings: NotationWarning[];
}
/** One slash per tempo unit, as ABC lengths with `L:1/16`. */
const UNIT_SIXTEENTHS = { quarter: 4, dottedQuarter: 6, eighth: 2 } as const;

/**
 * A chord chart engraved by abcjs: one five-line staff of slash noteheads (one per beat, abcjs `style=rhythm`), the
 * chord symbols over the slash of their beat, four bars a line, "Swing 8ths" and section labels over the bar they
 * start, a double barline before each section, the key signature, and every bar written out (no repeat signs).
 * Each slash carries `oak-cb{bar}` so a host can light the bar that is playing. A chord that starts between two
 * beats is drawn on the beat before it and warned (`abcjs-limit`): a chart has a slash per beat only.
 */
export function chartAbc(input: ChartInput, opts: ChartAbcOptions = {}): ChartAbc {
  const layout = chartLayout(input);
  const prefix = opts.classPrefix ?? "oak-cb";
  const warnings: NotationWarning[] = [];
  const start = Math.max(0, Math.floor(input.startBar ?? 0));
  const unit = UNIT_SIXTEENTHS[input.meter.tempoUnit];
  const slash = unit === 4 ? "4" : String(unit);
  const ks = keySig(input.key);
  const header = ["X:1"];
  if (layout.title) header.push(`T:${layout.title.replace(/\n/g, " ")}`);
  header.push(`M:${input.meter.num}/${input.meter.den}`, "L:1/16");
  if (layout.swingText) header.push(`Q:"${layout.swingText}"`);
  if (layout.lines.some((l) => l.some((b) => b.section))) header.push("%%partsfont Helvetica 13 bold");
  if (opts.barNumbers ?? true) header.push("%%barnumbers 0");
  header.push("V:CH clef=treble style=rhythm", `K:${ks.notes.length > 7 ? "C" : ks.abcK}`);
  const lines: string[] = [];
  const all = layout.lines.flat();
  for (const line of layout.lines) {
    const parts: string[] = [];
    for (const bar of line) {
      const idx = all.indexOf(bar);
      let body = "";
      if (bar.section) body += `[P:${bar.section.text.replace(/[[\]\n%]/g, " ").trim()}]`;
      const byBeat = new Map<number, string[]>();
      for (const c of bar.chords) {
        const beat = Math.min(bar.slashes, Math.max(1, Math.floor(c.beat + 1e-9)));
        if (Math.abs(beat - c.beat) > 1e-9)
          warnings.push({
            code: "abcjs-limit",
            bar: start + bar.bar - 1,
            message: `the chord "${c.text}" starts between beats ${beat} and ${beat + 1}: a chart has a slash per beat, so it is drawn on beat ${beat}`,
          });
        const shown = input.chordStyle === "jazz" ? jazzChordDisplay(c.symbol) : chordDisplay(c.symbol);
        byBeat.set(beat, [...(byBeat.get(beat) ?? []), abcChordText(shown.replace(/"/g, "'"))]);
      }
      const slashes: string[] = [];
      for (let beat = 1; beat <= bar.slashes; beat++) {
        let tok = "";
        const here = byBeat.get(beat) ?? [];
        if (here.length > 1)
          warnings.push({
            code: "abcjs-limit",
            bar: start + bar.bar - 1,
            message: `two chords on beat ${beat} (${here.join(", ")}): the chart shows the last`,
          });
        const sym = here[here.length - 1];
        if (sym) tok += `"${sym}"`;
        tok += `!class=${prefix}${bar.bar}!B${slash}`;
        slashes.push(tok);
      }
      body += slashes.join(" ");
      const next = all[idx + 1];
      const close = !next ? " |]" : next.section?.doubleBar ? " ||" : " |";
      parts.push(body + close);
    }
    lines.push(parts.join(" "));
  }
  return { abc: `${header.join("\n")}\n${lines.join("\n")}\n`, layout, warnings };
}
