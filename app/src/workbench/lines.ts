// The Wave 5 line views of the Workbench (docs/design/wave5.md §3.2, §4.3, §4.4): the form of the piece read from the
// per-track `arrange()` (the section ribbon, the form map and its energy curve), the bass line's roles under the
// chords (root, fifth, octave, approach), blue notes against the key and swing per track (the "Swing" badge). Every
// fact comes from the grader's views (`formView`, `bassView`, `swingView`, `bluesView`) and `@oak/theory`
// (`blueNoteOf`), the functions the rules grade with, so the Workbench never says something a grade contradicts.
// Pure and synchronous: built with the model (model.ts) and tested in wave5.test.ts.
import type { KeySpec, MeterId, NEvent, PickupSpec } from "@oak/content-kit";
import {
  type BassView,
  type BluesView,
  bassView,
  bluesView,
  type ContrastAxis,
  contrastAxes,
  type FormView,
  formView,
  type Normalized,
  sectionsFromAst,
  swingView,
  type TrackSwing,
} from "@oak/grader";
import { type BassRole, type BlueNote, blueNoteOf } from "@oak/theory";
import { type FormViewSection, formProblemOf, formSectionsOf } from "../lib/form-view.ts";

/** A bass note's role as the lens prints it: R, 5, 8, 3, 7 or → (an approach into the next chord). */
export interface BassMark {
  role: BassRole;
  tag: string;
  /** "root of C", "approach (chromatic, from below) into F". */
  words: string;
}

export interface WorkbenchLines {
  form: FormView;
  /** The ribbon's sections (`[]` without `arrange()` or when the tracks disagree). */
  sections: FormViewSection[];
  /** The tracks disagree about the sections: the first disagreement in words, else `null`. */
  problem: string | null;
  /**
   * The song is longer than the bars analysed (a 136-bar arrangement; the Workbench reads at most
   * `MAX_PIECE_BARS`): the sections are cut there, and this says how much was left out. `null` when it all fits.
   */
  cut: FormCut | null;
  bass: BassView | null;
  /** Bass role per event ID. */
  bassMarks: ReadonlyMap<string, BassMark>;
  /** Blue note per event ID (single-line notes only; a chord's seventh is not a blue note). */
  blue: ReadonlyMap<string, BlueNote>;
  swing: readonly TrackSwing[];
  blues: BluesView | null;
}

/** What a form cut at the analysed bars leaves out (`WorkbenchLines.cut`). */
export interface FormCut {
  /** Bars analysed and shown. */
  bars: number;
  /** Bars the arrangement runs. */
  total: number;
  /** Sections that start past the analysed bars ("Chorus 2", …), in order. */
  hidden: string[];
}

/**
 * The sections a Workbench can show: those that start inside the analysed bars, the last one ending there. A
 * section past them would draw over bars the roll does not have, be silent in the form map and loop nothing.
 */
export function clipSections(
  sections: readonly FormViewSection[],
  bars: number,
): { sections: FormViewSection[]; hidden: string[] } {
  const shown: FormViewSection[] = [];
  const hidden: string[] = [];
  for (const s of sections) {
    if (s.startBar >= bars) hidden.push(s.text);
    else shown.push(s.startBar + s.bars > bars ? { ...s, bars: bars - s.startBar } : s);
  }
  return { sections: shown, hidden };
}

/** The cut in words for the form map: "The song runs 136 bars; these are its first 64 (Chorus 2 … Outro not shown)." */
export function cutText(cut: FormCut): string {
  const h = cut.hidden;
  const names = h.length === 0 ? "" : h.length === 1 ? ` ${h[0]} is` : ` ${h[0]} to ${h[h.length - 1]} are`;
  return `The song runs ${cut.total} bars; the Workbench reads its first ${cut.bars}.${names ? `${names} not shown.` : ""}`;
}

export const BASS_TAG: Readonly<Record<BassRole, string>> = {
  root: "R",
  fifth: "5",
  octave: "8",
  third: "3",
  seventh: "7",
  approach: "→",
  other: "·",
};

const BASS_WORDS: Readonly<Record<BassRole, string>> = {
  root: "root",
  fifth: "fifth",
  octave: "octave",
  third: "third",
  seventh: "seventh",
  approach: "approach",
  other: "another note",
};

const APPROACH_WORDS: Record<string, string> = {
  "chromatic-below": "a half step below",
  "chromatic-above": "a half step above",
  "diatonic-below": "a scale step below",
  "diatonic-above": "a scale step above",
  dominant: "from its fifth",
};

/** Most bars the Workbench analyses for an arranged piece (a 32-bar demo pages through the roll). */
export const MAX_PIECE_BARS = 64;

/**
 * The bars a Workbench analyses: the step's (or the sketch's) loop, or the whole arranged song when the code's
 * `arrange()` is longer, so every section reaches the roll, the ribbon and the section loop. The code is parsed,
 * never run; a code that does not parse keeps the loop's bars.
 */
export function pieceBarsOf(code: string, loopBars: number): number {
  if (!code.includes("arrange")) return loopBars;
  try {
    const ast = sectionsFromAst(code);
    if (!ast || "inconsistent" in ast) return loopBars;
    return Math.max(loopBars, Math.min(MAX_PIECE_BARS, Math.ceil(ast.totalBars)));
  } catch {
    return loopBars;
  }
}

/** Notes alone in their track at their onset (a chord's notes are not blue notes, nor a bass line's chords). */
function singleLine(events: readonly NEvent[]): NEvent[] {
  const at = new Map<string, number>();
  const key = (e: NEvent) => `${e.track}|${e.onset[0]}/${e.onset[1]}`;
  for (const e of events) if (e.midi !== null) at.set(key(e), (at.get(key(e)) ?? 0) + 1);
  return events.filter((e) => e.midi !== null && at.get(key(e)) === 1 && e.chordSymbol === undefined);
}

export interface LinesContext {
  code: string;
  meter: MeterId;
  key: KeySpec | null;
  pickup?: PickupSpec | null;
  bars: number;
}

/** The line views of an analysed piece. Each view fails alone: a broken view never hides the others. */
export function linesOf(n: Normalized, ctx: LinesContext): WorkbenchLines {
  const base = {
    meter: ctx.meter,
    ...(ctx.key ? { key: ctx.key } : {}),
    ...(ctx.pickup ? { pickup: ctx.pickup } : {}),
  };
  let form: FormView;
  try {
    form = formView(n, { code: ctx.code, bars: ctx.bars });
  } catch {
    form = { kind: "through", letters: "", phraseBars: 4, totalBars: ctx.bars, energy: [] };
  }
  let bass: BassView | null = null;
  try {
    bass = bassView(n, { ...base, bars: ctx.bars });
  } catch {
    bass = null;
  }
  const bassMarks = new Map<string, BassMark>();
  for (const note of bass?.notes ?? []) {
    if (!note.role) continue;
    const chord = note.chord ? ` of ${note.chord}` : "";
    const words =
      note.role === "approach"
        ? `approach into the next chord${note.approach ? `, ${APPROACH_WORDS[note.approach] ?? ""}` : ""}`
        : `${BASS_WORDS[note.role]}${chord}`;
    bassMarks.set(note.id, { role: note.role, tag: BASS_TAG[note.role], words });
  }
  const blue = new Map<string, BlueNote>();
  if (ctx.key)
    for (const e of singleLine(n.all)) {
      const b = blueNoteOf(e.midi as number, ctx.key);
      if (b) blue.set(e.id, b);
    }
  let swing: TrackSwing[] = [];
  try {
    swing = swingView(n, ctx.meter);
  } catch {
    swing = [];
  }
  let blues: BluesView | null = null;
  try {
    blues = ctx.bars >= 12 ? bluesView(n, { ...base, bars: ctx.bars }) : null;
  } catch {
    blues = null;
  }
  const all = formSectionsOf(form);
  const clipped = clipSections(all, ctx.bars);
  const cut =
    form.kind === "sections" && form.totalBars > ctx.bars
      ? { bars: ctx.bars, total: form.totalBars, hidden: clipped.hidden }
      : null;
  return {
    form,
    sections: clipped.sections,
    problem: formProblemOf(form),
    cut,
    bass,
    bassMarks,
    blue,
    swing,
    blues,
  };
}

/** "Swing 8ths" / "Swing 16ths" for a swung track, else `null` (contracts §6.10 item 3: the staff's own words). */
export function swingText(t: Pick<TrackSwing, "swung">): string | null {
  return t.swung === 8 ? "Swing 8ths" : t.swung === 16 ? "Swing 16ths" : null;
}

/** The swing badge per track label. */
export function swingBadges(swing: readonly TrackSwing[]): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const t of swing) {
    const text = swingText(t);
    if (text) out.set(t.track, text);
  }
  return out;
}

/** A blue note in words for the hover text: "♭3 (me), a blue note". */
export function blueWords(b: BlueNote): string {
  return `${b.degree.replace("b", "♭")} (${b.syllable}), a blue note`;
}

/** The tag a blue note carries on the roll: "♭3". */
export function blueTag(b: BlueNote): string {
  return b.degree.replace("b", "♭");
}

// --- the ribbon and the form map ----------------------------------------------------------------------------

/**
 * Bars of a section as the learner reads them: 1-based, or counting from the first full bar after a pickup (c4:
 * the pickup is bar 0, so the cycle is the bar number).
 */
export function sectionBarsText(s: Pick<FormViewSection, "startBar" | "bars">, pickup: boolean): string {
  const first = s.startBar + (pickup ? 0 : 1);
  const last = first + s.bars - 1;
  return s.bars === 1 ? `bar ${first}` : `bars ${first}–${last}`;
}

/** The section's accessible name: "Chorus 2, bars 9–12, energy 70%". */
export function sectionLabel(s: FormViewSection, pickup: boolean): string {
  return `${s.text}, ${sectionBarsText(s, pickup)}, energy ${Math.round(s.energy * 100)}%`;
}

/** A section named by a letter (`melA`, `melB2`: "A", "B 2"): its name is its letter. */
export function letterNamed(s: Pick<FormViewSection, "text">): boolean {
  return /^[A-Z](?: \d+)?$/.test(s.text);
}

/**
 * "A B A B", the shape of the song by letters (first appearance). Sections the code names by letter keep their own
 * (`melB` then `melA` reads "B A", never "A B").
 */
export function formLetters(sections: readonly FormViewSection[]): string {
  const own = sections.length > 0 && sections.every(letterNamed);
  return sections.map((s) => (own ? (s.text[0] as string) : s.letter)).join(" ");
}

export const CONTRAST_WORDS: Readonly<Record<ContrastAxis, string>> = {
  density: "more or fewer notes",
  register: "higher or lower",
  instrumentation: "different instruments",
  loudness: "louder or quieter",
  "harmonic-rhythm": "chords change at another rate",
  pitch: "the tune sits higher or lower",
  energy: "more or less energy",
};

/** How the first two different section types differ (the form map's "Verse against Chorus"), or `null`. */
export function firstContrast(form: FormView): { a: string; b: string; axes: ContrastAxis[] } | null {
  if (form.kind !== "sections") return null;
  const first = form.sections[0];
  const other = form.sections.find((s) => first && s.label !== first.label);
  if (!first || !other) return null;
  const title = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return {
    a: title(first.label),
    b: title(other.label),
    axes: contrastAxes(first.features, other.features),
  };
}

/** The energy curve as SVG path points over `width` × `height` (y grows down), one point per bar centre. */
export function energyPath(energy: readonly number[], width: number, height: number, bars?: number): string {
  const n = bars ?? energy.length;
  if (n <= 0 || energy.length === 0) return "";
  const step = width / n;
  return energy
    .slice(0, n)
    .map((v, i) => {
      const x = step * (i + 0.5);
      const y = height - Math.max(0, Math.min(1, v)) * (height - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** The bar (0-based) of a cycle inside the piece, `null` when stopped. */
export function barOfCycle(cycle: number | null, bars: number): number | null {
  if (cycle === null || !Number.isFinite(cycle) || bars <= 0) return null;
  return Math.floor(((cycle % bars) + bars) % bars);
}

// --- the chord chart (U11.L05–L06, C5, X2) ---------------------------------------------------------------

export interface ChartRegionInput {
  from: number;
  to: number;
  symbol: string;
}

/**
 * The chart's input from the chord band's regions: one chord where each region starts (0-based bar, 1-based
 * beat), counted from the first full bar when bar 0 is a pickup (c4: chart bar 1 is cycle 1), the pickup's chords
 * left out, each written without its slash bass (a chart names the changes). `bars` is the piece's bars less the
 * pickup.
 */
export function chartChordsOf(
  regions: readonly ChartRegionInput[],
  beatsPerBar: number,
  totalBars: number,
  pickup: boolean,
): { chords: { bar: number; beat: number; symbol: string }[]; bars: number } {
  const shift = pickup ? 1 : 0;
  const chords = regions
    .filter((r) => r.from >= shift - 1e-9)
    .map((r) => {
      const bar = Math.floor(r.from + 1e-9);
      const beat = 1 + Math.round((r.from - bar) * beatsPerBar * 1000) / 1000;
      // A chart writes the changes, not the voicing: "B♭7/D" (an inversion `.voicing()` chose) is B♭7 here.
      return { bar: bar - shift, beat, symbol: r.symbol.replace(/\/.*$/, "") };
    });
  return { chords, bars: Math.max(0, totalBars - shift) };
}

/** The 12-bar form in words: "12-bar blues, quick change, with a turnaround · 2 choruses", or why not. */
export function bluesText(b: BluesView | null): string | null {
  if (!b) return null;
  if (!b.form)
    return b.wrongBars.length > 0 && b.wrongBars.length <= 4
      ? `Not a 12-bar blues yet: bar${b.wrongBars.length === 1 ? "" : "s"} ${b.wrongBars.join(", ")} leave${b.wrongBars.length === 1 ? "s" : ""} the form.`
      : null;
  const kind = b.form.jazz ? "jazz blues" : b.form.variant === "quick-change" ? "quick change" : "standard";
  const turn = b.form.turnaround ? ", with a turnaround" : "";
  const n = b.choruses === 1 ? "1 chorus" : `${b.choruses} choruses`;
  const dom = b.allDominant ? " · every chord a dominant seventh" : "";
  return `12-bar blues, ${kind}${turn} · ${n}${dom}`;
}

/**
 * The bars a code's longest `<…>` alternation takes (one entry a bar, `x!n` counting n; `.slow()` ignored), at most
 * 64: how long the chord changes run before they repeat, read from the text (the analysis only queries the loop).
 */
export function alternationBars(code: string): number {
  let most = 1;
  for (const m of code.matchAll(/"([^"]*)"/g)) {
    const text = m[1] as string;
    let depth = 0;
    let angle = -1;
    let count = 0;
    let token = "";
    const flush = () => {
      const t = token.trim();
      if (t) {
        const rep = /!(\d+)$/.exec(t);
        count += rep ? Number(rep[1]) : 1;
      }
      token = "";
    };
    for (const ch of text) {
      if ("<[{(".includes(ch)) {
        if (ch === "<" && angle < 0) {
          angle = depth;
          count = 0;
        }
        depth++;
        if (angle >= 0 && depth - 1 > angle) token += ch;
        continue;
      }
      if (">]})".includes(ch)) {
        depth--;
        if (ch === ">" && depth === angle) {
          flush();
          most = Math.max(most, count);
          angle = -1;
          continue;
        }
        if (angle >= 0) token += ch;
        continue;
      }
      if (angle >= 0 && depth === angle + 1 && /\s/.test(ch)) flush();
      else if (angle >= 0) token += ch;
    }
  }
  return Math.min(64, most);
}
