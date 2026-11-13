// The span of a stimulus a slot strip plays alone ("hear this slot"; `AnswerEnv.slots.play`). Pure: tested in
// audio-span.test.ts (lesson/audio.ts itself loads the grader worker, which bun cannot import).
import type { AudioPlan } from "@oak/drills";

/** The events of `plan` inside [from, from + len) seconds, moved to start at 0. */
export function slicePlan(plan: AudioPlan, fromSec: number, lenSec: number): AudioPlan {
  const to = fromSec + lenSec;
  const eps = 1e-6;
  return {
    events: plan.events
      .filter((e) => e.at >= fromSec - eps && e.at < to - eps)
      .map((e) => ({ ...e, at: e.at - fromSec, dur: Math.min(e.dur, to - e.at) })),
    durationSec: lenSec,
    preload: plan.preload,
  };
}
