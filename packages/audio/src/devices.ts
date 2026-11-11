// Device detection (contracts §8.6). With Bluetooth earbuds as output Oak keeps the output there and
// opens the BUILT-IN microphone: the earbuds' own mic would switch the output to a call profile.
import type { DeviceReport, InputKind, OutputKind } from "./types.ts";

export type DeviceClass = "builtin" | "external" | "bluetooth" | "wired" | "speakers" | "unknown";

const BLUETOOTH = /airpods|bluetooth|hands-?free|headset|buds|beats|bose|wh-1000|wf-1000|jabra|\bbt\b/i;
const BUILTIN = /built-?in|internal|macbook|imac|mac mini|mac studio|laptop|integrated/i;
const WIRED_OUT = /headphone|earphone|line out|lineout|external headphones|3\.5|jack/i;
const EXTERNAL =
  /usb|focusrite|scarlett|audient|motu|presonus|universal audio|apollo|steinberg|behringer|rode|shure|blue yeti|yeti|zoom|tascam|interface|external microphone/i;

/** Strips Chrome's "Default - " / "Communications - " prefixes and the "(05ac:8103)" id suffix. */
export function cleanDeviceLabel(label: string): string {
  return label
    .replace(/^(default|communications)\s*-\s*/i, "")
    .replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "")
    .trim();
}

/** Classifies a device label: /airpods|bluetooth|hands-free|headset|buds/i is Bluetooth. */
export function classifyDeviceLabel(label: string, kind: "audioinput" | "audiooutput"): DeviceClass {
  const l = cleanDeviceLabel(label);
  if (!l) return "unknown";
  if (BLUETOOTH.test(l)) return "bluetooth";
  if (kind === "audiooutput") {
    if (WIRED_OUT.test(l)) return "wired";
    if (BUILTIN.test(l) || /speaker/i.test(l)) return "speakers";
    if (EXTERNAL.test(l)) return "external";
    return "unknown";
  }
  if (BUILTIN.test(l)) return "builtin";
  if (EXTERNAL.test(l) || /microphone|mic\b/i.test(l)) return "external";
  return "unknown";
}

export function outputKindOf(cls: DeviceClass): OutputKind {
  if (cls === "bluetooth") return "bluetooth";
  if (cls === "wired") return "wired";
  if (cls === "speakers" || cls === "builtin") return "speakers";
  return "unknown";
}
export function inputKindOf(cls: DeviceClass): InputKind {
  if (cls === "bluetooth") return "bluetooth";
  if (cls === "builtin") return "builtin";
  return "external";
}

/** The pure part of `detectDevices`: decide from a device list. */
export function decideDevices(
  devices: readonly Pick<MediaDeviceInfo, "deviceId" | "kind" | "label">[],
  opts: { sinkId?: string; outputLatencyMs?: number; permission?: DeviceReport["permission"] } = {},
): DeviceReport {
  const outputs = devices.filter((d) => d.kind === "audiooutput");
  const inputs = devices.filter((d) => d.kind === "audioinput");
  const sinkId = opts.sinkId ?? "";
  const out =
    outputs.find((d) => d.deviceId === (sinkId || "default")) ??
    outputs.find((d) => d.deviceId === sinkId) ??
    outputs[0] ??
    null;
  const outClass = out ? classifyDeviceLabel(out.label, "audiooutput") : "unknown";
  const bluetoothOutput = outClass === "bluetooth";
  let input: Pick<MediaDeviceInfo, "deviceId" | "kind" | "label"> | null = null;
  if (bluetoothOutput) {
    // Never the earbuds' own mic: the built-in one, else any input that is not Bluetooth.
    input =
      inputs.find(
        (d) => classifyDeviceLabel(d.label, "audioinput") === "builtin" && d.deviceId !== "default",
      ) ??
      inputs.find((d) => classifyDeviceLabel(d.label, "audioinput") === "builtin") ??
      inputs.find((d) => classifyDeviceLabel(d.label, "audioinput") !== "bluetooth") ??
      null;
  } else {
    input = inputs.find((d) => d.deviceId === "default") ?? inputs[0] ?? null;
  }
  const inClass = input ? classifyDeviceLabel(input.label, "audioinput") : null;
  let inputKind: InputKind;
  if (inputs.length === 0) inputKind = "none";
  // No label (no permission yet) or an unrecognised one: taken as the computer's own default mic.
  else if (inClass === null || inClass === "unknown") inputKind = "builtin";
  else inputKind = inputKindOf(inClass);
  return {
    outputKind: outputKindOf(outClass),
    outputLabel: out?.label ? cleanDeviceLabel(out.label) : null,
    inputKind,
    inputDeviceId: input && input.deviceId !== "default" && input.deviceId !== "" ? input.deviceId : null,
    inputLabel: input?.label ? cleanDeviceLabel(input.label) : null,
    bluetoothOutput,
    outputLatencyMs: opts.outputLatencyMs ?? 0,
    permission: opts.permission ?? (devices.some((d) => d.label) ? "granted" : "prompt"),
  };
}

async function micPermission(): Promise<DeviceReport["permission"] | undefined> {
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state;
  } catch {
    return undefined;
  }
}

/**
 * Reads the device list and decides the input. When the output label matches Bluetooth earbuds, Oak keeps
 * the output there and selects the built-in microphone (the earbuds' own mic would switch the output to
 * a call profile). Labels are empty until the mic permission is granted; call again after it.
 */
export async function detectDevices(ctx: AudioContext): Promise<DeviceReport> {
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  const devices = md ? await md.enumerateDevices() : [];
  const sinkId = (ctx as AudioContext & { sinkId?: string | { type: string } }).sinkId;
  const outputLatencyMs = ((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000;
  const opts: { sinkId?: string; outputLatencyMs: number; permission?: DeviceReport["permission"] } = {
    outputLatencyMs,
  };
  if (typeof sinkId === "string") opts.sinkId = sinkId;
  const permission = await micPermission();
  if (permission) opts.permission = permission;
  return decideDevices(devices, opts);
}
