// @oak/strudel: the OakStrudel adapter. Browser only; the single place that imports @strudel/codemirror,
// @strudel/webaudio, @strudel/draw, @strudel/soundfonts and superdough.
// Promote spikes/s2-editors/src/oakStrudel.ts and spikes/s3-sounds/src/oak-audio.ts with their gotchas.
import type { OakStrudel, OakStrudelOptions } from "./types.ts";

export * from "./types.ts";

let instance: OakStrudel | null = null;

/**
 * Creates the adapter. One per page: a second call throws. It applies the full CodeMirror settings
 * object before the first mirror, prebakes once, installs the master bus and stubs the visual methods
 * (`.scope()` and `.fscope()` route to Oak's own panel through `master.analyser`).
 */
export function createOakStrudel(options: OakStrudelOptions): OakStrudel {
  if (instance) throw new Error("@oak/strudel: the adapter already exists; use getOakStrudel()");
  throw new Error(`@oak/strudel: createOakStrudel is not implemented yet (${options.soundsRoot})`);
}
/** The adapter created by `createOakStrudel`. Throws before that. */
export function getOakStrudel(): OakStrudel {
  if (!instance) throw new Error("@oak/strudel: createOakStrudel() has not been called");
  return instance;
}
/** Tests only: forget the instance after disposing it. */
export function resetOakStrudelForTests(): void {
  instance?.dispose();
  instance = null;
}
/** An editor ID that satisfies the trailing-underscore rule: `oak_${slug}_${n}_`. */
export function editorId(slug: string, n = 0): string {
  return `oak_${slug.replace(/[^A-Za-z0-9]+/g, "-")}_${n}_`;
}
/** Limiter settings of the master bus. A DynamicsCompressor adds makeup gain even below threshold; `trim` undoes it. */
export const LIMITER = { threshold: -3, knee: 0, ratio: 20, attack: 0.003, release: 0.1 } as const;
/** Makeup gain the compressor applies, in dB: `−(threshold − threshold / ratio) × 0.6`. */
export function limiterMakeupDb(
  threshold: number = LIMITER.threshold,
  ratio: number = LIMITER.ratio,
): number {
  return -(threshold - threshold / ratio) * 0.6;
}
