// One "source" interface for Transcribe (contracts §6.12): the learner's own audio (TranscriptionPlayer,
// signalsmith-stretch) or a ladder stimulus with no audio file, whose hidden reference code plays through
// a hidden adapter instance (`OakStrudel.createPatternPlayer()` of @oak/strudel). This package may not
// import @oak/strudel (interfaces §2), so the pattern player is typed structurally here: any
// `PatternPlayer` of @oak/strudel satisfies `PatternPlayerLike`. The app passes it in.
//
// Pattern sources: rate is a cps scale (25–100 %), transposition is `.transpose()` on the pitched tracks,
// the A–B loop is `.ribbon(fromBar, bars)` (whole bars), a bar timeline replaces the waveform, and
// fine-tune is disabled. The hidden code never leaves the player.
import type { TranscriptionPlayer } from "./types.ts";

/** The part of @oak/strudel's `PatternPlayer` a pattern source drives. */
export interface PatternPlayerLike {
  load(code: string, opts: { bars: number; cps: number }): Promise<{ ok: boolean }>;
  play(): Promise<void>;
  stop(): void;
  setRate(rate: number): void;
  setTranspose(semitones: number): void;
  setLoop(loop: { fromBar: number; bars: number } | null): void;
  /** 0-based bar position, fractional. */
  position(): number;
  readonly playing: boolean;
  dispose(): void;
}

export interface TranscribeSourceState {
  kind: "audio" | "pattern";
  loaded: boolean;
  playing: boolean;
  /** Position in the material at rate 1, seconds (pattern: bars / cps). */
  time: number;
  durationS: number;
  rate: number;
  semitones: number;
  /** `null` for pattern sources: fine-tune is disabled there. */
  fineTuneCents: number | null;
  /** Seconds; a pattern source's loop is always whole bars. */
  loop: { startS: number; endS: number } | null;
  /** Pattern sources: the bar timeline. */
  bars: number | null;
  barSec: number | null;
}

/** What the Transcribe view drives, whichever the stimulus is. */
export interface TranscribeSource {
  readonly kind: "audio" | "pattern";
  readonly state: TranscribeSourceState;
  readonly canSeek: boolean;
  readonly canFineTune: boolean;
  play(opts?: { at?: number }): Promise<void>;
  pause(): void;
  /** Audio only; a no-op for pattern sources (they restart at the loop or bar 1). */
  seek(timeS: number): void;
  setRate(rate: number): void;
  setSemitones(semitones: number): void;
  /** Audio only; a no-op for pattern sources. */
  setFineTuneCents(cents: number): void;
  setLoop(loop: { startS: number; endS: number } | null): void;
  subscribe(cb: (state: TranscribeSourceState) => void): () => void;
  dispose(): void;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Whole bars that cover a loop given in seconds: at least one bar, inside the material. */
export function loopToBars(
  loop: { startS: number; endS: number },
  barSec: number,
  bars: number,
): { fromBar: number; bars: number } {
  const a = Math.min(loop.startS, loop.endS);
  const b = Math.max(loop.startS, loop.endS);
  const fromBar = clamp(Math.floor(a / barSec + 1e-6), 0, Math.max(0, bars - 1));
  const toBar = clamp(Math.ceil(b / barSec - 1e-6), fromBar + 1, bars);
  return { fromBar, bars: toBar - fromBar };
}

/** The own-audio source: a thin view of a TranscriptionPlayer. */
export function audioSource(player: TranscriptionPlayer): TranscribeSource {
  const view = (): TranscribeSourceState => ({
    kind: "audio",
    loaded: player.state.loaded,
    playing: player.state.playing,
    time: player.state.time,
    durationS: player.state.durationS,
    rate: player.state.rate,
    semitones: player.state.semitones,
    fineTuneCents: player.state.fineTuneCents,
    loop: player.state.loop,
    bars: null,
    barSec: null,
  });
  return {
    kind: "audio",
    canSeek: true,
    canFineTune: true,
    get state() {
      return view();
    },
    play: (opts) => player.play(opts?.at === undefined ? {} : { at: opts.at }),
    pause: () => player.pause(),
    seek: (t) => player.seek(t),
    setRate: (r) => player.setRate(r),
    setSemitones: (s) => player.setSemitones(s),
    setFineTuneCents: (c) => player.setFineTuneCents(c),
    setLoop: (l) => player.setLoop(l),
    subscribe: (cb) => player.subscribe(() => cb(view())),
    dispose: () => player.dispose(),
  };
}

export interface PatternSourceOptions {
  /** Hidden reference code (never shown, never in the DOM). */
  code: string;
  bars: number;
  /** The reference tempo in cycles per second. */
  cps: number;
  /** Position polling while playing, ms. Default 50. */
  pollMs?: number;
}

/**
 * A ladder stimulus: hidden code played by a pattern player. Loads the code, then maps the shared
 * controls onto the player: rate → cps scale, semitones → `.transpose()`, loop → `.ribbon()` bars.
 */
export async function createPatternSource(
  player: PatternPlayerLike,
  opts: PatternSourceOptions,
): Promise<TranscribeSource> {
  if (!(opts.bars > 0) || !(opts.cps > 0))
    throw new RangeError("@oak/audio: a pattern source needs bars > 0 and cps > 0");
  const outcome = await player.load(opts.code, { bars: opts.bars, cps: opts.cps });
  const barSec = 1 / opts.cps;
  let state: TranscribeSourceState = {
    kind: "pattern",
    loaded: outcome.ok,
    playing: false,
    time: 0,
    durationS: opts.bars * barSec,
    rate: 1,
    semitones: 0,
    fineTuneCents: null,
    loop: null,
    bars: opts.bars,
    barSec,
  };
  const subs = new Set<(s: TranscribeSourceState) => void>();
  const set = (patch: Partial<TranscribeSourceState>) => {
    state = { ...state, ...patch };
    for (const cb of [...subs]) cb(state);
  };
  let timer: ReturnType<typeof setInterval> | null = null;
  const stopPolling = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  const poll = () => {
    if (!player.playing) {
      stopPolling();
      if (state.playing) set({ playing: false });
      return;
    }
    set({ time: clamp(player.position() * barSec, 0, state.durationS) });
  };
  let disposed = false;
  return {
    kind: "pattern",
    canSeek: false,
    canFineTune: false,
    get state() {
      return state;
    },
    async play() {
      if (disposed) throw new Error("@oak/audio: the pattern source was disposed");
      if (!state.loaded) throw new Error("@oak/audio: the reference code did not load");
      await player.play();
      set({ playing: true });
      stopPolling();
      timer = setInterval(poll, opts.pollMs ?? 50);
    },
    pause() {
      player.stop();
      stopPolling();
      set({ playing: false });
    },
    seek() {},
    setRate(rate) {
      const r = clamp(rate, 0.25, 1);
      player.setRate(r);
      set({ rate: r });
    },
    setSemitones(semitones) {
      const s = Math.round(clamp(semitones, -12, 12));
      player.setTranspose(s);
      set({ semitones: s });
    },
    setFineTuneCents() {},
    setLoop(loop) {
      if (!loop) {
        player.setLoop(null);
        set({ loop: null });
        return;
      }
      const b = loopToBars(loop, barSec, opts.bars);
      player.setLoop(b);
      set({ loop: { startS: b.fromBar * barSec, endS: (b.fromBar + b.bars) * barSec } });
    },
    subscribe(cb) {
      subs.add(cb);
      cb(state);
      return () => subs.delete(cb);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopPolling();
      player.stop();
      player.dispose();
      subs.clear();
    },
  };
}
