// A take plays the piece once (the capstone recorder, an album track's re-recording): the scheduler keeps only the
// notes that start before the last bar's end. Pure: no audio, no DOM.

/**
 * The scheduler's pattern played once: only the notes that start before `cycles` (a stopped scheduler starts at
 * cycle 0, so these are the piece's first `cycles` bars). What started still sounds to its end and rings out.
 */
export function playOnce(repl: { scheduler: { pattern?: Strudel.Pattern } }, cycles: number): void {
  const pattern = repl.scheduler.pattern;
  if (!pattern || !(cycles > 0)) return;
  repl.scheduler.pattern = pattern.filterHaps((h) => Number((h.whole ?? h.part).begin) < cycles - 1e-9);
}
