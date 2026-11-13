// The answer guard on the Wave 5 answer kinds, form by form (wave5.md §11): what counts as naming the answer
// and what does not, in prose, in tokens, in other spellings, split across stream deltas; and what stays ordinary
// teaching language (the word "chorus", one plain degree, the learner's own correct bars).
import { describe, expect, test } from "bun:test";
import {
  AnswerGuard,
  answerForms,
  answerLeaks,
  arrangeSequence,
  degreesIn,
  degreesOfN,
  formLettersOf,
  formSequence,
  maskAnswers,
  WITHHELD,
} from "./answer-guard.ts";
import type { Rung, StepSource } from "./domain.ts";
import {
  BASS_LINE_STEP,
  FORM_STEP,
  GRID_STEP,
  MINOR_DICTATION_STEP,
  SCALE_STEP,
  W5_LEARNER,
} from "./testing/wave5-fixtures.ts";

const formsOf = (step: StepSource) => answerForms(step, W5_LEARNER[step.id] ?? null);
const leak = (step: StepSource, text: string, level: Rung = 3) => answerLeaks(text, formsOf(step), level);
function stream(step: StepSource, chunks: readonly string[], level: Rung = 2): string {
  const g = new AnswerGuard(formsOf(step), level);
  return chunks.map((c) => g.push(c)).join("") + g.flush();
}

describe("a form answer: the section order and its letters", () => {
  test("parsing: names, numbered names, letters spaced or joined", () => {
    expect(formSequence("verse chorus verse chorus")).toEqual({
      kind: "names",
      items: ["verse", "chorus", "verse", "chorus"],
    });
    expect(formSequence("verse chorus 2 bridge")?.items).toEqual(["verse", "chorus 2", "bridge"]);
    expect(formSequence("A A B A")).toEqual({ kind: "letters", items: ["A", "A", "B", "A"] });
    expect(formSequence("AABA")?.items).toEqual(["A", "A", "B", "A"]);
    expect(formSequence("I V vi IV")).toBeNull();
    expect(formLettersOf(["verse", "chorus", "verse", "chorus 2", "bridge"])).toEqual([
      "A",
      "B",
      "A",
      "B",
      "C",
    ]);
  });

  test("the order in words or in letters is withheld; one section name is ordinary vocabulary", () => {
    expect(leak(FORM_STEP, "It goes verse, chorus, verse, chorus, bridge, chorus.").length).toBeGreaterThan(
      0,
    );
    expect(leak(FORM_STEP, "Verse → Chorus → Verse → Chorus 2 → Bridge → Chorus 3").length).toBeGreaterThan(
      0,
    );
    expect(leak(FORM_STEP, "As letters: ABABCB.")).toContain("answer form letters: ABABCB");
    expect(leak(FORM_STEP, "As letters: A B A B C B.")).toContain("answer form letters: ABABCB");
    expect(leak(FORM_STEP, "Listen for where the chorus comes back.")).toEqual([]);
    expect(leak(FORM_STEP, "Which section is the bridge?")).toEqual([]);
    expect(leak(FORM_STEP, "It goes verse, chorus, verse, chorus, bridge, chorus.", 4)).toEqual([]);
  });

  test("an arranged solution's order is withheld only when the step does not already show it", () => {
    expect(arrangeSequence("chords: arrange([4, chordsVerse], [8, chordsChorus2], [4, silence])")).toBeNull();
    expect(arrangeSequence("chords: arrange([4, chordsVerse], [8, chordsChorus2])")).toEqual([
      "verse",
      "chorus 2",
    ]);
    const solution = "bass: arrange([4, bassVerse], [4, bassChorus], [4, bassVerse], [4, bassBridge])";
    const step: StepSource = {
      ...FORM_STEP,
      answerKind: null,
      prompt: "Arrange the bass.",
      solutions: [solution],
    };
    expect(answerLeaks("Write verse, chorus, verse, bridge.", answerForms(step), 3).length).toBeGreaterThan(
      0,
    );
    // U09.L02 S4: the chords line already plays the order; copying it is the lesson, not a secret.
    const shown: StepSource = {
      ...step,
      starterCode:
        "chords: arrange([4, chordsVerse], [4, chordsChorus], [4, chordsVerse], [4, chordsBridge])",
    };
    expect(answerForms(shown)).toEqual([]);
  });

  test("streamed in pieces, the order is still withheld whole", () => {
    const out = stream(FORM_STEP, [
      "The song goes verse, ",
      "chorus, verse, chor",
      "us, bridge and chorus. Next?",
    ]);
    expect(out).toContain(WITHHELD);
    expect(leak(FORM_STEP, out)).toEqual([]);
    expect(out).toContain("Next?");
  });
});

describe("a 12-bar chart: the chart, any line of it, any bar's chord", () => {
  test("bar statements in either order, as words, tokens or bar links", () => {
    expect(leak(GRID_STEP, "Bar 2 is IV7.")).toEqual(["bar-grid bar: IV7"]);
    expect(leak(GRID_STEP, "In [[bars:2]] the chord is [[rn:IV7]].")).toEqual(["bar-grid bar: IV7"]);
    expect(leak(GRID_STEP, "Put IV7 in bar 2.")).toContain("bar-grid bar: IV7 (named first)");
    expect(leak(GRID_STEP, "Bars 9-12 run V7 IV7 I7 V7.").length).toBeGreaterThan(0);
  });

  test("what the learner already has right, the bar the prompt gives, and a different bar are not secrets", () => {
    // Their bar 5 is IV7 already, and bar 1 is printed: neither is withheld.
    expect(leak(GRID_STEP, "Bar 5 is IV7, as you have it.")).toEqual([]);
    expect(leak(GRID_STEP, "Bar 1 is I7.")).toEqual([]);
    // Bar 3 is I7 in the answer, not IV7: saying "bar 3 is IV7" is wrong, not a leak.
    expect(leak(GRID_STEP, "Bar 3 is IV7?")).toEqual([]);
    expect(leak(GRID_STEP, "The blues uses I7, IV7 and V7.")).toEqual([]);
  });

  test("a bar statement split across deltas is held to the end of its sentence, then withheld", () => {
    const out = stream(GRID_STEP, ["Listen again. Bar ", "2 is ", "[[rn:IV7]] ", "here. Then try it."]);
    expect(out).toBe(`Listen again. ${WITHHELD} here. Then try it.`);
  });
});

describe("a scale built as a set: its degrees or notes in any order", () => {
  test("any order, any spelling, syllables, notes; the missing altered degree alone", () => {
    expect(leak(SCALE_STEP, "It is 1, ♭3, 4, ♭5, 5 and ♭7.")).toContain("scale degrees: 1 b3 4 b5 5 b7");
    expect(leak(SCALE_STEP, "b7 5 b5 4 b3 1")).toContain("scale degrees: 1 b3 4 b5 5 b7");
    expect(leak(SCALE_STEP, "Sing do me fa se sol te.")).toContain("scale degrees: 1 b3 4 b5 5 b7");
    expect(leak(SCALE_STEP, "Add [[deg:b5]].")).toEqual(["scale degree: b5"]);
    expect(leak(SCALE_STEP, "Add the flat 5.")).toEqual(["scale degree: b5"]);
    expect(degreesIn("1, flat 3, [[deg:4]], me and sol")).toEqual(["1", "b3", "4", "b3", "5"]);
  });

  test("the minor pentatonic the learner already has, or a degree they found, is not the answer", () => {
    expect(leak(SCALE_STEP, "Your 1 b3 4 5 b7 is the minor pentatonic.")).toEqual([]);
    expect(leak(SCALE_STEP, "Keep [[deg:b3]] and [[deg:b7]].")).toEqual([]);
  });

  test("a keyboard answer in MIDI numbers is withheld as its notes in any order", () => {
    const step: StepSource = { ...SCALE_STEP, solutions: ["60 63 65 66 67 70"] };
    const forms = answerForms(step);
    expect(answerLeaks("Play C, Eb, F, Gb, G and Bb.", forms, 3).length).toBe(1);
    expect(answerLeaks("Play Bb G Gb F Eb C.", forms, 3).length).toBe(1);
    expect(answerLeaks("Play C Eb F G Bb.", forms, 3)).toEqual([]);
  });

  test("streamed, the set is withheld whole and the rest flows", () => {
    const out = stream(SCALE_STEP, ["Your scale needs one more: 1, ", "♭3, 4, ♭5, 5 ", "and ♭7. Tick it."]);
    expect(out).toContain(WITHHELD);
    expect(leak(SCALE_STEP, out, 2)).toEqual([]);
  });
});

describe("a minor dictation: degrees in any spelling, syllables included", () => {
  test("degreesOfN reads n() in the scale's own steps", () => {
    expect(degreesOfN([0, 2, 4, 3], "minor")).toEqual(["1", "b3", "5", "4"]);
    expect(degreesOfN([0, 1, 2, 3, 4, 5], "blues")).toEqual(["1", "b3", "4", "b5", "5", "b7"]);
    expect(degreesOfN([0, 2, 4], "major pentatonic")).toEqual(["1", "3", "6"]);
    expect(degreesOfN([-1, 7], "minor")).toEqual(["b7", "1"]);
  });

  test("1 ♭3 5 4, 1 b3 5 4, flat 3, do me sol fa and the n() line are all the answer", () => {
    for (const t of [
      "It is 1 ♭3 5 4.",
      "1, b3, 5 and 4",
      "1, flat 3, 5, 4",
      "Sing do me sol fa.",
      "[[deg:1]] [[deg:b3]] [[deg:5]] [[deg:4]]",
      'Write n("0 2 4 3").',
    ])
      expect(leak(MINOR_DICTATION_STEP, t).length, t).toBeGreaterThan(0);
    expect(leak(MINOR_DICTATION_STEP, "Is the first note home, do?")).toEqual([]);
    expect(leak(MINOR_DICTATION_STEP, "The dark note of minor is [[deg:b3]].")).toEqual([]);
  });
});

describe("a bass line in code: its notes", () => {
  test("a note the learner has not written is withheld; their roots are not", () => {
    expect(leak(BASS_LINE_STEP, "Try e2 after the root.")).toEqual(["note note: e2"]);
    expect(leak(BASS_LINE_STEP, "End on [[note:G#1]].")).toEqual(["note note: g#1"]);
    expect(leak(BASS_LINE_STEP, "Your a1 on beat 1 is right.")).toEqual([]);
  });

  test("masking keeps the sentence", () => {
    expect(maskAnswers("Try e2 after the root.", formsOf(BASS_LINE_STEP), 2)).toBe(
      `Try ${WITHHELD} after the root.`,
    );
  });
});
