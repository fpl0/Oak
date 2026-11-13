// The song beside the code (contracts §6.6 X1: "worked phrase by phrase with A/B"): Oak's rendition of the chosen
// song as a pattern source, through Transcribe's public pieces — its pattern transport (one pattern with the
// learner's code, A/B as a mute switch, rate, transposition, the A–B loop in bars), its bar timeline and its
// transport controls and keys (ux §7.10 "Transcription"). The answer key is played, never shown.
import type { SongDef } from "@oak/api";
import { useEffect, useRef, useState } from "react";
import { getOak } from "../../lib/oak.ts";
import { loopOfBars, stepRate, stepSemitones } from "../../transcribe/grid.ts";
import { type TranscribeAction, transcribeBindings } from "../../transcribe/keys.ts";
import { BarTimeline } from "../../transcribe/SourceView.tsx";
import { REF_PREFIX, type StimulusCode } from "../../transcribe/stimulus-code.ts";
import { TransportControls } from "../../transcribe/TransportControls.tsx";
import { createPatternTransport, type TranscribeTransport } from "../../transcribe/transport.ts";
import { useTransportState } from "../../transcribe/use-transport.ts";
import { keyScope, useHotkeys } from "../../ui/keys/KeymapProvider.tsx";
import { Button } from "../../ui/kit/Button.tsx";
import { Skeleton } from "../../ui/kit/basics.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import { songCycles } from "./phrases.ts";

export type SongLayer = "melody" | "bass" | "chords";
const LABEL: Record<SongLayer, string> = { melody: "mel", bass: "bass", chords: "chords" };

/** The answer key's layers as one hidden pattern (`ref_mel: …`), each with a sound if its layer names none. */
export function songStimulus(song: Pick<SongDef, "answerKey">, layers: readonly SongLayer[]): StimulusCode {
  const lines: string[] = [];
  const tracks: string[] = [];
  for (const l of layers) {
    const code = song.answerKey.layers[l];
    if (!code) continue;
    const label = `${REF_PREFIX}${LABEL[l]}`;
    const sound = /\.s\(|\.sound\(/.test(code) ? "" : l === "bass" ? '.s("piano").gain(0.9)' : '.s("piano")';
    lines.push(`${label}: ${code}${sound}`);
    tracks.push(label);
  }
  return { code: lines.join("\n"), tracks };
}

export interface SongSourceHandle {
  loopBars(fromBar: number, bars: number): void;
  setMine(code: string): void;
}

export function SongSource({
  song,
  layers,
  code,
  onReady,
}: {
  song: SongDef;
  layers: readonly SongLayer[];
  /** The learner's code now (A/B compares with it). */
  code: string;
  onReady?(h: SongSourceHandle | null): void;
}) {
  const [load, setLoad] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; t: TranscribeTransport }
  >({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const cycles = songCycles(song);
  const layerKey = layers.join(",");
  const codeRef = useRef(code);
  codeRef.current = code;

  useEffect(() => {
    let live = true;
    let made: TranscribeTransport | null = null;
    setLoad({ kind: "loading" });
    (async () => {
      const oak = await getOak();
      await oak.preload({ sounds: [{ s: "piano" }] }).catch(() => undefined);
      made = await createPatternTransport({
        player: oak.createPatternPlayer(),
        ref: songStimulus(song, layerKey.split(",") as SongLayer[]),
        bars: cycles,
        cps: song.bpm / 60 / (song.meter === "3/4" ? 3 : song.meter === "2/4" ? 2 : 4),
        // The hidden player lints as the Studio does: the rendition's `ref_…` parts and anything the learner
        // writes are heard, never blocked (a locked tool is a hint there).
        lint: {
          profile: "studio",
          unlocked: new Set(),
          allowPreview: true,
          meter: song.meter,
          key: song.key,
        },
      });
      if (!live) {
        made.dispose();
        return;
      }
      void made.setMineCode(codeRef.current);
      setLoad({ kind: "ready", t: made });
    })().catch((e: unknown) => {
      if (live) setLoad({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    });
    return () => {
      live = false;
      made?.dispose();
    };
  }, [song, layerKey, cycles, attempt]);

  const transport = load.kind === "ready" ? load.t : null;
  const state = useTransportState(transport);

  useEffect(() => {
    if (!transport) {
      onReady?.(null);
      return;
    }
    const barSec = transport.state.durationS / Math.max(1, cycles);
    onReady?.({
      loopBars: (fromBar, bars) => transport.setLoop(loopOfBars({ downbeatS: 0, barSec }, fromBar, bars)),
      setMine: (c) => void transport.setMineCode(c),
    });
    return () => onReady?.(null);
  }, [transport, cycles, onReady]);

  const syncMine = () => transport?.setMineCode(codeRef.current);
  const act = (a: TranscribeAction) => {
    if (!transport || !state) return;
    switch (a) {
      case "play":
        if (!state.playing && state.side !== "source") void syncMine();
        void transport.toggle();
        return;
      case "loop":
        transport.setLoop(state.loop ? null : { startS: 0, endS: state.durationS / cycles });
        return;
      case "rateDown":
      case "rateUp":
        transport.setRate(stepRate(state.rate, a === "rateUp" ? 1 : -1));
        return;
      case "semiDown":
      case "semiUp":
        transport.setSemitones(stepSemitones(state.semitones, a === "semiUp" ? 1 : -1));
        return;
      case "abToggle":
        void syncMine()?.then(() => transport.setSide(transport.state.side === "source" ? "mine" : "source"));
        return;
      case "overlay":
        void syncMine()?.then(() => transport.setSide(transport.state.side === "both" ? "source" : "both"));
        return;
      default:
        return;
    }
  };
  const usable: readonly TranscribeAction[] = [
    "play",
    "loop",
    "rateDown",
    "rateUp",
    "semiDown",
    "semiUp",
    "abToggle",
    "overlay",
  ];
  useHotkeys(transcribeBindings(act, (a) => transport !== null && usable.includes(a)));

  if (load.kind === "error")
    return (
      <Callout
        tone="attention"
        title="The song didn't load"
        actions={
          <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        }
      >
        {load.message}
      </Callout>
    );
  if (!transport || !state)
    return (
      <div className="flex flex-col gap-2" role="status" aria-busy="true" aria-label="Loading the song">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[112px] w-full" />
      </div>
    );
  return (
    <section
      aria-label="The song"
      className="flex flex-col gap-2"
      data-testid="song-source"
      {...keyScope("transcription")}
    >
      <TransportControls
        onPlay={() => act("play")}
        onSide={(side) => void syncMine()?.then(() => transport.setSide(side))}
        state={state}
        grid={null}
        onRate={(d) => transport.setRate(stepRate(transport.state.rate, d))}
        onSemitones={(d) => transport.setSemitones(stepSemitones(transport.state.semitones, d))}
        onCents={() => {}}
        onToggleLoop={() => act("loop")}
        onSetPoint={() => {}}
      />
      <BarTimeline transport={transport} state={state} bars={cycles} pickup={song.pickup !== undefined} />
    </section>
  );
}
