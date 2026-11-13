// Wave 5 (docs/design/wave5.md §3.4): a scope tap for tests and for surfaces drawn without audio (Quiet screenshots,
// unit tests of the scope panel): a pure sine (or any wave function) at a chosen frequency, and its spectrum.
import { createStore, shallowEqual } from "./store.ts";
import type { ScopePanel, ScopeSource, ScopeTap } from "./types.ts";

export interface FakeScopeOptions {
  sampleRate?: number;
  fftSize?: number;
  /** Partials as `[harmonic number, amplitude]` over `f0` (default: one sine). */
  partials?: readonly (readonly [number, number])[];
  f0?: number;
}

export function fakeScopeTap(o: FakeScopeOptions = {}): ScopeTap & { open(panels: ScopePanel[]): void } {
  const sampleRate = o.sampleRate ?? 48_000;
  const fftSize = o.fftSize ?? 2048;
  const f0 = o.f0 ?? 220;
  const partials = o.partials ?? [[1, 0.5]];
  const store = createStore<{ editorId: string | null; panels: ScopePanel[] }>(
    { editorId: null, panels: [] },
    shallowEqual,
  );
  let source: ScopeSource = { kind: "master" };
  const sample = (i: number): number =>
    partials.reduce((acc, [h, a]) => acc + a * Math.sin((2 * Math.PI * f0 * h * i) / sampleRate), 0);
  return {
    get: store.get,
    subscribe: store.subscribe,
    fftSize,
    sampleRate,
    get source() {
      return source;
    },
    setSource(next) {
      source = next;
    },
    wave(target) {
      const out = target && target.length === fftSize ? target : new Float32Array(fftSize);
      for (let i = 0; i < fftSize; i++) out[i] = sample(i);
      return out;
    },
    spectrum(target) {
      const bins = fftSize / 2;
      const out = target && target.length === bins ? target : new Float32Array(bins);
      out.fill(-120);
      for (const [h, a] of partials) {
        const bin = Math.round((f0 * h * fftSize) / sampleRate);
        if (bin > 0 && bin < bins) out[bin] = 20 * Math.log10(Math.max(a / 2, 1e-6));
      }
      return out;
    },
    open(panels) {
      store.set({ editorId: "fake", panels: [...panels] });
    },
  };
}
