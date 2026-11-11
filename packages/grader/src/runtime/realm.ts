// The grader realm: one Strudel scope per worker, subprocess or test process.
//
// Set-up order matters (docs/spikes.md, s1 "realm setup"):
//   1. capture `Function` (core's own `evaluate` calls the GLOBAL Function, which lockdown replaces);
//   2. evalScope(core, mini WITHOUT its SyntaxError, tonal, repl stubs, `cpm` re-registered);
//   3. Pattern.prototype: visual stubs, `.piano()`, the `.p` collector, the `_oakChord` voicing shim;
//   4. console capture, fuel meter, snapshot for healing;
//   5. lockdown (workers and subprocesses only), last.
//
// Nothing here uses a DOM or Bun API. Everything that touches shared Strudel state while no request is
// running behaves like plain Strudel (`active` gate), so other headless users in the same process
// (`@oak/grader/testing`) are not affected by the shims.
import type { ToolEntry } from "@oak/content-kit";
import type { GraderInit, GraderReady } from "../types.ts";
import { installConsoleCapture, safeConsole } from "./console.ts";
import { installFuel } from "./fuel.ts";
import { core, type Hap, type Pat, type PatternMethod, scopeModules, tonal } from "./strudel.ts";

// Captured before any lockdown: the only way to evaluate code once `Function` is neutered.
const NativeFunction = Function;

export const DEFAULT_CPS = 0.5; // the repl's default without setcps/setcpm
export const TRACK_KEY = "oakTrack";
export const CHORD_CONTEXT_KEY = "oakChord";
export const CHORD_VALUE_KEY = "_oakChord";

export type Transform = (pattern: Pat) => unknown;

export interface Collector {
  /** Label → pattern, in source order (a repeated label keeps its first position, the later pattern wins). */
  tracks: Map<string, Pat>;
  /** Running index of `$:` labels. A muted `_$:` does not consume one. */
  anon: number;
  /** `all(f)`: every transform applies, in order, to the stack. */
  all: Transform[];
  /** `each(f)`: only the LAST transform is kept (repl.mjs 1.2.6). */
  each: Transform | undefined;
}

export const R = {
  ready: false,
  locked: false,
  /** True while a request evaluates or queries: the shims only act then. */
  active: false,
  collector: {
    tracks: new Map<string, Pat>(),
    anon: 0,
    all: [] as Transform[],
    each: undefined,
  } as Collector,
  cps: DEFAULT_CPS,
  cpsSet: false,
  /** Calls like `setcpm("90")` that did not set a tempo: the name of the function. */
  tempoProblems: [] as string[],
  seq: 0,
  toolbox: [] as readonly ToolEntry[],
};

export function resetCollector(): void {
  R.collector = { tracks: new Map(), anon: 0, all: [], each: undefined };
}

// --- repl-only functions (repl.mjs injects these per repl instance; none exist in @strudel/core) ---

/** repl.mjs `unpure`: unwraps `pure(x)`; a plain number passes through. */
function unpure(value: unknown): unknown {
  return typeof value === "object" && value !== null && "_Pattern" in value
    ? (value as { __pure?: unknown }).__pure
    : value;
}

/**
 * `setcpm("90")` in double quotes is transpiled to a mini pattern that is not pure, so the real repl
 * hands its scheduler `undefined`. The grader keeps the previous tempo and reports the call.
 */
function setTempo(cps: number, fn: string): Pat {
  if (Number.isFinite(cps) && cps > 0) {
    R.cps = cps;
    R.cpsSet = true;
  } else {
    R.tempoProblems.push(fn);
  }
  return core.silence;
}

const setcps = (value: unknown) => setTempo(Number(unpure(value)), "setcps");
const setcpm = (value: unknown) => setTempo(Number(unpure(value)) / 60, "setcpm");

/** Names the realm adds to Strudel's scope. `REPL_NAMES` lets the lint know they exist. */
const replStubs: Record<string, unknown> = {
  setcps,
  setcpm,
  setCps: setcps,
  setCpm: setcpm,
  all: (f: Transform) => {
    R.collector.all.push(f);
    return core.silence;
  },
  each: (f: Transform) => {
    R.collector.each = f;
    return core.silence;
  },
  // repl.mjs hush(): drops the collected patterns, the `$` index and the each() transform. It does NOT
  // clear all() transforms (it resets a dead variable).
  hush: () => {
    R.collector.tracks.clear();
    R.collector.anon = 0;
    R.collector.each = undefined;
    return core.silence;
  },
  // Audio, sample-loading and editor functions that code may call; all inert here.
  samples: async () => {},
  aliasBank: async () => {},
  soundAlias: () => {},
  initAudio: async () => {},
  initAudioOnFirstClick: async () => {},
  registerSynthSounds: async () => {},
  registerZZFXSounds: async () => {},
  // The transpiler rewrites slider(v, min, max, step) to sliderWithID("slider_<offset>", v, min, max, step).
  sliderWithID: (_id: string, value: number) => core.pure(value),
};
export const REPL_NAMES: readonly string[] = [...Object.keys(replStubs), "slider"];

// --- Pattern.prototype ---------------------------------------------------------------------------

/**
 * Methods that only exist when @strudel/draw, webaudio or codemirror are loaded. Identity on the pattern,
 * for these names and their `_inline` variants; installed only where core has no method of that name
 * (core ships `color` and `log`).
 */
export const VISUAL_METHODS: readonly string[] = [
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
];

const proto = core.Pattern.prototype;
const MAX_PAN_MIDI = 108; // noteToMidi("C8"), as in the Strudel REPL's prebake

function midiOfValue(value: Record<string, unknown>): number | null {
  if (typeof value.freq === "number") return core.freqToMidi(value.freq);
  if (typeof value.note === "number") return value.note;
  if (typeof value.note === "string" && core.isNote(value.note)) return core.noteToMidi(value.note);
  return null;
}

/**
 * `.piano()` as the Strudel REPL defines it in prebake.mjs: clip 1 unless set, `s("piano")`, a short
 * release, and a pan that follows the pitch. Oak's dialect writes `.s("piano")`, but learner code that
 * uses the helper must give the same events here as in the editor.
 */
function piano(this: Pat): Pat {
  const call = (p: unknown, name: string, ...args: unknown[]) =>
    (p as Record<string, (...a: unknown[]) => unknown>)[name]?.(...args) as Pat;
  const clipped = this.fmap((v) => {
    const value = (typeof v === "object" && v !== null ? v : { note: v }) as Record<string, unknown>;
    return { ...value, clip: value.clip ?? 1 };
  });
  return call(call(clipped, "s", "piano"), "release", 0.1).fmap((v) => {
    const value = v as Record<string, unknown>;
    const midi = midiOfValue(value);
    if (midi === null) return value;
    const pan = Math.min(Math.round(midi) / MAX_PAN_MIDI, 1) * 0.5 + 0.25;
    return { ...value, pan: (typeof value.pan === "number" && value.pan !== 0 ? value.pan : 1) * pan };
  });
}

const chordOfValue = (value: unknown): unknown =>
  typeof value === "string" ? value : (value as { chord?: unknown } | null)?.chord;

function installPatternMethods(): string[] {
  const stubbed: string[] = [];
  const identity = function (this: Pat) {
    return this;
  };
  for (const base of VISUAL_METHODS) {
    for (const name of [base, `_${base}`]) {
      if (typeof proto[name] !== "function") {
        proto[name] = identity;
        stubbed.push(name);
      }
    }
  }
  if (typeof proto.piano !== "function") proto.piano = piano;

  // The `.p` collector: repl.mjs injectPatternMethods (1.2.6). The transpiler turns `label: expr` into
  // `expr.p('label')`.
  proto.p = function (this: Pat, label: unknown) {
    if (typeof label === "string" && (label.startsWith("_") || label.endsWith("_"))) return core.silence;
    // Like repl.mjs 1.2.6 this THROWS for a non-string id ("id.includes is not a function", the same
    // words): that is what `.p(1)`, `.d1`, `.p1` and `.p("x")` in double quotes do in the editor.
    let id = label as string;
    if (id.includes("$")) id = `${id}${R.collector.anon++}`;
    R.collector.tracks.set(id, this);
    return this;
  };
  proto.q = () => core.silence;
  for (let i = 1; i < 10; i++) {
    for (const prefix of ["d", "p"]) {
      Object.defineProperty(proto, `${prefix}${i}`, {
        get(this: Pat) {
          return (this.p as (id: unknown) => Pat)(i);
        },
        configurable: true,
      });
    }
    proto[`q${i}`] = core.silence;
  }

  // The `_oakChord` shim (contracts §6.7): the chord symbol survives on every voiced note, because
  // voicing() spreads unknown keys back with `.set(rest)`. Chord identity is read from it, never from
  // the notes of a voicing.
  const voicing = proto.voicing as PatternMethod;
  proto.voicing = function (this: Pat, ...args: unknown[]) {
    if (!R.active) return voicing.apply(this, args);
    const tagged = this.fmap((v) =>
      typeof v === "string"
        ? { chord: v, [CHORD_VALUE_KEY]: v }
        : { ...(v as object), [CHORD_VALUE_KEY]: (v as { chord?: unknown }).chord },
    );
    return voicing.apply(tagged, args);
  };
  // rootNotes() returns `{ note }` only, so the symbol travels in the hap context instead.
  const rootNotes = proto.rootNotes as PatternMethod;
  proto.rootNotes = function (this: Pat, ...args: unknown[]) {
    if (!R.active) return rootNotes.apply(this, args);
    const tagged = this.withHap((h: Hap) => {
      const chord = chordOfValue(h.value);
      return typeof chord === "string" ? h.setContext({ ...h.context, [CHORD_CONTEXT_KEY]: chord }) : h;
    });
    return rootNotes.apply(tagged, args);
  };
  return stubbed;
}

// --- snapshot and healing --------------------------------------------------------------------------
// `register('note', …)` and `note = undefined` in one request would poison every later request in the
// same realm. The snapshot is re-applied before and after every request.

let globalSnapshot: [string, unknown][] = [];
let protoSnapshot: [string, PropertyDescriptor][] = [];
let voicingSnapshot: [string, unknown][] = [];

function snapshotRealm(): void {
  const g = globalThis as Record<string, unknown>;
  globalSnapshot = Object.keys(core.strudelScope).map((k) => [k, g[k]]);
  protoSnapshot = Object.entries(Object.getOwnPropertyDescriptors(proto));
  voicingSnapshot = Object.entries(tonal.voicingRegistry);
}

/** Restores the Strudel scope, Pattern.prototype and the voicing registry. Returns what had been changed. */
export function restoreRealm(): string[] {
  const healed: string[] = [];
  const g = globalThis as Record<string, unknown>;
  for (const [k, v] of globalSnapshot) {
    if (g[k] !== v || core.strudelScope[k] !== v) {
      g[k] = v;
      core.strudelScope[k] = v;
      healed.push(k);
    }
  }
  const known = new Set(protoSnapshot.map(([k]) => k));
  for (const k of Object.getOwnPropertyNames(proto)) {
    if (!known.has(k)) {
      delete proto[k];
      healed.push(`Pattern.prototype.${k}`);
    }
  }
  for (const [k, d] of protoSnapshot) {
    const cur = Object.getOwnPropertyDescriptor(proto, k);
    if (!cur || cur.value !== d.value || cur.get !== d.get || cur.set !== d.set) {
      Object.defineProperty(proto, k, d);
      healed.push(`Pattern.prototype.${k}`);
    }
  }
  const dicts = new Map(voicingSnapshot);
  for (const k of Object.keys(tonal.voicingRegistry)) {
    if (!dicts.has(k)) {
      delete tonal.voicingRegistry[k];
      healed.push(`voicingRegistry.${k}`);
    }
  }
  for (const [k, v] of voicingSnapshot) {
    if (tonal.voicingRegistry[k] !== v) {
      tonal.voicingRegistry[k] = v as (typeof tonal.voicingRegistry)[string];
      healed.push(`voicingRegistry.${k}`);
    }
  }
  return healed;
}

// --- init ----------------------------------------------------------------------------------------

let ready: Promise<GraderReady> | null = null;

async function setUp(): Promise<GraderReady> {
  const t0 = performance.now();
  // @strudel/mini exports `SyntaxError` (the parser's class) and `parse`: evalScope(mini) would overwrite
  // the realm's global SyntaxError. Leave it out.
  const { SyntaxError: _parserError, ...miniScope } = scopeModules.mini;
  // The repl re-registers `cpm` against the scheduler's cps (core's own divides by 1): `s("bd*4").cpm(60)`
  // is 4 hits with core alone and 8 in the editor at 0.5 cps.
  const cpm = core.register("cpm", ((cpm: number, pat: Pat) =>
    (pat._fast as (factor: number) => Pat)(cpm / 60 / (R.active ? R.cps : 1))) as never);
  await core.evalScope(scopeModules.core, miniScope, scopeModules.tonal, replStubs, { cpm });
  const stubbedMethods = installPatternMethods();
  installConsoleCapture();
  installFuel();
  snapshotRealm();
  R.ready = true;
  return {
    kind: "ready",
    initMs: performance.now() - t0,
    scopeSize: Object.keys(core.strudelScope).length,
    stubbedMethods,
  };
}

/** Public `initRealm`: idempotent; a later call replaces the toolbox and may add the lockdown. */
export async function initRealm(init: Omit<GraderInit, "kind">): Promise<GraderReady> {
  ready ??= setUp();
  const info = await ready;
  R.toolbox = init.toolbox;
  if (init.lockdown && !R.locked) lockDown();
  return info;
}

export async function ensureRealm(): Promise<void> {
  if (!R.ready) await initRealm({ toolbox: R.toolbox as ToolEntry[], lockdown: false });
}

// --- shadowing -----------------------------------------------------------------------------------
// Every name in the shadow list is passed as an (undefined) PARAMETER of the wrapper function that runs
// the evaluated code, so a bare reference resolves to `undefined` instead of the realm global. Library
// code keeps the real globals: nothing is deleted.
//
// The list is an ALLOWLIST complement: everything reachable as a global (own and inherited properties
// of globalThis) that is neither a harmless ES builtin nor part of Strudel's scope. Host globals nobody
// listed (Bun: `prompt`, `Loader`, `HTMLRewriter`, ...) are covered too.

const SAFE_BUILTINS: ReadonlySet<string> = new Set(
  (
    "undefined NaN Infinity Math Number String Boolean Array Object JSON BigInt Symbol Date RegExp Map Set " +
    "WeakMap WeakSet Promise Error TypeError RangeError SyntaxError ReferenceError EvalError URIError " +
    "AggregateError isNaN isFinite parseInt parseFloat Intl Int8Array Uint8Array Uint8ClampedArray " +
    "Int16Array Uint16Array Int32Array Uint32Array Float32Array Float64Array BigInt64Array BigUint64Array " +
    "ArrayBuffer DataView encodeURIComponent decodeURIComponent encodeURI decodeURI structuredClone"
  ).split(" "),
);

/** Always shadowed, whether or not it is (yet) a property of globalThis. */
const ALWAYS_SHADOWED: readonly string[] = (
  "Bun process require module exports globalThis self window global document fetch XMLHttpRequest " +
  "WebSocket EventSource Worker SharedWorker BroadcastChannel MessageChannel postMessage onmessage " +
  "addEventListener removeEventListener dispatchEvent importScripts navigator location localStorage " +
  "sessionStorage indexedDB caches setTimeout setInterval setImmediate queueMicrotask " +
  "requestAnimationFrame Function ShadowRealm WebAssembly Reflect Proxy alert prompt confirm " +
  // Strudel's own doors back into the host realm, and functions that change state the healing cannot see.
  "evaluate evalScope strudelScope repl worklet setStringParser setTime setCpsFunc setIsStarted setPattern " +
  "setTriggerFunc Cyclist ClockCollator createClock addVoicings registerVoicings setDefaultVoicings " +
  "setVoicingRange voicingAlias voicingRegistry"
).split(" ");

const SAFE_VALUES: Readonly<Record<string, unknown>> = { console: safeConsole };
const NOT_PARAM_NAMES = new Set(["eval", "arguments"]); // illegal as strict-mode parameter names
const RESERVED = new Set(
  "constructor await yield let static implements interface package private protected public enum".split(" "),
);
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

/**
 * core's `safeEval` on the captured Function, plus the shadowing. `shadow: false` runs the code in the
 * bare realm: only the security probes of the test suite use it.
 */
export async function safeEval(transpiled: string, shadow = true): Promise<unknown> {
  const body = `"use strict";return ((async ()=>{${transpiled}})())`;
  if (!shadow) return await (NativeFunction(body) as () => Promise<unknown>)();
  const names = shadowedGlobals();
  const fn = NativeFunction(...names, body) as (...args: unknown[]) => Promise<unknown>;
  return await fn(...names.map((n) => SAFE_VALUES[n]));
}

// --- lockdown ------------------------------------------------------------------------------------

export interface LockdownReport {
  neutered: string[];
  failed: string[];
}

let lockdownReport: LockdownReport | null = null;
export const lastLockdown = (): LockdownReport | null => lockdownReport;

/**
 * Disables code generation from strings and the host's network and thread APIs (contracts §11.4).
 * Workers and subprocesses only: neutering `Function` in a test process breaks the test runner, and in
 * a browser main thread it would break the page.
 */
export function lockDown(): LockdownReport {
  if (lockdownReport) return lockdownReport;
  const neutered: string[] = [];
  const failed: string[] = [];
  const attempt = (name: string, fn: () => void) => {
    try {
      fn();
      neutered.push(name);
    } catch (e) {
      failed.push(`${name}: ${(e as Error).message}`);
    }
  };
  const blocked = function blockedConstructor() {
    throw new Error("oak: code generation from strings is disabled in the grader realm");
  };
  const protos: [string, object][] = [
    ["Function.prototype.constructor", Function.prototype],
    ["AsyncFunction.prototype.constructor", Object.getPrototypeOf(async () => {})],
    ["GeneratorFunction.prototype.constructor", Object.getPrototypeOf(function* () {})],
    ["AsyncGeneratorFunction.prototype.constructor", Object.getPrototypeOf(async function* () {})],
  ];
  for (const [name, target] of protos) {
    attempt(name, () => {
      Object.defineProperty(target, "constructor", { value: blocked, writable: false, configurable: false });
    });
  }
  // Bun lazily loads internal modules that read `Function.prototype.call` through the GLOBAL `Function`:
  // the replacement must keep the real prototype (a plain function here crashed the worker in spike S1).
  Object.defineProperty(blocked, "prototype", { value: Function.prototype, writable: false });
  const g = globalThis as Record<string, unknown>;
  for (const name of ["Function", "eval"]) {
    attempt(`globalThis.${name}`, () => {
      Object.defineProperty(g, name, { value: blocked, writable: false, configurable: false });
    });
  }
  // Bun 1.4.4 ships ShadowRealm: a fresh realm WITH Bun, process, fetch and a working Function constructor.
  if ("ShadowRealm" in g) {
    attempt("globalThis.ShadowRealm", () => {
      Object.defineProperty(g, "ShadowRealm", { value: undefined, writable: false, configurable: false });
    });
  }
  // Network, threads and storage. Evaluated code cannot name them (shadowing); this is for anything that
  // reaches them another way.
  for (const name of HOST_APIS) {
    if (!(name in g)) continue;
    const stub = function blockedHostApi() {
      throw new Error(`oak: ${name} is disabled in the grader realm`);
    };
    attempt(`globalThis.${name}`, () => {
      Object.defineProperty(g, name, { value: stub, writable: false, configurable: false });
    });
  }
  R.locked = true;
  lockdownReport = { neutered, failed };
  return lockdownReport;
}

export const HOST_APIS: readonly string[] = [
  "fetch",
  "WebSocket",
  "XMLHttpRequest",
  "EventSource",
  "Worker",
  "SharedWorker",
  "importScripts",
  "indexedDB",
  "caches",
];
