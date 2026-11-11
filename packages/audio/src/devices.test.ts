import { describe, expect, test } from "bun:test";
import { classifyDeviceLabel, cleanDeviceLabel, decideDevices } from "./devices.ts";

const dev = (kind: MediaDeviceKind, deviceId: string, label: string) => ({ kind, deviceId, label });

describe("classifyDeviceLabel", () => {
  test.each([
    ["Default - AirPods Pro (Bluetooth)", "audiooutput", "bluetooth"],
    ["Galaxy Buds2 Pro", "audiooutput", "bluetooth"],
    ["Jabra Evolve2 65 Hands-Free", "audioinput", "bluetooth"],
    ["MacBook Pro Speakers (Built-in)", "audiooutput", "speakers"],
    ["MacBook Pro Microphone (Built-in)", "audioinput", "builtin"],
    ["External Headphones", "audiooutput", "wired"],
    ["Scarlett 2i2 USB (1235:8210)", "audioinput", "external"],
    ["Scarlett 2i2 USB (1235:8210)", "audiooutput", "external"],
    ["Fake Default Audio Input", "audioinput", "unknown"],
    ["", "audioinput", "unknown"],
  ] as const)("%s (%s) → %s", (label, kind, want) => {
    expect(classifyDeviceLabel(label, kind)).toBe(want);
  });
  test("cleanDeviceLabel", () => {
    expect(cleanDeviceLabel("Default - AirPods Pro (05ac:200e)")).toBe("AirPods Pro");
  });
});

describe("decideDevices", () => {
  const mac = [
    dev("audioinput", "default", "Default - AirPods Pro"),
    dev("audioinput", "in-airpods", "AirPods Pro"),
    dev("audioinput", "in-builtin", "MacBook Pro Microphone (Built-in)"),
    dev("audiooutput", "default", "Default - AirPods Pro"),
    dev("audiooutput", "out-airpods", "AirPods Pro"),
    dev("audiooutput", "out-speakers", "MacBook Pro Speakers (Built-in)"),
  ];

  test("AirPods as output: keep them, open the built-in microphone", () => {
    const r = decideDevices(mac, { outputLatencyMs: 160, permission: "granted" });
    expect(r).toEqual({
      outputKind: "bluetooth",
      outputLabel: "AirPods Pro",
      inputKind: "builtin",
      inputDeviceId: "in-builtin",
      inputLabel: "MacBook Pro Microphone (Built-in)",
      bluetoothOutput: true,
      outputLatencyMs: 160,
      permission: "granted",
    });
  });

  test("speakers: the default input; a chosen sink is honoured", () => {
    const speakers = mac.map((d) =>
      d.deviceId === "default"
        ? {
            ...d,
            label:
              d.kind === "audioinput"
                ? "Default - MacBook Pro Microphone (Built-in)"
                : "Default - MacBook Pro Speakers (Built-in)",
          }
        : d,
    );
    const r = decideDevices(speakers);
    expect(r.outputKind).toBe("speakers");
    expect(r.bluetoothOutput).toBe(false);
    expect(r.inputDeviceId).toBe(null); // the default device
    expect(r.inputKind).toBe("builtin");
    expect(decideDevices(speakers, { sinkId: "out-airpods" }).bluetoothOutput).toBe(true);
  });

  test("before permission labels are empty; no input at all is 'none'", () => {
    const r = decideDevices([dev("audioinput", "", ""), dev("audiooutput", "", "")]);
    expect(r.permission).toBe("prompt");
    expect(r.outputKind).toBe("unknown");
    expect(r.inputKind).toBe("builtin");
    expect(decideDevices([dev("audiooutput", "default", "Speakers")]).inputKind).toBe("none");
  });
});
