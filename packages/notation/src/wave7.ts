// Wave 7 seam (docs/design/wave7.md §3.3): what a host passes for the advanced tracks' staves. Chord symbols in the
// jazz glyph style from the one chord table, the two-bar clave line, a 32-bar lead sheet's section letters, comping
// as slash notation under its chord symbols, bracket texts over a hemiola or a polyrhythm, a polymeter drawn with
// accents in one meter, and the helpers that build them. Odd-meter beaming by grouping (7/8 as 2+2+3, 9/8i as
// 2+2+2+3) and "Swing 16ths" are built since Waves 1 and 5: pass the meter (`meterWith`) and the swing; Wave 7 adds
// the printed grouping (`NotationInput.showGrouping`), bar-wide tuplets for a polyrhythm's other pulse
// (`NotationInput.polyTuplets`) and ghost notes (`NotationInput.ghosts`, ghost.ts).
import type { MeterSpec, NEvent, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import { type ClaveDirection, type ClaveType, claveSteps, METERS } from "@oak/theory";
import { chordDisplay, jazzChordDisplay } from "./theory-port.ts";
import type { NotationInput, RhythmBracketInput, SectionMark } from "./types.ts";

/** How chord symbols are printed over a staff: lead-sheet (`Cmaj7`, `Cm7♭5`) or jazz glyphs (`C∆7`, `Cø7`, `C–7`). */
export const CHORD_SYMBOL_STYLES = ["lead-sheet", "jazz"] as const;
export type ChordSymbolStyle = (typeof CHORD_SYMBOL_STYLES)[number];

/**
 * One code symbol as printed in a style; both come from the one chord table. An unknown symbol prints as written.
 * The engraver does the same for every chord of an input with `chordStyle` set (`NotationInput.chordStyle`).
 */
export function chordSymbolText(code: string, style: ChordSymbolStyle = "lead-sheet"): string {
  return style === "jazz" ? jazzChordDisplay(code) : chordDisplay(code);
}

const hit = (track: string, onset: Rat, dur: Rat, k: number, gain = 0.8): NEvent => ({
  id: `${track}|${R.floor(onset)}|${onset[0]}/${onset[1]}|rim|${k}`,
  track,
  onset,
  dur,
  midi: null,
  pitchSource: "none",
  gain,
  locs: [],
  drum: "rim",
  s: "rim",
});

/**
 * The two-bar clave line (R3.L02, RC2; the CLAVE lens): a percussion staff of rim strokes on the eighth grid, bar by
 * bar as `claveSteps` gives them (son 3-2: 0 3 6 | 2 4).
 */
export function claveLineInput(
  type: ClaveType,
  direction: ClaveDirection,
  opts: { startBar?: number } = {},
): NotationInput {
  const start = opts.startBar ?? 0;
  const events = claveSteps(type, direction).map((s, k) => hit("perc", rat(start * 8 + s, 8), rat(1, 8), k));
  return {
    events,
    meter: METERS["4/4"],
    key: null,
    bars: 2,
    startBar: start,
    staff: "percussion",
    labels: "counts",
  };
}

/**
 * Section letters for a lead sheet (J4.L03–L04, JC3: 32 bars AABA): a mark at the first bar of each section, a
 * double bar before every one but the first. `letters` in order, `bars` per section (one number for all).
 */
export function formSectionMarks(
  letters: readonly string[],
  bars: number | readonly number[],
  startBar = 0,
): SectionMark[] {
  const out: SectionMark[] = [];
  let at = startBar;
  letters.forEach((text, i) => {
    out.push({ bar: at, text, tag: text.toLowerCase(), doubleBar: i > 0 });
    at += typeof bars === "number" ? bars : (bars[i] ?? 0);
  });
  return out;
}

/**
 * Comping as slash notation under its chord symbols (J3.L03's Charleston and push; a lead sheet's rhythm section):
 * the attacks of `track` on a one-line rhythm staff, one slash per onset (`slashes`), with `chords` above. Each
 * stroke lasts until the track's notes at that onset stop (the longest of them), keeps their loudest level (so a
 * quiet stab can read as a ghost with `ghosts`), and a push tied over the bar line stays tied.
 */
export function compingInput(
  events: readonly NEvent[],
  opts: {
    track: string;
    meter?: MeterSpec;
    bars: number;
    startBar?: number;
    chords?: NotationInput["chords"];
  },
): NotationInput {
  const byOnset = new Map<string, NEvent[]>();
  for (const e of events)
    if (e.track === opts.track) byOnset.set(R.str(e.onset), [...(byOnset.get(R.str(e.onset)) ?? []), e]);
  const strokes = [...byOnset.values()]
    .map((list) => ({
      onset: (list[0] as NEvent).onset,
      dur: list.map((e) => e.dur).reduce((a, b) => R.max(a, b)),
      gain: Math.max(...list.map((e) => e.gain)),
    }))
    .sort((a, b) => R.cmp(a.onset, b.onset))
    .map((s, k) => hit(opts.track, s.onset, s.dur, k, s.gain));
  return {
    events: strokes,
    meter: opts.meter ?? METERS["4/4"],
    key: null,
    bars: opts.bars,
    ...(opts.startBar !== undefined ? { startBar: opts.startBar } : {}),
    staff: "rhythm",
    slashes: true,
    ...(opts.chords ? { chords: opts.chords } : {}),
  };
}

/**
 * A bracket over a span: "3:2" over a polyrhythm, "3+3 / 2+2+2" over a hemiola (`NotationInput.brackets`). abcjs
 * draws a bracket line only for a tuplet; the text stands over the note or rest that starts the span
 * (`ABCJS_LIMITS` "rhythm-bracket").
 */
export type RhythmBracket = RhythmBracketInput;

/**
 * What the engraver does not do yet; a host that needs one says so on the page instead of drawing it wrong. Empty
 * since Wave 7 Build: slash noteheads and the brackets are drawn (what abcjs itself cannot draw is in `ABCJS_LIMITS`).
 */
export const WAVE7_NOTATION_UNBUILT: readonly { id: string; what: string }[] = [];

/**
 * A polymeter in one meter (R2.L05: `{bd ~ ~}%4`, a pattern of `steps` steps played at `stepsPerBar` steps a bar):
 * the accents on every note of `track` that starts the pattern again, and one bracket over the bars it takes to
 * line up with the bar again ("3 over 4" over three bars), from `bar` (default 0). Oak does not draw two meters at
 * once (`ABCJS_LIMITS` "polymeter").
 */
export function polymeterMarks(opts: {
  track: string;
  steps: number;
  stepsPerBar: number;
  bar?: number;
}): Pick<NotationInput, "cycleAccents" | "brackets"> & { periodBars: number } {
  const every = rat(opts.steps, opts.stepsPerBar);
  const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
  const periodBars = opts.steps / g(opts.steps, opts.stepsPerBar);
  const bar = opts.bar ?? 0;
  return {
    cycleAccents: [{ track: opts.track, every }],
    brackets: [{ bar, from: rat(0), to: rat(periodBars), text: `${opts.steps} over ${opts.stepsPerBar}` }],
    periodBars,
  };
}

/**
 * A hemiola (R2.L03). Across the bar line: two bars of 3/4 heard as three groups of two beats, the bracket over both
 * bars ("3 × 2"). Inside a compound bar (`compound: true`): one bar of 6/8 heard in three quarters, the bracket over
 * that bar, which is then written in quarter-note beats (`beatsPerBar` 3) so its quarters read as three.
 */
export function hemiolaBracket(
  bar: number,
  text = "3 × 2",
  opts: { compound?: boolean } = {},
): RhythmBracketInput {
  return opts.compound
    ? { bar, from: rat(0), to: rat(1), text, beatsPerBar: 3 }
    : { bar, from: rat(0), to: rat(2), text };
}

/**
 * A polyrhythm of `a` against `b` in each bar (R2.L04: 3:2, 4:3): the bracket text over every bar from `bar`, and
 * the bar-wide tuplet for the track that plays `a` when it needs one (`a` over a bar whose beats are `b`: four in
 * the time of three over 3/4; three against two over 4/4 the quantizer writes by itself).
 */
export function polyrhythmMarks(opts: {
  track: string;
  a: number;
  b: number;
  bar?: number;
  bars: number;
}): Pick<NotationInput, "polyTuplets" | "brackets"> {
  const from = opts.bar ?? 0;
  return {
    polyTuplets: opts.a > opts.b ? [{ track: opts.track, p: opts.a, q: opts.b }] : [],
    brackets: Array.from({ length: opts.bars }, (_, i) => ({
      bar: from + i,
      from: rat(0),
      to: rat(1),
      text: `${opts.a}:${opts.b}`,
    })),
  };
}
