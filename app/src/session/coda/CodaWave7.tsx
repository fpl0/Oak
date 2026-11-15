// The Coda's Wave 7 parts. On every day: the "next" line taken from the planner's real next session
// (`SessionSummary.next`, carry f6) — a track lesson, a checkpoint, a capstone session, a gym slot or a review day —
// with its goal under it. On the day the whole course is completed (`courseComplete`, wave7.md §5.8): the course
// finale, the same shape as the core's ending (content/specs/END.md) — the heading (ms.28's own sentence), the road in
// the learner's numbers, the record (both sides), the three tracks, what they can now do, and what stays open — in
// place of the day's teaser. Nothing plays by itself, counts up or stands between the learner and "Done for today".
import { ALBUM_SIDES, type AlbumTrack, type WholeCourse } from "@oak/api";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SideARecord } from "../../album/SideARecord.tsx";
import { TrackCover } from "../../album/TrackCover.tsx";
import { useAlbum, useWholeCourse } from "../../lib/queries.ts";
import { Card } from "../../ui/kit/basics.tsx";
import { COURSE_END_COPY, courseRoad, recordLine, trackDoneLines } from "../course-end.ts";
import { type OpenRow, openList } from "../finale-model.ts";
import { InlineCodeText } from "../today/SideOffer.tsx";
import type { NextLine } from "../tracks-day.ts";

/** The planner's next session: one line, and what it is for under it. */
export function PlannerNext({ next }: { next: NextLine }) {
  return (
    <>
      <p data-testid="coda-tomorrow" data-kind={next.kind} data-item={next.mapItemId ?? undefined}>
        {next.line}
      </p>
      {next.goal && (
        <p className="text-sm text-text-2" data-testid="coda-tomorrow-what">
          <InlineCodeText text={next.goal} />
        </p>
      )}
      {next.opens && (
        <p className="text-sm text-text-2" data-testid="coda-tomorrow-opens">
          {next.opens}
        </p>
      )}
    </>
  );
}

function Part({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
  return (
    <Card className="p-4" data-testid={testId}>
      <h3 className="mb-2 text-h3">{title}</h3>
      {children}
    </Card>
  );
}

/** Side B as the ending shows it: eight covers in release order, each a link to its track. */
function SideB({ tracks }: { tracks: readonly AlbumTrack[] }) {
  const ids = ALBUM_SIDES.find((s) => s.side === "B")?.capstones as readonly string[] | undefined;
  const side = tracks
    .filter((t) => t.capstoneId !== null && (ids ?? []).includes(t.capstoneId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (side.length === 0) return null;
  return (
    <div className="mt-3 border-t border-border pt-3" data-testid="course-side-b">
      <p className="mb-2 font-medium">Side B</p>
      <ul className="grid grid-cols-4 gap-3">
        {side.map((t, i) => (
          <li
            key={t.id}
            className="flex min-w-0 flex-col items-center gap-1 text-center"
            data-track={t.capstoneId}
          >
            <Link
              to="/album/$trackId"
              params={{ trackId: t.id }}
              aria-label={`${t.title}, Side B track ${i + 1}`}
            >
              <TrackCover track={t} size={64} />
            </Link>
            <span className="line-clamp-2 w-full break-words text-[0.75rem] leading-tight text-text-2">
              {t.title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The record: both sides. Side A is the album's own record component; Side B its eight covers. */
function RecordPart({ whole }: { whole: WholeCourse }) {
  const album = useAlbum();
  const tracks = album.data?.tracks ?? [];
  const sideA = (ALBUM_SIDES.find((s) => s.side === "A")?.capstones ?? []) as readonly string[];
  const sideB = (ALBUM_SIDES.find((s) => s.side === "B")?.capstones ?? []) as readonly string[];
  const count = (ids: readonly string[]) =>
    tracks.filter((t) => t.capstoneId !== null && ids.includes(t.capstoneId)).length;
  return (
    <Card className="p-4" data-testid="course-record">
      <h3 className="mb-1 text-h3">{COURSE_END_COPY.recordHeading}</h3>
      <p className="mb-3 text-text-2" data-testid="course-record-line">
        {recordLine(whole.album, album.data ? { A: count(sideA), B: count(sideB) } : null)}
      </p>
      <SideARecord coda />
      <SideB tracks={tracks} />
      <Link to="/album" className="mt-3 inline-block text-sm text-link underline-offset-2 hover:underline">
        Open the album
      </Link>
    </Card>
  );
}

function TracksPart({ whole }: { whole: WholeCourse }) {
  const lines = trackDoneLines(whole.tracks);
  if (lines.length === 0) return null;
  return (
    <Part title={COURSE_END_COPY.tracksHeading} testId="course-tracks">
      <ul className="flex flex-col divide-y divide-border">
        {lines.map((l) => (
          <li key={l.trackId} className="flex flex-wrap items-baseline gap-x-3 py-2" data-track={l.trackId}>
            <span className="min-w-0 flex-1 basis-48 font-medium">{l.title}</span>
            <span className="text-sm text-text-2">{l.line}</span>
          </li>
        ))}
      </ul>
    </Part>
  );
}

function CanDoPart({ whole }: { whole: WholeCourse }) {
  const lines = whole.canDo.filter((c) => c.status === "solid" || c.status === "strong");
  if (lines.length === 0) return null;
  return (
    <Part title={COURSE_END_COPY.canDoHeading} testId="course-cando">
      <ul className="flex flex-col divide-y divide-border">
        {lines.map((c) => (
          <li key={c.candoId} className="py-2" data-cando={c.candoId}>
            {c.text}
          </li>
        ))}
      </ul>
      <Link
        to="/progress"
        hash="ledger"
        className="mt-2 inline-block text-sm text-link underline-offset-2 hover:underline"
      >
        See all of them
      </Link>
    </Part>
  );
}

function OpenLink({ row }: { row: OpenRow }) {
  const cls = "flex items-center gap-3 rounded-control px-3 py-2 hover:bg-surface-2";
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-text">{row.title}</span>
        <span className="block text-sm text-text-2">{row.note}</span>
      </span>
      <ArrowRight aria-hidden className="size-4 shrink-0 text-text-3" />
    </>
  );
  if (row.to?.to === "/studio")
    return (
      <Link to="/studio" className={cls}>
        {body}
      </Link>
    );
  if (row.to?.to === "/learn/$lessonId")
    return (
      <Link to="/learn/$lessonId" params={row.to.params} className={cls}>
        {body}
      </Link>
    );
  if (row.to?.to === "/capstone/$id")
    return (
      <Link to="/capstone/$id" params={row.to.params} className={cls}>
        {body}
      </Link>
    );
  return (
    <Link to="/" className={cls}>
      {body}
    </Link>
  );
}

/** What stays open: the line for tomorrow first (one real session), then the rest, then what keeps the Oak green. */
function OpenPart({ whole }: { whole: WholeCourse }) {
  const list = openList(whole.open);
  return (
    <Part title={COURSE_END_COPY.openHeading} testId="course-open">
      {list.tomorrow && (
        <p className="mb-1 font-medium" data-testid="course-tomorrow">
          {list.tomorrow}
        </p>
      )}
      {list.startable.length > 0 && (
        <ul className="-mx-3 flex flex-col">
          {list.startable.map((r) => (
            <li key={`${r.kind}:${r.id ?? ""}`} data-open={r.kind}>
              <OpenLink row={r} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-sm text-text-2">{COURSE_END_COPY.keepPlaying}</p>
    </Part>
  );
}

/**
 * The course finale: the heading (ms.28's sentence), the road in one line of the learner's numbers, then the record,
 * the three tracks, what they can now do and what stays open. Shown once, on the summary that carries it.
 */
export function CourseFinale({ whole, road: showRoad = true }: { whole: WholeCourse; road?: boolean }) {
  const road = showRoad ? courseRoad(whole) : "";
  return (
    <section
      aria-labelledby="course-finale-h"
      className="flex flex-col gap-4"
      data-testid="coda-course-finale"
    >
      <header className="rounded-card border border-accent/50 bg-lane-in px-5 py-4">
        <h2 id="course-finale-h" className="font-display text-h1" data-testid="course-finale-heading">
          {COURSE_END_COPY.heading}
        </h2>
        <p className="mt-1 max-w-[66ch] text-text-2">{COURSE_END_COPY.under}</p>
        {road && (
          <p className="mt-2 text-sm text-text-2" data-testid="course-finale-road">
            {road}
          </p>
        )}
      </header>
      <RecordPart whole={whole} />
      <TracksPart whole={whole} />
      <CanDoPart whole={whole} />
      <OpenPart whole={whole} />
    </section>
  );
}

/**
 * The finale on the Coda of the session that completed the course. The summary's `courseComplete` decides that it is
 * shown (once); its numbers are read again from `course.whole`, fresh after the session ended: the snapshot on the
 * summary is taken while that session is still closing and counts one session and one day short. While the fresh
 * read is on its way the road line waits rather than showing a number that is about to change.
 */
export function CodaCourseFinale({ snapshot }: { snapshot: WholeCourse }) {
  const live = useWholeCourse();
  const fresh = live.data?.stage === "complete" ? live.data : null;
  return <CourseFinale whole={fresh ?? snapshot} road={fresh !== null || live.isError} />;
}
