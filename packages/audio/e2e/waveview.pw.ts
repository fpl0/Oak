// The wavesurfer view renders peaks, regions, timeline and spectrogram without playing anything itself;
// a click on the waveform seeks the TranscriptionPlayer.
import { expect, test } from "@playwright/test";
import { MODE, openHarness } from "./helpers.ts";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

test(`[${MODE}] waveview: display only, click seeks the player`, async ({ page }) => {
  const problems = await openHarness(page);
  const mounted = await page.evaluate(() => window.oakAudioE2E.waveMount());
  expect(mounted.duration).toBeCloseTo(4, 2);
  expect(mounted.regions).toBe(2);
  expect(mounted.canvases).toBeGreaterThan(1);
  const box = await page.locator("#wave").boundingBox();
  if (!box) throw new Error("no wave container");
  await page.mouse.click(box.x + box.width * 0.75, box.y + 40);
  await page.waitForTimeout(100);
  const state = await page.evaluate(() => window.oakAudioE2E.waveState());
  expect(Math.abs(state.time - 3)).toBeLessThan(0.15);
  expect(state.loop).toBe(null); // the region shows the loop; only dragging it sets one
  await page.evaluate(() => window.oakAudioE2E.waveDispose());
  expect(problems).toEqual([]);
});
