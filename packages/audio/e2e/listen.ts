// Listening to a fake-microphone take (Chromium restarts the WAV at every capture open, then loops it): the page
// listens only as long as one whole pass of the phrase needs, instead of a fixed number of seconds. The pass
// starts at the first note when the room was heard silent before it (every fixture begins with a silent lead),
// otherwise at the first onset after 1.2 s of silence (the loop's own gap), as the Wave 4 and 5 runs did.
import { createMicGraph } from "@oak/audio";
import { type PitchFrame, pitchFramesToNotes } from "@oak/pitch";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Silence that must be heard before the first note for it to count as the start of the pass, seconds. */
const LEAD_HEARD_SEC = 0.12;

/** The start of the first whole pass in `frames` (window-centre time of its first note), or `null` so far. */
export function passStart(frames: readonly PitchFrame[]): number | null {
  const first = frames[0];
  if (!first) return null;
  const notes = pitchFramesToNotes(frames);
  const head = notes[0];
  if (head && head.start - first.t >= LEAD_HEARD_SEC) return head.start;
  for (let i = 1; i < notes.length; i++) {
    const a = notes[i - 1] as { end: number };
    const b = notes[i] as { start: number };
    if (b.start - a.end > 1.2) return b.start;
  }
  return null;
}

/**
 * Opens the microphone and listens until one whole pass of `passSec` seconds (from its first note) has been
 * heard, at most `maxSec`. Returns every frame and the pass's start on the frames' clock.
 */
export async function listenPass(o: {
  passSec: number;
  maxSec: number;
}): Promise<{ frames: PitchFrame[]; start: number; listenedSec: number }> {
  const ctx = new AudioContext();
  await ctx.resume();
  const g = createMicGraph(ctx);
  // The worklet is loaded before the capture opens, so the file's silent lead is heard from its start.
  await g.prepare();
  const s = await g.open();
  const t0 = performance.now();
  let start: number | null = null;
  let frames: PitchFrame[] = [];
  try {
    for (;;) {
      await sleep(60);
      frames = s.frames();
      start ??= passStart(frames);
      const last = frames[frames.length - 1];
      if (start !== null && last && last.t >= start + o.passSec + 0.35) break;
      if (performance.now() - t0 > o.maxSec * 1000) break;
    }
  } finally {
    s.close();
    g.dispose();
    await ctx.close();
  }
  if (start === null) throw new Error("no whole pass of the phrase was captured");
  return { frames, start, listenedSec: (performance.now() - t0) / 1000 };
}
