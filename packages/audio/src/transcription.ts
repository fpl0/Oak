// The transcription player for the learner's own audio (contracts §6.12, architecture §6.8): the decoded
// file plays through signalsmith-stretch into `MasterBus.input`. Rate 0.25–1 without pitch change, ±12
// semitones, ±50¢ fine-tune (the fractional part of the stretch's `semitones`), an A–B loop (the
// stretch's own auto-loop), and position events about 20 times a second. Display is wavesurfer's job
// (`@oak/audio/waveview`); this is the audio path only.
import type { StretchNode } from "signalsmith-stretch";
import type { TranscriptionPlayer, TranscriptionPlayerState } from "./types.ts";

export const RATE_RANGE: readonly [number, number] = [0.25, 1];
export const SEMITONE_RANGE: readonly [number, number] = [-12, 12];
export const FINE_TUNE_RANGE: readonly [number, number] = [-50, 50];
/** Position updates from the stretch worklet, seconds. */
export const POSITION_INTERVAL = 0.05;
/** Shortest A–B loop, seconds. */
export const MIN_LOOP_SEC = 0.05;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Min/max peaks of decoded audio over all channels, interleaved [min, max, min, max, …]. */
export function computePeaks(
  buffer: Pick<AudioBuffer, "length" | "sampleRate" | "numberOfChannels" | "getChannelData">,
  pointsPerSecond = 100,
): Float32Array {
  const points = Math.max(1, Math.ceil((buffer.length / buffer.sampleRate) * pointsPerSecond));
  const out = new Float32Array(points * 2);
  const per = buffer.length / points;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  for (let p = 0; p < points; p++) {
    const from = Math.floor(p * per);
    const to = Math.max(from + 1, Math.min(buffer.length, Math.floor((p + 1) * per)));
    let lo = 0;
    let hi = 0;
    for (const ch of channels) {
      for (let i = from; i < to; i++) {
        const v = ch[i] as number;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    out[2 * p] = lo;
    out[2 * p + 1] = hi;
  }
  return out;
}

export interface TranscriptionPlayerDeps {
  /** Default: `signalsmith-stretch`, imported on first use (its WASM worklet is a Blob URL module). */
  createStretch?: (ctx: BaseAudioContext) => Promise<StretchNode>;
  /** Default: `ctx.decodeAudioData` on a copy (decoding detaches the buffer). */
  decode?: (audio: ArrayBuffer) => Promise<AudioBuffer>;
}

/** `output`: the node to play into, normally `OakStrudel.master.input`. */
export async function createTranscriptionPlayer(
  ctx: AudioContext,
  output: AudioNode,
  deps: TranscriptionPlayerDeps = {},
): Promise<TranscriptionPlayer & { readonly buffer: AudioBuffer | null }> {
  const createStretch =
    deps.createStretch ??
    (async (c: BaseAudioContext) => {
      const mod = await import("signalsmith-stretch");
      // Its default node: one (unused) input, one stereo output; a mono file plays on both channels.
      return mod.default(c);
    });
  const decode = deps.decode ?? ((audio: ArrayBuffer) => ctx.decodeAudioData(audio.slice(0)));
  const stretch = await createStretch(ctx);
  const gain = ctx.createGain();
  stretch.connect(gain);
  gain.connect(output);

  let buffer: AudioBuffer | null = null;
  let peaksCache: { pps: number; peaks: Float32Array } | null = null;
  let disposed = false;
  let state: TranscriptionPlayerState = {
    loaded: false,
    playing: false,
    time: 0,
    durationS: 0,
    rate: 1,
    semitones: 0,
    fineTuneCents: 0,
    loop: null,
  };
  const subs = new Set<(s: TranscriptionPlayerState) => void>();
  const set = (patch: Partial<TranscriptionPlayerState>) => {
    state = { ...state, ...patch };
    for (const cb of [...subs]) cb(state);
  };
  const pitch = () => state.semitones + state.fineTuneCents / 100;
  const loopFields = () => ({
    loopStart: state.loop?.startS ?? 0,
    loopEnd: state.loop?.endS ?? 0,
  });
  const live = (change: Parameters<StretchNode["schedule"]>[0]) =>
    stretch.schedule({ output: ctx.currentTime, ...change });

  await stretch.setUpdateInterval(POSITION_INTERVAL, (inputTime) => {
    if (!state.playing || disposed) return;
    if (!state.loop && inputTime >= state.durationS) {
      // The end of the file: stop there, ready to play again from the start.
      void stretch.schedule({ active: false, output: ctx.currentTime });
      set({ playing: false, time: state.durationS });
      return;
    }
    set({ time: clamp(inputTime, 0, state.durationS) });
  });

  const assertLoaded = () => {
    if (disposed) throw new Error("@oak/audio: the transcription player was disposed");
    if (!buffer) throw new Error("@oak/audio: load() a file first");
  };

  return {
    get buffer() {
      return buffer;
    },
    async load(audio) {
      if (disposed) throw new Error("@oak/audio: the transcription player was disposed");
      const decoded = await decode(audio);
      if (state.playing) await stretch.schedule({ active: false, output: ctx.currentTime });
      await stretch.dropBuffers();
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, c) =>
        decoded.getChannelData(c).slice(),
      );
      await addChannels(stretch, channels);
      buffer = decoded;
      peaksCache = null;
      set({ loaded: true, playing: false, time: 0, durationS: decoded.duration, loop: null });
      await stretch.schedule({
        active: false,
        input: 0,
        rate: state.rate,
        semitones: pitch(),
        loopStart: 0,
        loopEnd: 0,
      });
      return {
        durationS: decoded.duration,
        sampleRate: decoded.sampleRate,
        channels: decoded.numberOfChannels,
      };
    },
    async play(o = {}) {
      assertLoaded();
      let from = o.fromS ?? state.time;
      if (!state.loop && from >= state.durationS - 1e-3) from = 0;
      from = clamp(from, 0, state.durationS);
      const at = Math.max(o.at ?? ctx.currentTime, ctx.currentTime);
      await stretch.schedule({
        active: true,
        input: from,
        output: at,
        rate: state.rate,
        semitones: pitch(),
        ...loopFields(),
      });
      set({ playing: true, time: from });
    },
    pause() {
      if (!state.playing) return;
      const t = clamp(stretch.inputTime, 0, state.durationS);
      void live({ active: false });
      set({ playing: false, time: t });
    },
    seek(timeS) {
      assertLoaded();
      const t = clamp(timeS, 0, state.durationS);
      if (state.playing) void live({ input: t });
      else void stretch.schedule({ input: t, output: ctx.currentTime, active: false });
      set({ time: t });
    },
    setRate(rate) {
      const r = clamp(rate, RATE_RANGE[0], RATE_RANGE[1]);
      if (state.playing) void live({ rate: r });
      set({ rate: r });
    },
    setSemitones(semitones) {
      const s = Math.round(clamp(semitones, SEMITONE_RANGE[0], SEMITONE_RANGE[1]));
      set({ semitones: s });
      if (state.playing) void live({ semitones: pitch() });
    },
    setFineTuneCents(cents) {
      const c = clamp(cents, FINE_TUNE_RANGE[0], FINE_TUNE_RANGE[1]);
      set({ fineTuneCents: c });
      if (state.playing) void live({ semitones: pitch() });
    },
    setLoop(loop) {
      let next: TranscriptionPlayerState["loop"] = null;
      if (loop) {
        const a = clamp(Math.min(loop.startS, loop.endS), 0, state.durationS);
        const b = clamp(Math.max(loop.startS, loop.endS), 0, state.durationS);
        if (b - a >= MIN_LOOP_SEC) next = { startS: a, endS: b };
      }
      set({ loop: next });
      const fields = loopFields();
      if (state.playing) {
        const t = stretch.inputTime;
        const outside = next !== null && (t < next.startS || t >= next.endS);
        void live(outside && next ? { ...fields, input: next.startS } : fields);
        if (outside && next) set({ time: next.startS });
      } else {
        void stretch.schedule({ ...fields, output: ctx.currentTime, active: false });
        if (next && (state.time < next.startS || state.time >= next.endS)) set({ time: next.startS });
      }
    },
    setGain(g) {
      gain.gain.setTargetAtTime(clamp(g, 0, 1), ctx.currentTime, 0.01);
    },
    get state() {
      return state;
    },
    subscribe(cb) {
      subs.add(cb);
      cb(state);
      return () => subs.delete(cb);
    },
    peaks(pointsPerSecond = 100) {
      assertLoaded();
      if (!peaksCache || peaksCache.pps !== pointsPerSecond) {
        peaksCache = { pps: pointsPerSecond, peaks: computePeaks(buffer as AudioBuffer, pointsPerSecond) };
      }
      return peaksCache.peaks;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      void stretch.schedule({ active: false, output: ctx.currentTime });
      void stretch.dropBuffers();
      stretch.disconnect();
      gain.disconnect();
      subs.clear();
      buffer = null;
      state = { ...state, playing: false, loaded: false };
    },
  };
}

/**
 * Hands the channel copies to the stretch worklet by transfer, not by structured clone: a 40-minute stereo file is
 * about 0.9 GB per copy, and a clone held a second one on this thread until it was collected. signalsmith-stretch
 * takes a transfer list as the extra last argument of any remote method.
 */
function addChannels(stretch: StretchNode, channels: Float32Array[]): Promise<number> {
  const add = stretch.addBuffers as (b: Float32Array[], transfer: Transferable[]) => Promise<number>;
  return add.call(
    stretch,
    channels,
    channels.map((c) => c.buffer as ArrayBuffer),
  );
}
