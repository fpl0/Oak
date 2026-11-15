// Progress in Wave 7: the three tracks with their sessions, their checkpoints and capstones (a locked one says which
// gate it waits for), and an honest pace (tracks-day.ts `trackProgress`); and, from the day the whole course is
// complete, the line that stays (course-end.ts `courseEndEntry`), as the core's ending has its own.
import type { TrackState } from "@oak/api";
import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { GitBranch } from "lucide-react";
import { useContent } from "../../lib/content.ts";
import { lessonTitles } from "../../lib/content-model.ts";
import { formatMonth } from "../../lib/format.ts";
import { useBootstrap, useCourseProgress, useProgressReport, useTracks } from "../../lib/queries.ts";
import { Card, Chip, Progress } from "../../ui/kit/basics.tsx";
import { COURSE_END_COPY, type CourseEndEntry } from "../course-end.ts";
import { useTrackRows } from "../day-hooks.ts";
import { itemTitle } from "../titles.ts";
import { doneOf, type TrackProgress, trackProgress } from "../tracks-day.ts";
import { deriveTracks } from "../tracks-model.ts";

const ITEM_TONE = {
  released: "accent",
  passed: "accent",
  "soft-passed": "accent",
  open: "amber",
  in_progress: "amber",
  failed: "amber",
  locked: "neutral",
} as const;

function TrackBlock({ p }: { p: TrackProgress }) {
  return (
    <li
      className="flex flex-col gap-1.5 py-3"
      data-track={p.trackId}
      data-open={p.open}
      data-complete={p.complete}
      data-focus={p.focus}
    >
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-medium">{p.title}</span>
        <span className="flex items-center gap-1.5">
          {p.focus && <Chip tone="accent">your focus</Chip>}
          <Chip tone={p.open ? "accent" : "neutral"}>
            {p.complete ? "complete" : p.open ? "open" : "ahead"}
          </Chip>
        </span>
      </span>
      {p.open && p.total > 0 && (
        <div className="flex items-center gap-3">
          <Progress
            value={p.done}
            max={p.total}
            label={`${p.title}: ${p.done} of ${p.total} sessions`}
            className="flex-1"
          />
          <span className="shrink-0 text-sm text-text-2" data-testid="track-count">
            {p.done} of {p.total} sessions
          </span>
        </div>
      )}
      <span className="text-sm text-text-2" data-testid="track-note">
        {p.next ? `Next: ${p.next}.` : p.note}
      </span>
      {p.waiting.map((w) => (
        <span key={w} className="text-sm text-text-3" data-testid="track-waiting">
          {w}
        </span>
      ))}
      {(p.checkpoints.length > 0 || p.capstones.length > 0) && p.open && (
        <ul className="mt-0.5 flex flex-col gap-1 text-sm">
          {p.checkpoints.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-baseline gap-x-2"
              data-checkpoint={c.id}
              data-status={c.status}
            >
              <span className="text-text-2">{c.title}</span>
              <span className={clsx(c.status === "locked" ? "text-text-3" : "text-text-2")}>· {c.line}</span>
            </li>
          ))}
          {p.capstones.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-baseline gap-x-2"
              data-capstone={c.id}
              data-status={c.status}
            >
              {c.status === "locked" ? (
                <span className="text-text-2">{c.title}</span>
              ) : (
                <Link
                  to="/capstone/$id"
                  params={{ id: c.id }}
                  className="text-link underline-offset-2 hover:underline"
                >
                  {c.title}
                </Link>
              )}
              <Chip tone={ITEM_TONE[c.status]}>{c.status === "locked" ? "ahead" : c.line}</Chip>
              {c.status === "locked" && (
                <span className="text-text-3" data-testid="capstone-gate">
                  {c.line.charAt(0).toUpperCase() + c.line.slice(1)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {p.pace && (
        <span className="text-sm text-text-3" data-testid="track-pace">
          {p.pace}
        </span>
      )}
    </li>
  );
}

/**
 * The tracks once one is open beyond the side lessons: each with what it is, where the learner stands in it, what
 * comes next, what waits for a gate, its capstones and the pace. A track never reads as required.
 */
export function TracksProgressCard() {
  const content = useContent();
  const course = useCourseProgress();
  const tracks = useTracks();
  const report = useProgressReport();
  const boot = useBootstrap();
  const rows = useTrackRows();
  const titles = lessonTitles(content.data?.syllabus ?? null);
  const titleOf = (id: string) => itemTitle(id, titles);
  const states: TrackState[] =
    tracks.data?.items ??
    (course.data?.tracks && course.data.tracks.length > 0
      ? course.data.tracks
      : deriveTracks(course.data, new Set()));
  if (!rows.some((r) => r.open && r.trackId !== "A") && !states.some((t) => t.sessionsDone > 0)) return null;
  const done = doneOf(course.data);
  const coreDone = course.data?.core === "complete";
  const perWeek = report.data?.paceEstimate?.sessionsPerWeek ?? null;
  // The pace is said for one track only — the focus, else the one track under way — since it assumes every session
  // goes there; three such lines side by side would each claim the same weeks.
  const started = states.filter(
    (t) => t.status === "open" && t.sessionsDone > 0 && t.sessionsDone < t.sessionsTotal,
  );
  const paced =
    states.find((t) => t.focus === true)?.trackId ?? (started.length === 1 ? started[0]?.trackId : null);
  const list = states.map((t) =>
    trackProgress(t, {
      titleOf,
      perWeek: t.trackId === paced ? perWeek : null,
      today: boot.data?.day ?? null,
      formatMonth,
      done,
    }),
  );
  return (
    <Card className="p-4" data-testid="progress-tracks">
      <div className="mb-1 flex items-center gap-2">
        <GitBranch aria-hidden className="size-4 text-text-3" />
        <h2 className="text-h3">Tracks</h2>
      </div>
      <p className="mb-1 text-sm text-text-2">
        {list.length > 0 && list.every((p) => p.complete)
          ? "Jazz, rhythm and sound, each complete. Their lessons stay open to replay and their families to practise."
          : coreDone
            ? "Jazz, rhythm and sound: each grows from the core in its own order. Take them one at a time or side by side; none is required."
            : "Branches off the core, open from the U13 checkpoint. The core stays your path; a track is never required."}
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {list.map((p) => (
          <TrackBlock key={p.trackId} p={p} />
        ))}
      </ul>
      <Link
        to="/oak"
        search={{ view: "course" }}
        className="mt-2 inline-block text-sm text-link underline-offset-2 hover:underline"
      >
        See the branches on the Oak
      </Link>
    </Card>
  );
}

/** The permanent record of the whole course's ending: its title, its date, the road, and three links. */
export function CourseEndCard({ entry }: { entry: CourseEndEntry }) {
  const [open, play, oak] = COURSE_END_COPY.progressLinks;
  return (
    <Card className="border-accent/50 bg-lane-in p-4" data-testid="progress-course-end">
      <p className="text-sm text-text-2">{entry.dateLine}</p>
      <h2 className="font-display text-h2">{entry.title}</h2>
      {entry.road && <p className="mt-1 text-text-2">{entry.road}</p>}
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Link
          to="/session/coda"
          search={{ ending: "course" }}
          className="text-link underline-offset-2 hover:underline"
          data-testid="open-course-ending"
        >
          {open}
        </Link>
        <Link to="/album" className="text-link underline-offset-2 hover:underline">
          {play}
        </Link>
        <Link to="/oak" search={{ view: "tree" }} className="text-link underline-offset-2 hover:underline">
          {oak}
        </Link>
      </p>
    </Card>
  );
}
