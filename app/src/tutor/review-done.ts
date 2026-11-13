// Review revisions the learner ticked "Mark done" (ux §6.5). Pure storage helpers; tested in review-w4.test.ts.

/** Where a review's "Mark done" ticks are kept (ux §6.5): this browser, per review entry. A private window or blocked
 * storage simply starts with nothing ticked. */
const DONE_KEY = (id: string) => `oak.review-done.${id}`;
export function readDone(id: string): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DONE_KEY(id)) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is number => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}
export function writeDone(id: string, done: readonly number[]): void {
  try {
    if (done.length === 0) localStorage.removeItem(DONE_KEY(id));
    else localStorage.setItem(DONE_KEY(id), JSON.stringify(done));
  } catch {
    // Storage is a convenience here: the tick still shows for this visit.
  }
}
