// Wave 5: the long-take recorder (a C3 verse–chorus demo runs 90 seconds and more; tested with a 3-minute piece).
// An AudioWorklet copies the master bus, sample by sample, from the frame of `at` for exactly
// `(seconds + tailSec) · sampleRate` frames — counted on the audio thread, so there is no drift between the
// recording and the music however long it runs, and the tail is never cut by a timer firing early. The samples
// leave the audio thread as 16-bit PCM in one-second chunks; every `partChunks` chunks are folded into a Blob part,
// so the JavaScript heap holds a few seconds of audio at any time, never the whole take (a 3-minute stereo take is
// 34.6 MB of WAV, held as Blob parts). The result is a 16-bit PCM WAV of exactly the asked span.
//
// `createMasterRecorder` (MediaRecorder, master-recorder.ts) stays for short takes and browsers without
// AudioWorklet. The worklet ships as source text and loads from a Blob URL (CSP allows `blob:` scripts), so it
// needs no bundler step and also runs in an OfflineAudioContext, which renders faster than real time (the tests).

import type { ExactRecording } from "./master-recorder.ts";
import type { MasterRecorder } from "./stretch.ts";

export const PCM_RECORDER_PROCESSOR = "oak-pcm-recorder";

/** The worklet, as source text (AudioWorkletGlobalScope: no imports, no DOM). */
export const PCM_RECORDER_SOURCE = `class OakPcmRecorder extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.channels = o.channels || 2;
    this.chunkFrames = o.chunkFrames || 48000;
    this.buf = new Int16Array(this.chunkFrames * this.channels);
    this.fill = 0;
    this.start = -1;
    this.end = -1;
    this.first = -1;
    this.written = 0;
    this.next = -1;
    this.skipped = 0;
    this.skips = [];
    this.peak = 0;
    this.alive = true;
    // Armed at construction (Wave 6): an offline render may finish before a message could arrive.
    if (o.arm) {
      this.start = o.arm.startFrame;
      this.end = o.arm.startFrame + o.arm.frames;
    }
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === "arm") {
        this.start = d.startFrame;
        this.end = d.startFrame + d.frames;
        this.first = -1;
        this.written = 0;
        this.next = -1;
        this.skipped = 0;
        this.skips = [];
        this.fill = 0;
        this.peak = 0;
      } else if (d.type === "cancel") {
        this.start = -1;
        this.end = -1;
        this.fill = 0;
      } else if (d.type === "dispose") {
        this.alive = false;
      }
    };
  }
  flush() {
    if (this.fill === 0) return;
    const out = this.buf.slice(0, this.fill * this.channels);
    // \`at\`: the chunk's first frame inside the take, so the page puts it in its place even if one before it is lost.
    this.port.postMessage({ type: "chunk", data: out, frames: this.fill, at: this.written - this.fill }, [out.buffer]);
    this.fill = 0;
  }
  put(sample, c) {
    let x = sample;
    if (x > 1) x = 1;
    else if (x < -1) x = -1;
    const ax = x < 0 ? -x : x;
    if (ax > this.peak) this.peak = ax;
    this.buf[this.fill * this.channels + c] = x < 0 ? x * 0x8000 : x * 0x7fff;
  }
  advance() {
    this.fill++;
    this.written++;
    if (this.fill === this.chunkFrames) this.flush();
  }
  process(inputs) {
    if (this.end < 0) return this.alive;
    const input = inputs[0] || [];
    const n = (input[0] && input[0].length) || 128;
    const blockStart = currentFrame;
    const from = Math.max(this.start, blockStart);
    const to = Math.min(this.end, blockStart + n);
    if (from < to && this.first < 0) this.first = from;
    // Render quanta the audio thread skipped inside the take: silence in their place, counted, so every later
    // sample stays on its own frame (a dropout is heard as a gap, never as the song jumping ahead).
    if (this.next >= 0 && from > this.next && from < to) {
      const gap = Math.min(from, this.end) - this.next;
      this.skips.push({ at: this.next - this.first, frames: gap });
      this.skipped += gap;
      for (let g = 0; g < gap; g++) {
        for (let c = 0; c < this.channels; c++) this.put(0, c);
        this.advance();
      }
    }
    for (let f = from; f < to; f++) {
      const i = f - blockStart;
      for (let c = 0; c < this.channels; c++) {
        const ch = input[c] || input[0];
        this.put(ch ? ch[i] : 0, c);
      }
      this.advance();
    }
    if (from < to) this.next = to;
    if (blockStart + n >= this.end) {
      this.flush();
      this.port.postMessage({
        type: "done",
        first: this.first,
        written: this.written,
        peak: this.peak,
        skipped: this.skipped,
        skips: this.skips,
      });
      this.start = -1;
      this.end = -1;
    }
    return this.alive;
  }
}
registerProcessor("${PCM_RECORDER_PROCESSOR}", OakPcmRecorder);
`;

/** The part of AudioWorkletNode this module uses. */
export interface PcmWorkletNodeLike {
  readonly port: {
    onmessage: ((e: { data: unknown }) => void) | null;
    postMessage(message: unknown): void;
  };
  disconnect(): void;
}

export interface PcmRecorderDeps {
  ctx: {
    readonly sampleRate: number;
    readonly currentTime: number;
    readonly audioWorklet: { addModule(url: string): Promise<void> };
  };
  /** The node to record: the master bus after the limiter (what the speakers get). */
  source: { connect(destination: never): unknown; disconnect(destination: never): void };
  /** 2 (default) or 1. */
  channels?: 1 | 2;
  /** Seconds per chunk the worklet posts. Default 1. */
  chunkSec?: number;
  /** Chunks held before they are folded into one Blob part. Default 8. */
  partChunks?: number;
  /** Default: a Blob URL of `PCM_RECORDER_SOURCE`. */
  workletUrl?: string;
  /** Default: `new AudioWorkletNode(ctx, name, options)`. */
  createNode?: (name: string, options: AudioWorkletNodeOptions) => PcmWorkletNodeLike;
  /** Default: `new Blob(parts, { type })`. Tests count what was held. */
  makeBlob?: (parts: BlobPart[], type: string) => Blob;
}

/** What a long take resolves: the exact span as WAV, and how loud it got (a silent take is not released). */
export interface PcmRecording extends ExactRecording {
  /** Sample frames in the WAV: `round((seconds + tailSec) · sampleRate)`. */
  frames: number;
  /** Largest |sample| of the take, 0–1. */
  peak: number;
  /** Frames padded with silence at the start because the recording was asked for after `at` had passed. */
  latePadFrames: number;
  /**
   * Wave 6: frames of the span the audio thread never delivered (padded with silence so the length still holds).
   * Wave 7: a chunk lost on its way to the page, or render quanta the audio thread skipped, leave silence in THEIR
   * place (every later sample stays on its own frame) and are listed in `dropouts`. 0 for a whole take; a host
   * releases a take only when this and `latePadFrames` are both 0.
   */
  missingFrames: number;
  /** Wave 7: each gap inside the take — seconds from the take's start and how long — in time order. */
  dropouts: { atS: number; seconds: number }[];
}

export interface PcmRecorderStats {
  /** Bytes of PCM in JavaScript arrays right now (not yet folded into a Blob part). */
  heldBytes: number;
  /** The most that was ever held: bounded by `(partChunks + 1) · chunk`, whatever the take's length. */
  peakHeldBytes: number;
  chunks: number;
  parts: number;
}

export interface PcmRecorder extends MasterRecorder {
  /** Loads the worklet (once per context). `record` calls it when needed. */
  prepare(): Promise<void>;
  record(opts: { seconds: number; at?: number; tailSec?: number; mimeType?: string }): Promise<PcmRecording>;
  stats(): PcmRecorderStats;
  dispose(): void;
}

/** Default seconds of tail after the asked span (reverb and release ring out). */
export const PCM_TAIL_SEC = 2;

const loaded = new WeakMap<object, Promise<void>>();
/** Contexts whose worklet module has finished loading. */
const loadedNow = new WeakSet<object>();
let sourceUrl: string | null = null;

/** The 44-byte header of a 16-bit PCM WAV with `frames` frames. */
export function wavHeader(frames: number, channels: number, sampleRate: number): ArrayBuffer {
  const dataBytes = frames * channels * 2;
  const out = new ArrayBuffer(44);
  const v = new DataView(out);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, dataBytes, true);
  return out;
}

export function createPcmRecorderWith(deps: PcmRecorderDeps): PcmRecorder {
  const { ctx } = deps;
  const channels = deps.channels ?? 2;
  const sr = ctx.sampleRate;
  const chunkFrames = Math.max(128, Math.round((deps.chunkSec ?? 1) * sr));
  const partChunks = Math.max(1, Math.round(deps.partChunks ?? 8));
  const makeBlob = deps.makeBlob ?? ((parts: BlobPart[], type: string) => new Blob(parts, { type }));
  const createNode =
    deps.createNode ??
    ((name: string, options: AudioWorkletNodeOptions) =>
      new AudioWorkletNode(
        ctx as unknown as BaseAudioContext,
        name,
        options,
      ) as unknown as PcmWorkletNodeLike);
  let node: PcmWorkletNodeLike | null = null;
  let disposed = false;
  let active: { cancel(err: Error): void } | null = null;
  const stats: PcmRecorderStats = { heldBytes: 0, peakHeldBytes: 0, chunks: 0, parts: 0 };

  const prepare = (): Promise<void> => {
    let p = loaded.get(ctx);
    if (!p) {
      if (!deps.workletUrl && sourceUrl === null)
        sourceUrl = URL.createObjectURL(new Blob([PCM_RECORDER_SOURCE], { type: "text/javascript" }));
      const url = deps.workletUrl ?? (sourceUrl as string);
      p = ctx.audioWorklet.addModule(url).then(() => {
        loadedNow.add(ctx);
      });
      loaded.set(ctx, p);
      p.catch(() => loaded.delete(ctx));
    }
    return p;
  };

  /**
   * The node. A recorder's first take arms the worklet as it is built (`arm` in its options), not by a message:
   * an OfflineAudioContext can render a whole piece before a message posted just ahead of `startRendering()` is
   * delivered (Wave 6: found with a meter and two recorders on one offline render).
   */
  const ensureNode = (arm?: { startFrame: number; frames: number }): PcmWorkletNodeLike => {
    if (node) return node;
    node = createNode(PCM_RECORDER_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: channels,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
      processorOptions: { channels, chunkFrames, ...(arm ? { arm } : {}) },
    });
    deps.source.connect(node as never);
    return node;
  };

  return {
    prepare,
    get recording() {
      return active !== null;
    },
    stats: () => ({ ...stats }),
    async record(opts) {
      if (disposed) throw new Error("@oak/audio: the recorder was disposed");
      if (active) throw new Error("@oak/audio: a recording is already running");
      const seconds = Math.max(0, opts.seconds);
      const tail = Math.max(0, opts.tailSec ?? PCM_TAIL_SEC);
      const frames = Math.round((seconds + tail) * sr);
      // Claim the recorder before the first await, so a second call is refused at once.
      let cancelled: Error | null = null;
      active = {
        cancel(err) {
          cancelled = err;
        },
      };
      try {
        // Once the worklet is loaded the take is armed in this same task (no await): an OfflineAudioContext
        // started right after `record()` renders with the recorder already listening.
        if (!loadedNow.has(ctx)) await prepare();
      } catch (e) {
        active = null;
        throw e instanceof Error ? e : new Error(String(e));
      }
      if (cancelled) {
        active = null;
        throw cancelled;
      }
      const startAt = opts.at ?? ctx.currentTime;
      const startFrame = Math.round(startAt * sr);
      const fresh = node === null;
      const n = ensureNode({ startFrame, frames });
      return new Promise<PcmRecording>((resolve, reject) => {
        const parts: BlobPart[] = [wavHeader(frames, channels, sr)];
        let pending: Int16Array[] = [];
        let received = 0;
        /** Frames of the take placed so far (received chunks and the silence put in for lost ones). */
        let placed = 0;
        const gaps: { at: number; frames: number }[] = [];
        const pushPending = (a: Int16Array) => {
          pending.push(a);
          stats.chunks++;
          stats.heldBytes += a.byteLength;
          stats.peakHeldBytes = Math.max(stats.peakHeldBytes, stats.heldBytes);
          if (pending.length >= partChunks) fold();
        };
        stats.heldBytes = 0;
        stats.chunks = 0;
        stats.parts = 0;
        const fold = () => {
          if (pending.length === 0) return;
          parts.push(makeBlob(pending as BlobPart[], "application/octet-stream"));
          stats.parts++;
          pending = [];
          stats.heldBytes = 0;
        };
        const finish = () => {
          n.port.onmessage = null;
          active = null;
        };
        active = {
          cancel(err) {
            n.port.postMessage({ type: "cancel" });
            finish();
            pending = [];
            stats.heldBytes = 0;
            reject(err);
          },
        };
        n.port.onmessage = (e) => {
          const d = e.data as
            | { type: "chunk"; data: Int16Array; frames: number; at?: number }
            | {
                type: "done";
                first: number;
                written: number;
                peak: number;
                skipped?: number;
                skips?: { at: number; frames: number }[];
              };
          if (d.type === "chunk") {
            // A chunk that starts after the frames placed so far: the ones between were lost on the way.
            const at = d.at ?? placed;
            if (at > placed) {
              gaps.push({ at: placed, frames: at - placed });
              pushPending(new Int16Array((at - placed) * channels));
              placed = at;
            }
            pushPending(d.data);
            received += d.frames;
            placed += d.frames;
            return;
          }
          if (d.type !== "done") return;
          // Armed after `at` had passed: the missing head is silence, so the take still starts at `at`.
          const latePadFrames = d.first > startFrame ? Math.min(frames, d.first - startFrame) : 0;
          const want = frames - latePadFrames;
          if (placed < want) {
            // The last chunks never came (or the take ended early): silence to the end, so the length holds.
            gaps.push({ at: placed, frames: want - placed });
            pushPending(new Int16Array((want - placed) * channels));
            placed = want;
          }
          fold();
          const body = parts.slice(1);
          const pad = latePadFrames > 0 ? [new Int16Array(latePadFrames * channels)] : [];
          const blob = makeBlob([parts[0] as BlobPart, ...pad, ...body], "audio/wav");
          const skipped = d.skipped ?? 0;
          const all = [...gaps, ...(d.skips ?? [])].sort((a, b) => a.at - b.at);
          finish();
          resolve({
            blob,
            mime: "audio/wav",
            durationS: frames / sr,
            startAt: startFrame / sr,
            exact: true,
            frames,
            peak: d.peak,
            latePadFrames,
            missingFrames: Math.max(0, want - received) + skipped,
            dropouts: all.map((g) => ({ atS: (g.at + latePadFrames) / sr, seconds: g.frames / sr })),
          });
        };
        if (!fresh) n.port.postMessage({ type: "arm", startFrame, frames });
      });
    },
    cancel() {
      active?.cancel(new Error("@oak/audio: the recording was cancelled"));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      active?.cancel(new Error("@oak/audio: the recorder was disposed"));
      if (node) {
        try {
          deps.source.disconnect(node as never);
        } catch {
          // the source is gone already
        }
        node.port.postMessage({ type: "dispose" });
        node.disconnect();
        node = null;
      }
    },
  };
}

/** The long-take recorder on a real context: the master bus after the limiter as `source`. */
export function createPcmRecorder(
  ctx: BaseAudioContext,
  source: AudioNode,
  opts: Omit<PcmRecorderDeps, "ctx" | "source"> = {},
): PcmRecorder {
  return createPcmRecorderWith({
    ...opts,
    ctx: ctx as unknown as PcmRecorderDeps["ctx"],
    source: source as unknown as PcmRecorderDeps["source"],
  });
}
