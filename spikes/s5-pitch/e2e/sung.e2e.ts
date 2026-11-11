import { expect, test } from '@playwright/test';
import { capture, fakeMicArgs, fmtSegs, MODE, save } from './helpers.ts';

// %noloop: the file plays once, then the fake device emits silence => exactly three notes.
test.use({ launchOptions: { args: fakeMicArgs('sung-a3-cs4-e4.wav', { loop: false }) } });

test('3-note sung fixture segments into A3 C#4 E4 (played once)', async ({ page }, testInfo) => {
  const snap = await capture(page, 'loader=worker-url&outputs=0', 4.5);
  const segs = snap.segments;
  const out = {
    mode: MODE,
    sampleRate: snap.info.sampleRate,
    notes: segs.map((s) => s.note),
    cents: segs.map((s) => +s.cents.toFixed(2)),
    durations: segs.map((s) => +(s.end - s.start).toFixed(3)),
    interOnset: segs.slice(1).map((s, i) => +(s.start - (segs[i] as { start: number }).start).toFixed(3)),
    segments: segs,
    frames: snap.frames.length,
    problems: snap.problems,
  };
  save(testInfo, 'sung-once', out);
  console.log(`[${MODE}/${testInfo.project.name}/sung-once] sr=${out.sampleRate} ${fmtSegs(segs)} | IOI=${out.interOnset} dur=${out.durations}`);
  expect(out.problems).toEqual([]);
  expect(out.notes).toEqual(['A3', 'C#4', 'E4']);
  for (const c of out.cents) expect(Math.abs(c)).toBeLessThan(10);
  // fixture onsets are 0.7 s apart, notes last 0.6 s
  for (const ioi of out.interOnset) expect(Math.abs(ioi - 0.7)).toBeLessThan(0.03);
  for (const d of out.durations) expect(Math.abs(d - 0.6)).toBeLessThan(0.06);
});
