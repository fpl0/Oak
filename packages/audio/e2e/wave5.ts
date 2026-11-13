// Wave 5 runs of the @oak/audio e2e page: the scope taps on real Web Audio (side branches: the output is unchanged
// sample for sample; a track's analyser hears that track alone), the long-take recorder on a 3-minute piece rendered
// offline and a short real-time take, sung minor and blue notes through the fake microphone, and a shuffle tapped on
// the keyboard against a click. Everything goes through the public API of @oak/audio and @oak/pitch as the app uses it.
import {
  createMicGraph,
  createPcmRecorder,
  createScopeTaps,
  createTapInput,
  harmonicLevels,
} from "@oak/audio";
import type { KeySpec, LearnerProfile, SingTolerance } from "@oak/content-kit";
import {
  type DegreeNote,
  degreeTargets,
  gradeSung,
  gradeSwingTaps,
  labelSungResult,
  type PitchFrame,
  pitchFramesToNotes,
  type SungResult,
} from "@oak/pitch";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- scope taps -------------------------------------------------------------------------------------------

export interface ScopeRun {
  /** Offline: the rendered output with the taps attached equals the output without them, sample for sample. */
  identical: boolean;
  maxDiff: number;
  /** Real time, harmonic levels (dBFS) of 220 Hz and of 330 Hz in each source. */
  master: { at220: number; at330: number };
  trackA: { at220: number; at330: number };
  trackB: { at220: number; at330: number };
  /** A track that has not registered reads as silence; after dispose everything does. */
  unknownReady: boolean;
  afterDisposeMax: number;
  tracks: string[];
}

function graph(ctx: BaseAudioContext) {
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  const a = ctx.createOscillator();
  a.frequency.value = 220;
  const b = ctx.createOscillator();
  b.type = "square";
  b.frequency.value = 330;
  const ga = ctx.createGain();
  const gb = ctx.createGain();
  gb.gain.value = 0.3;
  a.connect(ga).connect(master);
  b.connect(gb).connect(master);
  a.start(0);
  b.start(0);
  return { master, ga, gb };
}

async function scopeRun(): Promise<ScopeRun> {
  // 1. No added latency, no change: render the same graph offline with and without the taps.
  const render = async (withTaps: boolean) => {
    const off = new OfflineAudioContext(2, 48000, 48000);
    const g = graph(off);
    if (withTaps) {
      const taps = createScopeTaps(off, g.master);
      taps.addTrack("a", g.ga);
      taps.addTrack("b", g.gb);
    }
    return (await off.startRendering()).getChannelData(0);
  };
  const plain = await render(false);
  const tapped = await render(true);
  let maxDiff = 0;
  for (let i = 0; i < plain.length; i++)
    maxDiff = Math.max(maxDiff, Math.abs((plain[i] as number) - (tapped[i] as number)));

  // 2. Real time: each analyser hears its own source.
  const ctx = new AudioContext();
  await ctx.resume();
  const g = graph(ctx);
  const taps = createScopeTaps(ctx, g.master, { fftSize: 8192 });
  taps.addTrack("a", g.ga);
  taps.addTrack("b", g.gb);
  await sleep(400);
  const levels = () => {
    const l = harmonicLevels(taps.spectrum(), taps.sampleRate, 110, 3);
    return { at220: l[1] as number, at330: l[2] as number };
  };
  const master = levels();
  taps.setSource({ kind: "track", label: "a" });
  const trackA = levels();
  taps.setSource({ kind: "track", label: "b" });
  const trackB = levels();
  taps.setSource({ kind: "track", label: "keys" });
  const unknownReady = taps.ready;
  const tracks = taps.tracks();
  taps.setSource({ kind: "master" });
  taps.dispose();
  const after = taps.wave();
  let afterDisposeMax = 0;
  for (const v of after) afterDisposeMax = Math.max(afterDisposeMax, Math.abs(v));
  await ctx.close();
  return { identical: maxDiff === 0, maxDiff, master, trackA, trackB, unknownReady, afterDisposeMax, tracks };
}

// --- the long-take recorder --------------------------------------------------------------------------------

export interface LongTakeRun {
  frames: number;
  sampleRate: number;
  channels: number;
  /** Clicks found in the WAV, and whether each sits exactly on the frame it was played. */
  clicks: number;
  allExact: boolean;
  firstClick: number;
  lastClick: number;
  peak: number;
  peakHeldBytes: number;
  parts: number;
  bytes: number;
  renderMs: number;
}

/** A click track (every half second) rendered offline for `seconds` + 4 s, recorded from `at` for `seconds` + tail. */
async function longTakeRun(o: { seconds: number; at: number; tailSec: number }): Promise<LongTakeRun> {
  const sr = 48000;
  const total = Math.ceil((o.at + o.seconds + o.tailSec + 1) * sr);
  const ctx = new OfflineAudioContext(2, total, sr);
  const clicks = ctx.createBuffer(1, total, sr);
  const data = clicks.getChannelData(0);
  for (let f = 0; f < total; f += sr / 2) data[f] = 0.8;
  const src = ctx.createBufferSource();
  src.buffer = clicks;
  const bus = ctx.createGain();
  src.connect(bus).connect(ctx.destination);
  src.start(0);
  const rec = createPcmRecorder(ctx, bus);
  await rec.prepare();
  const take = rec.record({ seconds: o.seconds, at: o.at, tailSec: o.tailSec });
  const t0 = performance.now();
  await ctx.startRendering();
  const r = await take;
  const renderMs = performance.now() - t0;
  const buf = await r.blob.arrayBuffer();
  const v = new DataView(buf);
  const channels = v.getUint16(22, true);
  const frames = v.getUint32(40, true) / 2 / channels;
  const pcm = new Int16Array(buf, 44);
  const firstFrame = Math.round(o.at * sr);
  let n = 0;
  let allExact = true;
  let firstClick = -1;
  let lastClick = -1;
  for (let f = 0; f < frames; f++) {
    if ((pcm[f * channels] as number) > 20000) {
      n++;
      if (firstClick < 0) firstClick = f;
      lastClick = f;
      if ((f + firstFrame) % (sr / 2) !== 0) allExact = false;
    }
  }
  const s = rec.stats();
  rec.dispose();
  return {
    frames,
    sampleRate: v.getUint32(24, true),
    channels,
    clicks: n,
    allExact,
    firstClick,
    lastClick,
    peak: r.peak,
    peakHeldBytes: s.peakHeldBytes,
    parts: s.parts,
    bytes: buf.byteLength,
    renderMs,
  };
}

export interface LiveTakeRun {
  /** Frame of the first burst inside the take, and where it should be. */
  onsetFrame: number;
  expectedFrame: number;
  frames: number;
  sampleRate: number;
}

/** Real time: a burst 0.25 s after `at`; the take starts at `at`, so the burst sits 0.25 s in, to the sample. */
async function liveTakeRun(): Promise<LiveTakeRun> {
  const ctx = new AudioContext();
  await ctx.resume();
  const bus = ctx.createGain();
  bus.connect(ctx.destination);
  const at = Math.ceil((ctx.currentTime + 0.4) * ctx.sampleRate) / ctx.sampleRate;
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.connect(bus);
  osc.start(at + 0.25);
  osc.stop(at + 0.5);
  const rec = createPcmRecorder(ctx, bus, { channels: 1 });
  const r = await rec.record({ seconds: 1, at, tailSec: 0.2 });
  const buf = await r.blob.arrayBuffer();
  const pcm = new Int16Array(buf, 44);
  let onsetFrame = -1;
  for (let f = 0; f < pcm.length; f++)
    if (Math.abs(pcm[f] as number) > 1000) {
      onsetFrame = f;
      break;
    }
  rec.dispose();
  const sr = ctx.sampleRate;
  await ctx.close();
  return { onsetFrame, expectedFrame: Math.round(0.25 * sr), frames: pcm.length, sampleRate: sr };
}

// --- sung minor and blue notes through the fake microphone -------------------------------------------------

export const PROFILE: LearnerProfile = {
  rangeLow: 48,
  rangeHigh: 76,
  comfLow: 52,
  comfHigh: 72,
  tapLatencyMs: 0,
  tapJitterMs: 8,
  singLatencyMs: 0,
  singTolCents: 50,
  singTolMode: "auto",
  noiseFloorDb: -70,
  outputKind: "wired",
  inputKind: "builtin",
  quiet: false,
};

export interface SingRun {
  frames: number;
  result: Pick<SungResult, "pass" | "score" | "diagnostics" | "medianAbsCents"> & {
    notes: { credit: number; cents: number | null; blue: boolean }[];
  };
  syllables: string[];
}

/**
 * Listens through the mic graph for `seconds`, finds the first whole pass of the looping fixture (the first onset
 * after at least 1.2 s of silence), and grades it against degree targets laid out from that onset.
 */
async function singRun(o: {
  seconds: number;
  key: KeySpec;
  tonicMidi: number;
  notes: DegreeNote[];
  blues?: boolean;
  mode: "pitch" | "sight";
  tol: SingTolerance;
}): Promise<SingRun> {
  const ctx = new AudioContext();
  await ctx.resume();
  const g = createMicGraph(ctx);
  const s = await g.open();
  await sleep(o.seconds * 1000);
  const all: PitchFrame[] = s.frames();
  s.close();
  g.dispose();
  await ctx.close();
  const heard = pitchFramesToNotes(all);
  let start: number | null = null;
  for (let i = 1; i < heard.length; i++)
    if ((heard[i] as { start: number }).start - (heard[i - 1] as { end: number }).end > 1.2) {
      start = (heard[i] as { start: number }).start;
      break;
    }
  if (start === null) throw new Error("no whole pass of the phrase was captured");
  const targets = degreeTargets({
    key: o.key,
    tonicMidi: o.tonicMidi,
    notes: o.notes,
    startAt: start,
    blues: o.blues ?? false,
  });
  const end = (targets[targets.length - 1] as { off: number }).off;
  const frames = all.filter((f) => f.t >= start - 0.3 && f.t <= end + 0.4);
  const r = labelSungResult(gradeSung(frames, targets, o.tol, o.mode, PROFILE), o.key, targets);
  return {
    frames: frames.length,
    result: {
      pass: r.pass,
      score: r.score,
      diagnostics: r.diagnostics,
      medianAbsCents: r.medianAbsCents,
      notes: r.notes.map((n) => ({ credit: n.credit, cents: n.cents, blue: n.blue !== undefined })),
    },
    syllables: targets.map((t) => t.syllable),
  };
}

// --- a shuffle tapped against a click ---------------------------------------------------------------------

let tapping: {
  ctx: AudioContext;
  input: ReturnType<typeof createTapInput>;
  downbeat: number;
  bpm: number;
  slots: number;
} | null = null;

/**
 * Starts a click (a count-in bar, then `slots` beats and a closing downbeat) and arms the TapPad keys. Returns the
 * performance-clock time of the first counted beat, so the spec can place its key presses.
 */
async function tapStart(o: {
  bpm: number;
  slots: number;
}): Promise<{ perfDownbeat: number; beatMs: number }> {
  const ctx = new AudioContext();
  await ctx.resume();
  await sleep(200);
  const beat = 60 / o.bpm;
  const downbeat = ctx.currentTime + 1 + 4 * beat;
  for (let k = -4; k <= o.slots; k++) {
    const t = downbeat + k * beat;
    const osc = ctx.createOscillator();
    osc.frequency.value = k % 4 === 0 ? 1760 : 880;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }
  const input = createTapInput(ctx);
  input.arm();
  tapping = { ctx, input, downbeat, bpm: o.bpm, slots: o.slots };
  const ts = ctx.getOutputTimestamp();
  const perfDownbeat =
    (ts.performanceTime ?? performance.now()) + (downbeat - (ts.contextTime ?? ctx.currentTime)) * 1000;
  return { perfDownbeat, beatMs: beat * 1000 };
}

export interface TapRun {
  taps: number;
  pass: boolean;
  f1: number;
  windowMs: number;
  ratio: number;
  cls: string | null;
  feelOk: boolean;
  offbeatErrorMs: number | null;
  measured: number;
  swingLine: Record<string, string | number> | null;
}

async function tapFinish(o: { amount: number }): Promise<TapRun> {
  if (!tapping) throw new Error("tapStart first");
  const { ctx, input, downbeat, bpm, slots } = tapping;
  const taps = input.taps().map((t) => t.time);
  input.dispose();
  await ctx.close();
  tapping = null;
  const r = gradeSwingTaps(
    taps,
    { downbeat, bpm, slots, amount: o.amount },
    { windowMs: "auto", tempo: "locked", forgiveOffset: true, passF1: 0.9, passTiming: 0.5 },
    PROFILE,
    { level: 1, levels: 4 },
  );
  return {
    taps: taps.length,
    pass: r.pass,
    f1: r.f1,
    windowMs: r.windowMs,
    ratio: r.swing.ratio,
    cls: r.swing.cls,
    feelOk: r.swing.feelOk,
    offbeatErrorMs: r.swing.offbeatErrorMs,
    measured: r.swing.n,
    swingLine: r.diagnostics.find((d) => d.id === "tap.swing")?.params ?? null,
  };
}

export const wave5 = { scopeRun, longTakeRun, liveTakeRun, singRun, tapStart, tapFinish };
