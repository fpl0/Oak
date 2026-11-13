// Transcribe (contracts §11.9 naming; ux §9): the ladder (L1–L4 at the learner's level and realism, the next
// item, an offered level-up), the Transcription Gym's next session, the learner's own audio (drop or pick a
// file: checked and decoded here, stored by the local server, never sent anywhere), and every project.
import type { GymPlan, LadderSong, LadderState, Transcription } from "@oak/api";
import { AUDIO_UPLOAD_MAX_BYTES, OakApiError } from "@oak/api";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUp, AudioWaveform, Dumbbell, Lock } from "lucide-react";
import { useState } from "react";
import { formatDate, formatKey } from "../lib/format.ts";
import { getOak } from "../lib/oak.ts";
import {
  useAudioUpload,
  useGymPlan,
  useLadder,
  useLadderNext,
  useLadderSetLevel,
  useLadderSongs,
  useTranscriptionCreate,
  useTranscriptions,
} from "../lib/queries.ts";
import { currentSessionId } from "../session/store.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Card, Chip, EmptyState, PageHeader, Skeleton } from "../ui/kit/basics.tsx";
import { FileDropZone } from "../ui/kit/FileDropZone.tsx";
import { QueryView } from "../ui/kit/QueryState.tsx";
import { toast } from "../ui/kit/Toast.tsx";
import { AUDIO_ACCEPT, AUDIO_KINDS, fileProblem, PRIVACY_COPY, titleOf } from "./import.ts";
import { type LadderLevel, LEVEL_TITLE, ladderSummary, REALISM_TEXT } from "./ladder.ts";
import { rememberItem } from "./song.ts";

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
  const imp = useImport();
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="import">
      <div className="flex items-start gap-3">
        <AudioWaveform aria-hidden className="mt-0.5 size-5 shrink-0 text-text-3" />
        <div className="min-w-0">
          <h2 className="text-h3">Your own audio</h2>
          <p className="mt-0.5 text-sm text-text-2">
            Slow a song down, loop a bar, and write what you hear. You judge it yourself with a checklist.
          </p>
        </div>
      </div>
      <FileDropZone
        title="Bring a recording"
        hint="It stays on this device."
        accept={AUDIO_ACCEPT}
        kinds={AUDIO_KINDS}
        maxBytes={AUDIO_UPLOAD_MAX_BYTES}
        onFile={(f) => void imp.run(f)}
        busy={imp.step !== null}
        {...(imp.step ? { busyText: imp.step } : {})}
        buttonText="Choose your own audio…"
        data-testid="drop-zone"
      />
      <p className="text-sm text-text-3">{PRIVACY_COPY}</p>
    </Card>
  );
}

/** One song of the L5/L6 pool: what is passed, and Start or Continue (or why it is not open). */
function SongRow({ song, busy, onOpen }: { song: LadderSong; busy: boolean; onOpen(): void }) {
  const progress =
    song.level === 5
      ? `${song.passedPhrases.length} of ${song.phrases.length} phrases`
      : `${song.passedStages.length} of 3 stages`;
  const started = song.passedPhrases.length > 0 || song.passedStages.length > 0;
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm" data-testid="song-row">
      <span className="min-w-0 flex-1">
        <span className="font-medium">{song.title}</span>{" "}
        <span className="text-text-3">({song.year === "trad" ? "trad." : song.year})</span>
        <span className="block text-text-2">
          {song.status === "locked"
            ? song.level === 5
              ? `${song.phrases.length} phrases`
              : "Bass, changes, melody"
            : progress}
        </span>
      </span>
      {song.status === "locked" ? (
        <Chip>
          <Lock aria-hidden className="size-3" /> {song.lockedReason ?? "Locked"}
        </Chip>
      ) : song.status === "done" ? (
        <Chip tone="accent">done</Chip>
      ) : (
        <Button size="sm" loading={busy} onClick={onOpen}>
          {started ? "Continue" : "Start"}
        </Button>
      )}
    </li>
  );
}

/** L5/L6: the song pool (contracts §2.8) to pick from; locked and unchecked songs say why. */
function SongPicker({
  level,
  onOpen,
  busy,
}: {
  level: 5 | 6;
  onOpen(songId: string, level: 5 | 6): void;
  busy: boolean;
}) {
  const songs = useLadderSongs();
  if (songs.isPending) return <Skeleton className="h-20 w-full" />;
  if (songs.isError)
    return (
      <p className="text-sm text-text-2" data-testid="songs-unavailable">
        {notBuilt(songs.error)
          ? "Not built yet: this server can't list the songs."
          : "The songs couldn't be read."}
      </p>
    );
  const pool = songs.data.items.filter((s) => s.level === level);
  if (pool.length === 0)
    return (
      <p className="text-sm text-text-2">No songs at this level yet: their answer keys are being checked.</p>
    );
  return (
    <ul
      className="flex flex-col divide-y divide-border"
      aria-label={`Songs for L${level}`}
      data-testid="song-picker"
    >
      {pool.map((s) => (
        <SongRow key={s.songId} song={s} busy={busy} onOpen={() => onOpen(s.songId, s.level)} />
      ))}
    </ul>
  );
}

function LadderCard() {
  const ladder = useLadder();
  const next = useLadderNext();
  const setLevel = useLadderSetLevel();
  const navigate = useNavigate();
  const start = async (level?: LadderLevel, songId?: string) => {
    try {
      const item = await next.mutateAsync({
        body: {
          sessionId: currentSessionId(),
          gymId: null,
          ...(level ? { level } : {}),
          ...(songId ? { songId } : {}),
        },
      });
      rememberItem(item);
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
            Short loops Oak generates and grades exactly (drums, bass lines, four-chord loops, melodies), then
            songs: folk tunes phrase by phrase, and the blues in stages.
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
          onSong={(songId, l) => void start(l, songId)}
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
  onSong,
  onLevelUp,
}: {
  s: LadderState;
  busy: boolean;
  onNext(level?: LadderLevel): void;
  onSong(songId: string, level: 5 | 6): void;
  onLevelUp(to: number): void;
}) {
  const level = s.level as LadderLevel;
  const songLevel = level === 5 || level === 6;
  const lower = ([1, 2, 3, 4] as const).filter((l) => l < level);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm" data-testid="ladder-summary">
        {ladderSummary(s)}
      </p>
      <p className="text-sm text-text-3">{REALISM_TEXT[s.realism]}</p>
      {songLevel ? <SongPicker level={level} busy={busy} onOpen={onSong} /> : null}
      {level === 6 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-text-2">Folk songs (L5) to practise</summary>
          <SongPicker level={5} busy={busy} onOpen={onSong} />
        </details>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={songLevel ? "secondary" : "primary"}
          loading={busy}
          onClick={() => onNext()}
          data-testid="ladder-next"
        >
          {songLevel ? `Next song · L${level}` : `Next item · L${level}`}
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
