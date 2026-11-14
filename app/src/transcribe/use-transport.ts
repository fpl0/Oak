// The project's transport, built once per project: own audio (fetch, decode on this machine, the stretch
// engine on Oak's one AudioContext) or a pattern source (the stimulus events as hidden code in a hidden pattern
// player, at the item's realism). The saved player settings come back on open and are remembered as they change.
import type { TranscriptionDetail, TranscriptionSettings } from "@oak/api";
import { DEFAULT_TRANSCRIPTION_SETTINGS, OakApiError } from "@oak/api";
import type { LintContext } from "@oak/content-kit";
import { useEffect, useRef, useState } from "react";
import { getOak } from "../lib/oak.ts";
import { audioUrl, useTranscriptionSettings } from "../lib/queries.ts";
import { createSourceEngine, decodeAudio } from "./engine.ts";
import type { BarGrid } from "./grid.ts";
import { type LadderLevel, REALISM_TARGET } from "./ladder.ts";
import { stimulusCode } from "./stimulus-code.ts";
import {
  createAudioTransport,
  createPatternTransport,
  type TranscribeTransport,
  type TransportState,
} from "./transport.ts";

export type TransportLoad =
  | { kind: "loading"; step: string }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      transport: TranscribeTransport;
      buffer: AudioBuffer | null;
      /** Own audio: which engine plays the file (the Wave 4 stretch player, or the Wave 1 fallback). */
      engine: "stretch" | "transcription" | null;
    };

/** Builds the transport for a project and tears it down on leave. */
export function useTranscribeTransport(
  project: TranscriptionDetail,
  grid: BarGrid | null,
  /** Bumped by "Try again" after an error. */
  attempt = 0,
): TransportLoad {
  const [load, setLoad] = useState<TransportLoad>({ kind: "loading", step: "Waking sound" });
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const projectId = project.id;
  const stimulusKey = project.stimulus ? `${project.stimulus.bars}:${project.stimulus.events.length}` : "";

  useEffect(() => {
    let live = true;
    let made: TranscribeTransport | null = null;
    setLoad({ kind: "loading", step: "Waking sound" });
    const abort = new AbortController();
    (async () => {
      const oak = await getOak();
      const s: TranscriptionSettings = { ...DEFAULT_TRANSCRIPTION_SETTINGS, ...project.settings };
      if (project.player === "audio") {
        if (!project.audioId) throw new Error("This project has no audio file.");
        setLoad({ kind: "loading", step: "Reading your audio file" });
        const buffer = await decodeAudio(oak.ctx, audioUrl(project.audioId), abort.signal);
        if (!live) return;
        setLoad({ kind: "loading", step: "Starting the player" });
        const engine = await createSourceEngine(oak.ctx, oak.master.input, buffer);
        if (!live) {
          engine.dispose();
          return;
        }
        made = createAudioTransport({
          engine,
          createMine: () => oak.createPatternPlayer(),
          timeOfCycle: (c) => oak.transport.timeOfCycle(c),
          cycle: () => oak.transport.cycle(),
          now: () => oak.ctx.currentTime,
          grid: gridRef.current,
          lint: playLint(project),
          coordinator: oak.coordinator,
        });
        made.setRate(s.rate);
        made.setSemitones(s.semitones);
        made.setCents(s.fineTuneCents ?? project.fineTuneCents);
        if (s.loop) made.setLoop(s.loop);
        setLoad({ kind: "ready", transport: made, buffer, engine: engine.impl });
        return;
      }
      const st = project.stimulus;
      if (!st) throw new Error("This item has nothing to play yet. Try opening it again.");
      setLoad({ kind: "loading", step: "Loading the sounds" });
      await oak.preload({ sounds: st.preload.map((name) => ({ s: name })) }).catch(() => undefined);
      const { realismSpec } = await import("@oak/strudel");
      const level = Math.max(0, Math.min(4, project.realism ?? 0)) as 0 | 1 | 2 | 3 | 4;
      made = await createPatternTransport({
        player: oak.createPatternPlayer(),
        ref: stimulusCode(st.events, st.bars),
        bars: st.bars,
        cps: st.cps,
        realism: realismSpec(level, {
          seed: hashSeed(projectId),
          // The generator's own hints when the server has them (swing on jazz-soul comping at R2, the vocal lead
          // it picked at R4); the level's target part otherwise.
          target: st.performance?.target ?? REALISM_TARGET[(project.ladderLevel ?? 1) as LadderLevel] ?? null,
          ...(st.performance?.swung ? { swung: true } : {}),
          ...(st.performance?.vocalLead ? { vocalLead: st.performance.vocalLead } : {}),
        }),
        lint: playLint(project),
      });
      if (!live) {
        made.dispose();
        return;
      }
      made.setRate(s.rate);
      made.setSemitones(s.semitones);
      if (s.loop) made.setLoop(s.loop);
      setLoad({ kind: "ready", transport: made, buffer: null, engine: null });
    })().catch((e: unknown) => {
      if (!live) return;
      setLoad({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    });
    return () => {
      live = false;
      abort.abort();
      made?.dispose();
    };
  }, [projectId, project.player, project.audioId, stimulusKey, attempt]);

  useEffect(() => {
    if (load.kind === "ready") load.transport.setGrid(grid);
  }, [load, grid?.barSec, grid?.downbeatS]);

  return load;
}

/**
 * The hidden players lint as Studio does: nothing in the learner's code or the rebuilt reference is ever blocked
 * from being heard (a locked tool or an unusual label is a hint there, never an error).
 */
function playLint(p: TranscriptionDetail): LintContext {
  return { profile: "studio", unlocked: new Set(), allowPreview: true, meter: p.meter ?? "4/4", key: p.key };
}

function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The transport's state as React state. */
export function useTransportState(t: TranscribeTransport | null): TransportState | null {
  const [s, setS] = useState<TransportState | null>(t?.state ?? null);
  useEffect(() => (t ? t.subscribe(setS) : setS(null)), [t]);
  return s;
}

/**
 * Remembers rate, transposition, fine-tune and the loop (`transcriptions.putSettings`, debounced). A server
 * without the endpoint (501) is not an error the learner needs to see: the settings simply aren't kept.
 */
export function useRememberSettings(projectId: string, s: TransportState | null): void {
  const put = useTranscriptionSettings();
  const last = useRef<string | null>(null);
  const off = useRef(false);
  const key = s
    ? JSON.stringify({
        rate: s.rate,
        semitones: s.semitones,
        fineTuneCents: s.cents ?? 0,
        loop: s.loop ? { startS: round(s.loop.startS), endS: round(s.loop.endS) } : null,
      })
    : null;
  useEffect(() => {
    if (!key || off.current) return;
    if (last.current === null) {
      last.current = key;
      return;
    }
    if (key === last.current) return;
    const t = setTimeout(() => {
      last.current = key;
      put.mutate(
        { params: { id: projectId }, body: JSON.parse(key) as Partial<TranscriptionSettings> },
        {
          onError: (e) => {
            if (e instanceof OakApiError && e.code === "not_implemented") off.current = true;
          },
        },
      );
    }, 700);
    return () => clearTimeout(t);
  }, [key, projectId]);
}

const round = (x: number) => Math.round(x * 1000) / 1000;
