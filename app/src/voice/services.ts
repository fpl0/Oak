// The audio side of the set-up screens: the app's one adapter (`getOak`), the mic graph from `lib/mic.ts` (the
// only mic entry point, so the shell's "Mic live" dot is always truthful), and @oak/audio's calibration
// wired to Oak's sounds: a rim click for timing and a sine for the bleed and pitch tones.
import type { Calibration, MicGraph, MicSession } from "@oak/audio";
import type { OakStrudel } from "@oak/strudel";
import { closeMic, getMicGraph, openMic } from "../lib/mic.ts";
import { getOak } from "../lib/oak.ts";

export interface VoiceAudio {
  oak: OakStrudel;
  calibration: Calibration;
}

/** Plays one sound at a context time on top of whatever plays (never stops the loop). */
export function playAt(
  oak: OakStrudel,
  value: { s: string; note?: number; gain?: number },
  at: number,
  dur: number,
): void {
  oak.playEvents(
    { events: [{ at: 0, dur, value: { gain: 0.8, ...value } }], durationSec: dur, preload: [value.s] },
    { at, exclusive: false },
  );
}

/** A graph that opens `deviceId` unless told otherwise (AirPods mode: the built-in mic, contracts §8.6). */
function withDevice(g: MicGraph, deviceId: () => string | null): MicGraph {
  return {
    prepare: () => g.prepare(),
    open: (o) => g.open({ deviceId: o?.deviceId ?? deviceId() }),
    get state() {
      return g.state;
    },
    subscribe: (cb) => g.subscribe(cb),
    closeAll: () => g.closeAll(),
    // The app's graph lives for the page; a calibration never disposes it.
    dispose: () => {},
  };
}

let pending: Promise<VoiceAudio> | null = null;
let device: string | null = null;

/** The input the set-up chose (null: the system default). Measurements open this one. */
export function setInputDevice(id: string | null): void {
  device = id;
}
export function inputDevice(): string | null {
  return device;
}

/** Call from a user gesture: it may create the adapter and resume the context. */
export function voiceAudio(): Promise<VoiceAudio> {
  pending ??= (async () => {
    const oak = await getOak();
    const [{ createCalibration }, graph] = await Promise.all([import("@oak/audio"), getMicGraph()]);
    // The click and the piano are the only samples the set-up uses; warm them before the first measurement.
    await oak.preload({ sounds: [{ s: "rim" }, { s: "piano" }] }).catch(() => undefined);
    const calibration = createCalibration({
      ctx: oak.ctx,
      mic: withDevice(graph, () => device),
      playClick: (at) => playAt(oak, { s: "rim", gain: 0.9 }, at, 0.08),
      playTone: (midi, at, dur) => playAt(oak, { s: "sine", note: midi, gain: 0.35 }, at, dur),
    });
    return { oak, calibration };
  })().catch((e: unknown) => {
    pending = null;
    throw e;
  });
  return pending;
}

/** Opens the chosen input through `lib/mic.ts`. */
export function openInput(): Promise<MicSession> {
  return openMic({ deviceId: device });
}

/** Closes whatever is open (leaving a screen mid-measurement). */
export function closeInput(): void {
  closeMic();
}

/** The audio inputs the browser lists (labels appear only after permission). */
export async function listInputs(): Promise<{ deviceId: string; label: string }[]> {
  const md = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (!md) return [];
  const all = await md.enumerateDevices();
  return all
    .filter((d) => d.kind === "audioinput" && d.deviceId !== "" && d.deviceId !== "communications")
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
}

/** The browser's own answer about the mic permission, when it gives one. */
export async function micPermission(): Promise<"granted" | "denied" | "prompt" | null> {
  try {
    const s = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return s.state;
  } catch {
    return null;
  }
}
