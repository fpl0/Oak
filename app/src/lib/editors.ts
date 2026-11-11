// Finding the learner's editor on screen: the tutor panel's Apply lands in it as one undoable CodeMirror change
// (contracts §10.7). Editors are registered by the Strudel adapter under `editorId(slug, n)` = `oak_<slug>_<n>_`.
import type { EditorHandle } from "@oak/strudel";
import { peekOak } from "./oak.ts";

/**
 * The editable, mounted editor whose slug starts with `slugPrefix` (e.g. `l-s5` for a lesson step): the focused one
 * if any, else the most recently registered. `null` when the adapter is not up or nothing matches.
 */
export function editableEditor(slugPrefix: string): EditorHandle | null {
  const oak = peekOak();
  if (!oak) return null;
  const prefix = `oak_${slugPrefix.replace(/[^A-Za-z0-9]+/g, "-")}`;
  const found: EditorHandle[] = [];
  for (const h of oak.editors.values()) {
    if (!h.id.startsWith(prefix) || h.disposed) continue;
    if (!h.view.dom.isConnected || h.view.state.readOnly) continue;
    found.push(h);
  }
  return found.find((h) => h.view.hasFocus) ?? found.at(-1) ?? null;
}

/** Replaces the editor's text as one undoable change; false when there is no such editor. */
export function applyToEditor(slugPrefix: string, code: string): boolean {
  const h = editableEditor(slugPrefix);
  if (!h) return false;
  h.setCode(code, { undoable: true });
  return true;
}
