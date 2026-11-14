// The form map's logic (wave6.md §11 `form.map`; CF-T.S1 and ladder L8): the learner hears a whole tune, cuts its
// bar strip into sections and names each. The value is one entry per section, in bar order, written
// `"<first bar>:<label>"`; the first section always starts at bar 1. The grader counts a section when it starts on
// the right bar and carries the right label by shape (`gradeFormMap`), so this module never knows the answer: it
// only cuts, joins and labels. Pure: tested with `bun test`.
import { FORM_SECTION_NAMES, formLetters } from "@oak/content-kit";
import { type FormOption, type FormSpec, MAX_LETTERS, sectionText } from "./form.ts";

export interface MapSection {
  /** 1-based first bar. */
  bar: number;
  /** `""` while the section has no name yet. */
  label: string;
}

/** The value a map starts from: one unnamed section from bar 1. */
export const EMPTY_FORM_MAP: readonly string[] = ["1:"];

/** The most letters a map offers when the learner has used every one so far. */
const MAP_LETTERS_MIN = 4;

/**
 * The sections a value holds, in bar order: unreadable entries are dropped, a bar listed twice keeps its last
 * label, bars outside `1…bars` are dropped, and a map without a section at bar 1 gets an unnamed one.
 */
export function formMapSections(value: readonly string[], bars?: number): MapSection[] {
  const byBar = new Map<number, string>();
  for (const entry of value) {
    const m = /^(\d+):(.*)$/.exec(entry);
    if (!m) continue;
    const bar = Number(m[1]);
    if (!Number.isInteger(bar) || bar < 1 || (bars !== undefined && bar > bars)) continue;
    byBar.set(bar, (m[2] ?? "").trim());
  }
  if (!byBar.has(1)) byBar.set(1, "");
  return [...byBar.entries()].sort((a, b) => a[0] - b[0]).map(([bar, label]) => ({ bar, label }));
}

export function formMapValue(sections: readonly MapSection[]): string[] {
  return sections.map((s) => `${s.bar}:${s.label}`);
}

/** The value of a map given as labels and first bars (an answer key, a reveal). */
export function formMapOf(labels: readonly string[], bars: readonly number[]): string[] {
  return formMapValue(formMapSections(labels.map((label, i) => `${bars[i] ?? 0}:${label}`)));
}

/** The index of the section a bar is in. */
export function sectionAtBar(sections: readonly MapSection[], bar: number): number {
  let at = 0;
  sections.forEach((s, i) => {
    if (s.bar <= bar) at = i;
  });
  return at;
}

/** True when a section starts on this bar. */
export function isCut(value: readonly string[], bar: number): boolean {
  return formMapSections(value).some((s) => s.bar === bar);
}

/**
 * Cuts the strip before `bar`, or joins it again when a section already starts there. Bar 1 always starts a
 * section. A new section has no name; a joined section's bars go to the section before it.
 */
export function toggleCut(value: readonly string[], bar: number, bars: number): string[] {
  const sections = formMapSections(value, bars);
  if (!Number.isInteger(bar) || bar <= 1 || bar > bars) return formMapValue(sections);
  const at = sections.findIndex((s) => s.bar === bar);
  if (at >= 0) sections.splice(at, 1);
  else sections.splice(sectionAtBar(sections, bar) + 1, 0, { bar, label: "" });
  return formMapValue(sections);
}

/** Names a section; `next` is the first unnamed section after it (wrapping), or null when all are named. */
export function labelSection(
  value: readonly string[],
  index: number,
  label: string,
  bars?: number,
): { value: string[]; next: number | null } {
  const sections = formMapSections(value, bars);
  const i = Math.max(0, Math.min(sections.length - 1, index));
  sections[i] = { bar: (sections[i] as MapSection).bar, label };
  let next: number | null = null;
  for (let k = 1; k <= sections.length; k++) {
    const j = (i + k) % sections.length;
    if ((sections[j] as MapSection).label === "") {
      next = j;
      break;
    }
  }
  return { value: formMapValue(sections), next };
}

/**
 * Backspace on a section: clears its name; when it has none, joins it to the section before it (the first section
 * stays). Returns the section the cursor is in afterwards.
 */
export function clearSection(
  value: readonly string[],
  index: number,
  bars?: number,
): { value: string[]; at: number } {
  const sections = formMapSections(value, bars);
  const i = Math.max(0, Math.min(sections.length - 1, index));
  const s = sections[i] as MapSection;
  if (s.label !== "") {
    sections[i] = { bar: s.bar, label: "" };
    return { value: formMapValue(sections), at: i };
  }
  if (i === 0) return { value: formMapValue(sections), at: 0 };
  sections.splice(i, 1);
  return { value: formMapValue(sections), at: i - 1 };
}

/** Every section has a name (and there is at least one). */
export function formMapComplete(value: readonly string[], bars?: number): boolean {
  const sections = formMapSections(value, bars);
  return sections.length > 0 && sections.every((s) => s.label !== "");
}

/** What the grader reads: the labels and the 1-based first bar of each section. */
export function formMapAnswer(
  value: readonly string[],
  bars?: number,
): { sections: string[]; bars: number[] } {
  const sections = formMapSections(value, bars);
  return { sections: sections.map((s) => s.label), bars: sections.map((s) => s.bar) };
}

export interface MapBlock {
  index: number;
  label: string;
  startBar: number;
  /** Last bar, inclusive. */
  endBar: number;
  bars: number;
}

/** The sections with their spans: each runs to the bar before the next one starts, the last to the end. */
export function mapBlocks(value: readonly string[], bars: number): MapBlock[] {
  const sections = formMapSections(value, bars);
  return sections.map((s, index) => {
    const end = (sections[index + 1]?.bar ?? bars + 1) - 1;
    return { index, label: s.label, startBar: s.bar, endBar: end, bars: end - s.bar + 1 };
  });
}

/** "Bars 1–8", "Bar 9". */
export function mapSpan(b: Pick<MapBlock, "startBar" | "endBar">): string {
  return b.startBar === b.endBar ? `Bar ${b.startBar}` : `Bars ${b.startBar}–${b.endBar}`;
}

/** The piece of a section drawn in one row of the strip. */
export interface MapSegment {
  index: number;
  row: number;
  /** 0-based column of its first bar in the row, and how many bars of the row it covers. */
  col: number;
  span: number;
  /** True for the section's first piece (the label is printed there). */
  first: boolean;
}

/** Bars per row of the strip: a tune of up to 16 bars is one row, longer ones are rows of 16 (8 when not a multiple). */
export function mapPerRow(bars: number): number {
  if (bars <= 16) return Math.max(1, bars);
  return bars % 16 === 0 ? 16 : bars % 8 === 0 ? 8 : bars % 12 === 0 ? 12 : 16;
}

/** The sections cut into the strip's rows. */
export function mapSegments(blocks: readonly MapBlock[], perRow: number): MapSegment[] {
  const out: MapSegment[] = [];
  for (const b of blocks) {
    let bar = b.startBar;
    while (bar <= b.endBar) {
      const row = Math.floor((bar - 1) / perRow);
      const rowEnd = Math.min(b.endBar, (row + 1) * perRow);
      out.push({
        index: b.index,
        row,
        col: (bar - 1) % perRow,
        span: rowEnd - bar + 1,
        first: bar === b.startBar,
      });
      bar = rowEnd + 1;
    }
  }
  return out;
}

/**
 * The labels a map offers. Letters: A to D, and one more each time the learner has used them all (to F), so the
 * number of letters never says how many different sections the tune has. Names: the spec's own, in its order.
 */
export function mapOptions(spec: Pick<FormSpec, "vocabulary">, value: readonly string[]): FormOption[] {
  if (spec.vocabulary === "letters") {
    const used = new Set(
      formMapSections(value)
        .map((s) => s.label)
        .filter((x) => /^[A-Z]$/.test(x)),
    );
    const n = Math.max(MAP_LETTERS_MIN, Math.min(MAX_LETTERS, used.size + 1));
    return Array.from({ length: n }, (_, i) => {
      const letter = String.fromCharCode(65 + i);
      return { id: letter, label: letter, key: letter };
    });
  }
  const names = spec.vocabulary.filter((v) => (FORM_SECTION_NAMES as readonly string[]).includes(v));
  return names.map((id, i) => ({ id, label: sectionText(id), key: String(i + 1) }));
}

/** "A A B A": the shape the grader compares; unnamed sections print "·". */
export function mapLetters(value: readonly string[], bars?: number): string {
  const labels = formMapSections(value, bars).map((s) => s.label);
  const letters = formLetters(labels.filter((x) => x !== "")).split("");
  let k = 0;
  return labels.map((x) => (x === "" ? "·" : (letters[k++] ?? "·"))).join(" ");
}

/** "4 sections: 8 + 8 + 8 + 8 bars": what the learner has cut so far, in words. */
export function mapSummary(value: readonly string[], bars: number): string {
  const blocks = mapBlocks(value, bars);
  if (blocks.length === 1) return `One section of ${bars} bars so far. Cut it where a new section begins.`;
  return `${blocks.length} sections: ${blocks.map((b) => b.bars).join(" + ")} bars`;
}

/** Which section still has no name, for a disabled Check ("Name the section at bars 9–16."), or null. */
export function mapMissing(value: readonly string[], bars: number): string | null {
  const b = mapBlocks(value, bars).find((x) => x.label === "");
  return b ? `Name the section at ${mapSpan(b).toLowerCase()}.` : null;
}

// --- marks -------------------------------------------------------------------------------------------

/** What a host needs from `@oak/grader` `gradeFormMap` (`FormMapResult`) to mark the learner's map. */
export interface FormMapGrade {
  sections: readonly { expected: { bar: number }; ok: boolean }[];
  /** Bars the learner cut where the tune has no boundary. */
  extra: readonly number[];
}

/**
 * Per-part marks for a checked map, one per section of the LEARNER's map (the `part` is its index in the value,
 * as the widget draws it): right when the tune has a section starting there with that label by shape; not right
 * when nothing new starts there, when the label is off, or when a section of the tune starts inside it (a missing
 * cut). The notes never give a bar the learner has not cut.
 */
export function formMapMarks(
  value: readonly string[],
  grade: FormMapGrade,
  bars?: number,
): { part: number; ok: boolean; note?: string }[] {
  const sections = formMapSections(value, bars);
  const extra = new Set(grade.extra);
  const missing = grade.sections.filter((r) => !sections.some((s) => s.bar === r.expected.bar));
  return sections.map((s, part) => {
    if (extra.has(s.bar)) return { part, ok: false, note: "nothing new starts here" };
    const row = grade.sections.find((r) => r.expected.bar === s.bar);
    const end = (sections[part + 1]?.bar ?? Number.POSITIVE_INFINITY) - 1;
    const hides = missing.some((r) => r.expected.bar > s.bar && r.expected.bar <= end);
    if (hides) return { part, ok: false, note: "more than one section in here" };
    if (!row) return { part, ok: false, note: "nothing new starts here" };
    return row.ok ? { part, ok: true } : { part, ok: false, note: "not this label" };
  });
}

/**
 * The same marks from the grader's per-section credit (`gradeAnswer` on a `form` answer with `input: "map"`:
 * one slot per section of the answer key) and the spec's `sectionBars` (the key's section lengths).
 */
export function formMapMarksFromSlots(
  value: readonly string[],
  spec: Pick<FormSpec, "sectionBars" | "bars">,
  slots: readonly number[],
): { part: number; ok: boolean; note?: string }[] {
  const starts: number[] = [];
  let bar = 1;
  for (const n of spec.sectionBars ?? []) {
    starts.push(bar);
    bar += Math.max(1, n);
  }
  const sections = formMapSections(value, spec.bars);
  return formMapMarks(
    value,
    {
      sections: starts.map((b, i) => ({ expected: { bar: b }, ok: (slots[i] ?? 0) >= 1 })),
      extra: sections.map((s) => s.bar).filter((b) => !starts.includes(b)),
    },
    spec.bars,
  );
}
