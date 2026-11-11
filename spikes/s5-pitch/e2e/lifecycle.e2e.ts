import { expect, test } from '@playwright/test';
import { fakeMicArgs, MODE, save } from './helpers.ts';

test.use({ launchOptions: { args: fakeMicArgs('sine-440.wav') } });

test('node created once (warm, no mic); mic opened/closed twice; idle node posts nothing', async ({ page }, testInfo) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text()}`);
  });
  await page.goto('/');
  await page.waitForFunction(() => (window as any).oakS5);
  const r = await page.evaluate(() => (window as any).oakS5.lifecycle());
  save(testInfo, 'lifecycle', { mode: MODE, ...r, problems });
  const ph = Object.fromEntries((r.phases as { name: string; frames: number }[]).map((p) => [p.name, p.frames]));
  console.log(`[${MODE}/${testInfo.project.name}/lifecycle] phases=${JSON.stringify(ph)} sessions=${JSON.stringify(r.sessions)} stats=${JSON.stringify({ blocks: r.stats.blocks, emptyBlocks: r.stats.emptyBlocks, warmUpMs: r.stats.warmUpMs, maxBlockMs: r.stats.maxBlockMs })}`);
  expect(problems).toEqual([]);
  expect(ph['idle-before-mic']).toBe(0); // no input => no analysis, no messages
  expect(ph['idle-after-session-1']).toBe(ph['mic-session-1-closed']); // disconnect => messages stop
  expect(ph['idle-after-session-2']).toBe(ph['mic-session-2-closed']);
  for (const s of r.sessions as { openedAt: number; firstFrameAt: number; medianHz: number; n: number; trackStateAfterStop: string }[]) {
    expect(s.n).toBeGreaterThan(70); // ~1 s minus the 2048-sample fill
    expect(Math.abs(1200 * Math.log2(s.medianHz / 440))).toBeLessThanOrEqual(5);
    // ring was reset: the first frame needs a full fresh window after (re)connect
    expect(s.firstFrameAt - s.openedAt).toBeGreaterThanOrEqual(2048 / r.sampleRate - 0.003);
    expect(s.trackStateAfterStop).toBe('ended');
  }
  expect(r.stats.emptyBlocks).toBeGreaterThan(100);
  expect(r.stats.maxBlockMs).toBeLessThanOrEqual(1);
});
