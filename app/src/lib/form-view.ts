// The Form View host API (Wave 5, docs/design/wave5.md §4.4): the section ribbon over the roll and the staff and the
// form map panel (`WORKBENCH_PANELS` "form", tb.lens.form at U09.L02), read from the grader's `formView` (the
// per-track `arrange()`, contracts §6.3). Clicking a section loops it: the Workbench's existing loop playback
// (`useLoopPlayback`, a hidden PatternPlayer with `.ribbon(from, bars)`) takes the section's bars as its region.
// Pure helpers and types only; the workbench engineer draws the ribbon and the panel. Frozen after Foundation.
import type { FormView } from "@oak/grader";

/** One section as the ribbon and the form map draw it. */
export interface FormViewSection {
  /** "verse", "chorus" (the type), and the tagged name ("chorus2"). */
  label: string;
  tag: string;
  /** "Verse", "Chorus 2": what the ribbon prints. */
  text: string;
  /** 0-based first bar (cycle) and length in bars. */
  startBar: number;
  bars: number;
  /** Learner tracks that sound in it (instrumentation). */
  tracks: string[];
  /** Mean of the energy curve over the section, 0–1 (the ribbon's fill). */
  energy: number;
  /** A letter by first appearance (A, B, A, B): the form map's short name. */
  letter: string;
}

/** The loop a click on a section asks for: the Workbench `LoopRegion` (`from` 0-based, `bars` ≥ 1). */
export interface SectionLoop {
  from: number;
  bars: number;
  /** The section's tag, so the ribbon can show which one is looping. */
  tag: string;
}

/** What a surface hands the ribbon / form map. */
export interface FormViewHostProps {
  /** `[]` with no `arrange()` (the ribbon is hidden; the form map says "Write one arrange() per labelled track"). */
  sections: readonly FormViewSection[];
  /** Energy per bar, 0–1 (the curve under the ribbon, U09.L04). */
  energy: readonly number[];
  totalBars: number;
  /** The arranged tracks disagree: the first disagreement in words (`form.inconsistent-arrange`), else `null`. */
  inconsistent: string | null;
  /** The bar playing now (0-based), `null` when stopped. */
  currentBar: number | null;
  /** The section loop in force, `null` when none. */
  loop: SectionLoop | null;
  /** Loop a section (`null` stops the section loop). Keyboard: Enter on a focused section toggles its loop. */
  onLoop(loop: SectionLoop | null): void;
}

const title = (tag: string): string => {
  const m = /^([a-z]+)(\d+)?$/.exec(tag);
  if (!m) return tag;
  const w = (m[1] as string).charAt(0).toUpperCase() + (m[1] as string).slice(1);
  return m[2] ? `${w} ${m[2]}` : w;
};

/** The sections the ribbon draws from a `formView` (empty without `arrange()` or when the tracks disagree). */
export function formSectionsOf(view: FormView | null): FormViewSection[] {
  if (view?.kind !== "sections") return [];
  const seen: string[] = [];
  return view.sections.map((s) => {
    if (!seen.includes(s.label)) seen.push(s.label);
    return {
      label: s.label,
      tag: s.tag,
      text: title(s.tag),
      startBar: s.startBar,
      bars: s.bars,
      tracks: [...s.tracks],
      energy: s.features.energy,
      letter: String.fromCharCode(65 + seen.indexOf(s.label)),
    };
  });
}

/** The inconsistency message of a `formView`, or `null`. */
export function formProblemOf(view: FormView | null): string | null {
  return view?.kind === "inconsistent" ? view.detail : null;
}

/** The loop a section asks for. */
export function sectionLoopOf(section: Pick<FormViewSection, "startBar" | "bars" | "tag">): SectionLoop {
  return { from: section.startBar, bars: Math.max(1, section.bars), tag: section.tag };
}

/** The section that contains a bar (0-based), or `null` (past the end, or no sections). */
export function sectionAtBar(sections: readonly FormViewSection[], bar: number): FormViewSection | null {
  return sections.find((s) => bar >= s.startBar && bar < s.startBar + s.bars) ?? null;
}

/** The section before or after `current` (arrow keys on the ribbon); stays put at either end. */
export function stepSection(
  sections: readonly FormViewSection[],
  current: FormViewSection | null,
  dir: 1 | -1,
): FormViewSection | null {
  if (sections.length === 0) return null;
  if (!current) return dir === 1 ? (sections[0] ?? null) : (sections[sections.length - 1] ?? null);
  const i = sections.findIndex((s) => s.startBar === current.startBar);
  return sections[Math.min(sections.length - 1, Math.max(0, i + dir))] ?? null;
}

/**
 * The loop length the Workbench must allow so a section anywhere in the piece can loop: the piece's total bars
 * (the Workbench's `loopBars` is otherwise the step's loop, 2–8 bars).
 */
export function loopBarsForForm(totalBars: number, loopBars: number): number {
  return Math.max(loopBars, totalBars);
}
