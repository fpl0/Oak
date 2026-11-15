// The long-take recorder (Wave 5): the worklet's own source runs here against a simulated render loop, so the
// frame counting, the chunking, the WAV and the memory bound are tested on the code that ships. The browser path
// (AudioWorklet in an OfflineAudioContext, a 3-minute piece) is proved in packages/audio/e2e/wave5-recorder.pw.ts.
import { describe, expect, test } from "bun:test";
import {
  createPcmRecorderWith,
  PCM_RECORDER_PROCESSOR,
  PCM_RECORDER_SOURCE,
  type PcmWorkletNodeLike,
  wavHeader,
} from "./pcm-recorder.ts";

type Msg = { data: unknown };
interface Proc {
  port: { onmessage: ((e: Msg) => void) | null; postMessage(m: unknown): void };
  process(inputs: Float32Array[][]): boolean;
}

/** The worklet source evaluated with a fake AudioWorkletGlobalScope; `frame.v` is `currentFrame`. */
function harness(sampleRate: number) {
  const frame = { v: 0 };
  let Ctor: (new (o: unknown) => Proc) | null = null;
  let toMain: ((e: Msg) => void) | null = null;
  class AudioWorkletProcessor {
    port = {
      onmessage: null as ((e: Msg) => void) | null,
      postMessage: (m: unknown) => queueMicrotask(() => toMain?.({ data: m })),
    };
  }
  new Function(
    "AudioWorkletProcessor",
    "registerProcessor",
    "__frame",
    PCM_RECORDER_SOURCE.replaceAll("currentFrame", "__frame.v"),
  )(
    AudioWorkletProcessor,
    (name: string, C: new (o: unknown) => Proc) => {
      expect(name).toBe(PCM_RECORDER_PROCESSOR);
      Ctor = C;
    },
    frame,
  );
  let proc: Proc | null = null;
  let options: AudioWorkletNodeOptions | null = null;
  const node: PcmWorkletNodeLike & { connected: boolean } = {
    connected: true,
    port: {
      onmessage: null,
      postMessage: (m: unknown) => proc?.port.onmessage?.({ data: m }),
    },
    disconnect() {
      this.connected = false;
    },
  };
  toMain = (e) => node.port.onmessage?.(e);
  const ctx = {
    sampleRate,
    get currentTime() {
      return frame.v / sampleRate;
    },
    audioWorklet: { addModule: async (_url: string) => {} },
  };
  const source = {
    edges: 0,
    connect(_d: never) {
      this.edges++;
      return _d;
    },
    disconnect(_d: never) {
      this.edges--;
    },
  };
  const createNode = (_name: string, o: AudioWorkletNodeOptions) => {
    options = o;
    proc = new (Ctor as new (o: unknown) => Proc)(o);
    return node;
  };
  /** Renders `frames` frames of `signal(frame, channel)` in 128-frame quanta, letting messages through. */
  const render = async (frames: number, signal: (f: number, c: number) => number, channels = 2) => {
    const end = frame.v + frames;
    let blocks = 0;
    while (frame.v < end) {
      const block = Array.from({ length: channels }, (_, c) => {
        const a = new Float32Array(128);
        for (let i = 0; i < 128; i++) a[i] = signal(frame.v + i, c);
        return a;
      });
      proc?.process([block]);
      frame.v += 128;
      if (++blocks % 64 === 0) await Promise.resolve();
    }
    for (let i = 0; i < 4; i++) await Promise.resolve();
  };
  return { frame, ctx, source, node, createNode, render, options: () => options };
}

async function readWav(blob: Blob) {
  const buf = await blob.arrayBuffer();
  const v = new DataView(buf);
  const channels = v.getUint16(22, true);
  const sampleRate = v.getUint32(24, true);
  const dataBytes = v.getUint32(40, true);
  const pcm = new Int16Array(buf, 44, dataBytes / 2);
  return {
    channels,
    sampleRate,
    frames: dataBytes / 2 / channels,
    pcm,
    riff: v.getUint32(4, true),
    bytes: buf.byteLength,
  };
}

describe("the PCM long-take recorder", () => {
  test("a 3-minute piece: exact length, every click on its sample (no drift), the full tail, memory bounded", async () => {
    const sr = 48000;
    const h = harness(sr);
    const made: number[] = [];
    const rec = createPcmRecorderWith({
      ctx: h.ctx,
      source: h.source,
      createNode: h.createNode,
      makeBlob: (parts, type) => {
        made.push(parts.length);
        return new Blob(parts, { type });
      },
    });
    // Clicks every half second from t = 1 s (the piece), the take asked from 1 s for 180 s plus a 2 s tail.
    const click = (f: number) => (f >= sr && (f - sr) % (sr / 2) === 0 ? 0.8 : 0);
    const take = rec.record({ seconds: 180, at: 1, tailSec: 2 });
    await h.render(sr / 2, () => 0);
    expect(rec.recording).toBe(true);
    await h.render(184 * sr, (f, c) => (c === 0 ? click(f) : -click(f)));
    const r = await take;
    expect(rec.recording).toBe(false);
    expect(r.exact).toBe(true);
    expect(r.frames).toBe(182 * sr);
    expect(r.durationS).toBe(182);
    expect(r.startAt).toBe(1);
    expect(r.latePadFrames).toBe(0);
    expect(r.peak).toBeCloseTo(0.8, 6);
    const wav = await readWav(r.blob);
    expect(wav.channels).toBe(2);
    expect(wav.sampleRate).toBe(sr);
    expect(wav.frames).toBe(182 * sr);
    expect(wav.bytes).toBe(44 + 182 * sr * 4);
    expect(wav.riff).toBe(36 + 182 * sr * 4);
    // Every click, from the first (frame 0) to the last one of the tail at 181.5 s, exactly where it was played:
    // no drift over three minutes, and the tail is all there.
    const at: number[] = [];
    for (let f = 0; f < wav.frames; f++) if ((wav.pcm[2 * f] as number) > 20000) at.push(f);
    expect(at.length).toBe(364);
    expect(at[at.length - 1]).toBe(181.5 * sr);
    expect(at.every((f, k) => f === (k * sr) / 2)).toBe(true);
    expect(wav.pcm[1]).toBe(Math.trunc(-0.8 * 0x8000));
    // Memory: the heap held at most 8 one-second chunks plus one; the rest went into Blob parts.
    const s = rec.stats();
    const chunkBytes = sr * 2 * 2;
    expect(s.chunks).toBe(182);
    expect(s.peakHeldBytes).toBeLessThanOrEqual(8 * chunkBytes);
    expect(s.parts).toBe(Math.ceil(182 / 8));
    expect(s.heldBytes).toBe(0);
    expect(made.length).toBe(s.parts + 1);
    expect(h.options()).toMatchObject({ numberOfOutputs: 0, channelCount: 2, channelCountMode: "explicit" });
  });

  test("asked after `at` had passed: the missing head is silence and the take still starts at `at`", async () => {
    const sr = 8000;
    const h = harness(sr);
    const rec = createPcmRecorderWith({
      ctx: h.ctx,
      source: h.source,
      createNode: h.createNode,
      channels: 1,
    });
    await rec.prepare();
    await h.render(1024, () => 0);
    const take = rec.record({ seconds: 1, at: 0.1, tailSec: 0 });
    await Promise.resolve();
    await h.render(sr * 1.2, (f) => (f % 1000 === 0 ? 0.5 : 0));
    const r = await take;
    expect(r.startAt).toBe(0.1);
    expect(r.frames).toBe(sr);
    const first = 1024 + 128 * 0; // the first quantum rendered after arming
    expect(r.latePadFrames).toBeGreaterThanOrEqual(first - 800);
    const wav = await readWav(r.blob);
    expect(wav.frames).toBe(sr);
    // Frame k of the take is frame 800 + k of the clock: a click at clock frame 2000 is at 1200.
    expect(wav.pcm[1200]).toBe(Math.trunc(0.5 * 0x7fff));
    expect(wav.pcm[1199]).toBe(0);
  });

  test("one recording at a time; cancel rejects and frees it; dispose disconnects", async () => {
    const h = harness(8000);
    const rec = createPcmRecorderWith({ ctx: h.ctx, source: h.source, createNode: h.createNode });
    const a = rec.record({ seconds: 10 });
    await expect(rec.record({ seconds: 1 })).rejects.toThrow(/already running/);
    await Promise.resolve();
    await h.render(1280, () => 0.1);
    rec.cancel();
    await expect(a).rejects.toThrow(/cancelled/);
    expect(rec.recording).toBe(false);
    // The worklet stopped: a new take starts clean.
    const b = rec.record({ seconds: 0.1, tailSec: 0 });
    await Promise.resolve();
    await h.render(2000, () => 0.25);
    const r = await b;
    expect(r.frames).toBe(800);
    expect(h.source.edges).toBe(1);
    rec.dispose();
    expect(h.source.edges).toBe(0);
    expect(h.node.connected).toBe(false);
    await expect(rec.record({ seconds: 1 })).rejects.toThrow(/disposed/);
  });

  test("clipping is clamped, the peak is reported, and the header is a valid 16-bit PCM WAV header", async () => {
    const h = harness(8000);
    const rec = createPcmRecorderWith({
      ctx: h.ctx,
      source: h.source,
      createNode: h.createNode,
      channels: 1,
    });
    await rec.prepare();
    // Prepared: the take is armed synchronously, before the next render quantum.
    const t = rec.record({ seconds: 0.016, at: 0, tailSec: 0 });
    expect(rec.recording).toBe(true);
    await h.render(256, (f) => (f === 3 ? 1.7 : f === 4 ? -2 : 0));
    const r = await t;
    expect(r.peak).toBe(1);
    const wav = await readWav(r.blob);
    expect(wav.pcm[3]).toBe(0x7fff);
    expect(wav.pcm[4]).toBe(-0x8000);
    const v = new DataView(wavHeader(10, 2, 44100));
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe("RIFF");
    expect(v.getUint32(28, true)).toBe(44100 * 4);
    expect(v.getUint32(40, true)).toBe(40);
  });
  // Wave 6 (CF-A): the single is a two-minute-plus piece with section changes and a key change.
  test("a 2:14 song with a section change every eight bars and a lift: every sample, the exact length, nothing missing", async () => {
    const sr = 48000;
    const h = harness(sr);
    const rec = createPcmRecorderWith({ ctx: h.ctx, source: h.source, createNode: h.createNode });
    await rec.prepare();
    // CF-A's plan: 56 bars at 100 BPM (2.4 s a bar, 134.4 s), verse chorus verse chorus bridge chorus chorus2;
    // the last eight bars a whole step up. The signal is a tone per section that restarts at every section
    // change (a discontinuity, as a new section's attack is) with a different level and pan per section.
    const barFrames = 2.4 * sr;
    const sections = [0, 4, 0, 4, 9, 4, 6]; // semitones above 220 Hz; the last chorus lifted by two
    const at = 0.5;
    const start = at * sr;
    const piece = (f: number, c: number): number => {
      const k = f - start;
      if (k < 0 || k >= 56 * barFrames) return 0;
      const sec = Math.floor(k / (8 * barFrames));
      const inSec = k - sec * 8 * barFrames;
      const hz = 220 * 2 ** ((sections[sec] as number) / 12);
      const amp = (0.2 + 0.08 * sec) * (c === 0 ? 1 : 0.6 + 0.05 * sec);
      return amp * Math.sin((2 * Math.PI * hz * inSec) / sr);
    };
    const take = rec.record({ seconds: 134.4, at, tailSec: 2 });
    await h.render(Math.ceil((at + 134.4 + 2.2) * sr), piece);
    const r = await take;
    expect(r.exact).toBe(true);
    expect(r.frames).toBe(Math.round(136.4 * sr));
    expect(r.durationS).toBe(136.4);
    expect(r.latePadFrames).toBe(0);
    expect(r.missingFrames).toBe(0);
    const wav = await readWav(r.blob);
    expect(wav.frames).toBe(6547200);
    // Sample for sample against the piece, both channels, through every section change and the lift.
    let worst = 0;
    let zeroRun = 0;
    let longestZeroRun = 0;
    const song = 56 * barFrames;
    for (let f = 0; f < wav.frames; f++) {
      for (let c = 0; c < 2; c++) {
        const x = piece(start + f, c);
        const want = x < 0 ? x * 0x8000 : x * 0x7fff;
        const d = Math.abs((wav.pcm[2 * f + c] as number) - Math.trunc(want));
        if (d > worst) worst = d;
      }
      // A dropout would be a run of silence inside the song: the tone never rests for a millisecond.
      if (f < song) {
        if (wav.pcm[2 * f] === 0 && wav.pcm[2 * f + 1] === 0) zeroRun++;
        else zeroRun = 0;
        if (zeroRun > longestZeroRun) longestZeroRun = zeroRun;
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
    expect(longestZeroRun).toBeLessThan(sr / 1000);
    // The section changes sit on their exact frames: the first sample of each section is the tone's zero.
    for (let sec = 1; sec < 7; sec++) expect(wav.pcm[2 * sec * 8 * barFrames]).toBe(0);
    // The tail after the last bar is there and silent.
    expect(wav.pcm[2 * (song + sr)]).toBe(0);
    expect(rec.stats().peakHeldBytes).toBeLessThanOrEqual(8 * sr * 4);
  });

  // Wave 7: a gap stays where it happened, and the longest capstone takes come out whole.
  test("a lost chunk leaves silence in its own place: every later sample stays on its frame, and the gap is listed", async () => {
    const sr = 8000;
    const h = harness(sr);
    const rec = createPcmRecorderWith({
      ctx: h.ctx,
      source: h.source,
      createNode: h.createNode,
      channels: 1,
      chunkSec: 0.5,
    });
    await rec.prepare();
    const take = rec.record({ seconds: 3, at: 0, tailSec: 0 });
    const deliver = h.node.port.onmessage as (e: { data: unknown }) => void;
    let chunks = 0;
    h.node.port.onmessage = (e) => {
      const d = e.data as { type: string };
      if (d.type === "chunk" && ++chunks === 3) return;
      deliver(e);
    };
    // A click every 1000 frames: where each lands after the take shows whether anything moved.
    await h.render(3.2 * sr, (f) => (f % 1000 === 0 ? 0.5 : 0));
    const r = await take;
    expect(r.missingFrames).toBe(sr / 2);
    expect(r.dropouts).toEqual([{ atS: 1, seconds: 0.5 }]);
    const wav = await readWav(r.blob);
    expect(wav.frames).toBe(3 * sr);
    const clicks: number[] = [];
    for (let f = 0; f < wav.frames; f++) if ((wav.pcm[f] as number) > 10000) clicks.push(f);
    // Clicks 0 … 23000 every 1000, except the ones inside the lost half second (8000 … 11999).
    expect(clicks).toEqual(
      Array.from({ length: 24 }, (_, k) => k * 1000).filter((f) => f < 8000 || f >= 12000),
    );
  });

  test("render quanta the audio thread skipped are silence in their place, counted as missing", async () => {
    const sr = 8000;
    const h = harness(sr);
    const rec = createPcmRecorderWith({
      ctx: h.ctx,
      source: h.source,
      createNode: h.createNode,
      channels: 1,
    });
    await rec.prepare();
    const take = rec.record({ seconds: 1, at: 0, tailSec: 0 });
    const signal = (f: number) => (f % 1000 === 0 ? 0.5 : 0);
    await h.render(2048, signal);
    h.frame.v += 3 * 128; // three quanta never processed
    await h.render(sr, signal);
    const r = await take;
    expect(r.missingFrames).toBe(384);
    expect(r.dropouts).toEqual([{ atS: 2048 / sr, seconds: 384 / sr }]);
    const wav = await readWav(r.blob);
    expect(wav.frames).toBe(sr);
    expect(wav.pcm[3000]).toBe(Math.trunc(0.5 * 0x7fff));
    expect(wav.pcm[2048 + 100]).toBe(0);
  });

  test("the longest capstone takes: JC3's two choruses at its slowest tempo, and AC1's two versions at the longest legal length", async () => {
    // JC3: rhythm changes, 32 bars AABA (the bridge is bars 17–24), two choruses = 64 bars at the brief's slowest
    // 120 BPM = 128 s. AC1: two versions, each up to MAX_CAPSTONE_BARS (128) at its slowest 60 BPM = 512 s,
    // recorded one after the other on one recorder. Every take: exact length, every click on its frame, no gap.
    const sr = 48000;
    const h = harness(sr);
    const rec = createPcmRecorderWith({ ctx: h.ctx, source: h.source, createNode: h.createNode });
    await rec.prepare();
    const takes = [
      { name: "JC3", seconds: 64 * 4 * (60 / 120) },
      { name: "AC1 version one", seconds: 128 * 4 * (60 / 60) },
      { name: "AC1 version two", seconds: 128 * 4 * (60 / 60) },
    ];
    expect(takes.map((t) => t.seconds)).toEqual([128, 512, 512]);
    for (const t of takes) {
      const at = h.frame.v / sr + 0.25;
      const startFrame = Math.round(at * sr);
      // A click on every beat of the take (one second at 60 BPM, half a second at 120), from its first frame.
      const beat = t.name === "JC3" ? sr / 2 : sr;
      const click = (f: number) => (f >= startFrame && (f - startFrame) % beat === 0 ? 0.6 : 0);
      const take = rec.record({ seconds: t.seconds, at, tailSec: 2 });
      await h.render(Math.ceil((0.3 + t.seconds + 2.1) * sr), (f) => click(f));
      const r = await take;
      expect(r.frames).toBe((t.seconds + 2) * sr);
      expect(r.missingFrames).toBe(0);
      expect(r.latePadFrames).toBe(0);
      expect(r.dropouts).toEqual([]);
      const wav = await readWav(r.blob);
      expect(wav.frames).toBe((t.seconds + 2) * sr);
      let n = 0;
      let off = 0;
      for (let f = 0; f < wav.frames; f++)
        if ((wav.pcm[2 * f] as number) > 10000) {
          n++;
          if (f % beat !== 0) off++;
        }
      expect(off).toBe(0);
      expect(n).toBe(Math.floor(((t.seconds + 2) * sr - 1) / beat) + 1);
      expect(rec.stats().peakHeldBytes).toBeLessThanOrEqual(8 * sr * 4);
    }
  });

  test("a chunk that never arrives is reported as missing frames; the length still holds", async () => {
    const sr = 8000;
    const h = harness(sr);
    const rec = createPcmRecorderWith({
      ctx: h.ctx,
      source: h.source,
      createNode: h.createNode,
      channels: 1,
      chunkSec: 0.5,
    });
    await rec.prepare();
    const take = rec.record({ seconds: 3, at: 0, tailSec: 0 });
    // The page loses the third half-second chunk on its way from the audio thread.
    const deliver = h.node.port.onmessage as (e: { data: unknown }) => void;
    let chunks = 0;
    h.node.port.onmessage = (e) => {
      const d = e.data as { type: string };
      if (d.type === "chunk" && ++chunks === 3) return;
      deliver(e);
    };
    await h.render(3.2 * sr, () => 0.3);
    const r = await take;
    expect(r.frames).toBe(3 * sr);
    expect(r.missingFrames).toBe(sr / 2);
    expect((await readWav(r.blob)).frames).toBe(3 * sr);
  });
});
