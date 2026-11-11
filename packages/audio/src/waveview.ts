// `@oak/audio/waveview`: the Transcription Studio's waveform, display only (architecture §6.8 step 4).
// wavesurfer 8 draws peaks (computed once, stored with PUT /api/audio/:id/peaks), A–B and section regions,
// a timeline and a logarithmic spectrogram up to 4 kHz; it never plays audio. The cursor follows the
// TranscriptionPlayer each animation frame; clicks and region drags drive the player.
// Kept out of the package's main entry so pages without a waveform never load wavesurfer.
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin, { type Region } from "wavesurfer.js/dist/plugins/regions.esm.js";
import SpectrogramPlugin from "wavesurfer.js/dist/plugins/spectrogram.esm.js";
import TimelinePlugin from "wavesurfer.js/dist/plugins/timeline.esm.js";
import ZoomPlugin from "wavesurfer.js/dist/plugins/zoom.esm.js";
import type { TranscriptionPlayer } from "./types.ts";

export interface WaveViewOptions {
  container: HTMLElement;
  player: TranscriptionPlayer;
  /** Interleaved [min, max, …] peaks of `computePeaks` (or the stored ones). */
  peaks: Float32Array;
  durationS: number;
  /**
   * The decoded audio, needed only for the spectrogram (it analyses samples, not peaks). Without it the
   * spectrogram is not shown.
   */
  audio?: AudioBuffer;
  spectrogram?: boolean;
  timeline?: boolean;
  height?: number;
  colors?: { wave?: string; progress?: string; cursor?: string; loop?: string; section?: string };
}

export interface SectionMarker {
  id: string;
  startS: number;
  endS: number;
  label: string;
}

export interface WaveView {
  readonly wavesurfer: WaveSurfer;
  /** Shows the A–B loop as a draggable region (or removes it). Dragging it calls `player.setLoop`. */
  setLoopRegion(loop: { startS: number; endS: number } | null): void;
  setSections(sections: readonly SectionMarker[]): void;
  zoom(pxPerSec: number): void;
  dispose(): void;
}

/** Splits interleaved [min, max, …] peaks into wavesurfer's one-channel max envelope. */
export function peaksForWaveSurfer(peaks: Float32Array): Float32Array {
  const out = new Float32Array(peaks.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.max(Math.abs(peaks[2 * i] as number), Math.abs(peaks[2 * i + 1] as number));
  }
  return out;
}

export function createWaveView(opts: WaveViewOptions): WaveView {
  const colors = opts.colors ?? {};
  const withSpectrogram = (opts.spectrogram ?? true) && opts.audio !== undefined;
  // The spectrogram analyses whatever wavesurfer holds as "decoded data": give it the samples then.
  const channel: Float32Array = withSpectrogram
    ? (opts.audio as AudioBuffer).getChannelData(0)
    : peaksForWaveSurfer(opts.peaks);
  const ws = WaveSurfer.create({
    container: opts.container,
    height: opts.height ?? 96,
    waveColor: colors.wave ?? "#8a8f98",
    progressColor: colors.progress ?? "#4a6b52",
    cursorColor: colors.cursor ?? "#c0392b",
    peaks: [channel],
    duration: opts.durationS,
    ...(withSpectrogram ? { sampleRate: (opts.audio as AudioBuffer).sampleRate } : {}),
    interact: true,
    normalize: true,
  });
  const regions = ws.registerPlugin(RegionsPlugin.create());
  if (opts.timeline ?? true) ws.registerPlugin(TimelinePlugin.create({ height: 16 }));
  ws.registerPlugin(ZoomPlugin.create({ scale: 0.25, maxZoom: 400 }));
  if (withSpectrogram) {
    ws.registerPlugin(
      SpectrogramPlugin.create({
        labels: true,
        height: 160,
        scale: "logarithmic",
        frequencyMax: 4000,
        fftSamples: 2048,
      }),
    );
  }

  const offs: (() => void)[] = [];
  // Display only: a click moves the player, never wavesurfer's own media.
  offs.push(ws.on("interaction", (t) => opts.player.seek(t)));
  let loopRegion: Region | null = null;
  const sections = new Map<string, Region>();
  offs.push(
    regions.on("region-updated", (r) => {
      if (r === loopRegion) opts.player.setLoop({ startS: r.start, endS: r.end });
    }),
  );
  // Regions added before wavesurfer knows the duration collapse to markers: wait for "ready".
  let ready = ws.getDuration() > 0;
  const pending: (() => void)[] = [];
  const whenReady = (fn: () => void) => (ready ? fn() : pending.push(fn));
  offs.push(
    ws.on("ready", () => {
      ready = true;
      for (const fn of pending.splice(0)) fn();
    }),
  );
  let raf = 0;
  const tick = () => {
    ws.setTime(opts.player.state.time);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    wavesurfer: ws,
    setLoopRegion(loop) {
      whenReady(() => setLoop(loop));
    },
    setSections(list) {
      whenReady(() => setSectionList(list));
    },
    zoom(pxPerSec) {
      whenReady(() => ws.zoom(pxPerSec));
    },
    dispose() {
      cancelAnimationFrame(raf);
      for (const off of offs) off();
      ws.destroy();
    },
  };

  function setLoop(loop: { startS: number; endS: number } | null): void {
    if (!loop) {
      loopRegion?.remove();
      loopRegion = null;
      return;
    }
    if (loopRegion) loopRegion.setOptions({ start: loop.startS, end: loop.endS });
    else {
      loopRegion = regions.addRegion({
        id: "ab-loop",
        start: loop.startS,
        end: loop.endS,
        drag: true,
        resize: true,
        color: colors.loop ?? "rgba(74, 107, 82, 0.25)",
      });
    }
  }
  function setSectionList(list: readonly SectionMarker[]): void {
    for (const r of sections.values()) r.remove();
    sections.clear();
    for (const s of list) {
      sections.set(
        s.id,
        regions.addRegion({
          id: s.id,
          start: s.startS,
          end: s.endS,
          drag: false,
          resize: false,
          content: s.label,
          color: colors.section ?? "rgba(138, 143, 152, 0.12)",
        }),
      );
    }
  }
}
