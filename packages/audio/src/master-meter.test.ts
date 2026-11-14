// Wave 6 (CF-A "Master"): the worklet's own source runs here against a simulated render loop with a simulated
// limiter (a 6 ms look-ahead and a gain), so the sample counting, the look-ahead alignment and the read-out are
// tested on the code that ships. The browser path (a real DynamicsCompressorNode in an OfflineAudioContext, a
// two-minute piece) is proved in packages/audio/e2e/wave6-master.pw.ts.
import { describe, expect, test } from "bun:test";
import {
  blockReductionDb,
  createMasterMeterWith,
  createReferenceAb,
  dbToGain,
  gainFactor,
  LIMITER_LOOKAHEAD_SEC,
  levelAdvice,
  levelOfBuffer,
  levelText,
  limiterState,
  limiterWords,
  loudestSpan,
  loudnessWords,
  MASTER_METER_PROCESSOR,
  MASTER_METER_SOURCE,
  type MeterBlock,
  type MeterLive,
  type MeterWorkletNodeLike,
  matchLoudness,
  QUIET_PEAK_DB,
  readingLines,
  summarizeMeter,
  TARGET_PEAK_DB,
} from "./master-meter.ts";

type Msg = { data: unknown };
interface Proc {
  port: { onmessage: ((e: Msg) => void) | null; postMessage(m: unknown): void };
  process(inputs: Float32Array[][]): boolean;
}
const SR = 48000;
const LOOKAHEAD = Math.round(LIMITER_LOOKAHEAD_SEC * SR);

/** The worklet source in a fake AudioWorkletGlobalScope; `render` feeds it a bus and that bus through a "limiter". */
function harness() {
  const frame = { v: 0 };
  let Ctor: (new (o: unknown) => Proc) | null = null;
  let toMain: ((e: Msg) => void) | null = null;
  class AudioWorkletProcessor {
    port = {
      onmessage: null as ((e: Msg) => void) | null,
      postMessage: (m: unknown) => queueMicrotask(() => toMain?.({ data: m })),
    };
  }
  new Function(
    "AudioWorkletProcessor",
    "registerProcessor",
    "__frame",
    MASTER_METER_SOURCE.replaceAll("currentFrame", "__frame.v"),
  )(
    AudioWorkletProcessor,
    (name: string, C: new (o: unknown) => Proc) => {
      expect(name).toBe(MASTER_METER_PROCESSOR);
      Ctor = C;
    },
    frame,
  );
  let proc: Proc | null = null;
  let options: AudioWorkletNodeOptions | null = null;
  const node: MeterWorkletNodeLike & { connected: boolean } = {
    connected: true,
    port: { onmessage: null, postMessage: (m: unknown) => proc?.port.onmessage?.({ data: m }) },
    disconnect() {
      this.connected = false;
    },
  };
  toMain = (e) => node.port.onmessage?.(e);
  const ctx = {
    sampleRate: SR,
    get currentTime() {
      return frame.v / SR;
    },
    audioWorklet: { addModule: async (_url: string) => {} },
  };
  const edges: [string, number][] = [];
  const bus = (name: string) => ({
    connect(_d: never, _o?: number, input?: number) {
      edges.push([name, input ?? 0]);
      return _d;
    },
    disconnect(_d: never, _o?: number, input?: number) {
      const i = edges.findIndex(([n, k]) => n === name && k === (input ?? 0));
      if (i >= 0) edges.splice(i, 1);
    },
  });
  const createNode = (_name: string, o: AudioWorkletNodeOptions) => {
    options = o;
    proc = new (Ctor as new (o: unknown) => Proc)(o);
    return node;
  };
  /**
   * Renders `frames` frames: `signal(frame)` is the bus before the limiter; after it the same signal arrives
   * `LOOKAHEAD` frames later times `gain(frame)` (the limiter's gain at the frame it lets out).
   */
  const render = async (
    frames: number,
    signal: (f: number) => number,
    gain: (f: number) => number = () => 1,
  ) => {
    const end = frame.v + frames;
    let quanta = 0;
    while (frame.v < end) {
      const pre = new Float32Array(128);
      const post = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        const f = frame.v + i;
        pre[i] = signal(f);
        post[i] = f - LOOKAHEAD >= 0 ? signal(f - LOOKAHEAD) * gain(f) : 0;
      }
      proc?.process([
        [pre, pre],
        [post, post],
      ]);
      frame.v += 128;
      if (++quanta % 64 === 0) await Promise.resolve();
    }
    for (let i = 0; i < 4; i++) await Promise.resolve();
  };
  return {
    frame,
    ctx,
    pre: bus("pre"),
    post: bus("post"),
    node,
    createNode,
    render,
    edges,
    options: () => options,
  };
}

const sine =
  (amp: number, hz = 220) =>
  (f: number) =>
    amp * Math.sin((2 * Math.PI * hz * f) / SR);

describe("the Master meter", () => {
  test("a steady tone below the limiter: its RMS and peak in dBFS, counted over exactly the asked span", async () => {
    const h = harness();
    const meter = createMasterMeterWith({ ctx: h.ctx, pre: h.pre, post: h.post, createNode: h.createNode });
    const live: MeterLive[] = [];
    meter.subscribe((l) => live.push(l));
    const run = meter.measure({ at: 0.5, seconds: 4 });
    await h.render(SR / 4, sine(0.25));
    expect(meter.measuring).toBe(true);
    await h.render(5 * SR, sine(0.25));
    const r = await run;
    expect(meter.measuring).toBe(false);
    expect(r.seconds).toBe(4);
    // A sine of amplitude 0.25: peak −12.04 dBFS, RMS 3.01 dB under it.
    expect(r.peakDb).toBeCloseTo(-12, 0);
    expect(r.levelDb).toBeCloseTo(-15.1, 1);
    expect(r.preLevelDb).toBe(r.levelDb);
    expect(r.outPeakDb).toBe(r.peakDb);
    expect(r.limiter).toEqual({ state: "resting", maxReductionDb: 0, workingShare: 0, firstAtSec: null });
    expect(r.silentShare).toBe(0);
    expect(r.loudest).toMatchObject({ levelDb: r.levelDb, atSec: 0 });
    // The node: two inputs (before and after the limiter), the look-ahead as a delay in frames.
    expect(h.options()).toMatchObject({ numberOfInputs: 2, numberOfOutputs: 0 });
    expect(h.options()).toMatchObject({ processorOptions: { delayFrames: 288, blockFrames: 4096 } });
    // The first measurement arms the worklet as it is built: no message is needed to start it.
    expect(h.options()).toMatchObject({ processorOptions: { arm: { startFrame: 24000, frames: 192000 } } });
    expect(h.edges).toEqual([
      ["pre", 0],
      ["post", 1],
    ]);
    // A block about twelve times a second while it measured.
    expect(live.length).toBe(Math.ceil((4 * SR) / 4096));
    expect(live[live.length - 1]?.seconds).toBe(4);
    expect(readingLines(r)).toEqual([
      "Average level −15.1 dB. Loudest moment −12.0 dB before the limiter.",
      "The limiter rested.",
    ]);
    meter.dispose();
    expect(h.edges).toEqual([]);
    expect(h.node.connected).toBe(false);
  });

  test("the look-ahead is taken out: a hit at a block edge is not read as gain reduction", async () => {
    const h = harness();
    const meter = createMasterMeterWith({ ctx: h.ctx, pre: h.pre, post: h.post, createNode: h.createNode });
    // Silence, then a loud tone that begins 100 frames before a block boundary (block 4096 frames, armed at 0).
    const onset = 4096 * 6 - 100;
    const signal = (f: number) => (f >= onset ? sine(0.5)(f) : sine(0.01)(f));
    const run = meter.measure({ at: 0, seconds: 2 });
    await h.render(3 * SR, signal);
    const r = await run;
    expect(r.limiter.maxReductionDb).toBe(0);
    expect(r.limiter.state).toBe("resting");
    // With no compensation the same audio reads as several dB "taken off" in the onset's block.
    const h2 = harness();
    const naive = createMasterMeterWith({
      ctx: h2.ctx,
      pre: h2.pre,
      post: h2.post,
      createNode: h2.createNode,
      lookaheadSec: 0,
    });
    const run2 = naive.measure({ at: 0, seconds: 2 });
    await h2.render(3 * SR, signal);
    expect((await run2).limiter.maxReductionDb).toBeGreaterThan(3);
  });

  test("a limiter that works on the last chorus only: touching, with where it began; throughout: working", async () => {
    const h = harness();
    const meter = createMasterMeterWith({ ctx: h.ctx, pre: h.pre, post: h.post, createNode: h.createNode });
    // 10 s: quiet for 9.5 s, then half a second 6 dB hot that the limiter turns down by 4 dB.
    const loudFrom = 9.5 * SR;
    const signal = (f: number) => (f >= loudFrom ? sine(1.2)(f) : sine(0.3)(f));
    const gain = (f: number) => (f - LOOKAHEAD >= loudFrom ? dbToGain(-4) : 1);
    const run = meter.measure({ at: 0, seconds: 10 });
    await h.render(11 * SR, signal, gain);
    const r = await run;
    expect(r.limiter.state).toBe("touching");
    expect(r.limiter.maxReductionDb).toBeCloseTo(4, 1);
    expect(r.limiter.workingShare).toBeGreaterThan(0.03);
    expect(r.limiter.workingShare).toBeLessThanOrEqual(0.1);
    expect(r.limiter.firstAtSec).toBeCloseTo(9.5, 0);
    expect(r.peakDb).toBeCloseTo(1.6, 1);
    expect(r.outPeakDb).toBeCloseTo(-2.4, 1);
    expect(limiterWords(r)).toBe("The limiter caught the loudest hits (up to 4.0 dB).");
    expect(readingLines(r)[0]).toContain("Loudest moment +1.6 dB before the limiter.");

    const h2 = harness();
    const m2 = createMasterMeterWith({ ctx: h2.ctx, pre: h2.pre, post: h2.post, createNode: h2.createNode });
    const run2 = m2.measure({ at: 0, seconds: 4 });
    await h2.render(5 * SR, sine(1.4), () => dbToGain(-6));
    const hot = await run2;
    expect(hot.limiter.state).toBe("working");
    expect(hot.limiter.workingShare).toBeGreaterThan(0.95);
    expect(hot.limiter.maxReductionDb).toBeCloseTo(6, 1);
    expect(limiterWords(hot)).toMatch(
      /^The limiter worked through \d+% of it \(up to 6\.0 dB\)\. Turn every/,
    );
  });

  test("an open measurement runs until stop(); rests are counted as silence, not as limiting", async () => {
    const h = harness();
    const meter = createMasterMeterWith({ ctx: h.ctx, pre: h.pre, post: h.post, createNode: h.createNode });
    await meter.prepare();
    const run = meter.measure();
    // One second of tone, one of silence, twice.
    await h.render(4 * SR, (f) => (Math.floor(f / SR) % 2 === 0 ? sine(0.5)(f) : 0));
    expect(meter.reading()?.seconds).toBeGreaterThan(3.9);
    meter.stop();
    await h.render(SR / 10, () => 0);
    const r = await run;
    expect(r.seconds).toBeCloseTo(4, 1);
    expect(r.silentShare).toBeCloseTo(0.5, 1);
    expect(r.limiter.state).toBe("resting");
    // Half the time silent: the average is 3 dB under the tone's own −9 dB.
    expect(r.levelDb).toBeCloseTo(-12, 0);
    expect(r.loudest?.levelDb).toBeGreaterThan(r.levelDb);
    // A second measurement on the same meter starts clean.
    const again = meter.measure({ seconds: 1 });
    await h.render(2 * SR, sine(0.1));
    expect((await again).levelDb).toBeCloseTo(-23, 0);
  });

  test("a second measure while one runs is refused; dispose rejects the one in flight", async () => {
    const h = harness();
    const meter = createMasterMeterWith({ ctx: h.ctx, pre: h.pre, post: h.post, createNode: h.createNode });
    const run = meter.measure({ seconds: 10 });
    await h.render(SR / 2, sine(0.2));
    await expect(meter.measure({ seconds: 1 })).rejects.toThrow("already running");
    meter.dispose();
    await expect(run).rejects.toThrow("disposed");
    await expect(meter.measure()).rejects.toThrow("disposed");
  });

  test("the pure sums: reduction per block, the limiter's verdict, the printed level", () => {
    const block = (pre: number, post: number, frames = 4096): MeterBlock => ({
      frames,
      preSq: pre * pre * frames,
      prePeak: pre * Math.SQRT2,
      postSq: post * post * frames,
      postPeak: post * Math.SQRT2,
    });
    expect(blockReductionDb(block(0.5, 0.5))).toBe(0);
    expect(blockReductionDb(block(0.5, 0.25))).toBeCloseTo(6.02, 2);
    // Silence, and a block the limiter made louder (its release), are no reduction.
    expect(blockReductionDb(block(1e-5, 0))).toBe(0);
    expect(blockReductionDb(block(0.2, 0.25))).toBe(0);
    expect(limiterState(0.9, 1)).toBe("resting");
    expect(limiterState(3, 0.1)).toBe("touching");
    // The limiter catching every kick of a shipped flavour piece (2–4 dB in a quarter of the blocks) is touching.
    expect(limiterState(3.8, 0.26)).toBe("touching");
    expect(limiterState(3, 0.4)).toBe("touching");
    expect(limiterState(3, 0.41)).toBe("working");
    expect(levelText(-14.24)).toBe("−14.2 dB");
    expect(levelText(0.96)).toBe("+1.0 dB");
    expect(levelText(0)).toBe("0.0 dB");
    expect(levelText(Number.NEGATIVE_INFINITY)).toBe("silent");
    const empty = summarizeMeter([], SR);
    expect(empty.levelDb).toBe(Number.NEGATIVE_INFINITY);
    expect(readingLines(empty)).toEqual(["Nothing sounded while Oak was measuring."]);
    // Too short for a loudest stretch.
    expect(summarizeMeter([block(0.3, 0.3)], SR).loudest).toBeNull();
  });
});

/** A fake decoded track: `levels[k]` is the amplitude of second k (a sine), on `channels` channels. */
function track(levels: readonly number[], channels = 2, sr = 8000) {
  const data = Array.from({ length: channels }, () => {
    const x = new Float32Array(levels.length * sr);
    for (let i = 0; i < x.length; i++)
      x[i] = (levels[Math.floor(i / sr)] as number) * Math.sin((2 * Math.PI * 200 * i) / sr);
    return x;
  });
  return {
    numberOfChannels: channels,
    sampleRate: sr,
    length: levels.length * sr,
    getChannelData: (c: number) => data[c] as Float32Array,
  };
}

describe("the reference listen", () => {
  test("the level of a decoded track and its loudest stretch", () => {
    // 30 s: a quiet verse, a chorus from 10 to 20 s, a quiet end.
    const levels = Array.from({ length: 30 }, (_, k) => (k >= 10 && k < 20 ? 0.5 : 0.1));
    const t = track(levels);
    expect(loudestSpan(t, 10)).toEqual({ fromS: 10, seconds: 10 });
    expect(levelOfBuffer(t, { fromS: 10, seconds: 10 })).toMatchObject({
      levelDb: -9,
      peakDb: -6,
      seconds: 10,
    });
    expect(levelOfBuffer(t).levelDb).toBeCloseTo(-13.4, 0);
    // A track shorter than the excerpt is played whole.
    expect(loudestSpan(track([0.2, 0.2]), 20)).toEqual({ fromS: 0, seconds: 2 });
    expect(levelOfBuffer(track([0, 0])).levelDb).toBe(Number.NEGATIVE_INFINITY);
  });

  test("matching: the louder side is turned down; what cannot be closed is said", () => {
    // The piece 4 dB quieter than the reference: the reference comes down 4 dB.
    const quiet = matchLoudness(-18, { levelDb: -14, peakDb: -3 });
    expect(quiet).toMatchObject({ offsetDb: -4, mineDb: 0, referenceDb: -4, matched: true, residualDb: 0 });
    expect(quiet.reference).toBeCloseTo(dbToGain(-4), 9);
    expect(quiet.mine).toBe(1);
    // The piece 5 dB louder: the piece comes down when the host can turn it down …
    expect(matchLoudness(-10, { levelDb: -15, peakDb: -4 })).toMatchObject({
      offsetDb: 5,
      mineDb: -5,
      referenceDb: 0,
      matched: true,
    });
    // … otherwise the reference is raised only as far as its own peak allows under the limiter (−3 dBFS).
    expect(matchLoudness(-10, { levelDb: -15, peakDb: -5 }, { canCutMine: false })).toMatchObject({
      referenceDb: 2,
      matched: false,
      residualDb: 3,
    });
    expect(matchLoudness(-10, { levelDb: -15, peakDb: -12 }, { canCutMine: false })).toMatchObject({
      referenceDb: 5,
      matched: true,
    });
    // A gap wider than 18 dB is not closed.
    expect(matchLoudness(-40, { levelDb: -12, peakDb: -3 })).toMatchObject({
      referenceDb: -18,
      matched: false,
      residualDb: -10,
    });
    expect(matchLoudness(Number.NEGATIVE_INFINITY, { levelDb: -12, peakDb: -3 }).matched).toBe(false);
    expect(loudnessWords(-0.8)).toBe("about as loud as");
    expect(loudnessWords(-3.4)).toBe("3 dB quieter than");
    expect(loudnessWords(5.2)).toBe("5 dB louder than");
  });

  test("listen: the reference's loudest twenty seconds at the matched gain, the piece muted meanwhile", () => {
    let now = 10;
    const log: string[] = [];
    const param = (name: string) => ({
      value: 1,
      setValueAtTime(v: number, t: number) {
        this.value = v;
        log.push(`${name}.set ${v.toFixed(3)} @${t.toFixed(2)}`);
      },
      linearRampToValueAtTime(v: number, t: number) {
        log.push(`${name}.ramp ${v.toFixed(3)} @${t.toFixed(2)}`);
      },
      cancelScheduledValues() {},
    });
    const sources: { onended: (() => void) | null; started: number[]; stopped: number[] }[] = [];
    const ctx = {
      get currentTime() {
        return now;
      },
      createGain: () => ({ gain: param("ref"), connect: () => {}, disconnect: () => {} }),
      createBufferSource: () => {
        const s = {
          buffer: null as unknown,
          onended: null as (() => void) | null,
          started: [] as number[],
          stopped: [] as number[],
          connect: () => {},
          disconnect: () => {},
          start(when = 0, offset = 0, duration = 0) {
            this.started = [when, offset, duration];
          },
          stop(when = 0) {
            this.stopped.push(when);
          },
        };
        sources.push(s);
        return s;
      },
    };
    const mineGains: number[] = [];
    const ab = createReferenceAb({ ctx, output: {}, mine: { setGain: (g) => mineGains.push(g) } });
    expect(() => ab.listen("reference")).toThrow("load a reference");
    const levels = Array.from({ length: 60 }, (_, k) => (k >= 30 && k < 50 ? 0.4 : 0.05));
    const ref = ab.load(track(levels));
    expect(ref).toMatchObject({ fromS: 30, seconds: 20, levelDb: -11, peakDb: -8 });
    // The piece measured at −15 dB: 4 dB quieter, so the reference comes down.
    const m = ab.match(-15);
    expect(m).toMatchObject({ offsetDb: -4, referenceDb: -4, mineDb: 0, matched: true });
    expect(mineGains).toEqual([1]);
    ab.listen("reference", { at: 12 });
    expect(ab.state).toMatchObject({ side: "reference", playing: true });
    expect(mineGains).toEqual([1, 0]);
    expect(sources[0]?.started).toEqual([12, 30, 20]);
    const g = dbToGain(-4).toFixed(3);
    expect(log).toEqual([
      "ref.set 0.000 @12.00",
      `ref.ramp ${g} @12.03`,
      `ref.set ${g} @31.97`,
      "ref.ramp 0.000 @32.00",
    ]);
    // Back to the piece before the excerpt ends: the reference fades and stops, the piece returns.
    now = 20;
    ab.listen("mine");
    expect(ab.state).toMatchObject({ side: "mine", playing: false });
    expect(mineGains).toEqual([1, 0, 1]);
    expect(sources[0]?.stopped[0]).toBeCloseTo(20.035, 3);
    // Left to run, the excerpt ends by itself and the piece comes back.
    ab.listen("reference");
    expect(mineGains.at(-1)).toBe(0);
    sources[1]?.onended?.();
    expect(ab.state).toMatchObject({ side: "mine", playing: false });
    expect(mineGains.at(-1)).toBe(1);
    // A louder piece: it is the piece that is turned down, by gain only.
    ab.match(-6);
    expect(ab.state.match).toMatchObject({ offsetDb: 5, mineDb: -5, referenceDb: 0 });
    expect(mineGains.at(-1)).toBeCloseTo(dbToGain(-5), 9);
    ab.stop();
    expect(mineGains.at(-1)).toBe(1);
    ab.dispose();
  });
});

describe("what to do about the level (review:studio: a clipping single and a whispered one)", () => {
  const reading = (peakDb: number, state: "resting" | "touching" | "working") => ({
    peakDb,
    limiter: { state, maxReductionDb: state === "resting" ? 0 : 8, workingShare: 0.5, firstAtSec: 0 },
  });
  test("pushed against the limiter all the time: one factor for every .gain(), with the number", () => {
    expect(gainFactor(19.2)).toBe(0.05);
    expect(levelAdvice(reading(19.2, "working"))).toBe(
      "Every .gain() times about 0.05 brings the loudest moment just under the limiter.",
    );
    expect(levelAdvice(reading(2, "working"))).toContain("times about 0.4");
  });
  test("far under the limiter: quiet, by how much, and the factor that brings it up", () => {
    expect(gainFactor(-22.4)).toBe(7);
    expect(gainFactor(-15)).toBe(3);
    expect(levelAdvice(reading(-22.4, "resting"))).toBe(
      "That is quiet: the loudest moment is 19 dB under where the limiter starts (−3.0 dB). Every .gain() times about 7 brings it up to the rest of your record.",
    );
  });
  test("a level that sits well says nothing more; the read-out keeps its two lines", () => {
    expect(levelAdvice(reading(-8, "resting"))).toBeNull();
    expect(levelAdvice(reading(1.6, "touching"))).toBeNull();
    expect(levelAdvice(reading(Number.NEGATIVE_INFINITY, "resting"))).toBeNull();
    expect(QUIET_PEAK_DB).toBeLessThan(TARGET_PEAK_DB);
  });
});
