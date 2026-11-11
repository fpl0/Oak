import { expect, test } from '@playwright/test';
import { capture, fakeMicArgs, MODE, save, summarize } from './helpers.ts';

// A 44.1 kHz WAV: Chromium must resample it for the fake device (a rate mix-up would read as +-147 cents).
test.use({ launchOptions: { args: fakeMicArgs('sine-440-44k1.wav') } });

test('44.1 kHz fixture is resampled, not pitch-shifted', async ({ page }, testInfo) => {
  const snap = await capture(page, 'loader=worker-url&outputs=0', 3);
  const s = summarize(snap, 440, 1);
  save(testInfo, 'sine440-44k1', s);
  console.log(`[${MODE}/${testInfo.project.name}/44k1-fixture] sr=${s.sampleRate} median=${s.medianHz} Hz (${s.medianCents} c) voiced=${s.voicedPct}% track=${JSON.stringify(s.trackSettings)}`);
  expect(s.problems).toEqual([]);
  expect(Math.abs(s.medianCents)).toBeLessThanOrEqual(5);
});
