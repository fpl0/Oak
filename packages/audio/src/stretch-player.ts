// The Transcribe engine (wave4.md §3.4, contracts §6.12): the learner's decoded audio through signalsmith-stretch
// on Oak's one AudioContext, into the node it is given (`OakStrudel.master.input`). Rate 0.25–1.5 without a pitch
// change, ±12 semitones and ±50¢ without a tempo change (the stretch's fractional `semitones`), a sample-accurate
// A–B loop, and a clock that maps source time to AudioContext time (`StretchClock`), which the A/B switch and
// "play from bar N" schedule against.
//
// How the clock stays exact: every change is written to the stretch as one complete segment at an output time,
// and the clock's anchor is that same segment:
// `ctxTime = anchor.ctxTime + (sourceS − anchor.sourceS) / rate`, wrapping inside the loop exactly as the stretch
// wraps (input − loop length once input ≥ loopEnd). The stretch compensates its own input and output latency
// (signalsmith-stretch 1.3.2 seeks ahead by `inputLatency` and evaluates its time map `outputLatency` ahead), so
// the segment's time is when it sounds; `packages/audio/e2e` measures it on the real node.
//
// signalsmith-stretch keeps ONE pending segment: a `schedule` drops every segment that has not started yet (its
// time map treats anything at or after the call as the future to replace). So a change while a start is still
// pending is written at that start's own time (the whole state, replacing it), the file's end is a timer (past
// the buffer the stretch plays silence), and a loop pass is written once the previous one has started.
import type { StretchNode, StretchSchedule } from "signalsmith-stretch";
import {
  clampCents,
  clampSemitones,
  clampStretchRate,
  type LoopSpan,
  type StretchClock,
  type StretchPlayer,
  type StretchPlayerDeps,
  type StretchPlayerState,
} from "./stretch.ts";

/** Seconds between a change and the moment it sounds (one schedule round trip to the worklet, with room). */
export const STRETCH_LEAD_SEC = 0.06;
/** Position updates to subscribers while playing, seconds. */
export const STRETCH_TICK_SEC = 0.05;
/** Shortest A–B loop, seconds. */
export const STRETCH_MIN_LOOP_SEC = 0.05;

/** What the engine needs beyond the seam (`StretchPlayerDeps`): injection points for tests. */
export interface StretchEngineDeps extends StretchPlayerDeps {
  /** Default: `signalsmith-stretch`, imported on first use (its WASM worklet is a Blob URL module). */
  createStretch?: (ctx: BaseAudioContext) => Promise<StretchNode>;
  /** Default `STRETCH_LEAD_SEC`. */
  leadSec?: number;
}

interface Anchor {
  ctxTime: number;
  sourceS: number;
  rate: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Source position at `t` for an anchor, wrapping inside `loop` as the stretch does. */
export function positionAt(anchor: Anchor, t: number, loop: LoopSpan | null, durationS: number): number {
  const raw = anchor.sourceS + (t - anchor.ctxTime) * anchor.rate;
  if (t <= anchor.ctxTime) return anchor.sourceS;
  if (loop && loop.endS > loop.startS && anchor.sourceS < loop.endS && raw >= loop.endS) {
    const len = loop.endS - loop.startS;
    return loop.endS - len + ((raw - loop.endS) % len);
  }
  return Math.min(raw, durationS);
}

/** AudioContext time at which `sourceS` sounds next (not before `now`), or `null` if it never does. */
export function ctxTimeAt(
  anchor: Anchor,
  sourceS: number,
  loop: LoopSpan | null,
  now: number,
): number | null {
  const lin = anchor.ctxTime + (sourceS - anchor.sourceS) / anchor.rate;
  if (!loop || loop.endS <= loop.startS || anchor.sourceS >= loop.endS) return lin;
  if (sourceS >= loop.endS) return null;
  if (sourceS >= anchor.sourceS) {
    if (lin >= now) return lin;
  } else if (sourceS < loop.startS) return null;
  const pass = (loop.endS - loop.startS) / anchor.rate;
  // The first pass that reaches `sourceS` after the anchor, then whole passes until it is not in the past.
  let t =
    sourceS >= anchor.sourceS
      ? lin
      : anchor.ctxTime + (loop.endS - anchor.sourceS + (sourceS - loop.startS)) / anchor.rate;
  if (t < now) t += Math.ceil((now - t) / pass - 1e-9) * pass;
  return t;
}

/** The signalsmith-stretch engine behind the `StretchPlayer` seam. */
export async function createStretchEngine(deps: StretchEngineDeps): Promise<StretchPlayer> {
  const { ctx } = deps;
  const lead = deps.leadSec ?? STRETCH_LEAD_SEC;
  const createStretch =
    deps.createStretch ??
    (async (c: BaseAudioContext) => {
      const mod = await import("signalsmith-stretch");
      return mod.default(c);
    });
  const stretch = await createStretch(ctx);
  const gain = ctx.createGain();
  stretch.connect(gain);
  gain.connect(deps.output);

  let disposed = false;
  let anchor: Anchor | null = null;
  let release: (() => void) | null = null;
  let endTimer: ReturnType<typeof setTimeout> | null = null;
  let state: StretchPlayerState = {
    loaded: false,
    playing: false,
    time: 0,
    durationS: 0,
    rate: 1,
    semitones: 0,
    cents: 0,
    loop: null,
    gain: 1,
  };
  const subs = new Set<(s: StretchPlayerState) => void>();
  const now = () => ctx.currentTime;
  const position = (t: number): number =>
    anchor ? positionAt(anchor, t, state.loop, state.durationS) : state.time;
  const view = (): StretchPlayerState => ({ ...state, time: position(now()) });
  const emit = () => {
    const v = view();
    for (const cb of [...subs]) cb(v);
  };
  const set = (patch: Partial<StretchPlayerState>) => {
    state = { ...state, ...patch };
    emit();
  };
  const pitch = () => state.semitones + state.cents / 100;
  const loopFields = () => ({ loopStart: state.loop?.startS ?? 0, loopEnd: state.loop?.endS ?? 0 });
  /** One segment at output time `output`: replaces every segment that has not started yet. */
  const write = (change: StretchSchedule & { output: number }) => stretch.schedule(change);

  const clearEnd = () => {
    if (endTimer !== null) clearTimeout(endTimer);
    endTimer = null;
  };
  /** Without a loop the file ends: past the buffer the stretch is silent; the state says so, and it parks. */
  const planEnd = () => {
    clearEnd();
    if (!anchor || state.loop) return;
    const endAt = anchor.ctxTime + (state.durationS - anchor.sourceS) / anchor.rate;
    endTimer = setTimeout(
      () => {
        endTimer = null;
        if (!anchor || state.loop || disposed) return;
        if (now() + 1e-3 < endAt) return planEnd();
        anchor = null;
        void write({ active: false, output: now() });
        release?.();
        release = null;
        set({ playing: false, time: state.durationS });
      },
      Math.max(0, (endAt - now()) * 1000 + 10),
    );
  };
  /** Writes the whole state as a segment at `at`, from source time `from`, and re-anchors the clock there. */
  const segment = (at: number, from: number) => {
    anchor = { ctxTime: at, sourceS: from, rate: state.rate };
    void write({
      active: true,
      input: from,
      output: at,
      rate: state.rate,
      semitones: pitch(),
      ...loopFields(),
    });
    planEnd();
  };
  /**
   * When a live change sounds: a start still pending is rewritten at its own time (the stretch would drop it
   * anyway); a running segment changes after the lead (one message round trip to the worklet).
   */
  const changeAt = () => (anchor && anchor.ctxTime > now() ? anchor.ctxTime : now() + lead);

  await stretch.setUpdateInterval(STRETCH_TICK_SEC, () => {
    if (state.playing && !disposed) emit();
  });

  const assertLoaded = () => {
    if (disposed) throw new Error("@oak/audio: the stretch player was disposed");
    if (!state.loaded) throw new Error("@oak/audio: load() a buffer first");
  };
  const inLoop = (s: number) => !state.loop || (s >= state.loop.startS && s < state.loop.endS);

  const player: StretchPlayer = {
    clock: {
      get anchor() {
        return anchor ? { ...anchor } : null;
      },
      ctxTimeOf(sourceS) {
        if (!anchor) return null;
        return ctxTimeAt(anchor, sourceS, state.loop, now());
      },
      sourceTimeAt: (t) => position(t),
    } satisfies StretchClock,
    get state() {
      return view();
    },
    async load(buffer) {
      if (disposed) throw new Error("@oak/audio: the stretch player was disposed");
      if (anchor) player.pause();
      await stretch.dropBuffers();
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
        buffer.getChannelData(c).slice(),
      );
      await addChannels(stretch, channels);
      await write({ active: false, input: 0, output: now(), rate: state.rate, semitones: pitch() });
      set({ loaded: true, playing: false, time: 0, durationS: buffer.duration, loop: null });
    },
    async play(o = {}) {
      assertLoaded();
      let from = o.fromS ?? position(now());
      if (!state.loop && from >= state.durationS - 1e-3) from = 0;
      from = clamp(from, 0, state.durationS);
      if (!inLoop(from)) from = (state.loop as LoopSpan).startS;
      const at = Math.max(o.at ?? now() + lead, now() + 0.005);
      segment(at, from);
      if (!release && deps.claim)
        release = deps.claim({ id: "oak-stretch", kind: "external", stop: () => player.pause() });
      set({ playing: true, time: from });
    },
    pause() {
      if (!anchor) return;
      const t = position(now());
      clearEnd();
      void write({ active: false, output: now() });
      anchor = null;
      release?.();
      release = null;
      set({ playing: false, time: t });
    },
    seek(sourceS) {
      assertLoaded();
      let t = clamp(sourceS, 0, state.durationS);
      if (!inLoop(t)) t = (state.loop as LoopSpan).startS;
      if (anchor) segment(changeAt(), t);
      set({ time: t });
    },
    setRate(rate) {
      const r = clampStretchRate(rate);
      if (r === state.rate) return;
      if (anchor) {
        const at = changeAt();
        const from = position(at);
        state = { ...state, rate: r };
        segment(at, from);
        emit();
      } else set({ rate: r });
    },
    setSemitones(semitones) {
      state = { ...state, semitones: clampSemitones(semitones) };
      if (anchor) {
        const at = changeAt();
        segment(at, position(at));
      }
      emit();
    },
    setCents(cents) {
      state = { ...state, cents: clampCents(cents) };
      if (anchor) {
        const at = changeAt();
        segment(at, position(at));
      }
      emit();
    },
    setLoop(loop) {
      let next: LoopSpan | null = null;
      if (loop) {
        const a = clamp(Math.min(loop.startS, loop.endS), 0, state.durationS);
        const b = clamp(Math.max(loop.startS, loop.endS), 0, state.durationS);
        if (b - a >= STRETCH_MIN_LOOP_SEC) next = { startS: a, endS: b };
      }
      if (anchor) {
        const at = changeAt();
        let from = position(at);
        state = { ...state, loop: next };
        if (!inLoop(from)) from = (next as LoopSpan).startS;
        segment(at, from);
        emit();
      } else {
        const time =
          next && !(state.time >= next.startS && state.time < next.endS) ? next.startS : state.time;
        set({ loop: next, time });
      }
    },
    setGain(g) {
      const v = clamp(Number.isFinite(g) ? g : 0, 0, 1);
      gain.gain.setTargetAtTime(v, now(), 0.005);
      set({ gain: v });
    },
    subscribe(cb) {
      subs.add(cb);
      cb(view());
      return () => subs.delete(cb);
    },
    dispose() {
      if (disposed) return;
      clearEnd();
      if (anchor) void write({ active: false, output: now() });
      anchor = null;
      release?.();
      release = null;
      disposed = true;
      void stretch.dropBuffers();
      stretch.disconnect();
      gain.disconnect();
      subs.clear();
      state = { ...state, playing: false, loaded: false };
    },
  };
  return player;
}

/**
 * Hands the channel copies to the stretch worklet by transfer, not by structured clone: a 40-minute stereo file is
 * about 0.9 GB per copy, and a clone held a second one on this thread until it was collected. signalsmith-stretch
 * takes a transfer list as the extra last argument of any remote method.
 */
function addChannels(stretch: StretchNode, channels: Float32Array[]): Promise<number> {
  const add = stretch.addBuffers as (b: Float32Array[], transfer: Transferable[]) => Promise<number>;
  return add.call(
    stretch,
    channels,
    channels.map((c) => c.buffer as ArrayBuffer),
  );
}
