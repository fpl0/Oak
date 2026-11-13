// Transcribe (contracts §11.9 naming; ux §9): the ladder (L1–L4 at the learner's level and realism, the next
// item, an offered level-up), the Transcription Gym's next session, the learner's own audio (drop or pick a
// file: checked and decoded here, stored by the local server, never sent anywhere), and every project.
import type { GymPlan, LadderState, Transcription } from "@oak/api";
import { OakApiError } from "@oak/api";
import { Link, useNavigate } from "@tanstack/react-router";
import { clsx } from "clsx";
import { ArrowUp, AudioWaveform, Dumbbell, Upload } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { formatDate, formatKey } from "../lib/format.ts";
import { getOak } from "../lib/oak.ts";
import {
  useAudioUpload,
  useGymPlan,
  useLadder,
  useLadderNext,
  useLadderSetLevel,
  useTranscriptionCreate,
  useTranscriptions,
} from "../lib/queries.ts";
import { currentSessionId } from "../session/store.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Card, Chip, EmptyState, PageHeader, Skeleton } from "../ui/kit/basics.tsx";
import { QueryView } from "../ui/kit/QueryState.tsx";
import { toast } from "../ui/kit/Toast.tsx";
import { DROP_COPY, fileProblem, PRIVACY_COPY, titleOf } from "./import.ts";
import { type LadderLevel, LEVEL_TITLE, ladderSummary, REALISM_TEXT } from "./ladder.ts";

const SOURCE_LABEL: Record<Transcription["sourceKind"], string> = {
  "own-audio": "your audio",
  "pd-song": "public-domain song",
  generated: "ladder",
};

const notBuilt = (e: unknown) => e instanceof OakApiError && e.code === "not_implemented";

/** Upload one file as an own-audio project and open it. */
function useImport() {
  const navigate = useNavigate();
  const upload = useAudioUpload();
  const create = useTranscriptionCreate();
  const [step, setStep] = useState<string | null>(null);
  const run = async (file: File) => {
    const problem = fileProblem(file);
    if (problem) {
      toast.error("Couldn't use that file", problem);
      return;
    }
    try {
      setStep("Reading the file");
      const bytes = await file.arrayBuffer();
      // Decoded here first: a file this browser cannot play never reaches the store.
      const oak = await getOak();
      await oak.ctx.decodeAudioData(bytes.slice(0));
      setStep("Keeping it on this device");
      const audio = await upload.mutateAsync({
        query: { name: file.name.slice(0, 255) },
        body: new Blob([bytes], { type: file.type || "application/octet-stream" }),
        contentType: file.type || "application/octet-stream",
      });
      const t = await create.mutateAsync({
        body: {
          sourceKind: "own-audio",
          audioId: audio.id,
          songId: null,
          title: titleOf(file.name),
          artist: null,
          ladderLevel: null,
          templateId: null,
        },
      });
      void navigate({ to: "/transcribe/$projectId", params: { projectId: t.id } });
    } catch (e) {
      const msg =
        e instanceof DOMException || (e instanceof Error && /decode/i.test(e.message))
          ? "This browser can't read that file as audio. Try WAV, MP3 or FLAC."
          : e instanceof Error
            ? e.message
            : String(e);
      toast.error("Couldn't add that file", msg);
    } finally {
      setStep(null);
    }
  };
  return { run, step };
}

function ImportCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const imp = useImport();
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void imp.run(f);
  };
  return (
    <Card
      className={clsx("flex flex-col gap-3 p-4 transition-colors", over && "border-accent bg-lane-in")}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      data-testid="import"
    >
      <div className="flex items-start gap-3">
        <AudioWaveform aria-hidden className="mt-0.5 size-5 shrink-0 text-text-3" />
        <div className="min-w-0">
          <h2 className="text-h3">Your own audio</h2>
          <p className="mt-0.5 text-sm text-text-2">
            Slow a song down, loop a bar, and write what you hear. You judge it yourself with a checklist.
          </p>
        </div>
      </div>
      <div
        className={clsx(
          "flex flex-col items-center gap-2 rounded-control border border-dashed px-4 py-5 text-center",
          over ? "border-accent" : "border-border",
        )}
      >
        <p className="text-sm text-text-2">{DROP_COPY}</p>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.wav,.flac,.mp3,.m4a,.ogg,.aif,.aiff"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-testid="file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void imp.run(f);
          }}
        />
        <Button
          variant="secondary"
          loading={imp.step !== null}
          icon={<Upload aria-hidden className="size-4" />}
          onClick={() => fileRef.current?.click()}
          data-testid="pick-file"
        >
          {imp.step ?? "Choose a file — from your own audio"}
        </Button>
      </div>
      <p className="text-sm text-text-3">{PRIVACY_COPY}</p>
    </Card>
  );
}

function LadderCard() {
  const ladder = useLadder();
  const next = useLadderNext();
  const setLevel = useLadderSetLevel();
  const navigate = useNavigate();
  const start = async (level?: LadderLevel) => {
    try {
      const item = await next.mutateAsync({
        body: { sessionId: currentSessionId(), gymId: null, ...(level ? { level } : {}) },
      });
      void navigate({ to: "/transcribe/$projectId", params: { projectId: item.itemId } });
    } catch (e) {
      toast.error(
        "Couldn't make a ladder item",
        notBuilt(e)
          ? "The ladder isn't available on this server yet."
          : e instanceof Error
            ? e.message
            : undefined,
      );
    }
  };
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="ladder-card">
      <div className="flex items-start gap-3">
        <Dumbbell aria-hidden className="mt-0.5 size-5 shrink-0 text-text-3" />
        <div className="min-w-0">
          <h2 className="text-h3">The ladder</h2>
          <p className="mt-0.5 text-sm text-text-2">
            Short loops Oak generates and grades exactly: drums, then bass lines, four-chord loops and
            melodies.
          </p>
        </div>
      </div>
      {ladder.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : ladder.isError ? (
        <p className="text-sm text-text-2" data-testid="ladder-unavailable">
          {notBuilt(ladder.error)
            ? "The ladder isn't available on this server yet."
            : "The ladder couldn't be read. It will be back when the server answers."}
        </p>
      ) : (
        <LadderStatus
          s={ladder.data}
          busy={next.isPending}
          onNext={(l) => void start(l)}
          onLevelUp={(to) =>
            setLevel.mutate(
              { body: { level: to } },
              {
                onSuccess: () =>
                  toast.success(`Level ${to}: ${LEVEL_TITLE[to as LadderLevel]}`, "Items start clean (R0)."),
              },
            )
          }
        />
      )}
    </Card>
  );
}

function LadderStatus({
  s,
  busy,
  onNext,
  onLevelUp,
}: {
  s: LadderState;
  busy: boolean;
  onNext(level?: LadderLevel): void;
  onLevelUp(to: number): void;
}) {
  const level = s.level as LadderLevel;
  const lower = ([1, 2, 3, 4] as const).filter((l) => l < level);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm" data-testid="ladder-summary">
        {ladderSummary(s)}
      </p>
      <p className="text-sm text-text-3">{REALISM_TEXT[s.realism]}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" loading={busy} onClick={() => onNext()} data-testid="ladder-next">
          Next item · L{level}
        </Button>
        {s.levelUp ? (
          <Button
            icon={<ArrowUp aria-hidden className="size-4" />}
            onClick={() => onLevelUp(s.levelUp?.to ?? level)}
          >
            Move up to L{s.levelUp.to}
          </Button>
        ) : null}
        {lower.length > 0 ? (
          <span className="flex items-center gap-1 text-sm text-text-2">
            Practise
            {lower.map((l) => (
              <Button key={l} size="sm" variant="ghost" onClick={() => onNext(l)}>
                L{l}
              </Button>
            ))}
          </span>
        ) : null}
      </div>
      {s.levelUp ? <p className="text-sm text-text-2">{s.levelUp.reason}</p> : null}
    </div>
  );
}

function GymLine({ plan }: { plan: GymPlan }) {
  if (!plan.active || !plan.next) return null;
  const n = plan.next;
  const what =
    n.kind === "ladder"
      ? `a ladder session at L${n.ladderLevel ?? 1}, R${n.realism ?? 0}`
      : n.ownAudioFallback
        ? `a ladder session one realism level up (no recording of yours yet)`
        : "your own audio";
  return (
    <p className="text-sm text-text-2" data-testid="gym-line">
      Next in the Transcription Gym: {n.gymId}, {what}.{" "}
      {plan.slotDue
        ? "It's due in today's session."
        : `${Math.max(0, 4 - plan.sinceLast)} more sessions until it's due.`}
    </p>
  );
}

export function ProjectList() {
  const list = useTranscriptions();
  const gym = useGymPlan();
  return (
    <>
      <PageHeader title="Transcribe" sub="Hear it, write it in code, compare with A/B." />
      {gym.data ? (
        <div className="mb-4">
          <GymLine plan={gym.data} />
        </div>
      ) : null}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <LadderCard />
        <ImportCard />
      </div>
      <h2 className="mb-3 text-h3">Projects</h2>
      <QueryView
        query={list}
        isEmpty={(d) => d.items.length === 0}
        empty={
          <EmptyState icon={<AudioWaveform aria-hidden />} title="No projects yet">
            Start a ladder item, or bring a recording of your own: it stays on this device.
          </EmptyState>
        }
      >
        {(d) => (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="projects">
            {[...d.items]
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map((t) => (
                <li key={t.id}>
                  <Link
                    to="/transcribe/$projectId"
                    params={{ projectId: t.id }}
                    className="block rounded-card"
                    data-testid="project-link"
                  >
                    <Card interactive className="flex h-full flex-col gap-1 p-4">
                      <span className="truncate font-medium">{t.title}</span>
                      <span className="text-sm text-text-2">
                        {[t.artist, formatKey(t.key), t.bpm ? `${Math.round(t.bpm)} BPM` : null]
                          .filter(Boolean)
                          .join(" · ") || "Tempo not set yet"}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <Chip>{SOURCE_LABEL[t.sourceKind]}</Chip>
                        {t.ladderLevel ? <Chip>L{t.ladderLevel}</Chip> : null}
                        {t.gradedPass ? (
                          <Chip tone="accent">passed</Chip>
                        ) : (
                          <Chip tone={t.status === "done" ? "accent" : "neutral"}>
                            {t.status === "done" ? "done" : "in progress"}
                          </Chip>
                        )}
                        <span className="ml-auto text-sm text-text-3">{formatDate(t.updatedAt, true)}</span>
                      </span>
                    </Card>
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </QueryView>
    </>
  );
}
