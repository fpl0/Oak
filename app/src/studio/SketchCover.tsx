// A sketch's cover: tree rings, one per saved version (the sketch grows a ring each time it is saved), on a
// tint of its Band flavour. Drawn from the theme tokens, so it reads in Paper and in Bark.
import { ringsOf } from "./model.ts";

const TONES = ["var(--oak-accent)", "var(--oak-accent-2)", "var(--oak-text-3)"];

export function SketchCover({
  seed,
  versions,
  flavour,
  size = 64,
  className,
}: {
  seed: string;
  versions: number;
  flavour?: string | null;
  size?: number;
  className?: string;
}) {
  const rings = ringsOf(seed, versions, 64);
  const tint =
    flavour === "flavour.jazz-soul"
      ? "color-mix(in oklab, var(--oak-accent-2) 16%, var(--oak-surface))"
      : flavour
        ? "color-mix(in oklab, var(--oak-accent) 12%, var(--oak-surface))"
        : "var(--oak-surface-2)";
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`${versions} ${versions === 1 ? "version" : "versions"}`}
    >
      <rect x="0" y="0" width="64" height="64" rx="10" fill={tint} />
      {/* bark and heartwood: every sketch has them; the rings in between are its versions */}
      <circle cx="32" cy="32" r="29" fill="none" stroke="var(--oak-border)" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="5" fill="var(--oak-accent-2)" fillOpacity="0.28" />
      {rings.map((r, i) => (
        <circle
          key={i}
          cx={32 + r.dx}
          cy={32 + r.dy}
          r={r.r}
          fill="none"
          stroke={TONES[r.tone]}
          strokeWidth={r.width}
          strokeOpacity={i === rings.length - 1 ? 1 : 0.55 + (0.4 * i) / Math.max(1, rings.length - 1)}
        />
      ))}
      <circle cx="32" cy="32" r="1.6" fill="var(--oak-text-2)" />
    </svg>
  );
}
