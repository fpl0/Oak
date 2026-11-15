// The load profile of a `bun run e2e` run (scripts/e2e-parallel.ts): every few seconds, how many units run, how busy
// the machine's cores are and the 1-minute load average; per unit, the means over the minutes it ran. It answers the
// question the budget table cannot: did a file cost more because of what ran beside it? (docs/design/wave7.md §7.1)
import { cpus, loadavg } from "node:os";

export interface LoadSample {
  /** Seconds since the run started. */
  t: number;
  /** Units running at this instant. */
  running: number;
  /** Share of all cores busy since the previous sample, 0–1. */
  busy: number;
  /** The 1-minute load average. */
  load1: number;
}

export interface UnitWindow {
  name: string;
  /** Seconds since the run started. */
  start: number;
  end: number;
}

export interface UnitLoad {
  name: string;
  wallMin: number;
  /** Mean units running (this one included) while it ran. */
  meanRunning: number;
  /** Mean share of the cores busy while it ran. */
  meanBusy: number;
  meanLoad1: number;
  samples: number;
}

/** Busy and idle CPU ticks of every core, summed. */
export function cpuTicks(): { busy: number; idle: number } {
  let busy = 0;
  let idle = 0;
  for (const c of cpus()) {
    const t = c.times;
    busy += t.user + t.nice + t.sys + t.irq;
    idle += t.idle;
  }
  return { busy, idle };
}

/** Busy share between two tick readings (0 when nothing elapsed). */
export function busyShare(a: { busy: number; idle: number }, b: { busy: number; idle: number }): number {
  const busy = b.busy - a.busy;
  const all = busy + (b.idle - a.idle);
  return all > 0 ? Math.max(0, Math.min(1, busy / all)) : 0;
}

/** The means of the samples that fall inside each unit's window (pure; tested). */
export function unitLoads(samples: readonly LoadSample[], windows: readonly UnitWindow[]): UnitLoad[] {
  return windows.map((w) => {
    const inside = samples.filter((s) => s.t >= w.start && s.t <= w.end);
    const mean = (f: (s: LoadSample) => number): number =>
      inside.length === 0 ? 0 : inside.reduce((sum, s) => sum + f(s), 0) / inside.length;
    return {
      name: w.name,
      wallMin: (w.end - w.start) / 60,
      meanRunning: mean((s) => s.running),
      meanBusy: mean((s) => s.busy),
      meanLoad1: mean((s) => s.load1),
      samples: inside.length,
    };
  });
}

/** Samples the machine every `everyMs` until stopped; `running()` says how many units run now. */
export function startLoadProfile(running: () => number, everyMs = 5_000) {
  const t0 = performance.now();
  const samples: LoadSample[] = [];
  const windows: UnitWindow[] = [];
  let last = cpuTicks();
  const timer = setInterval(() => {
    const now = cpuTicks();
    samples.push({
      t: (performance.now() - t0) / 1000,
      running: running(),
      busy: busyShare(last, now),
      load1: loadavg()[0] ?? 0,
    });
    last = now;
  }, everyMs);
  timer.unref?.();
  const at = (): number => (performance.now() - t0) / 1000;
  return {
    samples,
    windows,
    /** Marks a unit's start; call the returned function at its end. */
    unit(name: string): () => void {
      const start = at();
      return () => {
        windows.push({ name, start, end: at() });
      };
    },
    stop(): { samples: LoadSample[]; units: UnitLoad[] } {
      clearInterval(timer);
      return { samples, units: unitLoads(samples, windows) };
    },
  };
}
