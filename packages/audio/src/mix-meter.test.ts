// Wave 7: meters for mixing — a level per part, the register each part occupies from its own spectrum, where two
// parts share a register, and a compressor's gain reduction — on synthetic renders whose answers are known.
import { describe, expect, test } from "bun:test";
import {
  averagedSpectrum,
  compressionCurveDb,
  gainReductionLine,
  HEARD_WITHIN_DB,
  levelLine,
  makeupGainDb,
  measureGainReduction,
  measureMix,
  type PartPcm,
  parseCompressor,
  partLevel,
  partRegister,
  readMix,
  registerLine,
  registerOverlaps,
  registerRole,
  SUPERDOUGH_COMPRESSOR_DEFAULTS,
  staticGainReductionDb,
} from "./mix-meter.ts";

const SR = 48000;
const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);
/** A sum of sawtooth-like partials (1/n) on each MIDI note, `amp` the first partial's peak, on during `[on, off)` of each `period` seconds. */
function render(
  notes: readonly number[],
  o: { amp: number; seconds?: number; partials?: number; gate?: (t: number) => boolean } = { amp: 0.2 },
): PartPcm {
  const n = Math.round((o.seconds ?? 2) * SR);
  const left = new Float32Array(n);
  for (const m of notes) {
    const f = midiHz(m);
    for (let k = 1; k <= (o.partials ?? 6); k++) {
      if (f * k > SR / 2) break;
      const a = o.amp / k;
      const w = (2 * Math.PI * f * k) / SR;
      for (let i = 0; i < n; i++)
        if (!o.gate || o.gate(i / SR)) left[i] = (left[i] as number) + a * Math.sin(w * i);
    }
  }
  return { left, right: left.slice(), sampleRate: SR };
}
const silent = (seconds = 2): PartPcm => ({ left: new Float32Array(seconds * SR), sampleRate: SR });
const sum = (...parts: PartPcm[]): PartPcm => {
  const n = Math.max(...parts.map((p) => p.left.length));
  const left = new Float32Array(n);
  for (const p of parts)
    for (let i = 0; i < p.left.length; i++) left[i] = (left[i] as number) + (p.left[i] as number);
  return { left, right: left.slice(), sampleRate: SR };
};

describe("a level per part", () => {
  test("a sine at 0.5 peak reads −9.0 dB; while it plays, and over a span where it rests half the time", () => {
    const sine = render([69], { amp: 0.5, partials: 1 });
    expect(partLevel(sine)).toMatchObject({
      playingDb: -9,
      spanDb: -9,
      peakDb: -6,
      playingShare: 1,
      seconds: 2,
    });
    const half = render([69], { amp: 0.5, partials: 1, gate: (t) => t % 0.5 < 0.25 });
    const l = partLevel(half);
    // Rests do not pull the playing level down (blocks of 43 ms that straddle a note's edge count as playing, so it
    // reads a little under −9); the span's average drops by 3 dB (half the power).
    expect(l.playingDb).toBeGreaterThan(-10);
    expect(l.playingDb).toBeLessThanOrEqual(-9);
    expect(l.spanDb).toBeCloseTo(-12, 0);
    expect(l.playingShare).toBeGreaterThan(0.45);
    expect(l.playingShare).toBeLessThan(0.6);
    expect(partLevel(silent())).toMatchObject({ playingDb: Number.NEGATIVE_INFINITY, playingShare: 0 });
  });
});

describe("the register each part occupies", () => {
  test("a bass on A1 (55 Hz) reads in the bass band; its lowest strong frequency is 55 Hz", () => {
    const r = partRegister(render([33], { amp: 0.4 }));
    expect(r?.role).toBe("bass");
    expect(r?.lowestHz).toBeGreaterThan(53);
    expect(r?.lowestHz).toBeLessThan(57);
    expect(r?.names.lowest).toBe("A1");
    expect(r?.peakHz).toBeCloseTo(55, 0);
    expect(r?.lowHz).toBeLessThan(r?.midHz ?? 0);
    expect(r?.midHz).toBeLessThan(r?.highHz ?? 0);
  });

  test("chords on C4 E4 G4 sit in the mid band; a lead an octave and a half up in the high band", () => {
    const keys = partRegister(render([60, 64, 67], { amp: 0.1 }));
    expect(keys?.role).toBe("mid");
    expect(keys?.names.lowest).toBe("C4");
    const lead = partRegister(render([84], { amp: 0.1, partials: 3 }));
    expect(lead?.role).toBe("high");
    expect(partRegister(silent())).toBeNull();
    expect(averagedSpectrum(silent())).toBeNull();
  });

  test("the bands: D1 sub, A1 and A2 bass, F#3 low-mid, A4 mid, C6 high", () => {
    expect(registerRole(26)).toBe("sub");
    expect(registerRole(33)).toBe("bass");
    expect(registerRole(45)).toBe("bass");
    expect(registerRole(54)).toBe("low-mid");
    expect(registerRole(69)).toBe("mid");
    expect(registerRole(84)).toBe("high");
  });

  test("two parts in one register are said to share it; a bass two octaves under the chords is not", () => {
    const parts = [
      { part: "bass", register: partRegister(render([36], { amp: 0.3, partials: 2 })) },
      { part: "keys", register: partRegister(render([48, 52, 55], { amp: 0.1, partials: 2 })) },
      { part: "pad", register: partRegister(render([50, 53, 57], { amp: 0.1, partials: 2 })) },
    ];
    const overlaps = registerOverlaps(parts);
    expect(overlaps.map((o) => `${o.a}+${o.b}`)).toEqual(["keys+pad"]);
    expect(overlaps[0]?.octaves).toBeGreaterThanOrEqual(0.5);
  });
});

describe("the mix, part by part", () => {
  const drums = render([90], { amp: 0.3, partials: 1, gate: (t) => t % 0.25 < 0.05 });
  const bass = render([33], { amp: 0.3 });
  const keys = render([60, 64, 67], { amp: 0.06 });
  const buried = render([72], { amp: 0.004 });
  const parts = { drums, bass, keys, buried };

  test("levels against the loudest, the 24 dB line, and the words", async () => {
    const calls: (string | null)[] = [];
    const progress: number[] = [];
    const reading = await measureMix(
      async (solo) => {
        calls.push(solo);
        return solo === null ? sum(drums, bass, keys, buried) : parts[solo as keyof typeof parts];
      },
      ["drums", "bass", "keys", "buried"],
      { onProgress: (p) => progress.push(p) },
    );
    expect(calls).toEqual([null, "drums", "bass", "keys", "buried"]);
    expect(progress.at(-1)).toBe(1);
    expect(reading.loudest).toBe("bass");
    const row = (p: string) => reading.parts.find((r) => r.part === p);
    expect(row("bass")?.underLoudestDb).toBe(0);
    expect(row("keys")?.heard).toBe(true);
    expect(row("buried")?.underLoudestDb).toBeGreaterThan(HEARD_WITHIN_DB);
    expect(row("buried")?.heard).toBe(false);
    expect(levelLine(row("bass") as never, reading.loudest)).toMatch(
      /^bass: −\d+\.\d dB while it plays, the loudest part$/,
    );
    expect(levelLine(row("buried") as never, reading.loudest)).toMatch(/too quiet to hear in the mix$/);
    expect(registerLine("bass", row("bass")?.register ?? null)).toMatch(
      /^bass: most of its sound between \d+ Hz \(\w#?\d\)/,
    );
    expect(reading.mix.level.playingDb).toBeGreaterThan(row("bass")?.level.playingDb ?? 0);
  });

  test("a part that plays nothing is silent, not heard, and never the loudest", () => {
    const r = readMix(sum(bass), [
      { part: "bass", pcm: bass },
      { part: "ghost", pcm: silent() },
    ]);
    expect(r.parts[1]).toMatchObject({ heard: false, register: null });
    expect(levelLine(r.parts[1] as never, r.loudest)).toBe("ghost: silent");
    expect(r.loudest).toBe("bass");
  });

  test("stopping between renders rejects and renders nothing more", async () => {
    const ctl = new AbortController();
    let n = 0;
    const p = measureMix(
      async () => {
        n++;
        ctl.abort();
        return bass;
      },
      ["bass", "keys"],
      { signal: ctl.signal },
    );
    await expect(p).rejects.toThrow("stopped");
    expect(n).toBe(1);
  });
});

describe("the compressor", () => {
  test("its argument, with superdough's defaults for what is left out", () => {
    expect(parseCompressor("-20:4:10:.002:.1")).toEqual({
      threshold: -20,
      ratio: 4,
      knee: 10,
      attack: 0.002,
      release: 0.1,
    });
    expect(parseCompressor(-12)).toEqual({ ...SUPERDOUGH_COMPRESSOR_DEFAULTS, threshold: -12 });
    expect(parseCompressor("-30:40")?.ratio).toBe(20);
    expect(parseCompressor("loud")).toBeNull();
  });

  test("the curve: unchanged below the threshold, slope 1/ratio above the knee, a smooth bend between", () => {
    const s = { threshold: -20, ratio: 4, knee: 10 };
    expect(compressionCurveDb(-30, s)).toBe(-30);
    expect(staticGainReductionDb(-20, s)).toBe(0);
    // Above the knee each 4 dB in is 1 dB out.
    expect(compressionCurveDb(-2, s) - compressionCurveDb(-6, s)).toBeCloseTo(1, 6);
    // Inside the knee it bends: some reduction, less than the straight line would take.
    const inKnee = staticGainReductionDb(-15, s);
    expect(inKnee).toBeGreaterThan(0);
    expect(inKnee).toBeLessThan(5 * (1 - 1 / 4));
    // Continuous at the knee's end, and monotone.
    expect(compressionCurveDb(-10 + 1e-6, s)).toBeCloseTo(compressionCurveDb(-10 - 1e-6, s), 4);
    let prev = Number.NEGATIVE_INFINITY;
    for (let x = -40; x <= 0; x += 0.5) {
      const y = compressionCurveDb(x, s);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
    // A hard knee is the textbook line; 1:1 changes nothing and adds no make-up.
    expect(compressionCurveDb(-8, { ...s, knee: 0 })).toBeCloseTo(-20 + 12 / 4, 9);
    expect(makeupGainDb({ threshold: 0, ratio: 1, knee: 0 })).toBeCloseTo(0, 9);
    expect(makeupGainDb(s)).toBeGreaterThan(0);
  });

  test("against Chrome's own DynamicsCompressorNode (measured once on a steady 220 Hz sine, 2 s offline)", () => {
    // [threshold, ratio, knee, the sine's RMS in dBFS, Chrome's gain reduction in dB, its make-up gain in dB]: the
    // reduction read as level in + make-up − level out after one second, and equal to the node's own `reduction`
    // within 0.03 dB. The node's detector follows the sample's absolute value, so the curve is read at the sine's
    // peak (RMS + 3.01 dB): within 0.35 dB, the rest being the detector's smoothing.
    const rows: [number, number, number, number, number, number][] = [
      [-20, 4, 10, -12, 4.65, 6.93],
      [-20, 4, 0, -6, 12.49, 9.0],
      [-30, 12, 30, -9, 5.94, 6.56],
      [-3, 10, 10, 0, 2.11, 0.37],
      [-20, 4, 10, -25, 0, 6.93],
    ];
    for (const [threshold, ratio, knee, rms, chrome, makeup] of rows) {
      const s = { threshold, ratio, knee };
      expect(Math.abs(makeupGainDb(s) - makeup)).toBeLessThan(0.01);
      expect(Math.abs(staticGainReductionDb(rms + 3.01, s) - chrome)).toBeLessThan(0.35);
    }
  });

  test("measured: a part 6 dB louder than the curve lets through reads its reduction, make-up taken out", () => {
    const s = { threshold: -20, ratio: 4, knee: 0 };
    const dry = render([57], { amp: 0.5, partials: 1 }); // −9 dBFS while it plays
    const expectRed = staticGainReductionDb(-9, s); // 8.25 dB
    const gain = 10 ** ((-expectRed + makeupGainDb(s)) / 20);
    const wet: PartPcm = { left: dry.left.map((x) => x * gain), sampleRate: SR };
    const r = measureGainReduction(wet, { left: dry.left, sampleRate: SR }, s);
    expect(Math.abs(r.maxDb - expectRed)).toBeLessThan(0.06);
    expect(Math.abs(r.meanDb - expectRed)).toBeLessThan(0.06);
    expect(r.workingShare).toBe(1);
    expect(gainReductionLine(r)).toBe(
      `The compressor took up to ${r.maxDb.toFixed(1)} dB off, ${r.meanDb.toFixed(1)} dB on average while the part plays.`,
    );
    // The same part through a 1:1 compressor: nothing.
    const none = measureGainReduction(dry, dry, { threshold: 0, ratio: 1, knee: 0 });
    expect(none.maxDb).toBe(0);
    expect(gainReductionLine(none)).toMatch(/barely touched/);
    expect(gainReductionLine(measureGainReduction(silent(), silent(), s))).toMatch(/never played/);
  });
});
