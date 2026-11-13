// The e2e page: exposes `window.oakAudioE2E` for the Playwright specs. Everything goes through the public
// API of @oak/audio and @oak/pitch exactly as the app will use it.
import {
  createMicGraph,
  createTranscriptionPlayer,
  type MicState,
  PITCH_WORKLET_URL,
  type TranscriptionPlayerState,
} from "@oak/audio";
import { createWaveView, type WaveView } from "@oak/audio/waveview";
import { createDetector, type PitchFrame } from "@oak/pitch";
import { concat, encodeWav16, silence, tone } from "@oak/pitch/synth";
import iifeWorklet from "./.generated/pitch.worklet.iife.js?raw";
import { wave4 } from "./wave4.ts";
import { wave5 } from "./wave5.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface MicRun {
  sampleRate: number;
  workletUrl: string;
  outputs: 0 | 1;
  states: MicState[];
  openedAt: number;
  frames: PitchFrame[];
  second: { openedAt: number; firstFrameT: number | null; frames: number };
  framesWhileClosed: number;
  errors: string[];
}

async function micRun(opts: { loader: "worker-url" | "blob"; seconds: number }): Promise<MicRun> {
  const errors: string[] = [];
  const ctx = new AudioContext();
  await ctx.resume();
  // Something audible on the same context, as in a sing step with a drone.
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = 329.63;
  const g = ctx.createGain();
  g.gain.value = 0.05;
  osc.connect(g).connect(ctx.destination);
  osc.start();

  const workletUrl =
    opts.loader === "blob"
      ? URL.createObjectURL(new Blob([iifeWorklet], { type: "text/javascript" }))
      : PITCH_WORKLET_URL;
  const graph = createMicGraph(ctx, { workletUrl });
  const states: MicState[] = [];
  graph.subscribe((s) => states.push(s));
  await graph.prepare();
  const s1 = await graph.open();
  const openedAt = ctx.currentTime;
  await sleep(opts.seconds * 1000);
  const frames = s1.frames();
  s1.close();
  // While closed, the processor idles: no frames reach anyone.
  let framesWhileClosed = 0;
  await sleep(300);
  const s2 = await graph.open();
  const secondOpenedAt = ctx.currentTime;
  let firstFrameT: number | null = null;
  s2.onFrame((f) => {
    firstFrameT ??= f.t;
  });
  await sleep(500);
  framesWhileClosed = s1.frames().length - frames.length;
  const second = { openedAt: secondOpenedAt, firstFrameT, frames: s2.frames().length };
  graph.closeAll();
  graph.dispose();
  osc.stop();
  await ctx.close();
  return {
    sampleRate: ctx.sampleRate,
    workletUrl,
    outputs: graph.outputs,
    states,
    openedAt,
    frames,
    second,
    framesWhileClosed,
    errors,
  };
}

export interface StretchRun {
  sampleRate: number;
  durationS: number;
  /** [context time, file position] from the position events. */
  positions: [number, number][];
  playStart: number;
  /** Median detected output frequency in each phase. */
  hz: { normal: number; octaveUp: number; fineTune: number };
  states: TranscriptionPlayerState[];
}

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[s.length >> 1] as number) : Number.NaN;
}

async function stretchRun(): Promise<StretchRun> {
  const ctx = new AudioContext();
  await ctx.resume();
  // The "learner's recording": a generated WAV, 4 s of 440 Hz with a short silence at the start.
  const sr = 44100;
  const wav = encodeWav16(
    concat([silence(0.05, sr), tone({ hz: 440, seconds: 3.95, sampleRate: sr, amp: 0.5 })]),
    sr,
  );
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 4096;
  analyser.connect(ctx.destination);
  const player = await createTranscriptionPlayer(ctx, analyser);
  const states: TranscriptionPlayerState[] = [];
  const positions: [number, number][] = [];
  player.subscribe((s) => {
    states.push(s);
    if (s.playing) positions.push([ctx.currentTime, s.time]);
  });
  const { durationS } = await player.load(wav.buffer.slice(0) as ArrayBuffer);
  player.setRate(0.75);
  player.setLoop({ startS: 1, endS: 2 });
  const detector = createDetector({ windowSize: 4096 });
  const buf = new Float32Array(analyser.fftSize);
  const listen = async (ms: number): Promise<number> => {
    const hz: number[] = [];
    const until = performance.now() + ms;
    while (performance.now() < until) {
      await sleep(60);
      analyser.getFloatTimeDomainData(buf);
      const r = detector.detect(buf, ctx.sampleRate);
      if (r.clarity >= 0.9) hz.push(r.hz);
    }
    return medianOf(hz);
  };
  const playStart = ctx.currentTime + 0.1;
  await player.play({ fromS: 0.5, at: playStart });
  const normal = await listen(3500);
  player.setSemitones(12);
  await sleep(300);
  const octaveUp = await listen(800);
  player.setSemitones(0);
  player.setFineTuneCents(50);
  await sleep(300);
  const fineTune = await listen(800);
  player.pause();
  player.dispose();
  await ctx.close();
  return {
    sampleRate: ctx.sampleRate,
    durationS,
    positions,
    playStart,
    hz: { normal, octaveUp, fineTune },
    states,
  };
}

/** Mounts the wavesurfer view for a 4 s file; the spec clicks it and reads the player back. */
let wave: {
  view: WaveView;
  player: Awaited<ReturnType<typeof createTranscriptionPlayer>>;
  ctx: AudioContext;
} | null = null;
async function waveMount(): Promise<{ duration: number; regions: number; canvases: number }> {
  const ctx = new AudioContext();
  const sr = 44100;
  const wav = encodeWav16(
    concat([tone({ hz: 220, seconds: 2, sampleRate: sr, amp: 0.6 }), silence(2, sr)]),
    sr,
  );
  const player = await createTranscriptionPlayer(ctx, ctx.destination);
  const { durationS } = await player.load(wav.buffer.slice(0) as ArrayBuffer);
  const container = document.createElement("div");
  container.id = "wave";
  container.style.width = "800px";
  document.body.append(container);
  const view = createWaveView({
    container,
    player,
    peaks: player.peaks(100),
    durationS,
    ...(player.buffer ? { audio: player.buffer } : {}),
  });
  view.setLoopRegion({ startS: 1, endS: 2 });
  view.setSections([{ id: "a", startS: 0, endS: 2, label: "A" }]);
  wave = { view, player, ctx };
  await sleep(500);
  const host = [...container.querySelectorAll("div")].find((d) => d.shadowRoot);
  const root = host?.shadowRoot ?? container;
  return {
    duration: view.wavesurfer.getDuration(),
    regions: root.querySelectorAll("[part~=region]").length,
    canvases: root.querySelectorAll("canvas").length + container.querySelectorAll("canvas").length,
  };
}
function waveState(): { time: number; loop: { startS: number; endS: number } | null } {
  if (!wave) throw new Error("mount first");
  return { time: wave.player.state.time, loop: wave.player.state.loop };
}
async function waveDispose(): Promise<void> {
  if (!wave) return;
  wave.view.dispose();
  wave.player.dispose();
  await wave.ctx.close();
  wave = null;
}

declare global {
  interface Window {
    oakAudioE2E: {
      ready: true;
      workletUrl: string;
      micRun: typeof micRun;
      stretchRun: typeof stretchRun;
      waveMount: typeof waveMount;
      waveState: typeof waveState;
      waveDispose: typeof waveDispose;
      wave4: typeof wave4;
      wave5: typeof wave5;
    };
  }
}

window.oakAudioE2E = {
  ready: true,
  workletUrl: PITCH_WORKLET_URL,
  micRun,
  stretchRun,
  waveMount,
  waveState,
  waveDispose,
  wave4,
  wave5,
};
