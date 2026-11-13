// The scope on one track (Wave 5, A1.L01–L04): the tapped track's voices carry superdough's `analyze` send, live,
// and nothing else changes; the tap reads that track's analyser and falls back to the master bus.
import { beforeAll, describe, expect, test } from "bun:test";
import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as tonal from "@strudel/tonal";
import { transpiler } from "@strudel/transpiler";
import {
  finalizePattern,
  installTrackWrapper,
  newSession,
  SCOPE_TRACK_ANALYSER,
  SCOPE_TRACK_FFT,
} from "./evaluation.ts";
import { TRACK_KEY } from "./haps.ts";
import { createScopeTap } from "./scope-tap.ts";

beforeAll(async () => {
  await core.evalScope(core, mini, tonal);
});

async function evaluate(code: string, scopeTrack: () => string | null): Promise<Strudel.Pattern> {
  const session = newSession();
  let out: Strudel.Pattern | undefined;
  const repl = core.repl({
    defaultOutput: () => {},
    getTime: () => 0,
    transpiler,
    beforeEval: async () => installTrackWrapper(session, () => ({ muted: new Set(), solo: null })),
    editPattern: (pat: Strudel.Pattern) => {
      out = finalizePattern(pat, { session, mutes: () => ({ muted: new Set(), solo: null }), scopeTrack });
      return out;
    },
  });
  await repl.evaluate(code, false);
  if (!out) throw new Error("no pattern");
  return out;
}

const CODE = 'bass: note("c2 g1").s("sawtooth").lpf(500)\nmel: note("c4 e4 g4").s("square")';

describe("tapTrack", () => {
  test("only the tapped track's haps carry the analyser send, and the source switches live", async () => {
    let label: string | null = "bass";
    const pat = await evaluate(CODE, () => label);
    const by = (haps: Strudel.Hap[], track: string) =>
      haps.filter((h) => h.context[TRACK_KEY] === track).map((h) => h.value as Record<string, unknown>);
    const haps = pat.queryArc(0, 1);
    for (const v of by(haps, "bass")) {
      expect(v.analyze).toBe(SCOPE_TRACK_ANALYSER);
      expect(v.fft).toBe(SCOPE_TRACK_FFT);
      expect(v.cutoff).toBe(500); // the rest of the value is untouched
    }
    for (const v of by(haps, "mel")) expect(v.analyze).toBeUndefined();
    label = "mel";
    const again = pat.queryArc(1, 2);
    expect(by(again, "mel").every((v) => v.analyze === SCOPE_TRACK_ANALYSER)).toBe(true);
    expect(by(again, "bass").every((v) => v.analyze === undefined)).toBe(true);
    label = null;
    expect(pat.queryArc(2, 3).every((h) => (h.value as Record<string, unknown>).analyze === undefined)).toBe(
      true,
    );
  });

  test("2^(fft + 5) is the master analyser's size", () => {
    expect(2 ** (SCOPE_TRACK_FFT + 5)).toBe(2048);
  });
});

/** A stand-in AnalyserNode that fills frames with one constant. */
function fakeAnalyser(level: number, fftSize = 2048): AnalyserNode {
  return {
    fftSize,
    frequencyBinCount: fftSize / 2,
    smoothingTimeConstant: 0.5,
    getFloatTimeDomainData: (a: Float32Array) => a.fill(level),
    getFloatFrequencyData: (a: Float32Array) => a.fill(level * -10),
  } as unknown as AnalyserNode;
}

describe("createScopeTap sources", () => {
  test("master by default; a track reads its own analyser (smoothing as the master's); back to master", () => {
    const master = fakeAnalyser(0.25);
    (master as { smoothingTimeConstant: number }).smoothingTimeConstant = 0;
    const track = fakeAnalyser(0.75);
    const asked: [string, number][] = [];
    const tap = createScopeTap(master, 48_000, (id, size) => {
      asked.push([id, size]);
      return track;
    });
    expect(tap.source).toEqual({ kind: "master" });
    expect(tap.track()).toBeNull();
    expect(tap.wave()[0]).toBe(0.25);
    tap.setSource({ kind: "track", label: " bass " });
    expect(tap.source).toEqual({ kind: "track", label: "bass" });
    expect(tap.track()).toBe("bass");
    expect(tap.wave()[10]).toBe(0.75);
    expect(tap.spectrum()[3]).toBe(-7.5);
    expect(track.smoothingTimeConstant).toBe(0);
    expect(asked[0]).toEqual([SCOPE_TRACK_ANALYSER, 2048]);
    tap.setSource({ kind: "master" });
    expect(tap.wave()[0]).toBe(0.25);
    expect(() => tap.setSource({ kind: "track", label: "  " })).toThrow();
  });

  test("before audio is unlocked the track analyser is not there: the master is read", () => {
    const tap = createScopeTap(fakeAnalyser(0.5), 44_100, () => null);
    tap.setSource({ kind: "track", label: "mel" });
    expect(tap.wave()[0]).toBe(0.5);
  });
});
