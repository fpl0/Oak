// Wave 5 answer logic: the form strip, the bar grid, the scale builder, numerals and the bass filter in minor (c8),
// and the AnswerWidget helpers (empty, complete, response) for the three new kinds. Musical claims are checked
// against @oak/theory and headless Strudel.
import { describe, expect, test } from "bun:test";
import { formLetters } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { chordOfRoman, minorKeyChords, toLeadSheet, twelveBarPlan } from "@oak/theory";
import {
  barGridPalette,
  barGridStart,
  barRows,
  chartHits,
  clearEntry,
  cycleEntryQuality,
  defaultQuality,
  entryFor,
  entryMidis,
  entryParts,
  entryText,
  placeEntry,
} from "./bar-grid.ts";
import {
  appendCard,
  blockSpan,
  cardPool,
  cardsRepeat,
  clearLabel,
  formBlocks,
  formOptions,
  optionForKey,
  placeLabel,
  readsAsLetters,
  removeCard,
  sectionText,
  shiftCard,
} from "./form.ts";
import { rnHasDegree } from "./harmony.ts";
import { rnForKey, rnModeOf, rnPalette } from "./keys.ts";
import { emptyValue, isComplete, responseOf } from "./response.ts";
import {
  builderRange,
  degreeOfMidi,
  degreeSemis,
  keyInScale,
  scaleRun,
  sortDegrees,
  spellDegreeName,
  syllableOfDegree,
  toggleDegree,
  toggleMidi,
  tonicMidi,
  valueDegrees,
} from "./scale.ts";
import type { AnswerSpecOf } from "./types.ts";

const A_MINOR = { tonic: "A", mode: "minor" } as const;
const A_HARMONIC = { tonic: "A", mode: "harmonic minor" } as const;
const C_MAJOR = { tonic: "C", mode: "major" } as const;
const F_MAJOR = { tonic: "F", mode: "major" } as const;

describe("form", () => {
  const named: AnswerSpecOf<"form"> = {
    ui: "form",
    sections: 4,
    vocabulary: ["verse", "chorus", "bridge"],
    input: "label",
    sectionBars: [8, 8, 4, 8],
  };
  const letters: AnswerSpecOf<"form"> = { ui: "form", sections: 4, vocabulary: "letters", input: "label" };

  test("options: names keep their authored order on digits; letters A… on their own keys", () => {
    expect(formOptions(named).map((o) => [o.key, o.label])).toEqual([
      ["1", "Verse"],
      ["2", "Chorus"],
      ["3", "Bridge"],
    ]);
    expect(formOptions(letters).map((o) => o.id)).toEqual(["A", "B", "C", "D"]);
    expect(formOptions({ vocabulary: "letters", sections: 12 })).toHaveLength(6);
    expect(formOptions({ vocabulary: "letters", sections: 1 })).toHaveLength(2);
    expect(optionForKey(formOptions(letters), "b")?.id).toBe("B");
    expect(optionForKey(formOptions(named), "3")?.id).toBe("bridge");
    expect(optionForKey(formOptions(named), "4")).toBeNull();
  });

  test("section names print as words; a tagged variant keeps its number", () => {
    expect(sectionText("prechorus")).toBe("Pre-chorus");
    expect(sectionText("chorus2")).toBe("Chorus 2");
    expect(sectionText("B")).toBe("B");
  });

  test("blocks are as wide as their bars and number from bar 1", () => {
    const b = formBlocks(named);
    expect(b.map((x) => x.share)).toEqual([8 / 28, 8 / 28, 4 / 28, 8 / 28]);
    expect(b.map(blockSpan)).toEqual(["Bars 1–8", "Bars 9–16", "Bars 17–20", "Bars 21–28"]);
    expect(formBlocks(letters).map(blockSpan)).toEqual(["Section 1", "Section 2", "Section 3", "Section 4"]);
    // A sectionBars of the wrong length is ignored, never half-applied.
    expect(formBlocks({ sections: 3, sectionBars: [4, 4] }).every((x) => x.startBar === null)).toBe(true);
  });

  test("labels fill block after block; Backspace clears the chosen or the last", () => {
    let v = emptyValue(letters);
    let at: number | null = 0;
    for (const id of ["A", "A", "B", "A"]) {
      const r = placeLabel(v, 4, id, at);
      v = r.value;
      at = r.next;
    }
    expect(v).toEqual(["A", "A", "B", "A"]);
    expect(at).toBeNull();
    expect(clearLabel(v, 4, 2)).toEqual({ value: ["A", "A", "", "A"], at: 2 });
    expect(clearLabel(["A", "", "", ""], 4, 3)).toEqual({ value: ["", "", "", ""], at: 0 });
  });

  test("reads as letters by first appearance, the shape the grader compares", () => {
    expect(readsAsLetters(["verse", "chorus", "verse", "chorus2"])).toBe("A B A B");
    expect(readsAsLetters(["B", "A", "", "B"])).toBe("A B · A");
    expect(formLetters(["verse", "chorus", "verse", "chorus2"])).toBe("ABAB");
  });

  test("order mode: cards once each when they fit, else reusable; move and take out", () => {
    const order: AnswerSpecOf<"form"> = {
      ui: "form",
      sections: 3,
      vocabulary: ["intro", "verse", "chorus"],
      input: "order",
    };
    expect(cardsRepeat(order)).toBe(false);
    let v = emptyValue(order);
    v = appendCard(v, 3, "verse");
    expect(cardPool(order, v).map((o) => o.id)).toEqual(["intro", "chorus"]);
    v = appendCard(v, 3, "intro");
    v = appendCard(v, 3, "chorus");
    expect(appendCard(v, 3, "verse")).toEqual(v);
    expect(shiftCard(v, 1, -1)).toEqual({ value: ["intro", "verse", "chorus"], at: 0 });
    expect(removeCard(v, 3, 0)).toEqual(["intro", "chorus", ""]);
    expect(cardsRepeat({ vocabulary: ["verse", "chorus"], sections: 4 })).toBe(true);
    expect(cardPool({ vocabulary: ["verse", "chorus"], sections: 4 }, ["verse", "", "", ""])).toHaveLength(2);
  });

  test("empty, complete and response", () => {
    expect(isComplete(named, ["verse", "chorus", "", "chorus"])).toBe(false);
    expect(isComplete(named, ["verse", "chorus", "bridge", "chorus"])).toBe(true);
    expect(responseOf(named, ["verse", "chorus", "bridge", "chorus"])).toEqual({
      answer: { sections: ["verse", "chorus", "bridge", "chorus"] },
    });
  });
});

describe("bar grid", () => {
  const blues: AnswerSpecOf<"bar-grid"> = {
    ui: "bar-grid",
    bars: 12,
    perRow: 4,
    entry: "rn",
    qualities: ["7"],
    given: [1],
  };
  /** U11.CP's F blues: quick change, turnaround in bar 12. */
  const F_BLUES_RN = ["I7", "IV7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"];

  test("a blues palette: every digit a dominant seventh (I7 IV7 V7), plus the borrowed flat degrees", () => {
    const pal = barGridPalette(blues, { tonic: "F", mode: "blues" });
    expect(pal.slice(0, 7).map((b) => b.entry)).toEqual(["I7", "II7", "III7", "IV7", "V7", "VI7", "VII7"]);
    expect(pal.slice(7).map((b) => [b.key, b.entry])).toEqual([
      ["-3", "bIII7"],
      ["-6", "bVI7"],
      ["-7", "bVII7"],
    ]);
    // The numerals sound as the chords of F: I7 F7, IV7 B♭7, V7 C7.
    for (const [rn, sym] of [
      ["I7", "F7"],
      ["IV7", "B♭7"],
      ["V7", "C7"],
    ] as const) {
      const c = chordOfRoman(rn, F_MAJOR);
      expect(c ? toLeadSheet(c) : null).toBe(sym);
    }
  });

  test("a mixed palette takes the key's own quality on each degree, in major and in minor", () => {
    const q = ["maj", "min", "7"] as const;
    expect([1, 2, 5, 6].map((d) => defaultQuality(d, 0, q, C_MAJOR))).toEqual(["maj", "min", "maj", "min"]);
    expect([1, 3, 5, 6, 7].map((d) => defaultQuality(d, 0, q, A_MINOR))).toEqual([
      "min",
      "maj",
      "min",
      "maj",
      "maj",
    ]);
    expect(defaultQuality(5, 0, q, A_HARMONIC)).toBe("maj");
    expect(defaultQuality(5, 0, ["7"], C_MAJOR)).toBe("7");
    // Minor numerals match @oak/theory's chords of A minor.
    const pal = barGridPalette({ entry: "rn", qualities: ["maj", "min", "dim"] }, A_MINOR);
    expect(pal.map((b) => b.entry)).toEqual(minorKeyChords("A").map((c) => c.rn));
  });

  test("symbols are spelled in the key, written as code and printed as on a lead sheet", () => {
    expect(entryFor("symbol", 4, 0, "7", F_MAJOR)).toBe("Bb7");
    expect(entryText("symbol", "Bb7")).toBe("B♭7");
    expect(entryFor("symbol", 7, -1, "maj", C_MAJOR)).toBe("Bb");
    expect(entryFor("symbol", 3, 0, "maj", A_MINOR)).toBe("C");
    expect(entryParts("symbol", "Bb7", F_MAJOR)).toEqual({ degree: 4, alt: 0, quality: "7" });
    expect(entryParts("rn", "bVII7", C_MAJOR)).toEqual({ degree: 7, alt: -1, quality: "7" });
    expect(cycleEntryQuality("rn", "IV", ["maj", "min", "7"], C_MAJOR)).toBe("iv");
    expect(cycleEntryQuality("rn", "iv", ["maj", "min", "7"], C_MAJOR)).toBe("IV7");
    expect(cycleEntryQuality("symbol", "F7", ["maj", "7"], C_MAJOR)).toBe("F");
  });

  test("entries fill bar after bar and skip given bars; Backspace never clears a given bar", () => {
    let v = barGridStart(blues, F_BLUES_RN);
    expect(v[0]).toBe("I7");
    expect(v.slice(1).every((x) => x === "")).toBe(true);
    let at: number | null = null;
    for (const e of F_BLUES_RN.slice(1)) {
      const r = placeEntry(v, blues, e, at);
      v = r.value;
      at = r.next;
    }
    expect(v).toEqual(F_BLUES_RN);
    expect(at).toBeNull();
    expect(placeEntry(v, blues, "V7", 0).value[0]).toBe("I7");
    expect(clearEntry(v, blues, 0).value[0]).toBe("I7");
    expect(clearEntry(v, blues, 0).value[11]).toBe("");
    expect(isComplete(blues, ["", ...F_BLUES_RN.slice(1)])).toBe(true);
    expect(isComplete(blues, ["", ...F_BLUES_RN.slice(1, 11), ""])).toBe(false);
    expect(responseOf(blues, F_BLUES_RN)).toEqual({ answer: { rn: F_BLUES_RN } });
    expect(responseOf({ ...blues, entry: "symbol" }, ["F7"])).toEqual({ answer: { text: ["F7"] } });
  });

  test("three rows of four; the chart plays bar by bar, empty bars keep their time", () => {
    expect(barRows(12, 4)).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12],
    ]);
    expect(barRows(10, 4).map((r) => r.length)).toEqual([4, 4, 2]);
    const hits = chartHits(["I7", "", "IV7"], "rn", F_MAJOR, { bpm: 120, beatsPerBar: 4 });
    expect(hits.map((h) => [h.bar, h.at])).toEqual([
      [0, 0],
      [2, 4],
    ]);
    // F7 voiced with F in the bass: F2 under F A C E♭.
    expect(entryMidis("rn", "I7", F_MAJOR)).toEqual([53, 60, 63, 65, 69]);
  });

  test("the standard blues plan reads in the palette's numerals", () => {
    const plan = twelveBarPlan({ variant: "quick-change", turnaround: true });
    expect(plan).toEqual(F_BLUES_RN);
    const entries = new Set(barGridPalette(blues, F_MAJOR).map((b) => b.entry));
    for (const rn of plan) expect(entries.has(rn)).toBe(true);
  });
});

describe("scale builder", () => {
  test("degrees spell by letter above the tonic: blue notes, the minors, sharp keys", () => {
    expect(["1", "b3", "4", "b5", "5", "b7"].map((d) => spellDegreeName("C", d))).toEqual([
      "C",
      "Eb",
      "F",
      "Gb",
      "G",
      "Bb",
    ]);
    // A melodic minor: A B C D E F♯ G♯.
    expect(["1", "2", "b3", "4", "5", "6", "7"].map((d) => spellDegreeName("A", d))).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F#",
      "G#",
    ]);
    expect(spellDegreeName("F#", "7")).toBe("E#");
    expect(spellDegreeName("Bb", "b3")).toBe("Db");
    expect(keyInScale(70, "G")).toBe("B♭4");
    expect(keyInScale(60, "C#")).toBe("B♯3");
  });

  test("do-based syllables: me le te in minor, se for the blue ♭5, la ti raised", () => {
    expect(["1", "b3", "b6", "b7", "b5", "6", "7"].map((d) => syllableOfDegree(d as never))).toEqual([
      "do",
      "me",
      "le",
      "te",
      "se",
      "la",
      "ti",
    ]);
  });

  test("toggling keeps scale order; keys read as degrees above the tonic", () => {
    let v: (number | string)[] = [];
    for (const d of ["5", "1", "b3", "b7", "4"]) v = toggleDegree(v, d);
    expect(v).toEqual(["1", "b3", "4", "5", "b7"]);
    expect(toggleDegree(v, "4")).toEqual(["1", "b3", "5", "b7"]);
    expect(sortDegrees(["7", "b2", "1"])).toEqual(["1", "b2", "7"]);
    expect(toggleMidi([67, 60], 64)).toEqual([60, 64, 67]);
    expect(toggleMidi([60, 64], 64)).toEqual([60]);
    // G major pentatonic on the keyboard: G A B D E → 1 2 3 5 6.
    expect(valueDegrees([67, 69, 71, 74, 76], "G")).toEqual(["1", "2", "3", "5", "6"]);
    expect(degreeOfMidi(66, 0)).toBe("b5");
    expect(degreeSemis("b6")).toBe(8);
  });

  test("the keyboard spans home to home; the run goes up to the octave and back", () => {
    expect(tonicMidi("G")).toBe(67);
    expect(tonicMidi("C")).toBe(60);
    expect(builderRange({ tonic: "G" })).toEqual([67, 79]);
    expect(builderRange({ tonic: "G", range: ["g3", "g4"] })).toEqual([55, 67]);
    expect(scaleRun(["1", "b3", "4", "5", "b7"], "A")).toEqual([69, 72, 74, 76, 79, 81, 79, 76, 74, 72, 69]);
    expect(scaleRun([60, 72], "C")).toEqual([60, 72, 60]);
    expect(scaleRun([], "C")).toEqual([]);
  });

  test("response: keys as answer.midi, degrees as answer.degrees", () => {
    const keys: AnswerSpecOf<"scale-builder"> = { ui: "scale-builder", tonic: "G", input: "keyboard" };
    const pad: AnswerSpecOf<"scale-builder"> = { ui: "scale-builder", tonic: "A", input: "degrees" };
    expect(emptyValue(keys)).toEqual([]);
    expect(isComplete(keys, [])).toBe(false);
    expect(responseOf(keys, [67, 69])).toEqual({ answer: { midi: [67, 69] } });
    expect(responseOf(pad, ["1", "b3"])).toEqual({ answer: { degrees: ["1", "b3"] } });
  });

  test("the scales Oak teaches sound as the degrees say (headless Strudel)", async () => {
    // A blues from A4, built on the pad: A C D E♭ E G.
    const built = scaleRun(["1", "b3", "4", "b5", "5", "b7"], "A").slice(0, 6);
    const r = await evalHeadless('note("a4 c5 d5 eb5 e5 g5").s("piano")', 1);
    expect(r.events.map((e) => e.midi)).toEqual(built);
  });
});

describe("numerals in minor (Wave 5) and the bass filter (c8)", () => {
  test("the key decides the palette: natural, harmonic, and the blues reads as major", () => {
    expect(rnModeOf(A_MINOR)).toBe("minor");
    expect(rnModeOf(A_HARMONIC)).toBe("harmonic");
    expect(rnModeOf({ tonic: "A", mode: "melodic minor" })).toBe("harmonic");
    expect(rnModeOf({ tonic: "A", mode: "minor pentatonic" })).toBe("minor");
    expect(rnModeOf({ tonic: "C", mode: "blues" })).toBe("major");
    expect(rnModeOf(undefined)).toBe("major");
  });

  test("a minor palette: i VI III | iv ii° | v V VII vii°, every numeral a chord of A minor", () => {
    const groups = rnPalette(["triads"], "minor");
    expect(groups.map((g) => g.buttons.map((b) => b.display))).toEqual([
      ["i", "VI", "III"],
      ["iv", "ii°"],
      ["v", "V", "VII", "vii°"],
    ]);
    const symbols = groups
      .flatMap((g) => g.buttons)
      .map((b) => {
        const c = chordOfRoman(b.rn, A_MINOR);
        return c ? toLeadSheet(c) : null;
      });
    expect(symbols).toEqual(["Am", "F", "C", "Dm", "B°", "Em", "E", "G", "G♯°"]);
    const sev = rnPalette(["sevenths"], "harmonic")
      .flatMap((g) => g.buttons)
      .map((b) => b.rn);
    expect(sev).toContain("V7");
    expect(sev).toContain("viio7");
    expect(sev).toContain("v7");
  });

  test("minor keys: digits follow the key, + gives the other form of 5 and 7", () => {
    const allow = ["triads", "sevenths", "borrowed"] as const;
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => rnForKey(d, { allow, mode: "minor" }))).toEqual([
      "i",
      "iio",
      "III",
      "iv",
      "v",
      "VI",
      "VII",
    ]);
    expect(rnForKey(5, { allow, mode: "minor", raised: true })).toBe("V");
    expect(rnForKey(7, { allow, mode: "minor", raised: true })).toBe("viio");
    expect(rnForKey(5, { allow, mode: "minor", raised: true, shift: true })).toBe("V7");
    expect(rnForKey(5, { allow, mode: "harmonic" })).toBe("V");
    expect(rnForKey(5, { allow, mode: "harmonic", raised: true })).toBe("v");
    expect(rnForKey(3, { allow, mode: "minor", raised: true })).toBeNull();
    expect(rnForKey(2, { allow, mode: "minor", flat: true })).toBe("bII");
    expect(rnForKey(7, { allow, mode: "minor", flat: true })).toBeNull();
    // Major keys keep their Wave 4 keys.
    expect(rnForKey(5, { allow })).toBe("V");
    expect(rnForKey(5, { allow, raised: true })).toBeNull();
  });

  test("c8: in A minor the palette lights the numerals over the bass the learner found", () => {
    const lit = (degree: string) =>
      rnPalette(["triads"], "minor")
        .flatMap((g) => g.buttons)
        .filter((b) => rnHasDegree(b.rn, degree, A_MINOR))
        .map((b) => b.display);
    // C in the bass (♭3): Am, C, F.
    expect(lit("b3")).toEqual(["i", "VI", "III"]);
    // F in the bass (♭6): F, Dm, B°.
    expect(lit("b6")).toEqual(["VI", "iv", "ii°"]);
    // G♯ (the raised 7): only E and G♯°.
    expect(lit("7")).toEqual(["V", "vii°"]);
    // G (♭7): C, Em, G.
    expect(lit("b7")).toEqual(["III", "v", "VII"]);
    // E (5): Am, C, Em, E.
    expect(lit("5")).toEqual(["i", "III", "v", "V"]);
  });
});
