// The reference-tone presets: one pitch in one octave, the plans' timing, the cadence voicing.
import { describe, expect, test } from "bun:test";
import { midisOf } from "@oak/grader/testing";
import {
  cadencePlan,
  dronePlan,
  REFERENCE_PRELOAD,
  REFERENCE_TONES,
  referenceValue,
  tonicPlan,
} from "./reference.ts";

describe("reference tones", () => {
  test("the drone is one held tone at the tonic: no octave doubling, no vibrato, no reverb", () => {
    const p = dronePlan(62, 3);
    expect(p.events).toHaveLength(1);
    expect(p.events[0]).toMatchObject({ at: 0, dur: 3, value: { s: "triangle", note: 62 } });
    expect(p.durationSec).toBeCloseTo(3 + (REFERENCE_TONES.drone.release as number), 6);
    for (const k of ["vib", "vibmod", "room", "delay", "lpenv", "fm"])
      expect(REFERENCE_TONES.drone[k]).toBeUndefined();
    expect(p.preload).toEqual([]);
  });

  test("a reference pitch is rounded and kept within C2–C6", () => {
    expect(referenceValue("drone", 60.4).note).toBe(60);
    expect(referenceValue("tonic", 20).note).toBe(36);
    expect(referenceValue("tonic", 99).note).toBe(84);
  });

  test("the tonic plays once on the piano, preloaded", () => {
    const p = tonicPlan(57);
    expect(p.events.map((e) => e.value.note)).toEqual([57]);
    expect(p.events[0]?.value.s).toBe("piano");
    expect(p.preload).toEqual([...REFERENCE_PRELOAD]);
  });

  test("the cadence is I–IV–V–I with its bass, one beat each, the last held two beats", () => {
    const p = cadencePlan(60, { bpm: 60 });
    const at = (t: number) => p.events.filter((e) => e.at === t).map((e) => e.value.note);
    expect(at(0)).toEqual([48, 60, 64, 67]);
    expect(at(1)).toEqual([53, 60, 65, 69]);
    expect(at(2)).toEqual([55, 59, 62, 67]);
    expect(at(3)).toEqual([48, 60, 64, 67]);
    expect(p.events.at(-1)?.dur).toBeCloseTo(1.9, 6);
    expect(p.durationSec).toBeCloseTo(5.2, 6);
  });

  test("minor: iv and a major V (the leading tone); then a drone on the tonic", () => {
    const p = cadencePlan(57, { mode: "minor", bpm: 120, thenDrone: 2 });
    const notes = p.events.map((e) => e.value.note as number);
    expect(notes).toContain(56); // G#, the leading tone of A minor
    expect(notes).toContain(60); // C, the minor third
    const last = p.events.at(-1);
    expect(last?.value).toMatchObject({ s: "triangle", note: 57 });
    expect(p.durationSec).toBeCloseTo((last?.at as number) + 2 + 0.4, 6);
  });

  test("the cadence's MIDI numbers are the named chords I (C3 C4 E4 G4), IV (F3 C4 F4 A4), V (G3 B3 D4 G4)", async () => {
    const named = await midisOf('note("<[c3,c4,e4,g4] [f3,c4,f4,a4] [g3,b3,d4,g4] [c3,c4,e4,g4]>")', 4);
    const plan = cadencePlan(60).events.map((e) => e.value.note as number);
    const sorted = (xs: readonly (number | null)[]) => xs.map(Number).sort((a, b) => a - b);
    expect(sorted(plan)).toEqual(sorted(named));
  });
});
