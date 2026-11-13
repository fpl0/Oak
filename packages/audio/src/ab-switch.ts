// The A/B transport (wave4.md §3.4; ux §9 Transcription Studio mixer): the learner's audio (a StretchPlayer) and
// the learner's Strudel pattern on ONE musical clock — the project's tempo and first downbeat (`SourceGrid`) — so
// switching sides lands on the same beat and the overlay stays together. The Wave 4 gate: drift under 20 ms over
// 8 bars at 0.75× (`abDriftMs`, measured on real audio in packages/audio/e2e).
//
// How: both sides always play while the transport plays; A/B and overlay are gains only, so a switch never
// restarts anything. Starting, the pattern goes first (its scheduler may not start exactly when asked), then the
// source is anchored to the time the pattern says its bar sounds (`timeOfCycle`): the stretch can start on any
// sample, the pattern scheduler cannot. The pattern runs at `rate × (1 / barSec) / cps`, so one of its cycles is
// one bar of the source whatever tempo the code was left at. A loop is whole bars, and each pass restarts both
// sides at the same AudioContext time, so nothing can creep between passes.
import type { AbSide, AbState, AbSwitch, PatternSideLike, SourceGrid, StretchPlayer } from "./stretch.ts";
import { STRETCH_RATE_RANGE } from "./stretch.ts";

/** Seconds between `play` and the first bar sounding. */
export const AB_LEAD_SEC = 0.2;
/**
 * Source seconds the stretch starts before the bar on a fresh start. A stretch that starts from silence fades
 * its first window in (measured: the first bar's attack 17 ms late at 0.75×); started a little earlier, it is
 * already running when the bar comes. Loop passes need none: the stretch is running when they jump.
 */
export const AB_PRE_ROLL_SEC = 0.1;
/** A loop pass is scheduled this long before it starts. */
export const AB_PASS_AHEAD_SEC = 0.35;
/** The bar position is pushed to subscribers this often while playing, seconds. */
export const AB_TICK_SEC = 0.1;
/** If the pattern reports its bar this far from the asked time, the asked time is used (a broken clock). */
const MAX_PATTERN_SKEW_SEC = 1;

export interface AbSwitchDeps {
  ctx: Pick<AudioContext, "currentTime">;
  source: StretchPlayer;
  mine: PatternSideLike;
  grid: SourceGrid;
  /** Default `AB_LEAD_SEC`. */
  leadSec?: number;
  /** Timers (tests). */
  setTimeout?: (cb: () => void, ms: number) => unknown;
  clearTimeout?: (id: unknown) => void;
}

/** The pattern's rate for a source rate: one cycle of the pattern is one bar of the source. */
export function mineRateFor(rate: number, grid: SourceGrid, cps: number): number {
  if (!(cps > 0) || !(grid.barSec > 0)) return rate;
  const scale = 1 / (grid.barSec * cps);
  // The usual case: the code is at the project's tempo, so the pattern runs at exactly the source's rate.
  return Math.abs(scale - 1) < 1e-9 ? rate : rate * scale;
}

/** Gains of the two sides: `source` mutes the pattern, `mine` mutes the source, `both` plays both. */
export function sideGains(side: AbSide): { source: number; mine: number } {
  return { source: side === "mine" ? 0 : 1, mine: side === "source" ? 0 : 1 };
}

export function createAbSwitchWith(deps: AbSwitchDeps): AbSwitch {
  const { ctx, source, mine, grid } = deps;
  const lead = deps.leadSec ?? AB_LEAD_SEC;
  const setT = deps.setTimeout ?? ((cb: () => void, ms: number) => setTimeout(cb, ms));
  const clearT = deps.clearTimeout ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let state: AbState = { side: "source", playing: false, bar: 0, rate: 1, loop: null };
  const subs = new Set<(s: AbState) => void>();
  let timers: unknown[] = [];
  let ticker: unknown = null;
  /** The bar that sounds at `t0` while playing (the pass's first bar), and when. */
  let origin: { t0: number; bar: number } | null = null;
  let disposed = false;
  let generation = 0;

  const barAt = (t: number): number => {
    if (!origin) return state.bar;
    const sourceS = source.clock.sourceTimeAt(t);
    if (source.state.playing && source.clock.anchor) return (sourceS - grid.downbeatS) / grid.barSec;
    return origin.bar + ((t - origin.t0) * state.rate) / grid.barSec;
  };
  const view = (): AbState => ({ ...state, bar: barAt(ctx.currentTime) });
  const emit = () => {
    const v = view();
    for (const cb of [...subs]) cb(v);
  };
  const set = (patch: Partial<AbState>) => {
    state = { ...state, ...patch };
    emit();
  };
  const applyGains = () => {
    const g = sideGains(state.side);
    source.setGain(g.source);
    mine.setGain(g.mine);
  };
  const clearTimers = () => {
    for (const id of timers) clearT(id);
    timers = [];
    if (ticker !== null) clearT(ticker);
    ticker = null;
  };
  const tick = () => {
    ticker = setT(() => {
      if (!state.playing || disposed) return;
      emit();
      tick();
    }, AB_TICK_SEC * 1000);
  };
  const barSecAt = () => grid.barSec / state.rate;

  /**
   * Both sides from `fromBar` at `at`: the pattern first, the source on the pattern's own bar time. A fresh
   * start (`preRoll`) starts the stretch up to `AB_PRE_ROLL_SEC` of source earlier, on the same line.
   */
  const startBoth = async (at: number, fromBar: number, gen: number, preRoll = false): Promise<number> => {
    await mine.start({ at, fromBar, rate: mineRateFor(state.rate, grid, mine.cps()) });
    if (gen !== generation) return at;
    let t0 = mine.timeOfCycle(fromBar);
    if (!Number.isFinite(t0) || Math.abs(t0 - at) > MAX_PATTERN_SKEW_SEC) t0 = at;
    t0 = Math.max(t0, ctx.currentTime + 0.005);
    const barS = grid.downbeatS + fromBar * grid.barSec;
    const room = Math.max(0, (t0 - ctx.currentTime - 0.01) * state.rate);
    const pre = preRoll ? Math.min(AB_PRE_ROLL_SEC, barS, room) : 0;
    await source.play({ at: t0 - pre / state.rate, fromS: barS - pre });
    return t0;
  };

  /** Schedules the next loop pass (both sides restart at the loop's first bar, at the same time). */
  const planPass = (gen: number) => {
    const loop = state.loop;
    if (!loop || !origin || gen !== generation) return;
    const passEnd = origin.t0 + (loop.fromBar + loop.bars - origin.bar) * barSecAt();
    const wait = Math.max(0, (passEnd - AB_PASS_AHEAD_SEC - ctx.currentTime) * 1000);
    timers.push(
      setT(() => {
        if (gen !== generation || !state.playing || disposed) return;
        origin = { t0: passEnd, bar: loop.fromBar };
        void startBoth(passEnd, loop.fromBar, gen).then((t0) => {
          if (gen !== generation) return;
          origin = { t0, bar: loop.fromBar };
          planPass(gen);
        });
      }, wait),
    );
  };

  const begin = async (fromBar: number) => {
    const gen = ++generation;
    clearTimers();
    applyGains();
    let bar = fromBar;
    const loop = state.loop;
    if (loop && (bar < loop.fromBar || bar >= loop.fromBar + loop.bars)) bar = loop.fromBar;
    const at = ctx.currentTime + lead;
    origin = { t0: at, bar };
    state = { ...state, playing: true, bar };
    const t0 = await startBoth(at, bar, gen, true);
    if (gen !== generation) return;
    origin = { t0, bar };
    emit();
    tick();
    planPass(gen);
  };

  const halt = () => {
    generation++;
    clearTimers();
    const bar = barAt(ctx.currentTime);
    source.pause();
    mine.stop();
    origin = null;
    return bar;
  };

  const api: AbSwitch = {
    get state() {
      return view();
    },
    setSide(side) {
      state = { ...state, side };
      applyGains();
      emit();
    },
    toggle() {
      api.setSide(state.side === "source" ? "mine" : "source");
    },
    async play(o = {}) {
      if (disposed) throw new Error("@oak/audio: the A/B switch was disposed");
      if (state.playing) halt();
      await begin(o.fromBar ?? Math.max(0, state.bar));
    },
    pause() {
      if (!state.playing) return;
      const bar = halt();
      set({ playing: false, bar: Math.max(0, bar) });
    },
    setRate(rate) {
      const r = Math.min(STRETCH_RATE_RANGE[1], Math.max(STRETCH_RATE_RANGE[0], rate));
      if (!Number.isFinite(r) || r === state.rate) return;
      source.setRate(r);
      if (!state.playing) return set({ rate: r });
      const bar = halt();
      state = { ...state, rate: r };
      void begin(Math.max(0, bar));
    },
    setLoop(loop) {
      const next =
        loop && loop.bars > 0
          ? { fromBar: Math.max(0, Math.floor(loop.fromBar)), bars: Math.round(loop.bars) }
          : null;
      if (!state.playing) return set({ loop: next });
      const bar = barAt(ctx.currentTime);
      state = { ...state, loop: next };
      if (next && (bar < next.fromBar || bar >= next.fromBar + next.bars)) {
        halt();
        void begin(next.fromBar);
        return;
      }
      // Inside the new loop (or no loop now): keep playing; re-plan the next pass.
      const gen = ++generation;
      clearTimers();
      if (origin) origin = { t0: ctx.currentTime, bar };
      tick();
      planPass(gen);
      emit();
    },
    subscribe(cb) {
      subs.add(cb);
      cb(view());
      return () => subs.delete(cb);
    },
    dispose() {
      if (disposed) return;
      if (state.playing) halt();
      disposed = true;
      subs.clear();
    },
  };
  return api;
}
