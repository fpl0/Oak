// Today's Wave 6 parts (cft-day.ts, tracks-model.ts, finale-model.ts): the standard in the transcription slot with
// where the learner is in it; the advanced tracks' one honest line; and, once the lessons of the core are done,
// "Open to you" under the planned session. None of them is a second primary action: Start stays the one decision.
import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { ArrowRight, Check, Disc3, Ear, GitBranch } from "lucide-react";
import { Card } from "../../ui/kit/basics.tsx";
import type { CftDay } from "../cft-day.ts";
import { type AfterCore, FINALE_COPY, type OpenRow } from "../finale-model.ts";

/** Where the learner is in their standard: five stages, the done ones ticked, today's marked. */
export function CftStrip({ cft, waiting }: { cft: CftDay; waiting: string | null }) {
  return (
    <div className="mt-1 flex flex-col gap-2" data-testid="cft-day" data-session={cft.sessionId}>
      <ol
        className="flex flex-wrap items-stretch gap-1.5"
        aria-label={`Your standard, session ${cft.index} of ${cft.total}`}
        data-testid="cft-stages"
      >
        {cft.steps.map((s) => (
          <li
            key={s.stage}
            data-stage={s.stage}
            data-state={s.state}
            aria-current={s.state === "today" ? "step" : undefined}
            className={clsx(
              "flex min-w-0 flex-1 basis-28 flex-col rounded-control border px-2.5 py-1.5 text-sm",
              s.state === "today"
                ? "border-accent bg-lane-in"
                : s.state === "done"
                  ? "border-border bg-surface-2"
                  : "border-border",
            )}
          >
            <span
              className={clsx(
                "flex items-center gap-1.5",
                s.state === "ahead" ? "text-text-3" : "font-medium",
              )}
            >
              {s.state === "done" && <Check aria-hidden className="size-3.5 shrink-0 text-accent" />}
              <span className="truncate">{s.label}</span>
            </span>
            <span className="text-text-3">
              {s.state === "done"
                ? (s.note ?? "done")
                : s.state === "today"
                  ? s.note
                    ? `today · ${s.note}`
                    : "today"
                  : "later"}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex gap-3 rounded-control border border-border bg-surface-2 px-3 py-2.5 text-sm">
        <Ear aria-hidden className="mt-0.5 size-4 shrink-0 text-text-3" />
        <ul className="flex flex-col gap-1 text-text-2" data-testid="cft-explain">
          {cft.explain.map((line) => (
            <li key={line}>{line}</li>
          ))}
          {waiting && <li data-testid="cft-waiting">{waiting}</li>}
        </ul>
      </div>
    </div>
  );
}

/** The advanced tracks in one line (`plan.tracks.note`): named as open and still being written, never a button. */
export function TracksLine({ line }: { line: string }) {
  return (
    <p className="flex items-start gap-2 text-sm text-text-2" data-testid="tracks-line">
      <GitBranch aria-hidden className="mt-0.5 size-4 shrink-0 text-text-3" />
      <span>
        {line}{" "}
        <Link to="/oak" search={{ view: "course" }} className="text-link underline-offset-2 hover:underline">
          See them on the Oak
        </Link>
      </span>
    </p>
  );
}

/** d21: another tab has a session open. This tab starts its own; nothing is joined and the day counts once. */
export function OtherTabLine({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="max-w-[58ch] text-center text-sm text-text-3" data-testid="other-tab">
      {count === 1 ? "Another tab has a session open." : `${count} other tabs have sessions open.`} Starting
      here opens a session of its own; the day counts once.
    </p>
  );
}

/** The first day after the ending, under the header: one line back to the record. */
export function FirstDayLine() {
  return (
    <p className="mb-4 flex items-center gap-2 text-text-2" data-testid="first-day">
      <Disc3 aria-hidden className="size-4 shrink-0 text-accent" />
      <span>
        {FINALE_COPY.firstDay}{" "}
        <Link
          to="/album"
          className="text-link underline-offset-2 hover:underline"
          data-testid="first-day-play"
        >
          {FINALE_COPY.firstDayAction}
        </Link>
      </span>
    </p>
  );
}

function OpenRowItem({
  row,
  onGym,
  disabled,
}: {
  row: OpenRow;
  /** Starts an extra gym session from Today (the gym row), when one can be started. */
  onGym: (() => void) | null;
  disabled: boolean;
}) {
  const body = (
    <span className="min-w-0 flex-1">
      <span className="block font-medium text-text">{row.title}</span>
      <span className="block text-sm text-text-2">{row.note}</span>
    </span>
  );
  const cls =
    "flex items-center gap-3 rounded-control px-3 py-2 text-left text-text hover:bg-surface-2 focus-visible:bg-surface-2";
  const arrow = <ArrowRight aria-hidden className="size-4 shrink-0 text-text-3" />;
  if (row.kind === "gym")
    return onGym ? (
      <button type="button" className={clsx(cls, "w-full")} onClick={onGym} disabled={disabled}>
        {body}
        <span className="shrink-0 text-sm text-text-2">An extra session today</span>
        {arrow}
      </button>
    ) : (
      <div className={clsx(cls, "hover:bg-transparent")}>{body}</div>
    );
  if (row.kind === "review")
    return (
      <Link to="/practice/review" className={cls}>
        {body}
        {arrow}
      </Link>
    );
  if (row.to?.to === "/studio")
    return (
      <Link to="/studio" className={cls}>
        {body}
        {arrow}
      </Link>
    );
  if (row.to?.to === "/learn/$lessonId")
    return (
      <Link to="/learn/$lessonId" params={row.to.params} className={cls}>
        {body}
        {arrow}
      </Link>
    );
  if (row.to?.to === "/capstone/$id")
    return (
      <Link to="/capstone/$id" params={row.to.params} className={cls}>
        {body}
        {arrow}
      </Link>
    );
  return <div className={clsx(cls, "hover:bg-transparent")}>{body}</div>;
}

/**
 * "Open to you" (END.md `today`): what can be started besides today's own session, then the tracks that cannot be
 * started yet, in quieter type and without an arrow. Nothing counts down; nothing says the learner is finished.
 */
export function OpenToYou({
  after,
  onGym,
  disabled,
  skipSideLesson,
  tracksLine,
}: {
  after: AfterCore;
  onGym: (() => void) | null;
  disabled: boolean;
  /** The side lesson already has its own line in the card: never twice. */
  skipSideLesson: boolean;
  /** The tracks' line (`plan.tracks.note`): said once under the list, in place of a row per track. */
  tracksLine: string | null;
}) {
  const rows = after.open.filter((r) => !(skipSideLesson && r.kind === "side-lesson"));
  if (rows.length === 0 && after.waiting.length === 0 && !after.left && !tracksLine) return null;
  return (
    <Card className="p-4" data-testid="open-to-you" data-stage={after.stage}>
      {after.left && (
        <p className="mb-2 text-text-2" data-testid="core-left">
          {after.left}
        </p>
      )}
      <h2 className="mb-1 text-h3">{FINALE_COPY.openToYou}</h2>
      {rows.length > 0 && (
        <ul className="-mx-3 flex flex-col">
          {rows.map((r) => (
            <li key={`${r.kind}:${r.id ?? ""}`} data-open={r.kind}>
              <OpenRowItem row={r} onGym={onGym} disabled={disabled} />
            </li>
          ))}
        </ul>
      )}
      {tracksLine ? (
        <div className="mt-2 border-t border-border pt-3">
          <TracksLine line={tracksLine} />
        </div>
      ) : (
        after.waiting.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2" data-testid="open-waiting">
            {after.waiting.map((r) => (
              <li key={`${r.kind}:${r.id ?? ""}`} className="text-sm" data-track={r.id ?? undefined}>
                <span className="text-text-2">{r.title}</span>
                <span className="text-text-3"> · {r.note}</span>
              </li>
            ))}
          </ul>
        )
      )}
    </Card>
  );
}
