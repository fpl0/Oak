import { expect, type Page, test } from "@playwright/test";
import type {} from "./offline-checks.ts";
import { BAND, C3, ORBITS, ORBITS_FROZEN, SHORT, UNBOUNDED } from "./offline-fixtures.ts";
import type {} from "./offline-test.ts";

async function open(page: Page) {
  await page.routeWebSocket(/.*/, () => {});
  await page.goto("/offline-test.html");
  await page.waitForFunction(() => window.__offlineChecks !== undefined);
  await page.evaluate(() => window.__offline.oak.ready);
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.__offline?.dispose());
});

test("offline: complete two-track source, WAV, exact repeat, duration and tail", async ({ page }) => {
  await open(page);
  const r = await page.evaluate((input) => window.__offlineChecks.short(input), SHORT);
  console.log("[offline short]", JSON.stringify({ ...r, progress: [r.progress[0], r.progress.at(-1)] }));
  expect(r.same).toBe(true);
  expect(r.peak).toBeGreaterThan(0.01);
  expect(r.rms).toBeGreaterThan(0.001);
  expect(Math.abs(r.piece - 2)).toBeLessThan(0.005);
  expect(r.duration).toBeGreaterThanOrEqual(2);
  expect(r.tail).toBeLessThan(30);
  expect(r.wavBytes).toBe(44 + r.frames * 4);
  expect(r.mime).toBe("audio/wav");
  expect(r.missing).toEqual([]);
  expect(r.progress[0]).toBe(0);
  expect(r.progress.at(-1)).toBe(1);
  expect(r.progress.every((x, i) => i === 0 || x > (r.progress[i - 1] ?? -1))).toBe(true);
  expect(r.framesLeft).toBe(0);
});

test("offline: real 96-second C3 exports at 3x and matches four bars captured from the live editor", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await open(page);
  const r = await page.evaluate((input) => window.__offlineChecks.c3(input), C3);
  console.log("[offline C3]", JSON.stringify(r));
  expect(r.seconds).toBe(96);
  expect(r.bars).toBe(40);
  expect(r.ms).toBeLessThan(32_000); // Includes frame boot, all decoding, scheduling, rendering and transfer.
  expect(r.peak).toBeGreaterThan(0.01);
  expect(r.late).toBe(0);
  // 0.75 dB = 9% amplitude: permits live scheduling/128-frame boundaries and 16-bit quantization,
  // while a lost part, absent limiter or systematic gain mismatch exceeds this on the reference mix.
  for (const db of r.deltaDb) expect(Math.abs(db)).toBeLessThan(0.75);
  expect(r.skips).toEqual([]);
});

test("offline: Band follows the learner form, key and track selection, with muted backing excluded", async ({
  page,
}) => {
  await open(page);
  const r = await page.evaluate((input) => window.__offlineChecks.band(input), { band: BAND });
  console.log("[offline Band]", JSON.stringify(r));
  expect(r.bars).toBe(1);
  expect(r.missing).toEqual([]);
  expect(r.delta).toBe(true);
  expect(r.mutedSame).toBe(true);
});

test("offline: abort during rendering stops within 200 ms, disposes the realm and permits another take", async ({
  page,
}) => {
  await open(page);
  const r = await page.evaluate((input) => window.__offlineChecks.abort(input), { code: C3, short: SHORT });
  console.log("[offline abort]", JSON.stringify(r));
  expect(r.error).toBe("aborted");
  expect(r.ms).toBeLessThan(200);
  expect(r.stoppedMs).toBeLessThan(200);
  expect(r.stopped).toBe(true);
  expect(r.progressAtAbort).toBeGreaterThanOrEqual(0.2);
  expect(r.framesLeft).toBe(0);
  expect(r.nextPeak).toBeGreaterThan(0.01);
});

test("offline: a render leaves the playing editor, its context and captured audio unchanged", async ({
  page,
}) => {
  await open(page);
  const r = await page.evaluate((input) => window.__offlineChecks.concurrent(input), C3);
  console.log("[offline concurrent]", JSON.stringify(r));
  expect(r.playing).toBe(true);
  expect(r.state).toBe("running");
  expect(r.source).toContain('note("c4")');
  expect(r.same).toBe(true);
  expect(r.late).toBe(0);
  for (const db of r.deltaDb) expect(Math.abs(db)).toBeLessThan(0.2);
  expect(r.skips).toEqual([]);
});

test("offline: evaluation, silence, missing sound, excessive length, timeout and pre-abort are typed", async ({
  page,
}) => {
  await open(page);
  const r = await page.evaluate(() => window.__offlineChecks.failures());
  expect(r.failures).toEqual(["evaluation", "silent", "missing-sound", "too-long", "timeout", "aborted"]);
  expect(r.frames).toBe(0);
});

test("offline: worklet oscillator phases and pattern randomness repeat exactly", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(
    (input) => window.__offlineChecks.short(input),
    SHORT.replace('s("piano")', 's("supersaw").degradeBy(.2).seed(3)'),
  );
  expect(r.same).toBe(true);
  expect(r.peak).toBeGreaterThan(0.01);
  expect(r.missing).toEqual([]);
});

test("offline: a piece that could never end is refused before a frame exists, in plain words", async ({
  page,
}) => {
  await open(page);
  const r = await page.evaluate((input) => window.__offlineChecks.bounds(input), UNBOUNDED);
  console.log("[offline bounds]", JSON.stringify(r));
  expect(r.refusals.map((x) => x.code)).toEqual(["length", "too-long", "too-long", "length"]);
  expect(r.refusals[0]?.message).toContain("cannot stop a loop");
  expect(r.refusals[1]?.message).toContain("never finish");
  for (const x of r.refusals) expect(x.ms).toBeLessThan(250);
  expect(r.framesMade).toBe(0);
});

test("offline: effects changing every beat on shared orbits sound as the live engine plays them", async ({
  page,
}) => {
  await open(page);
  for (const changing of ['room("<', 'delaytime("<', 'delay("<', 'delayfeedback("<'])
    expect(ORBITS_FROZEN).not.toContain(changing);
  const r = await page.evaluate((input) => window.__offlineChecks.orbits(input), {
    code: ORBITS,
    frozen: ORBITS_FROZEN,
  });
  console.log("[offline orbits]", JSON.stringify({ ...r, offline: undefined, live: undefined }));
  expect(r.bars).toBe(4);
  expect(r.late).toBe(0);
  expect(r.skips).toEqual([]);
  // Measured within 0.09 dB per eighth of a bar and 0.01 per bar (2026-11-15). The control, every orbit setting
  // held at its first value, misses the live engine by 1.9 dB in some eighth (measured): more than twice the
  // tolerance, so the slices see a setting applied at the wrong time.
  for (const db of r.barDeltaDb) expect(Math.abs(db)).toBeLessThan(0.25);
  for (const db of r.deltaDb) expect(Math.abs(db)).toBeLessThan(0.5);
  expect(Math.max(...r.frozenDeltaDb.map(Math.abs))).toBeGreaterThan(1);
});
