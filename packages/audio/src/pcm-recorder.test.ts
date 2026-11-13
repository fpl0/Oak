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
});
