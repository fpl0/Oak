// Wave 6 (CF-A): the Master read-out and the long take on a song of the single's shape — 56 bars at 100 BPM
// (2:14), a section change every eight bars, the last chorus a whole step up, its last three bars too hot —
// played through the master bus's limiter and rendered offline, faster than real time, through the same
// AudioWorklets the app uses.
//   - the meter measures the whole play-through, sample-counted: 134.4 s exactly; the level and peak before the
//     limiter equal the song's own samples; the limiter "caught the loudest hits", from where the hot bars begin
//   - the take recorded before the limiter equals the song sample for sample through every section change and the
//     key change: no dropout, nothing missing, the exact length; the take after the limiter has the level the
//     meter read
//   - a quieter play-through: the limiter rests
//   - on a running AudioContext the same meter measures one second as one second, twice
//   - the reference listen: an earlier track's loudest twenty seconds arrive at the piece's level
import { expect, test } from "@playwright/test";
import { MODE, openHarness } from "./helpers.ts";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

test(`[${MODE}] master: a 2:14 song read out and recorded whole, the limiter judged, a matched reference`, async ({
  page,
}) => {
  test.setTimeout(60_000);
  const problems = await openHarness(page);
  const run = await page.evaluate(() => window.oakAudioE2E.wave6.masterRun());
  console.log(`[${MODE}] master: ${JSON.stringify(run)}`);
  const sr = run.sampleRate;
  expect(sr).toBe(48000);

  // The read-out: the whole play-through, in dBFS.
  const r = run.reading;
  expect(r.seconds).toBe(134.4);
  expect(Math.abs(r.preLevelDb - run.truth.levelDb)).toBeLessThanOrEqual(0.1);
  expect(Math.abs(r.peakDb - run.truth.peakDb)).toBeLessThanOrEqual(0.1);
  expect(r.peakDb).toBeGreaterThan(0);
  // The limiter took the hot bars down: what leaves is under full scale, and quieter than what went in.
  expect(r.outPeakDb).toBeLessThan(r.peakDb - 1);
  expect(r.levelDb).toBeLessThan(r.preLevelDb);
  expect(r.limiter.state).toBe("touching");
  expect(r.limiter.maxReductionDb).toBeGreaterThan(1.5);
  expect(r.limiter.workingShare).toBeGreaterThan(0.03);
  expect(r.limiter.workingShare).toBeLessThanOrEqual(0.1);
  expect(Math.abs((r.limiter.firstAtSec ?? 0) - run.hotAtSec)).toBeLessThanOrEqual(0.2);
  expect(r.silentShare).toBe(0);
  // The loudest three seconds are in the hot bars.
  expect(r.loudest?.atSec ?? 0).toBeGreaterThanOrEqual(run.hotAtSec - 0.1);
  expect(run.lines[0]).toMatch(
    /^Average level −\d+\.\d dB\. Loudest moment \+\d\.\d dB before the limiter\.$/,
  );
  expect(run.lines[1]).toMatch(/^The limiter caught the loudest hits \(up to \d\.\d dB\)\.$/);

  // The take: exact length, nothing missing, no dropout, every sample through the section changes and the lift.
  const frames = Math.round((134.4 + 2) * sr);
  expect(run.dry.frames).toBe(frames);
  expect(run.dry.missingFrames).toBe(0);
  expect(run.dry.latePadFrames).toBe(0);
  expect(run.dry.worstLsb).toBeLessThanOrEqual(1);
  expect(run.dry.longestZeroRunMs).toBeLessThan(1);
  expect(run.take.frames).toBe(frames);
  expect(run.take.missingFrames).toBe(0);
  expect(run.take.bytes).toBe(44 + frames * 4);
  // What was recorded is what was measured.
  expect(Math.abs(run.take.levelDb - r.levelDb)).toBeLessThanOrEqual(0.1);
  expect(Math.abs(run.take.peakDb - r.outPeakDb)).toBeLessThanOrEqual(0.1);

  // Turned down, with no hot bars: the limiter rests.
  expect(run.quiet.state).toBe("resting");
  expect(run.quiet.maxReductionDb).toBeLessThan(1);

  // On a running context: one second is one second of samples, and the same node measures again.
  const live = await page.evaluate(() => window.oakAudioE2E.wave6.liveMeterRun());
  console.log(`[${MODE}] live meter: ${JSON.stringify(live)}`);
  expect(live.first.seconds).toBe(1);
  expect(live.first.levelDb).toBeCloseTo(-15.1, 1);
  expect(live.first.peakDb).toBeCloseTo(-12, 1);
  expect(live.first.limiter.state).toBe("resting");
  expect(live.second.seconds).toBe(0.5);
  expect(live.second.levelDb).toBeCloseTo(-15.1, 1);
  expect(live.blocks).toBe(Math.ceil(48000 / 4096) + Math.ceil(24000 / 4096));

  // The reference listen: a piece 5 dB quieter than the earlier track's chorus — the reference comes down.
  const quieter = await page.evaluate(() => window.oakAudioE2E.wave6.referenceRun({ mineDb: -14 }));
  console.log(`[${MODE}] reference (piece quieter): ${JSON.stringify(quieter)}`);
  expect(quieter.reference.fromS).toBe(12);
  expect(quieter.reference.seconds).toBe(20);
  expect(quieter.match.offsetDb).toBeLessThan(-3);
  expect(quieter.match.mineDb).toBe(0);
  expect(quieter.match.matched).toBe(true);
  expect(Math.abs(quieter.heardDb - quieter.mineDb)).toBeLessThanOrEqual(0.3);
  // The piece was muted for the listen and came back when the excerpt ended.
  expect(quieter.mineGains).toEqual([1, 0, 1]);
  expect(quieter.endedOnMine).toBe(true);
  // A piece louder than the reference: the piece is the side turned down, the reference plays as recorded.
  const louder = await page.evaluate(() => window.oakAudioE2E.wave6.referenceRun({ mineDb: -5 }));
  expect(louder.match.offsetDb).toBeGreaterThan(3);
  expect(louder.match.referenceDb).toBe(0);
  expect(Math.abs(louder.heardDb - louder.reference.levelDb)).toBeLessThanOrEqual(0.3);
  expect(Math.abs(louder.match.mineDb + louder.match.offsetDb)).toBeLessThanOrEqual(0.1);
  expect(problems).toEqual([]);
});
