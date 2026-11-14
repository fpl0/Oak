import { describe, expect, test } from "bun:test";
import type { MasterReading } from "@oak/audio/master-meter";
import type { PitchFrame } from "@oak/pitch";
import { firstSingPasses, midiToHz } from "@oak/pitch";
import {
  bleedVerdict,
  centsWords,
  firstSingTonic,
  foldedCents,
  ladderSummary,
  liveMidi,
  matchTargets,
  matchVerdict,
  matchWords,
  noiseVerdict,
  noteReadout,
  outputChangeAdvice,
  outputChoiceOf,
  outputGuidance,
  phraseReadout,
  rangeOk,
  rangeSummary,
  singLatencyVerdict,
  tapVerdict,
} from "./logic.ts";

const frames = (midi: number, n: number, t0 = 0, hop = 512 / 48000): PitchFrame[] =>
  Array.from({ length: n }, (_, i) => ({ t: t0 + i * hop, hz: midiToHz(midi), clarity: 0.97, rms: 0.1 }));

describe("verdicts", () => {
  test("noise floor: below −45 dBFS is quiet", () => {
    expect(noiseVerdict(-60).ok).toBe(true);
    expect(noiseVerdict(-40).ok).toBe(false);
    expect(noiseVerdict(-40).body).toContain("-40 dBFS");
  });
  test("bleed", () => {
    expect(bleedVerdict(false).ok).toBe(true);
    expect(bleedVerdict(true).ok).toBe(false);
  });
  test("tap latency: too few taps, normal, Bluetooth-high", () => {
    expect(tapVerdict({ latencyMs: 30, jitterMs: 8, taps: 5 }).ok).toBe(false);
    expect(tapVerdict({ latencyMs: 34, jitterMs: 8, taps: 16 }).title).toBe(
      "Your taps land 34 ms after the click",
    );
    expect(tapVerdict({ latencyMs: 180, jitterMs: 8, taps: 16 }).body).toContain("Bluetooth");
  });
  test("sing latency: implausible values are not stored", () => {
    expect(singLatencyVerdict(Number.NaN).ok).toBe(false);
    expect(singLatencyVerdict(900).ok).toBe(false);
    expect(singLatencyVerdict(85).ok).toBe(true);
  });
  test("copy is calm: no exclamation marks anywhere", () => {
    const all = [
      noiseVerdict(-60),
      noiseVerdict(-30),
      bleedVerdict(true),
      bleedVerdict(false),
      tapVerdict({ latencyMs: 30, jitterMs: 8, taps: 2 }),
      singLatencyVerdict(9999),
      outputGuidance("bluetooth"),
      outputGuidance("speakers"),
      outputGuidance("wired"),
    ];
    for (const v of all) expect(`${v.title} ${v.body}`).not.toContain("!");
  });
});

describe("range", () => {
  test("the result card reads like ux §4.7", () => {
    expect(rangeSummary({ lowMidi: 45, highMidi: 64, comfortLowMidi: 48, comfortHighMidi: 60 })).toBe(
      "Your singing zone: A2–E4 (comfortable C3–C4). Oak will choose keys that sit there.",
    );
  });
  test("a one-note 'range' is not believable", () => {
    expect(rangeOk({ lowMidi: 57, highMidi: 57, comfortLowMidi: 57, comfortHighMidi: 57 })).toBe(false);
    expect(rangeOk({ lowMidi: 45, highMidi: 64, comfortLowMidi: 48, comfortHighMidi: 60 })).toBe(true);
  });
});

describe("first sing", () => {
  test("plays a C in the comfort zone, middle C without one", () => {
    expect(firstSingTonic({ comfortLowMidi: null, comfortHighMidi: null })).toBe(60);
    expect(firstSingTonic({ comfortLowMidi: 43, comfortHighMidi: 55 })).toBe(48);
    expect(firstSingTonic({ comfortLowMidi: 55, comfortHighMidi: 67 })).toBe(60);
    expect(firstSingTonic({ comfortLowMidi: 64, comfortHighMidi: 76 })).toBe(72);
  });
  test("is lenient: any octave within ±100¢ passes, a fifth away does not (the real @oak/pitch rule)", () => {
    const profile = {
      rangeLow: 48,
      rangeHigh: 72,
      comfLow: 50,
      comfHigh: 70,
      tapLatencyMs: 0,
      tapJitterMs: 0,
      singLatencyMs: 0,
      singTolCents: 70 as const,
      singTolMode: "auto" as const,
      noiseFloorDb: -60,
      outputKind: "wired" as const,
      inputKind: "builtin" as const,
      quiet: false,
    };
    expect(firstSingPasses(frames(48.8, 90), 60, profile)).toBe(true); // C3 + 80¢, an octave down
    expect(firstSingPasses(frames(72, 90), 60, profile)).toBe(true);
    expect(firstSingPasses(frames(67, 90), 60, profile)).toBe(false);
    expect(firstSingPasses(frames(60, 20), 60, profile)).toBe(false); // too short to count as sustained
    expect(foldedCents(48.8, 60)).toBeCloseTo(80, 6);
  });
});

describe("readouts", () => {
  test("live note from voiced frames only", () => {
    expect(liveMidi(frames(57, 10))).toBeCloseTo(57, 6);
    expect(liveMidi([])).toBeNull();
    expect(noteReadout(57.12)).toBe("A3 +12¢");
    expect(noteReadout(null)).toBe("—");
  });
  test("needle words", () => {
    expect(centsWords(-5)).toBe("spot on");
    expect(centsWords(-30)).toBe("a little low");
    expect(centsWords(80)).toBe("high");
  });
  test("ladder summary", () => {
    expect(ladderSummary({ singToleranceCents: 70, singTolMode: "auto" }).next).toContain("±50¢");
    expect(ladderSummary({ singToleranceCents: 25, singTolMode: "auto" }).next).toContain("finest");
    expect(ladderSummary({ singToleranceCents: 50, singTolMode: "fixed" }).current).toBe("±50¢ (fixed)");
  });
  test("output kind → choice", () => {
    expect(outputChoiceOf("bluetooth")).toBe("bluetooth");
    expect(outputChoiceOf("unknown")).toBe("wired");
  });
});

describe("the pitch match and the output-change advice", () => {
  test("three targets inside the comfort zone", () => {
    expect(matchTargets({ comfortLowMidi: 48, comfortHighMidi: 60 })).toEqual([54, 58, 49]);
    expect(matchTargets({ comfortLowMidi: 57, comfortHighMidi: 60 })).toEqual([59, 60, 57]);
    expect(matchTargets({ comfortLowMidi: null, comfortHighMidi: null })).toEqual([61, 65, 56]);
  });
  test("the verdict counts within ±50¢ and never shames", () => {
    const v = matchVerdict([
      { midi: 60, cents: 12 },
      { midi: 64, cents: -49 },
      { midi: 55, cents: 120 },
    ]);
    expect(v.within).toBe(2);
    expect(v.title).toBe("2 of 3 notes matched within ±50¢");
    const low = matchVerdict([
      { midi: 60, cents: 80 },
      { midi: 64, cents: null },
      { midi: 55, cents: -300 },
    ]);
    expect(low.within).toBe(0);
    expect(low.body).toMatch(/starts wide/);
    expect(low.body).not.toMatch(/fail|wrong|bad/i);
    expect(matchVerdict([{ midi: 60, cents: null }]).title).toMatch(/didn't hear/);
  });
  test("each trial in words and arrows", () => {
    expect(matchWords(1)).toBe("spot on (+1¢)");
    // Wave 4 (contracts §8.6): a trial the playback spoke over says so, whatever was measured.
    expect(matchWords(3, true)).toBe("the mic heard the playback");
    expect(matchWords(null, true)).toBe("the mic heard the playback");
    expect(matchWords(-32)).toBe("↓ a little low (−32¢)");
    expect(matchWords(-399)).toBe("↓ 4 semitones low");
    expect(matchWords(100)).toBe("↑ 1 semitone high");
    expect(matchWords(null)).toBe("no steady note heard");
  });
  test("output change: only when the class changed to or from Bluetooth", () => {
    expect(outputChangeAdvice("AirPods Pro", "bluetooth", "wired")?.title).toBe("Oak sees AirPods Pro");
    expect(outputChangeAdvice("External Headphones", "wired", "bluetooth")?.body).toMatch(/over Bluetooth/);
    expect(outputChangeAdvice("AirPods Pro", "bluetooth", "bluetooth")).toBeNull();
    expect(outputChangeAdvice(null, null, "wired")).toBeNull();
    expect(outputChangeAdvice("MacBook Pro Speakers", "speakers", "unknown")).toBeNull();
  });
});

describe("the test phrase's read-out", () => {
  const reading = (over: Partial<MasterReading> = {}): MasterReading => ({
    seconds: 3.2,
    levelDb: -21.4,
    preLevelDb: -21.4,
    peakDb: -8.7,
    outPeakDb: -8.7,
    loudest: null,
    limiter: { state: "resting", maxReductionDb: 0, workingShare: 0, firstAtSec: null },
    silentShare: 0.1,
    ...over,
  });
  test("the level, the loudest moment and the limiter, in dB below full scale", () => {
    expect(phraseReadout(reading())).toBe(
      "Measured over that phrase: average level −21.4 dB, loudest moment −8.7 dB before the limiter (0 dB is full scale). The limiter rested.",
    );
    expect(
      phraseReadout(
        reading({
          peakDb: 1.2,
          limiter: { state: "touching", maxReductionDb: 3.1, workingShare: 0.04, firstAtSec: 1.5 },
        }),
      ),
    ).toBe(
      "Measured over that phrase: average level −21.4 dB, loudest moment +1.2 dB before the limiter (0 dB is full scale). The limiter caught the loudest hits (up to 3.1 dB).",
    );
  });
  test("a muted output says so instead of printing minus infinity", () => {
    expect(phraseReadout(reading({ levelDb: Number.NEGATIVE_INFINITY }))).toBe(
      "Nothing reached the output while Oak was measuring.",
    );
  });
});
