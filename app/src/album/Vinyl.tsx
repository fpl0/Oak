// The record in the sleeve: grooves, a label carrying the cover, a slow turn while the album plays (still with
// reduced motion). Decorative: the sleeve beside it carries the meaning.
import { clsx } from "clsx";
import type { ReactNode } from "react";

export function Vinyl({
  size,
  spinning,
  label,
  empty,
}: {
  size: number;
  spinning?: boolean;
  label?: ReactNode;
  empty?: boolean;
}) {
  const grooves = Array.from({ length: 14 }, (_, i) => 48 - i * 2.2);
  return (
    <div
      aria-hidden
      className={clsx("relative shrink-0 rounded-full", spinning && "oak-vinyl-spin")}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} className="absolute inset-0" aria-hidden="true">
        {empty ? (
          <circle
            cx="50"
            cy="50"
            r="49"
            fill="none"
            stroke="var(--oak-border)"
            strokeWidth="0.8"
            strokeDasharray="2 2"
          />
        ) : (
          <>
            <circle cx="50" cy="50" r="49.5" fill="#15110e" />
            {grooves.map((r) => (
              <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#2b241e" strokeWidth="0.35" />
            ))}
            <path
              d="M50 6 A44 44 0 0 1 86 26"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.08"
              strokeWidth="5"
            />
            <circle cx="50" cy="50" r="1.4" fill="#d9cdb8" />
          </>
        )}
      </svg>
      {label && (
        <div
          className="absolute overflow-hidden rounded-full"
          style={{ width: size * 0.34, height: size * 0.34, left: size * 0.33, top: size * 0.33 }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
