// @oak/audio: the microphone graph and its pitch worklet, the calibration wizard's measurements, tap
// input and the transcription player. Browser only. The AudioContext is the adapter's (`OakStrudel.ctx`):
// this package never creates one.
// Promote spikes/s5-pitch (pitch.worklet.ts, main.ts) with its gotchas; the worklet is loaded with
// `import url from "./worklets/pitch.worklet.ts?worker&url"`, never `new URL(..., import.meta.url)`.
import type {
  Calibration,
  CalibrationDeps,
  DeviceReport,
  MicGraph,
  TapInput,
  TranscriptionPlayer,
} from "./types.ts";

export * from "./types.ts";

function todo(name: string): never {
  throw new Error(`@oak/audio: ${name} is not implemented yet`);
}

/** Name the worklet registers under. */
export const PITCH_PROCESSOR = "oak-pitch";

export function createMicGraph(
  ctx: AudioContext,
  opts?: { workletUrl?: string; lowVoice?: boolean },
): MicGraph {
  return todo(`createMicGraph(${ctx.sampleRate}, ${opts?.lowVoice})`);
}
/**
 * Reads the device list and decides the input. When the output label matches Bluetooth earbuds, Oak keeps
 * the output there and selects the built-in microphone (the earbuds' own mic would switch the output to
 * a call profile).
 */
export function detectDevices(ctx: AudioContext): Promise<DeviceReport> {
  return todo(`detectDevices(${ctx.sampleRate})`);
}
/** Classifies a device label: /airpods|bluetooth|hands-free|headset|buds/i is Bluetooth. */
export function classifyDeviceLabel(
  label: string,
  kind: "audioinput" | "audiooutput",
): "builtin" | "external" | "bluetooth" | "wired" | "speakers" | "unknown" {
  return todo(`classifyDeviceLabel(${label}, ${kind})`);
}
export function createCalibration(deps: CalibrationDeps): Calibration {
  return todo(`createCalibration(${deps.ctx.sampleRate})`);
}
export function createTapInput(
  ctx: AudioContext,
  opts?: { target?: EventTarget; latencyMs?: number },
): TapInput {
  return todo(`createTapInput(${ctx.sampleRate}, ${opts?.latencyMs})`);
}
/** `ctxTime = ts.contextTime + (eventTimeStamp − ts.performanceTime) / 1000`. */
export function eventTimeToContextTime(ctx: AudioContext, eventTimeStamp: number): number {
  const ts = ctx.getOutputTimestamp();
  return (
    (ts.contextTime ?? ctx.currentTime) + (eventTimeStamp - (ts.performanceTime ?? eventTimeStamp)) / 1000
  );
}
/** `output`: the node to play into, normally `OakStrudel.master.input`. */
export function createTranscriptionPlayer(
  ctx: AudioContext,
  output: AudioNode,
): Promise<TranscriptionPlayer> {
  return todo(`createTranscriptionPlayer(${ctx.sampleRate}, ${output.numberOfInputs})`);
}
/** Min/max peaks of decoded audio, interleaved [min, max, min, max, …]. */
export function computePeaks(buffer: AudioBuffer, pointsPerSecond = 100): Float32Array {
  return todo(`computePeaks(${buffer.duration}, ${pointsPerSecond})`);
}
