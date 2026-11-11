import { expect, test } from "@playwright/test";
import { guardNetwork, openLab, saveResult } from "./helpers.ts";

test("master bus: limiter + analyser + MediaStream tap, survives resetGlobalEffects, records 2 s", async ({ page, context }) => {
  const net = await guardNetwork(context);
  const { consoleErrors } = await openLab(page);
  const exportsFound = await page.evaluate(() => window.oak.exports());
  const busBefore = await page.evaluate(() => window.oak.bus());

  // --- record 2 s of the master bus
  await page.evaluate(() => window.oak.play('stack(note("c3 e3 g3 c4").s("piano"), s("bd*2, ~ sd, hh*4").bank("RolandTR909"))', { preload: 2 }));
  const recording = await page.evaluate(() => window.oak.record(2000));
  const whilePlaying = await page.evaluate(() => window.oak.measureBoth(600));
  await page.evaluate(() => window.oak.stop());
  await page.waitForTimeout(400);

  // --- makeup gain of the DynamicsCompressor on quiet material (below threshold)
  await page.evaluate(() => window.oak.play('note("a3").s("sine").gain(0.3).attack(0.3).release(0.3)'));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.oak.setTrim(1));
  await page.waitForTimeout(200);
  const quietNoTrim = await page.evaluate(() => window.oak.measureBoth(800));
  const trimGain = busBefore.trimGain;
  await page.evaluate((g) => window.oak.setTrim(g), trimGain);
  await page.waitForTimeout(200);
  const quietWithTrim = await page.evaluate(() => window.oak.measureBoth(800));
  await page.evaluate(() => window.oak.stop());
  await page.waitForTimeout(400);

  // --- hot material: the raw mix clips, the limited bus must not
  await page.evaluate(() => window.oak.play('note("c2,e2,g2,c3,e3,g3,c4,e4").s("sawtooth").gain(1.5).legato(4)'));
  await page.waitForTimeout(600);
  const hot = await page.evaluate(() => window.oak.measureBoth(1200));
  await page.evaluate(() => window.oak.stop());
  await page.waitForTimeout(400);

  // --- resetGlobalEffects() rebuilds destinationGain: the bus must re-attach by itself
  const reset = await page.evaluate(() => window.oak.resetGlobalEffects());
  await page.evaluate(() => window.oak.play('note("c3 e3 g3 c4").s("piano")'));
  const afterReset = await page.evaluate(() => window.oak.measureBoth(1200));
  await page.evaluate(() => window.oak.stop());

  const fmt = (m: { pre: { rms: number; peak: number }; post: { rms: number; peak: number }; gainDb: number; reductionDb: number }) => ({
    preRms: Number(m.pre.rms.toFixed(4)),
    prePeak: Number(m.pre.peak.toFixed(3)),
    postRms: Number(m.post.rms.toFixed(4)),
    postPeak: Number(m.post.peak.toFixed(3)),
    gainDb: Number(m.gainDb.toFixed(2)),
    reductionDb: Number(m.reductionDb.toFixed(2)),
  });
  const result = {
    destinationGain: exportsFound.destinationGain,
    bus: busBefore,
    recording,
    whilePlaying: fmt(whilePlaying),
    quietNoTrim: fmt(quietNoTrim),
    quietWithTrim: fmt(quietWithTrim),
    hot: fmt(hot),
    reset,
    afterReset: fmt(afterReset),
    external: net.external,
    consoleErrors,
  };
  saveResult("04-master-bus", result);

  expect(exportsFound.destinationGain).toBe("GainNode");
  expect(recording.size).toBeGreaterThan(5000);
  expect(recording.decodedSeconds).toBeGreaterThan(1.5);
  expect(recording.decodedRms).toBeGreaterThan(0.01);
  expect(Math.abs(quietWithTrim.gainDb)).toBeLessThan(0.3); // unity below threshold once trimmed
  expect(hot.pre.peak).toBeGreaterThan(1); // raw mix would clip
  expect(hot.post.peak).toBeLessThan(1); // limited bus does not
  expect(reset.after).toBe(reset.before + 1);
  expect(afterReset.post.rms).toBeGreaterThan(0.01);
  expect(net.external).toEqual([]);
});
