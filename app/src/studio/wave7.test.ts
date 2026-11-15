// Wave 7 in the Studio (docs/design/wave7.md §4.2): the odd meters once R2.L01 opens their tempo lines, and the
// advanced tracks' lenses as hints (the lesson that opens each) or tips (how to switch it on), never a block.
import { describe, expect, test } from "bun:test";
import { TRACK_LENS_GATES } from "../lib/lenses.ts";
import { WORKBENCH_LOOP_SHORTCUTS } from "../workbench/shortcuts.ts";
import { TRACK_SWITCHES } from "../workbench/track-switches.ts";
import {
  meterLabel,
  NO_TRACK_FACTS,
  sameTrackFacts,
  studioMeters,
  trackFactsOf,
  trackLensHints,
  trackLensTips,
} from "./model.ts";

describe("the Studio's meters", () => {
  test("the odd meters join once tb.meter.odd is unlocked (R2.L01), each named with its grouping", () => {
    expect(studioMeters(new Set(["tb.meter.compound"]))).toEqual(["4/4", "3/4", "2/4", "6/8", "12/8"]);
    expect(studioMeters(new Set(["tb.meter.compound", "tb.meter.odd"]))).toEqual([
      "4/4",
      "3/4",
      "2/4",
      "6/8",
      "12/8",
      "5/4",
      "5/8",
      "7/8",
      "9/8i",
    ]);
    // A sketch already in 7/8 (from a lesson) keeps its meter selectable before the unlock.
    expect(studioMeters(new Set(), "7/8")).toEqual(["4/4", "3/4", "2/4", "6/8", "7/8"]);
    expect(["5/4", "7/8", "9/8i", "4/4"].map((m) => meterLabel(m as never))).toEqual([
      "5/4 (3+2)",
      "7/8 (2+2+3)",
      "9/8 (2+2+2+3)",
      "4/4",
    ]);
  });
});

describe("the track lenses in a sketch: hints before their lesson, tips after", () => {
  const facts = { ...NO_TRACK_FACTS, tensions: true, clave: true, density: true };
  const closed = { ...NO_TRACK_FACTS };
  test("a lens the sketch could use and has not opened is a hint naming its lesson", () => {
    const hints = trackLensHints(facts, closed, (id) => `${TRACK_LENS_GATES[id].lesson} · lesson`);
    expect(hints.map((h) => `${h.what} — ${h.at}`)).toEqual([
      "Tensions: the 9, 11 and 13 your tune plays over each chord — J2.L03 · lesson",
      "The clave's two-bar grid behind the roll, its direction named — R3.L02 · lesson",
      "The density of each section — A2.L02 · lesson",
    ]);
    expect(trackLensTips(facts, closed)).toEqual([]);
  });
  test("an opened lens is a tip; one the sketch has nothing for says nothing", () => {
    const open = { ...NO_TRACK_FACTS, tensions: true, voicings: true, density: true };
    expect(trackLensTips(facts, open)).toEqual([
      "Shift+X names the tensions of your tune over each chord.",
      "Shift+D shows how busy each section is.",
    ]);
    expect(trackLensHints(facts, open, () => "x").map((h) => h.id)).toEqual(["lens.clave"]);
  });
  test("facts from an analysed model; equal facts compare equal", () => {
    expect(trackFactsOf(null)).toEqual(NO_TRACK_FACTS);
    const f = trackFactsOf({
      tensions: new Map([["a", {}]]),
      voicings: [],
      regions: [
        { scale: "Dorian", jazz: "D–7" },
        { scale: "Mixolydian", jazz: "G7" },
      ],
      clave: null,
      poly: { kind: "polymeter" },
      micro: { marks: new Map() },
      registers: { parts: [{}, {}], clashes: [{}] },
      density: null,
    });
    expect(f).toEqual({
      tensions: true,
      voicings: false,
      chordScales: true,
      clave: false,
      polyLanes: true,
      microtiming: false,
      registers: true,
      density: false,
    });
    expect(sameTrackFacts(f, { ...f })).toBe(true);
    // One chord has no changes to read scales over; parts with room need no register hint.
    const one = trackFactsOf({
      tensions: new Map(),
      voicings: [],
      regions: [{ scale: "Ionian (major)", jazz: "C" }],
      clave: null,
      poly: null,
      micro: { marks: new Map() },
      registers: { parts: [{}, {}], clashes: [] },
      density: null,
    });
    expect(one.chordScales).toBe(false);
    expect(one.registers).toBe(false);
    expect(sameTrackFacts(f, NO_TRACK_FACTS)).toBe(false);
  });
});

test("the track lenses' keys are listed in the shortcut sheet and collide with no other Workbench key", () => {
  const keyed = TRACK_SWITCHES.filter((s) => s.keys !== "").map((s) => s.keys);
  expect(keyed).toEqual(["Shift+X", "Shift+Q", "Shift+D"]);
  const all = WORKBENCH_LOOP_SHORTCUTS.map(([k]) => k);
  for (const k of keyed) expect(all.filter((x) => x === k)).toHaveLength(1);
  expect(TRACK_SWITCHES.map((s) => s.id).sort()).toEqual(Object.keys(TRACK_LENS_GATES).sort());
});
