// The hidden pattern player (Transcribe's "pattern source": ladder stimuli, X1, X2, CF-T). A repl with no
// editor and nothing in the DOM. Rate is a cps scale, transposition a live `note` shift on pitched haps,
// the A–B loop `.ribbon(fromBar, bars)`; all three change the playing pattern at once, no re-evaluation.
import type { LintContext, LintDiagnostic } from "@oak/content-kit";
import * as core from "@strudel/core";
import { transpiler } from "@strudel/transpiler";
import * as webaudio from "@strudel/webaudio";
import * as WT from "worker-timers";
import { type EvalSession, finalizePattern, installTrackWrapper, newSession } from "./evaluation.ts";
import { ADAPTER_FEEDBACK, diagnostic, errorToDiagnostic, hasError, runLint } from "./lint-bridge.ts";
import { copyMutes, NO_MUTES } from "./mutes.ts";
import { captureMessageListeners, type Runtime, removeCaptured } from "./runtime.ts";
import type { CyclistLike } from "./transport.ts";
import type { EvalOutcome, MuteMap, PatternPlayer } from "./types.ts";

interface ReplLike {
  scheduler: CyclistLike & { stop(): void; start(): Promise<void> };
  state: { pattern?: Strudel.Pattern; miniLocations?: [number, number][] };
  evaluate(code: string, autostart?: boolean): Promise<unknown>;
  setPattern(pattern: Strudel.Pattern, autostart?: boolean): Promise<unknown>;
  start(): Promise<void>;
  stop(): void;
}

/** Bar position of the player for a scheduler cycle, honouring the A–B loop. */
export function barPosition(cycle: number, loop: { fromBar: number; bars: number } | null): number {
  if (!loop || loop.bars <= 0) return cycle;
  const within = ((cycle % loop.bars) + loop.bars) % loop.bars;
  return loop.fromBar + within;
}

export const clampRate = (rate: number): number =>
  Math.max(0.25, Math.min(1, Number.isFinite(rate) ? rate : 1));
export const clampTranspose = (st: number): number =>
  Math.max(-12, Math.min(12, Math.round(Number.isFinite(st) ? st : 0)));

let playerCount = 0;

export function createPatternPlayer(rt: Runtime): PatternPlayer {
  const id = `player:${++playerCount}`;
  let disposed = false;
  let playing = false;
  let mutes: MuteMap = NO_MUTES;
  let rate = 1;
  let transpose = 0;
  let loop: { fromBar: number; bars: number } | null = null;
  let baseCps = 0.5;
  let raw: Strudel.Pattern | undefined;
  let effective: Strudel.Pattern | undefined;
  let session: EvalSession = newSession();
  let release: (() => void) | null = null;
  const intervals = new Set<number>();

  const constructed = captureMessageListeners(
    () =>
      core.repl({
        defaultOutput: (hap: Strudel.Hap, deadline: number, duration: number, cps: number, t: number) => {
          rt.noteTrigger(hap.value);
          return webaudio.webaudioOutput(hap, deadline, duration, cps, t);
        },
        getTime: () => rt.ctx.currentTime,
        transpiler,
        setInterval: (cb: () => void, ms: number) => {
          const t = WT.setInterval(cb, ms);
          intervals.add(t);
          return t;
        },
        clearInterval: (t: number) => {
          if (intervals.delete(t)) WT.clearInterval(t);
        },
        id: `oak_${id.replace(":", "-")}_`,
        beforeEval: () => installTrackWrapper(session, () => mutes),
        editPattern: (pat: Strudel.Pattern) => {
          raw = pat;
          effective = build();
          return live;
        },
        beforeStart: async () => {
          if (!(await rt.unlock())) throw new Error("oak: audio is locked (needs a user gesture)");
          if (disposed) throw new Error("oak: pattern player was disposed");
        },
        onEvalError: (err: unknown) => {
          session.error = err;
        },
        onToggle: (started: boolean) => {
          if (disposed) return;
          playing = started;
          if (started) {
            rt.transport.setActive(source);
            release = rt.coordinator.claim({ id, kind: "pattern-player", stop: () => repl.stop() });
          } else {
            const r = release;
            release = null;
            r?.();
            rt.transport.refresh();
          }
        },
      }) as ReplLike,
  );
  const repl = constructed.value;

  /** The playing pattern reads `effective` at query time, so loop and transpose apply live. */
  const live = new core.Pattern((state: Strudel.State) =>
    effective ? effective.query(state) : [],
  ) as Strudel.Pattern;
  function build(): Strudel.Pattern | undefined {
    if (!raw) return undefined;
    let out = finalizePattern(raw, { session, mutes: () => mutes, transpose: () => transpose });
    if (loop)
      out = (out.ribbon as (offset: number, cycles: number) => Strudel.Pattern)(loop.fromBar, loop.bars);
    return out;
  }

  const source = {
    id,
    scheduler: repl.scheduler,
    pattern: () => effective,
    meter: () => "4/4" as const,
    trackOrder: () => session.tracks,
  };

  const applyRate = (): void => {
    repl.scheduler.setCps(baseCps * rate);
    rt.transport.refresh();
  };

  return {
    get playing() {
      return playing && !disposed;
    },
    load(code, opts) {
      return rt.mutex.run(async (): Promise<EvalOutcome> => {
        const base: EvalOutcome = {
          ok: false,
          code,
          cps: null,
          diagnostics: [],
          lint: null,
          miniLocations: [],
          tracks: [],
        };
        if (disposed) {
          return {
            ...base,
            diagnostics: [diagnostic(ADAPTER_FEEDBACK.disposed, "error", "The player was closed.", code)],
          };
        }
        const ctx: LintContext = opts.lint ?? {
          profile: "content",
          unlocked: new Set(),
          allowPreview: true,
          meter: "4/4",
          key: null,
        };
        const linted = runLint(rt.lint, code, ctx);
        if (!linted.ok) return { ...base, diagnostics: [linted.diagnostic] };
        const lint = linted.result;
        if (!lint.ok || hasError(lint.diagnostics))
          return { ...base, diagnostics: [...lint.diagnostics], lint };
        await rt.prebake();
        session = newSession();
        await repl.evaluate(code, false);
        if (session.error) {
          const d: LintDiagnostic = errorToDiagnostic(session.error, code);
          return { ...base, diagnostics: [...lint.diagnostics, d], lint };
        }
        // Reference code is authored at its own tempo; `opts.cps` is the tempo at rate 1.
        baseCps = opts.cps > 0 ? opts.cps : repl.scheduler.cps;
        applyRate();
        if (raw) await rt.preloadPattern(raw, 0, Math.max(1, Math.min(opts.bars, 8)));
        if (!playing) rt.transport.setActive(source);
        return {
          ...base,
          ok: true,
          cps: repl.scheduler.cps,
          diagnostics: [...lint.diagnostics],
          lint,
          miniLocations: (repl.state.miniLocations ?? []).map(([a, b]) => [a, b] as [number, number]),
          tracks: [...session.tracks],
        };
      });
    },
    async play() {
      if (disposed || !raw) return;
      if (!repl.scheduler.started) {
        applyRate();
        await repl.start();
      }
    },
    stop() {
      if (!disposed) repl.stop();
    },
    setRate(next) {
      rate = clampRate(next);
      applyRate();
    },
    setTranspose(semitones) {
      transpose = clampTranspose(semitones);
    },
    setLoop(next) {
      loop = next && next.bars > 0 ? { fromBar: Math.max(0, next.fromBar), bars: next.bars } : null;
      effective = build();
    },
    setMutes(next) {
      mutes = copyMutes(next);
    },
    position: () => barPosition(repl.scheduler.started ? repl.scheduler.now() : 0, loop),
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        repl.stop();
      } catch {
        // ignore
      }
      const r = release;
      release = null;
      r?.();
      rt.transport.clearActive(id);
      removeCaptured(constructed.captured);
      for (const t of [...intervals]) {
        intervals.delete(t);
        WT.clearInterval(t);
      }
    },
  };
}
