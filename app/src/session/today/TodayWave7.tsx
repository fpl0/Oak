// Today's Wave 7 parts (tracks-day.ts, course-end.ts): the open tracks beside the day's one session, the switch that
// says where the New block comes from, and the first day after the whole course. None of them is a second primary
// action: Start stays the one decision; an offer is a quiet row with "Start this instead".
import { Link } from "@tanstack/react-router";
import { Disc3, GitBranch } from "lucide-react";
import { Button } from "../../ui/kit/Button.tsx";
import { Card } from "../../ui/kit/basics.tsx";
import { SegmentedControl } from "../../ui/kit/Controls.tsx";
import { COURSE_END_COPY } from "../course-end.ts";
import type { OfferRow, TrackDay } from "../tracks-day.ts";
import { InlineCodeText } from "./SideOffer.tsx";

/** "Jazz Harmony · session 3 of 34", under the setlist's heading on a track day. */
export function TrackSessionLine({ line }: { line: string }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-sm text-text-2" data-testid="track-session">
      <GitBranch aria-hidden className="size-4 shrink-0 text-text-3" />
      {line}
    </p>
  );
}

function OfferItem({
  row,
  disabled,
  onStart,
}: {
  row: OfferRow;
  disabled: boolean;
  onStart(row: OfferRow): void;
}) {
  return (
    <li
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5"
      data-offer={row.trackId}
      data-item={row.mapItemId ?? undefined}
    >
      <div className="min-w-0 flex-1 basis-72">
        <p className="text-sm text-text-2">
          {row.trackTitle}
          {row.place && <span className="text-text-3"> · {row.place}</span>}
        </p>
        <p className="font-medium">
          {row.label}
          {row.minutes && <span className="font-normal text-text-2"> · {row.minutes}</span>}
        </p>
        {row.goal && (
          <p className="text-sm text-text-3">
            <InlineCodeText text={row.goal} />
          </p>
        )}
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => onStart(row)}
        aria-label={`Start ${row.label} instead`}
        data-testid="start-offer"
      >
        Start this instead
      </Button>
    </li>
  );
}

/**
 * The tracks beside today's session: a line that says whose day it is, one row per open track (and, on a track day,
 * the core's next item), and the focus switch. A pick after the core is remembered (`rememberPick`).
 */
export function TrackOffers({
  day,
  disabled,
  saving,
  onStart,
  onFocus,
}: {
  day: TrackDay;
  disabled: boolean;
  saving: boolean;
  onStart(row: OfferRow): void;
  onFocus(id: TrackDay["focus"]): void;
}) {
  if (day.offers.length === 0 && day.focusOptions.length === 0) return null;
  return (
    <Card className="p-4" data-testid="track-offers" data-focus={day.focus}>
      <div className="flex items-start gap-2">
        <GitBranch aria-hidden className="mt-0.5 size-4 shrink-0 text-text-3" />
        <p className="max-w-[62ch] text-text-2" data-testid="track-lead">
          {day.lead}
        </p>
      </div>
      {day.fallback && (
        <p className="mt-1 text-sm text-text-3" data-testid="track-fallback">
          {day.fallback}
        </p>
      )}
      {day.offers.length > 0 && (
        <ul className="mt-1 flex flex-col divide-y divide-border">
          {day.offers.map((o) => (
            <OfferItem
              key={`${o.trackId}:${o.mapItemId ?? ""}`}
              row={o}
              disabled={disabled}
              onStart={onStart}
            />
          ))}
        </ul>
      )}
      {day.focusOptions.length > 1 && (
        <div
          className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3"
          data-testid="track-focus"
        >
          <span className="text-sm text-text-2" id="track-focus-label">
            Today plans first:
          </span>
          <SegmentedControl
            label="Today plans first"
            size="sm"
            value={day.focus}
            // Never disabled while a choice saves: a disabled radio would drop the keyboard focus.
            options={day.focusOptions.map((o) => ({ value: o.id, label: o.label }))}
            onChange={(v) => {
              if (v !== day.focus && !saving) onFocus(v);
            }}
          />
          <span className="text-sm text-text-3">Change it any day; nothing is lost.</span>
        </div>
      )}
    </Card>
  );
}

/** The first day after the whole course, under the header: one line back to the record. */
export function CourseFirstDayLine() {
  return (
    <p className="mb-4 flex items-center gap-2 text-text-2" data-testid="course-first-day">
      <Disc3 aria-hidden className="size-4 shrink-0 text-accent" />
      <span>
        {COURSE_END_COPY.firstDay}{" "}
        <Link
          to="/album"
          className="text-link underline-offset-2 hover:underline"
          data-testid="course-first-day-play"
        >
          {COURSE_END_COPY.firstDayAction}
        </Link>
      </span>
    </p>
  );
}

/** Under "Open to you" once the whole course is complete: what keeps the Oak green, said once. */
export function KeepPlayingLine() {
  return (
    <p className="mt-2 border-t border-border pt-3 text-sm text-text-2" data-testid="course-keep-playing">
      {COURSE_END_COPY.keepPlaying}
    </p>
  );
}
