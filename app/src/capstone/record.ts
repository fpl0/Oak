// Recording a performance through the @oak/strudel recorder (MediaRecorder on the master bus, UI sounds
// suppressed), for a capstone release and an album track's re-recording. No grader import: unit-testable.
import type { EditorHandle, OakStrudel, Recording } from "@oak/strudel";

/**
 * Plays the piece once from bar 1 and records it (the recorder starts at once when nothing plays; the editor
 * then starts on its first cycle). Resolves with the audio when the last bar and the tail have played.
 */
export async function recordPerformance(
  oak: OakStrudel,
  handle: EditorHandle,
  bars: number,
): Promise<Recording> {
  await oak.unlock();
  if (handle.playing) handle.stop();
  const ran = await handle.evaluate({ autostart: false });
  if (!ran.ok) throw new Error(PIECE_DOES_NOT_RUN);
  const recording = oak.recorder.record({ bars, tailSec: 1.5 });
  // The recorder taps the master bus where its analyser listens: a take whose peak never leaves the noise floor
  // is silent (every part muted, a sample bank that did not load) and is not released as the learner's track.
  let peak = 0;
  const listen = setInterval(() => {
    peak = Math.max(peak, oak.master.level().peak);
  }, 40);
  try {
    await handle.play();
    const take = await recording;
    peak = Math.max(peak, oak.master.level().peak);
    if (isSilentTake(peak)) throw new Error(SILENT_TAKE);
    return take;
  } catch (e) {
    oak.recorder.cancel();
    throw e;
  } finally {
    clearInterval(listen);
    if (!handle.disposed) handle.stop();
  }
}

/** A take of code that does not evaluate (the editor shows the error). */
export const PIECE_DOES_NOT_RUN = "The piece doesn't run. Run it, fix the error it shows, then record again.";

/** Peak (linear, post-limiter) below which a take counts as silence: −70 dBFS. */
export const SILENT_PEAK = 10 ** (-70 / 20);
export const SILENT_TAKE =
  "The take was silent: no sound reached the recorder. Check that no part is muted (S) and that the piece plays, then record again.";
export function isSilentTake(peak: number): boolean {
  return !(peak >= SILENT_PEAK);
}
