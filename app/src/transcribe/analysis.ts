// JC4's analysis stage (session 1, content/specs/J5.md "JC4.S1"; Wave 7): the standard's chart as the song gives it,
// and the learner's analysis on top of it — a Roman numeral under every chord, a bracket over every ii–V, the form
// map — checked bar by bar. The same pieces serve J4.L04 (reading a standard) through the package's public exports.
//
// Numerals are graded by degree, chroma and bass, never by string (contracts §6.6): a numeral is right when the
// chord it names in the key in force at that bar has the chord's root, its triad (and its seventh, when the
// numeral writes one) and its bass: `V7/vi` and `III7` both name E7 in C. A ii–V is a minor seventh (or half-
// diminished) chord followed by a dominant a fourth up (`@oak/theory` `twoFiveTarget`), across a bar line or
// inside a bar. Feedback below the reveal names the bar and what kind of thing is wrong, never the numeral that is
// right (corrections rule d). Pure, so every rule is unit-tested.
import type { KeySpec } from "@oak/content-kit";
import type { ChordId } from "@oak/theory";
import {
  displayRN,
  parseChordWithBass,
  parseRN,
  rnToChord,
  romanOf,
  SEVENTH_CORE,
  triadCore,
  twoFiveTarget,
} from "@oak/theory";
import { formatKey } from "../lib/format.ts";

/** What the stage needs of a song (`SongDef`): the key, the key plan, the chart, the sections. */
export interface AnalysisSource {
  title: string;
  key: KeySpec;
  /** 1-based bars (0 = a pickup); the first entry is the song's key. */
  keyPlan?: readonly { bar: number; key: KeySpec }[] | null;
  /** Full bars of the tune. */
  bars: number;
  /** The lead-sheet chords in code spelling (`SongDef.answerKey.chords`). */
  chords: readonly { bar: number; beat: number; symbol: string }[];
  /** The form (`SongDef.answerKey.sections`). */
  sections: readonly { label: string; bars: readonly [number, number] }[];
}

/** One chord of the chart, in the order it sounds. */
export interface ChartSlot {
  /** Index over the whole chart. */
  index: number;
  /** 1-based bar. */
  bar: number;
  beat: number;
  symbol: string;
  chord: ChordId;
  key: KeySpec;
}

/** The bars and the share of right bars the stage passes at (the form map must be right as well). */
export const ANALYSIS_PASS = 0.85;

/** The key in force at a 1-based bar (the last key-plan entry at or before it). */
export function keyAtBar(source: Pick<AnalysisSource, "key" | "keyPlan">, bar: number): KeySpec {
  let key = source.key;
  for (const e of source.keyPlan ?? []) if (e.bar <= bar) key = e.key;
  return key;
}

/** The chart's chords in order, each with the key it is read in. Chords before bar 1 (a pickup) are left out. */
export function chartSlots(source: AnalysisSource): ChartSlot[] {
  return [...source.chords]
    .filter((c) => c.bar >= 1 && c.bar <= source.bars)
    .sort((a, b) => a.bar - b.bar || a.beat - b.beat)
    .flatMap((c) => {
      const chord = parseChordWithBass(c.symbol);
      return chord
        ? [{ bar: c.bar, beat: c.beat, symbol: c.symbol, chord, key: keyAtBar(source, c.bar) }]
        : [];
    })
    .map((s, index) => ({ ...s, index }));
}

/** The numeral each chord has (shown on reveal): `romanOf` with the next chord for applied chords. */
export function expectedNumerals(slots: readonly ChartSlot[]): string[] {
  return slots.map((s, i) => {
    const next = slots[i + 1];
    return displayRN(romanOf(s.chord, s.key, next && next.bar >= s.bar ? next.chord : undefined));
  });
}

/** The slots that begin a ii–V (the ii chord's index): a ii followed by its V, wherever the bar line falls. */
export function twoFiveStarts(slots: readonly ChartSlot[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < slots.length; i++) {
    const a = slots[i] as ChartSlot;
    const b = slots[i + 1] as ChartSlot;
    if (twoFiveTarget(a.chord, b.chord)) out.push(i);
  }
  return out;
}

const TRIADS: ReadonlySet<string> = new Set(["maj", "min", "dim", "aug", "sus2", "sus4"]);

export type NumeralVerdict = "ok" | "empty" | "unreadable" | "degree" | "quality" | "bass";

/** Whether a written numeral names the chord that sounds, in the key in force there. */
export function judgeNumeral(text: string, slot: Pick<ChartSlot, "chord" | "key">): NumeralVerdict {
  const t = text.trim();
  if (!t) return "empty";
  const rn = parseRN(t.replace(/∆/g, "maj"), slot.key);
  if (!rn) return "unreadable";
  const named = rnToChord(rn, slot.key);
  const want = slot.chord;
  if (named.rootPc !== want.rootPc) return "degree";
  if (triadCore(named).quality !== triadCore(want).quality) return "quality";
  // A numeral that writes a seventh must write the chord's seventh (`ii7` for Dm9 is right: the same seventh); one
  // without a seventh reads the triad (`ii` for Dm7 is right).
  const sev = SEVENTH_CORE[named.quality];
  const writesSeventh = !TRIADS.has(sev);
  if (writesSeventh && sev !== SEVENTH_CORE[want.quality]) return "quality";
  if (named.bassPc !== want.bassPc) return "bass";
  return "ok";
}

/** The learner's analysis: a numeral per slot, the ii–V brackets by their first slot, the form map. */
export interface AnalysisAnswer {
  numerals: readonly string[];
  brackets: readonly number[];
}

export interface AnalysisBarResult {
  bar: number;
  ok: boolean;
  /** One sentence per problem in the bar, in order; empty when right. */
  notes: string[];
}

export interface AnalysisCheck {
  bars: AnalysisBarResult[];
  /** Right bars over all bars. */
  score: number;
  numeralsRight: number;
  numeralsTotal: number;
  bracketsRight: boolean;
  passed: boolean;
  summary: string;
}

function numeralNote(v: NumeralVerdict, where: string, key: KeySpec, text: string): string {
  switch (v) {
    case "empty":
      return `${where}: no numeral yet.`;
    case "unreadable":
      return `${where}: "${text.trim()}" isn't a numeral Oak reads (I to vii, with 7, ø7, °7 or /V).`;
    case "degree":
      return `${where}: that numeral's root isn't this chord's root, counted from ${formatKey(key)}.`;
    case "quality":
      return `${where}: the degree is right; the numeral's quality doesn't match the chord's.`;
    case "bass":
      return `${where}: the chord is right; the bass isn't in that position.`;
    case "ok":
      return "";
  }
}

/**
 * Checks the numerals and brackets bar by bar (`passed` also needs the form map, graded by `gradeFormMap`, which
 * the host passes as `formOk`). A bar is right when every chord in it has a right numeral and the brackets that
 * start in it are exactly the ii–Vs that start in it.
 */
export function checkAnalysis(
  source: AnalysisSource,
  answer: AnalysisAnswer,
  opts: { formOk: boolean; pass?: number } = { formOk: true },
): AnalysisCheck {
  const slots = chartSlots(source);
  const want = new Set(twoFiveStarts(slots));
  const got = new Set(answer.brackets);
  let numeralsRight = 0;
  const bars: AnalysisBarResult[] = [];
  for (let bar = 1; bar <= source.bars; bar++) {
    const inBar = slots.filter((s) => s.bar === bar);
    const notes: string[] = [];
    for (const s of inBar) {
      const text = answer.numerals[s.index] ?? "";
      const v = judgeNumeral(text, s);
      if (v === "ok") numeralsRight++;
      else {
        const where =
          inBar.length > 1 ? `Bar ${bar}, ${s === inBar[0] ? "first" : "second"} chord` : `Bar ${bar}`;
        notes.push(numeralNote(v, where, s.key, text));
      }
    }
    const starts = inBar.map((s) => s.index);
    const missing = starts.filter((i) => want.has(i) && !got.has(i));
    const extra = starts.filter((i) => got.has(i) && !want.has(i));
    if (extra.length > 0)
      notes.push(
        `Bar ${bar}: a bracket here isn't a ii–V (check the two chords' qualities and the root's move).`,
      );
    if (missing.length > 0) notes.push(`Bar ${bar}: look again for a ii–V moving through this bar.`);
    bars.push({ bar, ok: notes.length === 0, notes });
  }
  const right = bars.filter((b) => b.ok).length;
  const score = bars.length === 0 ? 0 : right / bars.length;
  const bracketsRight = [...want].every((i) => got.has(i)) && [...got].every((i) => want.has(i));
  const passed = opts.formOk && score >= (opts.pass ?? ANALYSIS_PASS) - 1e-9;
  return {
    bars,
    score,
    numeralsRight,
    numeralsTotal: slots.length,
    bracketsRight,
    passed,
    summary: `${right} of ${bars.length} bars right${opts.formOk ? "" : "; the form map isn't right yet"}.`,
  };
}

/** The analysis as the reveal shows it (rung 4): every numeral and bracket, marked revealed by the host. */
export function revealedAnalysis(source: AnalysisSource): AnalysisAnswer {
  const slots = chartSlots(source);
  return { numerals: expectedNumerals(slots), brackets: twoFiveStarts(slots) };
}

/** The bracket a slot opens, for drawing: the ii's index and its V's (in the same bar or the next). */
export function bracketSpan(
  slots: readonly ChartSlot[],
  start: number,
): { from: ChartSlot; to: ChartSlot } | null {
  const from = slots[start];
  const to = slots[start + 1];
  return from && to ? { from, to } : null;
}
