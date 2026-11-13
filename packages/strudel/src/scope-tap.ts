// Oak's scope and spectrum (contracts §3.1 rule 9): `.scope()` and `.fscope()` never draw on Strudel's
// canvas. They open Oak's panel, which reads the post-limiter analyser of the master bus, or one track.
//
// One track (Wave 5, A1.L01–L04: "see the bass's wave, not the whole mix"): `setSource({ kind: "track", label })`
// marks that track's voices, live, with superdough's `analyze` send (`tapTrack` in evaluation.ts), so each of its
// notes also feeds one analyser (`SCOPE_TRACK_ANALYSER`). The tap is taken after the voice's filters, envelope,
// gain and pan and before the orbit's reverb and delay: the sound of the part itself. Nothing is rewritten in the
// code and nothing changes in what is heard; a label that plays nothing shows a flat line.
import { SCOPE_TRACK_ANALYSER } from "./evaluation.ts";
import { createStore, shallowEqual } from "./store.ts";
import type { ScopePanel, ScopeSource, ScopeTap } from "./types.ts";

export interface ScopeTapInternals extends ScopeTap {
  /** The editor's last evaluation asked for these panels (empty: close). */
  setPanels(editorId: string | null, panels: ScopePanel[]): void;
  /** The tapped track's label, or null for the master bus (read live by every pattern's last step). */
  track(): string | null;
}

/** Finds (or makes) superdough's analyser of that id at that size: `getAnalyserById` from @strudel/webaudio. */
export type TrackAnalyserOf = (id: string, fftSize: number) => AnalyserNode | null;

export function createScopeTap(
  analyser: AnalyserNode,
  sampleRate: number,
  trackAnalyserOf: TrackAnalyserOf | null = null,
): ScopeTapInternals {
  const store = createStore<{ editorId: string | null; panels: ScopePanel[] }>(
    { editorId: null, panels: [] },
    shallowEqual,
  );
  let source: ScopeSource = { kind: "master" };
  /** The node to read now: the master analyser, or the track's (looked up each time: a panic rebuilds it). */
  const node = (): AnalyserNode => {
    if (source.kind === "master" || !trackAnalyserOf) return analyser;
    const n = trackAnalyserOf(SCOPE_TRACK_ANALYSER, analyser.fftSize);
    if (!n) return analyser;
    // superdough makes its analysers with smoothing 0.5; the panel draws raw frames, as the master's does.
    if (n.smoothingTimeConstant !== analyser.smoothingTimeConstant)
      n.smoothingTimeConstant = analyser.smoothingTimeConstant;
    return n;
  };
  return {
    get: store.get,
    subscribe: store.subscribe,
    get source() {
      return source;
    },
    setSource(next) {
      if (next.kind === "track") {
        const label = next.label.trim();
        if (label.length === 0) throw new Error("the scope needs a track label");
        source = { kind: "track", label };
      } else source = { kind: "master" };
    },
    track: () => (source.kind === "track" && trackAnalyserOf ? source.label : null),
    get fftSize() {
      return analyser.fftSize;
    },
    sampleRate,
    wave(target) {
      const out = target && target.length === analyser.fftSize ? target : new Float32Array(analyser.fftSize);
      node().getFloatTimeDomainData(out as Float32Array<ArrayBuffer>);
      return out;
    },
    spectrum(target) {
      const bins = analyser.frequencyBinCount;
      const out = target && target.length === bins ? target : new Float32Array(bins);
      node().getFloatFrequencyData(out as Float32Array<ArrayBuffer>);
      return out;
    },
    setPanels(editorId, panels) {
      const current = store.get();
      // Another editor's evaluation without panels does not close the panel the active one opened.
      if (panels.length === 0 && current.editorId !== editorId && current.editorId !== null) return;
      store.set({ editorId: panels.length > 0 ? editorId : null, panels: [...panels] });
    },
  };
}
