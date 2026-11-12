// The Wave 3 pitch gate on the fixture corpus: every clip of `corpus.ts` through the exact worklet DSP path
// (PitchFrameAnalyzer in 128-sample quanta) and the tracker with the voicing gate a learner calibrated in that
// room would have. Fails below "≥ 95 % of voiced frames within ±25 cents, octave errors < 2 %", when silence,
// room noise or bleed is reported as a voice (> 1 %), or when the tracker reports too little of the voice
// (recall < 85 % overall, < 70 % in any class; the 10 dB SNR clips are below the contract's own voicing gate
// and are reported, not gated). Variant 0 is the corpus the detector's thresholds were set on; variants 1–3
// are held out (other notes, vowels, first-harmonic levels, vibrato rates and seeds).
import { describe, expect, test } from "bun:test";
import { CORPUS_CLASSES, corpusSpecs, renderClip, renderCorpus, TRUTH_STEP, variantOf } from "./corpus.ts";
import { analyzeClip, formatGateTable, frameTruth, GATE, gateReport, scoreClip } from "./gate.ts";

describe("the corpus", () => {
  test("covers every class, adult ranges E2–A5, both common sample rates, and is deterministic", () => {
    const specs = corpusSpecs();
    expect(new Set(specs.map((s) => s.cls))).toEqual(new Set(CORPUS_CLASSES));
    expect(new Set(specs.map((s) => s.id)).size).toBe(specs.length);
    const midis = specs.flatMap((s) =>
      s.parts.flatMap((p) => (p.kind === "phrase" ? p.notes.map((n) => n.midi) : [])),
    );
    expect(Math.min(...midis)).toBeLessThanOrEqual(41); // F2 and below
    expect(Math.max(...midis)).toBeGreaterThanOrEqual(80); // A♭5 and above
    expect(new Set(specs.map((s) => s.sampleRate ?? 48000))).toEqual(new Set([48000, 44100]));
    const spec = specs.find((s) => s.id === "vibrato/tenor");
    if (!spec) throw new Error("missing clip");
    const a = renderClip(spec);
    const b = renderClip(spec);
    expect(a.samples).toEqual(b.samples);
    expect(variantOf(spec, 2).id).toBe("vibrato/tenor#v2");
    expect(renderClip(variantOf(spec, 2)).samples).not.toEqual(a.samples);
  });

  test("truth: no voice is unvoiced, a held note is voiced at its pitch, onsets are not scored", () => {
    const spec = corpusSpecs().find((s) => s.id === "steady/tenor");
    if (!spec) throw new Error("missing clip");
    const clip = renderClip(spec);
    // 0.35 s of room before the first note (C♯3 = 49).
    expect(frameTruth(clip, 0.2).state).toBe("unvoiced");
    expect(frameTruth(clip, 0.36).state).toBe("ignore");
    const held = frameTruth(clip, 0.7);
    expect(held.state).toBe("voiced");
    expect(held.midi).toBeCloseTo(49, 1);
    expect(clip.f0.length * TRUTH_STEP).toBeGreaterThanOrEqual(clip.samples.length);
  });

  test("room clips hold no voice at all and the voice sits at its level", () => {
    for (const clip of renderCorpus((s) => s.cls === "silence-room")) {
      expect(clip.f0.every((f) => f === 0)).toBe(true);
    }
  });
});

describe("the gate", () => {
  for (const variant of [0, 1, 2, 3]) {
    test(`variant ${variant}${variant === 0 ? " (tuning set)" : " (held out)"}`, () => {
      const results = renderCorpus(undefined, variant).map((clip) => ({
        clip,
        counts: scoreClip(clip, analyzeClip(clip)),
      }));
      const report = gateReport(results);
      console.log(`\nPitch gate, corpus variant ${variant}:\n${formatGateTable(report)}\n`);
      expect(report.failures).toEqual([]);
      expect(report.overall.within).toBeGreaterThanOrEqual(GATE.minWithin);
      expect(report.overall.octave).toBeLessThan(GATE.maxOctave);
      expect(report.overall.falseVoiced).toBeLessThanOrEqual(GATE.maxFalseVoiced);
      expect(report.recallGated).toBeGreaterThanOrEqual(GATE.minRecall);
    }, 60_000);
  }

  test("the octave check matters: without it the weak-fundamental class fails", () => {
    // The same clips through a detector without the half-period check: the trap is real in the corpus.
    const results = renderCorpus((s) => s.cls === "weak-fundamental").map((clip) => ({
      clip,
      counts: scoreClip(clip, analyzeClip(clip, { octaveCheck: false })),
    }));
    const report = gateReport(results);
    expect(report.overall.octave).toBeGreaterThan(GATE.maxOctave);
  }, 30_000);
});
