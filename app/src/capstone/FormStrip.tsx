// The piece's form above the Workbench (C3 and every brief that reads sections; contracts §6.3, ux §2.3): one
// block per section of the arranged tracks, in order, its letter by first appearance, its bars, how much energy it
// carries and which parts play in it. A block is a button: it lights and loops those bars on the roll and the
// staff (the Workbench follows the tutor's bar references). Arrow keys move between sections. With no `arrange()`
// yet, or tracks that disagree, the strip says what to write instead of drawing a broken form.
import { clsx } from "clsx";
import { type KeyboardEvent, useRef } from "react";
import { RuleLabel } from "./Checklist.tsx";
import type { PieceForm } from "./wave5.ts";

export function FormStrip({
  form,
  onBars,
  stale,
  loop = null,
}: {
  form: PieceForm;
  /** 1-based inclusive bars: light and loop them. */
  onBars(from: number, to: number): void;
  /** The strip describes an earlier version of the code (an edit is being read). */
  stale: boolean;
  /** The Workbench's loop region (0-based first bar, length) while it loops: the section it covers is selected. */
  loop?: { from: number; bars: number } | null;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const total = Math.max(1, form.totalBars);
  const move = (e: KeyboardEvent, i: number) => {
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? i + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? form.sections.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    refs.current[Math.max(0, Math.min(form.sections.length - 1, next))]?.focus();
  };
  return (
    <section
      aria-labelledby="cap-form"
      className={clsx("flex flex-col gap-1.5", stale && "opacity-70")}
      data-testid="form-strip"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 id="cap-form" className="font-sans text-sm font-semibold text-text-2">
          Form
        </h2>
        {form.letters && (
          <span className="font-mono text-sm text-text-3" data-testid="form-letters">
            {form.letters}
          </span>
        )}
        {form.sections.length > 0 && (
          <span className="text-sm text-text-3">{form.totalBars} bars · select a section to loop it</span>
        )}
      </div>
      {form.problem ? (
        <p className="rounded-control border border-accent-2/40 bg-accent-2/8 px-2.5 py-1.5 text-sm">
          The arranged parts disagree: {form.problem}. Write one <code className="font-mono">arrange()</code>{" "}
          per labelled part, each with the same sections and lengths.
        </p>
      ) : form.sections.length === 0 ? (
        <p className="text-sm text-text-2">
          No sections yet. Put each part's verse and chorus in <code className="font-mono">const</code>s and
          give every labelled part one <code className="font-mono">arrange()</code>: the sections appear here.
        </p>
      ) : (
        // biome-ignore lint/a11y/useSemanticElements: a list of section buttons moved through with the arrow keys.
        <div role="list" className="flex min-w-0 gap-1" aria-label="Sections">
          {form.sections.map((s, i) => {
            const from = s.startBar + 1;
            const to = s.startBar + s.bars;
            const looping = loop !== null && loop.from === s.startBar && loop.bars === s.bars;
            return (
              // biome-ignore lint/a11y/useSemanticElements: see the list above.
              <div
                role="listitem"
                key={`${s.tag}-${s.startBar}`}
                style={{ flexGrow: s.bars / total }}
                className="min-w-0 basis-0"
              >
                <button
                  type="button"
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  data-section={s.tag}
                  data-letter={s.letter}
                  aria-pressed={looping}
                  onClick={() => onBars(from, to)}
                  onKeyDown={(e) => move(e, i)}
                  aria-label={`${s.text}, bars ${from}–${to}, ${s.tracks.length} ${s.tracks.length === 1 ? "part" : "parts"}${s.tracks.length ? `: ${s.tracks.join(", ")}` : ""}. ${looping ? "Looping." : "Loop it."}`}
                  className={clsx(
                    "flex w-full min-w-0 flex-col gap-1 rounded-control border px-2 py-1.5 text-left",
                    "hover:border-accent",
                    s.letter === "A" ? "border-border bg-surface" : "border-accent/40 bg-lane-in",
                    looping && "ring-2 ring-accent",
                  )}
                >
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="font-mono text-sm font-semibold text-text-2">{s.letter}</span>
                    <span className="truncate text-sm font-medium">{s.text}</span>
                    <span className="ml-auto shrink-0 font-mono text-[0.75rem] text-text-3 tabular-nums">
                      {from}–{to}
                    </span>
                  </span>
                  <span
                    className="block h-1 overflow-hidden rounded-full bg-surface-2"
                    title={`Energy ${Math.round(s.energy * 100)} %`}
                  >
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${Math.round(Math.max(0.04, Math.min(1, s.energy)) * 100)}%` }}
                    />
                  </span>
                  <span className="truncate text-[0.75rem] text-text-3">
                    {s.tracks.length ? s.tracks.join(" · ") : "silence"}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
      {form.hint && (
        <p className="text-sm text-text-2" data-testid="form-hint">
          <RuleLabel label={form.hint} />
        </p>
      )}
    </section>
  );
}
