// The circle of fifths as a pick (U03.L07, wave3 task): majors on the outer ring, relative minors inside, one
// radio per key. Arrows walk the ring (←/→), ↑/↓ change ring; picking moves focus and selects, as a degree pad
// does. Marks and a revealed answer are drawn on the keys (outline, never colour alone). Used by the key answer
// (text `normalize: "key"`) and by the key-signature builder ("or pick from the circle").
import { clsx } from "clsx";
import { Check, X } from "lucide-react";
import { useRef } from "react";
import { CIRCLE_MAJORS, CIRCLE_MINORS, type CircleKey, ringPoint } from "./circle.ts";

export interface KeyCircleProps {
  /** The picked key's text ("F# major"), or null. */
  value: string | null;
  onPick(k: CircleKey): void;
  /** Which rings can be picked (default both). */
  rings?: "major" | "minor" | "both";
  disabled?: boolean | undefined;
  label: string;
  /** The answer's mark (the picked key is outlined right or wrong). */
  mark?: "ok" | "bad" | null;
  /** A revealed answer, outlined dashed. */
  answer?: string | null;
  /** Diameter in px (default 288). */
  size?: number;
  /** Label of the tab stop when nothing is picked. */
  idBase: string;
}

export function KeyCircle(p: KeyCircleProps) {
  const size = p.size ?? 288;
  const c = { x: size / 2, y: size / 2 };
  const root = useRef<HTMLDivElement>(null);
  const rings = p.rings ?? "both";
  const keys: CircleKey[] = [
    ...(rings !== "minor" ? CIRCLE_MAJORS : []),
    ...(rings !== "major" ? CIRCLE_MINORS : []),
  ];
  const picked = keys.find((k) => k.text === p.value) ?? null;
  const tabStop = picked ?? keys[0];

  const focusKey = (k: CircleKey) => {
    root.current?.querySelector<HTMLButtonElement>(`[data-key="${k.text}"]`)?.focus();
    p.onPick(k);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, k: CircleKey) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    const minor = k.key.mode === "minor";
    const ring = minor ? CIRCLE_MINORS : CIRCLE_MAJORS;
    const at = ring.indexOf(k);
    let next: CircleKey | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const dir = e.key === "ArrowRight" ? 1 : -1;
      next = ring[(at + dir + ring.length) % ring.length];
    } else if ((e.key === "ArrowDown" && !minor) || (e.key === "ArrowUp" && minor)) {
      const other = minor ? CIRCLE_MAJORS : CIRCLE_MINORS;
      if (rings === "both") next = other.find((o) => o.position === k.position && !o.enharmonic);
    } else if (e.key === "Home") next = ring[0];
    else if (e.key === "End") next = ring[ring.length - 1];
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    if (!p.disabled) focusKey(next);
  };

  const outer = size * 0.335;
  const inner = size * 0.2;
  const rim = size * 0.455;
  return (
    <div
      ref={root}
      role="radiogroup"
      aria-label={p.label}
      aria-disabled={p.disabled || undefined}
      className="relative shrink-0"
      style={{ width: size, height: size }}
      data-testid="key-circle"
    >
      <svg aria-hidden width={size} height={size} className="absolute inset-0 overflow-visible">
        <circle cx={c.x} cy={c.y} r={size * 0.4} fill="var(--oak-surface)" stroke="var(--oak-border)" />
        <circle
          cx={c.x}
          cy={c.y}
          r={(outer + inner) / 2}
          fill="none"
          stroke="var(--oak-border)"
          strokeDasharray="2 4"
        />
        <circle cx={c.x} cy={c.y} r={size * 0.12} fill="var(--oak-surface-2)" stroke="var(--oak-border)" />
        <text x={c.x} y={c.y - 3} textAnchor="middle" fontSize={10.5} fill="var(--oak-text-2)">
          ♯ clockwise
        </text>
        <text x={c.x} y={c.y + 11} textAnchor="middle" fontSize={10.5} fill="var(--oak-text-2)">
          ♭ anticlockwise
        </text>
      </svg>
      {keys.map((k) => {
        const minor = k.key.mode === "minor";
        const pt = ringPoint(k.position, k.enharmonic ? rim : minor ? inner : outer, c);
        const on = picked === k;
        const isAnswer = p.answer === k.text;
        const mark = on ? (p.mark ?? null) : null;
        const d = k.enharmonic ? 30 : minor ? 32 : 38;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a key on the circle is a styled radio placed by angle
          <button
            key={k.text}
            type="button"
            role="radio"
            data-key={k.text}
            aria-checked={on}
            aria-label={`${k.spoken}${isAnswer ? " (the answer)" : ""}`}
            aria-disabled={p.disabled || undefined}
            tabIndex={tabStop === k ? 0 : -1}
            onClick={() => {
              if (!p.disabled) p.onPick(k);
            }}
            onKeyDown={(e) => onKeyDown(e, k)}
            className={clsx(
              "absolute inline-flex items-center justify-center rounded-full border-2 font-semibold tabular-nums transition-colors",
              minor || k.enharmonic ? "text-[0.78rem]" : "text-[0.95rem]",
              on
                ? mark === "bad"
                  ? "border-issue bg-surface-2 text-text"
                  : mark === "ok"
                    ? "border-accent bg-accent text-on-accent"
                    : "border-text bg-text text-surface"
                : "border-transparent bg-surface text-text hover:border-border",
              k.enharmonic && !on && "text-text-2",
              isAnswer && "outline-2 outline-offset-2 outline-dashed outline-accent-2",
              p.disabled && "cursor-default",
            )}
            style={{ width: d, height: d, left: pt.x - d / 2, top: pt.y - d / 2 }}
          >
            {k.label}
            {mark ? (
              <span
                className={clsx(
                  "pointer-events-none absolute -top-1.5 -right-1.5 inline-flex size-4 items-center justify-center rounded-full",
                  mark === "ok" ? "bg-accent text-on-accent" : "bg-issue text-white",
                )}
              >
                {mark === "ok" ? (
                  <Check aria-hidden className="size-3" />
                ) : (
                  <X aria-hidden className="size-3" />
                )}
                <span className="sr-only">{mark === "ok" ? "right" : "not this one"}</span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
