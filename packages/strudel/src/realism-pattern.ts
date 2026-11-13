// The realism layers of a ladder stimulus (contracts §6.12, wave4.md §3.5), applied to the hidden pattern the
// pattern player plays. Never to its code, which no one sees. Every random choice is a hash of the spec's seed
// and the hap's own position (track, onset, pitch), so a replay of the same item, a loop, a re-load or a change
// of rate sounds the same. Grading tolerances never change with realism: answers stay on the grid.
//
//   R1 timing: each onset moves by up to ±timingMs (milliseconds of the item at rate 1, so a slowed item
//      stretches the feel like a slowed recording); velocity: × a factor in [1 − 2v, 1], centred on 1 − v.
//   R2 swing: `.swingBy(amount, 4)` (swung eighths in 4/4) on every part but the target; room on every part
//      that sets none.
//   R3 the target part's gain × 10^(db/20).
//   R4 the target part, when pitched, on a vocal-like lead sound, its pitch drifting slowly by up to
//      ±detuneCents (a sine over 8 bars, quantized to 10-cent steps so the preloader can warm every pitch).
import * as core from "@strudel/core";
import { TRACK_KEY } from "./haps.ts";
import type { RealismSpec } from "./realism.ts";

type Pattern = Strudel.Pattern;
type Hap = Strudel.Hap;
/** The parts of Strudel's TimeSpan this file uses (the module is untyped). */
interface Span extends Strudel.TimeSpan {
  withTime(fn: (t: Strudel.Fraction) => Strudel.Fraction): Span;
  intersection(other: Span): Span | undefined;
}

/** Label prefix of a pattern source's reference tracks when they play beside the learner's code (A/B). */
export const REFERENCE_PREFIX = "ref_";
/** The bars over which the R4 lead's detune drifts once up and once down. */
export const DETUNE_PERIOD_BARS = 8;
/** Detune steps, cents: the drift is quantized so a finite set of pitches is warmed ahead. */
export const DETUNE_STEP_CENTS = 10;

/** 32-bit FNV-1a, then an avalanche: the same text always gives the same number. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A deterministic number in [−1, 1] for a seed, a purpose and a hap position. */
export function unitNoise(seed: number, purpose: string, key: string): number {
  return (hash32(`${seed}|${purpose}|${key}`) / 0xffffffff) * 2 - 1;
}

/**
 * Whether a hap's track is the realism target: the generator's name (`bass`), or the same name as a pattern
 * source labels it beside the learner's code (`ref_bass`, `ref_bass_1`, one label per sound of the track).
 */
export function isTargetTrack(track: string | null | undefined, target: string | null | undefined): boolean {
  if (!track || !target) return false;
  if (track === target) return true;
  const bare = track.startsWith(REFERENCE_PREFIX) ? track.slice(REFERENCE_PREFIX.length) : track;
  const safe = target.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return bare === target || bare === safe || new RegExp(`^${escapeRe(safe)}_\\d+$`).test(bare);
}

/**
 * Which tracks realism touches. When any reference track is present (`ref_…`, a pattern source beside the
 * learner's own code), only those: the learner's side of an A/B is never humanised. Otherwise every track.
 */
export function realismScope(tracks: readonly string[]): (track: string | null) => boolean {
  const hasReference = tracks.some((t) => t.startsWith(REFERENCE_PREFIX));
  if (!hasReference) return () => true;
  return (track) => typeof track === "string" && track.startsWith(REFERENCE_PREFIX);
}

const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const trackOf = (hap: Hap): string | null => {
  const t = hap.context?.[TRACK_KEY];
  return typeof t === "string" ? t : null;
};
const beginOf = (hap: Hap): number => Number((hap.whole ?? hap.part).begin.valueOf());
const onsetKey = (at: number): string => at.toFixed(6);
const hapValue = (hap: Hap): Record<string, unknown> | null =>
  hap.value && typeof hap.value === "object" && !Array.isArray(hap.value)
    ? (hap.value as Record<string, unknown>)
    : null;
const pitchKey = (v: Record<string, unknown> | null): string =>
  v ? String(v.note ?? v.n ?? v.freq ?? v.s ?? "") : "";

/** The R4 drift at a bar position, cents, quantized to `DETUNE_STEP_CENTS`. */
export function detuneAt(spec: RealismSpec, bar: number): number {
  if (spec.detuneCents <= 0) return 0;
  const phase = ((hash32(`${spec.seed}|detune`) % 1000) / 1000) * 2 * Math.PI;
  const raw = spec.detuneCents * Math.sin((2 * Math.PI * bar) / DETUNE_PERIOD_BARS + phase);
  const step = Math.round(raw / DETUNE_STEP_CENTS) * DETUNE_STEP_CENTS;
  return Math.max(-spec.detuneCents, Math.min(spec.detuneCents, step)) || 0;
}

/** A note as a MIDI number (strings through Strudel's own `noteToMidi`), or null. */
function midiOf(note: unknown): number | null {
  if (typeof note === "number" && Number.isFinite(note)) return note;
  if (typeof note === "string") {
    try {
      const m = core.noteToMidi(note) as number;
      return Number.isFinite(m) ? m : null;
    } catch {
      return null;
    }
  }
  return null;
}

export interface RealismContext {
  /** The item's tempo at rate 1 (cycles per second): turns the spec's milliseconds into cycles. */
  cps: number;
  /** The tracks the code registered (decides the scope: reference tracks only, or all). */
  tracks: readonly string[];
  /**
   * Where a cycle of the pattern sits in the item (default: the same cycle). With an A–B loop the pattern player
   * applies realism after the loop and maps each looped cycle back to the bar it plays, so bar 3 looped is
   * humanised exactly as bar 3 in the full play, and a note pushed across the loop point stays one note.
   */
  origin?: (cycle: number) => number;
  /** The target track (never swung; buried at R3, lead sound at R4). Default: the spec's `target`, else `buried.track`. */
  target?: string | null;
}

/** The value changes of one hap: velocity, room, buried gain, lead sound and detune. */
export function realismValue(
  spec: RealismSpec,
  value: Record<string, unknown>,
  at: { track: string | null; onset: string; bar: number },
  target: string | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...value };
  const key = `${at.track ?? "main"}|${at.onset}|${pitchKey(value)}`;
  if (spec.velocity > 0) {
    const v = typeof value.velocity === "number" ? value.velocity : 1;
    const factor = 1 - spec.velocity + spec.velocity * unitNoise(spec.seed, "velocity", key);
    out.velocity = clamp01(v * factor);
  }
  if (spec.room > 0 && value.room === undefined) out.room = spec.room;
  const isTarget = isTargetTrack(at.track, target);
  if (isTarget && spec.buried) {
    const g = typeof value.gain === "number" ? value.gain : 1;
    out.gain = g * 10 ** (spec.buried.db / 20);
  }
  if (isTarget && spec.leadSound && value.note !== undefined) {
    const midi = midiOf(value.note);
    if (midi !== null) {
      out.s = spec.leadSound;
      delete out.bank;
      delete out.n;
      out.note = midi + detuneAt(spec, at.bar) / 100;
    }
  }
  return out;
}

/** Moves each onset of `pattern` by its own deterministic offset (cycles), within ±maxCycles. */
function humanizeTiming(pattern: Pattern, maxCycles: number, offsetOf: (hap: Hap) => number): Pattern {
  const F = core.Fraction as (x: number) => Strudel.Fraction;
  return new core.Pattern((state: Strudel.State & { setSpan(span: unknown): Strudel.State }) => {
    const span = state.span as Span;
    const wide = new core.TimeSpan(span.begin.sub(F(maxCycles)), span.end.add(F(maxCycles)));
    const out: Hap[] = [];
    for (const hap of pattern.query(state.setSpan(wide))) {
      const off = F(offsetOf(hap));
      const shift = (s: Span | undefined): Span | undefined => s?.withTime((t) => t.add(off));
      const whole = shift(hap.whole as Span | undefined);
      const part = shift(hap.part as Span)?.intersection(span);
      if (!part || part.end.valueOf() <= part.begin.valueOf()) continue;
      out.push(new core.Hap(whole, part, hap.value, hap.context) as Hap);
    }
    return out;
  }) as Pattern;
}

/**
 * The pattern with the spec's realism. R0 returns the pattern itself. `ctx.cps` is the tempo at rate 1, so the
 * humanisation is in the item's own milliseconds whatever rate the learner listens at.
 */
export function applyRealism(pattern: Pattern, spec: RealismSpec, ctx: RealismContext): Pattern {
  if (
    spec.timingMs === 0 &&
    spec.velocity === 0 &&
    spec.swing === null &&
    spec.room === 0 &&
    spec.buried === null &&
    spec.leadSound === null &&
    spec.detuneCents === 0
  )
    return pattern;
  const inScope = realismScope(ctx.tracks);
  const origin = ctx.origin ?? ((c: number) => c);
  const target = ctx.target !== undefined ? ctx.target : (spec.target ?? spec.buried?.track ?? null);
  // Only the scoped tracks take realism; the rest pass untouched.
  const scoped = pattern.filterHaps((h: Hap) => inScope(trackOf(h)));
  const rest = pattern.filterHaps((h: Hap) => !inScope(trackOf(h)));
  let out = scoped;
  if (spec.swing) {
    const swingBy = (p: Pattern): Pattern =>
      (p.swingBy as (amount: number, n: number) => Pattern).call(p, spec.swing?.amount ?? 0, 4);
    const isT = (h: Hap) => isTargetTrack(trackOf(h), target);
    out = core.stack(swingBy(out.filterHaps((h: Hap) => !isT(h))), out.filterHaps(isT)) as Pattern;
  }
  out = out.withHap((hap: Hap) => {
    const v = hapValue(hap);
    if (!v) return hap;
    const at = origin(beginOf(hap));
    const value = realismValue(spec, v, { track: trackOf(hap), onset: onsetKey(at), bar: at }, target);
    return hap.withValue(() => value) as Hap;
  });
  if (spec.timingMs > 0 && ctx.cps > 0) {
    const maxCycles = (spec.timingMs / 1000) * ctx.cps;
    out = humanizeTiming(out, maxCycles, (hap) => {
      const key = `${trackOf(hap) ?? "main"}|${onsetKey(origin(beginOf(hap)))}|${pitchKey(hapValue(hap))}`;
      return maxCycles * unitNoise(spec.seed, "timing", key);
    });
  }
  return core.stack(out, rest) as Pattern;
}
