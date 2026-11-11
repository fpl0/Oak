// Evaluate and query inside the realm: transpile, ban import(), run on the captured Function with the
// shadowed globals, collect tracks with repl.mjs 1.2.6 semantics, then query one cycle at a time with
// `pattern.query(new State(…))` (it throws; `queryArc` logs "[query] error" and returns []).
import { parseProgram, stringArgs, walk } from "../lint/ast.ts";
import type { LiteralRole } from "../normalize/hap.ts";
import { hapToEvent } from "../normalize/hap.ts";
import type { OakEvent } from "../types.ts";
import { errorMessage, GraderError } from "./errors.ts";
import { FUEL } from "./fuel.ts";
import { R, resetCollector, safeEval, TRACK_KEY } from "./realm.ts";
import { core, type Hap, type Pat, transpile } from "./strudel.ts";

export interface Evaluated {
  /** Track name → pattern, in source order (after the solo rule and `each`). */
  tracks: Map<string, Pat>;
  /** The stack of every track (each tagged with its name) after the `all()` transforms. */
  pattern: Pat;
  miniLocations: [number, number][];
  roles: LiteralRole[];
}

/**
 * A dynamic `import()` is syntax: parameter shadowing cannot hide it and Bun cannot disable it. With
 * Function and eval neutered no new code can be built from strings, so scanning the exact text handed to
 * the captured Function is complete for this construct (spike S1, L4).
 */
export function assertNoDynamicImport(transpiled: string): void {
  if (!transpiled.includes("import")) return; // `import` is not a valid keyword
  const parsed = parseProgram(`(async()=>{${transpiled}})`);
  if (!parsed.ok) throw new GraderError("eval", `the code could not be checked: ${parsed.error.message}`);
  walk(parsed.ast, (n) => {
    if (n.type === "ImportExpression" || n.type === "MetaProperty") {
      throw new GraderError("eval", "import() and import.meta are not available in Strudel code");
    }
    return undefined;
  });
}

function describe(v: unknown): string {
  return v === null ? "null" : Array.isArray(v) ? "an array" : v === undefined ? "nothing" : `a ${typeof v}`;
}

const tag = (pattern: Pat, track: string): Pat =>
  pattern.withHap((h: Hap) =>
    h.context?.[TRACK_KEY] ? h : h.setContext({ ...h.context, [TRACK_KEY]: track }),
  );

/** Mini-notation literals (double quotes and backticks) and the call each one is an argument of. */
export function literalRoles(code: string): LiteralRole[] {
  const parsed = parseProgram(code);
  if (!parsed.ok) return [];
  return stringArgs(parsed.ast)
    .filter((s) => s.quote !== "'")
    .map((s) => ({ start: s.node.start, end: s.node.end, fn: s.callee }));
}

/**
 * Transpiles and runs `code` in the realm and collects its tracks. `prefix` renames the tracks
 * (`band.` for the Band layer). The caller resets the tempo and sets `R.active` around the call.
 */
export async function evaluateCode(code: string, prefix = "", shadow = true): Promise<Evaluated> {
  resetCollector();
  let meta: Strudel.TranspilerOutput;
  try {
    meta = transpile(code);
  } catch (e) {
    const err = e as { pos?: unknown; loc?: { line?: unknown } };
    if (typeof err.pos === "number") {
      const line = typeof err.loc?.line === "number" ? err.loc.line : undefined;
      throw new GraderError("eval", errorMessage(e).replace(/\s*\(\d+:\d+\)$/, ""), {
        pos: err.pos,
        ...(line !== undefined && { line }),
      });
    }
    // A mini-notation string that does not parse (peggy) or another transpiler error.
    throw new GraderError("eval", `pattern string: ${errorMessage(e)}`);
  }
  assertNoDynamicImport(meta.output);
  const returned = await safeEval(meta.output, shadow);

  const collected = R.collector;
  const tracks = new Map<string, Pat>();
  if (collected.tracks.size) {
    // repl.mjs solo rule: any key longer than one character that starts with a capital S solos.
    const keys = [...collected.tracks.keys()];
    const isSolo = (k: string) => k.length > 1 && k.startsWith("S");
    const solo = keys.some(isSolo);
    for (const k of keys) {
      if (solo && !isSolo(k)) continue;
      let pat = collected.tracks.get(k) as Pat;
      if (collected.each) pat = collected.each(pat) as Pat;
      tracks.set(`${prefix}${k}`, pat);
    }
  } else {
    let pat = returned as Pat;
    if (collected.each && core.isPattern(pat)) pat = collected.each(pat) as Pat;
    tracks.set(`${prefix}main`, pat);
  }
  for (const [k, pat] of tracks) {
    // repl.mjs silently swaps a non-pattern for silence; the grader reports it.
    if (!core.isPattern(pat)) {
      throw new GraderError("not-a-pattern", `"${k}" did not give a pattern (it gave ${describe(pat)})`);
    }
  }
  let pattern = core.stack(...[...tracks].map(([k, pat]) => tag(pat, k)));
  for (const f of collected.all) {
    pattern = f(pattern) as Pat;
    if (!core.isPattern(pattern)) {
      throw new GraderError(
        "not-a-pattern",
        `an all() transform did not return a pattern (it gave ${describe(pattern)})`,
      );
    }
  }
  return { tracks, pattern, miniLocations: meta.miniLocations ?? [], roles: literalRoles(code) };
}

export interface QuerySource {
  pattern: Pat;
  code: string;
  roles: readonly LiteralRole[];
  fallbackTrack: string;
}

function workError(c: number): GraderError {
  return new GraderError("too-much-work", `the work budget (${FUEL.limit}) ran out in bar ${c + 1}`);
}

/**
 * Onset events of cycles [from, from + bars), one cycle at a time. Throws a `GraderError` for a query
 * error, an exhausted fuel budget or more than `hapCap` events.
 */
export function queryCycles(
  sources: readonly QuerySource[],
  from: number,
  bars: number,
  cps: number,
  hapCap: number,
): OakEvent[] {
  const out: OakEvent[] = [];
  for (let c = from; c < from + bars; c++) {
    const state = new core.State(new core.TimeSpan(core.Fraction(c), core.Fraction(c + 1)), { _cps: cps });
    for (const src of sources) {
      let haps: Hap[];
      try {
        haps = src.pattern.query(state);
      } catch (e) {
        if (FUEL.exceeded) throw workError(c);
        throw new GraderError("query", `bar ${c + 1}: ${errorMessage(e)}`);
      }
      // Strudel swallows errors in a few places (tonal's try/catch → silence): the sticky flag still tells.
      if (FUEL.exceeded) throw workError(c);
      // Fragments count too: a cycle this dense is never music.
      if (haps.length > hapCap * 4) {
        throw new GraderError(
          "too-many-events",
          `bar ${c + 1} has ${haps.length} events (the limit is ${hapCap})`,
        );
      }
      for (const h of haps) {
        if (h.whole && h.hasOnset()) out.push(hapToEvent(h, src.fallbackTrack, src.code, src.roles));
      }
      if (out.length > hapCap) {
        throw new GraderError("too-many-events", `more than ${hapCap} events in ${c - from + 1} bar(s)`);
      }
    }
  }
  return out;
}

/**
 * Smallest number of bars after which the events repeat, from the bars actually queried: a period `p`
 * is accepted only when at least two full periods were queried, otherwise the answer is the queried
 * length (capped at `maxBars`).
 */
export function periodOfEvents(
  events: readonly OakEvent[],
  maxBars: number,
  queried: number,
  from = 0,
): number {
  const sig = (e: OakEvent, shift: number) =>
    `${e.track}|${round(e.beginF - shift)}|${round(e.endF - e.beginF)}|${e.midi}|${e.s}|${e.n}|${e.chord}|${e.bank}`;
  const byBar = new Map<number, string[]>();
  for (const e of events) {
    const bar = Math.floor(e.beginF) - from;
    const list = byBar.get(bar) ?? [];
    list.push(sig(e, Math.floor(e.beginF)));
    byBar.set(bar, list);
  }
  const key = (bar: number) => (byBar.get(bar) ?? []).slice().sort().join(";");
  const limit = Math.min(maxBars, Math.floor(queried / 2));
  for (let p = 1; p <= limit; p++) {
    let same = true;
    for (let b = 0; b + p < queried && same; b++) if (key(b) !== key(b + p)) same = false;
    if (same) return p;
  }
  return Math.max(1, Math.min(maxBars, queried));
}

const round = (x: number): number => Math.round(x * 1e9) / 1e9;
