// The starter's editable regions made visible and reachable (ux §3.6: "change the highlighted part"). While the
// code is still the starter, each `⟪…⟫` region gets the editor's dashed target box, and a keyboard learner who
// Tabs into the editor lands inside the first region instead of on a locked line where typing does nothing.
// The Workbench resets the editor's marks after every check, so the box is put back while the code is pristine.
import type { CodeRange } from "@oak/api";
import type { EditorHandle } from "@oak/strudel";
import { editorId } from "@oak/strudel";
import { useEffect } from "react";
import { useWorkbenchServices } from "../workbench/services.tsx";

/** The live editor of a Workbench `id` (its `n` is whatever the Workbench chose). */
export function editorOf(editors: ReadonlyMap<string, EditorHandle>, wbId: string): EditorHandle | null {
  const exact = editors.get(editorId(wbId, 0));
  if (exact && !exact.disposed) return exact;
  const prefix = editorId(wbId, 0).replace(/0_$/, "");
  for (const [id, ed] of editors) if (id.startsWith(prefix) && !ed.disposed) return ed;
  return null;
}

/** True when `pos` falls inside one of `ranges` (ends included: typing at either end edits the region). */
export function insideAny(ranges: readonly CodeRange[], pos: number): boolean {
  return ranges.some((r) => pos >= r.from && pos <= r.to);
}

/**
 * Marks `regions` as targets while `pristine`, and (while pristine) moves a keyboard focus that lands outside
 * every region to the end of the first one. `key` re-applies the marks (pass what makes the Workbench reset them: the check result).
 */
export function useTargetMarks(
  wbId: string,
  regions: readonly CodeRange[] | null,
  pristine: boolean,
  key: unknown,
) {
  const { oak } = useWorkbenchServices();
  const has = (regions?.length ?? 0) > 0;
  useEffect(() => {
    if (!has || !pristine || !regions) return;
    let ed: EditorHandle | null = null;
    const mark = () => {
      ed = editorOf(oak.editors, wbId);
      if (!ed) return false;
      ed.setMarks(regions.map((range) => ({ range, kind: "target" as const })));
      return true;
    };
    // After the Workbench's own marks effect (it runs when the editor mounts and after each check).
    const first = window.setTimeout(() => {
      if (mark()) return;
      const t = window.setInterval(() => {
        if (mark()) window.clearInterval(t);
      }, 150);
      stop = () => window.clearInterval(t);
    }, 0);
    let stop = () => {};
    return () => {
      window.clearTimeout(first);
      stop();
    };
  }, [oak, wbId, has, pristine, key]);

  // Keyboard focus into a region-locked editor: the caret goes where typing works (the starter's regions are
  // where they were written only while the code is untouched; after an edit the caret stays the learner's).
  useEffect(() => {
    if (!has || !regions || !pristine) return;
    let pointer = 0;
    const down = () => {
      pointer = performance.now();
    };
    const focus = (e: FocusEvent) => {
      const ed = editorOf(oak.editors, wbId);
      if (!ed || !(e.target instanceof Node) || !ed.view.contentDOM.contains(e.target)) return;
      if (performance.now() - pointer < 400) return;
      const live = ed.view.state;
      const head = live.selection.main.head;
      const firstRegion = regions[0];
      if (!firstRegion || insideAny(regions, head) || firstRegion.to > live.doc.length) return;
      ed.view.dispatch({ selection: { anchor: firstRegion.to }, scrollIntoView: true });
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("focusin", focus);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("focusin", focus);
    };
  }, [oak, wbId, has, regions, pristine]);
}
