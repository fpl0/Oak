// The master recorder (wave4.md §3.4): MediaRecorder on the master bus tap (`OakStrudel.master.tap`,
// post-limiter; UI sounds never reach it) to a Blob with a KNOWN start and end — the album export of a
// transcription version over its audio, a capstone take after its count-in.
//
// MediaRecorder cannot start on a given sample, so it starts a little early (`preRollSec`) and stops a little
// late, and the AudioContext time of its first sample is noted. The recording is then decoded and cut to exactly
// `[at, at + seconds + tailSec]` on the AudioContext clock — whatever played before `at` (a count-in) is not in
// it — and written as 16-bit PCM WAV. If the browser cannot decode its own recording, the raw take is returned
// with `exact: false` (the pre-roll included) rather than nothing.

import type { MasterRecorder, MasterRecording } from "./stretch.ts";

/** Seconds the recorder starts before `at` and stops after the end. */
export const RECORDER_PRE_ROLL_SEC = 0.3;
/**
 * Seconds from the context time at `MediaRecorder.start()` to the time of the recording's first sample, as
 * measured in Chromium (packages/audio/e2e/ab-gate.pw.ts, "master recorder"): the stream already holds about
 * 15 ms rendered before the call, so the first sample is that much earlier than `currentTime`.
 */
export const RECORDER_START_OFFSET_SEC = -0.015;
/** Default seconds of tail after the asked span (reverb and release ring out). */
export const RECORDER_TAIL_SEC = 2;

/** The part of MediaRecorder this module uses. */
export interface MediaRecorderLike {
  readonly state: "inactive" | "recording" | "paused";
  readonly mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
  start(timesliceMs?: number): void;
  stop(): void;
}

export interface MasterRecorderDeps {
  ctx: Pick<AudioContext, "currentTime" | "sampleRate" | "decodeAudioData">;
  tap: Pick<MediaStreamAudioDestinationNode, "stream">;
  /** Default: `new MediaRecorder(stream, { mimeType })` (the first supported of `mimeType`, opus webm, mp4). */
  createRecorder?: (stream: MediaStream, mimeType: string | null) => MediaRecorderLike;
  /** Default: `ctx.decodeAudioData`. */
  decode?: (bytes: ArrayBuffer) => Promise<AudioBuffer>;
  /** Default `RECORDER_PRE_ROLL_SEC`. */
  preRollSec?: number;
  /**
   * Seconds between the context time at `MediaRecorder.start()` and the first recorded sample (positive: the
   * recording starts later). Default `RECORDER_START_OFFSET_SEC`, measured in Chromium.
   */
  startOffsetSec?: number;
  /** Timers (tests). */
  setTimeout?: (cb: () => void, ms: number) => unknown;
  clearTimeout?: (id: unknown) => void;
}

/** What `record` resolves, beyond the seam's `MasterRecording`. */
export interface ExactRecording extends MasterRecording {
  /** AudioContext time of the first sample. */
  startAt: number;
  /** `true`: cut to the asked span and written as WAV; `false`: the raw take, pre-roll included. */
  exact: boolean;
}

const MIME_CHOICES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function pickMime(asked: string | undefined): string | null {
  const MR = (globalThis as { MediaRecorder?: { isTypeSupported?(t: string): boolean } }).MediaRecorder;
  const ok = (t: string) => MR?.isTypeSupported?.(t) ?? false;
  if (asked && ok(asked)) return asked;
  return MIME_CHOICES.find(ok) ?? null;
}

/** 16-bit PCM WAV of `[from, from + length)` frames of every channel (silence where the buffer has none). */
export function encodeWavSlice(
  buffer: Pick<AudioBuffer, "numberOfChannels" | "sampleRate" | "length" | "getChannelData">,
  from: number,
  length: number,
): ArrayBuffer {
  const channels = Math.max(1, buffer.numberOfChannels);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  const bytes = 44 + length * channels * 2;
  const out = new ArrayBuffer(bytes);
  const v = new DataView(out);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, bytes - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, length * channels * 2, true);
  let o = 44;
  for (let i = 0; i < length; i++) {
    const k = from + i;
    for (let c = 0; c < channels; c++) {
      const ch = data[c] as Float32Array;
      const x = k >= 0 && k < ch.length ? (ch[k] as number) : 0;
      const s = Math.max(-1, Math.min(1, x));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return out;
}

export function createMasterRecorderWith(deps: MasterRecorderDeps): MasterRecorder & {
  record(opts: Parameters<MasterRecorder["record"]>[0]): Promise<ExactRecording>;
} {
  const { ctx, tap } = deps;
  const preRoll = deps.preRollSec ?? RECORDER_PRE_ROLL_SEC;
  const setT = deps.setTimeout ?? ((cb: () => void, ms: number) => setTimeout(cb, ms));
  const clearT = deps.clearTimeout ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const create =
    deps.createRecorder ??
    ((stream: MediaStream, mime: string | null) =>
      new MediaRecorder(stream, mime ? { mimeType: mime } : undefined) as unknown as MediaRecorderLike);
  const decode = deps.decode ?? ((bytes: ArrayBuffer) => ctx.decodeAudioData(bytes));
  let active: { cancel(): void } | null = null;
  let timers: unknown[] = [];

  /** Resolves once the context clock reaches `t` (polls: a timer is not on the audio clock). */
  const until = (t: number, alive: () => boolean): Promise<void> =>
    new Promise((resolve) => {
      const step = () => {
        if (!alive()) return resolve();
        const left = t - ctx.currentTime;
        if (left <= 0.002) return resolve();
        timers.push(setT(step, Math.min(200, Math.max(1, left * 1000 - 5))));
      };
      step();
    });

  return {
    get recording() {
      return active !== null;
    },
    record(opts) {
      if (active) return Promise.reject(new Error("@oak/audio: a master recording is already running"));
      const seconds = Math.max(0, opts.seconds);
      const tail = Math.max(0, opts.tailSec ?? RECORDER_TAIL_SEC);
      const startAt = opts.at ?? ctx.currentTime;
      const endAt = startAt + seconds + tail;
      const mime = pickMime(opts.mimeType);
      return new Promise<ExactRecording>((resolve, reject) => {
        let alive = true;
        let rec: MediaRecorderLike | null = null;
        const finish = () => {
          alive = false;
          active = null;
          for (const id of timers) clearT(id);
          timers = [];
        };
        active = {
          cancel() {
            if (!alive) return;
            finish();
            if (rec && rec.state !== "inactive") {
              rec.onstop = null;
              rec.stop();
            }
            reject(new Error("@oak/audio: the recording was cancelled"));
          },
        };
        void (async () => {
          await until(startAt - preRoll, () => alive);
          if (!alive) return;
          const chunks: Blob[] = [];
          try {
            rec = create(tap.stream, mime);
          } catch (e) {
            finish();
            reject(e instanceof Error ? e : new Error(String(e)));
            return;
          }
          const r = rec;
          r.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };
          r.onerror = () => {
            finish();
            reject(new Error("@oak/audio: MediaRecorder failed"));
          };
          r.start();
          const recStart = ctx.currentTime + (deps.startOffsetSec ?? RECORDER_START_OFFSET_SEC);
          r.onstop = () => {
            const type = r.mimeType || mime || "audio/webm";
            const raw = new Blob(chunks, { type });
            void (async () => {
              try {
                const decoded = await decode(await raw.arrayBuffer());
                const from = Math.round((startAt - recStart) * decoded.sampleRate);
                const length = Math.max(0, Math.round((endAt - startAt) * decoded.sampleRate));
                const wav = encodeWavSlice(decoded, from, length);
                finish();
                resolve({
                  blob: new Blob([wav], { type: "audio/wav" }),
                  mime: "audio/wav",
                  durationS: length / decoded.sampleRate,
                  startAt,
                  exact: true,
                });
              } catch {
                finish();
                resolve({
                  blob: raw,
                  mime: type,
                  durationS: endAt + preRoll - recStart,
                  startAt: recStart,
                  exact: false,
                });
              }
            })();
          };
          await until(endAt + preRoll, () => alive);
          if (!alive) return;
          if (r.state !== "inactive") r.stop();
        })();
      });
    },
    cancel() {
      active?.cancel();
    },
  };
}
