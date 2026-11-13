// Workbench panels a lesson step opens (Wave 4, docs/design/wave4.md §4.4). Content declares them in
// `StepUi.initialPanels` (content-kit `WORKBENCH_PANELS`: key, circle, chords, function, range, chord-tones);
// the lesson host passes the result to `<Workbench initialPanels>`, which opens each one that is unlocked and
// that the Workbench draws (a panel it does not draw yet is ignored, never an error). The learner can close
// them; inside a step the step's choice wins over the viewer's remembered panels. Frozen after Foundation.
import {
  type StepUi,
  WORKBENCH_PANEL_TOOLS,
  WORKBENCH_PANELS,
  type WorkbenchPanelId,
} from "@oak/content-kit";

export type { WorkbenchPanelId };
export { WORKBENCH_PANEL_TOOLS, WORKBENCH_PANELS };

/** The `initialPanels` prop of the Workbench for a step: each listed panel open, every other one closed. */
export function initialPanelsOf(
  ui: Pick<StepUi, "initialPanels"> | null | undefined,
): Partial<Record<WorkbenchPanelId, boolean>> | null {
  const list = ui?.initialPanels;
  if (!list || list.length === 0) return null;
  const out: Partial<Record<WorkbenchPanelId, boolean>> = {};
  for (const id of WORKBENCH_PANELS) out[id] = list.includes(id);
  return out;
}

/** Whether a panel can open for this learner (its toolbox row is unlocked). */
export function panelUnlocked(id: WorkbenchPanelId, unlocked: ReadonlySet<string>): boolean {
  return unlocked.has(WORKBENCH_PANEL_TOOLS[id]);
}
