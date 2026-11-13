// The scope taps (Wave 5): side-branch analysers on the master bus and per track, torn down exactly. The real
// Web Audio path (no added latency, sample for sample) is proved in packages/audio/e2e/wave5-scope.pw.ts.
import { describe, expect, test } from "bun:test";
import { type AnalyserLike, createScopeTapsWith, type TapSourceNode } from "./scope-taps.ts";

class FakeAnalyser implements AnalyserLike {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  minDecibels = -100;
  maxDecibels = -30;
  constructor(readonly level: number) {}
  get frequencyBinCount() {
    return this.fftSize / 2;
  }
  getFloatTimeDomainData(a: Float32Array) {
    a.fill(this.level);
  }
  getFloatFrequencyData(a: Float32Array) {
    a.fill(-this.level * 10);
  }
}
class FakeSource implements TapSourceNode {
  outs: unknown[] = ["speakers"];
  connect(d: never) {
    this.outs.push(d);
    return d;
  }
  disconnect(d: never) {
    const i = this.outs.indexOf(d);
    if (i < 0) throw new Error("not connected");
    this.outs.splice(i, 1);
  }
}
function setup() {
  let n = 0;
  const made: FakeAnalyser[] = [];
  const ctx = {
    sampleRate: 48000,
    createAnalyser: () => {
      const a = new FakeAnalyser(++n);
      made.push(a);
      return a;
    },
  };
  const master = new FakeSource();
  const taps = createScopeTapsWith({ ctx, master, fftSize: 4096 });
  return { ctx, master, taps, made };
}

describe("scope taps", () => {
  test("the master analyser is a side branch configured for the scope", () => {
    const { master, taps, made } = setup();
    expect(made.length).toBe(1);
    expect(master.outs).toEqual(["speakers", made[0]]);
    expect(made[0]?.fftSize).toBe(4096);
    expect(made[0]?.smoothingTimeConstant).toBe(0);
    expect(taps.fftSize).toBe(4096);
    expect(taps.sampleRate).toBe(48000);
    expect(taps.source).toEqual({ kind: "master" });
    expect(taps.ready).toBe(true);
    expect(taps.wave()[0]).toBe(1);
    expect(taps.spectrum().length).toBe(2048);
  });

  test("a track gets its own analyser; the source switches; target arrays are reused", () => {
    const { taps, made } = setup();
    const bass = new FakeSource();
    const release = taps.addTrack("bass", bass);
    expect(bass.outs).toEqual(["speakers", made[1]]);
    taps.setSource({ kind: "track", label: "bass" });
    const buf = new Float32Array(4096);
    expect(taps.wave(buf)).toBe(buf);
    expect(buf[10]).toBe(2);
    expect(taps.tracks()).toEqual(["bass"]);
    release();
    expect(bass.outs).toEqual(["speakers"]);
    // A track that is not (or no longer) tapped reads as silence and is not ready.
    expect(taps.ready).toBe(false);
    expect(taps.wave(buf)[10]).toBe(0);
    expect(taps.spectrum()[3]).toBe(Number.NEGATIVE_INFINITY);
    taps.setSource({ kind: "master" });
    expect(taps.wave()[0]).toBe(1);
  });

  test("registering a label again replaces its node; an old release does nothing", () => {
    const { taps } = setup();
    const a = new FakeSource();
    const b = new FakeSource();
    const releaseA = taps.addTrack("mel", a);
    taps.addTrack("mel", b);
    expect(a.outs).toEqual(["speakers"]);
    releaseA();
    expect(b.outs.length).toBe(2);
    expect(taps.tracks()).toEqual(["mel"]);
  });

  test("dispose disconnects exactly the edges it made, once; reads are silent after it", () => {
    const { master, taps } = setup();
    const t1 = new FakeSource();
    const t2 = new FakeSource();
    taps.addTrack("bass", t1);
    taps.addTrack("chords", t2);
    taps.dispose();
    taps.dispose();
    expect(master.outs).toEqual(["speakers"]);
    expect(t1.outs).toEqual(["speakers"]);
    expect(t2.outs).toEqual(["speakers"]);
    expect(taps.disposed).toBe(true);
    expect(taps.tracks()).toEqual([]);
    expect(taps.ready).toBe(false);
    expect(taps.wave()[0]).toBe(0);
    expect(() => taps.addTrack("x", new FakeSource())).toThrow();
  });

  test("an existing master analyser is read, never re-created or disconnected", () => {
    const existing = new FakeAnalyser(7);
    let created = 0;
    const taps = createScopeTapsWith({
      ctx: {
        sampleRate: 44100,
        createAnalyser: () => {
          created++;
          return new FakeAnalyser(0);
        },
      },
      master: { analyser: existing },
    });
    expect(created).toBe(0);
    expect(taps.wave()[5]).toBe(7);
    taps.dispose();
    expect(taps.wave()[5]).toBe(0);
  });

  test("a source node already torn down does not throw on dispose", () => {
    const { taps } = setup();
    const gone: TapSourceNode = {
      connect: (d: never) => d,
      disconnect: () => {
        throw new Error("InvalidAccessError");
      },
    };
    taps.addTrack("gone", gone);
    expect(() => taps.dispose()).not.toThrow();
  });
});
