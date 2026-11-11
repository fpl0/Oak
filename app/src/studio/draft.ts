// Per-viewer conveniences of the Studio kept in this browser only: edits not run yet (a Run saves a version,
// so an edit is never lost on reload), and the loop length shown for a sketch. Every read and write is
// guarded: private windows and blocked storage simply mean nothing is remembered.

export interface Draft {
  code: string;
  /** The version the edits started from. */
  baseVersion: number;
  at: string;
}

const draftKey = (sketchId: string) => `oak.studio.draft.${sketchId}`;
const lengthKey = (sketchId: string) => `oak.studio.length.${sketchId}`;

export function readDraft(sketchId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(sketchId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    if (typeof d.code !== "string" || typeof d.baseVersion !== "number") return null;
    return { code: d.code, baseVersion: d.baseVersion, at: typeof d.at === "string" ? d.at : "" };
  } catch {
    return null;
  }
}

export function writeDraft(sketchId: string, draft: Draft): void {
  try {
    localStorage.setItem(draftKey(sketchId), JSON.stringify(draft));
  } catch {
    // storage unavailable: the next Run saves a version anyway
  }
}

export function clearDraft(sketchId: string): void {
  try {
    localStorage.removeItem(draftKey(sketchId));
  } catch {
    // nothing to clear
  }
}

export function readLength(sketchId: string): number | null {
  try {
    const n = Number(localStorage.getItem(lengthKey(sketchId)));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeLength(sketchId: string, bars: number): void {
  try {
    localStorage.setItem(lengthKey(sketchId), String(bars));
  } catch {
    // not remembered
  }
}
