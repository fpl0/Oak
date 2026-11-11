// Oak's scope and spectrum (contracts §3.1 rule 9): `.scope()` and `.fscope()` never draw on Strudel's
// canvas. They open Oak's panel, which reads the post-limiter analyser of the master bus.
import { createStore, shallowEqual } from "./store.ts";
import type { ScopePanel, ScopeTap } from "./types.ts";

export interface ScopeTapInternals extends ScopeTap {
  /** The editor's last evaluation asked for these panels (empty: close). */
  setPanels(editorId: string | null, panels: ScopePanel[]): void;
}

export function createScopeTap(analyser: AnalyserNode, sampleRate: number): ScopeTapInternals {
  const store = createStore<{ editorId: string | null; panels: ScopePanel[] }>(
    { editorId: null, panels: [] },
    shallowEqual,
  );
  return {
    get: store.get,
    subscribe: store.subscribe,
    get fftSize() {
      return analyser.fftSize;
    },
    sampleRate,
    wave(target) {
      const out = target && target.length === analyser.fftSize ? target : new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(out as Float32Array<ArrayBuffer>);
      return out;
    },
    spectrum(target) {
      const bins = analyser.frequencyBinCount;
      const out = target && target.length === bins ? target : new Float32Array(bins);
      analyser.getFloatFrequencyData(out as Float32Array<ArrayBuffer>);
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
