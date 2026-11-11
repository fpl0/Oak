// The optional keyboard (ux §3.4 "Keyboard", 80 px): two octaves centred on the key, dots on scale tones,
// degree labels on in-key keys, sounding notes lit in their degree colour (from the HighlightBus's playing
// set, i.e. the adapter's clock), click to audition.
import type { KeySpec } from "@oak/content-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import type { HighlightBus } from "./highlight-bus.ts";
import { keyboardRange, keyRects } from "./keyboard-layout.ts";
import type { WorkbenchModel } from "./model.ts";
import { pitchLabel } from "./music.ts";
import { degreeStyle, themeOf } from "./palette.ts";

export interface KeyboardProps {
  model: WorkbenchModel | null;
  keySpec: KeySpec | null;
  bus: HighlightBus;
  onAudition: (midi: number) => void;
  /** Typing-keyboard play is on (K): shown as a badge. */
  typing?: boolean;
  /** Keys pressed with the computer keyboard right now. */
  pressed?: ReadonlySet<number>;
  width?: number;
}

export function Keyboard({ model, keySpec, bus, onAudition, typing, pressed }: KeyboardProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [sounding, setSounding] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 560);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(
    () =>
      bus.subscribe((s) => {
        const next = new Set<number>();
        for (const id of s.playing) {
          const e = model?.byId.get(id);
          if (e?.midi !== null && e?.midi !== undefined) next.add(Math.round(e.midi));
        }
        setSounding((prev) => (prev.size === next.size && [...next].every((m) => prev.has(m)) ? prev : next));
      }),
    [bus, model],
  );

  const midis = useMemo(
    () =>
      (model?.events ?? [])
        .filter((e) => e.midi !== null && !e.band)
        .map((e) => Math.round(e.midi as number)),
    [model],
  );
  const { lo, hi } = useMemo(() => keyboardRange(keySpec, midis), [keySpec, midis]);
  const rects = useMemo(() => keyRects(lo, hi, width), [lo, hi, width]);
  const theme = themeOf(typeof document === "undefined" ? null : document.documentElement);
  const H = 80;

  return (
    <div className="oak-keyboard" ref={wrapRef} data-testid="keyboard">
      {typing ? <span className="oak-badge">typing plays notes</span> : null}
      <svg width={width} height={H}>
        <title>Keyboard</title>
        {[false, true].map((black) =>
          rects
            .filter((r) => r.black === black)
            .map((r) => {
              const p = pitchLabel(r.midi, keySpec);
              const lit = sounding.has(r.midi) || (pressed?.has(r.midi) ?? false);
              const fill = lit
                ? p.degree
                  ? degreeStyle(p.degree.raw, theme).fill
                  : "var(--wb-accent)"
                : black
                  ? "var(--wb-text)"
                  : "var(--wb-surface)";
              const h = black ? H * 0.6 : H - 1;
              return (
                // biome-ignore lint/a11y/useSemanticElements: an SVG key cannot be a <button>; it is focusable and labelled
                <g
                  key={r.midi}
                  className="oak-key"
                  data-midi={r.midi}
                  data-lit={lit ? "1" : undefined}
                  onClick={() => onAudition(r.midi)}
                  role="button"
                  tabIndex={-1}
                  aria-label={`${p.display}${p.degree ? `, degree ${p.degree.label}` : ""}`}
                >
                  <rect
                    x={r.x + 0.5}
                    y={0.5}
                    width={r.w - 1}
                    height={h}
                    rx={black ? 2 : 3}
                    fill={fill}
                    stroke="var(--wb-border)"
                  />
                  {!black && p.degree?.inKey ? (
                    <text
                      x={r.x + r.w / 2}
                      y={H - 8}
                      textAnchor="middle"
                      fontSize={9}
                      fill="var(--wb-text-2)"
                    >
                      {p.degree.label}
                    </text>
                  ) : null}
                  {p.degree?.inKey && !lit ? (
                    <circle
                      cx={r.x + r.w / 2}
                      cy={black ? h - 7 : H - 22}
                      r={2.5}
                      fill={black ? "var(--wb-surface)" : "var(--wb-text-3)"}
                    />
                  ) : null}
                </g>
              );
            }),
        )}
      </svg>
    </div>
  );
}
