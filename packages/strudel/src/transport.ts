// The one transport clock (architecture §2.1). It reads the active scheduler (an editor's or the hidden
// pattern player's); views never keep time of their own.
import type { MeterId } from "@oak/content-kit";
import { cpsToBpm } from "@oak/theory";
import { sortLiveHaps, toLiveHap } from "./haps.ts";
import { createStore, shallowEqual } from "./store.ts";
import type { LiveHap, Transport, TransportState } from "./types.ts";

/** The parts of Strudel's `Cyclist` the transport reads (core 1.2.6, cyclist.mjs). */
export interface CyclistLike {
  started: boolean;
  cps: number;
  latency: number;
  now(): number;
  setCps(cps: number): void;
  num_cycles_at_cps_change: number;
  seconds_at_cps_change: number | undefined;
  num_ticks_since_cps_change: number;
}

export interface QueryablePattern {
  queryArc(begin: number, end: number, controls?: Record<string, unknown>): Strudel.Hap[];
}

export interface ClockSource {
  id: string;
  scheduler: CyclistLike;
  pattern(): QueryablePattern | undefined;
  meter(): MeterId;
  trackOrder(): readonly string[];
}

/** AudioContext time at which cycle `c` sounds, by the scheduler's own formula (`targetTime` in cyclist.mjs). */
export function timeOfCycleFor(s: CyclistLike, c: number, now: number): number {
  if (s.started && s.seconds_at_cps_change !== undefined && s.num_ticks_since_cps_change > 0 && s.cps > 0) {
    return (c - s.num_cycles_at_cps_change) / s.cps + s.seconds_at_cps_change + s.latency;
  }
  const cps = s.cps > 0 ? s.cps : 0.5;
  return now + s.latency + (c - (s.started ? s.now() : 0)) / cps;
}

/** The cycle that sounds at AudioContext time `t` (inverse of `timeOfCycleFor`). */
export function cycleAtTime(s: CyclistLike, t: number, now: number): number {
  if (s.started && s.seconds_at_cps_change !== undefined && s.num_ticks_since_cps_change > 0 && s.cps > 0) {
    return (t - s.seconds_at_cps_change - s.latency) * s.cps + s.num_cycles_at_cps_change;
  }
  return (s.started ? s.now() : 0) - (now - t + s.latency) * s.cps;
}

export function queryLiveHaps(
  pattern: QueryablePattern | undefined,
  from: number,
  to: number,
  trackOrder: readonly string[] = [],
): LiveHap[] {
  if (!pattern || !(to > from)) return [];
  let haps: Strudel.Hap[];
  try {
    haps = pattern.queryArc(from, to);
  } catch {
    return [];
  }
  return sortLiveHaps(
    haps.filter((h) => h.hasOnset()).map((h) => toLiveHap(h)),
    trackOrder,
  );
}

export interface TransportInternals extends Transport {
  setActive(source: ClockSource): void;
  clearActive(id: string): void;
  /** Re-publish the state (after an evaluation changed the tempo). */
  refresh(): void;
  readonly active: ClockSource | null;
  visualOffsetMs(): number;
}

export function createTransport(
  ctx: BaseAudioContext & { outputLatency?: number; baseLatency?: number },
): TransportInternals {
  let active: ClockSource | null = null;
  let visualOffset = 0;
  let idleCps = 0.5;
  const stateOf = (): TransportState => {
    const cps = active ? active.scheduler.cps : idleCps;
    const meter = active?.meter() ?? "4/4";
    return {
      activeEditorId: active?.id ?? null,
      playing: active?.scheduler.started ?? false,
      cps,
      bpm: Math.round(cpsToBpm(cps, meter) * 1000) / 1000,
    };
  };
  const store = createStore<TransportState>(stateOf(), shallowEqual);
  const refresh = (): void => store.set(stateOf());

  return {
    get: store.get,
    subscribe: store.subscribe,
    get activeEditorId() {
      return active?.id ?? null;
    },
    get active() {
      return active;
    },
    cycle: () => (active?.scheduler.started ? active.scheduler.now() : 0),
    audibleCycle() {
      if (!active?.scheduler.started) return 0;
      const heard = ctx.currentTime - (ctx.outputLatency ?? 0) - (ctx.baseLatency ?? 0) - visualOffset / 1000;
      return cycleAtTime(active.scheduler, heard, ctx.currentTime);
    },
    timeOfCycle(c) {
      if (!active) return ctx.currentTime + (c > 0 ? c / idleCps : 0);
      return timeOfCycleFor(active.scheduler, c, ctx.currentTime);
    },
    cps: () => (active ? active.scheduler.cps : idleCps),
    setCps(cps) {
      if (!(cps > 0) || !Number.isFinite(cps))
        throw new RangeError(`@oak/strudel: cps must be > 0, got ${cps}`);
      if (active) active.scheduler.setCps(cps);
      else idleCps = cps;
      refresh();
    },
    setVisualOffset(ms) {
      visualOffset = Number.isFinite(ms) ? ms : 0;
    },
    visualOffsetMs: () => visualOffset,
    haps(from, to) {
      return queryLiveHaps(active?.pattern(), from, to, active?.trackOrder() ?? []);
    },
    setActive(source) {
      active = source;
      refresh();
    },
    clearActive(id) {
      if (active?.id !== id) return;
      idleCps = active.scheduler.cps;
      active = null;
      refresh();
    },
    refresh,
  };
}
