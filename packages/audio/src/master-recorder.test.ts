// The master recorder on a fake MediaRecorder and a manual clock: it starts before `at`, stops after the end,
// and cuts the decoded take to exactly `[at, at + seconds + tail]`; a take it cannot decode comes back raw.
import { describe, expect, test } from "bun:test";
import { FakeContext, fakeBuffer, ManualTimers } from "./fakes.test-data.ts";
import { createMasterRecorderWith, encodeWavSlice, type MediaRecorderLike } from "./master-recorder.ts";

class FakeRecorder implements MediaRecorderLike {
  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  constructor(private readonly ctx: { currentTime: number }) {}
  start(): void {
    this.state = "recording";
    this.startedAt = this.ctx.currentTime;
  }
  stop(): void {
    this.state = "inactive";
    this.stoppedAt = this.ctx.currentTime;
    this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])]) });
    this.onstop?.();
  }
}

function setup(decodeFails = false) {
  const ctx = new FakeContext();
  ctx.currentTime = 1;
  const timers = new ManualTimers(ctx);
  const recorders: FakeRecorder[] = [];
  // The decoded take: a ramp whose value at sample i is i / sr / 100 (so a sample says when it was recorded).
  const rec = createMasterRecorderWith({
    ctx: ctx as unknown as AudioContext,
    tap: { stream: {} as MediaStream },
    createRecorder: () => {
      const r = new FakeRecorder(ctx);
      recorders.push(r);
      return r;
    },
    startOffsetSec: 0,
    decode: async () => {
      if (decodeFails) throw new Error("cannot decode");
      return fakeBuffer(12, 2);
    },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  return { ctx, timers, recorders, rec };
}

describe("createMasterRecorder", () => {
  test("pre-roll, post-roll, and a WAV cut to exactly the asked span (the count-in left out)", async () => {
    const { timers, recorders, rec } = setup();
    // A 1 s count-in from 1 s, then 4 s of music from 2 s, plus a 0.5 s tail.
    const done = rec.record({ seconds: 4, at: 2, tailSec: 0.5 });
    expect(rec.recording).toBe(true);
    await timers.runTo(1.69);
    expect(recorders).toHaveLength(0);
    await timers.runTo(1.75);
    expect(recorders[0]?.startedAt).toBeCloseTo(1.7, 2);
    await timers.runTo(7);
    const r = await done;
    expect(recorders[0]?.stoppedAt).toBeCloseTo(6.8, 2);
    expect(r).toMatchObject({ mime: "audio/wav", exact: true, startAt: 2 });
    expect(r.durationS).toBeCloseTo(4.5, 6);
    expect(rec.recording).toBe(false);
    // The WAV: 44-byte header, 4.5 s of 2 channels at 48 kHz, 16-bit.
    const bytes = new DataView(await r.blob.arrayBuffer());
    expect(bytes.getUint32(40, true)).toBe(Math.round(4.5 * 48000) * 4);
    // The first sample is the one recorded at `at`: 0.3 s into the take (the ramp says 0.3 / 100).
    const first = bytes.getInt16(44, true) / 0x7fff;
    expect(first).toBeCloseTo(0.3 / 100, 4);
  });

  test("a take the browser cannot decode comes back raw, marked not exact", async () => {
    const { timers, rec } = setup(true);
    const done = rec.record({ seconds: 1, at: 1.5, tailSec: 0 });
    await timers.runTo(4);
    const r = await done;
    expect(r.exact).toBe(false);
    expect(r.mime).toBe("audio/webm;codecs=opus");
    expect(r.blob.size).toBe(3);
  });

  test("one recording at a time; cancel rejects and stops", async () => {
    const { timers, recorders, rec } = setup();
    const done = rec.record({ seconds: 2, at: 1.1 });
    await expect(rec.record({ seconds: 1 })).rejects.toThrow("already running");
    await timers.runTo(1.5);
    rec.cancel();
    await expect(done).rejects.toThrow("cancelled");
    expect(recorders[0]?.state).toBe("inactive");
    expect(rec.recording).toBe(false);
  });

  test("encodeWavSlice pads outside the buffer with silence", () => {
    const wav = new DataView(encodeWavSlice(fakeBuffer(0.001, 1), -10, 20));
    expect(wav.getUint16(22, true)).toBe(1);
    expect(wav.getInt16(44, true)).toBe(0);
    expect(wav.getUint32(40, true)).toBe(40);
  });
});
