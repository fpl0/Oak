import { expect, test } from '@playwright/test';
import { capture, fakeMicArgs, fmtSegs, MODE, save } from './helpers.ts';

// No silence between the notes: the segmenter must split on the pitch jump alone.
test.use({ launchOptions: { args: fakeMicArgs('sung-a3-cs4-e4-legato.wav', { loop: false }) } });

test('legato 3-note fixture still segments into A3 C#4 E4', async ({ page }, testInfo) => {
  const snap = await capture(page, 'loader=worker-url&outputs=0', 4.5);
  const notes = snap.segments.map((s) => s.note);
  save(testInfo, 'sung-legato', { mode: MODE, notes, segments: snap.segments, problems: snap.problems });
  console.log(`[${MODE}/${testInfo.project.name}/sung-legato] ${fmtSegs(snap.segments)}`);
  expect(snap.problems).toEqual([]);
  expect(notes).toEqual(['A3', 'C#4', 'E4']);
});
