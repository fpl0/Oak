// Auditioning a piece of code (an answer option, a card): one hidden pattern player shared by the app plays it for a
// couple of bars, then stops. A new audition replaces the one playing. This is what hosts pass as an answer
// widget's `audition` (app/src/answers/types.ts).
import type { PatternPlayer } from "@oak/strudel";
import { getOak } from "./oak.ts";

let player: Promise<PatternPlayer> | null = null;
let stopTimer = 0;

/** Plays `code` for `bars` bars (default 2) at its own tempo (`setcpm`, else 90 BPM in 4/4). */
export function auditionCode(code: string, bars = 2): void {
  void (async () => {
    player ??= getOak().then((oak) => oak.createPatternPlayer());
    const p = await player;
    p.stop();
    window.clearTimeout(stopTimer);
    // Linted as Studio lints: an audition plays a learner's voicing (the gate moment) as well as content code, and
    // the pattern player's default content profile refuses a learner part named `melody:` (review:journey).
    const out = await p.load(code, {
      bars,
      cps: 0,
      lint: { profile: "studio", unlocked: new Set(), allowPreview: true, meter: "4/4", key: null },
    });
    if (!out.ok) return;
    await p.play();
    const cps = /setcpm\(\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)/.exec(code);
    const cycleSec = cps ? Number(cps[2]) / (Number(cps[1]) / 60) : 4 / (90 / 60);
    stopTimer = window.setTimeout(() => p.stop(), bars * cycleSec * 1000 + 150);
  })().catch(() => {});
}

/** Stops an audition that is playing. */
export function stopAudition(): void {
  window.clearTimeout(stopTimer);
  void player?.then((p) => p.stop());
}
