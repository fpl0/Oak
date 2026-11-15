// EuclidRing (Wave 7): a Euclidean rhythm `x(k,n,r)` drawn as a ring — R3.L01's tresillo (3,8), R3.L03's bossa rim
// (5,16,10), RC2's percussion. `n` steps round a circle from the top, clockwise; a hit is a filled dot with its
// step number, a rest a small hollow one; the hits are joined by a faint polygon, so a rotation reads as the same
// shape turned. The grid is @oak/theory's `euclid` (Strudel's rotation: the pattern moves right by `r` steps).
// `playStep` outlines the step that sounds. With `onChange` the ring is editable from the keyboard (one tab stop:
// ArrowUp/ArrowDown a hit more or fewer, ArrowRight/ArrowLeft rotate, Shift+ArrowUp/ArrowDown a step more or
// fewer, Home: no rotation) and, with `controls`, from three − value + controls. The owner plays it.
import { clsx } from "clsx";
import { type KeyboardEvent, useId } from "react";
import {
  type EuclidLimits,
  type EuclidValue,
  euclidCode,
  euclidGrid,
  euclidKeyValue,
  euclidText,
  ringPoint,
} from "./model-w7.ts";
import { Nudge } from "./Transport.tsx";

export type { EuclidValue };

export interface EuclidRingProps {
  value: EuclidValue;
  /** Editable when given. */
  onChange?: (v: EuclidValue) => void;
  /** The step that sounds now, or `null`. */
  playStep?: number | null;
  /** Accessible name prefix ("Rim"). */
  label?: string;
  /** Diameter in px. */
  size?: number;
  /** Shows "(5,16,10)" under the ring. */
  showCode?: boolean;
  /** Draws the − value + controls under an editable ring. */
  controls?: boolean;
  limits?: EuclidLimits;
  className?: string;
  "data-testid"?: string;
}

export function EuclidRing({
  value,
  onChange,
  playStep = null,
  label = "Rhythm",
  size = 168,
  showCode = true,
  controls = false,
  limits,
  className,
  "data-testid": testId,
}: EuclidRingProps) {
  const descId = useId();
  const grid = euclidGrid(value);
  const n = grid.length;
  const c = size / 2;
  const r = c - 16;
  const hitR = n > 12 ? 7 : 8.5;
  const hits = grid.flatMap((on, i) => (on ? [i] : []));
  const poly = hits.map((i) => ringPoint(i, n, r, c, c));
  const text = euclidText(value);
  const editable = onChange !== undefined;
  const minSteps = limits?.minSteps ?? 2;
  const maxSteps = limits?.maxSteps ?? 16;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onChange) return;
    const next = euclidKeyValue(e, value, limits);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(next);
  };
  const drawing = (
    <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} fill="none" className="stroke-border" strokeWidth={1.5} />
      {poly.length >= 3 && (
        <polygon
          points={poly.map((p) => `${p.x},${p.y}`).join(" ")}
          className="fill-accent/10 stroke-accent/50"
          strokeWidth={1.25}
        />
      )}
      {poly.length === 2 && (
        <line
          x1={poly[0]?.x}
          y1={poly[0]?.y}
          x2={poly[1]?.x}
          y2={poly[1]?.y}
          className="stroke-accent/50"
          strokeWidth={1.25}
        />
      )}
      {/* Step 0 (the downbeat) is marked outside the ring. */}
      <line x1={c} y1={c - r - 13} x2={c} y2={c - r - 7} className="stroke-text-2" strokeWidth={2} />
      {grid.map((on, i) => {
        const p = ringPoint(i, n, r, c, c);
        const now = playStep !== null && ((playStep % n) + n) % n === i;
        return (
          <g key={i} data-step={i} data-hit={on || undefined}>
            {now && (
              <circle cx={p.x} cy={p.y} r={hitR + 3.5} className="fill-none stroke-text" strokeWidth={2} />
            )}
            {on ? (
              <>
                <circle cx={p.x} cy={p.y} r={hitR} className="fill-accent" />
                <text
                  x={p.x}
                  y={p.y}
                  dy="0.35em"
                  textAnchor="middle"
                  className="fill-on-accent font-mono"
                  style={{ fontSize: n > 12 ? 8 : 9, fontWeight: 600 }}
                >
                  {i + 1}
                </text>
              </>
            ) : (
              <circle cx={p.x} cy={p.y} r={3} className="fill-surface stroke-text-3" strokeWidth={1.25} />
            )}
          </g>
        );
      })}
      <text
        x={c}
        y={c}
        dy="0.35em"
        textAnchor="middle"
        className="fill-text font-mono"
        style={{ fontSize: 13, fontWeight: 600 }}
      >
        {value.pulses}/{value.steps}
      </text>
    </svg>
  );
  return (
    <div className={clsx("inline-flex flex-col items-center gap-2", className)} data-testid={testId}>
      {editable ? (
        // biome-ignore lint/a11y/useSemanticElements: an image of the rhythm that is one keyboard stop; a fieldset would add a legend and a frame.
        <div
          role="group"
          tabIndex={editable ? 0 : -1}
          aria-label={`${label}: ${text}`}
          aria-describedby={descId}
          onKeyDown={onKeyDown}
          data-euclid={euclidCode(value)}
          className="rounded-full"
          style={{ width: size, height: size }}
        >
          {drawing}
        </div>
      ) : (
        <div
          role="img"
          aria-label={`${label}: ${text}`}
          data-euclid={euclidCode(value)}
          style={{ width: size, height: size }}
        >
          {drawing}
        </div>
      )}
      {showCode && (
        <p className="font-mono text-sm text-text-2" data-testid="euclid-code">
          x{euclidCode(value)}
        </p>
      )}
      {editable && (
        <p id={descId} className="sr-only">
          Up and Down add or remove a hit, Left and Right rotate, Shift with Up or Down changes the steps,
          Home removes the rotation.
        </p>
      )}
      {editable && controls && onChange && (
        <div className="flex flex-col items-end gap-1.5">
          <Nudge
            label="Hits"
            value={value.pulses}
            min={0}
            max={value.steps}
            onChange={(k) => onChange({ ...value, pulses: k })}
          />
          <Nudge
            label="Steps"
            value={value.steps}
            min={minSteps}
            max={maxSteps}
            onChange={(s) =>
              onChange({ steps: s, pulses: Math.min(value.pulses, s), rotation: value.rotation % s })
            }
          />
          <Nudge
            label="Rotation"
            value={value.rotation}
            min={0}
            max={value.steps - 1}
            onChange={(rot) => onChange({ ...value, rotation: rot })}
          />
        </div>
      )}
    </div>
  );
}
