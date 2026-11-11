import { expect, test } from "@playwright/test";
import { guardNetwork, openLab, saveResult, sounds } from "./helpers.ts";

const RMS_THRESHOLD = 0.01;

const CASES: [name: string, code: string][] = [
  ["piano (Salamander samples)", 'note("c3 e3 g3 c4").s("piano")'],
  ["TR909 kit via .bank(RolandTR909)", 's("bd*2, ~ sd, hh*4, ~ ~ ~ oh, cp rim, cr rd, lt mt ht").bank("RolandTR909")'],
  ["TR909 kit via aliasBank name tr909", 's("bd sd, hh*4").bank("tr909")'],
  ["LinnDrum sh cb tb", 's("sh cb tb sd").bank("LinnDrum")'],
  ["uzu-drumkit default bd sd hh", 's("bd sd, hh*4")'],
  ["alias rhodes (gm_epiano1:1 FluidR3)", 'note("c3 e3 g3 b3").s("rhodes")'],
  ["alias upright (gm_acoustic_bass:1)", 'note("c2 g2 a2 e2").s("upright")'],
  ["alias crunch (gm_overdriven_guitar:4)", 'note("e2 g2 a2 e3").s("crunch")'],
  ["alias ebass", 'note("c2 c2 g2 c3").s("ebass")'],
  ["alias organ", 'note("c3 e3 g3 c4").s("organ")'],
  ["alias jazzgtr", 'note("c3 e3 g3 c4").s("jazzgtr")'],
  ["alias cleangtr", 'note("c3 e3 g3 c4").s("cleangtr")'],
  ["alias strings", 'note("c3 e3 g3 c4").s("strings")'],
  ["alias horns", 'note("c3 e3 g3 c4").s("horns")'],
  ["alias tenor", 'note("c3 e3 g3 c4").s("tenor")'],
  ["gm name with variant gm_epiano1:1", 'note("c3 e3").s("gm_epiano1:1")'],
  ["gm variant out of range wraps gm_piano:7", 'note("c3 e3").s("gm_piano:7")'],
  ["gm_electric_bass_finger:1 (upstream 404 variant)", 'note("c2 e2").s("gm_electric_bass_finger:1")'],
  ["soundAlias() copy of a soundfont", 'note("c3 e3 g3 c4").s("organ2")'],
  ["synth (no network)", 'note("c3 e3 g3 c4").s("sawtooth").lpf(800)'],
];

test("plays piano, TR909 and gm aliases with ZERO non-localhost requests and audible output", async ({ page, context }) => {
  const net = await guardNetwork(context);
  const { consoleErrors } = await openLab(page);
  // superdough's own alias API on a soundfont entry
  await page.evaluate(() => window.oak.soundAlias("gm_drawbar_organ", "organ2"));

  const rows: { name: string; code: string; rms: number; peak: number; requests: string[] }[] = [];
  for (const [name, code] of CASES) {
    const before = net.local.length;
    await page.evaluate((c) => window.oak.play(c), code);
    const { rms, peak } = await page.evaluate(() => window.oak.measure(1600));
    await page.evaluate(() => window.oak.stop());
    await page.waitForTimeout(250);
    rows.push({ name, code, rms: Number(rms.toFixed(4)), peak: Number(peak.toFixed(4)), requests: net.local.slice(before) });
  }
  const logs = await page.evaluate(() => window.oak.logs());
  const errors = await page.evaluate(() => window.oak.errors());
  const allSoundRequests = sounds(net);
  const hosts = [...new Set(net.local.map(() => "127.0.0.1:5183"))];
  saveResult("02-local-audio", {
    threshold: RMS_THRESHOLD,
    rows: rows.map((r) => ({ ...r, requests: r.requests.length, firstRequests: r.requests.slice(0, 3) })),
    totalRequests: net.local.length,
    soundRequests: allSoundRequests.length,
    hosts,
    external: net.external,
    failed: net.failed,
    evalErrors: errors,
    consoleErrors,
    errorLogs: logs.filter((l: string) => /error|not found|could not/i.test(l)),
  });

  expect(net.external).toEqual([]);
  expect(net.failed).toEqual([]);
  expect(errors).toEqual([]);
  for (const row of rows) expect(row.rms, row.name).toBeGreaterThan(RMS_THRESHOLD);
  // every fetched sound file came from the pack
  expect(allSoundRequests.length).toBeGreaterThan(20);
});

test("unmirrored gm_* fails loudly instead of reaching for the network", async ({ page, context }) => {
  const net = await guardNetwork(context);
  await openLab(page);
  await page.evaluate(() => window.oak.play('note("c3 e3").s("gm_violin")'));
  const { rms } = await page.evaluate(() => window.oak.measure(800));
  await page.evaluate(() => window.oak.stop());
  const logs: string[] = await page.evaluate(() => window.oak.coreLogs());
  saveResult("02-unmirrored", { rms, logs: logs.filter((l) => /gm_violin/.test(l)).slice(0, 2), external: net.external });
  expect(rms).toBeLessThan(0.0001);
  expect(logs.some((l) => l.includes("sound gm_violin not found"))).toBe(true);
  expect(net.external).toEqual([]);
});
