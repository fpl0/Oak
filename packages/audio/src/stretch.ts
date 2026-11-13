// Wave 4 seam (docs/design/wave4.md §3.4): the Transcribe audio engine. Three interfaces the audio engineer
// implements and everyone else codes against now:
//
//   StretchPlayer  the learner's decoded audio through signalsmith-stretch on Oak's one AudioContext: play /
//                  pause / seek, rate, transpose, fine-tune, an A–B loop, and a clock that maps source time to
//                  AudioContext time (what the A/B switch and "play from bar N" schedule against).
//   AbSwitch       one transport over two sides, the source (StretchPlayer or a pattern source) and the learner's
//                  Strudel pattern: switching sides keeps the position; the Wave 4 gate is drift < 20 ms over
//                  8 bars at 0.75× (`abDriftMs`, `AB_DRIFT_GATE_MS`).
//   MasterRecorder MediaRecorder on the master bus tap to a Blob (album export of a release, a transcription
//                  version over its audio). `OakStrudel.recorder` already records N bars of the active editor;
//                  this one records a span of seconds from any source, the stretch player included.
//
// Built in Wave 4: `createStretchPlayer` (stretch-player.ts, signalsmith-stretch), `createAbSwitch`
// (ab-switch.ts) and `createMasterRecorder` (master-recorder.ts); the A/B gate is measured on real audio in
// packages/audio/e2e/ab-gate.pw.ts. `fakeStretchPlayer` and `fakeMasterRecorder` stay: honest no-op fakes with a
// manual clock, for unit tests and UI work. `AudioNotBuiltError` stays exported for hosts that still catch it.
import { createAbSwitchWith } from "./ab-switch.ts";
import { createMasterRecorderWith } from "./master-recorder.ts";
import { createStretchEngine, type StretchEngineDeps } from "./stretch-player.ts";

/** Rate limits of the engine. Transcribe's UI clamps to 0.25–1 (contracts §6.12, 25–100 %); 1.5 is for previews. */
export const STRETCH_RATE_RANGE: readonly [number, number] = [0.25, 1.5];
/** The rate range Transcribe offers (contracts §6.12). */
export const TRANSCRIBE_RATE_RANGE: readonly [number, number] = [0.25, 1];
export const STRETCH_SEMITONE_RANGE: readonly [number, number] = [-12, 12];
export const STRETCH_CENTS_RANGE: readonly [number, number] = [-50, 50];
/** The Wave 4 A/B gate: drift between the source and the learner's pattern over 8 bars at 0.75×. */
export const AB_DRIFT_GATE_MS = 20;
export const AB_DRIFT_GATE_BARS = 8;
export const AB_DRIFT_GATE_RATE = 0.75;

export class AudioNotBuiltError extends Error {
  readonly code = "audio_not_built";
  constructor(what: string) {
    super(`@oak/audio: ${what} is not built yet (docs/design/wave4.md §3.4)`);
    this.name = "AudioNotBuiltError";
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : lo));
export const clampStretchRate = (r: number): number => clamp(r, STRETCH_RATE_RANGE[0], STRETCH_RATE_RANGE[1]);
export const clampSemitones = (s: number): number =>
  Math.round(clamp(s, STRETCH_SEMITONE_RANGE[0], STRETCH_SEMITONE_RANGE[1]));
export const clampCents = (c: number): number => clamp(c, STRETCH_CENTS_RANGE[0], STRETCH_CENTS_RANGE[1]);

/** A–B loop in source seconds. */
export interface LoopSpan {
  startS: number;
  endS: number;
}

/**
 * The mapping between source time (seconds into the file, at rate 1) and AudioContext time while playing.
 * Linear between loop wraps: `ctxTime = anchorCtx + (sourceS - anchorSourceS) / rate`.
 */
export interface StretchClock {
  /** AudioContext time at which `sourceS` sounds (next pass, when a loop is on); `null` when paused. */
  ctxTimeOf(sourceS: number): number | null;
  /** Source time sounding at `ctxTime` (honours the loop); the paused position when paused. */
  sourceTimeAt(ctxTime: number): number;
  /** The anchor the linear map is built from (changes on play, seek, rate change and loop wrap). */
  readonly anchor: { ctxTime: number; sourceS: number; rate: number } | null;
}

export interface StretchPlayerState {
  loaded: boolean;
  playing: boolean;
  /** Source position, seconds. */
  time: number;
  durationS: number;
  rate: number;
  semitones: number;
  cents: number;
  loop: LoopSpan | null;
  /** 0 to 1, the source's level against the learner's pattern. */
  gain: number;
}

export interface StretchPlayer {
  /** Takes an already decoded buffer (decoding is the caller's: `ctx.decodeAudioData`). */
  load(buffer: AudioBuffer): Promise<void>;
  /** Starts at `at` (AudioContext time; default now + a small lead) from `fromS` (default the position). */
  play(opts?: { at?: number; fromS?: number }): Promise<void>;
  pause(): void;
  seek(sourceS: number): void;
  /** 0.25 to 1.5, pitch kept. */
  setRate(rate: number): void;
  /** −12 to 12. */
  setSemitones(semitones: number): void;
  /** −50 to 50. */
  setCents(cents: number): void;
  setLoop(loop: LoopSpan | null): void;
  setGain(gain: number): void;
  readonly clock: StretchClock;
  readonly state: StretchPlayerState;
  subscribe(cb: (s: StretchPlayerState) => void): () => void;
  dispose(): void;
}

/** What `createStretchPlayer` needs: Oak's one context and the node to play into (`OakStrudel.master.input`). */
export interface StretchPlayerDeps {
  ctx: AudioContext;
  output: AudioNode;
  /** Register with the playback coordinator (`OakStrudel.coordinator.claim`), so only one source plays. */
  claim?: (source: { id: string; kind: "external"; stop(): void }) => () => void;
}

/** The signalsmith-stretch engine (stretch-player.ts). `deps` may also carry the engine's test hooks. */
export async function createStretchPlayer(deps: StretchPlayerDeps): Promise<StretchPlayer> {
  return createStretchEngine(deps as StretchEngineDeps);
}

// --- A/B --------------------------------------------------------------------------------------------

export type AbSide = "source" | "mine" | "both";

/** The learner's pattern as the A/B switch drives it (an `EditorHandle` + `Transport` of @oak/strudel). */
export interface PatternSideLike {
  /** Bars per second of the learner's code at rate 1 (its cps). */
  cps(): number;
  /**
   * Start at AudioContext time `at` from bar `fromBar` (0-based, may be fractional) at `rate` × its own tempo.
   * Called again while started, it restarts there at `at` (a loop pass). One cycle is one bar.
   */
  start(opts: { at: number; fromBar: number; rate: number }): Promise<void>;
  stop(): void;
  setGain(gain: number): void;
  /**
   * AudioContext time at which `cycle` sounds while playing, cycles counted as bars of the material (bar
   * `fromBar` of the last `start` is cycle `fromBar`). The switch anchors the source to it.
   */
  timeOfCycle(cycle: number): number;
}

export interface AbState {
  side: AbSide;
  playing: boolean;
  /** Bar position, 0-based, fractional (source bars from the BeatGrid's downbeat and tempo). */
  bar: number;
  rate: number;
  /** Loop in bars, shared by both sides. */
  loop: { fromBar: number; bars: number } | null;
}

/** Bar grid of the source: where bar 1 starts and how long a bar is, at rate 1. */
export interface SourceGrid {
  downbeatS: number;
  barSec: number;
}

/** One transport over the source and the learner's pattern (ux §9 Transcription Studio mixer: A/B, overlay). */
export interface AbSwitch {
  readonly state: AbState;
  /** `source`: only the original; `mine`: only the learner's; `both`: overlay. Position and loop are kept. */
  setSide(side: AbSide): void;
  toggle(): void;
  play(opts?: { fromBar?: number }): Promise<void>;
  pause(): void;
  setRate(rate: number): void;
  setLoop(loop: { fromBar: number; bars: number } | null): void;
  subscribe(cb: (s: AbState) => void): () => void;
  dispose(): void;
}

/** The shared transport (ab-switch.ts): one musical clock for the source and the learner's pattern. */
export function createAbSwitch(deps: {
  ctx: AudioContext;
  source: StretchPlayer;
  mine: PatternSideLike;
  grid: SourceGrid;
}): AbSwitch {
  return createAbSwitchWith(deps);
}

/**
 * The gate measure: the worst |difference| in ms between when each bar line sounds on the source (through its
 * clock and grid) and on the learner's pattern, over `bars` bars from `fromBar`. Pure: give it the two
 * bar-line timings in AudioContext seconds.
 */
export function abDriftMs(sourceBarTimes: readonly number[], mineBarTimes: readonly number[]): number {
  const n = Math.min(sourceBarTimes.length, mineBarTimes.length);
  let worst = 0;
  for (let i = 0; i < n; i++)
    worst = Math.max(worst, Math.abs((sourceBarTimes[i] as number) - (mineBarTimes[i] as number)) * 1000);
  return worst;
}

/** Bar-line times of the source for bars `fromBar…fromBar+bars` through a clock and a grid. */
export function sourceBarTimes(
  clock: StretchClock,
  grid: SourceGrid,
  fromBar: number,
  bars: number,
): number[] {
  const out: number[] = [];
  for (let b = fromBar; b <= fromBar + bars; b++) {
    const t = clock.ctxTimeOf(grid.downbeatS + b * grid.barSec);
    if (t !== null) out.push(t);
  }
  return out;
}

// --- recording --------------------------------------------------------------------------------------

export interface MasterRecording {
  blob: Blob;
  mime: string;
  durationS: number;
  /** Wave 4 (the built recorder): AudioContext time of the first sample. */
  startAt?: number;
  /** Wave 4: `true` when cut to exactly the asked span (WAV); `false` for a raw take with its pre-roll. */
  exact?: boolean;
}

/** MediaRecorder on the master bus tap (post-limiter; UI sounds never reach it). */
export interface MasterRecorder {
  readonly recording: boolean;
  /** Records from AudioContext time `at` (default now) for `seconds` (+ `tailSec`, default 2). */
  record(opts: {
    seconds: number;
    at?: number;
    tailSec?: number;
    mimeType?: string;
  }): Promise<MasterRecording>;
  cancel(): void;
}

/**
 * MediaRecorder on `tap` (`OakStrudel.master.tap`), cut to exactly `[at, at + seconds + tailSec]` on the context
 * clock and written as WAV (master-recorder.ts). Resolves an `ExactRecording` (`startAt`, `exact`).
 */
export function createMasterRecorder(deps: {
  ctx: AudioContext;
  tap: MediaStreamAudioDestinationNode;
}): MasterRecorder {
  return createMasterRecorderWith(deps);
}

// --- fakes -------------------------------------------------------------------------------------------

/** A stretch player with no audio: a manual clock (`now`), linear time, loops wrap. For tests and early UI. */
export function fakeStretchPlayer(opts: { durationS: number; now?: () => number }): StretchPlayer & {
  /** Moves the fake's own clock (when `now` was not given). */
  advance(seconds: number): void;
} {
  let fakeNow = 0;
  const now = opts.now ?? (() => fakeNow);
  let anchor: { ctxTime: number; sourceS: number; rate: number } | null = null;
  let state: StretchPlayerState = {
    loaded: false,
    playing: false,
    time: 0,
    durationS: opts.durationS,
    rate: 1,
    semitones: 0,
    cents: 0,
    loop: null,
    gain: 1,
  };
  const subs = new Set<(s: StretchPlayerState) => void>();
  const set = (patch: Partial<StretchPlayerState>) => {
    state = { ...state, ...patch };
    for (const cb of [...subs]) cb(state);
  };
  const wrap = (s: number): number => {
    const l = state.loop;
    if (!l || l.endS <= l.startS || s < l.endS) return Math.min(s, state.durationS);
    return l.startS + ((s - l.startS) % (l.endS - l.startS));
  };
  const position = (t: number): number =>
    anchor ? wrap(anchor.sourceS + (t - anchor.ctxTime) * anchor.rate) : state.time;
  const reanchor = () => {
    if (anchor) anchor = { ctxTime: now(), sourceS: position(now()), rate: state.rate };
  };
  const clock: StretchClock = {
    get anchor() {
      return anchor;
    },
    ctxTimeOf(sourceS) {
      if (!anchor) return null;
      return anchor.ctxTime + (sourceS - anchor.sourceS) / anchor.rate;
    },
    sourceTimeAt: (t) => position(t),
  };
  return {
    clock,
    get state() {
      return { ...state, time: position(now()) };
    },
    async load(buffer) {
      set({ loaded: true, durationS: buffer.duration, time: 0 });
    },
    async play(o = {}) {
      if (!state.loaded) throw new Error("@oak/audio: load() a buffer first");
      const from = o.fromS ?? state.time;
      anchor = { ctxTime: o.at ?? now(), sourceS: from, rate: state.rate };
      set({ playing: true, time: from });
    },
    pause() {
      const t = position(now());
      anchor = null;
      set({ playing: false, time: t });
    },
    seek(s) {
      const t = Math.max(0, Math.min(state.durationS, s));
      if (anchor) anchor = { ctxTime: now(), sourceS: t, rate: state.rate };
      set({ time: t });
    },
    setRate(r) {
      reanchor();
      set({ rate: clampStretchRate(r) });
      if (anchor) anchor = { ...anchor, rate: state.rate };
    },
    setSemitones: (s) => set({ semitones: clampSemitones(s) }),
    setCents: (c) => set({ cents: clampCents(c) }),
    setLoop(loop) {
      reanchor();
      set({ loop: loop && loop.endS > loop.startS ? { ...loop } : null });
    },
    setGain: (g) => set({ gain: clamp(g, 0, 1) }),
    subscribe(cb) {
      subs.add(cb);
      cb(state);
      return () => subs.delete(cb);
    },
    dispose() {
      anchor = null;
      subs.clear();
    },
    advance(seconds) {
      fakeNow += seconds;
    },
  };
}

/** A recorder that records nothing: resolves an empty Blob of the asked length (tests, `prefers no audio`). */
export function fakeMasterRecorder(): MasterRecorder {
  let recording = false;
  return {
    get recording() {
      return recording;
    },
    async record(opts) {
      recording = true;
      try {
        return {
          blob: new Blob([], { type: "audio/webm" }),
          mime: "audio/webm",
          durationS: opts.seconds + (opts.tailSec ?? 2),
        };
      } finally {
        recording = false;
      }
    },
    cancel() {
      recording = false;
    },
  };
}
