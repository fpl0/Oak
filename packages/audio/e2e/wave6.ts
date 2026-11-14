// Wave 6 runs of the @oak/audio e2e page: pushes, triplets and compound meter tapped on the keyboard against a
// click; sung chromatic degrees, a guide-tone line and a mode's colour tone through the fake microphone, and their
// Quiet path with the microphone never opened; the Master read-out and the long-take recorder on a 2:14 song with
// section changes and a key change, through a real limiter, rendered offline; the reference listen at matched
// loudness. Everything goes through the public API of @oak/audio and @oak/pitch as the app uses it.
import {
  createMasterMeter,
  createPcmRecorder,
  createReferenceAb,
  createTapInput,
  type LoudnessMatch,
  levelOfBuffer,
  type MasterReading,
  readingLines,
} from "@oak/audio";
import type { Diagnostic, KeySpec, MeterId } from "@oak/content-kit";
import {
  chromaticTargets,
  colourFeedbackText,
  colourQuietPicks,
  type DegreeNote,
  explainColourResult,
  gradeGuideTones,
  gradeQuietPicks,
  gradeRhythmTaps,
  gradeSung,
  guideToneQuietPicks,
  guideToneTargets,
  modalTargets,
  type RhythmVerdict,
  rhythmTapText,
} from "@oak/pitch";
import { listenPass } from "./listen.ts";
import { PROFILE } from "./wave5.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- pushes, triplets and compound meter tapped against a click ----------------------------------------------

let tapping: {
  ctx: AudioContext;
  input: ReturnType<typeof createTapInput>;
  downbeat: number;
  bpm: number;
  meter: MeterId;
} | null = null;

/**
 * Starts a click on the beat of `meter` (`countIn` beats, then `bars` bars and a closing downbeat; bar lines
 * accented) and arms the TapPad keys. Returns the performance-clock time of bar 1 and one bar in ms.
 */
async function tapStart(o: {
  bpm: number;
  meter: MeterId;
  beatsPerBar: number;
  bars: number;
  countIn: number;
}): Promise<{ perfDownbeat: number; barMs: number }> {
  const ctx = new AudioContext();
  await ctx.resume();
  await sleep(150);
  const beat = 60 / o.bpm;
  const downbeat = ctx.currentTime + 0.25 + o.countIn * beat;
  for (let k = -o.countIn; k <= o.bars * o.beatsPerBar; k++) {
    const t = downbeat + k * beat;
    const osc = ctx.createOscillator();
    osc.frequency.value = ((k % o.beatsPerBar) + o.beatsPerBar) % o.beatsPerBar === 0 ? 1760 : 880;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }
  const input = createTapInput(ctx);
  input.arm();
  tapping = { ctx, input, downbeat, bpm: o.bpm, meter: o.meter };
  const ts = ctx.getOutputTimestamp();
  const perfDownbeat =
    (ts.performanceTime ?? performance.now()) + (downbeat - (ts.contextTime ?? ctx.currentTime)) * 1000;
  return { perfDownbeat, barMs: beat * o.beatsPerBar * 1000 };
}

export interface RhythmTapRun {
  taps: number;
  pass: boolean;
  f1: number;
  windowMs: number;
  kinds: string[];
  verdicts: RhythmVerdict[];
  errorsMs: (number | null)[];
  pushesOnBeat: number[];
  triplets: string[];
  quarterBars: number[];
  /** The Wave 6 lines, rendered. */
  said: Record<string, string>;
}

/** Grades the take against `onsets` (in bars from the downbeat) with `gradeRhythmTaps`. */
async function tapFinish(o: { onsets: number[]; expectTaps: number }): Promise<RhythmTapRun> {
  if (!tapping) throw new Error("tapStart first");
  const { ctx, input, downbeat, bpm, meter } = tapping;
  // The last key press may still be on its way to the page.
  for (let i = 0; i < 25 && input.taps().length < o.expectTaps; i++) await sleep(20);
  const taps = input.taps().map((t) => t.time);
  input.dispose();
  await ctx.close();
  tapping = null;
  const r = gradeRhythmTaps(
    taps,
    { downbeat, bpm, meter, onsets: o.onsets },
    { windowMs: "auto", tempo: "locked", forgiveOffset: true, passF1: 0.9, passTiming: 0.5 },
    PROFILE,
    { level: 1, levels: 4 },
  );
  const said: Record<string, string> = {};
  for (const d of r.diagnostics) {
    const text = rhythmTapText(d);
    if (text !== null) said[d.id] = text;
  }
  return {
    taps: taps.length,
    pass: r.pass,
    f1: r.f1,
    windowMs: r.windowMs,
    kinds: r.onsets.map((x) => x.kind),
    verdicts: r.onsets.map((x) => x.verdict),
    errorsMs: r.onsets.map((x) => (x.errorMs === null ? null : Math.round(x.errorMs))),
    pushesOnBeat: r.pushesOnBeat,
    triplets: r.triplets.map((t) => t.shape),
    quarterBars: r.quarterBars,
    said,
  };
}

// --- sung chromatic degrees, a guide-tone line, a mode's colour: one take, and the Quiet path -----------------

const SING_TOL = {
  cents: "learner" as const,
  octave: "per-note" as const,
  driftCompCents: 0,
  minCoverage: 0.4,
  passHitRate: 0.8,
};

export interface SungLine {
  credits: number[];
  pass: boolean;
  /** The Wave 6 lines, rendered with their ids. */
  said: { id: string; text: string }[];
  syllables?: string[];
}
export interface SingW6Run {
  listenedSec: number;
  chromatic: SungLine;
  guide: SungLine & { sang: (string | null)[]; lenientPass: boolean; swapped: boolean[] };
  modal: SungLine;
}

interface LinePlan {
  chromatic: { at: number; noteSec: number; degrees: string[] };
  guide: { at: number; chordSec: number; chords: string[] };
  modal: { at: number; noteSec: number; degrees: string[] };
  gapSec: number;
  takeSec: number;
}
const C: KeySpec = { tonic: "C", mode: "major" };
const D_DORIAN: KeySpec = { tonic: "D", mode: "dorian" };
const notesOf = (degrees: string[], slot: number, gap: number): DegreeNote[] =>
  degrees.map((degree, k) => ({ degree: degree as DegreeNote["degree"], at: k * slot, dur: slot - gap }));
const lines = (ds: readonly Diagnostic[]) =>
  ds.flatMap((d) => {
    const text = colourFeedbackText(d);
    return text === null ? [] : [{ id: d.id, text }];
  });

function targetsOf(plan: LinePlan, start: number) {
  return {
    chromatic: chromaticTargets({
      key: C,
      tonicMidi: 60,
      notes: notesOf(plan.chromatic.degrees, plan.chromatic.noteSec, plan.gapSec),
      startAt: start + plan.chromatic.at,
    }),
    guide: guideToneTargets({
      chords: plan.guide.chords,
      around: 64,
      startAt: start + plan.guide.at,
      chordSec: plan.guide.chordSec,
    }),
    modal: modalTargets({
      key: D_DORIAN,
      tonicMidi: 62,
      notes: notesOf(plan.modal.degrees, plan.modal.noteSec, plan.gapSec),
      startAt: start + plan.modal.at,
    }),
  };
}

/** One listen through the mic graph; each phrase is graded from the first note of the take. */
async function singRun(plan: LinePlan): Promise<SingW6Run> {
  const { frames, start, listenedSec } = await listenPass({ passSec: plan.takeSec, maxSec: 20 });
  const t = targetsOf(plan, start);
  const between = (from: number, to: number) => frames.filter((f) => f.t >= from - 0.2 && f.t <= to + 0.3);
  const span = (ts: readonly { on: number; off: number }[]) =>
    between((ts[0] as { on: number }).on, (ts[ts.length - 1] as { off: number }).off);

  const chroma = explainColourResult(
    gradeSung(span(t.chromatic), t.chromatic, SING_TOL, "degree", PROFILE),
    C,
    t.chromatic,
  );
  const strict = gradeGuideTones(span(t.guide), t.guide, SING_TOL, PROFILE);
  const lenient = gradeGuideTones(span(t.guide), t.guide, SING_TOL, PROFILE, { acceptOther: true });
  const modal = explainColourResult(
    gradeSung(span(t.modal), t.modal, SING_TOL, "degree", PROFILE),
    D_DORIAN,
    t.modal,
  );
  return {
    listenedSec,
    chromatic: {
      credits: chroma.notes.map((n) => n.credit),
      pass: chroma.pass,
      said: lines(chroma.diagnostics),
      syllables: t.chromatic.map((x) => x.syllable),
    },
    guide: {
      credits: strict.notes.map((n) => n.credit),
      pass: strict.pass,
      said: lines(strict.diagnostics),
      sang: strict.line.map((n) => n.sang),
      lenientPass: lenient.pass,
      swapped: lenient.line.map((n) => n.swapped),
    },
    modal: {
      credits: modal.notes.map((n) => n.credit),
      pass: modal.pass,
      said: lines(modal.diagnostics),
      syllables: t.modal.map((x) => x.syllable),
    },
  };
}

export interface QuietRun {
  /** Times the page asked for a microphone while the Quiet path ran. */
  micRequests: number;
  picks: { prompt: string; options: string[]; correct: string }[];
  rightPass: boolean;
  wrongScore: number;
  modality: string;
}

/** The same three lines in Quiet mode: pick lists, graded, and no capture opened. */
function quietRun(plan: LinePlan): QuietRun {
  const md = navigator.mediaDevices;
  const real = md.getUserMedia.bind(md);
  let micRequests = 0;
  md.getUserMedia = (c) => {
    micRequests++;
    return real(c);
  };
  try {
    const t = targetsOf(plan, 0);
    const picks = [
      ...colourQuietPicks(t.chromatic, C),
      ...guideToneQuietPicks(t.guide),
      ...colourQuietPicks(t.modal, D_DORIAN),
    ];
    const right = gradeQuietPicks(
      picks,
      picks.map((p) => p.correct),
    );
    const wrong = gradeQuietPicks(
      picks,
      picks.map((p) => (p.correct + 1) % p.options.length),
    );
    return {
      micRequests,
      picks: picks.map((p) => ({
        prompt: p.prompt,
        options: p.options.map((x) => `${x.label} ${x.sub}`),
        correct: `${p.options[p.correct]?.label} ${p.options[p.correct]?.sub}`,
      })),
      rightPass: right.pass,
      wrongScore: wrong.score,
      modality: right.modality,
    };
  } finally {
    md.getUserMedia = real;
  }
}

// --- the Master read-out and the long take on a 2:14 song ------------------------------------------------------

/** @oak/strudel's limiter (master-bus.ts `LIMITER`) and the trim that undoes its make-up gain. */
const LIMITER = { threshold: -3, knee: 0, ratio: 20, attack: 0.003, release: 0.1 };
const MAKEUP_DB = -(LIMITER.threshold - LIMITER.threshold / LIMITER.ratio) * 0.6;

export interface MasterRun {
  renderMs: number;
  sampleRate: number;
  songSec: number;
  reading: MasterReading;
  lines: string[];
  /** The level and peak of the song's own samples (computed from the buffer), dBFS. */
  truth: { levelDb: number; peakDb: number };
  /** Where the hot bars begin, seconds into the song. */
  hotAtSec: number;
  /** The take recorded BEFORE the limiter, against the song's samples. */
  dry: {
    frames: number;
    missingFrames: number;
    latePadFrames: number;
    worstLsb: number;
    longestZeroRunMs: number;
  };
  /** The take recorded after the limiter (what an album take is). */
  take: { frames: number; missingFrames: number; levelDb: number; peakDb: number; bytes: number };
  /** A second, quiet play-through: the limiter rests. */
  quiet: { state: string; maxReductionDb: number; levelDb: number };
}

/**
 * CF-A's plan as audio: 56 bars at 100 BPM (134.4 s), a section every eight bars (verse chorus verse chorus
 * bridge chorus chorus2), each a two-note chord that restarts at the section change, the last chorus a whole step
 * up; `hotBars` bars at the very end are 8 dB hotter (above the limiter's threshold).
 */
function songBuffer(ctx: BaseAudioContext, gain: number, hotBars: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const barFrames = Math.round(2.4 * sr);
  const total = 56 * barFrames;
  const buf = ctx.createBuffer(2, total, sr);
  const sections = [0, 5, 0, 5, 9, 5, 7];
  const levels = [0.16, 0.26, 0.16, 0.26, 0.2, 0.26, 0.28];
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  for (let k = 0; k < total; k++) {
    const sec = Math.floor(k / (8 * barFrames));
    const inSec = k - sec * 8 * barFrames;
    const hz = 196 * 2 ** ((sections[sec] as number) / 12);
    const hot = k >= total - hotBars * barFrames ? 2.5 : 1;
    const a = (levels[sec] as number) * gain * hot;
    const w = (2 * Math.PI * inSec) / sr;
    L[k] = a * (Math.sin(w * hz) + 0.5 * Math.sin(w * hz * 1.5));
    R[k] = a * (Math.sin(w * hz) + 0.5 * Math.sin(w * hz * 1.25));
  }
  return buf;
}

async function masterPass(o: { gain: number; hotBars: number; record: boolean }) {
  const sr = 48000;
  const at = 0.5;
  const songSec = 134.4;
  const ctx = new OfflineAudioContext(2, Math.ceil((at + songSec + 2.5) * sr), sr);
  const song = songBuffer(ctx, o.gain, o.hotBars);
  const src = ctx.createBufferSource();
  src.buffer = song;
  // The master bus: input → limiter → trim → destination.
  const input = ctx.createGain();
  const limiter = new DynamicsCompressorNode(ctx, LIMITER);
  const trim = new GainNode(ctx, { gain: 10 ** (-MAKEUP_DB / 20) });
  src.connect(input);
  input.connect(limiter);
  limiter.connect(trim);
  trim.connect(ctx.destination);
  src.start(at);
  const meter = createMasterMeter(ctx, { pre: input, post: trim });
  await meter.prepare();
  const dryRec = o.record ? createPcmRecorder(ctx, input) : null;
  const wetRec = o.record ? createPcmRecorder(ctx, trim) : null;
  await dryRec?.prepare();
  const reading = meter.measure({ at, seconds: songSec });
  const dry = dryRec?.record({ seconds: songSec, at, tailSec: 2 });
  const wet = wetRec?.record({ seconds: songSec, at, tailSec: 2 });
  const t0 = performance.now();
  await ctx.startRendering();
  const out = {
    renderMs: performance.now() - t0,
    sr,
    songSec,
    song,
    reading: await reading,
    dry: dry ? await dry : null,
    wet: wet ? await wet : null,
  };
  meter.dispose();
  dryRec?.dispose();
  wetRec?.dispose();
  return out;
}

async function masterRun(): Promise<MasterRun> {
  const hotBars = 3;
  const p = await masterPass({ gain: 1, hotBars, record: true });
  const sr = p.sr;
  const songFrames = Math.round(p.songSec * sr);
  if (!p.dry || !p.wet) throw new Error("no takes");
  // The dry take against the song, sample for sample, through every section change and the lift.
  const dryPcm = new Int16Array(await p.dry.blob.arrayBuffer(), 44);
  const ch = [p.song.getChannelData(0), p.song.getChannelData(1)];
  let worst = 0;
  let zeroRun = 0;
  let longest = 0;
  for (let f = 0; f < songFrames; f++) {
    for (let c = 0; c < 2; c++) {
      const x = Math.max(-1, Math.min(1, (ch[c] as Float32Array)[f] as number));
      const want = Math.trunc(x < 0 ? x * 0x8000 : x * 0x7fff);
      const d = Math.abs((dryPcm[2 * f + c] as number) - want);
      if (d > worst) worst = d;
    }
    if (dryPcm[2 * f] === 0 && dryPcm[2 * f + 1] === 0) zeroRun++;
    else zeroRun = 0;
    if (zeroRun > longest) longest = zeroRun;
  }
  // The wet take's own level and peak over the song.
  const wetBuf = await p.wet.blob.arrayBuffer();
  const wetPcm = new Int16Array(wetBuf, 44);
  let sq = 0;
  let peak = 0;
  for (let i = 0; i < songFrames * 2; i++) {
    const v = (wetPcm[i] as number) / 0x8000;
    sq += v * v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  const truth = levelOfBuffer(p.song);
  const quiet = await masterPass({ gain: 0.6, hotBars: 0, record: false });
  return {
    renderMs: p.renderMs,
    sampleRate: sr,
    songSec: p.songSec,
    reading: p.reading,
    lines: readingLines(p.reading),
    truth: { levelDb: truth.levelDb, peakDb: truth.peakDb },
    hotAtSec: (56 - hotBars) * 2.4,
    dry: {
      frames: p.dry.frames,
      missingFrames: p.dry.missingFrames,
      latePadFrames: p.dry.latePadFrames,
      worstLsb: worst,
      longestZeroRunMs: (longest / sr) * 1000,
    },
    take: {
      frames: p.wet.frames,
      missingFrames: p.wet.missingFrames,
      levelDb: Math.round(10 * Math.log10(sq / (songFrames * 2)) * 10) / 10,
      peakDb: Math.round(20 * Math.log10(peak) * 10) / 10,
      bytes: wetBuf.byteLength,
    },
    quiet: {
      state: quiet.reading.limiter.state,
      maxReductionDb: quiet.reading.limiter.maxReductionDb,
      levelDb: quiet.reading.levelDb,
    },
  };
}

export interface LiveMeterRun {
  first: MasterReading;
  /** A second measurement on the same node: armed by a message while the context runs. */
  second: MasterReading;
  blocks: number;
}

/** The meter on a running AudioContext: a tone of amplitude 0.25, measured for one second, then again. */
async function liveMeterRun(): Promise<LiveMeterRun> {
  const ctx = new AudioContext();
  await ctx.resume();
  const osc = ctx.createOscillator();
  osc.frequency.value = 330;
  const bus = ctx.createGain();
  bus.gain.value = 0.25;
  const out = ctx.createGain();
  out.gain.value = 0.05;
  osc.connect(bus).connect(out).connect(ctx.destination);
  osc.start();
  const meter = createMasterMeter(ctx, { pre: bus, post: bus }, { lookaheadSec: 0 });
  await meter.prepare();
  let blocks = 0;
  meter.subscribe(() => blocks++);
  const first = await meter.measure({ at: ctx.currentTime + 0.15, seconds: 1 });
  const second = await meter.measure({ seconds: 0.5 });
  meter.dispose();
  osc.stop();
  await ctx.close();
  return { first, second, blocks };
}

// --- the reference listen at matched loudness ---------------------------------------------------------------

export interface ReferenceRun {
  reference: { fromS: number; seconds: number; levelDb: number; peakDb: number };
  match: LoudnessMatch;
  /** The reference as it reached the bus during the listen, measured by the meter. */
  heardDb: number;
  /** The piece's level the match was made for. */
  mineDb: number;
  mineGains: number[];
  endedOnMine: boolean;
}

/**
 * An earlier track (40 s: a quiet verse, a 20 s chorus) against a piece measured at `mineDb`: the reference's
 * loudest twenty seconds are played at the matched gain into a bus, and the meter reads what arrived.
 */
async function referenceRun(o: { mineDb: number }): Promise<ReferenceRun> {
  const sr = 48000;
  const ctx = new OfflineAudioContext(2, 24 * sr, sr);
  const track = ctx.createBuffer(2, 40 * sr, sr);
  for (let c = 0; c < 2; c++) {
    const x = track.getChannelData(c);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const a = t >= 12 && t < 32 ? 0.45 : 0.08;
      x[i] = a * (Math.sin(2 * Math.PI * 220 * t) + 0.4 * Math.sin(2 * Math.PI * 330 * t + c));
    }
  }
  const bus = ctx.createGain();
  bus.connect(ctx.destination);
  const mineGains: number[] = [];
  const ab = createReferenceAb({
    ctx: ctx as unknown as Parameters<typeof createReferenceAb>[0]["ctx"],
    output: bus,
    mine: { setGain: (g) => mineGains.push(Math.round(g * 1000) / 1000) },
  });
  const reference = ab.load(track);
  const match = ab.match(o.mineDb);
  const meter = createMasterMeter(ctx, { pre: bus, post: bus }, { lookaheadSec: 0 });
  await meter.prepare();
  ab.listen("reference", { at: 1 });
  // Inside the excerpt, away from its fades.
  const reading = meter.measure({ at: 1.5, seconds: 19 });
  await ctx.startRendering();
  const heard = await reading;
  // The excerpt's own `ended` event is a task of its own.
  await sleep(30);
  const endedOnMine = ab.state.side === "mine" && !ab.state.playing;
  const gains = [...mineGains];
  meter.dispose();
  ab.dispose();
  return { reference, match, heardDb: heard.levelDb, mineDb: o.mineDb, mineGains: gains, endedOnMine };
}

export const wave6 = { tapStart, tapFinish, singRun, quietRun, masterRun, liveMeterRun, referenceRun };
