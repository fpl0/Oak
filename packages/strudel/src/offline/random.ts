/** Mulberry32, fixed per fresh realm. Strudel's time-based pattern RNG already has a stable default seed. */
export function seedRandom(): void {
  let seed = 0x0a4c5eed;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Supersaw and z-saw phases live in AudioWorkletGlobalScope, which has its own Math. */
export async function seedWorklet(ctx: OfflineAudioContext): Promise<void> {
  const url = URL.createObjectURL(new Blob([`(${seedRandom.toString()})();`], { type: "text/javascript" }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
