// The pitch worklet loads (dev: an ES module through `?worker&url`; build: a self-contained asset) and
// the fake microphone's 440 Hz reads within ±5 cents through MicGraph, with output playing on the same
// context. The spare Blob/IIFE loader is proven too.
import { expect, test } from "@playwright/test";
import { cents, fakeMicArgs, MODE, median, openHarness } from "./helpers.ts";

test.use({ launchOptions: { args: fakeMicArgs("sine-440.wav") } });

for (const loader of ["worker-url", "blob"] as const) {
  test(`[${MODE}] ${loader}: fake-mic 440 Hz within ±5 cents; mic lifecycle`, async ({ page }) => {
    const problems = await openHarness(page);
    const run = await page.evaluate((l) => window.oakAudioE2E.micRun({ loader: l, seconds: 2 }), loader);

    if (loader === "worker-url") {
      if (MODE === "dev") expect(run.workletUrl).toContain("pitch.worklet.ts?worker_file");
      else expect(run.workletUrl).toMatch(/\/assets\/pitch\.worklet-[\w-]+\.js$/);
    } else expect(run.workletUrl.startsWith("blob:")).toBe(true);
    expect(run.outputs).toBe(0);
    expect(run.states).toEqual(["closed", "opening", "live", "closed", "opening", "live", "closed"]);

    // One frame per 512-sample hop.
    const span = (run.frames.at(-1)?.t ?? 0) - (run.frames[0]?.t ?? 0);
    const rate = (run.frames.length - 1) / span;
    expect(Math.abs(rate / (run.sampleRate / 512) - 1)).toBeLessThan(0.03);
    // The last second: voiced, 440 Hz within ±5 cents.
    const tEnd = run.frames.at(-1)?.t ?? 0;
    const last = run.frames.filter((f) => f.t > tEnd - 1);
    const voiced = last.filter((f) => f.clarity >= 0.9);
    expect(voiced.length / last.length).toBeGreaterThan(0.95);
    const c = median(voiced.map((f) => cents(f.hz, 440)));
    console.log(
      `[${MODE}/${loader}] sr=${run.sampleRate} frames=${run.frames.length} rate=${rate.toFixed(2)}/s median=${c.toFixed(3)}¢ url=${run.workletUrl}`,
    );
    expect(Math.abs(c)).toBeLessThanOrEqual(5);
    // Frames carry the context time of the window's last sample: never before the session opened.
    expect(run.frames[0]?.t ?? 0).toBeGreaterThanOrEqual(run.openedAt - 0.01);
    // A reopened session starts on fresh audio: its first frame is a full window after it opened.
    expect(run.framesWhileClosed).toBe(0);
    expect(run.second.frames).toBeGreaterThan(20);
    expect((run.second.firstFrameT ?? 0) - run.second.openedAt).toBeGreaterThan(2048 / run.sampleRate - 0.02);
    expect(problems).toEqual([]);
  });
}
