// One transcription project. The player (stretch, loop regions, overlay, A/B) and the editor are Wave 2; the
// project's facts, regions, versions and audio are live. Hidden pattern code never reaches the page.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { formatDate, formatDuration, formatKey } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { audioUrl, useTranscription, useTranscriptionDelete } from "../../lib/queries.ts";
import { keyScope } from "../../ui/keys/KeymapProvider.tsx";
import { Button } from "../../ui/kit/Button.tsx";
import { Card, Chip, Page, PageHeader, WavePlaceholder } from "../../ui/kit/basics.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";
import { toast } from "../../ui/kit/Toast.tsx";

export const Route = createFileRoute("/transcribe/$projectId")({ component: Project });

function Project() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const t = useTranscription(projectId);
  const del = useTranscriptionDelete();
  usePageTitle(t.data?.title ?? "Transcription");
  return (
    <Page>
      <QueryView query={t}>
        {(p) => (
          <div {...keyScope("transcription")} className="flex flex-col gap-4">
            <PageHeader
              title={p.title}
              sub={[p.artist, formatKey(p.key), p.bpm ? `${p.bpm} BPM` : null, p.meter]
                .filter(Boolean)
                .join(" · ")}
              actions={
                <Button
                  variant="ghost"
                  icon={<Trash2 aria-hidden className="size-4" />}
                  onClick={async () => {
                    try {
                      const r = await del.mutateAsync({
                        target: p.id,
                        question: `Delete the transcription “${p.title}” and its ${p.versions.length} versions? This cannot be undone.`,
                        input: { params: { id: p.id } },
                      });
                      if (r) void navigate({ to: "/transcribe" });
                    } catch (e) {
                      toast.error("Couldn't delete it", e instanceof Error ? e.message : undefined);
                    }
                  }}
                >
                  Delete
                </Button>
              }
            />
            {p.player === "audio" && p.audioId && (
              <Card className="p-4">
                {/* biome-ignore lint/a11y/useMediaCaption: the learner's own music has no captions. */}
                <audio controls preload="metadata" src={audioUrl(p.audioId)} className="w-full" />
              </Card>
            )}
            <WavePlaceholder feature="The transcription player and editor">
              {p.stimulus && (
                <p className="text-sm text-text-2">
                  {p.stimulus.bars} bars ready to play · {p.stimulus.events.length} events
                </p>
              )}
            </WavePlaceholder>
            {p.regions.length > 0 && (
              <Card className="p-4">
                <h2 className="mb-2 text-h3">Regions</h2>
                <ul className="flex flex-wrap gap-2">
                  {p.regions.map((r) => (
                    <li key={r.id}>
                      <Chip>
                        {r.label} · {formatDuration(r.startS)}–{formatDuration(r.endS)}
                      </Chip>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <Card className="p-4">
              <h2 className="mb-2 text-h3">Versions</h2>
              {p.versions.length === 0 ? (
                <p className="text-text-2">Nothing written yet.</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {[...p.versions].reverse().map((v) => (
                    <li key={v.version}>
                      <details>
                        <summary className="cursor-pointer">
                          v{v.version} · {formatDate(v.createdAt)}
                        </summary>
                        <pre className="mt-2 overflow-auto rounded-control bg-surface-2 p-3 font-mono text-sm">
                          {v.code}
                        </pre>
                      </details>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        )}
      </QueryView>
    </Page>
  );
}
