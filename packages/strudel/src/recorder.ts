// Recorder v1 (architecture §6.5): MediaRecorder on the master bus tap. It starts at the next integer
// cycle of the active scheduler and runs for `bars / cps + tail`. UI sounds never reach the tap.
import type { Recorder, Recording, RecordOptions, Transport } from "./types.ts";

export const RECORDER_MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"] as const;

export function pickMimeType(
  wanted: string | undefined,
  isSupported: (mime: string) => boolean,
): string | undefined {
  const order = wanted
    ? [wanted, ...RECORDER_MIME_TYPES.filter((m) => m !== wanted)]
    : [...RECORDER_MIME_TYPES];
  return order.find((m) => isSupported(m));
}

/** Seconds from now until the recording starts, and how long it runs. */
export function recordingWindow(
  opts: RecordOptions,
  clock: { playing: boolean; cycle: number; cps: number; timeOfCycle: (c: number) => number; now: number },
): { delayS: number; durationS: number } {
  const bars = Math.max(0, opts.bars);
  const tail = opts.tailSec ?? 2;
  const cps = clock.cps > 0 ? clock.cps : 0.5;
  if (!clock.playing) return { delayS: 0, durationS: bars / cps + tail };
  const next = Math.ceil(clock.cycle - 1e-9);
  const at = clock.timeOfCycle(next);
  const delayS = Number.isFinite(at) ? Math.max(0, at - clock.now) : (next - clock.cycle) / cps;
  return { delayS, durationS: bars / cps + tail };
}

export interface RecorderDeps {
  ctx: AudioContext;
  tap: MediaStreamAudioDestinationNode;
  transport: Transport;
  playing: () => boolean;
  /** Called while recording (the UI-sound bus suppresses itself); returns the release. */
  onStart?: () => () => void;
}

export function createRecorder(deps: RecorderDeps): Recorder & { dispose(): void } {
  let active: {
    recorder: MediaRecorder | null;
    timers: ReturnType<typeof setTimeout>[];
    reject: (e: Error) => void;
  } | null = null;

  const finish = (): void => {
    if (!active) return;
    for (const t of active.timers) clearTimeout(t);
    active = null;
  };

  return {
    get recording() {
      return active !== null;
    },
    record(opts) {
      if (active) return Promise.reject(new Error("@oak/strudel: a recording is already running"));
      const mime = pickMimeType(opts.mimeType, (m) => MediaRecorder.isTypeSupported(m));
      const { delayS, durationS } = recordingWindow(opts, {
        playing: deps.playing(),
        cycle: deps.transport.cycle(),
        cps: deps.transport.cps(),
        timeOfCycle: (c) => deps.transport.timeOfCycle(c),
        now: deps.ctx.currentTime,
      });
      return new Promise<Recording>((resolve, reject) => {
        const state: NonNullable<typeof active> = { recorder: null, timers: [], reject };
        active = state;
        // UI sounds are suppressed from the moment a recording is asked for, through its count-in.
        let release: (() => void) | null = deps.onStart?.() ?? null;
        const fail = (err: Error): void => {
          release?.();
          release = null;
          if (active === state) finish();
          reject(err);
        };
        state.reject = (err) => {
          try {
            if (state.recorder && state.recorder.state !== "inactive") {
              state.recorder.onstop = null;
              state.recorder.stop();
            }
          } catch {
            // already stopped
          }
          fail(err);
        };
        state.timers.push(
          setTimeout(() => {
            if (active !== state) return;
            let recorder: MediaRecorder;
            try {
              recorder = new MediaRecorder(deps.tap.stream, mime ? { mimeType: mime } : undefined);
            } catch (err) {
              fail(err as Error);
              return;
            }
            state.recorder = recorder;
            const chunks: Blob[] = [];
            const startedAt = deps.ctx.currentTime;
            recorder.ondataavailable = (e) => {
              if (e.data.size > 0) chunks.push(e.data);
            };
            recorder.onerror = () => fail(new Error("@oak/strudel: MediaRecorder failed"));
            recorder.onstop = () => {
              release?.();
              release = null;
              if (active === state) finish();
              const type = recorder.mimeType || mime || "audio/webm";
              resolve({
                blob: new Blob(chunks, { type }),
                mime: type,
                durationS: deps.ctx.currentTime - startedAt,
              });
            };
            recorder.start(250);
            state.timers.push(
              setTimeout(() => {
                if (recorder.state !== "inactive") recorder.stop();
              }, durationS * 1000),
            );
          }, delayS * 1000),
        );
      });
    },
    cancel() {
      active?.reject(new Error("@oak/strudel: recording cancelled"));
    },
    dispose() {
      active?.reject(new Error("@oak/strudel: adapter disposed"));
    },
  };
}
