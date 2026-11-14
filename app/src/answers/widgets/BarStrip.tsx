// A bar timeline for "which bar" answers (Wave 6, U17 and `fam.har.modulation`): the bars as one strip of numbered
// cells instead of loose buttons, so the answer reads as a place in the music. With the key change the host names
// (`AnswerEnv.keyChange`) the bars from the chosen one on are tinted as "the new key", the line under the strip says
// which key holds until there, and once the answer is checked right or revealed it names the new key and how far
// it is ("C major to D major: up a whole step"). The cells are the caller's own radios (`renderCell`): this file
// only lays them out and words the line, so `bar-buttons` and a `choice` of bars keep their keys and names.
import type { KeySpec } from "@oak/api";
import { keyDisplay } from "@oak/theory";
import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { KeyChangeEnv } from "../env.tsx";
import { keyChangeFact } from "../facts.ts";

/** Bars in a row of the strip: up to twelve in one row (a blues is one line), longer strips in rows of eight. */
export function stripPerRow(bars: number): number {
  return bars <= 12 ? Math.max(1, bars) : 8;
}

/**
 * The line under a key-change strip. Before a check it only restates the learner's own pick; the new key is named
 * when the host says the answer is known (`known`: checked right, or revealed).
 */
export function keyChangeLine(o: {
  from?: KeySpec | undefined;
  to?: KeySpec | null | undefined;
  /** The bar picked (or revealed), `"none"` for "no key change", null for nothing yet. */
  bar: number | "none" | null;
  known: boolean;
}): string {
  const home = o.from ? keyDisplay(o.from) : "the first key";
  if (o.bar === null) return o.from ? `It starts in ${home}. Where does the new key begin?` : "";
  if (o.bar === "none") return o.from ? `${home} all the way: no key change.` : "No key change.";
  if (o.known && o.from && o.to) return `From bar ${o.bar}: ${keyChangeFact(o.from, o.to)}`;
  if (o.bar <= 1) return "A new key from bar 1.";
  return `${o.from ? `${home} until bar ${o.bar - 1}` : `The first key until bar ${o.bar - 1}`}, a new key from bar ${o.bar}.`;
}

export function BarStrip(p: {
  /** Every bar of the passage, 1-based; `renderCell` returns the radio for a bar, or null for a bar not offered. */
  bars: number;
  renderCell(bar: number): ReactNode;
  /** The "No key change" radio, when the answer offers it. */
  none?: ReactNode;
  /** The bar the tint starts at (the pick, or the answer when revealed); null: no tint. */
  from: number | null;
  keyChange?: KeyChangeEnv | undefined;
  /** The line under the strip (reserved height), or null for a plain "which bar". */
  line?: string | null;
  idBase: string;
}) {
  const perRow = stripPerRow(p.bars);
  return (
    <div className="flex min-w-0 flex-col gap-2" data-bar-strip>
      {p.none ? <div className="flex">{p.none}</div> : null}
      <div
        className="grid w-full max-w-2xl gap-1"
        style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: p.bars }, (_, i) => {
          const bar = i + 1;
          const cell = p.renderCell(bar);
          const tinted = p.from !== null && bar >= p.from;
          return (
            <div
              key={bar}
              data-strip-bar={bar}
              data-new-key={tinted || undefined}
              className="relative flex min-w-0 flex-col gap-1"
            >
              {cell ?? (
                <span
                  aria-hidden
                  className="flex h-11 w-full items-center justify-center rounded-control border-2 border-dashed border-border text-sm text-text-3 tabular-nums"
                >
                  {bar}
                </span>
              )}
              {/* The key under the bar: the first key, and from the pick on the new one (colour and place both). */}
              {p.keyChange ? (
                <span
                  aria-hidden
                  className={clsx("h-1.5 rounded-full", tinted ? "bg-accent-2" : "bg-border")}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {p.line !== undefined && p.line !== null ? (
        <p id={`${p.idBase}-keyline`} className="min-h-6 text-sm text-text-2" data-testid="key-change-line">
          {p.line}
        </p>
      ) : null}
    </div>
  );
}
