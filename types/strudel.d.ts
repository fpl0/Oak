// Ambient declarations for the Strudel packages (none of them ships types).
// Merged from the spikes' hand-written files (spikes/s1-grader/strudel.d.ts, s2-editors/src/strudel.d.ts,
// s3-sounds/src/strudel.d.ts, scripts/sounds/strudel-gm.d.ts).
//
// Only the two Strudel-facing packages may see this file: @oak/grader (core, mini, tonal, transpiler only)
// and @oak/strudel (everything). Their tsconfig.json includes it; no other package's does, so an
// accidental `import "@strudel/core"` elsewhere fails the typecheck (TS7016).
//
// The modules are untyped (`any`) on purpose: the spike code that gets promoted was written against
// `any`, and the surface differs between 1.2.6 and Strudel main. Use the structural types in the
// `Strudel` namespace below to annotate values at the edges; every fact in them was executed in Wave 0
// (docs/spikes.md, s1 FACT (h) and the s2/s4 gotchas).

declare module "@strudel/core";
declare module "@strudel/mini";
declare module "@strudel/tonal";
declare module "@strudel/transpiler";
declare module "@strudel/draw";
declare module "@strudel/webaudio";
declare module "@strudel/codemirror";
declare module "@strudel/soundfonts";
declare module "superdough";

/** gm.mjs maps gm_* names to WebAudioFont file stems, in `n` order. */
declare module "@strudel/soundfonts/gm.mjs" {
  const gm: Record<string, string[]>;
  export default gm;
}

declare namespace Strudel {
  /** fraction.js 5: BigInt fields. Never JSON.stringify one. */
  interface Fraction {
    s: bigint;
    n: bigint;
    d: bigint;
    add(b: Fraction | number): Fraction;
    sub(b: Fraction | number): Fraction;
    mul(b: Fraction | number): Fraction;
    div(b: Fraction | number): Fraction;
    floor(): Fraction;
    compare(b: Fraction | number): number;
    equals(b: Fraction | number): boolean;
    valueOf(): number;
    /** "1/3", "0", "7/8". */
    toFraction(): string;
  }
  interface TimeSpan {
    begin: Fraction;
    end: Fraction;
  }
  /** Absolute offsets into the ORIGINAL code, one per contributing mini-notation atom, later-applied first. */
  interface Location {
    start: number;
    end: number;
  }
  interface HapContext {
    locations?: Location[];
    /** "C4 major": space-separated, octave kept. Present when the pitch came through `.scale()`. */
    scale?: string;
    [key: string]: unknown;
  }
  interface Hap<V = unknown> {
    /** Undefined for continuous signals. */
    whole?: TimeSpan;
    part: TimeSpan;
    value: V;
    context: HapContext;
    hasOnset(): boolean;
    setContext(context: HapContext): Hap<V>;
    withValue<W>(fn: (v: V) => W): Hap<W>;
  }
  interface State {
    span: TimeSpan;
    controls: Record<string, unknown>;
  }
  interface Pattern<V = unknown> {
    /** Throws on a query error. Prefer it over `queryArc`, which logs "[query] error" and returns []. */
    query(state: State): Hap<V>[];
    /** NOT time-sorted across cycle boundaries: sort by `whole.begin` before using. */
    queryArc(begin: number, end: number, controls?: Record<string, unknown>): Hap<V>[];
    withHap<W>(fn: (hap: Hap<V>) => Hap<W>): Pattern<W>;
    filterHaps(fn: (hap: Hap<V>) => boolean): Pattern<V>;
    fmap<W>(fn: (v: V) => W): Pattern<W>;
    /** Injected by the repl (adapter) or by the grader's collector. `id` must be a string. */
    p(id: string): Pattern<V>;
    [method: string]: unknown;
  }
  /** `transpiler(code, { emitWidgets: false })`. */
  interface TranspilerOutput {
    output: string;
    /** [start, end] pairs in source order. */
    miniLocations: [number, number][];
    widgets?: unknown[];
  }
  /** `meta` of StrudelMirror's `afterEval`. */
  interface EvalMeta {
    miniLocations: [number, number][];
    widgets?: unknown[];
  }
}
