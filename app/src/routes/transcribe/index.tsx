// Transcribe (contracts §11.9 naming): the ladder and your own audio. The list and "From your own audio" (upload,
// then create the project) are live; the player is on /transcribe/$projectId.
import type { Transcription } from "@oak/api";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AudioWaveform, Upload } from "lucide-react";
import { useRef } from "react";
import { formatDate, formatKey } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { useAudioUpload, useTranscriptionCreate, useTranscriptions } from "../../lib/queries.ts";
import { Button } from "../../ui/kit/Button.tsx";
import { Card, Chip, EmptyState, Page, PageHeader } from "../../ui/kit/basics.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";
import { toast } from "../../ui/kit/Toast.tsx";

export const Route = createFileRoute("/transcribe/")({ component: TranscribeList });

const SOURCE_LABEL: Record<Transcription["sourceKind"], string> = {
  "own-audio": "your audio",
  "pd-song": "public-domain song",
  generated: "ladder",
};

function TranscribeList() {
  usePageTitle("Transcribe");
  const navigate = useNavigate();
  const list = useTranscriptions();
  const upload = useAudioUpload();
  const create = useTranscriptionCreate();
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    try {
      const audio = await upload.mutateAsync({
        query: { name: file.name.slice(0, 255) },
        body: file,
        contentType: file.type || "application/octet-stream",
      });
      const t = await create.mutateAsync({
        body: {
          sourceKind: "own-audio",
          audioId: audio.id,
          songId: null,
          title: file.name.replace(/\.[^.]+$/, "").slice(0, 200) || "Untitled",
          artist: null,
          ladderLevel: null,
          templateId: null,
        },
      });
      void navigate({ to: "/transcribe/$projectId", params: { projectId: t.id } });
    } catch (e) {
      toast.error("Couldn't add that file", e instanceof Error ? e.message : undefined);
    }
  };

  const busy = upload.isPending || create.isPending;
  return (
    <Page>
      <PageHeader
        title="Transcribe"
        sub="Your audio file stays on this device. Claude only sees your transcription code."
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onFile(f);
              }}
            />
            <Button
              variant="primary"
              loading={busy}
              icon={<Upload aria-hidden className="size-4" />}
              onClick={() => fileRef.current?.click()}
            >
              From your own audio
            </Button>
          </>
        }
      />
      <QueryView
        query={list}
        isEmpty={(d) => d.items.length === 0}
        empty={
          <EmptyState icon={<AudioWaveform aria-hidden />} title="No transcriptions yet">
            The Transcription Gym opens after unit 6. You can start with your own audio any time.
          </EmptyState>
        }
      >
        {(d) => (
          <ul className="grid gap-3 sm:grid-cols-2">
            {d.items.map((t) => (
              <li key={t.id}>
                <Link to="/transcribe/$projectId" params={{ projectId: t.id }} className="block rounded-card">
                  <Card interactive className="flex flex-col gap-1 p-4">
                    <span className="font-medium">{t.title}</span>
                    <span className="text-sm text-text-2">
                      {[t.artist, formatKey(t.key), t.bpm ? `${t.bpm} BPM` : null]
                        .filter(Boolean)
                        .join(" · ") || "Not analysed yet"}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <Chip>{SOURCE_LABEL[t.sourceKind]}</Chip>
                      {t.ladderLevel && <Chip>L{t.ladderLevel}</Chip>}
                      <Chip tone={t.status === "done" ? "accent" : "neutral"}>
                        {t.status === "done" ? "done" : "in progress"}
                      </Chip>
                      <span className="ml-auto text-sm text-text-3">{formatDate(t.updatedAt, true)}</span>
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </Page>
  );
}
