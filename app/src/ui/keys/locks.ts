// Honest locked rows in the shortcut sheet (Wave 5). The Workbench's lens and panel keys work only once their tool
// is unlocked (a lens, the form map, the scope, the chart …); the sheet lists every key, so a row whose tool the
// learner does not have yet says when it opens ("opens with U09 · Form") instead of listing a key that does
// nothing. Pure: the tables come from the owners (workbench panels, app lenses) and the course from the content
// bundle, so nothing here repeats an unlock site (tested in locks.test.ts against content/toolbox.ts).
import type { SyllabusDef, ToolEntry } from "@oak/content-kit";
import { CHORD_LENS_UNLOCKS, LENS_UNLOCKS, LINE_LENS_UNLOCKS } from "../../lib/lenses.ts";
import { PANEL_SWITCHES, PANEL_UNLOCKS } from "../../workbench/panels.ts";

/** Workbench keys → the toolbox row each needs (keys in the sheet's syntax, as `WORKBENCH_LENS_SHORTCUTS` writes them). */
export const WORKBENCH_KEY_UNLOCKS: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  if (LENS_UNLOCKS.degrees) out.D = LENS_UNLOCKS.degrees;
  if (LENS_UNLOCKS.solfege) out.S = LENS_UNLOCKS.solfege;
  if (LENS_UNLOCKS.noteNames) out["Shift+N"] = LENS_UNLOCKS.noteNames;
  out["Shift+H"] = CHORD_LENS_UNLOCKS.chordSymbols;
  out["Shift+R"] = CHORD_LENS_UNLOCKS.romanNumerals;
  out["Shift+O"] = LINE_LENS_UNLOCKS.sections;
  out["Shift+B"] = LINE_LENS_UNLOCKS.bassRoles;
  out["Shift+U"] = LINE_LENS_UNLOCKS.blueNotes;
  for (const p of PANEL_SWITCHES) out[p.keys] = PANEL_UNLOCKS[p.id];
  return out;
})();

/** Which sheet sections carry Workbench keys (their rows are checked against `WORKBENCH_KEY_UNLOCKS`). */
export const LOCKABLE_SECTIONS: ReadonlySet<string> = new Set(["workbench"]);

/**
 * "U09 · Form", "the side lesson Waves & Harmonics", "C1 · Riff Builder": the course place where a toolbox row
 * opens (its first unlock site), or `null` when the row or the place is unknown.
 */
export function opensWith(
  unlockId: string,
  toolbox: readonly ToolEntry[],
  syllabus: SyllabusDef | null,
): string | null {
  const row = toolbox.find((t) => t.id === unlockId);
  if (!row) return null;
  const sites = Array.isArray(row.unlock.at) ? row.unlock.at : [row.unlock.at];
  const site = sites[0];
  if (!site) return null;
  const capstone = /^([CX]\d+)\./.exec(site)?.[1];
  if (capstone) {
    const c = syllabus?.capstones.find((x) => x.id === capstone);
    return c ? `${capstone} · ${c.title}` : capstone;
  }
  const unitId = /^([A-Z]+\d+)\./.exec(site)?.[1];
  if (!unitId) return null;
  const unit = syllabus?.units.find((u) => u.id === unitId);
  const lesson = unit?.lessons.find((l) => l.id === site);
  if (lesson?.side) return `the side lesson ${lesson.title}`;
  return unit ? `${unitId} · ${unit.title}` : unitId;
}

export interface RowLock {
  /** The row's tool is not unlocked yet. */
  locked: boolean;
  /** "Opens with U09 · Form" (or "Not open yet" when the place is unknown). */
  note: string;
}

/**
 * Whether a sheet row is locked for this learner. Nothing is marked before the unlock list has loaded (`ready`),
 * so the sheet never flashes a lock at a learner who has the tool (as the NavRail).
 */
export function rowLock(
  sectionId: string,
  keys: string,
  unlocked: ReadonlySet<string>,
  ready: boolean,
  toolbox: readonly ToolEntry[],
  syllabus: SyllabusDef | null,
): RowLock | null {
  if (!ready || !LOCKABLE_SECTIONS.has(sectionId)) return null;
  const need = WORKBENCH_KEY_UNLOCKS[keys];
  if (!need || unlocked.has(need)) return null;
  const where = opensWith(need, toolbox, syllabus);
  return { locked: true, note: where ? `Opens with ${where}` : "Not open yet" };
}
