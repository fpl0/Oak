import { expect, test } from '@playwright/test';
import { capture, fakeMicArgs, fmtSegs, MODE, save } from './helpers.ts';

// Default behaviour: the fake device loops the file forever.
test.use({ launchOptions: { args: fakeMicArgs('sung-a3-cs4-e4.wav') } });

test('3-note sung fixture, looping: the melody repeats', async ({ page }, testInfo) => {
  const snap = await capture(page, 'loader=worker-url&outputs=0', 7.5);
  const notes = snap.segments.map((s) => s.note);
  save(testInfo, 'sung-loop', { mode: MODE, notes, segments: snap.segments, problems: snap.problems });
  console.log(`[${MODE}/${testInfo.project.name}/sung-loop] ${fmtSegs(snap.segments)}`);
  expect(snap.problems).toEqual([]);
  expect(notes.length).toBeGreaterThanOrEqual(6);
  const joined = notes.join(' ');
  expect(joined).toContain('A3 C#4 E4 A3 C#4 E4');
  expect(new Set(notes)).toEqual(new Set(['A3', 'C#4', 'E4']));
});
