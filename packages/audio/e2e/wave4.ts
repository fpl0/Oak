// Wave 4 runs of the @oak/audio e2e page (wave4.md §3.4): the A/B gate on real audio, the master recorder's
// known start and end, hum-to-draft and runtime bleed detection through the fake microphone. Everything goes
// through the public API of @oak/audio and @oak/pitch exactly as the app uses it; the learner's pattern is real
// Strudel: @strudel/core's own scheduler (`Cyclist`), whose `targetTime` is when superdough plays a hap.
import {
  type AbSide,
  abDriftMs,
  createAbSwitch,
  createMasterRecorder,
  createMicGraph,
  createStretchPlayer,
  type PatternSideLike,
  sourceBarTimes,
} from "@oak/audio";
import {
  type BleedReport,
  createDetector,
  gradeSung,
  type HumToDraftResult,
  humToDraft,
  type PitchFrame,
  pitchFramesToNotes,
} from "@oak/pitch";
import { Cyclist, sequence, silence } from "@strudel/core";
import { burstOnsets } from "./onsets.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- capture: a sample-accurate two-channel recorder on the AudioContext clock ------------------------

const CAPTURE = `class OakCapture extends AudioWorkletProcessor {
  constructor() { super(); this.on = true; this.port.onmessage = (e) => { if (e.data === "stop") this.on = false; }; }
  process(inputs) {
    const i = inputs[0];
    if (this.on && i && i.length) this.port.postMessage({ frame: currentFrame, a: i[0].slice(), b: (i[1] || i[0]).slice() });
    return this.on;
  }
}
registerProcessor("oak-capture", OakCapture);`;

interface Capture {
  node: AudioWorkletNode;
  stop(): Promise<{ startFrame: number; a: Float32Array; b: Float32Array }>;
}
async function capture(ctx: AudioContext, a: AudioNode, b: AudioNode): Promise<Capture> {
  const url = URL.createObjectURL(new Blob([CAPTURE], { type: "text/javascript" }));
  await ctx.audioWorklet.addModule(url);
  const merger = ctx.createChannelMerger(2);
  a.connect(merger, 0, 0);
  b.connect(merger, 0, 1);
  const node = new AudioWorkletNode(ctx, "oak-capture", {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 2,
    channelCountMode: "explicit",
    channelInterpretation: "discrete",
  });
  merger.connect(node);
  const blocks: { frame: number; a: Float32Array; b: Float32Array }[] = [];
  node.port.onmessage = (e) => blocks.push(e.data as { frame: number; a: Float32Array; b: Float32Array });
  return {
    node,
    async stop() {
      node.port.postMessage("stop");
      await sleep(50);
      merger.disconnect();
      const first = blocks[0]?.frame ?? 0;
      const last = blocks.at(-1);
      const n = last ? last.frame + last.a.length - first : 0;
      const outA = new Float32Array(n);
      const outB = new Float32Array(n);
      for (const blk of blocks) {
        outA.set(blk.a, blk.frame - first);
        outB.set(blk.b, blk.frame - first);
      }
      return { startFrame: first, a: outA, b: outB };
    },
  };
}

/** A tone burst into `out` at `at`: 880 Hz, 2 ms attack, 60 ms hold, 80 ms decay. */
function burst(ctx: AudioContext, out: AudioNode, at: number, hz = 880, gain = 0.5): void {
  const o = ctx.createOscillator();
  o.frequency.value = hz;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.002);
  g.gain.setValueAtTime(gain, at + 0.062);
  g.gain.exponentialRampToValueAtTime(0.0005, at + 0.142);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + 0.16);
}

/** The same burst written into a buffer (the source file). */
function writeBurst(data: Float32Array, sr: number, at: number, hz = 880, gain = 0.5): void {
  const a = Math.round(at * sr);
  for (let i = 0; i < Math.round(0.16 * sr); i++) {
    const t = i / sr;
    const env = t < 0.002 ? t / 0.002 : t < 0.062 ? 1 : Math.max(0.0005, 0.0005 ** ((t - 0.062) / 0.08));
    if (a + i < data.length)
      data[a + i] = (data[a + i] as number) + gain * env * Math.sin(2 * Math.PI * hz * t);
  }
}

/** The learner's pattern: one hap per bar ("x ~ ~ ~") through Strudel's own scheduler, a burst per hap. */
function strudelSide(ctx: AudioContext, out: AudioNode, cpsAtRate1: number, skewSec = 0): PatternSideLike {
  const gain = ctx.createGain();
  gain.connect(out);
  let fromBar = 0;
  const cyclist = new Cyclist({
    interval: 0.05,
    getTime: () => ctx.currentTime,
    onTrigger: (_hap: unknown, _deadline: number, _dur: number, _cps: number, targetTime: number) =>
      burst(ctx, gain, targetTime + skewSec),
  });
  const base = sequence(1, silence, silence, silence);
  // `targetTime` of cyclist.mjs, as @oak/strudel's transport computes `timeOfCycle` (timeOfCycleFor).
  const timeOf = (c: number) => {
    const s = cyclist as unknown as {
      started: boolean;
      cps: number;
      num_cycles_at_cps_change: number;
      seconds_at_cps_change: number;
      latency: number;
    };
    return (c - s.num_cycles_at_cps_change) / s.cps + s.seconds_at_cps_change + s.latency;
  };
  return {
    cps: () => cpsAtRate1,
    async start({ at, fromBar: bar, rate }) {
      cyclist.stop();
      fromBar = bar;
      await cyclist.setPattern(bar === 0 ? base : base.early(bar));
      cyclist.setCps(cpsAtRate1 * rate);
      // The scheduler starts "now" plus its latency: start it so its cycle 0 lands on `at`.
      const wait = (at - (cyclist as unknown as { latency: number }).latency - 0.01 - ctx.currentTime) * 1000;
      if (wait > 0) await sleep(wait);
      cyclist.start();
    },
    stop: () => cyclist.stop(),
    setGain: (g) => gain.gain.setTargetAtTime(g, ctx.currentTime, 0.005),
    // The clock never knows about `skewSec`: it only moves the sound (the control run).
    timeOfCycle: (c) => timeOf(c - fromBar),
  };
}

export interface AbGateRun {
  sampleRate: number;
  rate: number;
  bars: number;
  /** The gate measure on the clocks: source bar lines through the stretch clock vs the pattern's own. */
  clockDriftMs: number;
  /** The gate measure on the audio: burst onsets of the two captured channels, bar by bar. */
  audioDriftMs: number;
  /** Per bar, mine − source, ms (audio). */
  perBarMs: number[];
  sourceOnsets: number;
  mineOnsets: number;
  /** Side changes while playing: the bar the transport reported right before and after each. */
  switches: { side: AbSide; before: number; after: number }[];
}

/**
 * The Wave 4 gate (wave4.md §3.4): a source file with a burst on every bar line (120 bpm in 4/4, bar 1 at
 * 0.5 s) through the stretch at `rate`, and a Strudel pattern with a burst on every cycle, on one A/B transport;
 * both sides are captured sample-accurately and their onsets compared over `bars` bars. `skewSec` delays the
 * pattern's audio behind what its clock reports (the control: the measure must see it).
 */
async function abGateRun(o: { rate: number; bars: number; skewSec?: number }): Promise<AbGateRun> {
  const ctx = new AudioContext({ latencyHint: "interactive" });
  await ctx.resume();
  const sr = ctx.sampleRate;
  const grid = { downbeatS: 0.5, barSec: 2 };
  const fileBars = o.bars + 4;
  const buffer = ctx.createBuffer(2, Math.round((grid.downbeatS + fileBars * grid.barSec + 1) * sr), sr);
  for (let c = 0; c < 2; c++)
    for (let b = 0; b < fileBars; b++)
      writeBurst(buffer.getChannelData(c), sr, grid.downbeatS + b * grid.barSec);
  const sourceOut = ctx.createGain();
  const mineOut = ctx.createGain();
  const player = await createStretchPlayer({ ctx, output: sourceOut });
  await player.load(buffer);
  const mine = strudelSide(ctx, mineOut, 1 / grid.barSec, o.skewSec ?? 0);
  const ab = createAbSwitch({ ctx, source: player, mine, grid });
  ab.setSide("both");
  ab.setRate(o.rate);
  const cap = await capture(ctx, sourceOut, mineOut);
  await ab.play({ fromBar: 0 });
  const anchor = player.clock.anchor;
  const clockSrc = sourceBarTimes(player.clock, grid, 0, o.bars);
  const clockMine = Array.from({ length: o.bars + 1 }, (_, b) => mine.timeOfCycle(b));
  // The measured run: both sides audible for every bar.
  const passSec = (grid.barSec / o.rate) * (o.bars + 0.4);
  await sleep(passSec * 1000);
  const got = await cap.stop();
  // Then side switches while it plays: gains only, the bar position never jumps.
  const switches: AbGateRun["switches"] = [];
  for (const side of ["source", "mine", "both", "source"] as const) {
    const before = ab.state.bar;
    ab.setSide(side);
    switches.push({ side, before, after: ab.state.bar });
    await sleep(150);
  }
  ab.pause();
  ab.dispose();
  player.dispose();
  await ctx.close();
  // Onsets on the context clock; keep the bars of the run (both sides were audible for the first burst).
  const toCtx = (s: number) => s + got.startFrame / sr;
  const srcOn = burstOnsets(got.a, sr).map(toCtx);
  const mineOn = burstOnsets(got.b, sr).map(toCtx);
  // Bar 0 on the stretch clock (the stretch itself starts a little earlier: the pre-roll).
  const startAt = clockSrc[0] ?? anchor?.ctxTime ?? 0;
  const perBar: number[] = [];
  for (let b = 0; b <= o.bars; b++) {
    const expected = startAt + (b * grid.barSec) / o.rate;
    const near = (xs: number[]) =>
      xs.reduce<number | null>((best, x) => {
        if (Math.abs(x - expected) > 0.4) return best;
        return best === null || Math.abs(x - expected) < Math.abs(best - expected) ? x : best;
      }, null);
    const s = near(srcOn);
    const m = near(mineOn);
    // A side muted by the switch at that bar has no burst: the clocks still say where it was.
    if (s !== null && m !== null) perBar.push((m - s) * 1000);
  }
  return {
    sampleRate: sr,
    rate: o.rate,
    bars: o.bars,
    clockDriftMs: abDriftMs(clockSrc, clockMine),
    audioDriftMs: perBar.reduce((w, d) => Math.max(w, Math.abs(d)), 0),
    perBarMs: perBar.map((d) => Math.round(d * 100) / 100),
    sourceOnsets: srcOn.length,
    mineOnsets: mineOn.length,
    switches,
  };
}

export interface RecorderRun {
  /** Largest |sample| of the recording. */
  peak: number;
  latency: { base: number; output: number };
  mime: string;
  exact: boolean;
  durationS: number;
  /** Burst onsets inside the recording, seconds from its first sample. */
  onsets: number[];
  sampleRate: number;
}

/**
 * The master recorder: a count-in (3 high clicks before `at`) then four bursts from `at`; the recording asked
 * for `[at, at + 2 + 0.5]` must start on the first burst and hold all four, and nothing of the count-in.
 */
async function recorderRun(): Promise<RecorderRun> {
  const ctx = new AudioContext();
  await ctx.resume();
  const bus = ctx.createGain();
  const tap = ctx.createMediaStreamDestination();
  bus.connect(tap);
  bus.connect(ctx.destination);
  const at = ctx.currentTime + 1.8;
  for (const k of [1.5, 1, 0.5]) burst(ctx, bus, at - k, 1760, 0.4);
  for (let i = 0; i < 4; i++) burst(ctx, bus, at + i * 0.5, 660, 0.5);
  const rec = createMasterRecorder({ ctx, tap });
  const r = await rec.record({ seconds: 2, at, tailSec: 0.5 });
  const decoded = await ctx.decodeAudioData(await r.blob.arrayBuffer());
  const ch0 = decoded.getChannelData(0);
  const onsets = burstOnsets(ch0, decoded.sampleRate);
  let peak = 0;
  for (const v of ch0) peak = Math.max(peak, Math.abs(v));
  await ctx.close();
  return {
    latency: { base: ctx.baseLatency, output: ctx.outputLatency },
    peak,
    mime: r.mime,
    exact: r.exact === true,
    durationS: decoded.duration,
    onsets,
    sampleRate: decoded.sampleRate,
  };
}

export interface HumRun {
  frames: number;
  draft: Pick<
    HumToDraftResult,
    "pattern" | "scale" | "bars" | "degrees" | "tuningCents" | "code" | "warnings"
  >;
  steps: string[];
}

/**
 * Hum-to-draft through the fake microphone: the take (a hummed line, then a silent room, looping) is captured
 * through the mic graph; the tune's first pass after a silence is drafted in its key and tempo.
 */
async function humRun(o: {
  seconds: number;
  key: { tonic: string; mode: "major" | "minor" };
  bpm: number;
  tuneSec: number;
}): Promise<HumRun> {
  const ctx = new AudioContext();
  await ctx.resume();
  const graph = createMicGraph(ctx);
  const s = await graph.open();
  await sleep(o.seconds * 1000);
  const frames = s.frames();
  s.close();
  graph.dispose();
  await ctx.close();
  // Find the first onset after at least 1.2 s of silence: the start of a whole pass of the tune.
  const notes = pitchFramesToNotes(frames);
  let start: number | null = null;
  for (let i = 1; i < notes.length; i++)
    if ((notes[i] as { start: number }).start - (notes[i - 1] as { end: number }).end > 1.2) {
      start = (notes[i] as { start: number }).start;
      break;
    }
  if (start === null) throw new Error("no whole pass of the tune was captured");
  const take = frames.filter((f) => f.t >= start - 0.15 && f.t <= start + o.tuneSec + 0.3);
  const d = humToDraft(take, {
    key: o.key,
    bpm: o.bpm,
    profile: { rangeLow: 48, noiseFloorDb: -70, singLatencyMs: 0 },
  });
  return {
    frames: take.length,
    draft: {
      pattern: d.pattern,
      scale: d.scale,
      bars: d.bars,
      degrees: d.degrees,
      tuningCents: d.tuningCents,
      code: d.code,
      warnings: d.warnings,
    },
    steps: d.notes.map((n) => n.step),
  };
}

export interface BleedRun {
  /** Phase A: the output plays E4 while the mic hears C4 (another note): no bleed. */
  other: BleedReport | null;
  /** Phase B: the output plays C4 while the mic hears C4: bleed, and the session's hook fired once. */
  same: BleedReport | null;
  fired: number;
  /** Mic frames with `playing` filled. */
  annotated: number;
  /** `gradeSung` of the whole take with a sing window after the playback: fails with sing.bleed. */
  grade: { pass: boolean; first: string | null };
}

/** Runtime bleed detection with the fake microphone leaking C4 (contracts §8.6). */
async function bleedRun(): Promise<BleedRun> {
  const ctx = new AudioContext();
  await ctx.resume();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const graph = createMicGraph(ctx, { playback: master });
  const s = await graph.open();
  let fired = 0;
  s.onBleed?.(() => fired++);
  const play = (midi: number, at: number, dur: number) => {
    const hz = 440 * 2 ** ((midi - 69) / 12);
    for (const [k, a] of [
      [1, 0.25],
      [2, 0.08],
      [3, 0.04],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = hz * k;
      const g = ctx.createGain();
      g.gain.value = a;
      osc.connect(g).connect(master);
      osc.start(at);
      osc.stop(at + dur);
    }
  };
  const tA = ctx.currentTime + 0.3;
  play(64, tA, 2);
  await sleep(2600);
  const other = s.bleed?.() ?? null;
  const tB = ctx.currentTime + 0.1;
  play(60, tB, 2);
  await sleep(2400);
  // Then the learner's turn: nothing plays, a window to sing 1.
  const singFrom = ctx.currentTime + 0.2;
  s.singing?.({ on: singFrom, off: singFrom + 1.2 });
  await sleep(1600);
  const same = s.bleed?.() ?? null;
  const frames: PitchFrame[] = s.frames();
  s.close();
  graph.dispose();
  await ctx.close();
  const r = gradeSung(
    frames,
    [{ midi: 60, on: singFrom + 0.1, off: singFrom + 1.1 }],
    { cents: "learner", octave: "per-note", driftCompCents: 0, minCoverage: 0.4, passHitRate: 0.8 },
    "pitch",
    {
      rangeLow: 48,
      rangeHigh: 72,
      comfLow: 52,
      comfHigh: 67,
      tapLatencyMs: 0,
      tapJitterMs: 10,
      singLatencyMs: 0,
      singTolCents: 50,
      singTolMode: "auto",
      noiseFloorDb: -70,
      outputKind: "speakers",
      inputKind: "builtin",
      quiet: false,
    },
  );
  return {
    other,
    same,
    fired,
    annotated: frames.filter((f) => (f.playing?.length ?? 0) > 0).length,
    grade: { pass: r.pass, first: r.diagnostics[0]?.id ?? null },
  };
}

export interface StretchPlayerRun {
  /** Median detected output frequency in each phase. */
  hz: { normal: number; octaveUp: number; fineTune: number; looped: number };
  /** Source positions sampled while looping [1, 2) at 0.75×. */
  loopTimes: number[];
}

/**
 * The StretchPlayer on the real node: a 440 Hz file at 0.75× keeps its pitch, +12 semitones and +50¢ move it,
 * and the clock wraps inside an A–B loop while the tone goes on unchanged.
 */
async function stretchPlayerRun(): Promise<StretchPlayerRun> {
  const ctx = new AudioContext();
  await ctx.resume();
  const sr = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.round(6 * sr), sr);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / sr);
  const out = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 4096;
  out.connect(analyser);
  const player = await createStretchPlayer({ ctx, output: out });
  await player.load(buffer);
  const detector = createDetector({ windowSize: 4096 });
  const buf = new Float32Array(analyser.fftSize);
  const listen = async (ms: number): Promise<number> => {
    const hz: number[] = [];
    const until = performance.now() + ms;
    while (performance.now() < until) {
      await sleep(60);
      analyser.getFloatTimeDomainData(buf);
      const r = detector.detect(buf, sr);
      if (r.clarity >= 0.9) hz.push(r.hz);
    }
    hz.sort((a, b) => a - b);
    return hz.length ? (hz[hz.length >> 1] as number) : Number.NaN;
  };
  player.setRate(0.75);
  await player.play({ fromS: 0.2 });
  const normal = await listen(1500);
  player.setSemitones(12);
  await sleep(250);
  const octaveUp = await listen(700);
  player.setSemitones(0);
  player.setCents(50);
  await sleep(250);
  const fineTune = await listen(700);
  player.setCents(0);
  player.setLoop({ startS: 1, endS: 2 });
  const loopTimes: number[] = [];
  const until = performance.now() + 3000;
  while (performance.now() < until) {
    await sleep(100);
    loopTimes.push(player.state.time);
  }
  const looped = await listen(500);
  player.pause();
  player.dispose();
  await ctx.close();
  return { hz: { normal, octaveUp, fineTune, looped }, loopTimes };
}

export const wave4 = { abGateRun, recorderRun, humRun, bleedRun, stretchPlayerRun };
