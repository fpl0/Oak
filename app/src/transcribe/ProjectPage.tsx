// One transcription project (ux §9 Transcription Studio; contracts §6.12): the source on top (own audio as a
// waveform, a ladder item as a bar timeline), the transport (play, speed 25–100 %, transpose, fine-tune, the A–B
// loop, Source · Mine · Both), and below it the learner's Workbench beside the item's panel — a ladder item's
// givens, stages and Check, or own audio's bars, sections, notes and checklist. Keyboard-first (keys.ts).
import type { LadderSubmitResult, TranscriptionDetail } from "@oak/api";
import type { KeySpec, MeterId } from "@oak/content-kit";
import type { EvalOutcome } from "@oak/strudel";
import { tempoLine } from "@oak/theory";
import { Link, useNavigate } from "@tanstack/react-router";
import { AudioLines, ChevronLeft, MessageSquareText, Mic, Save, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.ts";
import { formatDate, formatKey } from "../lib/format.ts";
import { usePageTitle } from "../lib/nav.ts";
import {
  useTranscriptionAddVersion,
  useTranscriptionDelete,
  useTranscriptionPatch,
  useTranscriptions,
} from "../lib/queries.ts";
import { useUnlockedSet } from "../lib/unlocked.ts";
import { appWorkbenchServices } from "../lib/workbench-services.ts";
import { currentSessionId } from "../session/store.ts";
import { studioLint } from "../studio/model.ts";
import {
  askTranscriptionReview,
  clearSubject,
  openTutor,
  patchSubject,
  registerTutorHost,
  setSubject,
} from "../tutor/context.ts";
import { ReviewCards } from "../tutor/ReviewCard.tsx";
import { useSubjectHarmony } from "../tutor/use-subject-harmony.ts";
import { IS_MAC, keyScope, useHotkeys } from "../ui/keys/KeymapProvider.tsx";
import { formatKeys } from "../ui/keys/keymap.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Card, Chip, Kbd, Skeleton } from "../ui/kit/basics.tsx";
import { Callout } from "../ui/kit/Controls.tsx";
import { toast } from "../ui/kit/Toast.tsx";
import { useThemeName } from "../ui/theme/use-theme-name.ts";
import { useVoice } from "../voice/use-voice.ts";
import "../workbench/index.ts";
import { ServicesGate } from "../workbench/ServicesGate.tsx";
import { Workbench } from "../workbench/Workbench.tsx";
import {
  addTap,
  bpmFromTaps,
  downbeatFromTaps,
  gridOf,
  type Loop,
  loopOf,
  loopOfBars,
  setLoopPoint,
  shiftLoop,
  stepBar,
  stepCents,
  stepRate,
  stepSemitones,
  TAPS_KEPT,
} from "./grid.ts";
import { HumDialog } from "./HumDialog.tsx";
import type { HumTarget } from "./hum.ts";
import { PRIVACY_COPY } from "./import.ts";
import { type TranscribeAction, transcribeBindings } from "./keys.ts";
import { givenOfProject, LadderPanel } from "./LadderPanel.tsx";
import { type LadderLevel, starterCode } from "./ladder.ts";
import { ChecklistCard, NotesCard, SectionsCard, TempoCard } from "./OwnAudioPanel.tsx";
import { BarTimeline, type Section, Waveform } from "./SourceView.tsx";
import { TransportControls } from "./TransportControls.tsx";
import { useRememberSettings, useTranscribeTransport, useTransportState } from "./use-transport.ts";

const SOURCE_LABEL = {
  "own-audio": "your audio",
  "pd-song": "public-domain song",
  generated: "ladder",
} as const;
const ZOOMS = [0, 100, 200, 400, 800] as const;
/**
 * The spectrogram analyses every sample of the file in one go on the page's thread: about 0.17 s of a frozen page
 * per minute of audio (a 40-minute file froze it for 7 s). Longer recordings show the waveform only.
 */
export const SPECTROGRAM_MAX_SEC = 8 * 60;

function ownAudioStarter(p: TranscriptionDetail): string {
  const bpm = Math.round(p.bpm ?? 90);
  const key: KeySpec = p.key ?? { tonic: "C", mode: "major" };
  const meter = (p.meter ?? "4/4") as MeterId;
  return `${tempoLine(bpm, meter)}\n// ${p.title} · ${formatKey(key)}\n\nmelody: n("0").scale("${key.tonic}4:${key.mode.replace(/ /g, ":")}").s("piano")\n`;
}

/**
 * `inSession`: the project runs as a gym session's New block (session/host/GymBlock.tsx). The session keeps its
 * own page title, and the way back to the list and Delete stay out of the session (both are on /transcribe).
 */
export function ProjectPage({
  project,
  inSession = false,
}: {
  project: TranscriptionDetail;
  inSession?: boolean;
}) {
  const id = project.id;
  const pattern = project.player === "pattern";
  const level = (project.ladderLevel ?? 1) as LadderLevel;
  const navigate = useNavigate();
  const theme = useThemeName();
  const voice = useVoice();
  const { unlocked } = useUnlockedSet();
  const patch = useTranscriptionPatch();
  const addVersion = useTranscriptionAddVersion();
  const del = useTranscriptionDelete();
  usePageTitle(inSession ? "Session" : project.title);

  // --- the bar grid and the transport ------------------------------------------------------------------
  const given = useMemo(() => givenOfProject(project), [project]);
  const grid = pattern
    ? project.stimulus
      ? { downbeatS: 0, barSec: 1 / project.stimulus.cps }
      : null
    : gridOf(project.bpm, project.meter, project.downbeatS);
  const [attempt, setAttempt] = useState(0);
  const load = useTranscribeTransport(project, pattern ? null : grid, attempt);
  const transport = load.kind === "ready" ? load.transport : null;
  const state = useTransportState(transport);
  useRememberSettings(id, state);

  // The playhead between the engine's position updates (tap tempo needs better than 50 ms).
  // Read from the transport itself (not React state): keys pressed in quick succession see every change.
  const stamp = useRef({ t: 0, at: 0 });
  useEffect(
    () =>
      transport?.subscribe((s) => {
        if (s.time !== stamp.current.t) stamp.current = { t: s.time, at: performance.now() };
      }),
    [transport],
  );
  const timeNow = useCallback(() => {
    const s = transport?.state;
    if (!s) return 0;
    if (!s.playing) return s.time;
    return Math.min(s.durationS, stamp.current.t + ((performance.now() - stamp.current.at) / 1000) * s.rate);
  }, [transport]);

  // --- the learner's code ----------------------------------------------------------------------------
  const latest = project.versions.at(-1) ?? null;
  const [seed, setSeed] = useState(() => ({
    code: latest?.code ?? (pattern ? starterCode(level, given) : ownAudioStarter(project)),
    n: 0,
  }));
  const live = useRef(seed.code);
  const lastRunOk = useRef<string | null>(null);
  const draftCode = useRef<string | null>(null);
  const [savedVersion, setSavedVersion] = useState(project.currentVersion);
  useEffect(() => {
    if (transport) void transport.setMineCode(live.current);
  }, [transport]);
  const onChange = useCallback((code: string) => {
    live.current = code;
  }, []);
  const onEvaluated = useCallback(
    (o: EvalOutcome) => {
      if (!o.ok) return;
      lastRunOk.current = o.code;
      void transport?.setMineCode(o.code);
    },
    [transport],
  );
  // Before anything plays "mine", the transport hears the code as it is now.
  const syncMine = () => transport?.setMineCode(live.current);

  const saveVersion = async () => {
    const code = live.current;
    try {
      const r = await addVersion.mutateAsync({
        params: { id },
        body: {
          sessionId: currentSessionId(),
          code,
          result: null,
          ranOk: lastRunOk.current === code,
          machineDraft: draftCode.current === code,
        },
      });
      setSavedVersion(r.currentVersion);
      toast.success(`Saved v${r.currentVersion}`);
    } catch (e) {
      toast.error("Couldn't save the version", e instanceof Error ? e.message : undefined);
    }
  };

  // --- the tutor's subject: this project (code only; never the audio) -------------------------------
  const thread = useMemo(() => ({ subjectKind: "transcription" as const, subjectId: id }), [id]);
  useEffect(() => {
    setSubject({
      thread,
      title: project.title,
      tutorOpen: true,
      code: live.current,
      key: project.key,
      ...(savedVersion > 0 ? { transcriptionVersion: savedVersion } : {}),
    });
    return () => clearSubject(thread);
  }, [thread, project.title]);
  useEffect(() => {
    if (savedVersion > 0) patchSubject(thread, { transcriptionVersion: savedVersion });
  }, [thread, savedVersion]);
  const onModel = useSubjectHarmony(thread);
  const requestReview = () => {
    const r = askTranscriptionReview({
      projectId: id,
      title: project.title,
      code: live.current,
      ...(savedVersion > 0 ? { version: savedVersion } : {}),
    });
    if (!r.ok) openTutor();
  };
  const [lastResult, setLastResult] = useState<LadderSubmitResult | null>(null);
  useEffect(() => {
    if (lastResult) patchSubject(thread, { lastResult: lastResult.result, code: live.current });
  }, [lastResult, thread]);
  useEffect(
    () =>
      registerTutorHost({
        thread,
        showBars: (from, to) => {
          if (grid && transport) transport.setLoop(loopOfBars(grid, from - 1, to - from + 1));
        },
      }),
    [thread, transport, grid?.barSec, grid?.downbeatS],
  );

  // --- source view ------------------------------------------------------------------------------------
  const [zoomAt, setZoomAt] = useState(0);
  const [spectrogramOn, setSpectrogram] = useState(false);
  const tooLongForSpectrogram =
    load.kind === "ready" && load.buffer !== null && load.buffer.duration > SPECTROGRAM_MAX_SEC;
  const spectrogram = spectrogramOn && !tooLongForSpectrogram;
  const sections: Section[] = project.regions
    .filter((r) => r.kind === "section")
    .map((r) => ({ id: r.id, label: r.label, startS: r.startS, endS: r.endS }));
  const saveRegions = (next: typeof project.regions) =>
    patch.mutate(
      { params: { id }, body: { regions: next } },
      { onError: (e) => toast.error("Couldn't save the sections", e.message) },
    );

  const [pendingA, setPendingA] = useState<number | null>(null);

  // --- tap tempo ----------------------------------------------------------------------------------------
  const [taps, setTapsState] = useState<number[]>([]);
  const tapsRef = useRef<number[]>([]);
  const setTaps = (next: number[]) => {
    tapsRef.current = next;
    setTapsState(next);
  };
  const applyGrid = (p: { bpm?: number; downbeatS?: number; meter?: MeterId; key?: KeySpec | null }) =>
    patch.mutate(
      { params: { id }, body: p },
      { onError: (e) => toast.error("Couldn't save the tempo", e.message) },
    );
  const tap = () => {
    if (!transport?.state.playing) {
      void transport?.play();
      toast.info("Tap T on each beat", "Start on a bar's first beat; eight taps set the bars.");
      return;
    }
    const next = addTap(tapsRef.current, timeNow());
    setTaps(next);
    if (next.length === TAPS_KEPT) {
      const bpm = bpmFromTaps(next);
      const down = downbeatFromTaps(next);
      if (bpm !== null && down !== null) {
        applyGrid({ bpm, downbeatS: down, ...(project.meter ? {} : { meter: "4/4" }) });
        toast.success(`Bars set: ${Math.round(bpm)} BPM`, "Bar lines are on the waveform now.");
        setTaps([]);
      }
    }
  };

  // --- hum it -------------------------------------------------------------------------------------------
  const [humOpen, setHumOpen] = useState(false);
  const humTarget: HumTarget = pattern && (level === 2 || level === 3) ? "bass" : "melody";
  const humPlan = {
    key: project.key ?? given.key ?? { tonic: "C", mode: "major" },
    bpm: project.bpm ?? given.bpm,
    meter: (project.meter ?? "4/4") as MeterId,
    bars: pattern ? given.bars : 4,
    target: humTarget,
  };
  const humAllowed = !(pattern && level === 1);

  // --- keys -------------------------------------------------------------------------------------------
  const act = (a: TranscribeAction) => {
    if (!transport) return;
    const state = transport.state;
    const dur = state.durationS;
    switch (a) {
      case "play":
        if (!state.playing && state.side !== "source") void syncMine();
        void transport.toggle();
        return;
      case "setA":
      case "setB": {
        const t = timeNow();
        // With no loop yet, [ marks A and ] closes the loop there; with a loop, each moves its own end.
        if (a === "setA" && !state.loop) {
          setPendingA(t);
          return;
        }
        const l =
          a === "setB" && pendingA !== null
            ? loopOf(pendingA, t, dur)
            : setLoopPoint(state.loop, a === "setA" ? "A" : "B", t, dur, grid);
        setPendingA(null);
        if (l) transport.setLoop(l);
        return;
      }
      case "loop":
        setPendingA(null);
        transport.setLoop(state.loop ? null : defaultLoop());
        return;
      case "rateDown":
      case "rateUp":
        transport.setRate(stepRate(state.rate, a === "rateUp" ? 1 : -1));
        return;
      case "semiDown":
      case "semiUp":
        transport.setSemitones(stepSemitones(state.semitones, a === "semiUp" ? 1 : -1));
        return;
      case "centsDown":
      case "centsUp":
        if (state.cents !== null) transport.setCents(stepCents(state.cents, a === "centsUp" ? 1 : -1));
        return;
      case "abToggle":
        void syncMine()?.then(() => transport.setSide(transport.state.side === "source" ? "mine" : "source"));
        return;
      case "overlay":
        void syncMine()?.then(() => transport.setSide(transport.state.side === "both" ? "source" : "both"));
        return;
      case "tap":
        tap();
        return;
      case "prevBar":
      case "nextBar":
        if (state.loop) transport.setLoop(shiftLoop(state.loop, grid, a === "nextBar" ? 1 : -1, dur));
        else if (grid && transport.canSeek)
          transport.seek(stepBar(grid, timeNow(), a === "nextBar" ? 1 : -1, dur));
        return;
      case "zoomIn":
      case "zoomOut":
        setZoomAt((z) => Math.max(0, Math.min(ZOOMS.length - 1, z + (a === "zoomIn" ? 1 : -1))));
        return;
      case "spectrogram":
        setSpectrogram((s) => !s);
        return;
    }
  };
  const defaultLoop = (): Loop | null => {
    if (!transport) return null;
    if (grid) {
      const bar = Math.max(0, Math.floor((timeNow() - grid.downbeatS) / grid.barSec));
      return loopOfBars(grid, bar, 1);
    }
    return setLoopPoint(null, "A", timeNow(), transport.state.durationS, null);
  };
  const enabled = (a: TranscribeAction) => {
    if (!transport) return false;
    if (a === "spectrogram" && tooLongForSpectrogram) return false;
    if (pattern && ["centsDown", "centsUp", "tap", "zoomIn", "zoomOut", "spectrogram"].includes(a))
      return false;
    if (pattern && (a === "prevBar" || a === "nextBar")) return transport.state.loop !== null;
    return true;
  };
  useHotkeys(transcribeBindings(act, enabled));
  useHotkeys(
    pattern
      ? []
      : [
          {
            id: "transcribe:save",
            keys: "Mod+S",
            scope: "transcription",
            group: "Transcribe",
            description: "Save a version of your code",
            allowInInput: true,
            run: () => void saveVersion(),
          },
        ],
  );

  // Keys act from the first moment: focus the page (not a control) once it is up.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (load.kind === "ready" && !root.current?.contains(document.activeElement)) root.current?.focus();
  }, [load.kind]);

  // Own audio: the recording goes with the project unless another project uses it (as Settings › Data does);
  // one native confirm names both (contracts §11.6).
  const all = useTranscriptions();
  const sharedWith = pattern
    ? 0
    : (all.data?.items ?? []).filter(
        (t) => t.id !== id && t.audioId !== null && t.audioId === project.audioId,
      ).length;
  const remove = async () => {
    const versions = `${project.versions.length} version${project.versions.length === 1 ? "" : "s"}`;
    const question = pattern
      ? `Delete the transcription “${project.title}” and its ${versions}? This cannot be undone.`
      : sharedWith > 0
        ? `Delete the transcription “${project.title}” and its ${versions}? The recording stays, because another project uses it. This cannot be undone.`
        : `Delete the transcription “${project.title}”, its ${versions} and its recording? This cannot be undone; a backup you exported earlier still has it.`;
    try {
      const r = await del.mutateAsync({ target: id, question, input: { params: { id } } });
      if (!r) return;
      if (!pattern && project.audioId && sharedWith === 0) {
        try {
          await api().destructive("audio.delete", project.audioId, { params: { id: project.audioId } });
        } catch (e) {
          toast.error(
            "The recording was kept",
            e instanceof Error ? `The project is deleted; its audio file stays: ${e.message}` : undefined,
          );
        }
      }
      void navigate({ to: "/transcribe" });
    } catch (e) {
      toast.error("Couldn't delete it", e instanceof Error ? e.message : undefined);
    }
  };

  const lessonCtx = {
    key: project.key ?? given.key,
    meter: (project.meter ?? "4/4") as MeterId,
    defaultBpm: Math.round(project.bpm ?? given.bpm),
    loopBars: pattern ? given.bars : 4,
  };
  const lint = studioLint(unlocked, lessonCtx.meter, lessonCtx.key);
  const sub = [
    SOURCE_LABEL[project.sourceKind],
    pattern ? `L${level} · R${project.realism ?? 0}` : null,
    project.key ? formatKey(project.key) : null,
    project.bpm ? `${Math.round(project.bpm)} BPM` : null,
    project.meter,
  ].filter(Boolean);

  return (
    <div
      ref={root}
      tabIndex={-1}
      {...keyScope("transcription")}
      className="@container relative mx-auto flex w-full max-w-[96rem] flex-col gap-3 px-6 py-4 outline-none"
      data-testid="transcribe-project"
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {inSession ? null : (
          <Link
            to="/transcribe"
            className="inline-flex items-center gap-1 rounded-control text-sm text-text-2 hover:text-text"
          >
            <ChevronLeft aria-hidden className="size-4" /> Transcribe
          </Link>
        )}
        <h1 className="min-w-0 truncate text-h2" data-testid="project-title">
          {project.title}
        </h1>
        <span className="flex flex-wrap gap-1">
          {sub.map((s) => (
            <Chip key={s as string}>{s}</Chip>
          ))}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {humAllowed ? (
            <Button
              icon={<Mic aria-hidden className="size-4" />}
              onClick={() => setHumOpen(true)}
              data-testid="hum-open"
            >
              Hum it
            </Button>
          ) : null}
          {pattern ? null : (
            <Button
              icon={<Save aria-hidden className="size-4" />}
              loading={addVersion.isPending}
              onClick={() => void saveVersion()}
              data-testid="save-version"
            >
              Save version <Kbd>{formatKeys("Mod+S", IS_MAC)}</Kbd>
            </Button>
          )}
          {inSession ? null : (
            <Button
              variant="ghost"
              icon={<Trash2 aria-hidden className="size-4" />}
              loading={del.isPending}
              onClick={() => void remove()}
            >
              Delete
            </Button>
          )}
        </div>
      </header>
      {pattern ? null : <p className="-mt-1 text-sm text-text-3">{PRIVACY_COPY}</p>}

      <Card
        className="flex flex-col gap-2 p-3"
        data-testid="source"
        data-engine={load.kind === "ready" ? (load.engine ?? "pattern") : undefined}
      >
        {load.kind === "loading" ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-[112px] w-full" />
            <p className="text-sm text-text-2">{load.step}…</p>
          </div>
        ) : load.kind === "error" ? (
          <Callout
            tone="issue"
            title="The source didn't load"
            actions={
              <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </Button>
            }
          >
            {load.message}
          </Callout>
        ) : state && transport ? (
          pattern ? (
            <BarTimeline
              transport={transport}
              state={state}
              bars={project.stimulus?.bars ?? given.bars}
              pickup={false}
            />
          ) : load.buffer ? (
            <>
              <Waveform
                transport={transport}
                state={state}
                buffer={load.buffer}
                grid={grid}
                sections={sections}
                zoom={ZOOMS[zoomAt] ?? 0}
                spectrogram={spectrogram}
                theme={theme}
              />
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ZoomOut aria-hidden className="size-4" />}
                  disabled={zoomAt === 0}
                  onClick={() => setZoomAt((z) => Math.max(0, z - 1))}
                  aria-label="Zoom out (<)"
                >
                  Out
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ZoomIn aria-hidden className="size-4" />}
                  disabled={zoomAt === ZOOMS.length - 1}
                  onClick={() => setZoomAt((z) => Math.min(ZOOMS.length - 1, z + 1))}
                  aria-label="Zoom in (>)"
                >
                  In
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<AudioLines aria-hidden className="size-4" />}
                  aria-pressed={spectrogram}
                  disabled={tooLongForSpectrogram}
                  aria-describedby={tooLongForSpectrogram ? "spectrogram-limit" : undefined}
                  onClick={() => setSpectrogram((s) => !s)}
                  data-testid="spectrogram"
                >
                  Spectrogram {spectrogram ? "on" : "off"} <Kbd>⇧S</Kbd>
                </Button>
                {tooLongForSpectrogram ? (
                  <span id="spectrogram-limit" className="text-text-3" data-testid="spectrogram-limit">
                    for recordings up to {SPECTROGRAM_MAX_SEC / 60} minutes
                  </span>
                ) : null}
                <span className="ml-auto text-text-3">
                  Drag across the waveform to loop it · <Kbd>[</Kbd> <Kbd>]</Kbd> set A and B · <Kbd>T</Kbd>{" "}
                  tap the beat
                </span>
              </div>
            </>
          ) : null
        ) : null}
      </Card>

      {state && transport ? (
        <TransportControls
          onPlay={() => act("play")}
          onSide={(side) => void syncMine()?.then(() => transport.setSide(side))}
          state={state}
          grid={grid}
          pendingA={pendingA}
          onRate={(d) => transport.setRate(stepRate(transport.state.rate, d))}
          onSemitones={(d) => transport.setSemitones(stepSemitones(transport.state.semitones, d))}
          onCents={(d) => act(d > 0 ? "centsUp" : "centsDown")}
          onToggleLoop={() => act("loop")}
          onSetPoint={(w) => act(w === "A" ? "setA" : "setB")}
        />
      ) : null}
      {state && pattern && !state.realismApplied ? (
        <p className="-mt-1 text-sm text-text-3" data-testid="realism-note">
          This item plays clean (R0) on this build; its arrangement is still the R{state.realism} one.
        </p>
      ) : null}

      <div className="grid gap-4 @min-[60rem]:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <ServicesGate load={appWorkbenchServices} auto>
            <Workbench
              key={seed.n}
              id={`tr${id.replace(/[^a-z0-9]/gi, "").slice(-10)}`}
              code={seed.code}
              lessonCtx={lessonCtx}
              lint={lint}
              views={["roll", "staff"]}
              onChange={onChange}
              onEvaluated={onEvaluated}
              onModel={onModel}
              tutorBars
            />
          </ServicesGate>
          <Card className="flex flex-col gap-2 p-4" data-testid="transcription-reviews">
            <h2 className="text-h3">Claude's reviews</h2>
            <ReviewCards
              subject={thread}
              empty={
                <div className="flex flex-col items-start gap-2 text-sm">
                  <p className="text-text-2">
                    {pattern
                      ? "No review yet. Claude reads your code and the check, never the hidden answer until you've solved it."
                      : "No review yet. Claude reads your code, your checklist and the title you gave it; never the recording."}
                  </p>
                  <Button
                    size="sm"
                    icon={<MessageSquareText aria-hidden className="size-4" />}
                    onClick={requestReview}
                    data-testid="request-transcription-review"
                  >
                    Ask Claude to review it
                  </Button>
                </div>
              }
            />
          </Card>
          {pattern ? null : (
            <Versions
              project={project}
              current={savedVersion}
              onOpen={(code) => {
                setSeed((s) => ({ code, n: s.n + 1 }));
                live.current = code;
                void transport?.setMineCode(code);
              }}
            />
          )}
        </div>
        <aside className="flex min-w-0 flex-col gap-3" aria-label={pattern ? "The item" : "Your recording"}>
          {pattern ? (
            <LadderPanel
              project={project}
              given={given}
              getCode={() => live.current}
              onResult={setLastResult}
            />
          ) : (
            <>
              <TempoCard
                project={project}
                grid={grid}
                taps={taps}
                onClearTaps={() => setTaps([])}
                onApply={applyGrid}
                getTime={timeNow}
              />
              <SectionsCard
                sections={sections}
                loop={state?.loop ?? null}
                onAdd={(label) => {
                  if (!state?.loop) return;
                  saveRegions([
                    ...project.regions,
                    {
                      id: `s${Date.now().toString(36)}`,
                      label,
                      startS: state.loop.startS,
                      endS: state.loop.endS,
                      kind: "section",
                    },
                  ]);
                }}
                onRemove={(sid) => saveRegions(project.regions.filter((r) => r.id !== sid))}
                onLoop={(s) => transport?.setLoop({ startS: s.startS, endS: s.endS })}
              />
              <ChecklistCard project={project} />
              <NotesCard project={project} />
            </>
          )}
        </aside>
      </div>

      <HumDialog
        open={humOpen}
        onClose={() => setHumOpen(false)}
        plan={humPlan}
        quiet={voice.quiet.quiet}
        code={live.current}
        onUse={(code) => {
          draftCode.current = code;
          live.current = code;
          setSeed((s) => ({ code, n: s.n + 1 }));
          void transport?.setMineCode(code);
          toast.info(
            "Oak's draft is in the editor",
            pattern
              ? "Fix what's off, then Check: a draft counts once you've checked it."
              : "Fix what's off, then save a version.",
          );
        }}
      />
    </div>
  );
}

function Versions({
  project,
  current,
  onOpen,
}: {
  project: TranscriptionDetail;
  current: number;
  onOpen(code: string): void;
}) {
  if (project.versions.length === 0) return null;
  return (
    <Card className="p-4" data-testid="versions">
      <h2 className="mb-2 text-h3">Versions</h2>
      <ol className="flex flex-col gap-1">
        {[...project.versions].reverse().map((v) => (
          <li key={v.version} className="flex items-center gap-2 text-sm">
            <span className="font-medium">v{v.version}</span>
            <span className="text-text-3">{formatDate(v.createdAt)}</span>
            {v.version === current ? <Chip>latest</Chip> : null}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onOpen(v.code)}>
              Open in the editor
            </Button>
          </li>
        ))}
      </ol>
    </Card>
  );
}
