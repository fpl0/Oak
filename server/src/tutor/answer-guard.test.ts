import { describe, expect, test } from "bun:test";
import {
  AnswerGuard,
  answerElements,
  answerForms,
  answerKindOf,
  answerLeaks,
  classifyElement,
  holdFrom,
  maskAnswers,
  WITHHELD,
} from "./answer-guard.ts";
import type { Rung } from "./domain.ts";
import { MAKE_STEP, STEP } from "./testing/fixtures.ts";
import {
  CHORD_STEP,
  DICTATION_STEP,
  LEAKY_TEXT,
  RN_STEP,
  VOICING_STEP,
  W4_STEPS,
} from "./testing/wave4-fixtures.ts";

/** Streams `chunks` through a guard and returns what the learner would read. */
function stream(chunks: readonly string[], forms: ReturnType<typeof answerForms>, level: Rung): string {
  const g = new AnswerGuard(forms, level);
  return chunks.map((c) => g.push(c)).join("") + g.flush();
}

describe("elements of an answer", () => {
  test("numerals, chord symbols, notes and degrees are told apart", () => {
    expect(["vi", "V6", "viio", "vii°", "bVII", "V7/vi", "IV"].map((t) => classifyElement(t))).toEqual(
      Array(7).fill("rn"),
    );
    expect(["Am", "G/B", "C°", "Bdim", "F#m7", "Bb", "C+"].map((t) => classifyElement(t))).toEqual(
      Array(7).fill("chord"),
    );
    expect(["c4", "F#4", "Bb3"].map((t) => classifyElement(t))).toEqual(["note", "note", "note"]);
    expect(["1", "b3", "#4"].map((t) => classifyElement(t))).toEqual(["deg", "deg", "deg"]);
    expect(["the", "chord", "octave"].map((t) => classifyElement(t))).toEqual([null, null, null]);
  });

  test("an answer splits on spaces, commas, arrows and dashes", () => {
    expect(answerElements("I–V–vi–IV").map((e) => e.token)).toEqual(["I", "V", "vi", "IV"]);
    expect(answerElements("C, G/B → Am").map((e) => e.token)).toEqual(["C", "G/B", "Am"]);
  });
});

describe("answer forms per step kind", () => {
  test("Make steps and steps without a reference have none", () => {
    expect(answerForms(MAKE_STEP)).toEqual([]);
    expect(answerForms({ ...RN_STEP, grading: "ungraded" })).toEqual([]);
  });

  test("numerals: the sequence and each secret numeral, as tokens and words; chords on screen are no secret", () => {
    const forms = answerForms(RN_STEP);
    const leak = (t: string) => answerLeaks(t, forms, 3);
    expect(leak("Bar 3 is vi.")).toEqual(["answer rn: vi"]);
    expect(leak("Try [[rn:vi]] there")).toEqual(["answer rn: vi"]);
    expect(leak("It goes I-V-vi-IV").length).toBeGreaterThan(0);
    // "vi" inside a word, the prompt's own chords, and V7/vi in the persona are not the answer.
    expect(leak("A vibe, a review, V7/vi, and the loop plays C G Am F.")).toEqual([]);
    // A lone "I" is too common a word to withhold; the token form is withheld.
    expect(leak("I think so")).toEqual([]);
    expect(leak("[[rn:I]]")).toEqual(["answer rn: I"]);
    // At hint 4 everything may be said.
    expect(answerLeaks("I V vi IV", forms, 4)).toEqual([]);
  });

  test("the learner's own answer is not a secret: only what they have not written is", () => {
    const forms = answerForms(RN_STEP, "I V VI IV");
    expect(answerLeaks("Your V in bar 2 is right.", forms, 2)).toEqual([]);
    expect(answerLeaks("Bar 3 should be vi.", forms, 2)).toEqual(["answer rn: vi"]);
    // The whole answer stays withheld even though most of it is typed.
    expect(answerLeaks("I V vi IV", forms, 3).some((l) => l.includes("sequence"))).toBe(true);
  });

  test("chord symbols: spelled any way (♭/b, °/o); single letters only as tokens", () => {
    const forms = answerForms(CHORD_STEP);
    expect(answerLeaks("bar 2 is Em", forms, 1)).toEqual(["answer chord: Em"]);
    expect(answerLeaks("[[chord:D]]", forms, 1)).toEqual(["answer chord: D"]);
    expect(answerLeaks("D is a note name", forms, 1)).toEqual([]);
    expect(answerLeaks("G Em C D", forms, 3).length).toBeGreaterThan(0);
    const dim = answerForms({ ...CHORD_STEP, prompt: "Name it.", solutions: ["B°"] });
    expect(answerLeaks("it is Bo", dim, 2)).toEqual(["answer chord: B°"]);
    expect(answerLeaks("it is [[chord:B°]]", dim, 2)).toEqual(["answer chord: B°"]);
  });

  test("voice leading: the voiced chords in code, the notes not shown in the starter", () => {
    const forms = answerForms(VOICING_STEP);
    expect(answerLeaks("Move to B3 and D4.", forms, 2).sort()).toEqual(["note note: b3", "note note: d4"]);
    expect(answerLeaks("[[note:B3]]", forms, 3)).toEqual(["note note: b3"]);
    // C4 E4 G4 are in the starter code: no secret.
    expect(answerLeaks("Start from C4 E4 G4.", forms, 2)).toEqual([]);
  });

  test("dictation: the n() line and the degrees, as sequences", () => {
    const forms = answerForms(DICTATION_STEP);
    expect(answerLeaks('n("0 4 5 3")', forms, 2)).toEqual(["n sequence: 0 4 5 3"]);
    expect(answerLeaks("the bass is 1, 5, 6, 4", forms, 2).length).toBeGreaterThan(0);
    expect(answerLeaks("[[deg:1]] [[deg:5]] [[deg:6]] [[deg:4]]", forms, 2).length).toBeGreaterThan(0);
    // Talking about degree 5 alone, or the bars, is fine.
    expect(answerLeaks("Is bar 2 on [[deg:5]]? Listen to bars 1-4.", forms, 2)).toEqual([]);
  });

  test("the Wave 3 code step keeps working: its line is withheld as numbers and as degrees", () => {
    const forms = answerForms(STEP);
    expect(answerLeaks("Write 0 2 4 7 4 2", forms, 3)).toEqual(["n sequence: 0 2 4 7 4 2"]);
    expect(answerLeaks("Look at beat 3 of bar 1. Which number is the octave?", forms, 3)).toEqual([]);
  });

  test("answer_kind: the content's own, else what the answer is made of", () => {
    expect(answerKindOf(RN_STEP)).toBe("rn-palette");
    expect(answerKindOf({ ...RN_STEP, answerKind: null })).toBe("numerals");
    expect(answerKindOf({ ...CHORD_STEP, answerKind: null })).toBe("chords");
    expect(answerKindOf({ ...VOICING_STEP, answerKind: null })).toBe("notes");
    expect(answerKindOf({ ...STEP })).toBe("degrees");
    expect(answerKindOf(MAKE_STEP)).toBeNull();
  });
});

describe("masking", () => {
  test("a sequence is replaced whole, before its elements", () => {
    const forms = answerForms(RN_STEP);
    expect(maskAnswers("It goes I V vi IV here.", forms, 1)).toBe(`It goes ${WITHHELD} here.`);
    expect(maskAnswers("Bar 3 is [[rn:vi]].", forms, 1)).toBe(`Bar 3 is ${WITHHELD}.`);
    expect(maskAnswers("Bar 3 is vi.", forms, 4)).toBe("Bar 3 is vi.");
  });

  test("streaming: an answer cut across deltas is still withheld; prose streams without waiting", () => {
    for (const step of W4_STEPS) {
      const forms = answerForms(step);
      const chunks = LEAKY_TEXT[step.id] as string[];
      for (const level of [0, 1, 2, 3] as const) {
        const out = stream(chunks, forms, level);
        expect(answerLeaks(out, forms, level)).toEqual([]);
        expect(out).toContain(WITHHELD);
      }
      // One character at a time, the hardest split there is.
      const oneByOne = stream([...chunks.join("")], forms, 2);
      expect(answerLeaks(oneByOne, forms, 2)).toEqual([]);
      expect(stream(chunks, forms, 4)).toBe(chunks.join(""));
    }
    const forms = answerForms(RN_STEP);
    const g = new AnswerGuard(forms, 1);
    // Plain words are released at once; only a run that may still become the answer is held.
    expect(g.push("Count up from the tonic and listen ")).toBe("Count up from the tonic and listen ");
    expect(g.push("to bar 3: is it ")).toBe("to bar 3: is it ");
    expect(g.push("v")).toBe("");
    expect(g.push("i?")).toBe(`${WITHHELD}?`);
  });

  test("holdFrom holds the trailing run of answer words only", () => {
    const tokens = new Set(["I", "V", "vi", "IV"]);
    expect(holdFrom("Listen to bar 2. ", tokens)).toBe("Listen to bar 2. ".length);
    expect(holdFrom("It goes I V ", tokens)).toBe("It goes ".length);
    expect(holdFrom("It goes [[rn:I", tokens)).toBe("It goes ".length);
    expect(holdFrom("the octave", tokens)).toBe("the octave".length);
    // A sentence mark ends any sequence.
    expect(holdFrom("That was V. ", tokens)).toBe("That was V. ".length);
  });
});
