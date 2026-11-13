// Keyed material shared by the degree, interval, melody and harmony generators: the context bar (code C),
// the scale octave and register (code R), chord tracks from voiced progressions, and comfort-range sung
// targets.
import type { Cue, Degree, KeySpec } from "@oak/content-kit";
import type { TrackSpec } from "../build.ts";
import { type RnChord, scaleArg, tonicMidi } from "../kernel.ts";
import { comfortShift, contextChords, spellVoiced, type Voiced, voiceProgression } from "../music.ts";
import { chordOf, type Node, rest, seq } from "../pat.ts";
import { CADENCE_SOUNDS } from "../pools.ts";
import type { Rng } from "../types.ts";
import { CTX, contextOpen, type GenCtx, jitter, range } from "./common.ts";

export const degreeCategory = (d: Degree): string => `deg.${d.replace("#", "s")}`;
export const categoryDegree = (c: string): Degree => c.replace(/^deg\./, "").replace("s", "#") as Degree;

/** A scale octave whose tonic lies in the register, chosen at random; the nearest one otherwise. */
export function pickOctave(rng: Rng, key: KeySpec, lo: number, hi: number): number {
  const options = [1, 2, 3, 4, 5].filter((o) => {
    const t = tonicMidi(key.tonic, o);
    return t >= lo && t <= hi;
  });
  if (options.length > 0) return rng.pick(options);
  let best = 3;
  let dist = Number.POSITIVE_INFINITY;
  for (const o of [1, 2, 3, 4, 5]) {
    const d = Math.abs(tonicMidi(key.tonic, o) - (lo + hi) / 2);
    if (d < dist) {
      dist = d;
      best = o;
    }
  }
  return best;
}

export const register = (ctx: GenCtx, fallback: [number, number] = [60, 72]): [number, number] =>
  range(ctx.level, "register", fallback);

/** Node of one voiced chord in code spelling. */
export const voicedNode = (v: Voiced, key: KeySpec | null): Node => chordOf(spellVoiced(v, key));

/** A chord track over bars: `null` bars are silent. Each bar holds a sequence of chords (one per slot). */
export function chordTrack(
  ctx: GenCtx,
  key: KeySpec,
  bars: (readonly Voiced[] | null)[],
  opts: { label?: string; sound?: string; gain?: number } = {},
): TrackSpec {
  const nodes = bars.map((b) =>
    b === null || b.length === 0 ? rest : seq(b.map((v) => voicedNode(v, key))),
  );
  return {
    label: opts.label ?? "chords",
    src: "note",
    pat: nodes.length === 1 ? (nodes[0] as Node) : { t: "alt", items: nodes },
    s: opts.sound ?? ctx.rng.pick(CADENCE_SOUNDS),
    gain: jitter(ctx, opts.gain ?? 0.5),
  };
}

/** The context bar of code C for the cue's context, voiced; `null` when the context is `none`. */
export function contextBar(ctx: GenCtx, key: KeySpec, context: Cue["context"]): Voiced[] | null {
  if (context === "none") return null;
  const chords: RnChord[] = contextChords(ctx.rng, key, context, { majorV: contextOpen(ctx, CTX.majorV) });
  return voiceProgression(chords, key);
}

/** An `n(...).scale(...)` track over bars. */
export function stepTrack(
  key: KeySpec,
  octave: number,
  bars: (Node | null)[],
  sound: string,
  opts: { label?: string; gain?: number } = {},
): TrackSpec {
  const nodes = bars.map((b) => b ?? rest);
  return {
    label: opts.label ?? "mel",
    src: "n",
    pat: nodes.length === 1 ? (nodes[0] as Node) : { t: "alt", items: nodes },
    key,
    octave,
    s: sound,
    ...(opts.gain !== undefined ? { gain: opts.gain } : {}),
  };
}

/** Sung targets inside comfLow+1 … comfHigh−1, one per beat from `startSec`. */
export function singTargets(
  ctx: GenCtx,
  midis: readonly number[],
  beatSec: number,
  startSec = 0,
): { midi: number; on: number; off: number }[] {
  const shift = comfortShift(midis, ctx.profile.comfLow, ctx.profile.comfHigh);
  return midis.map((m, i) => ({
    midi: m + shift,
    on: startSec + i * beatSec,
    off: startSec + (i + 1) * beatSec,
  }));
}
export const scaleLabel = scaleArg;
