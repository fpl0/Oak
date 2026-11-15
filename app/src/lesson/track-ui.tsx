// The players' Wave 7 pieces with a query behind them: the one line that says why a track lesson is not open yet
// (wave7.md §10 item 18), read from the server's track gates (`tracks.list`) and the learner's progress.
import type { SyllabusDef } from "@oak/api";
import { useCourseProgress, useTracks } from "../lib/queries.ts";
import { trackLockCopy } from "./wave7.ts";

/**
 * "Chord-Scales waits for one thing: U14 checkpoint passed. …" / "Grit opens after A1.L04 Space." for a track
 * lesson; the core's plain line for every other lesson (and while the tracks are read, or when they cannot be).
 */
export function LockedLine({
  lessonId,
  title,
  syllabus,
}: {
  lessonId: string;
  title: string;
  syllabus: SyllabusDef | null;
}) {
  const tracks = useTracks();
  const progress = useCourseProgress();
  const completed = new Set(
    (progress.data?.lessons ?? []).filter((l) => l.status === "completed").map((l) => l.lessonId as string),
  );
  const copy = trackLockCopy(lessonId, { syllabus, tracks: tracks.data?.items ?? null, completed });
  if (!copy || (tracks.isPending && copy.kind !== "previous"))
    return <>{title} opens when the lessons before it are done. Today has your next step.</>;
  return (
    <span data-testid="track-locked" data-kind={copy.kind}>
      {copy.line} Today has your next step.
    </span>
  );
}
