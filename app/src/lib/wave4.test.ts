// The Wave 4 app seams (docs/design/wave4.md §4): chord lenses and the panels a step opens.
import { describe, expect, test } from "bun:test";
import { chordLensAvailability, chordLensPrefs, effectiveChordLenses } from "./lenses.ts";
import { initialPanelsOf, panelUnlocked } from "./panels.ts";

const base = { degrees: true, solfege: true, noteNames: false };

describe("chord lenses", () => {
  test("absent preferences are on; each is gated by its unlock", () => {
    expect(chordLensPrefs(base)).toEqual({ chordSymbols: true, romanNumerals: true });
    expect(chordLensPrefs({ ...base, romanNumerals: false })).toEqual({
      chordSymbols: true,
      romanNumerals: false,
    });
    expect(chordLensAvailability(new Set())).toEqual({ chordSymbols: false, romanNumerals: false });
    expect(chordLensAvailability(new Set(["tb.feature.chord-symbols"]))).toEqual({
      chordSymbols: true,
      romanNumerals: false,
    });
    // Wave 5 (c14): `tb.arp` alone no longer opens the chord-symbol lens.
    expect(chordLensAvailability(new Set(["tb.arp"]))).toEqual({ chordSymbols: false, romanNumerals: false });
    expect(
      effectiveChordLenses(
        { ...base, chordSymbols: false },
        new Set(["tb.feature.chord-symbols", "tb.feature.rn"]),
      ),
    ).toEqual({
      chordSymbols: false,
      romanNumerals: true,
    });
  });
});

describe("initialPanelsOf", () => {
  test("listed panels open, others closed; none listed: the viewer's own choice", () => {
    expect(initialPanelsOf({ initialPanels: ["key", "chords"] })).toEqual({
      key: true,
      circle: false,
      chords: true,
      function: false,
      range: false,
      "chord-tones": false,
      // Wave 5 panels (content-kit WORKBENCH_PANELS): closed unless listed.
      form: false,
      scope: false,
      spectrum: false,
    });
    expect(initialPanelsOf({})).toBeNull();
    expect(initialPanelsOf(null)).toBeNull();
    expect(panelUnlocked("chords", new Set(["tb.feature.rn"]))).toBe(true);
    expect(panelUnlocked("circle", new Set(["tb.feature.rn"]))).toBe(false);
  });
});
