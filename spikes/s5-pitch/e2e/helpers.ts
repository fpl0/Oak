import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';

export const MODE = process.env.S5_MODE ?? 'dev';
const here = import.meta.dirname;

/** Chromium flags for a deterministic fake microphone fed from a WAV file. The path MUST be absolute. */
export function fakeMicArgs(wav: string, o: { loop?: boolean } = {}): string[] {
  const abs = resolve(here, '..', 'fixtures', wav);
  return [
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream', // auto-accept the permission prompt
    '--use-fake-device-for-media-stream', // replace real capture devices with fakes
    `--use-file-for-fake-audio-capture=${abs}${o.loop === false ? '%noloop' : ''}`,
  ];
}

export interface Frame {
  time: number;
  hz: number;
  clarity: number;
  rms: number;
  recv: number;
  perf: number;
}
export interface Segment {
  start: number;
  end: number;
  midi: number;
  hz: number;
  note: string;
  cents: number;
  frames: number;
}
export interface Snapshot {
  info: Record<string, any>;
  now: number;
  startedAt: number;
  frames: Frame[];
  segments: Segment[];
  outputRms: number;
  stats: Record<string, any>;
  workletBench?: { usPerCall: number; n: number };
  bench?: { usPerCall: number; coldMs: number[] };
  problems: string[];
  workletHead?: string;
}

export async function capture(page: Page, query: string, seconds: number): Promise<Snapshot> {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`);
  });
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => (window as any).oakS5);
  try {
    await page.evaluate(() => (window as any).oakS5.start());
  } catch (e) {
    problems.push(`start() threw: ${(e as Error).message.split('\n')[0]}`);
    return { info: {}, now: 0, startedAt: 0, frames: [], segments: [], outputRms: 0, stats: {}, problems };
  }
  await page.waitForTimeout(seconds * 1000);
  const snap = (await page.evaluate(() => (window as any).oakS5.snapshot())) as Snapshot;
  await page.evaluate(() => (window as any).oakS5.stop());
  snap.bench = await page.evaluate(() => (window as any).oakS5.bench());
  // what did the server actually send for the worklet module?
  const url = snap.info.workletUrl as string;
  if (url && !url.startsWith('blob:') && !url.startsWith('data:')) {
    snap.workletHead = await page.evaluate(async (u) => (await (await fetch(u)).text()).slice(0, 160), url);
  }
  snap.problems = problems;
  return snap;
}

const med = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[s.length >> 1] as number) : Number.NaN;
};
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[Math.min(s.length - 1, Math.floor(p * s.length))] as number) : Number.NaN;
};

/** Summary over the LAST `windowSec` seconds of frames. */
export function summarize(snap: Snapshot, targetHz: number, windowSec = 1) {
  const last = snap.frames[snap.frames.length - 1];
  const tEnd = last ? last.time : 0;
  const win = snap.frames.filter((f) => f.time > tEnd - windowSec);
  const voiced = win.filter((f) => f.clarity >= 0.9);
  const cents = voiced.map((f) => 1200 * Math.log2(f.hz / targetHz));
  const all = snap.frames;
  const span = all.length > 1 ? (all[all.length - 1] as Frame).time - (all[0] as Frame).time : 0;
  const delays = all.map((f) => (f.recv - f.time) * 1000);
  // main-thread delivery: gap between consecutive messages (ideal = hop) and lag of each message behind the audio clock
  const gaps = all.slice(1).map((f, i) => f.perf - (all[i] as Frame).perf);
  const f0 = all[0];
  const lag = f0 ? all.map((f) => f.perf - f0.perf - (f.time - f0.time) * 1000) : [];
  const minLag = Math.min(...lag);
  const relLag = lag.map((l) => l - minLag);
  const sr = snap.info.sampleRate as number;
  const st = snap.stats;
  const blockMs = (128 / sr) * 1000;
  return {
    mode: MODE,
    loader: snap.info.loader,
    numberOfOutputs: snap.info.numberOfOutputs,
    sampleRate: sr,
    requestedSampleRate: snap.info.requestedSampleRate,
    framesTotal: all.length,
    messageRateHz: span > 0 ? +((all.length - 1) / span).toFixed(3) : 0,
    expectedRateHz: +(sr / 512).toFixed(3),
    windowFrames: win.length,
    voicedPct: win.length ? +((voiced.length / win.length) * 100).toFixed(1) : 0,
    medianHz: +med(voiced.map((f) => f.hz)).toFixed(4),
    medianCents: +med(cents).toFixed(3),
    minCents: +Math.min(...cents).toFixed(3),
    maxCents: +Math.max(...cents).toFixed(3),
    medianClarity: +med(voiced.map((f) => f.clarity)).toFixed(5),
    medianRmsDb: +(20 * Math.log10(med(voiced.map((f) => f.rms)))).toFixed(2),
    oscOutputRms: +snap.outputRms.toFixed(4),
    postDelayMs: { median: +med(delays).toFixed(2), p95: +pct(delays, 0.95).toFixed(2), max: +Math.max(...delays).toFixed(2) },
    hopMs: +((512 / sr) * 1000).toFixed(3),
    messageGapMs: { median: +med(gaps).toFixed(2), p95: +pct(gaps, 0.95).toFixed(2), max: +Math.max(...gaps).toFixed(2) },
    deliveryLagMs: { median: +med(relLag).toFixed(2), p95: +pct(relLag, 0.95).toFixed(2), max: +Math.max(...relLag).toFixed(2) },
    baseLatencyMs: +((snap.info.baseLatency as number) * 1000).toFixed(2),
    outputLatencyMs: +((snap.info.outputLatencyNow as number) * 1000).toFixed(2),
    addModuleMs: +(snap.info.addModuleMs as number).toFixed(1),
    worklet: {
      blocks: st.blocks,
      emptyBlocks: st.emptyBlocks,
      clock: st.clock,
      busyMs: +(+st.busyMs).toFixed(2),
      renderLoadPct: st.blocks ? +((st.busyMs / (st.blocks * blockMs)) * 100).toFixed(3) : null,
      maxBlockMs: st.maxBlockMs,
      maxAtBlock: st.maxAtBlock,
      warmUpMs: st.warmUpMs,
      findPitchUsInWorklet: snap.workletBench ? +snap.workletBench.usPerCall.toFixed(1) : null,
      renderLoadPctFromBench: snap.workletBench ? +((snap.workletBench.usPerCall / 1000 / ((512 / sr) * 1000)) * 100).toFixed(2) : null,
      histMs_0_1_2_3plus: st.hist,
      globals: st.globals,
    },
    mainThreadFindPitchUs: snap.bench ? +snap.bench.usPerCall.toFixed(1) : null,
    mainThreadColdCallsMs: snap.bench ? snap.bench.coldMs.map((x) => +x.toFixed(2)) : null,
    trackSettings: snap.info.trackSettings,
    trackLabel: snap.info.trackLabel,
    workletUrl: snap.info.workletUrl,
    workletHead: snap.workletHead,
    userAgent: snap.info.userAgent,
    problems: snap.problems,
  };
}

export function save(testInfo: TestInfo, name: string, data: unknown) {
  const dir = join(here, '..', 'results');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${MODE}.${testInfo.project.name}.${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
}

export const fmtSegs = (segs: Segment[]) =>
  segs.map((s) => `${s.note}${s.cents >= 0 ? '+' : ''}${s.cents.toFixed(1)}c[${s.start.toFixed(3)}-${s.end.toFixed(3)}]`).join(' ');
