// SPIKE S1 — headless Strudel grader realm (core + mini + tonal + transpiler only).
// One realm per process/worker. No DOM, no audio, no Bun APIs in here (isomorphic on purpose).
//
// The Strudel packages ship no types; everything Strudel-shaped is `any` in this spike.
// biome-ignore-all lint/suspicious/noExplicitAny: untyped Strudel interop

import * as coreNS from "@strudel/core";
import * as miniNS from "@strudel/mini";
import * as tonalNS from "@strudel/tonal";
import { transpiler as strudelTranspiler } from "@strudel/transpiler";
import { parse as parseJs } from "acorn";
import { lintStrict, type LintDiagnostic } from "./lint.ts";

const core = coreNS as any;
const mini = miniNS as any;
const tonal = tonalNS as any;
const { Pattern, silence, stack, State, TimeSpan, Fraction } = core;

// Captured BEFORE any lockdown. core.evaluate() calls the *global* `Function` at call time
// (dist/index.mjs: `return Function(r)()`), so once the realm is locked down core.evaluate is dead
// and this captured reference is the only way in.
const NativeFunction = Function;

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export interface OakEvent {
  track: string;
  /** exact whole.begin / whole.end as fraction strings ("0", "1/3", "7/8") in cycles */
  begin: string;
  end: string;
  beginF: number;
  endF: number;
  /** MIDI number, possibly fractional; null when the hap carries no pitch (e.g. drums, n without scale) */
  midi: number | null;
  pitchSource: "note" | "freq" | "value" | null;
  /** the raw note as Strudel carries it (value.note, or a bare note-like value); never re-spelled */
  note: string | number | null;
  freq: number | null;
  s: string | null;
  n: number | string | null;
  bank: string | null;
  /** hap.context.scale as Strudel writes it ("C4 major"), when the pitch came from .scale() */
  scale: string | null;
  /** [start,end) offsets into the ORIGINAL code (mini-notation leaves that produced this hap) */
  locations: { start: number; end: number }[];
}

export interface LogLine {
  level: "log" | "warn" | "error";
  /** tag between the brackets of a Strudel logger line: voicing | tonal | query | eval | mini | … ; null for plain console output */
  tag: string | null;
  message: string;
}

export interface AnalyzeResult {
  cps: number;
  /** true when the code called setcps/setcpm */
  cpsSet: boolean;
  tracks: string[];
  events: OakEvent[];
  miniLocations: [number, number][];
  widgets: unknown[];
  logs: LogLine[];
  diagnostics: { code: string; message: string }[];
  /** Fraction operations spent (evaluate + query) */
  fuelUsed: number;
}

export type GraderErrorKind = "lint" | "eval" | "query" | "too-many-events" | "too-much-work" | "not-a-pattern";

export class GraderError extends Error {
  kind: GraderErrorKind;
  logs: LogLine[];
  lint: LintDiagnostic[];
  constructor(kind: GraderErrorKind, message: string, logs: LogLine[] = [], lint: LintDiagnostic[] = []) {
    super(message);
    this.name = "GraderError";
    this.kind = kind;
    this.logs = logs;
    this.lint = lint;
  }
}

export interface AnalyzeOptions {
  /** cycles to query, [0, bars) */
  bars?: number;
  /** abort with too-many-events above this many onset haps (total, all tracks) */
  hapCap?: number;
  /** run the strict safety lint before evaluating (for code the learner did not type) */
  lint?: "off" | "strict";
  /** Fraction-operation budget for evaluate + query (deterministic work limit). Default max(1e6, hapCap*50). */
  fuel?: number;
}

// ---------------------------------------------------------------------------------------------
// Realm state (reset per request)
// ---------------------------------------------------------------------------------------------

type Transform = (pat: any) => any;
const DEFAULT_CPS = 0.5; // Cyclist default (repl without setcps)

const R = {
  ready: false,
  locked: false,
  tracks: new Map<string, any>(),
  anon: 0,
  cps: DEFAULT_CPS,
  cpsSet: false,
  all: [] as Transform[],
  each: undefined as Transform | undefined,
  logs: null as LogLine[] | null,
  diagnostics: [] as { code: string; message: string }[],
  seq: 0,
};

// repl.mjs `unpure`: unwraps pure(x) (e.g. setcps(pure(1))); a plain number passes through.
const unpure = (v: any) => (v?._Pattern ? v.__pure : v);

// GOTCHA: setcps("0.5") (double quotes) is transpiled to setcps(m('0.5', …)): a mini pattern that is
// NOT pure, so repl.mjs' unpure() hands the scheduler `undefined`. Real Strudel breaks the same way.
// The grader keeps the previous tempo and reports it.
function setTempo(cps: number, fn: string) {
  if (Number.isFinite(cps) && cps > 0) {
    R.cps = cps;
    R.cpsSet = true;
  } else {
    R.diagnostics.push({ code: "tempo.invalid", message: `${fn}() needs a plain number (no quotes)` });
  }
  return silence;
}

const resetCollector = () => {
  R.tracks.clear();
  R.anon = 0;
  R.all = [];
  R.each = undefined;
};

// --- repl-only functions (repl.mjs injects these per repl instance; none exist in @strudel/core's scope) ---
const replStubs = {
  setcps: (v: any) => setTempo(Number(unpure(v)), "setcps"),
  setcpm: (v: any) => setTempo(Number(unpure(v)) / 60, "setcpm"),
  // repl.mjs: `all` pushes (every transform applies, in order); `each` keeps only the LAST transform.
  all: (f: Transform) => {
    R.all.push(f);
    return silence;
  },
  each: (f: Transform) => {
    R.each = f;
    return silence;
  },
  // repl.mjs hush(): drops the patterns collected so far, the $ index and the each() transform.
  // (It does NOT clear all() transforms: it resets a dead variable `allTransform`, not `allTransforms`.)
  hush: () => {
    R.tracks.clear();
    R.anon = 0;
    R.each = undefined;
    return silence;
  },
  // webaudio / superdough / codemirror functions that lesson code may call; all inert here.
  samples: async () => {},
  aliasBank: async () => {},
  soundAlias: () => {},
  initAudio: async () => {},
  initAudioOnFirstClick: async () => {},
  registerSynthSounds: async () => {},
  registerZZFXSounds: async () => {},
  // transpiler rewrites slider(v, min, max, step) -> sliderWithID('slider_<offset>', v, min, max, step)
  sliderWithID: (_id: string, value: number) => core.pure(value),
};
const replAliases = { setCps: replStubs.setcps, setCpm: replStubs.setcpm };

// Visual / audio-analysis methods that only exist when @strudel/draw / webaudio / codemirror are loaded.
// Identity on the pattern. Only installed when missing (core already ships `color`, `log`, …).
export const VISUAL_METHODS = [
  "pianoroll",
  "punchcard",
  "spiral",
  "pitchwheel",
  "wordfall",
  "scope",
  "tscope",
  "fscope",
  "spectrum",
  "markcss",
  "draw",
  "onPaint",
  "animate",
  "color",
  "colour",
  "piano", // @strudel/soundfonts-era helper; inert here
];

function installPatternMethods(): string[] {
  const installed: string[] = [];
  const identity = function (this: any) {
    return this;
  };
  for (const base of VISUAL_METHODS) {
    for (const name of [base, `_${base}`]) {
      if (typeof Pattern.prototype[name] !== "function") {
        Pattern.prototype[name] = identity;
        installed.push(name);
      }
    }
  }
  // .p collector: copy of repl.mjs injectPatternMethods (1.2.6). Transpiler turns `label: expr` into `expr.p('label')`.
  Pattern.prototype.p = function (this: any, id: any) {
    if (typeof id === "string" && (id.startsWith("_") || id.endsWith("_"))) return silence; // _x / x_ mute
    // NB: like repl.mjs 1.2.6 this THROWS for a non-string id ("id.includes is not a function"),
    // which is what `.p(1)`, `.d1` and `.p1` do in the real editor. Kept on purpose.
    if (id.includes("$")) id = `${id}${R.anon++}`; // `$:` -> $0, $1 …; `S$:` -> S$<i> (solo)
    R.tracks.set(id, this);
    return this;
  };
  Pattern.prototype.q = function () {
    return silence;
  };
  for (let i = 1; i < 10; i++) {
    for (const prefix of ["d", "p"]) {
      Object.defineProperty(Pattern.prototype, `${prefix}${i}`, {
        get(this: any) {
          return this.p(i);
        },
        configurable: true,
      });
    }
    Pattern.prototype[`q${i}`] = silence;
  }
  return installed;
}

// --- console capture -------------------------------------------------------------------------
// Strudel's logger() does `console.log('%c' + message, css)` and, only when `document` exists,
// also dispatches a 'strudel.log' CustomEvent. In a worker / Bun realm console.log is the only channel.
const nativeConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info };

function toLogLine(level: LogLine["level"], args: any[]): LogLine {
  // Strudel's logger always calls console.log(`%c${message}`, css); only those lines get a tag.
  const fromLogger = typeof args[0] === "string" && args[0].startsWith("%c");
  const parts = fromLogger ? [args[0].slice(2), ...args.slice(2)] : args;
  const text = parts
    .map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : a?._Pattern ? "<Pattern>" : safeJson(a)))
    .join(" ");
  const m = fromLogger ? /^\[(\w+)\]:?\s*(.*)$/s.exec(text) : null;
  return m ? { level, tag: m[1] as string, message: m[2] as string } : { level, tag: null, message: text };
}
const safeJson = (v: unknown) => {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
};

function installConsoleCapture() {
  const hook =
    (level: LogLine["level"], native: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (R.logs) R.logs.push(toLogLine(level, args));
      else native.apply(console, args);
    };
  console.log = hook("log", nativeConsole.log);
  console.info = hook("log", nativeConsole.info);
  console.warn = hook("warn", nativeConsole.warn);
  console.error = hook("error", nativeConsole.error);
}

// --- fuel: deterministic work budget --------------------------------------------------------------
// MEASURED: counting haps after the query is useless as a guard — s("bd*1000000") materialises 1M haps
// (≈4 s, ≈3.9 GB RSS under Bun 1.4.4) before the first count. Every Strudel query is made of Fraction
// arithmetic, so metering fraction.js' prototype gives a cheap, deterministic "instructions executed"
// budget that aborts from INSIDE the query, before the allocation balloon.
const FUEL = { used: 0, limit: Number.POSITIVE_INFINITY, exceeded: false };
const FUEL_METHODS = ["add", "sub", "mul", "div", "floor", "compare", "equals"];

export class FuelExhausted extends Error {
  constructor() {
    super("oak: work budget exhausted");
    this.name = "FuelExhausted";
  }
}

function installFuel() {
  const proto = Object.getPrototypeOf(Fraction(0));
  for (const name of FUEL_METHODS) {
    const original = proto[name];
    if (typeof original !== "function") continue;
    proto[name] = function (this: unknown, a: unknown, b: unknown) {
      if (++FUEL.used > FUEL.limit) {
        FUEL.exceeded = true; // sticky: internal try/catch in Strudel cannot swallow the abort
        throw new FuelExhausted();
      }
      return original.call(this, a, b);
    };
  }
}

// --- realm snapshot: heal `register('note', …)` / `note = …` poisoning between requests --------
let globalSnapshot: [string, unknown][] = [];
let protoSnapshot: [string, PropertyDescriptor][] = [];

function snapshotRealm() {
  globalSnapshot = Object.keys(core.strudelScope).map((k) => [k, (globalThis as any)[k]]);
  protoSnapshot = Object.entries(Object.getOwnPropertyDescriptors(Pattern.prototype));
}

/** Returns the names that had been tampered with (and are now restored). */
export function restoreRealm(): string[] {
  const healed: string[] = [];
  const g = globalThis as any;
  for (const [k, v] of globalSnapshot) {
    if (g[k] !== v || core.strudelScope[k] !== v) {
      g[k] = v;
      core.strudelScope[k] = v;
      healed.push(k);
    }
  }
  const known = new Set(protoSnapshot.map(([k]) => k));
  for (const k of Object.getOwnPropertyNames(Pattern.prototype)) {
    if (!known.has(k)) {
      delete Pattern.prototype[k];
      healed.push(`Pattern.prototype.${k}`);
    }
  }
  for (const [k, d] of protoSnapshot) {
    const cur = Object.getOwnPropertyDescriptor(Pattern.prototype, k);
    if (!cur || cur.value !== d.value || cur.get !== d.get || cur.set !== d.set) {
      Object.defineProperty(Pattern.prototype, k, d);
      healed.push(`Pattern.prototype.${k}`);
    }
  }
  return healed;
}

// ---------------------------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------------------------

export interface InitInfo {
  stubbedMethods: string[];
  scopeSize: number;
}

let initInfo: InitInfo | null = null;

export async function initRealm(): Promise<InitInfo> {
  if (initInfo) return initInfo;
  // GOTCHA: @strudel/mini exports `SyntaxError` (peggy's) and `parse`; evalScope(mini) would overwrite
  // globalThis.SyntaxError for the whole realm (acorn then throws peggy SyntaxErrors). Filter it out.
  const { SyntaxError: _peg, ...miniScope } = mini;
  // repl.mjs re-registers `cpm` against the scheduler's cps (core's own divides by 1): match the repl.
  const cpm = core.register("cpm", (cpm: number, pat: any) => pat._fast(cpm / 60 / R.cps));
  await core.evalScope(core, miniScope, tonal, replStubs, replAliases, { cpm });
  const stubbedMethods = installPatternMethods();
  installConsoleCapture();
  installFuel();
  snapshotRealm();
  R.ready = true;
  initInfo = { stubbedMethods, scopeSize: Object.keys(core.strudelScope).length };
  return initInfo;
}

// ---------------------------------------------------------------------------------------------
// lockdown (Bun worker / subprocess only — breaks bun:test internals if run in the test process)
// ---------------------------------------------------------------------------------------------

/** Shadowing: every name in this list is passed as an (undefined) PARAMETER of the wrapper function that
 *  runs the evaluated code, so a bare reference resolves to `undefined` instead of the realm global.
 *  Library code (Strudel, this runtime) keeps seeing the real globals — nothing is deleted.
 *
 *  The list is computed as an ALLOWLIST complement: everything reachable as a global (own + inherited
 *  properties of globalThis) that is neither a harmless ES builtin nor part of Strudel's scope. That way
 *  host-specific globals we never heard of (Bun: `prompt`, `Loader`, `HTMLRewriter`…) are covered too. */
const SAFE_BUILTINS = new Set([
  "undefined", "NaN", "Infinity", "Math", "Number", "String", "Boolean", "Array", "Object", "JSON", "BigInt",
  "Symbol", "Date", "RegExp", "Map", "Set", "WeakMap", "WeakSet", "Promise", "Error", "TypeError", "RangeError",
  "SyntaxError", "ReferenceError", "EvalError", "URIError", "AggregateError", "isNaN", "isFinite", "parseInt",
  "parseFloat", "Intl", "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array",
  "Int32Array", "Uint32Array", "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array", "ArrayBuffer",
  "DataView", "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI", "structuredClone",
]); // prettier-ignore
/** Always shadowed, even if not (or not yet) a property of globalThis. */
const ALWAYS_SHADOWED = [
  "Bun", "process", "require", "module", "exports", "globalThis", "self", "window", "global", "fetch",
  "XMLHttpRequest", "WebSocket", "EventSource", "Worker", "SharedWorker", "BroadcastChannel", "MessageChannel",
  "postMessage", "onmessage", "addEventListener", "removeEventListener", "dispatchEvent", "importScripts",
  "navigator", "setTimeout", "setInterval", "setImmediate", "queueMicrotask", "Function", "ShadowRealm",
  "WebAssembly", "Reflect", "Proxy", "alert", "prompt", "confirm",
  // Strudel's own doors back into the host realm (core.evaluate uses the global Function)
  "evaluate", "evalScope", "strudelScope", "repl",
]; // prettier-ignore
/** Bun's console is more than logging (`for await (const line of console)` reads stdin; console.write).
 *  Evaluated code gets this four-method object instead; it feeds the per-request log capture. */
const SAFE_VALUES: Record<string, unknown> = {
  console: Object.freeze({
    log: (...a: unknown[]) => console.log(...a),
    info: (...a: unknown[]) => console.info(...a),
    warn: (...a: unknown[]) => console.warn(...a),
    error: (...a: unknown[]) => console.error(...a),
  }),
};
const NOT_PARAM_NAMES = new Set(["eval", "arguments"]); // illegal as strict-mode parameter names
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

let shadowList: string[] | null = null;

export function shadowedGlobals(): string[] {
  if (shadowList) return shadowList;
  const names = new Set<string>([...ALWAYS_SHADOWED, ...Object.keys(SAFE_VALUES)]);
  const strudel = new Set(Object.keys(core.strudelScope));
  for (let o: object | null = globalThis; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const k of Object.getOwnPropertyNames(o)) {
      if (!IDENTIFIER.test(k) || NOT_PARAM_NAMES.has(k) || SAFE_BUILTINS.has(k)) continue;
      if (strudel.has(k) && !ALWAYS_SHADOWED.includes(k)) continue;
      names.add(k);
    }
  }
  for (const k of RESERVED) names.delete(k);
  shadowList = [...names].sort();
  return shadowList;
}
const RESERVED = ["constructor", "await", "yield", "let", "static", "implements", "interface", "package", "private", "protected", "public", "enum"]; // prettier-ignore

export interface LockdownReport {
  neutered: string[];
  failed: string[];
}

export function lockDown(): LockdownReport {
  const neutered: string[] = [];
  const failed: string[] = [];
  const blocked = function blockedConstructor() {
    throw new Error("oak: code generation from strings is disabled in the grader realm");
  };
  const attempt = (name: string, fn: () => void) => {
    try {
      fn();
      neutered.push(name);
    } catch (e) {
      failed.push(`${name}: ${(e as Error).message}`);
    }
  };
  const protos: [string, object][] = [
    ["Function.prototype.constructor", Function.prototype],
    ["AsyncFunction.prototype.constructor", Object.getPrototypeOf(async () => {})],
    ["GeneratorFunction.prototype.constructor", Object.getPrototypeOf(function* () {})],
    ["AsyncGeneratorFunction.prototype.constructor", Object.getPrototypeOf(async function* () {})],
  ];
  for (const [name, proto] of protos) {
    attempt(name, () => {
      Object.defineProperty(proto, "constructor", { value: blocked, writable: false, configurable: false });
    });
  }
  // GOTCHA (crashed the worker in the spike): Bun lazily loads internal JS modules that read
  // `Function.prototype.call` through the GLOBAL `Function`. The replacement must keep the real prototype.
  Object.defineProperty(blocked, "prototype", { value: Function.prototype, writable: false });
  const g = globalThis as any;
  for (const name of ["Function", "eval"]) {
    attempt(`globalThis.${name}`, () => {
      Object.defineProperty(g, name, { value: blocked, writable: false, configurable: false });
    });
  }
  // Bun 1.4.4 ships ShadowRealm: a fresh realm WITH Bun/process/fetch, a working Function constructor and
  // importValue('node:fs', …). It is only reachable through this global.
  for (const name of ["ShadowRealm"]) {
    if (!(name in g)) continue;
    attempt(`globalThis.${name}`, () => {
      Object.defineProperty(g, name, { value: undefined, writable: false, configurable: false });
    });
  }
  R.locked = true;
  return { neutered, failed };
}

// ---------------------------------------------------------------------------------------------
// evaluate
// ---------------------------------------------------------------------------------------------

/** Own copy of core's safeEval (evaluate.mjs) on the captured Function, plus global shadowing. */
async function safeEval(transpiled: string): Promise<unknown> {
  // core: `"use strict";return ((async ()=>{<code>})())`
  const body = `"use strict";return ((async ()=>{${transpiled}})())`;
  const names = shadowedGlobals();
  const fn = NativeFunction(...names, body);
  // every shadowed name is undefined inside, except the few we deliberately replace with a safe value
  return await fn(...names.map((n) => SAFE_VALUES[n]));
}

/** ALWAYS ON. `import('node:fs')` is syntax: parameter shadowing cannot hide it and Bun has no switch to
 *  disable it. With Function/eval neutered no new code can be built from strings, so an AST scan of the
 *  exact text handed to Function is complete for this construct. */
function assertNoDynamicImport(transpiled: string): void {
  // cheap pre-filter: the token `import` must appear literally (escapes like \u0069mport are not valid keywords)
  if (!transpiled.includes("import")) return;
  const ast = parseJs(`(async()=>{${transpiled}})`, { ecmaVersion: 2022 });
  const stackNodes: unknown[] = [ast];
  while (stackNodes.length) {
    const n = stackNodes.pop() as Record<string, unknown> | null;
    if (!n || typeof n !== "object") continue;
    if (Array.isArray(n)) {
      for (const c of n) stackNodes.push(c);
      continue;
    }
    if (n.type === "ImportExpression" || n.type === "MetaProperty") {
      throw new GraderError("eval", "dynamic import() / import.meta is not available in Strudel code");
    }
    for (const k in n) if (n[k] && typeof n[k] === "object") stackNodes.push(n[k]);
  }
}

export interface EvaluateResult {
  /** track name -> pattern, in source order; 'main' when the code has no labels */
  tracks: Map<string, any>;
  /** stack of all tracks after each()/all() — what the repl would hand to the scheduler */
  pattern: any;
  cps: number;
  cpsSet: boolean;
  miniLocations: [number, number][];
  widgets: unknown[];
}

const TRACK_KEY = "oakTrack";
const tag = (pat: any, track: string) =>
  pat.withHap((h: any) => (h.context?.[TRACK_KEY] ? h : h.setContext({ ...h.context, [TRACK_KEY]: track })));

export async function evaluateCode(code: string): Promise<EvaluateResult> {
  if (!R.ready) await initRealm();
  resetCollector();
  R.cps = DEFAULT_CPS;
  R.cpsSet = false;
  R.diagnostics = [];
  tonal.resetVoicings?.(); // voicing() keeps module-global lastVoicing + default dict
  core.useRNG?.("legacy");
  core.reset_state?.();

  // Throws acorn SyntaxError (with .pos/.loc) or the transpiler's own errors.
  const meta = strudelTranspiler(code, { emitWidgets: false });
  assertNoDynamicImport(meta.output);
  const returned = await safeEval(meta.output);

  const tracks = new Map<string, any>();
  if (R.tracks.size) {
    // repl.mjs solo rule: first key with length > 1 starting with 'S' switches to solo-only.
    const keys = [...R.tracks.keys()];
    const solo = keys.some((k) => k.length > 1 && k.startsWith("S"));
    for (const k of keys) {
      if (solo && !(k.length > 1 && k.startsWith("S"))) continue;
      let pat = R.tracks.get(k);
      if (R.each) pat = R.each(pat);
      tracks.set(k, pat);
    }
  } else {
    let pat = returned;
    if (R.each && core.isPattern(pat)) pat = R.each(pat);
    tracks.set("main", pat);
  }
  for (const [k, pat] of tracks) {
    if (!core.isPattern(pat)) {
      // repl.mjs silently swaps a non-pattern for silence; the grader reports it instead.
      throw new GraderError("not-a-pattern", `track "${k}" did not evaluate to a pattern (got ${describe(pat)})`);
    }
  }
  let pattern = stack(...[...tracks].map(([k, pat]) => tag(pat, k)));
  for (const f of R.all) pattern = f(pattern);
  if (!core.isPattern(pattern)) {
    throw new GraderError("not-a-pattern", `all() transform did not return a pattern (got ${describe(pattern)})`);
  }
  return {
    tracks,
    pattern,
    cps: R.cps,
    cpsSet: R.cpsSet,
    miniLocations: meta.miniLocations ?? [],
    widgets: meta.widgets ?? [],
  };
}

const describe = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

// ---------------------------------------------------------------------------------------------
// query + normalize
// ---------------------------------------------------------------------------------------------

const isNoteString = (v: unknown): v is string => typeof v === "string" && core.isNote(v);
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** valueToMidi rules (core/util.mjs), without its throw-on-missing and without getPlayableNoteValue:
 *  freq wins over note; string note via noteToMidi (default octave 3); numeric note IS midi;
 *  `n` alone is a sample index / unresolved scale degree -> null. */
export function pitchOf(value: unknown): Pick<OakEvent, "midi" | "pitchSource" | "note" | "freq"> {
  const none = { midi: null, pitchSource: null, note: null, freq: null } as const;
  if (typeof value === "number") return { midi: value, pitchSource: "value", note: value, freq: null };
  if (typeof value === "string") {
    return isNoteString(value)
      ? { midi: core.noteToMidi(value), pitchSource: "value", note: value, freq: null }
      : none;
  }
  if (!value || typeof value !== "object") return none;
  const v = value as Record<string, unknown>;
  const note = typeof v.note === "string" || typeof v.note === "number" ? v.note : null;
  if (typeof v.freq === "number") {
    return { midi: round6(core.freqToMidi(v.freq)), pitchSource: "freq", note, freq: v.freq };
  }
  if (typeof v.note === "string") {
    return isNoteString(v.note)
      ? { midi: core.noteToMidi(v.note), pitchSource: "note", note, freq: null }
      : { midi: null, pitchSource: null, note, freq: null };
  }
  if (typeof v.note === "number") return { midi: v.note, pitchSource: "note", note, freq: null };
  return none;
}

export function normalizeHap(hap: any, fallbackTrack: string): OakEvent {
  const v = hap.value;
  const obj = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const locs = (hap.context?.locations ?? []) as { start: number; end: number }[];
  return {
    track: (hap.context?.[TRACK_KEY] as string | undefined) ?? fallbackTrack,
    begin: hap.whole.begin.toFraction(),
    end: hap.whole.end.toFraction(),
    beginF: hap.whole.begin.valueOf(),
    endF: hap.whole.end.valueOf(),
    ...pitchOf(v),
    s: typeof obj.s === "string" ? obj.s : null,
    n: typeof obj.n === "number" || typeof obj.n === "string" ? obj.n : null,
    bank: typeof obj.bank === "string" ? obj.bank : null,
    scale: typeof hap.context?.scale === "string" ? hap.context.scale : null,
    locations: locs.map((l) => ({ start: l.start, end: l.end })),
  };
}

/** Query [0,bars) one cycle at a time with pat.query (throws) — NOT queryArc (logs '[query] error' and returns []). */
export function queryOnsets(pattern: any, bars: number, cps: number, hapCap: number, logs: LogLine[] = []): any[] {
  const out: any[] = [];
  for (let c = 0; c < bars; c++) {
    let haps: any[];
    try {
      haps = pattern.query(new State(new TimeSpan(Fraction(c), Fraction(c + 1)), { _cps: cps }));
    } catch (e) {
      if (FUEL.exceeded) throw new GraderError("too-much-work", `work budget of ${FUEL.limit} exhausted in cycle ${c}`, logs);
      throw new GraderError("query", `cycle ${c}: ${(e as Error).message}`, logs);
    }
    // Strudel swallows errors in a few places (tonal's try/catch -> silence): the sticky flag still tells.
    if (FUEL.exceeded) throw new GraderError("too-much-work", `work budget of ${FUEL.limit} exhausted in cycle ${c}`, logs);
    if (haps.length > hapCap * 4) {
      // also counts fragments; a cycle this dense is never music
      throw new GraderError("too-many-events", `cycle ${c} produced ${haps.length} haps (cap ${hapCap})`, logs);
    }
    for (const h of haps) {
      if (h.whole && h.hasOnset()) out.push(h);
    }
    if (out.length > hapCap) {
      throw new GraderError("too-many-events", `more than ${hapCap} events in ${c + 1} cycle(s)`, logs);
    }
  }
  return out;
}

export async function analyze(code: string, opts: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  if (!R.ready) await initRealm();
  const bars = Math.max(1, Math.min(128, Math.floor(opts.bars ?? 4)));
  const hapCap = opts.hapCap ?? 20_000;
  const logs: LogLine[] = [];
  R.logs = logs;
  // logger() drops a message identical to the previous one within 1000 ms — ACROSS requests too.
  // Emitting a unique line resets its `lastMessage`; we then drop that line from the capture.
  core.logger(`[oak] request ${++R.seq}`);
  logs.length = 0;
  FUEL.used = 0;
  FUEL.exceeded = false;
  FUEL.limit = opts.fuel ?? Math.max(1_000_000, hapCap * 50); // ≈40–55 fuel per event measured
  try {
    if (opts.lint === "strict") {
      const problems = lintStrict(code);
      if (problems.length) {
        throw new GraderError("lint", problems.map((p) => `${p.rule}@${p.start}: ${p.message}`).join("; "), logs, problems);
      }
    }
    let ev: EvaluateResult;
    try {
      ev = await evaluateCode(code);
    } catch (e) {
      if (FUEL.exceeded) throw new GraderError("too-much-work", `work budget of ${FUEL.limit} exhausted while evaluating`, logs);
      if (e instanceof GraderError) {
        e.logs = logs;
        throw e;
      }
      throw new GraderError("eval", errorMessage(e), logs);
    }
    const haps = queryOnsets(ev.pattern, bars, ev.cps, hapCap, logs);
    const order = new Map([...ev.tracks.keys()].map((k, i) => [k, i]));
    const events = haps.map((h) => normalizeHap(h, "main"));
    events.sort(
      (a, b) =>
        a.beginF - b.beginF ||
        (order.get(a.track) ?? 99) - (order.get(b.track) ?? 99) ||
        (a.midi ?? -1) - (b.midi ?? -1) ||
        a.endF - b.endF,
    );
    const diagnostics: AnalyzeResult["diagnostics"] = [...R.diagnostics];
    for (const l of logs) {
      if (l.tag) diagnostics.push({ code: `log.${l.tag}`, message: l.message });
    }
    // e.g. note("c4").transpose("x") yields {note:""} with NO log line; note("h4") yields an unplayable string.
    const unresolved = events.filter((e) => typeof e.note === "string" && e.midi === null).length;
    if (unresolved) diagnostics.push({ code: "pitch.unresolved", message: `${unresolved} event(s) carry a note that is not a note name` });
    const bareN = events.filter((e) => e.n !== null && e.midi === null && e.s === null).length;
    if (bareN) diagnostics.push({ code: "pitch.n-without-scale", message: `${bareN} event(s) have n but no scale/sound` });
    if (events.length === 0) diagnostics.push({ code: "eval.silence", message: "no events in the queried range" });
    return {
      cps: ev.cps,
      cpsSet: ev.cpsSet,
      tracks: [...ev.tracks.keys()],
      events,
      miniLocations: ev.miniLocations,
      widgets: ev.widgets,
      logs,
      diagnostics,
      fuelUsed: FUEL.used,
    };
  } finally {
    FUEL.limit = Number.POSITIVE_INFINITY;
    R.logs = null;
    restoreRealm();
  }
}

function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    const err = e as { message: string; name?: string; pos?: number };
    return `${err.name ?? "Error"}: ${err.message}`;
  }
  return String(e);
}

/** SPIKE ONLY (security probes): run code through the same transpile + captured-Function path and return
 *  whatever it returns. `shadow:false` shows what the bare realm exposes without the parameter shadowing. */
export async function rawEval(code: string, opts: { shadow?: boolean; transpile?: boolean; importBan?: boolean } = {}): Promise<unknown> {
  if (!R.ready) await initRealm();
  const src = opts.transpile === false ? code : strudelTranspiler(code, { emitWidgets: false }).output;
  if (opts.shadow === false) return await NativeFunction(`"use strict";return ((async ()=>{${src}})())`)();
  if (opts.importBan !== false) assertNoDynamicImport(src);
  return await safeEval(src);
}

export { lintStrict };
export const __internals = { R, core, tonal, NativeFunction, FUEL };
