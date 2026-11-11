// `/album` (ux §5.3): the album as a record sleeve. The front: the newest cover with the record peeking out, the
// album's name, its length, Play all. The back: the tracklist by side, covers grown from the music, durations,
// play, liner notes; empty slots say what opens them. With no track yet, the first one is made worth earning.
import type { AlbumTrack, AlbumTrackDetail } from "@oak/api";
import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { ChevronDown, Lock, Pause, Play } from "lucide-react";
import { useRef, useState } from "react";
import "./cover.css";
import { useCapstoneContent } from "../capstone/content.ts";
import { FLAVOUR_LABEL, formatDuration } from "../lib/format.ts";
import { usePageTitle } from "../lib/nav.ts";
import { albumAudioUrl, apiQuery, useAlbum, useCourseProgress } from "../lib/queries.ts";
import { ALBUM_TITLE, AlbumCover } from "../ui/AlbumCover.tsx";
import { Button, buttonClass } from "../ui/kit/Button.tsx";
import { Chip, Page, Skeleton } from "../ui/kit/basics.tsx";
import { ErrorState } from "../ui/kit/QueryState.tsx";
import { albumSides, runtime, type Slot } from "./model.ts";
import { useCoverMusic } from "./music.ts";
import { Vinyl } from "./Vinyl.tsx";

interface Playing {
  trackId: string;
  version: number;
}

export function AlbumPage() {
  usePageTitle("Album");
  const album = useAlbum();
  const content = useCapstoneContent();
  const progress = useCourseProgress();
  const tracks = album.data?.tracks ?? [];
  const details = useQueries({
    queries: tracks.map((t) => apiQuery("album.track", { params: { id: t.id } })),
  });
  const detailOf = new Map(details.flatMap((q) => (q.data ? [[q.data.id, q.data] as const] : [])));

  // One player for the page; "Play all" walks the tracks that have a recording, in record order.
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [queue, setQueue] = useState<Playing[]>([]);
  const play = (p: Playing | null) => {
    const el = audio.current;
    setPlaying(p);
    if (!el) return;
    if (!p) {
      el.pause();
      return;
    }
    el.src = albumAudioUrl(p.trackId, p.version);
    void el.play().catch(() => setPlaying(null));
  };

  if (album.isError)
    return (
      <Page>
        <ErrorState error={album.error} onRetry={() => void album.refetch()} />
      </Page>
    );
  if (album.isPending || content.isPending)
    return (
      <Page>
        <div
          className="grid gap-8 md:grid-cols-[360px_1fr]"
          role="status"
          aria-busy="true"
          aria-label="Loading the album"
        >
          <Skeleton className="aspect-square w-full" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-6 h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </Page>
    );

  const metas = (content.data?.capstones ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    objective: c.objective,
    sessions: c.sessions,
  }));
  const sides = albumSides(tracks, metas, progress.data?.capstones ?? []);
  const ordered = sides.flatMap((s) => s.slots.flatMap((sl) => (sl.kind === "track" ? [sl.track] : [])));
  const withAudio = ordered.flatMap((t) => {
    const d = detailOf.get(t.id);
    const v = d?.versions.find((x) => x.version === t.currentVersion);
    return v?.hasAudio ? [{ trackId: t.id, version: v.version }] : [];
  });
  const total = ordered.reduce((sum, t) => {
    const v = detailOf.get(t.id)?.versions.find((x) => x.version === t.currentVersion);
    return sum + (v?.durationS ?? 0);
  }, 0);
  const newest = [...tracks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  const c0 = progress.data?.capstones.find((c) => c.capstoneId === "C0");

  return (
    <Page>
      {/* biome-ignore lint/a11y/useMediaCaption: instrumental recordings of the learner's own pieces. */}
      <audio
        ref={audio}
        onEnded={() => {
          const [next, ...rest] = queue;
          setQueue(rest);
          play(next ?? null);
        }}
        onPause={() => {
          if (audio.current?.ended) return;
          if (playing && audio.current?.paused) setPlaying(null);
        }}
        className="hidden"
        data-testid="album-player"
      />
      <header className="mb-10 grid items-center gap-8 md:grid-cols-[minmax(0,440px)_1fr]">
        <Sleeve
          newest={newest}
          spinning={playing !== null}
          detail={newest ? detailOf.get(newest.id) : undefined}
        />
        <div className="min-w-0">
          <p className="text-sm tracking-[0.2em] text-text-3 uppercase">Album</p>
          <h1 className="font-display text-[2.6rem] leading-tight">{ALBUM_TITLE}</h1>
          {tracks.length > 0 ? (
            <>
              <p className="mt-1 text-text-2" data-testid="album-meta">
                {tracks.length} {tracks.length === 1 ? "track" : "tracks"} ·{" "}
                {withAudio.length > 0 ? runtime(total || null) : "no recordings yet"}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  icon={
                    playing ? (
                      <Pause aria-hidden className="size-4" />
                    ) : (
                      <Play aria-hidden className="size-4" />
                    )
                  }
                  disabled={withAudio.length === 0}
                  title={
                    withAudio.length === 0
                      ? "No track has a recording yet. Open a track to play its code live and record it."
                      : undefined
                  }
                  onClick={() => {
                    if (playing) {
                      setQueue([]);
                      play(null);
                    } else {
                      const [first, ...rest] = withAudio;
                      setQueue(rest);
                      play(first ?? null);
                    }
                  }}
                >
                  {playing ? "Stop" : "Play all"}
                </Button>
                {newest && (
                  <Link
                    to="/album/$trackId"
                    params={{ trackId: newest.id }}
                    className={buttonClass("secondary")}
                  >
                    Newest: {newest.title}
                  </Link>
                )}
              </div>
              <p className="mt-4 max-w-[52ch] text-sm text-text-2">
                Every cover is grown from its track: one ring per bar, notes in their degree colours, the
                drums marked on the rings.
              </p>
            </>
          ) : (
            <FirstTrack c0={c0} />
          )}
        </div>
      </header>

      <div className="flex flex-col gap-10">
        {sides.map((side) => (
          <section key={side.side} aria-labelledby={`side-${side.side}`}>
            <div className="mb-3 flex items-baseline gap-3 border-b border-border pb-2">
              <h2 id={`side-${side.side}`} className="font-display text-h2">
                {side.title}
              </h2>
              <span className="text-sm text-text-3">{side.sub}</span>
            </div>
            <ol className="flex flex-col">
              {side.slots.map((slot) => (
                <SlotRow
                  key={slot.kind === "track" ? slot.track.id : slot.capstone.id}
                  slot={slot}
                  detail={slot.kind === "track" ? detailOf.get(slot.track.id) : undefined}
                  playing={playing}
                  onPlay={(p) => {
                    setQueue([]);
                    play(p);
                  }}
                />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </Page>
  );
}

function Sleeve({
  newest,
  detail,
  spinning,
}: {
  newest: AlbumTrack | null;
  detail: AlbumTrackDetail | undefined;
  spinning: boolean;
}) {
  const version = detail?.versions.find((v) => v.version === newest?.currentVersion) ?? null;
  const { music, pending } = useCoverMusic(
    version ? { sketchId: version.sketchId, sketchVersion: version.sketchVersion } : null,
    newest?.flavour ?? null,
  );
  if (!newest)
    return (
      <div className="relative flex h-[300px] items-center" aria-hidden>
        <div className="absolute left-[150px]">
          <Vinyl size={280} empty />
        </div>
        <div className="relative z-10 flex size-[300px] items-center justify-center rounded-card border-2 border-dashed border-border bg-surface">
          <span className="font-display text-h3 text-text-3">Side A · 1</span>
        </div>
      </div>
    );
  return (
    <div className="relative flex h-[300px] items-center">
      <div className="absolute left-[130px] top-[10px]">
        <Vinyl
          size={280}
          spinning={spinning}
          label={
            <AlbumCover
              seed={newest.coverSeed}
              title={newest.title}
              music={music}
              loading={pending || !detail}
              size={96}
              plain
            />
          }
        />
      </div>
      <div className="relative z-10 shadow-overlay">
        <AlbumCover
          seed={newest.coverSeed}
          title={newest.title}
          music={music}
          loading={pending || !detail}
          size={300}
        />
      </div>
    </div>
  );
}

function FirstTrack({ c0 }: { c0: { status: string; lockedReason: string | null } | undefined }) {
  const open = c0 && c0.status !== "locked";
  return (
    <div className="mt-2 max-w-[56ch]" data-testid="album-empty">
      <h2 className="text-h2">Side A, track 1 is waiting</h2>
      <p className="mt-2 text-text-2">
        Your first track is <strong className="font-medium text-text">C0 Intro</strong>: four to eight bars of
        drums you write yourself, with a fill in the last bar. When you release it, its cover grows from the
        music, one ring per bar, and the record starts to fill.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {open ? (
          <Link to="/capstone/$id" params={{ id: "C0" }} className={buttonClass("primary", "lg")}>
            {c0?.status === "in_progress" ? "Back to C0 Intro" : "Start C0 Intro"}
          </Link>
        ) : (
          <>
            <span className="inline-flex items-center gap-2 text-sm text-text-2">
              <Lock aria-hidden className="size-4" />
              {c0?.lockedReason ?? "It opens after the Unit 1 checkpoint."}
            </span>
            <Link to="/oak" search={{ view: "course" }} className={buttonClass("secondary")}>
              See the way there
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function SlotRow({
  slot,
  detail,
  playing,
  onPlay,
}: {
  slot: Slot;
  detail: AlbumTrackDetail | undefined;
  playing: Playing | null;
  onPlay(p: Playing | null): void;
}) {
  const [open, setOpen] = useState(false);
  if (slot.kind === "empty") {
    const s = slot;
    const where =
      s.status === "open"
        ? "Open now"
        : s.status === "in_progress"
          ? `In progress · ${s.sessionsDone} of ${s.sessionsTotal} sessions`
          : (s.lockedReason ?? "Opens later in the course");
    const reachable = s.status === "open" || s.status === "in_progress";
    return (
      <li className="flex items-center gap-4 border-b border-border/60 py-3" data-slot={s.capstone.id}>
        <span className="w-6 shrink-0 text-right font-display text-h3 text-text-3 tabular-nums">{s.no}</span>
        <span aria-hidden className="size-14 shrink-0 rounded-card border-2 border-dashed border-border" />
        <div className="min-w-0 flex-1">
          <p className="text-text-2">{s.capstone.title}</p>
          <p className="text-sm text-text-3">{where}</p>
        </div>
        {reachable && (
          <Link to="/capstone/$id" params={{ id: s.capstone.id }} className={buttonClass("secondary", "sm")}>
            {s.status === "in_progress" ? "Continue" : "Start"}
          </Link>
        )}
      </li>
    );
  }
  const t = slot.track;
  const v = detail?.versions.find((x) => x.version === t.currentVersion) ?? null;
  const isPlaying = playing?.trackId === t.id;
  return (
    <li className="border-b border-border/60" data-track={t.id}>
      <div className="flex items-center gap-4 py-3">
        <span className="w-6 shrink-0 text-right font-display text-h3 text-text-3 tabular-nums">
          {slot.no}
        </span>
        <TrackThumb track={t} version={v} />
        <div className="min-w-0 flex-1">
          <Link to="/album/$trackId" params={{ trackId: t.id }} className="font-medium hover:underline">
            {t.title}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-text-2">
            {t.flavour && <span>{FLAVOUR_LABEL[t.flavour] ?? t.flavour}</span>}
            {t.currentVersion > 1 && <span>· v{t.currentVersion}</span>}
            {v?.theoryTags.slice(0, 3).map((tag) => (
              <Chip key={tag} className="h-5 text-[0.75rem]">
                {tag}
              </Chip>
            ))}
          </p>
        </div>
        <span className="hidden w-14 text-right text-sm text-text-3 tabular-nums sm:block">
          {v?.durationS ? formatDuration(v.durationS) : ""}
        </span>
        <Button
          size="sm"
          variant={isPlaying ? "primary" : "secondary"}
          disabled={!v?.hasAudio}
          title={v?.hasAudio ? undefined : "No recording of this version yet"}
          aria-label={isPlaying ? `Stop ${t.title}` : `Play ${t.title}`}
          icon={
            isPlaying ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />
          }
          onClick={() => onPlay(isPlaying || !v ? null : { trackId: t.id, version: v.version })}
        />
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={open}
          aria-controls={`liner-${t.id}`}
          onClick={() => setOpen((o) => !o)}
          icon={
            <ChevronDown
              aria-hidden
              className={clsx("size-4 transition-transform reduced:transition-none", open && "rotate-180")}
            />
          }
        >
          Liner notes
        </Button>
      </div>
      {open && (
        <div
          id={`liner-${t.id}`}
          className="mb-4 ml-24 max-w-[70ch] rounded-card bg-surface-2/60 p-4 text-sm"
        >
          {v ? (
            <LinerNotes text={v.linerNotesMd} attribution={v.attribution} />
          ) : (
            <p className="text-text-3">Loading…</p>
          )}
        </div>
      )}
    </li>
  );
}

function TrackThumb({
  track,
  version,
}: {
  track: AlbumTrack;
  version: AlbumTrackDetail["versions"][number] | null;
}) {
  const { music, pending } = useCoverMusic(
    version ? { sketchId: version.sketchId, sketchVersion: version.sketchVersion } : null,
    track.flavour,
  );
  return (
    <AlbumCover
      seed={track.coverSeed}
      title={track.title}
      music={music}
      loading={pending || !version}
      size={56}
      plain
    />
  );
}

/** Liner notes are short markdown: paragraphs, "- " lists and `code`. Rendered as text, never as HTML. */
export function LinerNotes({ text, attribution }: { text: string; attribution?: string | null }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim());
  return (
    <div className="flex flex-col gap-2 leading-relaxed" data-testid="liner-notes">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => l.startsWith("- ")))
          return (
            <ul key={i} className="list-disc pl-5">
              {lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l.slice(2)} />
                </li>
              ))}
            </ul>
          );
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j} className="block">
                <Inline text={l} />
              </span>
            ))}
          </p>
        );
      })}
      {attribution && <p className="text-text-3">{attribution}</p>}
      {blocks.length === 0 && <p className="text-text-3">No liner notes for this version.</p>}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded bg-surface px-1 font-mono text-[0.9em]">
            {part}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
