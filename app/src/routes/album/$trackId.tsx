// Track page (`/album/$trackId?v=`): cover, the chosen version's recording and liner notes, the version list.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { z } from "zod";
import { FLAVOUR_LABEL, formatDate, formatDuration } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { albumAudioUrl, useAlbumDeleteTrack, useAlbumTrack } from "../../lib/queries.ts";
import { AlbumCover } from "../../ui/AlbumCover.tsx";
import { Button } from "../../ui/kit/Button.tsx";
import { Card, Chip, Page } from "../../ui/kit/basics.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";
import { toast } from "../../ui/kit/Toast.tsx";

const searchSchema = z.object({ v: z.coerce.number().int().positive().optional().catch(undefined) });

export const Route = createFileRoute("/album/$trackId")({
  validateSearch: (s) => searchSchema.parse(s),
  component: Track,
});

function Track() {
  const { trackId } = Route.useParams();
  const { v } = Route.useSearch();
  const navigate = useNavigate();
  const track = useAlbumTrack(trackId);
  const del = useAlbumDeleteTrack();
  usePageTitle(track.data?.title ?? "Track");
  return (
    <Page>
      <QueryView query={track}>
        {(t) => {
          const version = t.versions.find((x) => x.version === (v ?? t.currentVersion)) ?? t.versions.at(-1);
          return (
            <div className="grid gap-8 md:grid-cols-[auto_1fr]">
              <AlbumCover seed={t.coverSeed} title={t.title} size={240} />
              <div className="flex min-w-0 flex-col gap-4">
                <header>
                  <p className="text-sm text-text-3">
                    {t.side === "Bside" ? "B-side" : `Side ${t.side}`} · track {t.trackNo}
                  </p>
                  <h1 className="text-h1">{t.title}</h1>
                  <p className="mt-1 flex flex-wrap gap-2">
                    {t.flavour && <Chip>{FLAVOUR_LABEL[t.flavour] ?? t.flavour}</Chip>}
                    {version?.theoryTags.map((tag) => (
                      <Chip key={tag}>{tag}</Chip>
                    ))}
                    {version?.tutorAssisted && <Chip tone="amber">tutor-assisted</Chip>}
                  </p>
                </header>
                {version?.hasAudio ? (
                  // biome-ignore lint/a11y/useMediaCaption: an instrumental recording of the learner's own piece.
                  <audio
                    controls
                    preload="metadata"
                    src={albumAudioUrl(t.id, version.version)}
                    className="w-full"
                  />
                ) : (
                  <p className="text-text-2">No recording for this version yet.</p>
                )}
                {version && (
                  <Card className="p-4">
                    <h2 className="mb-2 text-h3">Liner notes</h2>
                    <div className="whitespace-pre-wrap leading-relaxed">{version.linerNotesMd || "—"}</div>
                    {version.attribution && <p className="mt-2 text-sm text-text-3">{version.attribution}</p>}
                    {version.durationS && (
                      <p className="mt-2 text-sm text-text-3">{formatDuration(version.durationS)}</p>
                    )}
                  </Card>
                )}
                <nav aria-label="Versions" className="flex flex-wrap items-center gap-2">
                  {t.versions.map((x) => (
                    <Link
                      key={x.version}
                      to="/album/$trackId"
                      params={{ trackId: t.id }}
                      search={{ v: x.version }}
                      aria-current={x.version === version?.version ? "page" : undefined}
                      className="rounded-control border border-border px-2 py-1 text-sm aria-[current=page]:border-accent aria-[current=page]:text-accent"
                    >
                      v{x.version} · {formatDate(x.createdAt, true)}
                    </Link>
                  ))}
                  {t.sketchId && (
                    <Link
                      to="/studio/$sketchId"
                      params={{ sketchId: t.sketchId }}
                      className="ml-2 text-sm text-link"
                    >
                      Open the sketch
                    </Link>
                  )}
                </nav>
                <div>
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
                </div>
              </div>
            </div>
          );
        }}
      </QueryView>
    </Page>
  );
}
