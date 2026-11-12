// @oak/audio: the microphone graph and its pitch worklet, the calibration wizard's measurements, tap
// input, the transcription player and Transcribe's pattern-source hook. Browser only. The AudioContext is
// the adapter's (`OakStrudel.ctx`): this package never creates one. The waveform view is a separate entry,
// `@oak/audio/waveview`, so wavesurfer loads only where it is shown.
//
// The worklet is loaded with `?worker&url` (spike S5: an ES module in dev, a self-contained IIFE asset in
// build), never `new URL(..., import.meta.url)`, which ships the raw TypeScript as a data URL in build.

import { createMicGraphWith, type MicGraphOptions } from "./mic.ts";
import type { MicGraph } from "./types.ts";
import pitchWorkletUrl from "./worklets/pitch.worklet.ts?worker&url";

export {
  CALIBRATION,
  type CalibrationExtras,
  createCalibration,
  playPannedTone,
  QUIET_VOICE_SEC,
  quietCheckOf,
  waitUntil,
} from "./calibration.ts";
export {
  classifyDeviceLabel,
  cleanDeviceLabel,
  type DeviceClass,
  decideDevices,
  detectDevices,
  inputKindOf,
  outputKindOf,
} from "./devices.ts";
export {
  bindMicShortcut,
  createMicGraphWith,
  type MicGraphOptions,
  micConstraints,
  PITCH_PROCESSOR,
} from "./mic.ts";
export {
  audioSource,
  createPatternSource,
  loopToBars,
  type PatternPlayerLike,
  type PatternSourceOptions,
  type TranscribeSource,
  type TranscribeSourceState,
} from "./pattern-source.ts";
export { createTapInput, eventTimeToContextTime, type TapInputExtras, tapsToOnsets } from "./tap.ts";
export {
  computePeaks,
  createTranscriptionPlayer,
  FINE_TUNE_RANGE,
  POSITION_INTERVAL,
  RATE_RANGE,
  SEMITONE_RANGE,
  type TranscriptionPlayerDeps,
} from "./transcription.ts";
export * from "./types.ts";

/** The URL Vite gives the pitch worklet (dev: `/…/pitch.worklet.ts?worker_file&type=module`; build: an asset). */
export const PITCH_WORKLET_URL: string = pitchWorkletUrl;

/**
 * The microphone path on the shared context. `workletUrl` defaults to the `?worker&url` asset; pass a Blob
 * URL of the prebuilt IIFE (`scripts/build-worklet.bun.ts`) to use the spare loader.
 */
export function createMicGraph(
  ctx: AudioContext,
  opts: { workletUrl?: string; lowVoice?: boolean } & Omit<Partial<MicGraphOptions>, "workletUrl"> = {},
): MicGraph & { readonly lowVoice: boolean; readonly outputs: 0 | 1 } {
  return createMicGraphWith(ctx, { ...opts, workletUrl: opts.workletUrl ?? pitchWorkletUrl });
}
