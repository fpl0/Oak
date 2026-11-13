// The form answer's logic (contracts §6.3 item 4, wave5.md §11): the labels a `form` answer offers, the timeline
// of section blocks (widths from `sectionBars`), the keys that fill them, the "order" mode's card pool, and the
// letters a filled answer reads as. Pure: tested with `bun test`.
import { FORM_SECTION_NAMES, type FormSectionName, formLetters } from "@oak/content-kit";
import type { AnswerSpecOf } from "./types.ts";

export type FormSpec = AnswerSpecOf<"form">;

export interface FormOption {
  /** What the value holds: `"verse"`, or a letter `"A"`. */
  id: string;
  /** Printed: "Verse", "Pre-chorus", "A". */
  label: string;
  /** The key that picks it: a digit (names) or the letter itself (letters). */
  key: string;
}

const NAME_LABEL: Readonly<Record<FormSectionName, string>> = {
  intro: "Intro",
  verse: "Verse",
  prechorus: "Pre-chorus",
  chorus: "Chorus",
  bridge: "Bridge",
  solo: "Solo",
  outro: "Outro",
};

/** The most letters a letter strip offers: AABA needs two, verse–chorus–bridge three; six covers any song. */
export const MAX_LETTERS = 6;

/** The printed name of a section label: `"chorus2"` → "Chorus 2", `"prechorus"` → "Pre-chorus", `"B"` → "B". */
export function sectionText(id: string): string {
  if (/^[A-Z]$/.test(id)) return id;
  const m = /^([a-z]+?)(\d+)?$/.exec(id.trim().toLowerCase());
  if (!m) return id;
  const base = (NAME_LABEL as Record<string, string>)[m[1] as string] ?? id;
  return m[2] ? `${base} ${m[2]}` : base;
}

/** The labels the strip offers, in the order authored (names) or alphabetical (letters). */
export function formOptions(spec: Pick<FormSpec, "vocabulary" | "sections">): FormOption[] {
  if (spec.vocabulary === "letters") {
    const n = Math.max(2, Math.min(MAX_LETTERS, spec.sections));
    return Array.from({ length: n }, (_, i) => {
      const letter = String.fromCharCode(65 + i);
      return { id: letter, label: letter, key: letter };
    });
  }
  const names = spec.vocabulary.filter((v) => (FORM_SECTION_NAMES as readonly string[]).includes(v));
  return names.map((id, i) => ({ id, label: sectionText(id), key: String(i + 1) }));
}

/** The option a key picks: a digit for names (1-based), a letter (any case) for letters. */
export function optionForKey(options: readonly FormOption[], key: string): FormOption | null {
  const k = key.length === 1 ? key.toUpperCase() : key;
  return options.find((o) => o.key === k) ?? null;
}

export interface FormBlock {
  index: number;
  /** 1-based first bar, when `sectionBars` is known. */
  startBar: number | null;
  bars: number | null;
  /** Share of the strip's width (0–1); equal shares without `sectionBars`. */
  share: number;
}

/** The timeline: one block per section, as wide as its bars (a 4-bar intro is half an 8-bar verse). */
export function formBlocks(spec: Pick<FormSpec, "sections" | "sectionBars">): FormBlock[] {
  const bars = spec.sectionBars?.length === spec.sections ? spec.sectionBars : null;
  const total = bars ? bars.reduce((a, b) => a + Math.max(1, b), 0) : spec.sections;
  let start = 1;
  return Array.from({ length: spec.sections }, (_, index) => {
    const b = bars ? Math.max(1, bars[index] as number) : null;
    const block: FormBlock = { index, startBar: b ? start : null, bars: b, share: (b ?? 1) / total };
    if (b) start += b;
    return block;
  });
}

/** "Bars 1–8", "Bar 9", or "Section 3" without bar counts. */
export function blockSpan(b: FormBlock): string {
  if (b.startBar === null || b.bars === null) return `Section ${b.index + 1}`;
  return b.bars === 1 ? `Bar ${b.startBar}` : `Bars ${b.startBar}–${b.startBar + b.bars - 1}`;
}

/**
 * Puts a label in the chosen block (or the first empty one, else the last) and returns the block to fill next:
 * the next empty block to its right, wrapping, or null when the strip is full.
 */
export function placeLabel(
  value: readonly string[],
  n: number,
  id: string,
  at: number | null,
): { value: string[]; next: number | null } {
  const slots = Array.from({ length: n }, (_, k) => value[k] ?? "");
  const first = slots.indexOf("");
  const i = at ?? (first < 0 ? n - 1 : first);
  slots[i] = id;
  let next: number | null = null;
  for (let k = 1; k <= n; k++) {
    const j = (i + k) % n;
    if (slots[j] === "") {
      next = j;
      break;
    }
  }
  return { value: slots, next };
}

/** Backspace: clears the chosen block if it holds a label, else the last filled one. */
export function clearLabel(
  value: readonly string[],
  n: number,
  at: number | null,
): { value: string[]; at: number } {
  const slots = Array.from({ length: n }, (_, k) => value[k] ?? "");
  let i = at !== null && slots[at] !== "" ? at : -1;
  if (i < 0)
    for (let k = n - 1; k >= 0; k--)
      if (slots[k] !== "") {
        i = k;
        break;
      }
  if (i >= 0) slots[i] = "";
  return { value: slots, at: Math.max(0, i) };
}

/**
 * The letters the answer reads as so far ("A B A B"), the shape the grader compares (`formLetters`): names and
 * letters alike, a tagged section (`chorus2`) as its type. Empty blocks print as "·" and do not count.
 */
export function readsAsLetters(value: readonly string[]): string {
  const filled = value.filter((x) => x !== "");
  const letters = formLetters(filled).split("");
  let k = 0;
  return value.map((x) => (x === "" ? "·" : (letters[k++] ?? "·"))).join(" ");
}

// --- order mode -----------------------------------------------------------------------------------

/** Whether each card goes in once (as many sections as cards) or may repeat (more sections than cards). */
export function cardsRepeat(spec: Pick<FormSpec, "vocabulary" | "sections">): boolean {
  return formOptions(spec).length < spec.sections;
}

/** The cards still to place: every card when they repeat, else the ones not yet in the sequence. */
export function cardPool(
  spec: Pick<FormSpec, "vocabulary" | "sections">,
  value: readonly string[],
): FormOption[] {
  const all = formOptions(spec);
  if (cardsRepeat(spec)) return all;
  return all.filter((o) => !value.includes(o.id));
}

/** Appends a card to the sequence (order mode); a full sequence stays as it is. */
export function appendCard(value: readonly string[], n: number, id: string): string[] {
  const seq = value.filter((x) => x !== "");
  if (seq.length >= n) return [...value];
  seq.push(id);
  return [...seq, ...Array.from({ length: n - seq.length }, () => "")];
}

/** Removes the card at a position and closes the gap (order mode). */
export function removeCard(value: readonly string[], n: number, at: number): string[] {
  const seq = value.filter((x) => x !== "");
  seq.splice(at, 1);
  return [...seq, ...Array.from({ length: n - seq.length }, () => "")];
}

/** Moves a placed card one step earlier or later (order mode). */
export function shiftCard(
  value: readonly string[],
  at: number,
  dir: -1 | 1,
): { value: string[]; at: number } {
  const out = [...value];
  const to = at + dir;
  if (to < 0 || to >= out.length || out[at] === "" || out[to] === "") return { value: out, at };
  [out[at], out[to]] = [out[to] as string, out[at] as string];
  return { value: out, at: to };
}
