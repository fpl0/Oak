import { expect, test } from '@playwright/test';
import { fakeMicArgs, MODE, save } from './helpers.ts';

test.use({ launchOptions: { args: fakeMicArgs('sine-440.wav') } });

test('440 Hz fake mic within +-5 cents while real superdough (supersaw + worklet FX) plays on the same context', async ({ page }, testInfo) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text()}`);
  });
  await page.goto('/strudel.html');
  await page.waitForFunction(() => (window as any).oakS5Strudel);
  const r = await page.evaluate(() => (window as any).oakS5Strudel(3));
  const frames = r.frames as { time: number; hz: number; clarity: number; perf: number }[];
  const tEnd = (frames[frames.length - 1] as { time: number }).time;
  const win = frames.filter((f) => f.time > tEnd - 1);
  const voiced = win.filter((f) => f.clarity >= 0.9);
  const cents = voiced.map((f) => 1200 * Math.log2(f.hz / 440)).sort((a, b) => a - b);
  const median = cents[cents.length >> 1] as number;
  const span = tEnd - (frames[0] as { time: number }).time;
  const gaps = frames.slice(1).map((f, i) => f.perf - (frames[i] as { perf: number }).perf).sort((a, b) => a - b);
  const out = {
    mode: MODE,
    sampleRate: r.sampleRate,
    state: r.state,
    superdoughVoicesScheduled: r.scheduled,
    superdoughFailed: r.failed,
    superdoughPeakRms: +r.superdoughPeakRms.toFixed(4),
    frames: frames.length,
    messageRateHz: +((frames.length - 1) / span).toFixed(3),
    expectedRateHz: +(r.sampleRate / 512).toFixed(3),
    voicedPct: +((voiced.length / win.length) * 100).toFixed(1),
    medianCents: +median.toFixed(4),
    centsRange: [+(cents[0] as number).toFixed(4), +(cents[cents.length - 1] as number).toFixed(4)],
    messageGapMs: { median: +(gaps[gaps.length >> 1] as number).toFixed(2), p95: +(gaps[Math.floor(gaps.length * 0.95)] as number).toFixed(2), max: +(gaps[gaps.length - 1] as number).toFixed(2) },
    segments: (r.segments as { note: string; cents: number }[]).map((s) => `${s.note}${s.cents >= 0 ? '+' : ''}${s.cents.toFixed(2)}c`),
    logs: r.logs,
    problems,
  };
  save(testInfo, 'strudel-coexist', out);
  console.log(`[${MODE}/${testInfo.project.name}/strudel-coexist] ${JSON.stringify(out)}`);
  expect(out.superdoughFailed).toBe(0);
  expect(out.superdoughPeakRms).toBeGreaterThan(0.01);
  expect(out.voicedPct).toBeGreaterThan(95);
  expect(Math.abs(out.medianCents)).toBeLessThanOrEqual(5);
  expect(Math.abs(out.messageRateHz / out.expectedRateHz - 1)).toBeLessThan(0.03);
  expect(out.segments).toEqual([expect.stringMatching(/^A4/)]);
});
