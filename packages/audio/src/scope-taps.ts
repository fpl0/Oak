// Wave 5 (docs/design/wave5.md §3.4): the analyser taps behind Oak's scope and spectrum panel — one AnalyserNode on
// the master bus and one per labelled track, on the shared AudioContext (`OakStrudel.ctx`; this package never makes
// one). Every analyser is a side branch: the source connects to it and it connects to nothing, so the signal path
// the speakers and the recorder hear is unchanged and gains no latency (proved sample-for-sample in
// packages/audio/e2e/wave5-scope.pw.ts). The editor that owns the taps disposes them with itself; disposing
// disconnects exactly the edges it made, never the source's other outputs.
//
// `ScopeTaps` has the read side of `@oak/strudel`'s `ScopeTap` (fftSize, sampleRate, wave, spectrum, source,
// setSource), so the sound engineer can back `OakStrudel.scope` with it once superdough exposes a node per track.

/** What the panel listens to: the master bus, or one labelled track (structurally `@oak/strudel`'s `ScopeSource`). */
export type ScopeTapSource = { kind: "master" } | { kind: "track"; label: string };

/** The part of an AnalyserNode the taps use. */
export interface AnalyserLike {
  fftSize: number;
  smoothingTimeConstant: number;
  minDecibels: number;
  maxDecibels: number;
  readonly frequencyBinCount: number;
  getFloatTimeDomainData(array: Float32Array<ArrayBuffer>): void;
  getFloatFrequencyData(array: Float32Array<ArrayBuffer>): void;
}
/** The part of an AudioNode the taps connect from. */
export interface TapSourceNode {
  connect(destination: never): unknown;
  disconnect(destination: never): void;
}

export interface ScopeTapsOptions {
  /** Default 2048 (about 43 ms at 48 kHz): enough for two periods of a 50 Hz bass. */
  fftSize?: number;
  /** Default 0: the scope shows the signal as it is; the panel smooths its own drawing. */
  smoothing?: number;
  minDecibels?: number;
  maxDecibels?: number;
}

export interface ScopeTapsDeps extends ScopeTapsOptions {
  ctx: { readonly sampleRate: number; createAnalyser(): AnalyserLike };
  /**
   * The master bus. Either the node to tap (post-limiter), or an analyser already on it
   * (`OakStrudel.master.analyser`), which is then read and never re-created or disconnected.
   */
  master: TapSourceNode | { analyser: AnalyserLike };
}

export interface ScopeTaps {
  readonly fftSize: number;
  readonly sampleRate: number;
  readonly source: ScopeTapSource;
  /** Listen to the master or to one track. A track that has not registered yet reads as silence (`ready` false). */
  setSource(source: ScopeTapSource): void;
  /** Whether the current source has a live analyser. */
  readonly ready: boolean;
  /** Time-domain samples (−1 to 1) of the current source. Reuses `target` when its length fits. */
  wave(target?: Float32Array): Float32Array;
  /** dBFS per bin (`fftSize / 2` bins up to `sampleRate / 2`) of the current source. */
  spectrum(target?: Float32Array): Float32Array;
  /**
   * A track's output node, tapped by its own analyser (a side branch). Registering a label again replaces the
   * earlier node. Returns the release, which disconnects that analyser.
   */
  addTrack(label: string, node: TapSourceNode): () => void;
  /** Labels with a live analyser, in registration order. */
  tracks(): string[];
  readonly disposed: boolean;
  /** Disconnects every analyser this made. Reads after it return silence. */
  dispose(): void;
}

function configure(a: AnalyserLike, o: ScopeTapsOptions): AnalyserLike {
  a.fftSize = o.fftSize ?? 2048;
  a.smoothingTimeConstant = o.smoothing ?? 0;
  if (o.minDecibels !== undefined) a.minDecibels = o.minDecibels;
  if (o.maxDecibels !== undefined) a.maxDecibels = o.maxDecibels;
  return a;
}

export function createScopeTapsWith(deps: ScopeTapsDeps): ScopeTaps {
  const fftSize = deps.fftSize ?? 2048;
  const own: { node: TapSourceNode; analyser: AnalyserLike }[] = [];
  const tap = (node: TapSourceNode): AnalyserLike => {
    const analyser = configure(deps.ctx.createAnalyser(), deps);
    node.connect(analyser as never);
    own.push({ node, analyser });
    return analyser;
  };
  const untap = (analyser: AnalyserLike) => {
    const i = own.findIndex((o) => o.analyser === analyser);
    if (i < 0) return;
    const [o] = own.splice(i, 1);
    try {
      // Only this edge: the node keeps every other output.
      o?.node.disconnect(analyser as never);
    } catch {
      // already disconnected (the node was torn down first)
    }
  };
  const master: AnalyserLike =
    "analyser" in deps.master ? deps.master.analyser : tap(deps.master as TapSourceNode);
  const trackMap = new Map<string, AnalyserLike>();
  let source: ScopeTapSource = { kind: "master" };
  let disposed = false;

  const current = (): AnalyserLike | null => {
    if (disposed) return null;
    return source.kind === "master" ? master : (trackMap.get(source.label) ?? null);
  };

  return {
    fftSize,
    sampleRate: deps.ctx.sampleRate,
    get source() {
      return source;
    },
    setSource(next) {
      source = next.kind === "master" ? { kind: "master" } : { kind: "track", label: next.label };
    },
    get ready() {
      return current() !== null;
    },
    wave(target) {
      const a = current();
      const size = a?.fftSize ?? fftSize;
      const out = target && target.length === size ? target : new Float32Array(size);
      if (a) a.getFloatTimeDomainData(out as Float32Array<ArrayBuffer>);
      else out.fill(0);
      return out;
    },
    spectrum(target) {
      const a = current();
      const bins = a?.frequencyBinCount ?? fftSize / 2;
      const out = target && target.length === bins ? target : new Float32Array(bins);
      if (a) a.getFloatFrequencyData(out as Float32Array<ArrayBuffer>);
      else out.fill(Number.NEGATIVE_INFINITY);
      return out;
    },
    addTrack(label, node) {
      if (disposed) throw new Error("@oak/audio: the scope taps were disposed");
      const before = trackMap.get(label);
      if (before) untap(before);
      const analyser = tap(node);
      trackMap.set(label, analyser);
      return () => {
        if (trackMap.get(label) !== analyser) return;
        trackMap.delete(label);
        untap(analyser);
      };
    },
    tracks() {
      return [...trackMap.keys()];
    },
    get disposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of [...own]) untap(o.analyser);
      trackMap.clear();
    },
  };
}

/** The taps on a real context: `createScopeTapsWith` with the context's own `createAnalyser`. */
export function createScopeTaps(
  ctx: BaseAudioContext,
  master: AudioNode | { analyser: AnalyserNode },
  options: ScopeTapsOptions = {},
): ScopeTaps {
  return createScopeTapsWith({
    ...options,
    ctx: ctx as unknown as ScopeTapsDeps["ctx"],
    master: master as unknown as ScopeTapsDeps["master"],
  });
}
