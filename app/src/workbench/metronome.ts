// The metronome (ux §3.4 "Transport bar", ux §7.10 `M`): a click on every tempo unit of the meter, an accent
// on the downbeat, scheduled from the one transport clock just ahead of time through the adapter's direct
// playback (`playEvents`, not exclusive), so it never touches the code and never stops what plays. The beat
// grid is the meter's (4 clicks a bar in 4/4, 3 in 3/4, the two dotted quarters of 6/8).
import type { MeterSpec } from "@oak/content-kit";
import type { SuperdoughValue } from "@oak/drills";
import type { OakStrudel } from "@oak/strudel";

/** How far ahead clicks are handed to the audio clock, in seconds. */
export const CLICK_LOOKAHEAD_S = 0.12;
const TICK_MS = 25;

/** A click: a short sine blip, higher on the downbeat. */
export function clickValue(accent: boolean): SuperdoughValue {
  return {
    s: "sine",
    note: accent ? 96 : 89,
    gain: accent ? 0.5 : 0.32,
    attack: 0.001,
    decay: 0.05,
    sustain: 0,
    release: 0.02,
  };
}

/**
 * Beat indices (beat k sits at cycle k / unitsPerBar) still to schedule: from `next` up to the last beat that
 * starts before `until` cycles. Returns the beats and the next index to schedule after them.
 */
export function beatsUntil(
  next: number,
  until: number,
  unitsPerBar: number,
): { beats: { index: number; cycle: number; accent: boolean }[]; next: number } {
  const units = Math.max(1, Math.round(unitsPerBar));
  const beats: { index: number; cycle: number; accent: boolean }[] = [];
  let k = next;
  // Never more than two bars at once (a stalled tab must not burst clicks when it wakes).
  while (k / units < until && beats.length < units * 2) {
    beats.push({ index: k, cycle: k / units, accent: ((k % units) + units) % units === 0 });
    k++;
  }
  return { beats, next: k };
}

/** The first beat index at or after `cycle`. */
export function firstBeatAt(cycle: number, unitsPerBar: number): number {
  const units = Math.max(1, Math.round(unitsPerBar));
  return Math.ceil(cycle * units - 1e-6);
}

/** Beat inside the bar (0-based) for a cycle: the visual twin of the click (ux §7.9). */
export function beatOf(cycle: number, unitsPerBar: number): number {
  const units = Math.max(1, Math.round(unitsPerBar));
  const inBar = cycle - Math.floor(cycle);
  return Math.min(units - 1, Math.floor(inBar * units + 1e-9));
}

/** Runs while the metronome is on; reads the transport each tick, schedules what lies inside the lookahead. */
export class Metronome {
  private timer: ReturnType<typeof setInterval> | null = null;
  private next: number | null = null;
  private lastCycle = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly oak: OakStrudel,
    private meter: MeterSpec,
  ) {}

  setMeter(meter: MeterSpec): void {
    this.meter = meter;
    this.next = null;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer) return;
    this.next = null;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.next = null;
  }

  private tick(): void {
    const t = this.oak.transport;
    if (!t.get().playing) {
      this.next = null;
      return;
    }
    const cycle = t.cycle();
    const cps = t.cps();
    if (!(cps > 0) || !Number.isFinite(cycle)) return;
    // A restart (or a new source) moves the clock back: start again from the next beat.
    if (this.next === null || cycle < this.lastCycle - 0.25)
      this.next = firstBeatAt(cycle, this.meter.unitsPerBar);
    this.lastCycle = cycle;
    const until = cycle + CLICK_LOOKAHEAD_S * cps;
    const { beats, next } = beatsUntil(this.next, until, this.meter.unitsPerBar);
    this.next = next;
    const now = this.oak.ctx.currentTime;
    for (const b of beats) {
      const at = t.timeOfCycle(b.cycle);
      if (!Number.isFinite(at) || at < now - 0.005) continue;
      this.oak.playEvents(
        { events: [{ at: 0, dur: 0.06, value: clickValue(b.accent) }], durationSec: 0.08, preload: [] },
        { at, exclusive: false },
      );
    }
  }
}
