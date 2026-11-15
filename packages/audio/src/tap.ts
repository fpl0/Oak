// Tap capture (contracts §8.4): `KeyboardEvent.timeStamp` mapped to AudioContext time through
// `getOutputTimestamp()` pairs, minus the calibrated tap latency. Space taps only while armed; two-voice
// taps use F / J. Outside an armed TapPad the keys keep their usual meaning.
import type { TapEvent, TapInput } from "./types.ts";

type TimestampSource = Pick<AudioContext, "currentTime" | "getOutputTimestamp">;

/**
 * `ctxTime = ts.contextTime + (eventTimeStamp − ts.performanceTime) / 1000`. When the context gives no
 * timestamp pair yet (suspended, or 0/0 right after start) it falls back to `currentTime` and
 * `performance.now()`.
 */
export function eventTimeToContextTime(
  ctx: TimestampSource,
  eventTimeStamp: number,
  perfNow?: number,
): number {
  const ts = ctx.getOutputTimestamp();
  const contextTime = ts.contextTime ?? 0;
  const performanceTime = ts.performanceTime ?? 0;
  if (performanceTime > 0) return contextTime + (eventTimeStamp - performanceTime) / 1000;
  const now = perfNow ?? (typeof performance !== "undefined" ? performance.now() : eventTimeStamp);
  return ctx.currentTime + (eventTimeStamp - now) / 1000;
}

/**
 * Taps (AudioContext seconds, latency already removed) to onsets in cycles (bars) from a start time:
 * `(time − startTime) · cps`, optionally removing `latencyMs` here instead and snapping to `grid` slots
 * per cycle. What the TapPad hands to `gradeTaps` is the seconds; this is for display on the roll.
 */
export function tapsToOnsets(
  taps: readonly number[],
  opts: { startTime: number; cps: number; latencyMs?: number; grid?: number },
): number[] {
  const lat = (opts.latencyMs ?? 0) / 1000;
  return taps
    .map((t) => (t - lat - opts.startTime) * opts.cps)
    .map((c) => (opts.grid ? Math.round(c * opts.grid) / opts.grid : c))
    .sort((a, b) => a - b);
}

const KEY_VOICE: Readonly<Record<string, 0 | 1>> = { Space: 0, KeyF: 0, KeyJ: 1 };

/**
 * Wave 7 (`TapLane.key`): a lane's key as a `KeyboardEvent.code` — a letter ("f", "J") is `KeyF`, a digit `Digit5`,
 * anything else is taken as a code already ("Semicolon"). `null` for an empty key.
 */
export function laneKeyCode(key: string): string | null {
  const k = key.trim();
  if (k === "") return null;
  if (/^[a-z]$/i.test(k)) return `Key${k.toUpperCase()}`;
  if (/^[0-9]$/.test(k)) return `Digit${k}`;
  return k;
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as (HTMLElement & { isContentEditable?: boolean }) | null;
  if (!el || typeof el !== "object" || !("tagName" in el)) return false;
  const tag = String(el.tagName).toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

export interface TapInputExtras {
  /** A pointer tap on the pad (or a test): `timeStamp` is a DOM event time, default `performance.now()`. */
  tapAt(voice: 0 | 1, timeStamp?: number): TapEvent | null;
  readonly latencyMs: number;
}

/**
 * Maps `KeyboardEvent.timeStamp` to AudioContext time through `getOutputTimestamp()` pairs. `Space` (and
 * `F` / `J` for two voices) are captured only while armed; otherwise they keep their usual meaning. Key
 * repeats and keys typed into text fields are ignored.
 */
export function createTapInput(
  ctx: TimestampSource,
  opts: { target?: EventTarget; latencyMs?: number } = {},
): TapInput & TapInputExtras {
  const target = opts.target ?? (typeof window !== "undefined" ? window : undefined);
  let latencyMs = opts.latencyMs ?? 0;
  let armed = false;
  let twoVoices = false;
  /** Two-voice keys by code (Wave 7: a step's lanes may name their own keys; F and J otherwise). */
  let voiceOf: Readonly<Record<string, 0 | 1>> = KEY_VOICE;
  let list: TapEvent[] = [];
  const subs = new Set<(tap: TapEvent) => void>();

  const record = (voice: 0 | 1, timeStamp: number): TapEvent => {
    const tap: TapEvent = { time: eventTimeToContextTime(ctx, timeStamp) - latencyMs / 1000, voice };
    list.push(tap);
    for (const cb of [...subs]) cb(tap);
    return tap;
  };
  const onKey = (e: Event) => {
    if (!armed) return;
    const k = e as KeyboardEvent;
    if (k.repeat || k.metaKey || k.ctrlKey || k.altKey || isEditable(k.target)) return;
    const voice = twoVoices ? voiceOf[k.code] : k.code === "Space" ? 0 : undefined;
    if (voice === undefined) return;
    if (k.code === "Space" && twoVoices) return; // two voices: the two lane keys only
    k.preventDefault();
    record(voice, k.timeStamp);
  };
  target?.addEventListener("keydown", onKey, { capture: true });

  return {
    arm(o = {}) {
      armed = true;
      twoVoices = o.twoVoices ?? false;
      const a = o.keys ? laneKeyCode(o.keys[0]) : null;
      const b = o.keys ? laneKeyCode(o.keys[1]) : null;
      voiceOf = a && b && a !== b && a !== "Space" && b !== "Space" ? { [a]: 0, [b]: 1 } : KEY_VOICE;
      list = [];
    },
    disarm() {
      armed = false;
    },
    get armed() {
      return armed;
    },
    onTap(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    taps() {
      return [...list];
    },
    setLatency(ms) {
      latencyMs = Number.isFinite(ms) ? ms : 0;
    },
    get latencyMs() {
      return latencyMs;
    },
    tapAt(voice, timeStamp) {
      if (!armed) return null;
      return record(voice, timeStamp ?? (typeof performance !== "undefined" ? performance.now() : 0));
    },
    dispose() {
      armed = false;
      subs.clear();
      target?.removeEventListener("keydown", onKey, { capture: true });
    },
  };
}
