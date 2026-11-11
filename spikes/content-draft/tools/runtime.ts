// Drafting kit: headless Strudel 1.2.6 runtime (core + mini + tonal + transpiler only).
// Ported from spikes/s1-grader/runtime.ts (the proven realm) without the security layers (lockdown, fuel,
// strict lint): this file only ever evaluates code that Oak's own authors wrote.
//
// What it keeps from the spike, because each one hides a silent failure otherwise:
//   - the `.p` label collector with repl.mjs 1.2.6 semantics (`_x:` mutes, `$:` becomes $0, $1 ...)
//   - setcpm / setcps capture (a quoted number is NOT a tempo: reported as tempo.invalid)
//   - identity stubs for visual / repl-only methods (.pianoroll(), .scope(), .piano(), samples() ...)
//   - console capture of Strudel's logger lines ("[tonal] ...", "[voicing]: unknown chord ...")
//   - `pat.query` per cycle (throws) instead of `queryArc` (logs "[query] error" and returns nothing)
//   - a unique logger line per request (the logger drops a repeated message for 1 s, across requests)
//
// biome-ignore-all lint/suspicious/noExplicitAny: untyped Strudel interop
import * as coreNS from "@strudel/core";
import * as miniNS from "@strudel/mini";
import * as tonalNS from "@strudel/tonal";
import { transpiler as strudelTranspiler } from "@strudel/transpiler";

// "@strudel/core loaded" banner and "cannot use window" are printed at import time: nothing to do about
// those two lines, they go to stdout once per process.
const core = coreNS as any;
const mini = miniNS as any;
const tonal = tonalNS as any;
const { Pattern, silence, State, TimeSpan, Fraction } = core;

export interface DraftEvent {
  /** Label ('mel'), '$0', or 'main' for one unlabelled expression. */
  track: string;
  /** Exact fraction strings in cycles (= bars): "0", "1/3", "25/24". */
  begin: string;
  end: string;
  beginF: number;
  endF: number;
  /** MIDI (possibly fractional); null for drums and for `n` without `.scale()`. */
  midi: number | null;
  /** value.note exactly as Strudel carries it. Never display it: `.scale()` and `voicing()` misspell. */
  note: string | number | null;
  s: string | null;
  n: number | string | null;
  bank: string | null;
  gain: number | null;
  velocity: number | null;
  clip: number | null;
  /** `hap.context.scale`, e.g. "C4 major". */
  scale: string | null;
  /** The chord symbol when the hap still carries one (`chord("C")` before or without `.voicing()`). */
  chord: string | null;
  /** [start, end) offsets into the code, one per contributing mini-notation atom. */
  locations: { start: number; end: number }[];
}
export interface LogLine {
  level: "log" | "warn" | "error";
  /** Tag between the brackets of a Strudel logger line: voicing, tonal, query, eval, mini. */
  tag: string | null;
  message: string;
}
export interface EvalOutcome {
  ok: boolean;
  /** Set when `ok` is false: a syntax, evaluation or query error. */
  error?: { kind: "eval" | "query" | "not-a-pattern" | "too-many-events"; message: string };
  cps: number;
  /** True when the code called setcpm / setcps with a plain number. */
  cpsSet: boolean;
  tracks: string[];
  /** Onset events of cycles [0, bars), sorted by (onset, track order, midi). */
  events: DraftEvent[];
  logs: LogLine[];
  /** Runtime findings: tempo.invalid, pitch.unresolved, pitch.n-without-scale, eval.silence, log.<tag>. */
  diagnostics: { code: string; message: string }[];
  bars: number;
}

const DEFAULT_CPS = 0.5;
const R = {
  ready: false,
  tracks: new Map<string, any>(),
  anon: 0,
  cps: DEFAULT_CPS,
  cpsSet: false,
  logs: null as LogLine[] | null,
  diagnostics: [] as { code: string; message: string }[],
  seq: 0,
};
const unpure = (v: any) => (v?._Pattern ? v.__pure : v);

function setTempo(cps: number, fn: string) {
  if (Number.isFinite(cps) && cps > 0) {
    R.cps = cps;
    R.cpsSet = true;
  } else {
    R.diagnostics.push({ code: "tempo.invalid", message: `${fn}() needs a plain number (no quotes)` });
  }
  return silence;
}

const replStubs = {
  setcps: (v: any) => setTempo(Number(unpure(v)), "setcps"),
  setcpm: (v: any) => setTempo(Number(unpure(v)) / 60, "setcpm"),
  setCps: (v: any) => setTempo(Number(unpure(v)), "setCps"),
  setCpm: (v: any) => setTempo(Number(unpure(v)) / 60, "setCpm"),
  hush: () => {
    R.tracks.clear();
    R.anon = 0;
    return silence;
  },
  samples: async () => {},
  aliasBank: async () => {},
  soundAlias: () => {},
  initAudio: async () => {},
  initAudioOnFirstClick: async () => {},
  registerSynthSounds: async () => {},
  registerZZFXSounds: async () => {},
  sliderWithID: (_id: string, value: number) => core.pure(value),
};

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
  "piano",
];

function installPatternMethods() {
  const identity = function (this: any) {
    return this;
  };
  for (const base of VISUAL_METHODS)
    for (const name of [base, `_${base}`])
      if (typeof Pattern.prototype[name] !== "function") Pattern.prototype[name] = identity;
  // Copy of repl.mjs injectPatternMethods (1.2.6). The transpiler turns `label: expr` into `expr.p('label')`.
  Pattern.prototype.p = function (this: any, id: any) {
    if (typeof id === "string" && (id.startsWith("_") || id.endsWith("_"))) return silence;
    if (id.includes("$")) id = `${id}${R.anon++}`;
    R.tracks.set(id, this);
    return this;
  };
}

const nativeConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info };
const safeJson = (v: unknown) => {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
};
function toLogLine(level: LogLine["level"], args: any[]): LogLine {
  // Strudel's logger always calls console.log(`%c${message}`, css); only those lines get a tag.
  const fromLogger = typeof args[0] === "string" && args[0].startsWith("%c");
  const parts = fromLogger ? [args[0].slice(2), ...args.slice(2)] : args;
  const text = parts
    .map((a: any) =>
      a instanceof Error ? a.message : typeof a === "string" ? a : a?._Pattern ? "<Pattern>" : safeJson(a),
    )
    .join(" ");
  const m = fromLogger ? /^\[(\w+)\]:?\s*(.*)$/s.exec(text) : null;
  return m ? { level, tag: m[1] as string, message: m[2] as string } : { level, tag: null, message: text };
}
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

export async function initRuntime(): Promise<void> {
  if (R.ready) return;
  // @strudel/mini exports peggy's `SyntaxError`; evalScope(mini) would overwrite the global one.
  const { SyntaxError: _peg, ...miniScope } = mini;
  // repl.mjs re-registers `cpm` against the scheduler's cps: match the repl.
  const cpm = core.register("cpm", (cpm: number, pat: any) => pat._fast(cpm / 60 / R.cps));
  // evalScope logs nothing useful; mute the console around it.
  const { log, warn } = console;
  console.log = () => {};
  console.warn = () => {};
  try {
    await core.evalScope(core, miniScope, tonal, replStubs, { cpm });
  } finally {
    console.log = log;
    console.warn = warn;
  }
  installPatternMethods();
  installConsoleCapture();
  R.ready = true;
}

const isNoteString = (v: unknown): v is string => typeof v === "string" && core.isNote(v);
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

function pitchOf(value: unknown): { midi: number | null; note: string | number | null } {
  if (typeof value === "number") return { midi: value, note: value };
  if (typeof value === "string")
    return isNoteString(value) ? { midi: core.noteToMidi(value), note: value } : { midi: null, note: null };
  if (!value || typeof value !== "object") return { midi: null, note: null };
  const v = value as Record<string, unknown>;
  const note = typeof v.note === "string" || typeof v.note === "number" ? v.note : null;
  if (typeof v.freq === "number") return { midi: round6(core.freqToMidi(v.freq)), note };
  if (typeof v.note === "string")
    return { midi: isNoteString(v.note) ? core.noteToMidi(v.note) : null, note };
  if (typeof v.note === "number") return { midi: v.note, note };
  return { midi: null, note: null };
}
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    const err = e as { message: string; name?: string };
    return `${err.name ?? "Error"}: ${err.message}`;
  }
  return String(e);
}

let queue: Promise<unknown> = Promise.resolve();
/**
 * Evaluates `code` exactly as the editor would (labels, `$:`, `_muted:`, tempo line) and returns the onset
 * events of bars [0, bars). Never throws for a problem in `code`: look at `ok`, `error`, `diagnostics`.
 */
export function evalStrudel(code: string, bars = 2, hapCap = 20_000): Promise<EvalOutcome> {
  const run = queue.then(() => evalOne(code, bars, hapCap));
  queue = run.catch(() => {});
  return run;
}

async function evalOne(code: string, barsIn: number, hapCap: number): Promise<EvalOutcome> {
  await initRuntime();
  const bars = Math.max(1, Math.min(128, Math.floor(barsIn)));
  R.tracks.clear();
  R.anon = 0;
  R.cps = DEFAULT_CPS;
  R.cpsSet = false;
  R.diagnostics = [];
  tonal.resetVoicings?.();
  core.useRNG?.("legacy");
  core.reset_state?.();
  const logs: LogLine[] = [];
  R.logs = logs;
  core.logger(`[oak] request ${++R.seq}`);
  logs.length = 0;
  const base = { cps: R.cps, cpsSet: false, tracks: [] as string[], events: [] as DraftEvent[], logs, bars };
  const fail = (kind: NonNullable<EvalOutcome["error"]>["kind"], message: string): EvalOutcome => ({
    ...base,
    ok: false,
    error: { kind, message },
    cps: R.cps,
    cpsSet: R.cpsSet,
    tracks: [...R.tracks.keys()],
    diagnostics: [...R.diagnostics, ...logDiagnostics(logs)],
  });
  try {
    let returned: unknown;
    try {
      const { output } = strudelTranspiler(code, { emitWidgets: false });
      returned = await Function(`"use strict";return ((async ()=>{${output}})())`)();
    } catch (e) {
      return fail("eval", errorMessage(e));
    }
    const tracks = new Map<string, any>();
    if (R.tracks.size) {
      // repl.mjs solo rule: any key longer than 1 char starting with 'S' switches to solo-only.
      const keys = [...R.tracks.keys()];
      const solo = keys.some((k) => k.length > 1 && k.startsWith("S"));
      for (const k of keys) if (!solo || (k.length > 1 && k.startsWith("S"))) tracks.set(k, R.tracks.get(k));
    } else tracks.set("main", returned);
    for (const [k, pat] of tracks)
      if (!core.isPattern(pat))
        return fail("not-a-pattern", `track "${k}" did not evaluate to a pattern (got ${typeof pat})`);
    const names = [...tracks.keys()];
    const events: DraftEvent[] = [];
    for (const [track, pat] of tracks) {
      for (let c = 0; c < bars; c++) {
        let haps: any[];
        try {
          haps = pat.query(new State(new TimeSpan(Fraction(c), Fraction(c + 1)), { _cps: R.cps }));
        } catch (e) {
          return fail("query", `track "${track}", bar ${c + 1}: ${errorMessage(e)}`);
        }
        for (const hap of haps) {
          if (!hap.whole || !hap.hasOnset()) continue;
          const v = hap.value;
          const obj = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
          events.push({
            track,
            begin: hap.whole.begin.toFraction(),
            end: hap.whole.end.toFraction(),
            beginF: hap.whole.begin.valueOf(),
            endF: hap.whole.end.valueOf(),
            ...pitchOf(v),
            s: typeof obj.s === "string" ? obj.s : null,
            n: typeof obj.n === "number" || typeof obj.n === "string" ? obj.n : null,
            bank: typeof obj.bank === "string" ? obj.bank : null,
            gain: num(obj.gain),
            velocity: num(obj.velocity),
            clip: num(obj.clip),
            scale: typeof hap.context?.scale === "string" ? hap.context.scale : null,
            chord: typeof obj.chord === "string" ? obj.chord : null,
            locations: ((hap.context?.locations ?? []) as { start: number; end: number }[]).map((l) => ({
              start: l.start,
              end: l.end,
            })),
          });
          if (events.length > hapCap) return fail("too-many-events", `more than ${hapCap} events`);
        }
      }
    }
    events.sort(
      (a, b) =>
        a.beginF - b.beginF ||
        names.indexOf(a.track) - names.indexOf(b.track) ||
        (a.midi ?? -1) - (b.midi ?? -1) ||
        a.endF - b.endF,
    );
    const diagnostics = [...R.diagnostics, ...logDiagnostics(logs)];
    const unresolved = events.filter((e) => typeof e.note === "string" && e.midi === null).length;
    if (unresolved)
      diagnostics.push({
        code: "pitch.unresolved",
        message: `${unresolved} event(s) carry a note that is not a note name`,
      });
    const bareN = events.filter((e) => e.n !== null && e.midi === null && e.s === null).length;
    if (bareN)
      diagnostics.push({
        code: "pitch.n-without-scale",
        message: `${bareN} event(s) have n but no scale and no sound`,
      });
    const chordOnly = events.filter((e) => e.chord !== null && e.midi === null).length;
    if (chordOnly)
      diagnostics.push({
        code: "pitch.chord-without-voicing",
        message: `${chordOnly} event(s) carry a chord symbol but no pitch (missing .voicing() or .rootNotes())`,
      });
    if (events.length === 0)
      diagnostics.push({ code: "eval.silence", message: `no events in bars 1-${bars}` });
    return { ok: true, cps: R.cps, cpsSet: R.cpsSet, tracks: names, events, logs, diagnostics, bars };
  } finally {
    R.logs = null;
  }
}

function logDiagnostics(logs: LogLine[]): { code: string; message: string }[] {
  const out: { code: string; message: string }[] = [];
  for (const l of logs) {
    if (l.tag) out.push({ code: `log.${l.tag}`, message: l.message });
    else if (l.level !== "log") out.push({ code: `log.${l.level}`, message: l.message });
  }
  return out;
}

/** Prints through the native console even while a capture is installed. */
export const print = (...args: unknown[]): void => nativeConsole.log.apply(console, args);
