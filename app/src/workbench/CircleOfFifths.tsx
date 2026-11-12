// The circle-of-fifths widget (tb.feature.circle, unlocked at U03.L07): twelve signatures in a ring, a fifth
// apart: each step clockwise adds a sharp, each step the other way adds a flat. Outer ring major keys, inner ring
// their relative minors. The piece's key is lit (and every other key a patterned `.scale()` visits is outlined).
// Choosing a key plays the same code in that key without editing it; "Use this key" is the explicit edit of the
// `.scale()` arguments. Keyboard: the ring is one tab stop; arrows go round it, Enter or Space plays, Esc stops.
import type { KeySpec } from "@oak/content-kit";
import { fifthsOfKey } from "@oak/theory";
import { useState } from "react";
import {
  glyph,
  keyName,
  keyOfSlot,
  ring,
  sameKey,
  signatureShort,
  signatureText,
  slotOf,
} from "./key-tools.ts";
import type { KeyPreview } from "./use-key-preview.ts";

export interface CircleProps {
  /** The piece's key now. */
  current: KeySpec | null;
  /** Every key the piece visits. */
  keys: readonly KeySpec[];
  preview: KeyPreview | null;
}

const SIZE = 248;
const C = SIZE / 2;
const R_OUT = 104;
const R_IN = 66;

function polar(r: number, index: number): { x: number; y: number } {
  const a = (index / 12) * Math.PI * 2 - Math.PI / 2;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}

export function CircleOfFifths({ current, keys, preview }: CircleProps) {
  const slots = ring();
  const mode = current?.mode ?? "major";
  const minorish = mode === "minor";
  const here = current ? slotOf(current) : 0;
  const [focus, setFocus] = useState<number>(here);
  const [chosen, setChosen] = useState<number | null>(null);
  const visited = new Set(keys.map(slotOf));
  const target = chosen === null ? null : keyOfSlot(chosen, mode);
  const playing = preview?.playing ?? null;

  const choose = (i: number) => {
    setChosen(i);
    setFocus(i);
    if (!preview?.movable || !current) return;
    const k = keyOfSlot(i, mode);
    if (sameKey(k, current)) {
      preview.stop();
      return;
    }
    if (playing && sameKey(playing, k)) preview.stop();
    else preview.preview(k);
  };

  const onKey = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    const step =
      ev.key === "ArrowRight" || ev.key === "ArrowDown"
        ? 1
        : ev.key === "ArrowLeft" || ev.key === "ArrowUp"
          ? -1
          : 0;
    if (step) {
      ev.preventDefault();
      ev.stopPropagation();
      setFocus((f) => (f + step + 12) % 12);
      return;
    }
    if (ev.key === "Home") {
      ev.preventDefault();
      setFocus(here);
      return;
    }
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      ev.stopPropagation();
      choose(focus);
      return;
    }
    if (ev.key === "Escape" && playing) {
      ev.preventDefault();
      ev.stopPropagation();
      preview?.stop();
    }
  };

  const focusKey = keyOfSlot(focus, mode);
  return (
    <section className="oak-wb-panel oak-circle" aria-label="Circle of fifths" data-testid="circle-panel">
      <h3 className="oak-wb-panel-title">
        <span className="oak-muted">Circle of fifths</span>{" "}
        {current ? <span data-testid="circle-current">{keyName(current)}</span> : null}
      </h3>
      <div
        role="listbox"
        aria-label={`Keys by signature. ${current ? `The piece is in ${keyName(current)}.` : ""} Arrows move, Enter plays the code in that key.`}
        aria-activedescendant={`oak-circle-${focus}`}
        tabIndex={0}
        onKeyDown={onKey}
        className="oak-circle-box"
        data-testid="circle"
      >
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="none"
          className="oak-circle-svg"
        >
          <circle cx={C} cy={C} r={R_OUT + 20} className="oak-circle-ring" />
          <circle cx={C} cy={C} r={R_IN - 18} className="oak-circle-hub" />
          {slots.map((s) => {
            const outer = polar(R_OUT, s.index);
            const inner = polar(R_IN, s.index);
            const isHere = current !== null && s.index === here;
            const isOn = playing !== null && slotOf(playing) === s.index;
            const isVisited = !isHere && visited.has(s.index);
            const k = keyOfSlot(s.index, mode);
            return (
              <g
                key={s.index}
                id={`oak-circle-${s.index}`}
                role="option"
                aria-selected={isHere}
                aria-label={`${keyName(s.major)} or ${keyName(s.minor)}, ${signatureText(s.major)}${isHere ? ", the piece's key" : ""}${isOn ? ", playing" : ""}`}
                className="oak-circle-slot"
                data-slot={s.index}
                data-key={keyName(k)}
                data-here={isHere ? "1" : undefined}
                data-on={isOn ? "1" : undefined}
                data-visited={isVisited ? "1" : undefined}
                data-focus={s.index === focus ? "1" : undefined}
                onClick={() => choose(s.index)}
              >
                <circle cx={outer.x} cy={outer.y} r={19} className="oak-circle-major" />
                <text
                  x={outer.x}
                  y={outer.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="oak-circle-text"
                >
                  {glyph(s.major.tonic)}
                </text>
                <text
                  x={inner.x}
                  y={inner.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className={`oak-circle-minor${minorish && isHere ? " is-here" : ""}`}
                >
                  {glyph(s.minor.tonic)}m
                </text>
              </g>
            );
          })}
          <text x={C} y={C - 7} textAnchor="middle" className="oak-circle-center">
            {current ? glyph(current.tonic) : "—"}
            {current && current.mode !== "major" ? "m" : ""}
          </text>
          <text x={C} y={C + 11} textAnchor="middle" className="oak-circle-sub">
            {/* The key's own signature: C♭ major sits on B's slot but has seven flats, not five sharps. */}
            {current ? signatureShort(fifthsOfKey(current)) : "no key"}
          </text>
        </svg>
      </div>
      <div className="oak-circle-actions" aria-live="polite" data-testid="circle-status">
        {!current ? (
          <p className="oak-muted">No key yet: the ring lights the key of the code once it has one.</p>
        ) : !preview ? (
          <p className="oak-muted">Each step clockwise adds a sharp; each step the other way adds a flat.</p>
        ) : !preview.movable ? (
          <p className="oak-muted">{preview.why ?? "This code cannot move key here."}</p>
        ) : playing ? (
          <>
            <span>
              Hearing your code in <strong>{keyName(playing)}</strong> ({signatureText(playing)}).
            </span>
            <span className="oak-circle-buttons">
              <button
                type="button"
                className="oak-toggle"
                onClick={() => preview.stop()}
                data-testid="circle-stop"
              >
                Stop
              </button>
              {preview.canUse ? (
                <button
                  type="button"
                  className="oak-toggle oak-primary-toggle"
                  onClick={() => preview.use(playing)}
                  data-testid="circle-use"
                >
                  Use {keyName(playing)}
                </button>
              ) : null}
            </span>
          </>
        ) : preview.pending ? (
          <span>Loading {keyName(preview.pending)}…</span>
        ) : target && !sameKey(target, current) && preview.canUse ? (
          <>
            <span className="oak-muted">Stopped. Your code is still in {keyName(current)}.</span>
            <span className="oak-circle-buttons">
              <button type="button" className="oak-toggle" onClick={() => preview.preview(target)}>
                Hear {keyName(target)}
              </button>
              <button
                type="button"
                className="oak-toggle oak-primary-toggle"
                onClick={() => preview.use(target)}
                data-testid="circle-use"
              >
                Use {keyName(target)}
              </button>
            </span>
          </>
        ) : (
          <p className="oak-muted">
            Choose a key to hear this code in it; your code stays as it is.{" "}
            <span className="sr-only">Focused: {keyName(focusKey)}.</span>
          </p>
        )}
        {preview?.error ? <p className="oak-issue-text">{preview.error}</p> : null}
      </div>
    </section>
  );
}
