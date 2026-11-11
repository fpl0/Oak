// Spike S2: the minimal "@oak/strudel" adapter. This is the ONLY file that touches StrudelMirror.
import { autocompletion, type CompletionContext, completionStatus, currentCompletions, startCompletion } from '@codemirror/autocomplete';
import { diagnosticCount, forceLinting, linter, setDiagnostics } from '@codemirror/lint';
import { StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { codemirrorSettings, defaultSettings, setMiniLocations, StrudelMirror } from '@strudel/codemirror';
import * as core from '@strudel/core';
import * as draw from '@strudel/draw';
import * as mini from '@strudel/mini';
import * as tonal from '@strudel/tonal';
import { transpiler } from '@strudel/transpiler';
import * as webaudio from '@strudel/webaudio';
import * as WT from 'worker-timers';
import { instr } from './instrument';

const params = new URLSearchParams(location.search);
/** ?raw=1  -> no side-effect mitigations (used to RECORD what StrudelMirror does on its own) */
export const RAW = params.get('raw') === '1';
/** ?dispose=full|research|none  (negative controls for the leak test) */
export const DISPOSE_MODE = (params.get('dispose') ?? 'full') as 'full' | 'research' | 'none';
/** ?timers=native -> window.setInterval instead of worker-timers */
const NATIVE_TIMERS = params.get('timers') === 'native';

export const stats = {
  created: 0,
  disposed: 0,
  prebakeRuns: 0,
  evals: 0,
  liveViews: new Set<EditorView>(),
  liveIntervals: new Set<number>(),
  audioLog: [] as string[],
  capturedWindowListeners: 0,
  /** spike only: which mirrors does the heap still hold after dispose + GC? */
  weakMirrors: [] as Array<{ seq: number; id: string; ref: WeakRef<object>; evaluated: number; disposed: boolean }>,
};

// ---------------------------------------------------------------------------------------------
// 1. ONE app-owned AudioContext, handed to superdough before anything else can create its own.
// ---------------------------------------------------------------------------------------------
export const audioCtx = new AudioContext({ latencyHint: 'interactive' });
webaudio.setAudioContext(audioCtx);
stats.audioLog.push(`created: state=${audioCtx.state} sampleRate=${audioCtx.sampleRate}`);

let analyser: AnalyserNode | undefined;
let analyserBuf: Float32Array<ArrayBuffer> | undefined;
function attachAnalyser() {
  if (analyser) return;
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyserBuf = new Float32Array(analyser.fftSize);
  // master tap: everything superdough plays goes channelMerger -> destinationGain -> destination
  webaudio.getSuperdoughAudioController().output.destinationGain.connect(analyser);
}
export function rms(): number {
  if (!analyser || !analyserBuf) return 0;
  analyser.getFloatTimeDomainData(analyserBuf);
  let sum = 0;
  for (const v of analyserBuf) sum += v * v;
  return Math.sqrt(sum / analyserBuf.length);
}

// ---------------------------------------------------------------------------------------------
// 2. Audio unlock: ctx.resume() + initAudio(), once, from a user gesture.
// ---------------------------------------------------------------------------------------------
let audioReady: Promise<void> | undefined;
export function unlock(): Promise<void> {
  if (audioReady) return audioReady;
  const p = (async () => {
    const t0 = performance.now();
    stats.audioLog.push(`unlock: state before resume = ${audioCtx.state}`);
    if (audioCtx.state !== 'running') {
      // Without a user activation Chrome leaves resume() pending forever -> never hang the eval queue on it.
      await Promise.race([
        audioCtx.resume(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('oak: audio is locked (needs a user gesture)')), 1500),
        ),
      ]);
    }
    stats.audioLog.push(`unlock: state after resume = ${audioCtx.state}`);
    await webaudio.initAudio({ maxPolyphony: 128 }); // loads the (data: URL) AudioWorklets
    attachAnalyser();
    stats.audioLog.push(`unlock: initAudio done in ${Math.round(performance.now() - t0)}ms, state = ${audioCtx.state}`);
    if (params.get('probe') === 'nogesture') console.log(`OAK_UNLOCKED ${audioCtx.state}`);
  })();
  audioReady = p;
  p.catch((e) => {
    stats.audioLog.push(`unlock failed: ${e.message}`);
    if (audioReady === p) audioReady = undefined; // allow a retry on the next gesture
  });
  return p;
}

// ---------------------------------------------------------------------------------------------
// 3. ONE shared module-level prebake promise (evalScope + built-in synth sounds, no network).
// ---------------------------------------------------------------------------------------------
let prebakePromise: Promise<void> | undefined;
export function prebakeOnce(): Promise<void> {
  prebakePromise ??= (async () => {
    stats.prebakeRuns++;
    await core.evalScope(core, mini, tonal, draw, webaudio);
    webaudio.registerSynthSounds();
  })();
  return prebakePromise;
}

// ---------------------------------------------------------------------------------------------
// 4. Global settings + side-effect mitigations, applied BEFORE the first mirror is constructed.
// ---------------------------------------------------------------------------------------------
export const OAK_CM_SETTINGS = {
  ...defaultSettings,
  theme: 'strudelTheme',
  isAutoCompletionEnabled: false, // Oak appends its own autocompletion({override})
  isPatternHighlightingEnabled: true,
  isFlashEnabled: true,
  fontSize: 15,
  keybindings: 'codemirror',
};
let oakWantsDark = false;
let htmlObserver: MutationObserver | undefined;
let mitigated = false;
function applyMitigationsOnce() {
  if (mitigated || RAW) return;
  mitigated = true;
  // (a) overwrite whatever is in localStorage['codemirror-settings'] with Oak's settings
  codemirrorSettings.set(OAK_CM_SETTINGS);
  // (b) keep <html class> authoritative: StrudelMirror's activateTheme() toggles `dark` on <html>
  htmlObserver = new MutationObserver(() => {
    const cl = document.documentElement.classList;
    if (cl.contains('dark') !== oakWantsDark) cl.toggle('dark', oakWantsDark);
  });
  htmlObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  // (c) #test-canvas is pre-created (hidden) in index.html, so getDrawContext() never prepends a fullscreen one
}
if (RAW) document.getElementById('oak-visuals')?.remove();

// ---------------------------------------------------------------------------------------------
// 5. Evaluation mutex: repl.evaluate() mutates Pattern.prototype.p / scheduler globals.
// ---------------------------------------------------------------------------------------------
let evalChain: Promise<unknown> = Promise.resolve();
function withEvalLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = evalChain.then(fn, fn);
  evalChain = run.catch(() => {});
  return run;
}

// ---------------------------------------------------------------------------------------------
// 6. Oak CM6 extensions, appended after construction.
// ---------------------------------------------------------------------------------------------
function oakCompletionSource(context: CompletionContext) {
  const word = context.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return {
    from: word.from,
    options: [
      { label: 'oakNote', type: 'function', detail: 'oak (unlocked)' },
      { label: 'oakScale', type: 'function', detail: 'oak (unlocked)' },
    ],
  };
}
const oakLinter = linter(
  (view) => {
    const text = view.state.doc.toString();
    const i = text.indexOf('FORBIDDEN');
    return i < 0 ? [] : [{ from: i, to: i + 9, severity: 'error' as const, source: 'oak', message: 'oak: not unlocked yet' }];
  },
  { delay: 50 },
);
const oakExtensions = () => [autocompletion({ override: [oakCompletionSource] }), oakLinter];

// ---------------------------------------------------------------------------------------------
// 7. Editor factory + full dispose()
// ---------------------------------------------------------------------------------------------
export interface HapInfo {
  begin: number;
  end: number;
  value: Record<string, unknown>;
  locations: Array<{ start: number; end: number }>;
}
const hapInfo = (hap: any): HapInfo => ({
  begin: hap.whole?.begin.valueOf(),
  end: hap.whole?.end.valueOf(),
  value: { ...hap.value },
  locations: hap.context?.locations ?? [],
});

export interface EditorOptions {
  id: string; // MUST end with '_' (cleanupDraw prefix bug)
  initialCode: string;
  onToggle?(playing: boolean): void;
}
export type EditorHandle = ReturnType<typeof createEditor>;
export const editors = new Map<string, EditorHandle>();

export function createEditor(root: HTMLElement, opts: EditorOptions) {
  if (!opts.id.endsWith('_')) throw new Error("editor id must end with '_'");
  applyMitigationsOnce();
  stats.created++;
  let disposed = false;
  let muteMode: 'live' | 'eval' = 'live';
  const muted = new Set<string>();
  const labels = new Set<string>();
  const log = {
    toggles: [] as boolean[],
    evals: [] as Array<{ ok: boolean; error?: string; cps?: number; miniLocations?: number }>,
    triggers: [] as Array<{ s: unknown; note: unknown; t: number }>,
    paint: null as null | Record<string, unknown>,
    paintCalls: 0,
    injection: [] as string[],
    errors: [] as string[],
  };
  const intervals = new Set<number>();
  const offscreen = document.createElement('canvas').getContext('2d');

  // kabelsalat's SalatRepl (constructed inside repl()) adds an anonymous window 'message' listener that
  // nothing ever removes. Construction is synchronous, so capture what is added to `window` meanwhile.
  const captured: Array<[string, EventListenerOrEventListenerObject, unknown]> = [];
  const realAdd = window.addEventListener;
  if (DISPOSE_MODE === 'full') {
    window.addEventListener = function (this: Window, type: string, listener: any, o?: any) {
      if (type === 'message') captured.push([type, listener, o]); // (CodeMirror's own window listeners are removed by view.destroy())
      return realAdd.call(window, type, listener, o);
    } as typeof window.addEventListener;
  }
  let mirror: any;
  try {
    mirror = new StrudelMirror({
      root,
      id: opts.id,
      initialCode: opts.initialCode,
      defaultOutput: (hap: any, deadline: number, duration: number, cps: number, t: number) => {
        log.triggers.push({ s: hap.value?.s, note: hap.value?.note, t });
        return webaudio.webaudioOutput(hap, deadline, duration, cps, t); // 1.2.6 API (main: onSchedule)
      },
      getTime: () => webaudio.getAudioContext().currentTime,
      transpiler,
      prebake: prebakeOnce, // ONE shared module-level promise
      setInterval: (cb: () => void, ms: number) => {
        const id = NATIVE_TIMERS ? window.setInterval(cb, ms) : WT.setInterval(cb, ms);
        intervals.add(id);
        stats.liveIntervals.add(id);
        return id;
      },
      clearInterval: (id: number) => {
        if (!intervals.delete(id)) return;
        stats.liveIntervals.delete(id);
        NATIVE_TIMERS ? window.clearInterval(id) : WT.clearInterval(id);
      },
      drawTime: [-2, 2],
      drawContext: offscreen,
      bgFill: false,
      solo: true,
      autodraw: false,
      // Registering a painter keeps drawTime at [-2,2] (otherwise the mirror resets it to [0,0] after each eval).
      editPattern: (pat: any) =>
        pat.onPaint((ctx: unknown, time: number, haps: any[], drawTime: number[]) => {
          log.paintCalls++;
          log.paint = {
            argCount: 4,
            ctx: (ctx as object)?.constructor?.name,
            ctxIsOurs: ctx === offscreen,
            time,
            hapCount: haps.length,
            drawTime,
            firstHap: haps[0] ? hapInfo(haps[0]) : null,
          };
        }),
      // HOOK for mute: repl.evaluate() calls injectPatternMethods() (which re-assigns Pattern.prototype.p)
      // and THEN awaits beforeEval - so this is the one place where `.p` is this repl's fresh collector.
      beforeEval: () => {
        const injected = core.Pattern.prototype.p;
        log.injection.push(injected === (window as any).__oakMarkerP ? 'marker survived' : 'fresh .p injected');
        core.Pattern.prototype.p = function (this: any, id: unknown) {
          if (typeof id !== 'string' || id.includes('$') || id.startsWith('_') || id.endsWith('_')) {
            return injected.call(this, id);
          }
          labels.add(id);
          if (muteMode === 'eval') return muted.has(id) ? core.silence : injected.call(this, id);
          // live: the label stays registered; haps are filtered at query time, so the UI can
          // mute/unmute while playing without re-evaluating (takes effect within the scheduler lookahead).
          return injected.call(
            this.filterHaps(() => !muted.has(id)),
            id,
          );
        };
      },
      beforeStart: async () => {
        await unlock();
        if (disposed) throw new Error('oak: editor was disposed before start');
      },
      afterEval: ({ meta }: any) => {
        log.evals.push({ ok: true, cps: mirror.repl.scheduler.cps, miniLocations: meta?.miniLocations?.length });
      },
      onEvalError: (e: Error) => log.evals.push({ ok: false, error: e.message }),
      onToggle: (started: boolean) => {
        log.toggles.push(started);
        if (!disposed) opts.onToggle?.(started);
      },
    });
  } finally {
    window.addEventListener = realAdd;
  }
  stats.capturedWindowListeners += captured.length;
  const view: EditorView = mirror.editor;
  stats.liveViews.add(view);
  oak.protos.Cyclist ??= Object.getPrototypeOf(mirror.repl.scheduler);
  const weak = { seq: stats.created, id: opts.id, ref: new WeakRef<object>(mirror), evaluated: 0, disposed: false };
  stats.weakMirrors.push(weak);

  // Oak extensions
  let extensionError: string | null = null;
  try {
    view.dispatch({ effects: StateEffect.appendConfig.of(oakExtensions()) });
  } catch (e) {
    extensionError = String(e);
  }

  // Route EVERY evaluation (buttons, Ctrl-Enter keymap, 'repl-evaluate' events, toggle()) through the mutex.
  const rawEvaluate: (autostart?: boolean) => Promise<void> = mirror.evaluate.bind(mirror);
  mirror.evaluate = (autostart = true) =>
    withEvalLock(async () => {
      // Do the genuinely async waits OUTSIDE repl.evaluate, so a dispose() can't land in the middle of it.
      await prebakeOnce();
      if (autostart) await unlock();
      if (disposed) return;
      weak.evaluated = ++stats.evals;
      await rawEvaluate(autostart);
    });

  const handle = {
    id: opts.id,
    mirror,
    view,
    log,
    muted,
    labels,
    extensionError,
    get playing(): boolean {
      return !!mirror.repl.scheduler.started;
    },
    get disposed() {
      return disposed;
    },
    getCode: (): string => view.state.doc.toString(),
    setCode: (code: string) => mirror.setCode(code),
    evaluate: (autostart = true): Promise<void> => mirror.evaluate(autostart),
    rawEvaluate, // spike only: bypasses the mutex (to demonstrate why the mutex is needed)
    play: (): Promise<void> => mirror.evaluate(true),
    stop: () => mirror.repl.scheduler.stop(),
    setMuteMode: (m: 'live' | 'eval') => {
      muteMode = m;
    },
    setMuted: (label: string, on: boolean) => {
      on ? muted.add(label) : muted.delete(label);
    },
    /** cycles + cps straight from the scheduler; haps for the next cycle with value + source locations */
    clock: () => {
      const now: number = mirror.repl.scheduler.now();
      const cps: number = mirror.repl.scheduler.cps;
      return { now, cps };
    },
    queryHaps: (from: number, to: number): HapInfo[] =>
      (mirror.repl.state.pattern?.queryArc(from, to) ?? []).filter((h: any) => h.hasOnset()).map(hapInfo),
    // --- CM6 helpers used by the e2e spec
    cm: {
      startCompletion: () => startCompletion(view),
      completionStatus: () => completionStatus(view.state),
      completions: () => currentCompletions(view.state).map((c) => c.label),
      forceLinting: () => forceLinting(view),
      diagnosticCount: () => diagnosticCount(view.state),
      pushDiagnostic: (from: number, to: number, message: string) =>
        view.dispatch(setDiagnostics(view.state, [{ from, to, severity: 'warning', source: 'oak', message }])),
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      weak.disposed = true;
      stats.disposed++;
      editors.delete(opts.id);
      if (DISPOSE_MODE === 'none') {
        root.replaceChildren(); // negative control: what a naive unmount does
        return;
      }
      try {
        mirror.repl.scheduler.stop(); // -> onToggle(false) -> drawer.stop + updateMiniLocations + cleanupDraw
        mirror.drawer.stop();
        mirror.clear(); // removes the 4 document listeners
        if (DISPOSE_MODE === 'full') {
          for (const [type, listener, o] of captured) window.removeEventListener(type, listener, o as any);
          for (const id of [...intervals]) {
            intervals.delete(id);
            stats.liveIntervals.delete(id);
            NATIVE_TIMERS ? window.clearInterval(id) : WT.clearInterval(id);
          }
        }
        view.destroy();
        stats.liveViews.delete(view);
        root.replaceChildren();
        root.removeAttribute('style'); // StrudelMirror sets display/font-size/font-family on the root
        draw.cleanupDraw(true, opts.id);
      } catch (e) {
        log.errors.push(`dispose: ${String(e)}`);
        instr.errors.push(`dispose: ${String(e)}`);
      }
    },
  };
  editors.set(opts.id, handle);
  return handle;
}

// ---------------------------------------------------------------------------------------------
// 8. Spike-only probes exposed to Playwright
// ---------------------------------------------------------------------------------------------
function sideEffects() {
  const html = document.documentElement;
  const themeVars = document.getElementById('strudel-theme-vars');
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>('#test-canvas')];
  const cs = getComputedStyle(html);
  const ls: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    ls[k] = localStorage.getItem(k);
  }
  return {
    htmlClass: html.className,
    themeVarsStyle: themeVars ? themeVars.textContent!.replace(/\s+/g, ' ').trim() : null,
    rootVars: {
      '--background': cs.getPropertyValue('--background'),
      '--foreground': cs.getPropertyValue('--foreground'),
      '--caret': cs.getPropertyValue('--caret'),
    },
    headStyleCount: document.head.querySelectorAll('style').length,
    localStorage: ls,
    testCanvas: canvases.map((c) => ({
      parent: c.parentElement?.id || c.parentElement?.tagName,
      style: c.getAttribute('style'),
      width: c.width,
      height: c.height,
      visible: c.checkVisibility(),
    })),
    globals: instr.globalsDiff(),
    windowFocusIsNative: /\[native code\]/.test(Function.prototype.toString.call(window.focus)),
    editorRootStyle: document.querySelector<HTMLElement>('.oak-editor')?.getAttribute('style') ?? null,
  };
}

function cmIdentity() {
  const first = [...editors.values()][0];
  const strudelEffect = setMiniLocations.of([]); // a StateEffect created inside @strudel/codemirror
  const urls = performance
    .getEntriesByType('resource')
    .map((r) => r.name)
    .filter((n) => /codemirror[_+-]state|@codemirror\/state/.test(n));
  return {
    viewInstanceofOurEditorView: first ? first.view instanceof EditorView : null,
    strudelEffectInstanceofOurStateEffect: strudelEffect instanceof StateEffect,
    strudelCorePatternHasP: typeof core.Pattern.prototype.p,
    codemirrorStateUrls: [...new Set(urls.map((u) => u.replace(/\?.*$/, '')))],
  };
}

export const oak = {
  ready: false,
  RAW,
  DISPOSE_MODE,
  stats,
  editors,
  audioCtx,
  unlock,
  rms,
  sideEffects,
  cmIdentity,
  settings: () => codemirrorSettings.get(),
  sameAudioContext: () => webaudio.getAudioContext() === audioCtx,
  // for CDP Runtime.queryObjects (true heap-level instance counts)
  protos: {
    EditorView: EditorView.prototype,
    StrudelMirror: StrudelMirror.prototype,
    Cyclist: null as object | null,
    Drawer: draw.Drawer.prototype,
  },
  core,
  survivors: () =>
    stats.weakMirrors
      .filter((w) => w.ref.deref())
      .map(({ seq, id, evaluated, disposed }) => ({ seq, id, evaluatedAtEvalNo: evaluated, disposed })),
  blankThemeVars: () => {
    const el = document.getElementById('strudel-theme-vars');
    if (el) el.textContent = '';
  },
};
(window as any).__oak = oak;
prebakeOnce().then(() => {
  oak.ready = true;
});

// ?probe=nogesture[&focus=<editor id>]: the PAGE ITSELF tries to start playback without any user activation and
// prints the outcome. (Playwright's page.evaluate() runs with userGesture:true, so the test cannot do this.)
if (params.get('probe') === 'nogesture') {
  const waitForEditors = setInterval(async () => {
    const e = editors.get('oak_s2_1_');
    if (!oak.ready || editors.size < 3 || !e) return;
    clearInterval(waitForEditors);
    const activationBefore = navigator.userActivation.hasBeenActive;
    const t0 = performance.now();
    const outcome = await e.evaluate(true).then(
      () => 'resolved',
      (err: Error) => `rejected: ${err.message}`,
    );
    const ms = Math.round(performance.now() - t0);
    await e.evaluate(false); // the eval mutex must not be dead-locked by the failed unlock
    const focusId = params.get('focus');
    if (focusId) editors.get(focusId)?.view.focus(); // programmatic focus is not a user activation
    const b = document.querySelector('[data-testid="play-oak_s2_1_"]')!.getBoundingClientRect();
    console.log(
      `OAK_PROBE ${JSON.stringify({
        ctxStateAtCreation: stats.audioLog[0],
        activationBefore,
        outcome,
        ms,
        startedAfterFailedUnlock: e.playing,
        ctxStateAfter: audioCtx.state,
        activationAfter: navigator.userActivation.hasBeenActive,
        evalsRun: stats.evals,
        patternHapsAfterEvaluateFalse: e.queryHaps(0, 1).length,
        playButton: { x: b.x + b.width / 2, y: b.y + b.height / 2 },
      })}`,
    );
  }, 100);
}
