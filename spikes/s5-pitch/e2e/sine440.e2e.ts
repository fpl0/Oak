import { expect, test } from '@playwright/test';
import { capture, fakeMicArgs, MODE, save, summarize } from './helpers.ts';

test.use({ launchOptions: { args: fakeMicArgs('sine-440.wav') } });

// The primary path (?worker&url, numberOfOutputs: 0, device sample rate) plus the variants production might need.
const variants = [
  { name: 'worker-url.out0.default-sr', q: 'loader=worker-url&outputs=0' },
  { name: 'worker-url.out1.default-sr', q: 'loader=worker-url&outputs=1' },
  { name: 'worker-url.out0.sr44100', q: 'loader=worker-url&outputs=0&sr=44100' },
  { name: 'worker-url.out0.sr48000', q: 'loader=worker-url&outputs=0&sr=48000' },
  { name: 'worker-url.out0.no-osc', q: 'loader=worker-url&outputs=0&osc=0' },
  { name: 'worker-url.out0.warm8', q: 'loader=worker-url&outputs=0&warm=8' },
  { name: 'blob.out0.default-sr', q: 'loader=blob&outputs=0' },
];

for (const v of variants) {
  test(`440 Hz fake mic within +-5 cents while an oscillator plays [${v.name}]`, async ({ page }, testInfo) => {
    const snap = await capture(page, v.q, 3.5);
    const s = summarize(snap, 440, 1);
    save(testInfo, `sine440.${v.name}`, s);
    console.log(
      `[${MODE}/${testInfo.project.name}/${v.name}] sr=${s.sampleRate} rate=${s.messageRateHz}/s (expected ${s.expectedRateHz}) ` +
        `median=${s.medianHz} Hz (${s.medianCents} c, range ${s.minCents}..${s.maxCents}) voiced=${s.voicedPct}% clarity=${s.medianClarity} ` +
        `rms=${s.medianRmsDb} dB oscRms=${s.oscOutputRms} postDelay(med/p95/max)=${s.postDelayMs.median}/${s.postDelayMs.p95}/${s.postDelayMs.max} ms ` +
        `gap(med/p95/max)=${s.messageGapMs.median}/${s.messageGapMs.p95}/${s.messageGapMs.max} ms lag(med/p95/max)=${s.deliveryLagMs.median}/${s.deliveryLagMs.p95}/${s.deliveryLagMs.max} ms ` +
        `findPitch(worklet)=${s.worklet.findPitchUsInWorklet} us => ${s.worklet.renderLoadPctFromBench}% of render thread; warmUp=${s.worklet.warmUpMs} ms maxBlock=${s.worklet.maxBlockMs} ms @block ${s.worklet.maxAtBlock} hist=${JSON.stringify(s.worklet.histMs_0_1_2_3plus)} (${s.worklet.clock}) empty=${s.worklet.emptyBlocks}/${s.worklet.blocks} ` +
        `findPitch(main)=${s.mainThreadFindPitchUs} us cold=${JSON.stringify(s.mainThreadColdCallsMs)} ms addModule=${s.addModuleMs} ms base/outLatency=${s.baseLatencyMs}/${s.outputLatencyMs} ms ` +
        `url=${s.workletUrl} problems=${JSON.stringify(s.problems)}`,
    );
    expect(s.problems).toEqual([]);
    expect(s.windowFrames).toBeGreaterThan(60);
    expect(s.voicedPct).toBeGreaterThan(95);
    expect(Math.abs(s.medianCents)).toBeLessThanOrEqual(5);
    expect(Math.abs(s.messageRateHz / s.expectedRateHz - 1)).toBeLessThan(0.03);
    if (!v.q.includes('osc=0')) expect(s.oscOutputRms).toBeGreaterThan(0.01);
    if (v.q.includes('sr=')) expect(s.sampleRate).toBe(Number(new URLSearchParams(v.q).get('sr')));
  });
}

// Informational: research says `new URL('./x.ts', import.meta.url)` is NOT a valid worklet loader in a build.
test('loader=new-url (expected: dev ok, build broken) — recorded, never fails', async ({ page }, testInfo) => {
  const snap = await capture(page, 'loader=new-url&outputs=0', 2);
  const ok = snap.frames.length > 50;
  const out = { mode: MODE, ok, frames: snap.frames.length, workletUrl: snap.info.workletUrl, workletHead: snap.workletHead, problems: snap.problems };
  save(testInfo, 'sine440.new-url', out);
  console.log(`[${MODE}/${testInfo.project.name}/new-url] ${JSON.stringify(out)}`);
});
