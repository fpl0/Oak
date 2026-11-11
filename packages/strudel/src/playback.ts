// Direct superdough playback, bypassing the scheduler (architecture §6.4): drill stimuli, cues, clicks,
// the on-screen keyboard. Events are handed to superdough in a short look-ahead window, so `stop()`
// cancels everything not yet triggered; `panic` also cuts what is ringing.
import type { AudioPlan } from "@oak/drills";
import * as webaudio from "@strudel/webaudio";
import * as WT from "worker-timers";
import type { Runtime } from "./runtime.ts";
import type { PlaybackHandle, PlayEventsOptions, PreloadSpec } from "./types.ts";

/** How far ahead events are handed to superdough. */
export const LOOKAHEAD_S = 0.2;
const TICK_MS = 25;
/** Default lead before a plan's zero, so the first event is never late. */
export const DEFAULT_LEAD_S = 0.08;

export interface PlannedEvent {
  t: number;
  dur: number;
  value: Record<string, unknown>;
}

/** Absolute times for a plan, gain applied, sorted by time (ties keep plan order). */
export function schedulePlan(plan: AudioPlan, startTime: number, gain = 1): PlannedEvent[] {
  return plan.events
    .map((ev, i) => {
      const value: Record<string, unknown> = { ...ev.value };
      if (gain !== 1) value.gain = (typeof value.gain === "number" ? value.gain : 1) * gain;
      return { t: startTime + Math.max(0, ev.at), dur: Math.max(0.001, ev.dur), value, i };
    })
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map(({ t, dur, value }) => ({ t, dur, value }));
}

/** `["piano", "RolandTR909_bd:2"]` to a PreloadSpec (an `AudioPlan.preload` list). */
export function preloadSpecOfNames(names: readonly string[]): PreloadSpec {
  return {
    sounds: names.map((name) => {
      const [s, n] = name.split(":") as [string, string | undefined];
      return n !== undefined && /^\d+$/.test(n) ? { s, n: Number(n) } : { s };
    }),
  };
}

let planCount = 0;

export function playEvents(rt: Runtime, plan: AudioPlan, opts: PlayEventsOptions = {}): PlaybackHandle {
  const id = `plan:${++planCount}`;
  const ctx = rt.ctx;
  const startTime = opts.at ?? ctx.currentTime + DEFAULT_LEAD_S;
  const queue = schedulePlan(plan, startTime, opts.gain ?? 1);
  const endTime = Math.max(startTime + Math.max(0, plan.durationSec), ...queue.map((e) => e.t + e.dur));
  let stopped = false;
  let timer: number | null = null;
  let endTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  let release: (() => void) | null = null;

  const finish = (): void => {
    if (timer !== null) WT.clearInterval(timer);
    timer = null;
    if (endTimer !== null) clearTimeout(endTimer);
    endTimer = null;
    const r = release;
    release = null;
    r?.();
    resolveDone();
  };
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    queue.length = 0;
    finish();
  };

  if (opts.exclusive ?? true) release = rt.coordinator.claim({ id, kind: "plan", stop });
  if (plan.preload.length > 0) void rt.preload(preloadSpecOfNames(plan.preload));

  const pump = (): void => {
    if (stopped) return;
    const horizon = ctx.currentTime + LOOKAHEAD_S;
    while (queue.length > 0 && (queue[0] as PlannedEvent).t <= horizon) {
      const ev = queue.shift() as PlannedEvent;
      rt.noteTrigger(ev.value);
      const t = Math.max(ev.t, ctx.currentTime);
      void Promise.resolve(webaudio.superdough(ev.value, t, ev.dur)).catch(() => undefined);
    }
    if (queue.length === 0 && timer !== null) {
      WT.clearInterval(timer);
      timer = null;
      endTimer = setTimeout(finish, Math.max(0, (endTime - ctx.currentTime) * 1000));
    }
  };

  void rt.unlock().then((ok) => {
    if (!ok) {
      stop();
      return;
    }
    if (stopped) return;
    pump();
    if (queue.length > 0) timer = WT.setInterval(pump, TICK_MS);
  });

  return { done, startTime, stop };
}

/** One note or a chord now, through superdough (keyboard, audition buttons). Never claims the coordinator. */
export function playNote(
  rt: Runtime,
  value: { s: string; note: number | string | (number | string)[]; dur?: number; gain?: number },
): void {
  const notes = Array.isArray(value.note) ? value.note : [value.note];
  const dur = value.dur ?? 0.5;
  void rt.unlock().then((ok) => {
    if (!ok) return;
    const t = rt.ctx.currentTime + 0.02;
    for (const note of notes) {
      const v: Record<string, unknown> = { s: value.s, note };
      if (value.gain !== undefined) v.gain = value.gain;
      rt.noteTrigger(v);
      void Promise.resolve(webaudio.superdough(v, t, dur)).catch(() => undefined);
    }
  });
}
