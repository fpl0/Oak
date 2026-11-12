// The output device the computer reports right now (contracts §8.6: timing is re-checked when the device
// changes). Labels appear only once the browser has granted the mic; until then this stays null and the
// settings pages say nothing.
import { classifyDeviceLabel, cleanDeviceLabel, outputKindOf } from "@oak/audio";
import { useEffect, useState } from "react";
import type { OutputChoice } from "./logic.ts";

export interface OutputDevice {
  label: string;
  kind: OutputChoice | null;
}

async function readOutput(): Promise<OutputDevice | null> {
  const md = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (!md?.enumerateDevices) return null;
  const outs = (await md.enumerateDevices()).filter((d) => d.kind === "audiooutput" && d.label);
  const d = outs.find((x) => x.deviceId === "default") ?? outs[0];
  if (!d) return null;
  const cls = classifyDeviceLabel(d.label, "audiooutput");
  const kind = cls === "unknown" || cls === "external" ? null : outputKindOf(cls);
  return { label: cleanDeviceLabel(d.label), kind: kind === "unknown" ? null : kind };
}

export function useOutputDevice(): OutputDevice | null {
  const [device, setDevice] = useState<OutputDevice | null>(null);
  useEffect(() => {
    let live = true;
    const refresh = () =>
      void readOutput()
        .then((d) => live && setDevice(d))
        .catch(() => {});
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      live = false;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, []);
  return device;
}
