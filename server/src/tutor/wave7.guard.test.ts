// The answer guard on the Wave 7 answer kinds, form by form (wave7.md §11): what counts as naming the answer and what
// does not, in prose, in tokens, in other spellings, split across stream deltas; and what stays ordinary teaching
// language (another chord, another shape, the learner's own half of a clave, a number that is a bar).
import { describe, expect, test } from "bun:test";
import {
  AnswerGuard,
  answerForms,
  answerKindOf,
  answerLeaks,
  classifyElement,
  WITHHELD,
} from "./answer-guard.ts";
import {
  euclidAnswer,
  groupingAnswer,
  jazzChordPattern,
  jazzChordTokens,
  qualitySpellings,
  voicingShapeAnswer,
  w7ChoiceForms,
} from "./answer-guard-w7.ts";
import type { Rung, StepSource } from "./domain.ts";
import {
  ANCHOR_STEP,
  CLAVE_STEP,
  EUCLID_CODE_STEP,
  EUCLID_STEP,
  GROUPING_STEP,
  JAZZ_CHORD_STEP,
  MICRO_STEP,
  SOUND_STEP,
  SWING_CODE_STEP,
  SWING_STEP,
  TENSION_STEP,
  VOICING_STEP,
  W7_LEARNER,
  W7_STEPS,
} from "./testing/wave7-fixtures.ts";

const formsOf = (step: StepSource) => answerForms(step, W7_LEARNER[step.id] ?? null);
const leaks = (step: StepSource, text: string, level: Rung = 3) =>
  answerLeaks(text, formsOf(step), level).length > 0;
function stream(step: StepSource, chunks: readonly string[], level: Rung = 2): string {
  const g = new AnswerGuard(formsOf(step), level);
  return chunks.map((c) => g.push(c)).join("") + g.flush();
}

describe("every Wave 7 kind has forms, and none of them at the reveal", () => {
  test.each(W7_STEPS.map((s) => [s.id, s] as const))("%s", (_id, step) => {
    const forms = formsOf(step);
    expect(forms.length).toBeGreaterThan(0);
    expect(forms.every((f) => f.minLevel === 4)).toBe(true);
    expect(answerKindOf(step)).not.toBeNull();
  });
});

describe("a jazz chord in every spelling the learner can choose", () => {
  test("Dm7: D–7, D-7, Dmin7, Dmi7 and the token; never Dm7b5, D7, Dmaj7 or a bar named D", () => {
    for (const t of [
      "It is a D–7.",
      "Write D-7.",
      "Dmin7, really.",
      "a Dmi7",
      "[[chord:Dm7]]",
      "[[chord:D–7]]",
    ])
      expect(leaks(JAZZ_CHORD_STEP, t)).toBe(true);
    for (const t of [
      "Dm7b5 is darker.",
      "D7 is a dominant.",
      "Dmaj7 is brighter.",
      "Start on D.",
      "Dm9 adds a 9th.",
    ])
      expect(leaks(JAZZ_CHORD_STEP, t)).toBe(false);
  });
  test("split across deltas at the en dash, the root is held until the quality arrives", () => {
    const out = stream(JAZZ_CHORD_STEP, ["It is a D", "–", "7, I think."]);
    expect(out).toBe(`It is a ${WITHHELD}, I think.`);
    expect(stream(JAZZ_CHORD_STEP, ["Play a D", " under it."])).toBe("Play a D under it.");
  });
  test("the qualities and their spellings (@oak/notation's lead-sheet and jazz glyphs)", () => {
    expect(qualitySpellings("^7")).toContain("∆7");
    expect(qualitySpellings("m7b5")).toContain("ø7");
    expect(qualitySpellings("7alt")).toContain("alt");
    expect(qualitySpellings("q7")).toBeNull();
    expect(jazzChordTokens("Bbm7")).toEqual(["Bb", "Bbm7", "Bb-7", "Bb–7", "Bbmin7", "Bbmi7"]);
    for (const c of ["G7alt", "Bb13", "Cm9", "C69", "D7b9", "Ebmaj7#11", "C^9", "Cm^7", "G7sus4"])
      expect(classifyElement(c)).toBe("chord");
    const p = new RegExp(jazzChordPattern("Cm7b5") as string);
    for (const t of ["Cø7", "Cø", "C–7♭5", "Cm7♭5", "Cmin7b5"]) expect(p.test(t)).toBe(true);
  });
});

describe("a voicing shape by name and by how it is built", () => {
  test("rootless A: the name, 'the 3rd at the bottom', 3 5 7 9, the ID; never another shape or plain 'a voicing'", () => {
    for (const t of [
      "Play rootless A here.",
      "the A voicing",
      "the 3rd at the bottom",
      "3-5-7-9",
      "rootless-a",
    ])
      expect(leaks(VOICING_STEP, t)).toBe(true);
    for (const t of ["a voicing with four notes", "Drop-2 moves a note.", "Is the root in the chord?"])
      expect(leaks(VOICING_STEP, t)).toBe(false);
    // The notes of the shape, in any order and octave (F A C E).
    expect(leaks(VOICING_STEP, "F, A, C and E")).toBe(true);
    expect(voicingShapeAnswer("Drop 2 (second from the top dropped)")).toBe("drop-2");
    expect(voicingShapeAnswer("voicing: shell")).toBe("shell");
    expect(voicingShapeAnswer("Dm7")).toBeNull();
  });
});

describe("the standard choices of stage G and H", () => {
  test("a swing feel: its name and its ratio", () => {
    for (const t of ["It is triplet swing.", "the pairs are 2:1", "a triplet feel"])
      expect(leaks(SWING_STEP, t)).toBe(true);
    for (const t of ["Tap the pairs.", "bar 2 is louder", "Is it 3:2?"])
      expect(leaks(SWING_STEP, t)).toBe(false);
  });
  test("a microtiming side: behind, laid back, late", () => {
    for (const t of ["It is laid back.", "a hair behind", "it drags"])
      expect(leaks(MICRO_STEP, t)).toBe(true);
    expect(leaks(MICRO_STEP, "Listen to the hi-hat and the snare.")).toBe(false);
  });
  test("a clave: the direction in any spelling; the type the learner already has right is theirs", () => {
    for (const t of ["It is 2-3.", "two-three", "the two side comes first", "it starts on the two side"])
      expect(leaks(CLAVE_STEP, t)).toBe(true);
    // The learner answered "Son clave, 3-2": son is right, so naming it is not a secret.
    expect(leaks(CLAVE_STEP, "It is a son clave.")).toBe(false);
    expect(leaks(CLAVE_STEP, "Your 3-2 is the other way round.")).toBe(false);
    const fresh = answerForms(CLAVE_STEP, null);
    expect(answerLeaks("It is a son clave.", fresh, 3)).toEqual(["clave type son"]);
  });
  test("a tension over its chord: ♯11, sharp 11, sharp eleventh; never another tension", () => {
    for (const t of ["the ♯11", "a sharp 11", "the #11th", "sharp eleventh"])
      expect(leaks(TENSION_STEP, t)).toBe(true);
    for (const t of ["the 9th", "the 13th", "bar 11"]) expect(leaks(TENSION_STEP, t)).toBe(false);
    expect(w7ChoiceForms("A chord tone", "")?.[0]?.label).toBe("tension chord-tone");
    expect(w7ChoiceForms("Son clave, 3-2", "")?.map((f) => f.label)).toEqual([
      "clave type son",
      "clave direction 3-2",
    ]);
  });
  test("a sound comparison", () => {
    expect(leaks(SOUND_STEP, "The second is darker.")).toBe(true);
    expect(leaks(SOUND_STEP, "Listen to the top of the sound.")).toBe(false);
  });
});

describe("groupings and Euclidean rhythms", () => {
  test("2+2+3 in numbers and words, in any separator; never 3+2+2", () => {
    for (const t of ["2+2+3.", "2 2 3", "two, two, three.", "2, 2 and 3"])
      expect(leaks(GROUPING_STEP, t)).toBe(true);
    for (const t of ["3+2+2", "count to seven"]) expect(leaks(GROUPING_STEP, t)).toBe(false);
    expect(groupingAnswer("3, 2")).toEqual([3, 2]);
    expect(groupingAnswer("2+4")).toBeNull();
  });
  test("(5,8): the numbers, 'five hits over eight', the cinquillo; never (5,16) or bar 5", () => {
    for (const t of ["(5,8)", "( 5, 8 )", "five hits over eight steps.", "5 notes in 8", "the cinquillo"])
      expect(leaks(EUCLID_STEP, t)).toBe(true);
    for (const t of ["(5,16)", "bar 5 of 8", "the tresillo"]) expect(leaks(EUCLID_STEP, t)).toBe(false);
    expect(euclidAnswer("E(5,16,10)")).toEqual([5, 16, 10]);
    expect(euclidAnswer("5 hits")).toBeNull();
  });
});

describe("Wave 7 code: swing amounts, Euclidean rhythms, voicing controls", () => {
  test(".swingBy(1/3, 4): the amount near the word swing, the ratio and the named feel; not a bar's fraction", () => {
    for (const t of ["Add .swingBy(1/3, 4).", "a swing amount of 1/3", "2:1 swing", "triplet swing"])
      expect(leaks(SWING_CODE_STEP, t)).toBe(true);
    for (const t of ["the bar is 1/3 empty", "Make it swing."]) expect(leaks(SWING_CODE_STEP, t)).toBe(false);
    expect(answerKindOf(SWING_CODE_STEP)).toBe("swing amount");
  });
  test("rim(3,8): the call, the numbers, three over eight, the tresillo", () => {
    for (const t of ["rim(3,8)", "3 hits over 8.", "the tresillo"])
      expect(leaks(EUCLID_CODE_STEP, t)).toBe(true);
    expect(leaks(EUCLID_CODE_STEP, "Three hits, eight places: how far apart?")).toBe(false);
    expect(answerKindOf(EUCLID_CODE_STEP)).toBe("euclidean rhythm");
  });
  test('.anchor("a4"): the call and the note named with the anchor; the learner\'s c5 is theirs', () => {
    for (const t of ['.anchor("a4")', "anchor them at a4"]) expect(leaks(ANCHOR_STEP, t)).toBe(true);
    for (const t of ["Where is the top note?", 'your .anchor("c5") is too high'])
      expect(leaks(ANCHOR_STEP, t)).toBe(false);
    expect(answerKindOf(ANCHOR_STEP)).toBe("voicing control");
  });
});
