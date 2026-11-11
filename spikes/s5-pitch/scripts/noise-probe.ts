// bun spikes/s5-pitch/scripts/noise-probe.ts — what does pitchy report for unpitched input?
import { PitchFrameAnalyzer, type PitchFrame, PitchTracker } from '../src/pitch.ts';
import { mulberry32, tone } from '../src/synth.ts';

function analyze(signal: Float32Array, sampleRate: number, minPeriods = 2): PitchFrame[] {
  const a = new PitchFrameAnalyzer(sampleRate, { minPeriods });
  const frames: PitchFrame[] = [];
  for (let i = 0; i + 128 <= signal.length; i += 128) a.push(signal.subarray(i, i + 128), i, (f) => frames.push(f));
  return frames;
}
function pink(n: number, amp: number, seed: number): Float32Array {
  // Paul Kellet's economy pink filter
  const r = mulberry32(seed);
  const out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = amp * (b0 + b1 + b2 + w * 0.1848) * 0.25;
  }
  return out;
}
for (const minPeriods of [0, 2]) for (const sr of [44100, 48000]) {
  for (const [name, sig] of [
    ['white -20dB', tone({ hz: 440, seconds: 10, sampleRate: sr, amp: 0, noiseDb: -20, seed: 5 })],
    ['pink', pink(sr * 10, 0.3, 9)],
  ] as const) {
    const frames = analyze(sig, sr, minPeriods);
    const hi = frames.filter((f) => f.clarity >= 0.9);
    const hz = hi.map((f) => f.hz).sort((a, b) => a - b);
    const t = new PitchTracker();
    let voiced = 0;
    for (const f of frames) if (t.push(f).voiced) voiced++;
    console.log(
      `minPeriods=${minPeriods} ${name} @${sr}: frames=${frames.length} clarity>=0.9: ${hi.length} (${((hi.length / frames.length) * 100).toFixed(1)}%)` +
        ` hz[min/median/max]=${hz[0]?.toFixed(1)}/${hz[hz.length >> 1]?.toFixed(1)}/${hz[hz.length - 1]?.toFixed(1)}` +
        ` | >=60Hz: ${hi.filter((f) => f.hz >= 60).length} | tracker voiced=${voiced} segments=${t.segments().length}`,
    );
  }
}

// SNR sweep: voice-like tone (RMS ~ -15 dBFS) plus white noise at decreasing SNR
console.log('\nSNR sweep (voice wave, 48 kHz, 3 s each): voiced% at clarity>=0.9, median |cents|, gross errors (>50c among voiced)');
for (const hz of [110, 220, 440, 660]) {
  const line: string[] = [];
  for (const noiseDb of [-50, -40, -30, -25, -20]) {
    const sig = tone({ hz, seconds: 3, sampleRate: 48000, wave: 'voice', amp: 0.4, noiseDb, seed: hz + noiseDb });
    const clean = tone({ hz, seconds: 3, sampleRate: 48000, wave: 'voice', amp: 0.4 });
    let p = 0;
    for (const v of clean) p += v * v;
    const sigDb = 10 * Math.log10(p / clean.length);
    const frames = analyze(sig, 48000);
    const voiced = frames.filter((f) => f.clarity >= 0.9);
    const cents = voiced.map((f) => Math.abs(1200 * Math.log2(f.hz / hz))).sort((a, b) => a - b);
    const gross = cents.filter((c) => c > 50).length;
    line.push(`SNR ${(sigDb - noiseDb).toFixed(0)}dB: ${((voiced.length / frames.length) * 100).toFixed(0)}% med ${cents[cents.length >> 1]?.toFixed(2) ?? '-'}c gross ${gross}`);
  }
  console.log(`${hz} Hz | ${line.join(' | ')}`);
}
