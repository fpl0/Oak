// Album covers: growth rings drawn from the track's `coverSeed` (ux §5.3, "the rings cover"). Deterministic: the
// same seed always draws the same cover.
import { PARTS_PALETTE } from "./theme/palette.ts";

export interface Ring {
  r: number;
  width: number;
  colour: string;
  /** Slight off-centre wobble, as in real wood. */
  dx: number;
  dy: number;
}

/** FNV-1a, then mulberry32: a small, stable PRNG from a string. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function coverRings(seed: string, size = 100): Ring[] {
  const rnd = seededRandom(seed);
  const count = 6 + Math.floor(rnd() * 7);
  const rings: Ring[] = [];
  let r = size * 0.06;
  const step = (size * 0.44 - r) / count;
  for (let i = 0; i < count; i++) {
    r += step * (0.6 + rnd() * 0.8);
    rings.push({
      r: Math.min(r, size * 0.47),
      width: 0.8 + rnd() * 2.6,
      colour: PARTS_PALETTE[Math.floor(rnd() * PARTS_PALETTE.length)] ?? PARTS_PALETTE[0],
      dx: (rnd() - 0.5) * size * 0.02,
      dy: (rnd() - 0.5) * size * 0.02,
    });
  }
  return rings;
}

export function AlbumCover({ seed, title, size = 160 }: { seed: string; title: string; size?: number }) {
  const rings = coverRings(seed);
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`Cover of ${title}`}
      className="rounded-card bg-surface-2"
    >
      <rect width="100" height="100" rx="8" className="fill-surface-2" />
      {rings.map((ring, i) => (
        <circle
          key={i}
          cx={50 + ring.dx}
          cy={50 + ring.dy}
          r={ring.r}
          fill="none"
          stroke={ring.colour}
          strokeWidth={ring.width}
          strokeOpacity={0.85}
        />
      ))}
      <circle cx="50" cy="50" r="3" className="fill-text-2" />
    </svg>
  );
}
