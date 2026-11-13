// Once per session (contracts §2.4, ux §1.6): a later capstone session opens with the resume card (host/
// CapstoneResume.tsx), decided once when the block has its data and shown at most once per Oak session. Pure but for
// sessionStorage, which may be unavailable (then the in-memory record holds for this tab).
const KEY = "oak.capstone-resume.v1";
const shown = new Set<string>();
const decided = new Map<string, boolean>();
/**
 * Whether this Oak session's capstone block opens with the resume card. Decided once per session, the first time
 * the block has its data (`ready`), and kept: a draft bound mid-block (`in_progress`) or a release raising
 * `sessionsDone` must never swap the mounted workspace, or its release ceremony, for the card. `null` while the
 * data is still loading. A reload decides again (the card shows at most once per session, `resumeShown`).
 */
export function resumeDecision(sessionId: string, ready: boolean, wants: boolean): boolean | null {
  const known = decided.get(sessionId);
  if (known !== undefined) return known;
  if (!ready) return null;
  const show = wants && !resumeShown(sessionId);
  decided.set(sessionId, show);
  return show;
}

/** The resume card plays once per session (a reload of the same session goes straight to the workspace). */
export function resumeShown(sessionId: string): boolean {
  if (shown.has(sessionId)) return true;
  try {
    return sessionStorage.getItem(KEY) === sessionId;
  } catch {
    return false;
  }
}
export function markShown(sessionId: string): void {
  shown.add(sessionId);
  try {
    sessionStorage.setItem(KEY, sessionId);
  } catch {
    // Storage may be unavailable (private windows): the in-memory record holds for this tab.
  }
}
