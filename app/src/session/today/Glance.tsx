// The right column of Today (ux §1.4): the next unlock (goal gradient), the Oak in miniature, the album's first
// slots, the last sketch and Claude's one-line note. Each card renders its own loading and empty state and links
// out to the full surface.
import type { NextUnlock } from "@oak/api";
import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { Sprout } from "lucide-react";
import { TrackCover } from "../../album/TrackCover.tsx";
import { useContent } from "../../lib/content.ts";
import { useAlbum, useBootstrap, useCourseProgress, useNextUnlocks, useSketches } from "../../lib/queries.ts";
import { toolLabel } from "../../lib/tool-label.ts";
import { useMediaQuery } from "../../lib/use-media.ts";
import { OakGlance as MapGlance } from "../../map/index.ts";
import { AcornIcon, LeafIcon, RingIcon } from "../../ui/icons/index.tsx";
import { Card, Skeleton } from "../../ui/kit/basics.tsx";
import { goalGradient } from "../coda-model.ts";
import { doneItems, nextUnlocksFrom } from "../progress-model.ts";

function CardTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="mb-2 flex items-center gap-2 font-sans text-sm font-semibold text-text-2">
      {icon}
      {children}
    </h2>
  );
}

/** The server's `/unlocks/next`; while that is not available, the same count along the default order. */
export function useNextUnlockList(): { items: NextUnlock[] | null; pending: boolean } {
  const next = useNextUnlocks();
  const content = useContent();
  const course = useCourseProgress();
  const boot = useBootstrap();
  if (next.data) return { items: next.data.items, pending: false };
  if (!next.isError) return { items: null, pending: true };
  if (!content.data?.syllabus || !course.data || !boot.data)
    return { items: null, pending: content.isPending || course.isPending || boot.isPending };
  return {
    items: nextUnlocksFrom(
      content.data.syllabus.defaultOrder,
      doneItems(course.data),
      content.data.toolbox,
      new Set(boot.data.unlocks.map((u) => u.itemId as string)),
    ),
    pending: false,
  };
}

export function NextUnlockCard() {
  const content = useContent();
  const { items, pending } = useNextUnlockList();
  const first = items?.[0];
  const tool = first ? content.data?.toolbox.find((t) => t.id === first.itemId) : undefined;
  const label = tool ? toolLabel(tool) : null;
  return (
    <Card className="p-4" data-testid="next-unlock">
      <CardTitle icon={<AcornIcon size={16} />}>Next unlock</CardTitle>
      {pending ? (
        <Skeleton className="h-10 w-full" />
      ) : first ? (
        <div className="flex flex-col gap-1">
          <p data-testid="goal-gradient">
            {goalGradient(first, "")}
            {label?.mono === false ? (
              <span className="font-medium">{label.text}</span>
            ) : (
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-sm">
                {label?.text ?? first.itemId}
              </code>
            )}
          </p>
          {tool?.concept && <p className="text-sm text-text-2">{tool.concept}</p>}
          <Link
            to="/toolbox/$toolId"
            params={{ toolId: first.itemId }}
            className="text-sm text-link underline-offset-2 hover:underline"
          >
            Hear what it does
          </Link>
        </div>
      ) : (
        <p className="text-sm text-text-2">
          Everything on the course map so far is in your{" "}
          <Link to="/toolbox" className="text-link underline-offset-2 hover:underline">
            toolbox
          </Link>
          .
        </p>
      )}
    </Card>
  );
}

/** The Oak in miniature (the map's thumbnail, ux §1.4): every leaf in the strand × unit grid, shaded by freshness. */
export function OakGlanceCard() {
  const wide = useMediaQuery("(min-width: 1400px)");
  return (
    <Card className="p-4">
      <CardTitle icon={<LeafIcon size={16} />}>The Oak</CardTitle>
      <MapGlance width={wide ? 240 : 180} />
    </Card>
  );
}

/** The album's first slots: C0 and C1 in Wave 2, filled as tracks are released. */
export function AlbumStrip() {
  const album = useAlbum();
  const content = useContent();
  const course = useCourseProgress();
  const slots = (content.data?.capstones ?? []).filter((c) => /^C\d+$/.test(c.id)).slice(0, 3);
  return (
    <Card className="p-4" data-testid="album-strip">
      <CardTitle icon={<RingIcon size={16} />}>Album</CardTitle>
      {album.isPending || content.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <>
          <ul className="flex gap-3">
            {slots.map((c) => {
              const track = album.data?.tracks.find((t) => t.capstoneId === c.id);
              const status = course.data?.capstones.find((s) => s.capstoneId === c.id)?.status ?? "locked";
              return (
                <li key={c.id} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
                  {track ? (
                    <Link
                      to="/album/$trackId"
                      params={{ trackId: track.id }}
                      aria-label={`${track.title}, released`}
                    >
                      <TrackCover track={track} size={56} />
                    </Link>
                  ) : (
                    <span
                      aria-hidden
                      className={clsx(
                        "block size-14 rounded-full border-2 border-dashed",
                        status === "locked" ? "border-border" : "border-accent/60",
                      )}
                    />
                  )}
                  <span className="w-full truncate text-[0.75rem] text-text-2" title={c.title}>
                    {c.title}
                  </span>
                  <span className="sr-only">
                    {track ? "released" : status === "locked" ? "not open yet" : status.replace("_", " ")}
                  </span>
                </li>
              );
            })}
          </ul>
          <Link
            to="/album"
            className="mt-2 inline-block text-sm text-link underline-offset-2 hover:underline"
          >
            {album.data?.tracks.length ? "Open the album" : "Your capstones become its tracks"}
          </Link>
        </>
      )}
    </Card>
  );
}

export function LastSketchCard() {
  const sketches = useSketches();
  const last = sketches.data?.items[0];
  return (
    <Card className="p-4" data-testid="last-sketch">
      <CardTitle icon={<Sprout aria-hidden className="size-4" />}>Last sketch</CardTitle>
      {sketches.isPending ? (
        <Skeleton className="h-5 w-32" />
      ) : last ? (
        <Link
          to="/studio/$sketchId"
          params={{ sketchId: last.id }}
          className="text-link underline-offset-2 hover:underline"
        >
          {last.title}
        </Link>
      ) : (
        <p className="text-sm text-text-2">Your sketchbook fills up one session at a time.</p>
      )}
    </Card>
  );
}

export function TutorNoteCard({ note }: { note: string }) {
  return (
    <Card className="p-4" data-testid="tutor-note">
      <h2 className="mb-1 font-sans text-sm font-semibold text-text-2">Claude's note</h2>
      <p className="text-text-2">{note}</p>
    </Card>
  );
}
