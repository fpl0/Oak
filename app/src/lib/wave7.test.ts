// Wave 7 app seams (docs/design/wave7.md §4): the advanced tracks' lenses open with their lesson or tool, are on by
// default, and are stored with the others.
import { describe, expect, test } from "bun:test";
import { LensPrefsSchema, TRACK_LENS_IDS } from "@oak/api";
import {
  effectiveTrackLenses,
  TRACK_LENS_GATES,
  TRACK_LENS_LABELS,
  trackLensAvailability,
  trackLensPrefs,
} from "./lenses.ts";

const none = new Set<string>();
describe("track lenses", () => {
  test("every lens has a gate, a label and a stored switch (absent = on)", () => {
    for (const id of TRACK_LENS_IDS) {
      expect(TRACK_LENS_GATES[id].lesson).toMatch(/^(J|R|A)\d\.L0\d$/);
      expect(TRACK_LENS_LABELS[id].length).toBeGreaterThan(0);
    }
    const prefs = LensPrefsSchema.parse({ degrees: true, solfege: true, noteNames: true });
    expect(Object.values(trackLensPrefs(prefs)).every(Boolean)).toBe(true);
    expect(
      LensPrefsSchema.safeParse({ degrees: true, solfege: true, noteNames: true, clave: false }).success,
    ).toBe(true);
  });
  test("closed before its lesson or tool; open after either", () => {
    expect(Object.values(trackLensAvailability(none, none)).some(Boolean)).toBe(false);
    expect(trackLensAvailability(new Set(["chord.ext"]), none).tensions).toBe(true);
    expect(trackLensAvailability(none, new Set(["R3.L02"])).clave).toBe(true);
    expect(trackLensAvailability(none, new Set(["R3.L01"])).clave).toBe(false);
    const prefs = LensPrefsSchema.parse({
      degrees: true,
      solfege: true,
      noteNames: true,
      microtiming: false,
    });
    const shown = effectiveTrackLenses(prefs, none, new Set(["R1.L05", "A2.L02"]));
    expect(shown.microtiming).toBe(false);
    expect(shown.density).toBe(true);
  });
});
