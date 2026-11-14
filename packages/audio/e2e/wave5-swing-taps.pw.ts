// Wave 5 (U11.L07): a shuffle tapped on the keyboard against a click. The page plays a count-in and eight beats,
// the TapPad keys are armed (Space; `createTapInput` maps KeyboardEvent.timeStamp to the AudioContext clock), and
// the spec presses Space on each beat and on its off-beat two thirds of the way through it. `gradeSwingTaps`
// grades the take by the §8.4 rule and measures the swing: about 2:1, the feel right. Even eighths tapped against
// the same shuffle measure 1:1 and miss the off-beat window.
import { expect, test } from "@playwright/test";
import { MODE, openHarness } from "./helpers.ts";
import { tapAt } from "./tap-helpers.ts";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

const BPM = 100;
const SLOTS = 8;

for (const feel of ["shuffle", "straight"] as const) {
  test(`[${MODE}] swing taps: ${feel} eighths against a shuffle click`, async ({ page }) => {
    test.setTimeout(60_000);
    const problems = await openHarness(page);
    const { perfDownbeat, beatMs } = await page.evaluate((o) => window.oakAudioE2E.wave5.tapStart(o), {
      bpm: BPM,
      slots: SLOTS,
    });
    const p = feel === "shuffle" ? 2 / 3 : 1 / 2;
    const offsets: number[] = [];
    for (let k = 0; k < SLOTS; k++) offsets.push(k * beatMs, (k + p) * beatMs);
    offsets.push(SLOTS * beatMs);
    await tapAt(page, perfDownbeat, offsets);
    await page.waitForTimeout(300);
    const run = await page.evaluate(() => window.oakAudioE2E.wave5.tapFinish({ amount: 1 / 3 }));
    console.log(`[${MODE}] ${feel}: ${JSON.stringify(run)}`);
    expect(run.taps).toBe(2 * SLOTS + 1);
    expect(run.measured).toBeGreaterThanOrEqual(SLOTS - 1);
    if (feel === "shuffle") {
      expect(run.ratio).toBeGreaterThan(1.75);
      expect(run.ratio).toBeLessThan(2.3);
      expect(run.cls).toBe("triplet");
      expect(run.feelOk).toBe(true);
      expect(run.pass).toBe(true);
      expect(run.swingLine).toMatchObject({ exp: "2:1", expFeel: "swung (long–short)" });
    } else {
      expect(run.ratio).toBeLessThan(1.2);
      expect(run.cls).toBe("straight");
      expect(run.feelOk).toBe(false);
      expect(run.pass).toBe(false);
      expect(run.swingLine).toMatchObject({ got: "1:1", dir: "early" });
    }
    expect(problems).toEqual([]);
  });
}
