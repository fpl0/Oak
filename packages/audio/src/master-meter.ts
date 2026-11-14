// Wave 6 (CF-A "Master"): a loudness read-out of the piece and a reference listen at matched loudness.
//
// What is measured, in plain units and nothing else: the AVERAGE LEVEL of what the listener hears (RMS over the
// whole measured span, in dBFS: 0 is full scale, a sine that just reaches full scale reads −3), the LOUDEST
// SAMPLE before and after the limiter (dBFS; before the limiter it can be above 0, which is what the limiter is
// there to catch), the loudest few seconds, and how hard the limiter worked: its gain reduction, the level it
// took off, measured from the audio itself (the bus before the limiter against the bus after it, the limiter's
// 6 ms look-ahead taken out). No loudness units are invented and none are borrowed: this is not LUFS.
//
// The meter is an AudioWorklet on two side branches of the master bus (before and after the limiter). It counts
// every sample of `[at, at + seconds)` on the audio thread, so a full play-through of a two-minute song is
// measured whole whatever the page is doing, and posts one small block summary about twelve times a second. Like
// the long-take recorder it ships as source text, loads from a Blob URL and also runs in an OfflineAudioContext.
//
// The reference listen (`createReferenceAb`): twenty seconds of one of the learner's earlier tracks against the
// piece, with the louder of the two turned down so both arrive at the same average level, and the difference
// said in dB either way.

export const MASTER_METER_PROCESSOR = "oak-master-meter";

/** Frames per block summary: 4096 is 85 ms at 48 kHz. */
export const METER_BLOCK_FRAMES = 4096;
/** The look-ahead of a Web Audio DynamicsCompressorNode, seconds (Web Audio API §1.19: fixed at 6 ms). */
export const LIMITER_LOOKAHEAD_SEC = 0.006;
/** Below this a block is silence: it says nothing about the limiter. */
export const METER_SILENCE_DB = -70;
/**
 * "Resting" is less than this much gain reduction; "working" is more than it for over `WORKING_SHARE` of the
 * sounding time. Tuned against CF-A's shipped flavour pieces (content/specs/CF.md: the limiter at most touches a
 * piece as shipped): their drums take 2–4 dB off in 12–26% of the 85-ms blocks of a verse, which is the limiter
 * catching every kick, not a song pushed against it. A share of 0.1 read all of them as "working" and told the
 * learner to turn a well-mixed song down (review:studio, Wave 6); a song pushed six times too loud reads 100%.
 */
export const LIMITER_WORKING_DB = 1;
export const LIMITER_WORKING_SHARE = 0.4;
/** The loudest stretch is searched with a window this long. */
export const LOUDEST_WINDOW_SEC = 3;

/** The worklet, as source text (AudioWorkletGlobalScope: no imports, no DOM). Input 0: before the limiter; 1: after. */
export const MASTER_METER_SOURCE = `class OakMasterMeter extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.blockFrames = o.blockFrames || ${METER_BLOCK_FRAMES};
    this.delay = Math.max(0, o.delayFrames | 0);
    this.ring = new Float32Array(Math.max(1, this.delay) * 2);
    this.ringAt = 0;
    this.start = -1;
    this.end = -1;
    this.alive = true;
    this.reset();
    // Armed at construction: an offline render may finish before a message could arrive.
    if (o.arm) {
      this.start = o.arm.startFrame;
      this.end = o.arm.frames < 0 ? Infinity : o.arm.startFrame + o.arm.frames;
    }
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === "arm") {
        this.start = d.startFrame;
        this.end = d.frames < 0 ? Infinity : d.startFrame + d.frames;
        this.ring.fill(0);
        this.reset();
      } else if (d.type === "stop") {
        if (this.end >= 0) this.finish();
      } else if (d.type === "dispose") {
        this.alive = false;
      }
    };
  }
  reset() {
    this.n = 0;
    this.preSq = 0;
    this.prePeak = 0;
    this.postSq = 0;
    this.postPeak = 0;
  }
  flush() {
    if (this.n === 0) return;
    this.port.postMessage({
      type: "block",
      frames: this.n,
      preSq: this.preSq,
      prePeak: this.prePeak,
      postSq: this.postSq,
      postPeak: this.postPeak,
    });
    this.reset();
  }
  finish() {
    this.flush();
    this.port.postMessage({ type: "done" });
    this.start = -1;
    this.end = -1;
  }
  process(inputs) {
    const pre = inputs[0] || [];
    const post = inputs[1] || [];
    const n = (pre[0] && pre[0].length) || (post[0] && post[0].length) || 128;
    const blockStart = currentFrame;
    const armed = this.end >= 0;
    const from = armed ? Math.max(this.start, blockStart) : blockStart + n;
    const to = armed ? Math.min(this.end, blockStart + n) : blockStart + n;
    const pc = pre.length || 1;
    const qc = post.length || 1;
    const D = this.delay;
    for (let i = 0; i < n; i++) {
      // The bus before the limiter, delayed by the limiter's look-ahead so it lines up with the bus after it.
      let l = pre[0] ? pre[0][i] : 0;
      let r = pre[1] ? pre[1][i] : l;
      if (D > 0) {
        const at = this.ringAt * 2;
        const dl = this.ring[at];
        const dr = this.ring[at + 1];
        this.ring[at] = l;
        this.ring[at + 1] = r;
        this.ringAt = (this.ringAt + 1) % D;
        l = dl;
        r = dr;
      }
      const f = blockStart + i;
      if (f < from || f >= to) continue;
      const al = l < 0 ? -l : l;
      const ar = r < 0 ? -r : r;
      if (al > this.prePeak) this.prePeak = al;
      if (ar > this.prePeak) this.prePeak = ar;
      this.preSq += pc > 1 ? (l * l + r * r) / 2 : l * l;
      const pl = post[0] ? post[0][i] : 0;
      const pr = post[1] ? post[1][i] : pl;
      const bl = pl < 0 ? -pl : pl;
      const br = pr < 0 ? -pr : pr;
      if (bl > this.postPeak) this.postPeak = bl;
      if (br > this.postPeak) this.postPeak = br;
      this.postSq += qc > 1 ? (pl * pl + pr * pr) / 2 : pl * pl;
      this.n++;
      if (this.n === this.blockFrames) this.flush();
    }
    if (armed && blockStart + n >= this.end) this.finish();
    return this.alive;
  }
}
registerProcessor("${MASTER_METER_PROCESSOR}", OakMasterMeter);
`;

/** One block summary from the worklet: sums of squares (channel mean) and the largest |sample|, before and after the limiter. */
export interface MeterBlock {
  frames: number;
  preSq: number;
  prePeak: number;
  postSq: number;
  postPeak: number;
}

export type LimiterState =
  /** Less than 1 dB of gain reduction throughout. */
  | "resting"
  /** More than 1 dB at moments, for at most a tenth of the sounding time: it catches the loudest hits. */
  | "touching"
  /** More than 1 dB for over a tenth of the sounding time: the piece is being pushed against it. */
  | "working";

/** The read-out of one measured span. Levels are dBFS; `-Infinity` is digital silence. */
export interface MasterReading {
  /** Seconds measured, counted in samples. */
  seconds: number;
  /** Average level of what the listener hears (after the limiter): RMS over the whole span. */
  levelDb: number;
  /** The same before the limiter. */
  preLevelDb: number;
  /** Loudest sample before the limiter. Above the limiter's threshold it is being caught; above 0 it would clip. */
  peakDb: number;
  /** Loudest sample after the limiter: what reaches the speakers and the recorder. */
  outPeakDb: number;
  /** The loudest stretch of `LOUDEST_WINDOW_SEC` (after the limiter) and where it starts; `null` on a shorter span. */
  loudest: { levelDb: number; atSec: number; seconds: number } | null;
  limiter: {
    state: LimiterState;
    /** The most level the limiter took off in any block, dB (0: none). */
    maxReductionDb: number;
    /** Share of the sounding time with more than `LIMITER_WORKING_DB` of reduction, 0 to 1. */
    workingShare: number;
    /** Seconds from the start of the first block with more than `LIMITER_WORKING_DB` of reduction, or `null`. */
    firstAtSec: number | null;
  };
  /** Share of the span that was silent (below −70 dBFS): long rests pull the average down, and this says so. */
  silentShare: number;
}

const db10 = (power: number) => (power > 0 ? 10 * Math.log10(power) : Number.NEGATIVE_INFINITY);
const db20 = (amp: number) => (amp > 0 ? 20 * Math.log10(amp) : Number.NEGATIVE_INFINITY);
/** A level in dB as a linear gain. */
export const dbToGain = (db: number): number => 10 ** (db / 20);
const round1 = (x: number) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : x);

/** The gain reduction of one block, dB (≥ 0); 0 for a silent block. */
export function blockReductionDb(b: MeterBlock): number {
  if (b.frames <= 0) return 0;
  const pre = b.preSq / b.frames;
  const post = b.postSq / b.frames;
  if (db10(pre) < METER_SILENCE_DB || post <= 0) return 0;
  return Math.max(0, db10(pre) - db10(post));
}

/** The limiter's verdict from its largest reduction and the share of time above 1 dB (CF-A's Master card). */
export function limiterState(maxReductionDb: number, workingShare: number): LimiterState {
  if (maxReductionDb < LIMITER_WORKING_DB) return "resting";
  return workingShare > LIMITER_WORKING_SHARE ? "working" : "touching";
}

/** The reading of a run of blocks (pure: the worklet posts the blocks, this adds them up). */
export function summarizeMeter(blocks: readonly MeterBlock[], sampleRate: number): MasterReading {
  let frames = 0;
  let preSq = 0;
  let postSq = 0;
  let prePeak = 0;
  let postPeak = 0;
  let silent = 0;
  let sounding = 0;
  let working = 0;
  let maxRed = 0;
  let firstAt: number | null = null;
  for (const b of blocks) {
    const red = blockReductionDb(b);
    if (db10(b.preSq / Math.max(1, b.frames)) < METER_SILENCE_DB) silent += b.frames;
    else {
      sounding += b.frames;
      if (red > LIMITER_WORKING_DB) {
        working += b.frames;
        firstAt ??= frames / sampleRate;
      }
    }
    if (red > maxRed) maxRed = red;
    frames += b.frames;
    preSq += b.preSq;
    postSq += b.postSq;
    if (b.prePeak > prePeak) prePeak = b.prePeak;
    if (b.postPeak > postPeak) postPeak = b.postPeak;
  }
  // The loudest stretch: a window of whole blocks nearest LOUDEST_WINDOW_SEC, slid block by block.
  let loudest: MasterReading["loudest"] = null;
  const want = LOUDEST_WINDOW_SEC * sampleRate;
  if (frames >= want) {
    let lo = 0;
    let sum = 0;
    let n = 0;
    let at = 0;
    let best = -1;
    for (let hi = 0; hi < blocks.length; hi++) {
      const b = blocks[hi] as MeterBlock;
      sum += b.postSq;
      n += b.frames;
      while (n - (blocks[lo] as MeterBlock).frames >= want) {
        const drop = blocks[lo] as MeterBlock;
        sum -= drop.postSq;
        n -= drop.frames;
        at += drop.frames;
        lo++;
      }
      // A later window wins only when it is clearly louder (0.05 dB): a steady piece reads from its start.
      if (n >= want && sum / n > best * 1.012) {
        best = sum / n;
        loudest = {
          levelDb: round1(db10(sum / n)),
          atSec: round1(at / sampleRate),
          seconds: round1(n / sampleRate),
        };
      }
    }
  }
  const workingShare = sounding > 0 ? working / sounding : 0;
  return {
    seconds: frames / sampleRate,
    levelDb: round1(db10(frames > 0 ? postSq / frames : 0)),
    preLevelDb: round1(db10(frames > 0 ? preSq / frames : 0)),
    peakDb: round1(db20(prePeak)),
    outPeakDb: round1(db20(postPeak)),
    loudest,
    limiter: {
      state: limiterState(maxRed, workingShare),
      maxReductionDb: round1(maxRed),
      workingShare: Math.round(workingShare * 1000) / 1000,
      firstAtSec: firstAt === null ? null : round1(firstAt),
    },
    silentShare: frames > 0 ? Math.round((silent / frames) * 1000) / 1000 : 0,
  };
}

/** A level as the card prints it: "−14.2 dB", "silent". Never a unit other than dB (full scale is 0). */
export function levelText(db: number): string {
  if (!Number.isFinite(db)) return "silent";
  const r = Math.round(db * 10) / 10;
  return `${r < 0 ? "−" : r > 0 ? "+" : ""}${Math.abs(r).toFixed(1)} dB`;
}

/** What the limiter did, in the brief's words ("It is a safety net, not a volume knob"). */
export function limiterWords(reading: Pick<MasterReading, "limiter">): string {
  const l = reading.limiter;
  if (l.state === "resting") return "The limiter rested.";
  const off = `${l.maxReductionDb.toFixed(1)} dB`;
  if (l.state === "touching") return `The limiter caught the loudest hits (up to ${off}).`;
  const share = Math.round(l.workingShare * 100);
  return `The limiter worked through ${share}% of it (up to ${off}). Turn every .gain() down by the same share.`;
}

/** The limiter's threshold (@oak/strudel's master bus): where it starts to take level off. */
export const LIMITER_THRESHOLD_DB = -3;
/** Where a mastered song's loudest moment sits: a little under the threshold, so the limiter at most touches. */
export const TARGET_PEAK_DB = -6;
/** A loudest moment this far down reads as quiet: the song would sit far below the rest of the record. */
export const QUIET_PEAK_DB = -18;

/** The one factor for every `.gain()` that brings `peakDb` to the target: 0.08, 0.5, 2.5, 6. */
export function gainFactor(peakDb: number): number {
  const k = 10 ** ((TARGET_PEAK_DB - peakDb) / 20);
  if (k < 1) return Number(k.toPrecision(1));
  return k < 5 ? Math.round(k * 2) / 2 : Math.round(k);
}

/**
 * What to do about the level, with the number: a song pushed against the limiter all the time comes down, a song
 * whose loudest moment sits far under it comes up, by one factor on every `.gain()`. `null`: nothing to do.
 */
export function levelAdvice(reading: Pick<MasterReading, "peakDb" | "limiter">): string | null {
  if (!Number.isFinite(reading.peakDb)) return null;
  if (reading.limiter.state === "working")
    return `Every .gain() times about ${gainFactor(reading.peakDb)} brings the loudest moment just under the limiter.`;
  if (reading.peakDb < QUIET_PEAK_DB)
    return `That is quiet: the loudest moment is ${Math.round(LIMITER_THRESHOLD_DB - reading.peakDb)} dB under where the limiter starts (${levelText(LIMITER_THRESHOLD_DB)}). Every .gain() times about ${gainFactor(reading.peakDb)} brings it up to the rest of your record.`;
  return null;
}

/** The lines of the read-out: the average level and the loudest moment, the limiter, and what to do, if anything. */
export function readingLines(reading: MasterReading): string[] {
  if (!Number.isFinite(reading.levelDb)) return ["Nothing sounded while Oak was measuring."];
  const advice = levelAdvice(reading);
  return [
    `Average level ${levelText(reading.levelDb)}. Loudest moment ${levelText(reading.peakDb)} before the limiter.`,
    limiterWords(reading),
    ...(advice ? [advice] : []),
  ];
}

/** What a live meter shows while the piece plays: the newest block. */
export interface MeterLive {
  /** Seconds measured so far. */
  seconds: number;
  /** Level of the newest block after the limiter, and its loudest sample before the limiter. */
  levelDb: number;
  peakDb: number;
  reductionDb: number;
}

/** The part of AudioWorkletNode this module uses. */
export interface MeterWorkletNodeLike {
  readonly port: {
    onmessage: ((e: { data: unknown }) => void) | null;
    postMessage(message: unknown): void;
  };
  disconnect(): void;
}
interface Connectable {
  connect(destination: never, output?: number, input?: number): unknown;
  disconnect(destination: never, output?: number, input?: number): void;
}

export interface MasterMeterDeps {
  ctx: {
    readonly sampleRate: number;
    readonly currentTime: number;
    readonly audioWorklet: { addModule(url: string): Promise<void> };
  };
  /** The bus before the limiter (`OakStrudel.master.input` or `preAnalyser`). */
  pre: Connectable;
  /** The bus after the limiter and its trim (`OakStrudel.master.analyser`): what the speakers get. */
  post: Connectable;
  /** Seconds the limiter delays its output. Default `LIMITER_LOOKAHEAD_SEC`. */
  lookaheadSec?: number;
  blockFrames?: number;
  /** Default: a Blob URL of `MASTER_METER_SOURCE`. */
  workletUrl?: string;
  /** Default: `new AudioWorkletNode(ctx, name, options)`. */
  createNode?: (name: string, options: AudioWorkletNodeOptions) => MeterWorkletNodeLike;
}

export interface MasterMeter {
  /** Loads the worklet (once per context). `measure` calls it when needed. */
  prepare(): Promise<void>;
  readonly measuring: boolean;
  /**
   * Measures `[at, at + seconds)` on the audio clock (default: from now) and resolves with the reading: a full
   * play-through is `at` = the time of bar 1 and `seconds` = bars × seconds per bar. With no `seconds` it runs
   * until `stop()`.
   */
  measure(opts?: { at?: number; seconds?: number }): Promise<MasterReading>;
  /** Ends an open measurement now; its promise resolves with what was measured. */
  stop(): void;
  /** The reading so far of the measurement that is running (or of the last one), `null` before the first block. */
  reading(): MasterReading | null;
  /** Called with every block while measuring (about twelve times a second). */
  subscribe(cb: (live: MeterLive) => void): () => void;
  dispose(): void;
}

const loaded = new WeakMap<object, Promise<void>>();
const loadedNow = new WeakSet<object>();
let sourceUrl: string | null = null;

export function createMasterMeterWith(deps: MasterMeterDeps): MasterMeter {
  const { ctx } = deps;
  const sr = ctx.sampleRate;
  const blockFrames = Math.max(128, Math.round(deps.blockFrames ?? METER_BLOCK_FRAMES));
  const delayFrames = Math.max(0, Math.round((deps.lookaheadSec ?? LIMITER_LOOKAHEAD_SEC) * sr));
  const createNode =
    deps.createNode ??
    ((name: string, options: AudioWorkletNodeOptions) =>
      new AudioWorkletNode(
        ctx as unknown as BaseAudioContext,
        name,
        options,
      ) as unknown as MeterWorkletNodeLike);
  let node: MeterWorkletNodeLike | null = null;
  let disposed = false;
  let blocks: MeterBlock[] = [];
  let active: { finish(): void; fail(err: Error): void } | null = null;
  const subs = new Set<(live: MeterLive) => void>();

  const prepare = (): Promise<void> => {
    let p = loaded.get(ctx);
    if (!p) {
      if (!deps.workletUrl && sourceUrl === null)
        sourceUrl = URL.createObjectURL(new Blob([MASTER_METER_SOURCE], { type: "text/javascript" }));
      p = ctx.audioWorklet.addModule(deps.workletUrl ?? (sourceUrl as string)).then(() => {
        loadedNow.add(ctx);
      });
      loaded.set(ctx, p);
      p.catch(() => loaded.delete(ctx));
    }
    return p;
  };

  /**
   * The node, armed for `[startFrame, startFrame + frames)`. The first measurement arms the worklet as it is
   * built (its options), not by a message: an OfflineAudioContext can render the whole piece before a message
   * posted just ahead of `startRendering()` is delivered.
   */
  const armedNode = (arm: { startFrame: number; frames: number }): MeterWorkletNodeLike => {
    if (node) {
      node.port.postMessage({ type: "arm", ...arm });
      return node;
    }
    node = createNode(MASTER_METER_PROCESSOR, {
      numberOfInputs: 2,
      numberOfOutputs: 0,
      channelCount: 2,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
      processorOptions: { blockFrames, delayFrames, arm },
    });
    deps.pre.connect(node as never, 0, 0);
    deps.post.connect(node as never, 0, 1);
    return node;
  };

  return {
    prepare,
    get measuring() {
      return active !== null;
    },
    reading: () => (blocks.length > 0 ? summarizeMeter(blocks, sr) : null),
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    async measure(opts = {}) {
      if (disposed) throw new Error("@oak/audio: the meter was disposed");
      if (active) throw new Error("@oak/audio: a measurement is already running");
      let cancelled: Error | null = null;
      active = {
        finish() {},
        fail(err) {
          cancelled = err;
        },
      };
      try {
        // Armed in this same task once the worklet is loaded, so an offline render started next is measured.
        if (!loadedNow.has(ctx)) await prepare();
      } catch (e) {
        active = null;
        throw e instanceof Error ? e : new Error(String(e));
      }
      if (cancelled) {
        active = null;
        throw cancelled;
      }
      const startFrame = Math.round((opts.at ?? ctx.currentTime) * sr);
      const frames =
        opts.seconds === undefined || !Number.isFinite(opts.seconds)
          ? -1
          : Math.max(0, Math.round(opts.seconds * sr));
      blocks = [];
      // Listening is set up before the worklet can answer.
      let onMessage: ((e: { data: unknown }) => void) | null = null;
      const fresh = node === null;
      const n = fresh ? armedNode({ startFrame, frames }) : (node as MeterWorkletNodeLike);
      n.port.onmessage = (e) => onMessage?.(e);
      return new Promise<MasterReading>((resolve, reject) => {
        let measured = 0;
        const end = () => {
          n.port.onmessage = null;
          active = null;
        };
        active = {
          finish() {
            n.port.postMessage({ type: "stop" });
          },
          fail(err) {
            n.port.postMessage({ type: "stop" });
            end();
            reject(err);
          },
        };
        onMessage = (e) => {
          const d = e.data as ({ type: "block" } & MeterBlock) | { type: "done" };
          if (d.type === "block") {
            const b: MeterBlock = {
              frames: d.frames,
              preSq: d.preSq,
              prePeak: d.prePeak,
              postSq: d.postSq,
              postPeak: d.postPeak,
            };
            blocks.push(b);
            measured += b.frames;
            if (subs.size > 0) {
              const live: MeterLive = {
                seconds: measured / sr,
                levelDb: round1(db10(b.postSq / b.frames)),
                peakDb: round1(db20(b.prePeak)),
                reductionDb: round1(blockReductionDb(b)),
              };
              for (const cb of [...subs]) cb(live);
            }
            return;
          }
          if (d.type !== "done") return;
          end();
          resolve(summarizeMeter(blocks, sr));
        };
        if (!fresh) armedNode({ startFrame, frames });
      });
    },
    stop() {
      active?.finish();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      active?.fail(new Error("@oak/audio: the meter was disposed"));
      subs.clear();
      if (node) {
        for (const [src, input] of [
          [deps.pre, 0],
          [deps.post, 1],
        ] as const) {
          try {
            src.disconnect(node as never, 0, input);
          } catch {
            // the bus is gone already
          }
        }
        node.port.postMessage({ type: "dispose" });
        node.disconnect();
        node = null;
      }
    },
  };
}

/**
 * The Master meter on a real context: `pre` is the bus before the limiter (`master.input`), `post` the bus after
 * it (`master.analyser`). Side branches only: nothing is added to the signal path.
 */
export function createMasterMeter(
  ctx: BaseAudioContext,
  bus: { pre: AudioNode; post: AudioNode },
  opts: Omit<MasterMeterDeps, "ctx" | "pre" | "post"> = {},
): MasterMeter {
  return createMasterMeterWith({
    ...opts,
    ctx: ctx as unknown as MasterMeterDeps["ctx"],
    pre: bus.pre as unknown as Connectable,
    post: bus.post as unknown as Connectable,
  });
}

// --- the reference listen ---------------------------------------------------------------------------------------

/** The part of a decoded AudioBuffer the reference listen reads. */
export interface BufferLike {
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  readonly length: number;
  getChannelData(channel: number): ArrayLike<number>;
}

/** Average level (RMS over all channels) and loudest sample of a span of a decoded track, dBFS. */
export function levelOfBuffer(
  buffer: BufferLike,
  span: { fromS?: number; seconds?: number } = {},
): { levelDb: number; peakDb: number; seconds: number } {
  const sr = buffer.sampleRate;
  const from = Math.max(0, Math.min(buffer.length, Math.round((span.fromS ?? 0) * sr)));
  const to =
    span.seconds === undefined
      ? buffer.length
      : Math.min(buffer.length, from + Math.round(span.seconds * sr));
  const channels = Math.max(1, buffer.numberOfChannels);
  let sq = 0;
  let peak = 0;
  for (let c = 0; c < channels; c++) {
    const x = buffer.getChannelData(c);
    for (let i = from; i < to; i++) {
      const v = x[i] as number;
      sq += v * v;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
  }
  const n = Math.max(0, to - from);
  return {
    levelDb: round1(db10(n > 0 ? sq / (n * channels) : 0)),
    peakDb: round1(db20(peak)),
    seconds: n / sr,
  };
}

/**
 * Where the loudest `seconds` of a track start (searched in half-second steps): the stretch a reference listen
 * plays, so twenty seconds of an earlier track are its chorus and not its count-in.
 */
export function loudestSpan(
  buffer: BufferLike,
  seconds: number,
  hopSec = 0.5,
): { fromS: number; seconds: number } {
  const sr = buffer.sampleRate;
  const total = buffer.length / sr;
  if (total <= seconds) return { fromS: 0, seconds: total };
  const hop = Math.max(1, Math.round(hopSec * sr));
  const channels = Math.max(1, buffer.numberOfChannels);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  const hops = Math.floor(buffer.length / hop);
  const energy = new Float64Array(hops);
  for (let h = 0; h < hops; h++) {
    let sq = 0;
    for (const x of data) for (let i = h * hop; i < (h + 1) * hop; i++) sq += (x[i] as number) ** 2;
    energy[h] = sq;
  }
  const win = Math.max(1, Math.round((seconds * sr) / hop));
  let sum = 0;
  for (let h = 0; h < Math.min(win, hops); h++) sum += energy[h] as number;
  let best = sum;
  let at = 0;
  for (let h = win; h < hops; h++) {
    sum += (energy[h] as number) - (energy[h - win] as number);
    if (sum > best + 1e-12) {
      best = sum;
      at = h - win + 1;
    }
  }
  return { fromS: (at * hop) / sr, seconds };
}

/** The most the louder side is turned down to match the other, dB. */
export const MATCH_MAX_CUT_DB = 18;
/** Within this the two are "about as loud". */
export const MATCH_SAME_DB = 1.5;

export interface LoudnessMatch {
  /** The piece's average level minus the reference's, dB: positive, the piece is louder. */
  offsetDb: number;
  /** Gains that bring both to the quieter one's level (linear, ≤ 1 unless the reference had to be raised). */
  mine: number;
  reference: number;
  mineDb: number;
  referenceDb: number;
  /** `false` when the gap was larger than the gains may close; `residualDb` is what is left (piece − reference). */
  matched: boolean;
  residualDb: number;
}

/**
 * Gains for a reference listen at matched loudness: the LOUDER side is turned down to the level of the quieter
 * one (never more than `MATCH_MAX_CUT_DB`). When the piece is the louder one and the host cannot turn it down
 * (`canCutMine: false`), the reference is raised instead, as far as its own loudest sample allows without
 * reaching the limiter's threshold (−3 dBFS); what cannot be closed is reported, not hidden.
 */
export function matchLoudness(
  mineLevelDb: number,
  reference: { levelDb: number; peakDb: number },
  opts: { canCutMine?: boolean; limiterThresholdDb?: number } = {},
): LoudnessMatch {
  const offset = mineLevelDb - reference.levelDb;
  if (!Number.isFinite(offset)) {
    return {
      offsetDb: offset,
      mine: 1,
      reference: 1,
      mineDb: 0,
      referenceDb: 0,
      matched: false,
      residualDb: offset,
    };
  }
  let mineDb = 0;
  let referenceDb = 0;
  if (offset <= 0) referenceDb = Math.max(-MATCH_MAX_CUT_DB, offset);
  else if (opts.canCutMine !== false) mineDb = -Math.min(MATCH_MAX_CUT_DB, offset);
  else referenceDb = Math.max(0, Math.min(offset, (opts.limiterThresholdDb ?? -3) - reference.peakDb));
  const residual = offset + mineDb - referenceDb;
  return {
    offsetDb: round1(offset),
    mine: dbToGain(mineDb),
    reference: dbToGain(referenceDb),
    mineDb: round1(mineDb),
    referenceDb: round1(referenceDb),
    matched: Math.abs(residual) <= 0.5,
    residualDb: round1(residual),
  };
}

/** "about as loud as", "3 dB quieter than", "5 dB louder than": the piece against the reference. */
export function loudnessWords(offsetDb: number): string {
  if (!Number.isFinite(offsetDb)) return "not comparable with";
  if (Math.abs(offsetDb) <= MATCH_SAME_DB) return "about as loud as";
  const n = Math.round(Math.abs(offsetDb));
  return `${n} dB ${offsetDb < 0 ? "quieter than" : "louder than"}`;
}

export type ReferenceSide = "mine" | "reference";
export interface ReferenceAbState {
  side: ReferenceSide;
  /** The reference excerpt is sounding. */
  playing: boolean;
  /** The reference loaded: its excerpt and that excerpt's level. */
  reference: { fromS: number; seconds: number; levelDb: number; peakDb: number } | null;
  /** Set by `match`. */
  match: LoudnessMatch | null;
}

interface GainLike {
  gain: {
    value: number;
    setValueAtTime(value: number, time: number): unknown;
    linearRampToValueAtTime(value: number, time: number): unknown;
    cancelScheduledValues(time: number): unknown;
  };
  connect(destination: never): unknown;
  disconnect(): void;
}
interface SourceLike {
  buffer: unknown;
  onended: (() => void) | null;
  connect(destination: never): unknown;
  disconnect(): void;
  start(when?: number, offset?: number, duration?: number): void;
  stop(when?: number): void;
}

export interface ReferenceAbDeps {
  ctx: { readonly currentTime: number; createGain(): GainLike; createBufferSource(): SourceLike };
  /** Where the reference plays: the master bus input, so it shares the listener's volume with the piece. */
  output: unknown;
  /**
   * The piece's own gain (the host's: a gain on the pattern side), so the piece can be the side that is turned
   * down. Without it only the reference is adjusted.
   */
  mine?: { setGain(gain: number): void };
  /** Seconds of the reference a listen plays. Default 20 (CF-A's Master card). */
  excerptSec?: number;
  /** Fade at the start and end of the excerpt, seconds. Default 0.03. */
  fadeSec?: number;
}

export interface ReferenceAb {
  readonly state: ReferenceAbState;
  /** The earlier track, decoded. The excerpt is its loudest `excerptSec`. */
  load(buffer: AudioBuffer | BufferLike): NonNullable<ReferenceAbState["reference"]>;
  /** Sets the gains from the piece's measured average level (`MasterReading.levelDb`). */
  match(mineLevelDb: number): LoudnessMatch;
  /**
   * `reference`: mutes the piece and plays the excerpt from its start at the matched gain (`at`: an audio-clock
   * time, default now). `mine`: fades the reference out and gives the piece its matched gain. The host keeps the
   * piece's transport running; switching is gains only on its side.
   */
  listen(side: ReferenceSide, opts?: { at?: number }): void;
  /** Stops the reference and gives the piece its full gain back. */
  stop(): void;
  subscribe(cb: (s: ReferenceAbState) => void): () => void;
  dispose(): void;
}

/** The reference listen: an earlier track against the piece at matched loudness (see the file header). */
export function createReferenceAb(deps: ReferenceAbDeps): ReferenceAb {
  const { ctx } = deps;
  const excerptSec = deps.excerptSec ?? 20;
  const fade = deps.fadeSec ?? 0.03;
  let buffer: BufferLike | null = null;
  let state: ReferenceAbState = { side: "mine", playing: false, reference: null, match: null };
  let voice: { source: SourceLike; gain: GainLike } | null = null;
  const subs = new Set<(s: ReferenceAbState) => void>();
  const set = (patch: Partial<ReferenceAbState>) => {
    state = { ...state, ...patch };
    for (const cb of [...subs]) cb(state);
  };
  const stopVoice = () => {
    const v = voice;
    if (!v) return;
    voice = null;
    const now = ctx.currentTime;
    v.source.onended = () => {
      v.source.disconnect();
      v.gain.disconnect();
    };
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(v.gain.gain.value, now);
    v.gain.gain.linearRampToValueAtTime(0, now + fade);
    try {
      v.source.stop(now + fade + 0.005);
    } catch {
      // never started
    }
  };
  const mineGain = () => (state.match ? state.match.mine : 1);

  return {
    get state() {
      return state;
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    load(next) {
      stopVoice();
      buffer = next;
      const span = loudestSpan(next, excerptSec);
      const level = levelOfBuffer(next, span);
      const reference = { ...span, levelDb: level.levelDb, peakDb: level.peakDb };
      set({ reference, match: null, playing: false, side: "mine" });
      return reference;
    },
    match(mineLevelDb) {
      if (!state.reference) throw new Error("@oak/audio: load a reference before matching");
      const match = matchLoudness(mineLevelDb, state.reference, { canCutMine: deps.mine !== undefined });
      set({ match });
      if (state.side === "mine") deps.mine?.setGain(match.mine);
      return match;
    },
    listen(side, opts = {}) {
      if (side === "mine") {
        stopVoice();
        deps.mine?.setGain(mineGain());
        set({ side: "mine", playing: false });
        return;
      }
      const ref = state.reference;
      if (!buffer || !ref) throw new Error("@oak/audio: load a reference before listening to it");
      stopVoice();
      deps.mine?.setGain(0);
      const at = Math.max(ctx.currentTime, opts.at ?? ctx.currentTime);
      const g = state.match ? state.match.reference : 1;
      const gain = ctx.createGain();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(g, at + fade);
      gain.gain.setValueAtTime(g, at + Math.max(fade, ref.seconds - fade));
      gain.gain.linearRampToValueAtTime(0, at + ref.seconds);
      source.connect(gain as never);
      gain.connect(deps.output as never);
      const own = { source, gain };
      source.onended = () => {
        if (voice !== own) return;
        voice = null;
        source.disconnect();
        gain.disconnect();
        // The excerpt is over: back to the piece.
        deps.mine?.setGain(mineGain());
        set({ side: "mine", playing: false });
      };
      source.start(at, ref.fromS, ref.seconds);
      voice = own;
      set({ side: "reference", playing: true });
    },
    stop() {
      stopVoice();
      deps.mine?.setGain(1);
      set({ side: "mine", playing: false });
    },
    dispose() {
      stopVoice();
      deps.mine?.setGain(1);
      subs.clear();
      buffer = null;
    },
  };
}
