// The whole record (Wave 7, wave7.md §5.5): Side A then Side B, played straight through with a breath between
// tracks, and the album's own heading once the whole course is complete (every lesson, checkpoint and capstone of
// the core and the three tracks: twenty tracks, both sides). It never starts by itself; a track without a
// recording is skipped and the line says so. Keyboard: the one button plays and stops; Escape is not needed.
import type { WholeCourse } from "@oak/api";
import { Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDate } from "../lib/format.ts";
import { albumAudioUrl } from "../lib/queries.ts";
import { Button } from "../ui/kit/Button.tsx";
import { toast } from "../ui/kit/Toast.tsx";
import {
  atTrackEnd,
  runtime,
  TRACK_GAP_MS,
  type WholeRecord,
  wholeNowPlaying,
  wholeRecord,
} from "./model.ts";
import { pauseOtherAudio, useSideRecord } from "./SideARecord.tsx";

/** Both sides as one queue, from the album's tracks. `null` while they load. */
export function useWholeRecord(): { record: WholeRecord | null; sideTotals: Record<"A" | "B", number> } {
  const a = useSideRecord("A");
  const b = useSideRecord("B");
  if (!a.record || !b.record) return { record: null, sideTotals: { A: 12, B: 8 } };
  return { record: wholeRecord(a.record, b.record), sideTotals: { A: a.record.total, B: b.record.total } };
}

export function PlayEverything() {
  const { record, sideTotals } = useWholeRecord();
  const audio = useRef<HTMLAudioElement>(null);
  const gap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(
    () => () => {
      if (gap.current) clearTimeout(gap.current);
    },
    [],
  );
  if (!record || record.queue.length === 0) return null;
  const now = at === null ? null : (record.queue[at] ?? null);
  const clearGap = () => {
    if (gap.current) clearTimeout(gap.current);
    gap.current = null;
  };
  const stop = () => {
    clearGap();
    audio.current?.pause();
    setAt(null);
    setElapsed(0);
  };
  const play = (i: number) => {
    clearGap();
    const t = record.queue[i];
    const el = audio.current;
    if (!t?.trackId || t.version === null || !el) return stop();
    setAt(i);
    setElapsed(0);
    pauseOtherAudio(el);
    el.src = albumAudioUrl(t.trackId, t.version);
    void el.play().catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setAt(null);
      toast.error("The record didn't start", "Press Play everything again.");
    });
  };
  const next = () => {
    if (at === null || at + 1 >= record.queue.length) return stop();
    gap.current = setTimeout(() => play(at + 1), TRACK_GAP_MS);
  };
  const skipped = record.released - record.queue.length;
  return (
    <div
      className="flex flex-col gap-1.5"
      data-testid="play-everything-box"
      data-state={now ? "playing" : "stopped"}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: instrumental recordings of the learner's own pieces. */}
      <audio
        ref={audio}
        className="hidden"
        data-testid="everything-player"
        onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
        onPause={(e) => {
          if (gap.current !== null) return;
          if (e.currentTarget.ended || atTrackEnd(e.currentTarget)) return next();
          setAt(null);
          setElapsed(0);
        }}
        onEnded={() => {
          if (gap.current === null) next();
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          icon={now ? <Square aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
          onClick={() => (now ? stop() : play(0))}
          data-testid="play-everything"
        >
          {now ? "Stop" : "Play everything"}
        </Button>
        <span className="text-sm text-text-2 tabular-nums">
          Side A, then Side B · {record.queue.length} {record.queue.length === 1 ? "recording" : "recordings"}{" "}
          · {runtime(record.seconds)}
        </span>
      </div>
      <p className="min-h-5 text-sm text-text-2 tabular-nums" aria-live="polite" data-testid="everything-now">
        {now
          ? wholeNowPlaying(now, sideTotals[now.side], elapsed)
          : skipped > 0
            ? `${skipped} released ${skipped === 1 ? "track has" : "tracks have"} no recording yet; ${skipped === 1 ? "it is" : "they are"} skipped.`
            : ""}
      </p>
    </div>
  );
}

/** The album's heading once every session of the course is done (the server's `course.whole`, else both sides). */
export function CourseCompleteHeading({ whole, record }: { whole: WholeCourse | null; record: WholeRecord }) {
  const sessions = whole?.stage === "complete" ? `${whole.sessionsDone} sessions` : null;
  return (
    <div className="flex flex-col gap-1" data-testid="course-complete">
      <p className="text-sm tracking-[0.2em] text-text-3 uppercase">The whole course</p>
      <p className="max-w-[70ch] text-text-2">
        Complete{sessions ? `: ${sessions}` : ""}. {record.released} tracks of your own on two sides, Side A
        the core in the order you made it, Side B the jazz, rhythm and sound tracks in the order you released
        them.
        {whole?.completedAt ? ` Finished on ${formatDate(whole.completedAt)}.` : ""}
      </p>
    </div>
  );
}
