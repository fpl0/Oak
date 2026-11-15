// An answer the learner has entered but not checked yet survives a reload (carry-over d4): a form, a scale on the
// builder, a chart on the bar grid, a line of numerals and notes on a staff are several clicks each, and a reload (or a crash of the
// tab) threw them away. Kept per step on this device (localStorage), under the lesson, the step, the attempt series
// and the exercise; cleared when the step is checked or left. Never sent anywhere, never evidence: the server
// learns of an answer only when it is checked. Storage may be missing or full: every call is safe without it.
import type { AnswerSpec } from "../answers/types.ts";

/** The answer surfaces whose unchecked value is kept (the ones built from several picks). */
export const DRAFT_UIS: ReadonlySet<AnswerSpec["ui"]> = new Set<AnswerSpec["ui"]>([
  "form",
  "scale-builder",
  "bar-grid",
  "rn-palette",
  // Wave 6 review: notes written on a staff (U13.L03's tied and dotted bars are a dozen keys or clicks) were lost
  // on a reload while a line of numerals came back.
  "staff-input",
  // Wave 7 review (review:journey): the track widgets built from several picks came back empty after a reload —
  // a hand voicing on the keyboard (J1.L05 shells, J3.L01 rootless), a bar cut into 2s and 3s (R2), a Euclidean
  // rhythm's three numbers (R3), the parts placed on the register map (A2).
  "keyboard",
  "grouping",
  "euclid",
  "slot-choice",
]);

export function keepsDraft(spec: AnswerSpec | null): boolean {
  return spec !== null && DRAFT_UIS.has(spec.ui);
}

const PREFIX = "oak.lesson.draft.";

/** One key per lesson step, series and exercise (a part of an `all` step has its own). */
export function draftKey(o: {
  ownerId: string;
  stepId: string;
  seriesNo: number;
  exerciseId: string;
}): string {
  return `${PREFIX}${o.ownerId}.${o.stepId}.${o.seriesNo}.${o.exerciseId}`;
}

/** The prefix every draft of one step shares (any series, any part). */
export function stepPrefix(ownerId: string, stepId: string): string {
  return `${PREFIX}${ownerId}.${stepId}.`;
}

export interface DraftStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

function store(): DraftStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Whether a stored value still fits the widget it was entered in: the same shape as the empty value (a list of
 * the same length for the slotted kinds; a list of strings or numbers for the builder and the form map). A draft
 * from an older version of the step is dropped rather than shown half-right.
 */
export function draftFits(spec: AnswerSpec, empty: unknown, value: unknown): boolean {
  // A staff's notes are one note-list string (`C4:4 D4:4 r:2`), as the widget holds them.
  if (spec.ui === "staff-input")
    return typeof value === "string" && typeof empty === "string" && value.length <= 4000;
  if (!Array.isArray(value) || !Array.isArray(empty)) return false;
  const plain = value.every((v) => typeof v === "string" || typeof v === "number");
  if (!plain) return false;
  const ints = (lo: number, hi: number) =>
    value.every((v) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi);
  // Keys picked (MIDI notes), a bar's groups of 2 and 3, a Euclidean rhythm's k, n (and r).
  if (spec.ui === "keyboard") return value.length >= 1 && value.length <= 24 && ints(0, 127);
  if (spec.ui === "grouping") return value.length >= 1 && value.length <= 16 && ints(1, 4);
  if (spec.ui === "euclid") return (value.length === 2 || value.length === 3) && ints(0, 64);
  // The scale builder and a form map grow and shrink with the learner's picks.
  if (spec.ui === "scale-builder") return value.length <= 24;
  if (spec.ui === "form" && spec.input === "map") return value.length >= 1 && value.length <= 64;
  if (spec.ui === "form" && spec.input === "order") return value.length <= empty.length;
  return value.length === empty.length && value.every((v) => typeof v === "string");
}

/** The kept draft, or `null` (none, unreadable, or not this widget's shape). */
export function loadDraft(
  key: string,
  spec: AnswerSpec,
  empty: unknown,
  s: DraftStore | null = store(),
): unknown {
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (raw === null) return null;
    const parsed = (JSON.parse(raw) as { v?: unknown }).v;
    if (!draftFits(spec, empty, parsed)) {
      s.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Keeps the value; a value equal to the empty one clears the draft instead (nothing to restore). */
export function saveDraft(key: string, value: unknown, empty: unknown, s: DraftStore | null = store()): void {
  if (!s) return;
  try {
    if (JSON.stringify(value) === JSON.stringify(empty)) s.removeItem(key);
    else s.setItem(key, JSON.stringify({ v: value }));
  } catch {
    // Full or blocked storage: the answer simply is not kept.
  }
}

export function clearDraft(key: string, s: DraftStore | null = store()): void {
  try {
    s?.removeItem(key);
  } catch {
    // nothing to clear
  }
}

/** Forgets every draft of a step (it was checked, or the learner left it). */
export function clearStepDrafts(ownerId: string, stepId: string, s: DraftStore | null = store()): void {
  if (!s) return;
  try {
    const prefix = stepPrefix(ownerId, stepId);
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) s.removeItem(k);
  } catch {
    // nothing to clear
  }
}
