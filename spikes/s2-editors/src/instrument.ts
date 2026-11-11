// Spike-only instrumentation. MUST be the first import of main.tsx so it patches the
// globals before React / CodeMirror / Strudel capture references to them.
/* eslint-disable */
type Entry = { type: string; listener: unknown; capture: boolean };
const w = window as any;

// ---- document / window listeners -------------------------------------------------
const lists = new Map<EventTarget, Entry[]>([
  [document, []],
  [window, []],
]);
const origAdd = EventTarget.prototype.addEventListener;
const origRemove = EventTarget.prototype.removeEventListener;
const cap = (o: unknown) => (typeof o === 'boolean' ? o : !!(o as any)?.capture);
EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, listener: any, opts?: any) {
  const self = this ?? window;
  const list = lists.get(self);
  if (list && listener) {
    const capture = cap(opts);
    const once = !!(opts && typeof opts === 'object' && opts.once);
    if (!once && !list.some((l) => l.type === type && l.listener === listener && l.capture === capture)) {
      const entry = { type, listener, capture };
      list.push(entry);
      const signal: AbortSignal | undefined = opts && typeof opts === 'object' ? opts.signal : undefined;
      signal?.addEventListener('abort', () => {
        const i = list.indexOf(entry);
        if (i >= 0) list.splice(i, 1);
      });
    }
  }
  return origAdd.call(self, type, listener, opts);
} as any;
EventTarget.prototype.removeEventListener = function (this: EventTarget, type: string, listener: any, opts?: any) {
  const self = this ?? window;
  const list = lists.get(self);
  if (list && listener) {
    const capture = cap(opts);
    const i = list.findIndex((l) => l.type === type && l.listener === listener && l.capture === capture);
    if (i >= 0) list.splice(i, 1);
  }
  return origRemove.call(self, type, listener, opts);
} as any;
const tally = (t: EventTarget) => {
  const out: Record<string, number> = {};
  for (const l of lists.get(t)!) out[l.type] = (out[l.type] ?? 0) + 1;
  return out;
};

// ---- requestAnimationFrame ---------------------------------------------------------
const pending = new Set<number>();
let rafCallbacks = 0;
const oRAF = window.requestAnimationFrame.bind(window);
const oCAF = window.cancelAnimationFrame.bind(window);
window.requestAnimationFrame = (cb: FrameRequestCallback) => {
  const id = oRAF((t) => {
    pending.delete(id);
    rafCallbacks++;
    cb(t);
  });
  pending.add(id);
  return id;
};
window.cancelAnimationFrame = (id: number) => {
  pending.delete(id);
  oCAF(id);
};
/** Observe `frames` animation frames (with the un-instrumented rAF) and report how many
 *  instrumented rAF callbacks ran per frame. A steady rAF loop shows up as ~1.0 per loop. */
const sampleRaf = (frames = 30) =>
  new Promise<{ frames: number; callbacks: number; perFrame: number; pendingMin: number; pendingMax: number }>(
    (resolve) => {
      const start = rafCallbacks;
      let n = 0;
      let min = Infinity;
      let max = 0;
      const step = () => {
        min = Math.min(min, pending.size);
        max = Math.max(max, pending.size);
        if (++n >= frames) {
          const callbacks = rafCallbacks - start;
          resolve({ frames, callbacks, perFrame: +(callbacks / frames).toFixed(2), pendingMin: min, pendingMax: max });
        } else oRAF(step);
      };
      oRAF(step);
    },
  );

// ---- window.setInterval --------------------------------------------------------------
const intervals = new Set<number>();
const oSI = window.setInterval.bind(window);
const oCI = window.clearInterval.bind(window);
w.setInterval = (...a: any[]) => {
  const id = (oSI as any)(...a);
  intervals.add(id);
  return id;
};
w.clearInterval = (id: number) => {
  intervals.delete(id);
  oCI(id);
};

// ---- AudioContext constructions ------------------------------------------------------
let audioContexts = 0;
const OrigAC = window.AudioContext;
w.AudioContext = class extends OrigAC {
  constructor(...a: any[]) {
    super(...(a as []));
    audioContexts++;
  }
};

// ---- window globals snapshot (to measure evalScope pollution) --------------------------
const globalsBefore = new Map<string, unknown>();
for (const k of Object.getOwnPropertyNames(window)) {
  try {
    globalsBefore.set(k, w[k]);
  } catch {}
}
const globalsDiff = () => {
  const added: string[] = [];
  const overwritten: string[] = [];
  for (const k of Object.getOwnPropertyNames(window)) {
    if (k.startsWith('__')) continue;
    let v: unknown;
    try {
      v = w[k];
    } catch {
      continue;
    }
    if (!globalsBefore.has(k)) added.push(k);
    else if (globalsBefore.get(k) !== v && typeof globalsBefore.get(k) === 'function') overwritten.push(k);
  }
  return { added: added.length, addedSample: added.slice(0, 12), overwritten };
};

// ---- console errors / page errors (also captured by Playwright) ---------------------------
const errors: string[] = [];
window.addEventListener('error', (e) => errors.push(`error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => errors.push(`unhandledrejection: ${String(e.reason)}`));

export const instr = {
  listeners: () => ({ document: tally(document), window: tally(window) }),
  listenerTotals: () => ({ document: lists.get(document)!.length, window: lists.get(window)!.length }),
  rafPending: () => pending.size,
  sampleRaf,
  intervals: () => intervals.size,
  audioContexts: () => audioContexts,
  globalsDiff,
  errors,
};
w.__instr = instr;
