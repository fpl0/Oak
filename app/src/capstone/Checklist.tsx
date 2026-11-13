// The living Requirements checklist (ux §2.3): ticked when met, an open circle when not yet, a dashed circle
// before the first check. A suggestion is never a cross. Open rows say what the rubric found and where.
import { clsx } from "clsx";
import { Check, Circle, CircleDashed, Loader2 } from "lucide-react";
import { anchorText } from "./anchors.ts";
import { type ChecklistRow, labelRuns, type Readiness } from "./checklist.ts";
import { contrastText, durationText, type RowExtra } from "./wave5.ts";

export function RuleLabel({ label }: { label: string }) {
  return (
    <>
      {labelRuns(label).map((r, i) =>
        r.code ? (
          <code key={i} className="rounded bg-surface-2 px-1 font-mono text-[0.85em]">
            {r.text}
          </code>
        ) : (
          <span key={i}>{r.text}</span>
        ),
      )}
    </>
  );
}

export function Checklist({
  rows,
  ready,
  checking,
  stale,
  onBars,
  extras = {},
}: {
  rows: readonly ChecklistRow[];
  ready: Readiness;
  checking: boolean;
  /** The rows describe an earlier version of the code (an edit is being checked). */
  stale: boolean;
  /** A bar anchor lights those bars on the roll and the staff. */
  onBars?: (from: number, to: number) => void;
  /** Wave 5: what a row shows beyond met / not yet (contrast axes, the length, the section it reads). */
  extras?: Readonly<Record<string, RowExtra>>;
}) {
  const required = rows.filter((r) => r.required);
  const suggestions = rows.filter((r) => !r.required);
  return (
    <section aria-labelledby="cap-req" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="cap-req" className="font-sans text-sm font-semibold text-text-2">
          Requirements
        </h2>
        <span className="flex items-center gap-1.5 text-sm text-text-3 tabular-nums" aria-live="polite">
          {checking && <Loader2 aria-hidden className="size-3.5 animate-spin reduced:animate-none" />}
          <span data-testid="req-count">
            {ready.met} of {ready.required} met
          </span>
        </span>
      </div>
      <ul className={clsx("flex flex-col gap-1", stale && "opacity-70")} aria-busy={checking || undefined}>
        {required.map((r) => (
          <Row key={r.id} row={r} onBars={onBars} extra={extras[r.id]} />
        ))}
      </ul>
      {suggestions.length > 0 && (
        <>
          <h3 className="mt-2 font-sans text-sm font-medium text-text-3">Suggestions</h3>
          <ul className="flex flex-col gap-1">
            {suggestions.map((r) => (
              <Row key={r.id} row={r} onBars={onBars} extra={extras[r.id]} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Row({
  row,
  onBars,
  extra,
}: {
  row: ChecklistRow;
  onBars?: ((from: number, to: number) => void) | undefined;
  extra?: RowExtra | undefined;
}) {
  const icon =
    row.state === "met" ? (
      <Check aria-hidden className="size-4 text-accent" strokeWidth={2.5} />
    ) : row.state === "open" ? (
      <Circle aria-hidden className="size-4 text-accent-2" strokeWidth={2} />
    ) : (
      <CircleDashed aria-hidden className="size-4 text-text-3" />
    );
  const status = row.state === "met" ? "met" : row.state === "open" ? "not yet" : "not checked yet";
  return (
    <li
      data-rule={row.id}
      data-state={row.state}
      className={clsx(
        "flex gap-2 rounded-control px-2 py-1.5",
        row.state === "open" && row.required && "bg-accent-2/8",
        row.focus && "ring-1 ring-accent/30",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1 text-sm">
        <p className={clsx(row.state === "met" ? "text-text-2" : "text-text")}>
          <RuleLabel label={row.label} />
          <span className="sr-only"> ({status})</span>
        </p>
        {(row.detail || row.anchor) && (
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-text-2">
            {row.anchor &&
              (onBars ? (
                <button
                  type="button"
                  data-testid="bar-anchor"
                  onClick={() => row.anchor && onBars(row.anchor.from, row.anchor.to)}
                  aria-label={`${anchorText(row.anchor)}: show on the roll and the staff`}
                  className="inline-flex h-5 items-center rounded-full border border-accent-2/50 bg-surface px-1.5 font-mono text-[0.75rem] text-text hover:border-accent hover:text-accent"
                >
                  {anchorText(row.anchor)}
                </button>
              ) : (
                <span
                  data-testid="bar-anchor"
                  className="inline-flex h-5 items-center rounded-full border border-accent-2/50 bg-surface px-1.5 font-mono text-[0.75rem] text-text"
                >
                  {anchorText(row.anchor)}
                </span>
              ))}
            {row.detail && (extra === undefined || extra.kind === "section" || extra.kind === "note") && (
              <span>
                <RuleLabel label={row.detail} />
              </span>
            )}
          </p>
        )}
        {extra && <Extra extra={extra} />}
      </div>
    </li>
  );
}

/** A row's Wave 5 line: the contrast axes found (lit) and not yet, the length read from the code, the section. */
function Extra({ extra }: { extra: RowExtra }) {
  if (extra.kind === "contrast") {
    const f = extra.finding;
    return (
      <div className="mt-1 flex flex-col gap-1" data-testid="contrast-axes">
        <ul className="flex flex-wrap gap-1" aria-label="What the sections differ on">
          {f.axes.map((a) => (
            <li
              key={a.axis}
              data-axis={a.axis}
              data-found={a.found ? "true" : "false"}
              className={clsx(
                "inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[0.75rem]",
                a.found ? "border-accent/50 bg-lane-in text-text" : "border-border text-text-3",
              )}
            >
              {a.found && <Check aria-hidden className="size-3 text-accent" strokeWidth={2.5} />}
              {a.label}
              <span className="sr-only">{a.found ? " (differs)" : " (same so far)"}</span>
            </li>
          ))}
        </ul>
        <p className="text-text-2">{contrastText(f)}</p>
      </div>
    );
  }
  if (extra.kind === "duration")
    return (
      <p className="mt-0.5 text-text-2 tabular-nums" data-testid="duration-read">
        {durationText(extra.finding)}
      </p>
    );
  if (!extra.text) return null;
  if (extra.kind === "note" || extra.kind === "unread")
    return (
      <p className="mt-0.5 text-text-2" data-testid={extra.kind === "note" ? "row-note" : "row-unread"}>
        <RuleLabel label={extra.text} />
      </p>
    );
  return <p className="mt-0.5 text-text-2">{extra.text}</p>;
}
