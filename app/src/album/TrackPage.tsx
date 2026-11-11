// `/album/$trackId?v=` (ux §5.3): the cover (360) and liner notes on the left; the recording, the live code, the
// version timeline with A/B and the revision path on the right. Each version has its own cover.
import type { AlbumTrackDetail, AlbumTrackVersion, CapstoneReview, MeterId, SketchDetail } from "@oak/api";
import { CapstoneReviewSchema } from "@oak/api";
import { editorId } from "@oak/strudel";
import { Link, useNavigate } from "@tanstack/react-router";
import { clsx } from "clsx";
import { Code2, Mic2, Pencil, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { recordingSeconds, recordPerformance } from "../capstone/engine.ts";
import { WorkbenchServicesLoader } from "../capstone/WorkbenchServicesLoader.tsx";
import { FLAVOUR_LABEL, formatDate, formatDuration } from "../lib/format.ts";
import { usePageTitle } from "../lib/nav.ts";
import {
  albumAudioUrl,
  useAlbumDeleteTrack,
  useAlbumPutAudio,
  useAlbumTrack,
  useSketch,
} from "../lib/queries.ts";
import { clearSubject, setSubject } from "../tutor/context.ts";
import { AlbumCover } from "../ui/AlbumCover.tsx";
import { Button, buttonClass } from "../ui/kit/Button.tsx";
import { Card, Chip, Page, Skeleton } from "../ui/kit/basics.tsx";
import { Callout } from "../ui/kit/Controls.tsx";
import { ErrorState } from "../ui/kit/QueryState.tsx";
import { toast } from "../ui/kit/Toast.tsx";
import { useWorkbenchServices } from "../workbench/services.tsx";
import { Workbench } from "../workbench/Workbench.tsx";
import "../workbench/index.ts";
import { sideLabel } from "../capstone/Ceremony.tsx";
import { LinerNotes } from "./AlbumPage.tsx";
import { changeSummary } from "./model.ts";
import { useCoverMusic } from "./music.ts";

export function TrackPage({ trackId, v }: { trackId: string; v: number | undefined }) {
  const track = useAlbumTrack(trackId);
  usePageTitle(track.data?.title ?? "Track");
  if (track.isError)
    return (
      <Page>
        <ErrorState error={track.error} onRetry={() => void track.refetch()} />
      </Page>
    );
  if (!track.data)
    return (
      <Page>
        <div
          className="grid gap-8 lg:grid-cols-[360px_1fr]"
          role="status"
          aria-busy="true"
          aria-label="Loading the track"
        >
          <Skeleton className="aspect-square w-full" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-72" />
            <Skeleton className="mt-4 h-12 w-full" />
          </div>
        </div>
      </Page>
    );
  return <Track t={track.data} v={v} />;
}

function Track({ t, v }: { t: AlbumTrackDetail; v: number | undefined }) {
  const navigate = useNavigate();
  const del = useAlbumDeleteTrack();
  const version = t.versions.find((x) => x.version === (v ?? t.currentVersion)) ?? t.versions.at(-1);
  const sketch = useSketch(version?.sketchId ?? "none");
  const codeOf = (x: AlbumTrackVersion | undefined) =>
    x ? (sketch.data?.versions.find((s) => s.version === x.sketchVersion)?.code ?? null) : null;
  const code = codeOf(version);
  const { music, pending } = useCoverMusic(
    version ? { sketchId: version.sketchId, sketchVersion: version.sketchVersion } : null,
    t.flavour,
  );
  const review = parseReview(version?.review);

  useEffect(() => {
    const thread = { subjectKind: "track" as const, subjectId: t.id };
    setSubject({ thread, title: t.title, tutorOpen: true, ...(code ? { code } : {}) });
    return () => clearSubject(thread);
  }, [t.id, t.title, code]);

  if (!version) return null;
  return (
    <Page>
      <div className="grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <AlbumCover seed={t.coverSeed} title={t.title} music={music} loading={pending} size={360} />
          {version.theoryTags.length > 0 && (
            <ul aria-label="Theory used" className="flex flex-wrap gap-1.5">
              {version.theoryTags.map((tag) => (
                <li key={tag}>
                  <Chip>{tag}</Chip>
                </li>
              ))}
            </ul>
          )}
          <Card className="p-4">
            <h2 className="mb-2 text-h3">Liner notes</h2>
            <LinerNotes text={version.linerNotesMd} attribution={version.attribution} />
          </Card>
          {review && <ReviewCard review={review} />}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <header>
            <p className="text-sm text-text-3">
              {sideLabel(t.side)} · track {t.trackNo}
            </p>
            <h1 className="font-display text-h1">{t.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              {t.flavour && <Chip>{FLAVOUR_LABEL[t.flavour] ?? t.flavour}</Chip>}
              <Chip tone={version.version === t.currentVersion ? "accent" : "neutral"}>
                Version {version.version}
                {version.version === t.currentVersion ? " · current" : ` of ${t.versions.length}`}
              </Chip>
              {version.tutorAssisted && <Chip tone="amber">tutor-assisted</Chip>}
              <span className="text-sm text-text-3">{formatDate(version.createdAt, true)}</span>
            </p>
          </header>

          <section aria-labelledby="trk-listen" className="flex flex-col gap-2">
            <h2 id="trk-listen" className="text-h3">
              Listen
            </h2>
            {version.hasAudio ? (
              // biome-ignore lint/a11y/useMediaCaption: an instrumental recording of the learner's own piece.
              <audio
                controls
                preload="metadata"
                src={albumAudioUrl(t.id, version.version)}
                className="w-full"
                data-testid="track-audio"
              />
            ) : (
              <p className="text-text-2">
                No recording of this version yet. Open the code below to play it live and record it.
              </p>
            )}
          </section>

          <CodeSection track={t} version={version} code={code} sketch={sketch.data} />

          <Versions track={t} selected={version.version} sketch={sketch.data} />

          <section
            aria-labelledby="trk-next"
            className="flex flex-wrap items-center gap-2 border-t border-border pt-5"
          >
            <h2 id="trk-next" className="sr-only">
              Revise
            </h2>
            {t.capstoneId ? (
              <Link to="/capstone/$id" params={{ id: t.capstoneId }} className={buttonClass("primary")}>
                <Pencil aria-hidden className="size-4" /> Revise and release version {t.versions.length + 1}
              </Link>
            ) : t.sketchId ? (
              <Link
                to="/studio/$sketchId"
                params={{ sketchId: t.sketchId }}
                className={buttonClass("secondary")}
              >
                Open the sketch
              </Link>
            ) : null}
            <Button
              variant="ghost"
              icon={<Trash2 aria-hidden className="size-4" />}
              onClick={async () => {
                try {
                  const r = await del.mutateAsync({
                    target: t.id,
                    question: `Remove “${t.title}” and its ${t.versions.length} versions from the album? This cannot be undone.`,
                    input: { params: { id: t.id } },
                  });
                  if (r) void navigate({ to: "/album" });
                } catch (e) {
                  toast.error("Couldn't remove the track", e instanceof Error ? e.message : undefined);
                }
              }}
            >
              Remove from album
            </Button>
          </section>
        </div>
      </div>
    </Page>
  );
}

function parseReview(raw: unknown): CapstoneReview | null {
  const r = CapstoneReviewSchema.safeParse(raw);
  return r.success ? r.data : null;
}

function ReviewCard({ review }: { review: CapstoneReview }) {
  const bars = (b: [number, number]) => (b[0] === b[1] ? `bar ${b[0]}` : `bars ${b[0]}–${b[1]}`);
  return (
    <Card className="p-4 text-sm">
      <h2 className="text-h3">Claude's review</h2>
      <p className="mb-2 text-text-3">Claude's comments never affect pass or fail.</p>
      <ul className="flex flex-col gap-1.5">
        {review.strengths.map((s) => (
          <li key={s.text}>
            <span className="font-mono text-[0.75rem] text-text-3">{bars(s.bars)}</span> {s.text}
          </li>
        ))}
      </ul>
      {review.revisions.map((r) => (
        <p key={r.title} className="mt-2">
          <span className="font-medium">{r.title}</span>{" "}
          <span className="font-mono text-[0.75rem] text-text-3">{bars(r.bars)}</span> — {r.why}
        </p>
      ))}
      <p className="mt-2 italic text-text-2">{review.listeningQuestion}</p>
    </Card>
  );
}

function CodeSection({
  track,
  version,
  code,
  sketch,
}: {
  track: AlbumTrackDetail;
  version: AlbumTrackVersion;
  code: string | null;
  sketch: SketchDetail | undefined;
}) {
  const [open, setOpen] = useState(false);
  const sv = sketch?.versions.find((s) => s.version === version.sketchVersion);
  const reviewFirst = sv?.flags.reviewBeforeRun === true;
  return (
    <section aria-labelledby="trk-code" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id="trk-code" className="text-h3">
          The code
        </h2>
        {!open && (
          <Button
            icon={<Code2 aria-hidden className="size-4" />}
            disabled={!code}
            onClick={() => setOpen(true)}
          >
            Play it live
          </Button>
        )}
      </div>
      {open && code && sv && (
        <WorkbenchServicesLoader label="Loading the code">
          {reviewFirst ? (
            <Callout tone="attention" title="Review before running">
              This version came from a backup. Read the code first; it runs once you release it again from the
              capstone.
              <pre className="mt-2 max-h-60 overflow-auto rounded-control bg-surface-2 p-2 font-mono text-sm">
                {code}
              </pre>
            </Callout>
          ) : (
            <LiveCode track={track} version={version} code={code} meter={sv.meter ?? "4/4"} />
          )}
        </WorkbenchServicesLoader>
      )}
    </section>
  );
}

function LiveCode({
  track,
  version,
  code,
  meter,
}: {
  track: AlbumTrackDetail;
  version: AlbumTrackVersion;
  code: string;
  meter: MeterId;
}) {
  const { oak } = useWorkbenchServices();
  const put = useAlbumPutAudio();
  const { music } = useCoverMusic(
    { sketchId: version.sketchId, sketchVersion: version.sketchVersion },
    track.flavour,
  );
  const [recording, setRecording] = useState(false);
  const slug = `track-${track.id}-v${version.version}`;
  const bars = music?.bars ?? 4;
  const t0 = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!recording) return;
    t0.current = performance.now();
    const id = setInterval(() => setElapsed((performance.now() - t0.current) / 1000), 250);
    return () => clearInterval(id);
  }, [recording]);
  // Stop, or leaving the page mid-take, cancels the recorder: nothing is uploaded after the learner has gone.
  const live = useRef({ recording: false, stopped: false, gone: false });
  useEffect(() => {
    const l = live.current;
    l.gone = false;
    return () => {
      l.gone = true;
      if (l.recording && oak.recorder.recording) {
        l.stopped = true;
        oak.recorder.cancel();
      }
    };
  }, [oak]);
  const stop = () => {
    if (!oak.recorder.recording) return;
    live.current.stopped = true;
    oak.recorder.cancel();
  };
  const record = async () => {
    const h = oak.editors.get(editorId(slug));
    if (!h) return;
    setRecording(true);
    live.current.recording = true;
    live.current.stopped = false;
    try {
      const rec = await recordPerformance(oak, h, bars);
      if (live.current.gone) return;
      await put.mutateAsync({
        params: { id: track.id, v: String(version.version) },
        query: { durationS: String(Math.round(rec.durationS * 10) / 10) },
        body: rec.blob,
        contentType: rec.mime.split(";")[0],
      } as never);
      toast.success(`Version ${version.version} recorded`);
    } catch (e) {
      if (live.current.gone) return;
      if (live.current.stopped) toast.info("Recording stopped. Nothing was saved.");
      else toast.error("The recording didn't work", e instanceof Error ? e.message : undefined);
    } finally {
      live.current.recording = false;
      if (!live.current.gone) setRecording(false);
    }
  };
  const expected = music?.bpm ? recordingSeconds(bars, music.bpm / 240) : null;
  return (
    <div className="flex flex-col gap-2">
      <Workbench
        id={slug}
        code={code}
        variant="compact"
        readOnly
        lessonCtx={{
          key: music?.key ?? null,
          meter,
          defaultBpm: 100,
          loopBars: Math.max(1, Math.min(64, bars)),
        }}
        lint={{ profile: "studio", unlocked: new Set(), allowPreview: true, meter, key: null }}
        views={["roll"]}
        toolbar={
          <span className="inline-flex items-center gap-2">
            <Button
              size="sm"
              icon={<Mic2 aria-hidden className="size-4" />}
              loading={recording}
              onClick={() => void record()}
              className={clsx(!version.hasAudio && "border-accent")}
            >
              {version.hasAudio ? "Record again" : "Record this version"}
            </Button>
            {recording && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Square aria-hidden className="size-4" />}
                onClick={stop}
                data-testid="stop-recording"
              >
                Stop
              </Button>
            )}
          </span>
        }
      />
      {recording && (
        <p className="text-sm text-text-2" aria-live="polite">
          Recording {formatDuration(elapsed)}
          {expected ? ` of ${formatDuration(expected)}` : ""}… UI sounds and the mic are off.
        </p>
      )}
    </div>
  );
}

function Versions({
  track,
  selected,
  sketch,
}: {
  track: AlbumTrackDetail;
  selected: number;
  sketch: SketchDetail | undefined;
}) {
  const codeAt = (sv: number) => sketch?.versions.find((s) => s.version === sv)?.code ?? null;
  const ordered = [...track.versions].sort((a, b) => b.version - a.version);
  return (
    <section aria-labelledby="trk-versions" className="flex flex-col gap-3">
      <h2 id="trk-versions" className="text-h3">
        Versions
      </h2>
      <ol className="flex flex-col gap-1">
        {ordered.map((x) => {
          const prev = track.versions.find((p) => p.version === x.version - 1);
          const now = codeAt(x.sketchVersion);
          const summary = now === null ? "" : changeSummary(prev ? codeAt(prev.sketchVersion) : null, now);
          return (
            <li key={x.version}>
              <Link
                to="/album/$trackId"
                params={{ trackId: track.id }}
                search={{ v: x.version }}
                aria-current={x.version === selected ? "page" : undefined}
                className="flex items-center gap-3 rounded-card border border-transparent p-2 hover:bg-surface-2 aria-[current=page]:border-accent/50 aria-[current=page]:bg-lane-in"
              >
                <VersionCover track={track} version={x} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">Version {x.version}</span>
                  {x.version === track.currentVersion && <span className="text-text-3"> · current</span>}
                  <span className="block text-sm text-text-2">
                    {formatDate(x.createdAt, true)}
                    {summary ? ` · ${summary}` : ""}
                    {x.durationS ? ` · ${formatDuration(x.durationS)}` : ""}
                    {x.hasAudio ? "" : " · not recorded"}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <Compare track={track} selected={selected} />
    </section>
  );
}

function VersionCover({ track, version }: { track: AlbumTrackDetail; version: AlbumTrackVersion }) {
  const { music, pending } = useCoverMusic(
    { sketchId: version.sketchId, sketchVersion: version.sketchVersion },
    track.flavour,
  );
  return (
    <AlbumCover
      seed={track.coverSeed}
      title={`${track.title} v${version.version}`}
      music={music}
      loading={pending}
      size={48}
      plain
    />
  );
}

/** A/B between two recorded versions: switching keeps the position, so the change is heard in place. */
function Compare({ track, selected }: { track: AlbumTrackDetail; selected: number }) {
  const recorded = track.versions.filter((x) => x.hasAudio).sort((a, b) => b.version - a.version);
  const a = recorded.find((x) => x.version === selected) ?? recorded[0];
  const b = recorded.find((x) => x.version !== a?.version);
  const refs = { A: useRef<HTMLAudioElement>(null), B: useRef<HTMLAudioElement>(null) };
  const [side, setSide] = useState<"A" | "B">("A");
  const [playing, setPlaying] = useState(false);
  if (!a || !b) return null;
  const el = (s: "A" | "B") => refs[s].current;
  const switchTo = (s: "A" | "B") => {
    const from = el(side);
    const to = el(s);
    if (!to) return;
    if (from && from !== to) {
      to.currentTime = Math.min(
        from.currentTime,
        Number.isFinite(to.duration) ? to.duration : from.currentTime,
      );
      if (playing) {
        from.pause();
        void to.play();
      }
    }
    setSide(s);
  };
  const toggle = () => {
    const cur = el(side);
    if (!cur) return;
    if (playing) {
      cur.pause();
      setPlaying(false);
    } else {
      void cur.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    }
  };
  return (
    <fieldset
      className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3"
      aria-label="Compare two versions"
      onKeyDown={(e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === "a" || e.key === "A") switchTo("A");
        else if (e.key === "b" || e.key === "B") switchTo("B");
        else return;
        e.preventDefault();
      }}
    >
      <legend className="sr-only">Compare two versions</legend>
      <span className="mr-1 text-sm font-medium">Hear the difference</span>
      <Button size="sm" variant={playing ? "primary" : "secondary"} onClick={toggle}>
        {playing ? "Pause" : "Play"}
      </Button>
      {(["A", "B"] as const).map((s) => (
        <Button
          key={s}
          size="sm"
          variant="ghost"
          aria-pressed={side === s}
          onClick={() => switchTo(s)}
          className={clsx(side === s && "bg-surface-2 text-text")}
        >
          {s} · v{(s === "A" ? a : b).version}
        </Button>
      ))}
      <span className="text-sm text-text-3">A and B switch in place.</span>
      {(["A", "B"] as const).map((s) => (
        // biome-ignore lint/a11y/useMediaCaption: instrumental recordings of the learner's own piece.
        <audio
          key={s}
          ref={refs[s]}
          preload="metadata"
          src={albumAudioUrl(track.id, (s === "A" ? a : b).version)}
          onEnded={() => setPlaying(false)}
          className="hidden"
        />
      ))}
    </fieldset>
  );
}
