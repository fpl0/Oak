// The Wave 6 answer logic (docs/design/wave6.md §11): the chromatic degree pad, step grids of 6 and 24 and compound
// meters, the numeral palette in a colour mode and its "V7 of …" pick, per-slot keys, the form map, the scale
// builder that starts from a scale, forgiving seventh-chord names, the lines that say what a pick means (mode,
// pivot chord, key change, guide tones), tap grids in any meter, and what a disabled Check says. Every musical
// claim is checked against @oak/theory, and the code a grid plays against headless Strudel.
import { describe, expect, test } from "bun:test";
import type { Degree, KeySpec } from "@oak/api";
import { KEY_CHANGE_OPTIONS, MODE_OPTIONS } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { chordOfRoman, METERS, parseRN, toLeadSheet } from "@oak/theory";
import { NEUTRAL_PROFILE } from "./env.tsx";
import {
  guideToneFacts,
  isBarChoice,
  isChordChoice,
  isModeChoice,
  keyChangeFact,
  modeFact,
  pivotFact,
  scaleMove,
  scaleNameOf,
} from "./facts.ts";
import {
  clearSection,
  EMPTY_FORM_MAP,
  formMapAnswer,
  formMapComplete,
  formMapMarks,
  formMapMarksFromSlots,
  formMapOf,
  formMapSections,
  isCut,
  labelSection,
  mapBlocks,
  mapLetters,
  mapMissing,
  mapOptions,
  mapPerRow,
  mapSegments,
  mapSpan,
  mapSummary,
  sectionAtBar,
  toggleCut,
} from "./form-map.ts";
import { chordParts, composeChord } from "./harmony.ts";
import {
  appliedKindOf,
  appliedRn,
  appliedTargetsOf,
  applyOf,
  gridLayout,
  gridToCode,
  isModalKey,
  padRows,
  rnForKey,
  rnModeOf,
  rnPalette,
  splitApplied,
} from "./keys.ts";
import { chordTyped, readsAs } from "./normalize.ts";
import { emptyValue, incompleteReason, isComplete, responseOf, scaleStart } from "./response.ts";
import { padGrid, tapReport, targetPlace, targetSeconds } from "./tap.ts";
import type { AnswerSpecOf } from "./types.ts";
import { keyChangeLine, stripPerRow } from "./widgets/BarStrip.tsx";

const C: KeySpec = { tonic: "C", mode: "major" };
const G: KeySpec = { tonic: "G", mode: "major" };
const A_MINOR: KeySpec = { tonic: "A", mode: "minor" };

describe("the chromatic degree pad (U15.L01)", () => {
  test("altered degrees stand above and between their neighbours, as black keys do", () => {
    const rows = padRows(["4", "#4", "5", "6", "b7", "7", "1"] as Degree[]);
    expect(rows?.filter((c) => c.row === "lower").map((c) => `${c.degree}@${c.col}`)).toEqual([
      "1@0",
      "4@2",
      "5@4",
      "6@6",
      "7@8",
    ]);
    // ♯4 between 4 and 5; ♭7 between 6 and 7.
    expect(rows?.filter((c) => c.row === "upper").map((c) => `${c.degree}@${c.col}`)).toEqual([
      "#4@3",
      "b7@7",
    ]);
  });
  test("the pads of U10 and U11 stay one row: the minors, the blues, and a pad without altered twins", () => {
    expect(padRows(["1", "2", "b3", "4", "5", "b6", "b7"] as Degree[])).toBeNull();
    expect(padRows(["1", "2", "3", "4", "5", "6", "7"] as Degree[])).toBeNull();
    // Melodic minor's pad (6 and 7 beside ♭6 and ♭7) and the blues pad (5 beside ♭5): flats only, as before.
    expect(padRows(["1", "2", "b3", "4", "5", "b6", "6", "b7", "7"] as Degree[])).toBeNull();
    expect(padRows(["1", "b3", "4", "b5", "5", "b7"] as Degree[])).toBeNull();
    // The whole major scale with te is chromatic.
    expect(padRows(["1", "2", "3", "4", "5", "6", "b7", "7"] as Degree[])).not.toBeNull();
    // Two names on one place (♯1 and ♭2) do not fit between the same two degrees.
    expect(padRows(["1", "#1", "b2", "2"] as Degree[])).toBeNull();
  });
  test("the full chromatic pad rising: every sharp after its degree", () => {
    const rows = padRows(["1", "#1", "2", "#2", "3", "4", "#4", "5", "#5", "6", "#6", "7"] as Degree[]);
    expect(rows?.filter((c) => c.row === "upper").map((c) => c.col)).toEqual([1, 3, 7, 9, 11]);
  });
});

describe("step grids (grid.steps, meter.compound)", () => {
  test("six steps are 6/8: two beats of three, counted la li", () => {
    const g = gridLayout(6, 1, { meter: METERS["6/8"] });
    expect([g.beats, g.per, g.compound]).toEqual([2, 3, true]);
    expect(g.counts).toEqual(["1", "la", "li", "2", "la", "li"]);
    // Without a meter six steps are still read as 6/8.
    expect(gridLayout(6, 1).counts).toEqual(["1", "la", "li", "2", "la", "li"]);
    // With a beat count (3/4 in eighths) they are not.
    expect(gridLayout(6, 1, { beatsPerBar: 3 }).counts).toEqual(["1", "&", "2", "&", "3", "&"]);
  });
  test("twelve steps: 12/8 is four dotted-quarter beats; in 4/4 they are triplets when the host says so", () => {
    expect(gridLayout(12, 1, { meter: METERS["12/8"] }).counts.slice(0, 7)).toEqual([
      "1",
      "la",
      "li",
      "2",
      "la",
      "li",
      "3",
    ]);
    expect(gridLayout(12, 1, { meter: METERS["4/4"], triplets: true }).counts.slice(0, 4)).toEqual([
      "1",
      "trip",
      "let",
      "2",
    ]);
    // As before Wave 6 when nothing is said.
    expect(gridLayout(12, 1).counts.slice(0, 4)).toEqual(["1", "&", "a", "2"]);
  });
  test("24 steps: sixteenth-note triplets in 4/4, the sixteenths of 12/8", () => {
    const g = gridLayout(24, 1, { meter: METERS["4/4"] });
    expect([g.beats, g.per]).toEqual([4, 6]);
    expect(g.counts.slice(0, 7)).toEqual(["1", "trip", "let", "&", "trip", "let", "2"]);
    expect(gridLayout(24, 1, { meter: METERS["12/8"] }).counts.slice(0, 7)).toEqual([
      "1",
      "·",
      "la",
      "·",
      "li",
      "·",
      "2",
    ]);
  });
  test("a 6/8 grid plays as 6/8: the tempo counts the dotted quarter", async () => {
    const cells = [[true, false, false, true, false, false]];
    const code = gridToCode(["hit"], cells, { stepsPerBar: 6, bars: 1, bpm: 60, beatsPerBar: 2 });
    expect(code).toBe('setcpm(60/2)\n\nperc: s("rim ~ ~ rim ~ ~")');
    const r = await evalHeadless(code, 1);
    // One bar of 6/8 lasts two dotted-quarter beats at 60: two seconds.
    expect(r.cps).toBeCloseTo(0.5, 10);
    expect(r.events.map((e) => e.onset)).toEqual([0, 0.5]);
  });
});

describe("the numeral palette (U12, U14, U15, U16)", () => {
  const displays = (allow: Parameters<typeof rnPalette>[0], key: KeySpec) =>
    rnPalette(allow, rnModeOf(key), key)
      .flatMap((g) => g.buttons)
      .map((b) => b.display);
  test("a colour mode offers its own chords: ♭VII, IV, II, ♭II", () => {
    expect(displays(["triads"], { tonic: "G", mode: "mixolydian" })).toContain("♭VII");
    expect(displays(["triads"], { tonic: "D", mode: "dorian" })).toEqual(
      expect.arrayContaining(["i", "IV", "VII"]),
    );
    expect(displays(["triads"], { tonic: "F", mode: "lydian" })).toContain("II");
    expect(displays(["triads"], { tonic: "E", mode: "phrygian" })).toContain("♭II");
    expect(isModalKey({ tonic: "G", mode: "mixolydian" })).toBe(true);
    expect(isModalKey(C)).toBe(false);
  });
  test("its digits pick the mode's chord on that degree, and every one names a real chord", () => {
    const mixo: KeySpec = { tonic: "G", mode: "mixolydian" };
    const allow = ["triads", "sevenths"] as const;
    expect(rnForKey(7, { allow, mode: rnModeOf(mixo), key: mixo })).toBe("bVII");
    expect(rnForKey(5, { allow, mode: rnModeOf(mixo), key: mixo })).toBe("v");
    expect(rnForKey(1, { allow, shift: true, mode: rnModeOf(mixo), key: mixo })).toBe("I7");
    const phr: KeySpec = { tonic: "E", mode: "phrygian" };
    expect(rnForKey(2, { allow, mode: rnModeOf(phr), key: phr })).toBe("bII");
    for (const key of [
      mixo,
      phr,
      { tonic: "D", mode: "dorian" },
      { tonic: "F", mode: "lydian" },
    ] as KeySpec[])
      for (const b of rnPalette(["triads", "sevenths"], rnModeOf(key), key).flatMap((g) => g.buttons))
        expect(`${key.mode} ${b.rn}: ${parseRN(b.rn, key) !== null}`).toBe(`${key.mode} ${b.rn}: true`);
    // G Mixolydian's ♭VII is F; D Dorian's IV is G; F Lydian's II is G; E Phrygian's ♭II is F.
    const sym = (rn: string, key: KeySpec) => toLeadSheet(chordOfRoman(rn, key) as never);
    expect([
      sym("bVII", mixo),
      sym("IV", { tonic: "D", mode: "dorian" }),
      sym("II", { tonic: "F", mode: "lydian" }),
      sym("bII", phr),
    ]).toEqual(["F", "G", "G", "F"]);
  });
  test("sevenths in major and minor are the key's own (U12.L04, L05)", () => {
    expect(displays(["sevenths"], C)).toEqual(["Imaj7", "vi7", "iii7", "IVmaj7", "ii7", "V7", "viiø7"]);
    expect(displays(["sevenths"], A_MINOR)).toEqual(expect.arrayContaining(["i7", "iv7", "iiø7", "V7"]));
  });
  test('applied chords are a second pick: the kind, then "of" its target', () => {
    expect(appliedTargetsOf(C).map((t) => `${t.degree}:${t.rn}`)).toEqual([
      "2:ii",
      "3:iii",
      "4:IV",
      "5:V",
      "6:vi",
    ]);
    expect(appliedTargetsOf(A_MINOR).map((t) => t.rn)).toEqual(["III", "iv", "V", "VI", "VII"]);
    expect(appliedRn("V7", "V")).toBe("V7/V");
    // The palette group stays, without a wall of buttons.
    expect(rnPalette(["triads", "secondary"]).find((g) => g.id === "secondary")?.buttons).toEqual([]);
    // "/ 5" after V7 makes V7/V; after any other chord, or nothing, the dominant seventh of the target.
    expect(applyOf("V7", 5, C)).toBe("V7/V");
    expect(applyOf("V", 6, C)).toBe("V/vi");
    expect(applyOf("viio7", 2, C)).toBe("viio7/ii");
    expect(applyOf("V7/V", 2, C)).toBe("V7/ii");
    expect(applyOf("I", 2, C)).toBe("V7/ii");
    expect(applyOf("", 4, C)).toBe("V7/IV");
    // With the picker on another kind, that kind is what an empty slot gets.
    expect(applyOf("", 5, C, "viio7")).toBe("viio7/V");
    // Nothing is applied to I or to vii°.
    expect(applyOf("V7", 1, C)).toBeNull();
    expect(applyOf("V7", 7, C)).toBeNull();
    expect(appliedKindOf("V7/V")).toBe("V7");
    expect(appliedKindOf("V65/V")).toBe("V7");
    expect(appliedKindOf("IV")).toBeNull();
    expect(splitApplied("viio7/ii")).toEqual({ head: "viio7", target: "ii" });
    // What they name in C: D7 → G, E7 → Am, A7 → Dm, C7 → F, and F♯°7 → G.
    const sym = (rn: string) => toLeadSheet(chordOfRoman(rn, C) as never);
    expect(["V7/V", "V7/vi", "V7/ii", "V7/IV", "viio7/V"].map(sym)).toEqual(["D7", "E7", "A7", "C7", "F♯°7"]);
  });
  test("borrowed chords of U16: iv, ♭VI, ♭VII, ♭III in major; the Picardy I and the Dorian IV in minor", () => {
    expect(displays(["triads", "borrowed"], C)).toEqual(
      expect.arrayContaining(["iv", "♭VI", "♭VII", "♭III"]),
    );
    expect(displays(["triads", "borrowed"], A_MINOR)).toEqual(expect.arrayContaining(["I", "IV"]));
  });
  test("a pivot chord named in two keys: each slot is complete, labelled, and missing slots are named", () => {
    const spec: AnswerSpecOf<"rn-palette"> = {
      ui: "rn-palette",
      slots: 2,
      allow: ["triads"],
      labels: ["In C major", "In G major"],
      slotKeys: [C, G],
    };
    expect(emptyValue(spec)).toEqual(["", ""]);
    expect(isComplete(spec, ["vi", ""])).toBe(false);
    expect(incompleteReason(spec, ["vi", ""])).toBe("In G major is still empty.");
    expect(responseOf(spec, ["vi", "ii"])).toEqual({ answer: { rn: ["vi", "ii"] } });
    // Am is vi in C and ii in G: the same chord.
    expect(toLeadSheet(chordOfRoman("vi", C) as never)).toBe("Am");
    expect(toLeadSheet(chordOfRoman("ii", G) as never)).toBe("Am");
  });
});

describe("the form map (form.map; CF-T.S1, ladder L8)", () => {
  const spec: AnswerSpecOf<"form"> = {
    ui: "form",
    sections: 4,
    vocabulary: "letters",
    input: "map",
    bars: 32,
    sectionBars: [8, 8, 8, 8],
  };
  test("it starts as one unnamed section; cuts and joins keep bar order", () => {
    expect(emptyValue(spec)).toEqual(["1:"]);
    expect([...EMPTY_FORM_MAP]).toEqual(["1:"]);
    let v = toggleCut(emptyValue(spec), 17, 32);
    v = toggleCut(v, 9, 32);
    v = toggleCut(v, 25, 32);
    expect(v).toEqual(["1:", "9:", "17:", "25:"]);
    expect(isCut(v, 9)).toBe(true);
    // Again on the same bar joins it; bar 1 and bars outside the tune cannot be cut.
    expect(toggleCut(v, 9, 32)).toEqual(["1:", "17:", "25:"]);
    expect(toggleCut(v, 1, 32)).toEqual(v);
    expect(toggleCut(v, 33, 32)).toEqual(v);
    expect(mapSummary(v, 32)).toBe("4 sections: 8 + 8 + 8 + 8 bars");
    expect(mapSummary(["1:"], 32)).toBe("One section of 32 bars so far. Cut it where a new section begins.");
  });
  test("naming walks the sections; the answer is labels and first bars", () => {
    let v = ["1:", "9:", "17:", "25:"];
    let at = 0;
    for (const l of ["A", "A", "B", "A"]) {
      const r = labelSection(v, at, l, 32);
      v = r.value;
      at = r.next ?? at;
    }
    expect(v).toEqual(["1:A", "9:A", "17:B", "25:A"]);
    expect(mapLetters(v)).toBe("A A B A");
    expect(formMapComplete(v, 32)).toBe(true);
    expect(isComplete(spec, v)).toBe(true);
    expect(responseOf(spec, v)).toEqual({ answer: { sections: ["A", "A", "B", "A"], bars: [1, 9, 17, 25] } });
    expect(formMapAnswer(v)).toEqual({ sections: ["A", "A", "B", "A"], bars: [1, 9, 17, 25] });
    expect(formMapOf(["A", "A", "B", "A"], [1, 9, 17, 25])).toEqual(v);
    // An unnamed section is not an answer yet, and Check says which.
    const half = ["1:A", "9:", "17:B"];
    expect(isComplete(spec, half)).toBe(false);
    expect(responseOf(spec, half)).toEqual({ skipped: true });
    expect(incompleteReason(spec, half)).toBe("Name the section at bars 9–16.");
    expect(mapMissing(v, 32)).toBeNull();
    expect(mapLetters(half)).toBe("A · B");
  });
  test("Backspace clears a name, then joins an unnamed section to the one before", () => {
    const v = ["1:A", "9:A", "17:B", "25:A"];
    expect(clearSection(v, 2)).toEqual({ value: ["1:A", "9:A", "17:", "25:A"], at: 2 });
    expect(clearSection(["1:A", "9:A", "17:", "25:A"], 2)).toEqual({ value: ["1:A", "9:A", "25:A"], at: 1 });
    expect(clearSection(["1:"], 0)).toEqual({ value: ["1:"], at: 0 });
  });
  test("the blocks and their pieces in rows of sixteen bars", () => {
    const v = ["1:A", "9:A", "17:B", "25:A"];
    const blocks = mapBlocks(v, 32);
    expect(blocks.map((b) => `${mapSpan(b)} ${b.label}`)).toEqual([
      "Bars 1–8 A",
      "Bars 9–16 A",
      "Bars 17–24 B",
      "Bars 25–32 A",
    ]);
    expect(mapPerRow(32)).toBe(16);
    expect(mapPerRow(12)).toBe(12);
    expect(mapPerRow(24)).toBe(8);
    expect(mapSegments(blocks, 16).map((s) => `${s.index}:r${s.row}c${s.col}+${s.span}`)).toEqual([
      "0:r0c0+8",
      "1:r0c8+8",
      "2:r1c0+8",
      "3:r1c8+8",
    ]);
    // A section that crosses the row break is drawn in two pieces; the name is printed on the first.
    const crossing = mapSegments(mapBlocks(["1:A", "13:B"], 32), 16);
    expect(crossing.map((s) => `${s.index}:r${s.row}c${s.col}+${s.span}${s.first ? "*" : ""}`)).toEqual([
      "0:r0c0+12*",
      "1:r0c12+4*",
      "1:r1c0+16",
    ]);
    expect(sectionAtBar(formMapSections(v), 20)).toBe(2);
    expect(mapSpan({ startBar: 9, endBar: 9 })).toBe("Bar 9");
  });
  test("the letters offered never say how many different sections the tune has", () => {
    expect(mapOptions(spec, ["1:"]).map((o) => o.id)).toEqual(["A", "B", "C", "D"]);
    expect(mapOptions(spec, ["1:A", "9:B", "17:C", "25:D"]).map((o) => o.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
    expect(
      mapOptions({ vocabulary: ["verse", "chorus", "bridge"] }, ["1:"]).map((o) => `${o.key} ${o.label}`),
    ).toEqual(["1 Verse", "2 Chorus", "3 Bridge"]);
  });
  test("marks follow the learner's own sections, from the grader's result or its per-section credit", () => {
    // The grader's rows for a map without the cut at bar 9 (credit 1 0 1 1 for the key's four sections).
    const missing = formMapMarksFromSlots(["1:A", "17:B", "25:A"], spec, [1, 0, 1, 1]);
    expect(missing).toEqual([
      { part: 0, ok: false, note: "more than one section in here" },
      { part: 1, ok: true },
      { part: 2, ok: true },
    ]);
    // An extra cut at bar 5, and a wrong label on the second section.
    expect(
      formMapMarks(["1:A", "5:A", "9:B", "17:B", "25:A"], {
        sections: [
          { expected: { bar: 1 }, ok: true },
          { expected: { bar: 9 }, ok: false },
          { expected: { bar: 17 }, ok: true },
          { expected: { bar: 25 }, ok: true },
        ],
        extra: [5],
      }).map((m) => `${m.part}:${m.ok ? "ok" : m.note}`),
    ).toEqual(["0:ok", "1:nothing new starts here", "2:not this label", "3:ok", "4:ok"]);
    expect(formMapMarksFromSlots(["1:A", "9:A", "17:B", "25:A"], spec, [1, 1, 1, 1]).every((m) => m.ok)).toBe(
      true,
    );
  });
  test("a stored value is read safely: junk dropped, bar 1 always there", () => {
    expect(formMapSections(["9:A", "x", "40:B", "9:C"], 32)).toEqual([
      { bar: 1, label: "" },
      { bar: 9, label: "C" },
    ]);
  });
});

describe("the scale builder that starts from a scale (scale-builder.from, U14)", () => {
  test("it opens holding the scale, as degrees or as keys from the tonic", () => {
    const pad: AnswerSpecOf<"scale-builder"> = {
      ui: "scale-builder",
      tonic: "G",
      input: "degrees",
      from: "major",
    };
    expect(emptyValue(pad)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    const keys: AnswerSpecOf<"scale-builder"> = {
      ui: "scale-builder",
      tonic: "D",
      input: "keyboard",
      from: "minor",
    };
    // D natural minor from D4: D E F G A B♭ C.
    expect(scaleStart(keys)).toEqual([62, 64, 65, 67, 69, 70, 72]);
    expect(emptyValue({ ui: "scale-builder", tonic: "G", input: "degrees" })).toEqual([]);
  });
  test("the one note that moved, and which way", () => {
    const major = ["1", "2", "3", "4", "5", "6", "7"];
    const minor = ["1", "2", "b3", "4", "5", "b6", "b7"];
    expect(scaleMove(major, ["1", "2", "3", "4", "5", "6", "b7"])?.text).toBe("7 lowered a half step: ♭7");
    expect(scaleMove(major, ["1", "2", "3", "#4", "5", "6", "7"])?.text).toBe("4 raised a half step: ♯4");
    expect(scaleMove(minor, ["1", "2", "b3", "4", "5", "6", "b7"])?.text).toBe("♭6 raised a half step: ♮6");
    expect(scaleMove(minor, ["1", "b2", "b3", "4", "5", "b6", "b7"])?.text).toBe("2 lowered a half step: ♭2");
    // Nothing moved, or more than one note did.
    expect(scaleMove(major, major)).toBeNull();
    expect(scaleMove(major, ["1", "2", "b3", "4", "5", "6", "b7"])).toBeNull();
    expect(scaleNameOf(["1", "2", "3", "4", "5", "6", "b7"])).toBe("Mixolydian");
    expect(scaleNameOf(["1", "2", "b3", "4", "5", "6", "b7"])).toBe("Dorian");
    expect(scaleNameOf(["1", "3", "5"])).toBeNull();
  });
});

describe("seventh-chord names (U12)", () => {
  test("forgiving entry, shown back as the lead-sheet symbol", () => {
    const shown = (t: string) => {
      const r = readsAs("chord", t);
      return r.state === "ok" ? r.display : null;
    };
    for (const t of ["Cmaj7", "C^7", "CM7", "CΔ", "CΔ7", "Cma7"])
      expect(`${t} ${shown(t)}`).toBe(`${t} Cmaj7`);
    for (const t of ["Cm7b5", "Cø", "Cø7"]) expect(`${t} ${shown(t)}`).toBe(`${t} Cm7♭5`);
    for (const t of ["Cdim7", "Co7", "C°7"]) expect(`${t} ${shown(t)}`).toBe(`${t} C°7`);
    expect(shown("Cm7")).toBe("Cm7");
    expect(shown("C-7")).toBe("Cm7");
    expect(shown("F#7")).toBe("F♯7");
    expect(shown("Bbmaj7/D")).toBe("B♭maj7/D");
  });
  test("the triangle is a major seventh in the preview, the picker and the response alike", () => {
    expect(chordTyped("CΔ")).toBe("C^7");
    expect(chordParts("CΔ")?.quality).toBe("maj7");
    expect(responseOf({ ui: "text", normalize: "chord" }, " EbΔ ")).toEqual({ answer: { text: ["Eb^7"] } });
    // Other text kinds go out as typed.
    expect(responseOf({ ui: "text", normalize: "note" }, " Eb ")).toEqual({ answer: { text: ["Eb"] } });
    expect(composeChord({ letter: "B", acc: 0, quality: "m7b5", bass: null })).toBe("Bm7♭5");
    expect(composeChord({ letter: "C", acc: 1, quality: "dim7", bass: null })).toBe("C♯°7");
  });
});

describe("what a pick means, said after the check", () => {
  test("which mode: the one changed note, in the key when it is known", () => {
    expect(isModeChoice(MODE_OPTIONS)).toBe(true);
    expect(isModeChoice(KEY_CHANGE_OPTIONS)).toBe(false);
    expect(modeFact("mixolydian", "G")).toBe(
      "Mixolydian is major with one note changed: 7 becomes ♭7. From G: F♯ becomes F.",
    );
    expect(modeFact("dorian", "D")).toBe(
      "Dorian is natural minor with one note changed: ♭6 becomes ♮6. From D: B♭ becomes B.",
    );
    expect(modeFact("lydian")).toBe("Lydian is major with one note changed: 4 becomes ♯4.");
    expect(modeFact("phrygian", "E")).toContain("2 becomes ♭2. From E: F♯ becomes F.");
    expect(modeFact("major")).toBe("Major: the scale itself, nothing changed.");
    expect(modeFact("blues")).toBeNull();
  });
  test("a key change: how far, in U17's words", () => {
    expect(keyChangeFact(C, { tonic: "D", mode: "major" })).toBe("C major to D major: up a whole step.");
    expect(keyChangeFact(C, { tonic: "Db", mode: "major" })).toBe("C major to D♭ major: up a half step.");
    expect(keyChangeFact(C, G)).toBe("C major to G major: the key of its V, one sharp further on.");
    expect(keyChangeFact(C, A_MINOR)).toContain("its relative key");
  });
  test("the pivot chord: one chord, two names", () => {
    const o = (id: string) => ({ id, label: id });
    expect(isChordChoice([o("Am"), o("D7"), o("G7")])).toBe(true);
    expect(isChordChoice(MODE_OPTIONS)).toBe(false);
    expect(pivotFact(o("Am"), C, G)).toBe(
      "Am is vi in C major and ii in G major: both keys own it, so it can be the pivot.",
    );
    expect(pivotFact(o("D7"), C, G)).toBe("D7 belongs to G major only: it is its V7.");
    expect(pivotFact(o("F"), C, G)).toBe("F belongs to C major only: it is its IV.");
    expect(pivotFact(o("Bb"), C, G)).toBe("B♭ belongs to neither key.");
  });
  test("a bar timeline: bars and none are a place in the music", () => {
    const opts = ["none", "2", "3", "4", "5", "6", "7", "8"].map((id) => ({
      id,
      label: id === "none" ? "No key change" : `Bar ${id}`,
    }));
    expect(isBarChoice(opts)).toBe(true);
    expect(isBarChoice(KEY_CHANGE_OPTIONS)).toBe(false);
    // A choice among plain numbers (which degree, how many beats) is not a timeline.
    expect(isBarChoice(["2", "5", "7"].map((id) => ({ id, label: id })))).toBe(false);
    expect(isBarChoice(["3", "4"].map((id) => ({ id, label: `${id} beats` })))).toBe(false);
    expect(stripPerRow(8)).toBe(8);
    expect(stripPerRow(12)).toBe(12);
    expect(stripPerRow(16)).toBe(8);
    const D: KeySpec = { tonic: "D", mode: "major" };
    expect(keyChangeLine({ from: C, to: D, bar: null, known: false })).toBe(
      "It starts in C major. Where does the new key begin?",
    );
    // Before a check the line restates the pick and never names the new key.
    expect(keyChangeLine({ from: C, to: D, bar: 5, known: false })).toBe(
      "C major until bar 4, a new key from bar 5.",
    );
    expect(keyChangeLine({ from: C, to: D, bar: 5, known: true })).toBe(
      "From bar 5: C major to D major: up a whole step.",
    );
    expect(keyChangeLine({ from: C, bar: "none", known: false })).toBe("C major all the way: no key change.");
  });
  test("the guide-tone pick: the 3rd and the 7th of the chord", () => {
    // G7: B is the 3rd, F the 7th; D is the 5th; A is not in it.
    expect(guideToneFacts([71, 65, 62, 69], "G7")).toEqual([
      { midi: 71, guide: true, text: "B, the 3rd of G7" },
      { midi: 65, guide: true, text: "F, the 7th of G7" },
      { midi: 62, guide: false, text: "D, the 5th of G7: not a guide tone" },
      { midi: 69, guide: false, text: "A is not in G7" },
    ]);
    // Dm7: F and C; Cmaj7 (code spelling C^7): E and B.
    expect(guideToneFacts([65, 72], "Dm7")?.map((g) => g.text)).toEqual([
      "F, the 3rd of Dm7",
      "C, the 7th of Dm7",
    ]);
    expect(guideToneFacts([64, 71], "C^7")?.every((g) => g.guide)).toBe(true);
    expect(guideToneFacts([60], "not a chord")).toBeNull();
  });
});

describe("tap grids in any meter (U13)", () => {
  test("6/8 is two dotted-quarter beats in three; a triplet grid in 4/4 counts trip let", () => {
    expect(padGrid({ meter: METERS["6/8"] })).toEqual({
      beatsPerBar: 2,
      stepsPerBeat: 3,
      counts: ["1", "la", "li", "2", "la", "li"],
      compound: true,
    });
    expect(padGrid({ stepsPerBeat: 3 }).counts.slice(0, 4)).toEqual(["1", "trip", "let", "2"]);
    expect(padGrid({}).counts.slice(0, 5)).toEqual(["1", "e", "&", "a", "2"]);
    expect(padGrid({ meter: METERS["12/8"] }).beatsPerBar).toBe(4);
  });
  test("a target is named as it is counted", () => {
    expect(targetPlace(0.375, METERS["4/4"], 1)).toBe("2 &");
    expect(targetPlace(1 / 12, METERS["4/4"], 1)).toBe("1 trip");
    expect(targetPlace(2 / 3, METERS["6/8"], 1)).toBe("2 la");
    expect(targetPlace(1.5, METERS["4/4"], 2)).toBe("bar 2, 3");
  });
  test("a missed syncopation is named; the grading is gradeTaps", () => {
    // The gallery's push: 1, the and of 2, 4 at 90 BPM.
    const cps = 90 / 60 / 4;
    const onsets = [0, 0.375, 0.75];
    const targets = targetSeconds(onsets, 10, cps);
    const places = onsets.map((o) => targetPlace(o, METERS["4/4"], 1));
    const right = tapReport(targets, targets, NEUTRAL_PROFILE, { word: "hit", places });
    expect(right.feedback.state).toBe("correct");
    expect(right.feedback.state === "correct" && right.feedback.marks?.[1]?.note).toBe("2 &: on the beat");
    // Tapping beat 2 on the beat instead of its "and" misses the push.
    const square = tapReport(
      [targets[0] as number, 10 + 0.25 / cps, targets[2] as number],
      targets,
      NEUTRAL_PROFILE,
      {
        word: "hit",
        places,
      },
    );
    expect(square.feedback.state).toBe("wrong");
    expect(square.feedback.state === "wrong" && square.feedback.message).toContain("2 of 3 hits matched");
    expect(square.feedback.state === "wrong" && square.feedback.message).toContain("Missed: 2 &.");
    expect(square.feedback.state === "wrong" && square.feedback.marks?.[1]).toEqual({
      part: 1,
      ok: false,
      note: "no tap on 2 &",
    });
  });
});

describe("what a disabled Check says (d4)", () => {
  test("the slot that is still empty, by name", () => {
    const rn: AnswerSpecOf<"rn-palette"> = { ui: "rn-palette", slots: 4, allow: ["triads"] };
    expect(incompleteReason(rn, ["I", "", "V", "I"])).toBe("Bar 2 is still empty.");
    expect(incompleteReason(rn, ["I", "", "", "I"])).toBe("Bar 2 and bar 3 are still empty.");
    expect(incompleteReason(rn, ["", "", "", ""])).toBe("Bar 1 and 3 more are still empty.");
    expect(incompleteReason(rn, ["I", "", "V", "I"], { slotsPerBar: 2 })).toBe(
      "Bar 1, beat 3 is still empty.",
    );
    expect(incompleteReason(rn, ["I", "IV", "V", "I"])).toBeNull();
    const grid: AnswerSpecOf<"bar-grid"> = {
      ui: "bar-grid",
      bars: 4,
      perRow: 4,
      entry: "rn",
      qualities: ["7"],
      given: [1],
    };
    expect(incompleteReason(grid, ["", "IV7", "", "I7"])).toBe("Bar 3 is still empty.");
    const form: AnswerSpecOf<"form"> = {
      ui: "form",
      sections: 3,
      vocabulary: "letters",
      input: "label",
      sectionBars: [8, 8, 8],
    };
    expect(incompleteReason(form, ["A", "", "A"])).toBe("Bars 9–16 is still empty.");
    expect(
      incompleteReason({ ui: "form", sections: 3, vocabulary: ["verse", "chorus"], input: "order" }, [
        "verse",
        "",
        "",
      ]),
    ).toBe("2 sections are still to place.");
    expect(
      incompleteReason({ ui: "degree-pad", set: ["1", "2", "3"], sequenceLen: 4, syllables: false }, ["1"]),
    ).toBe("3 of 4 notes are still empty.");
    expect(incompleteReason({ ui: "scale-builder", tonic: "C", input: "degrees" }, [])).toBe(
      "Pick the notes of the scale.",
    );
    // A kind without slots to name says nothing.
    expect(incompleteReason({ ui: "text", normalize: "note" }, "")).toBeNull();
  });
});
