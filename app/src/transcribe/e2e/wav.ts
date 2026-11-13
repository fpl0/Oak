// A generated recording for the own-audio specs: `bars` bars of 4/4 at `bpm` — a low thump on beats 1 and 3, a
// click on every beat and a held tone per bar (A3, then D4) — as a 16-bit mono WAV. Deterministic, small, and
// clearly rhythmic so the waveform shows its bars.
export function makeWav(o: { bpm: number; bars: number; sampleRate?: number; leadInSec?: number }): Buffer {
  const sr = o.sampleRate ?? 22050;
  const beat = 60 / o.bpm;
  const lead = o.leadInSec ?? 0;
  const seconds = lead + o.bars * 4 * beat + 0.5;
  const n = Math.round(seconds * sr);
  const x = new Float32Array(n);
  const add = (t0: number, dur: number, f: (t: number) => number) => {
    const a = Math.round(t0 * sr);
    const b = Math.min(n, Math.round((t0 + dur) * sr));
    for (let i = a; i < b; i++) x[i] = (x[i] as number) + f((i - a) / sr);
  };
  for (let bar = 0; bar < o.bars; bar++) {
    const t0 = lead + bar * 4 * beat;
    const tone = bar % 2 === 0 ? 220 : 293.66;
    add(t0, 4 * beat * 0.95, (t) => 0.12 * Math.sin(2 * Math.PI * tone * t) * Math.min(1, t * 40));
    for (let k = 0; k < 4; k++) {
      const tb = t0 + k * beat;
      add(tb, 0.05, (t) => 0.35 * Math.sin(2 * Math.PI * 1500 * t) * Math.exp(-t * 80));
      if (k % 2 === 0) add(tb, 0.25, (t) => 0.6 * Math.sin(2 * Math.PI * 60 * t) * Math.exp(-t * 14));
    }
  }
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i] as number)) * 32767), 44 + i * 2);
  return buf;
}

/**
 * A measuring recording for the A/B drift gate: one short tone burst (1 ms attack, ~60 ms) on every bar line of
 * 4/4 at `bpm`, bar 1 at `leadInSec`, nothing else. Its onsets are the source's bar lines.
 */
export function makeBarBurstWav(o: {
  bpm: number;
  bars: number;
  leadInSec: number;
  hz?: number;
  sampleRate?: number;
}): Buffer {
  const sr = o.sampleRate ?? 44100;
  const barSec = (4 * 60) / o.bpm;
  const n = Math.round((o.leadInSec + o.bars * barSec + 1) * sr);
  const hz = o.hz ?? 440;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  const x = new Float32Array(n);
  for (let b = 0; b < o.bars; b++) {
    const a = Math.round((o.leadInSec + b * barSec) * sr);
    const len = Math.round(0.06 * sr);
    for (let i = 0; i < len && a + i < n; i++) {
      const t = i / sr;
      x[a + i] = 0.7 * Math.sin(2 * Math.PI * hz * t) * Math.min(1, t * 1000) * Math.exp(-t * 40);
    }
  }
  for (let i = 0; i < n; i++)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i] as number)) * 32767), 44 + i * 2);
  return buf;
}
