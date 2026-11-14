// The answer guard on the Wave 6 answer kinds, form by form (wave6.md §11): what counts as naming the answer and
// what does not, in prose, in tokens, in other spellings, split across stream deltas; and what stays ordinary
// teaching language (a quality the learner already has right, a diatonic numeral, a key the step shows).
import { describe, expect, test } from "bun:test";
import {
  AnswerGuard,
  answerForms,
  answerKindOf,
  answerLeaks,
  choicePhrase,
  classifyElement,
  keyParts,
  maskAnswers,
  modeAnswer,
  qualitySequence,
  scaleKeysOf,
  WITHHELD,
} from "./answer-guard.ts";
import type { Rung, StepSource } from "./domain.ts";
import {
  APPLIED_STEP,
  BORROWED_STEP,
  CHROMATIC_STEP,
  KEY_PLAN_STEP,
  MODE_SCALE_STEP,
  MODE_STEP,
  PIVOT_STEP,
  PUSH_STEP,
  SEVENTH_STEP,
  W6_LEAKY_CARD,
  W6_LEAKY_TEXT,
  W6_LEARNER,
  W6_STEPS,
} from "./testing/wave6-fixtures.ts";

const formsOf = (step: StepSource) => answerForms(step, W6_LEARNER[step.id] ?? null);
const leak = (step: StepSource, text: string, level: Rung = 3) => answerLeaks(text, formsOf(step), level);
const leaks = (step: StepSource, text: string) => leak(step, text).length > 0;
function stream(step: StepSource, chunks: readonly string[], level: Rung = 2): string {
  const g = new AnswerGuard(formsOf(step), level);
  return chunks.map((c) => g.push(c)).join("") + g.flush();
}
const variant = (step: StepSource, over: Partial<StepSource>): StepSource => ({ ...step, ...over });

describe("every Wave 6 fixture: the leaky text and card are caught, the hints and prompt are clean", () => {
  test.each(W6_STEPS.map((s) => [s.id, s] as const))("%s", (_id, step) => {
    const text = (W6_LEAKY_TEXT[step.id] as string[]).join("");
    const card = W6_LEAKY_CARD[step.id] as { code: string; explanation: string };
    for (const level of [0, 1, 2, 3] as const) {
      expect(leak(step, text, level).length).toBeGreaterThan(0);
      expect(leak(step, `${card.code}\n${card.explanation}`, level).length).toBeGreaterThan(0);
      const masked = maskAnswers(text, formsOf(step), level);
      expect(masked).toContain(WITHHELD);
      expect(leak(step, masked, level)).toEqual([]);
      // Split across deltas exactly as the fixture splits it, and one character at a time.
      expect(leak(step, stream(step, W6_LEAKY_TEXT[step.id] as string[], level), level)).toEqual([]);
      expect(leak(step, stream(step, text.split(""), level), level)).toEqual([]);
    }
    // At the reveal nothing is withheld.
    expect(leak(step, text, 4)).toEqual([]);
    expect(maskAnswers(text, formsOf(step), 4)).toBe(text);
    // What the learner is shown at rungs 1-3 never names the answer.
    for (const shown of [step.prompt, step.starterCode ?? "", ...(step.hints ?? []).slice(0, 3)])
      expect(leak(step, shown)).toEqual([]);
    expect(answerKindOf(step)).not.toBeNull();
  });
});

describe("seventh qualities on a quality pad", () => {
  test("parsing: ids, aliases and spelled-out names", () => {
    expect(qualitySequence("maj7 m7 7 maj7")).toEqual(["maj7", "m7", "7", "maj7"]);
    expect(qualitySequence("Major seventh, half-diminished seventh, diminished seventh")).toEqual([
      "maj7",
      "m7b5",
      "dim7",
    ]);
    expect(qualitySequence("major minor dim aug")).toEqual(["major", "minor", "diminished", "augmented"]);
    expect(qualitySequence("I IV V")).toBeNull();
  });

  test("the four in order, in words, in suffixes or hung on chord roots", () => {
    for (const text of [
      "major seventh, minor seventh, dominant seventh, major seventh",
      "Maj7, min7, dom7 and maj7.",
      "It goes C^7 Dm7 G7 C^7.",
      "major 7th then minor 7th then dominant then major seven",
    ])
      expect(leaks(SEVENTH_STEP, text)).toBe(true);
    // Another order is another answer (the learner's own wrong one), and is not withheld.
    expect(
      leaks(SEVENTH_STEP, "You wrote major seventh, major seventh, dominant seventh, major seventh."),
    ).toBe(false);
  });

  test("one chord's quality with its place is withheld, unless the learner has that chord right", () => {
    expect(leak(SEVENTH_STEP, "Bar 2 is a minor seventh.")).toEqual(["quality of a bar: m7"]);
    expect(leak(SEVENTH_STEP, "The second chord is m7.")).toEqual(["quality by place: m7"]);
    expect(leak(SEVENTH_STEP, "There is a minor seventh in [[bars:2]].")).toEqual([
      "quality of a bar: m7 (named first)",
    ]);
    expect(leak(SEVENTH_STEP, "m7")).toEqual(["quality value: m7"]);
    // Bars 1, 3 and 4 are already right in the learner's answer: talking about them gives nothing away.
    expect(leaks(SEVENTH_STEP, "Bar 1 is a major seventh, as you have it.")).toBe(false);
    expect(leaks(SEVENTH_STEP, "Your dominant seventh in bar 3 is right.")).toBe(false);
    // The words alone are vocabulary.
    expect(
      leaks(SEVENTH_STEP, "A minor seventh has a lowered top note; compare it with a major seventh."),
    ).toBe(false);
  });

  test("a single chord asked: its quality is the answer in every spelling; other qualities are not", () => {
    const one = variant(SEVENTH_STEP, { solutions: ["m7b5"], prompt: "Name this chord's quality." });
    for (const text of [
      "It is half-diminished.",
      "a half diminished seventh",
      "m7♭5",
      "Bø7",
      "minor seven flat five",
    ])
      expect(answerLeaks(text, answerForms(one), 3).length).toBeGreaterThan(0);
    for (const text of [
      "Is it a minor seventh or something tenser?",
      "Compare it with a diminished seventh.",
    ])
      expect(answerLeaks(text, answerForms(one), 3)).toEqual([]);
  });
});

describe("applied and borrowed numerals on the palette", () => {
  test("numerals with sevenths and slashes are elements; code symbols C^7, Bo7, Bm7b5 are chords", () => {
    for (const rn of ["V7/V", "viio7/ii", "viiø7", "Imaj7", "ii7", "bVII", "iv"])
      expect(classifyElement(rn)).toBe("rn");
    for (const c of ["C^7", "Bo7", "Bm7b5", "F#7", "Ab"]) expect(classifyElement(c)).toBe("chord");
  });

  test("V7/V: as a numeral, in words, and as its chord in the step's key", () => {
    for (const text of [
      "[[rn:V7/V]]",
      "It is V7/V.",
      "five of five",
      "the V of V",
      "V7 of V",
      "Five-seven of five.",
      "the dominant of V",
      "Bar 2 is [[chord:D7]].",
      "a D7 chord",
      "[[chord:D]]",
    ])
      expect(leaks(APPLIED_STEP, text)).toBe(true);
    // Other applied chords, the learner's own numerals and plain letters are not this answer.
    for (const text of [
      "Is it five of six, or does it lean somewhere else?",
      "Your V7 in bar 3 is right, and bar 1 is I.",
      "The note D is degree 2.",
      "Which chord does it lean into?",
      "Compare with A7, the V of D minor.",
    ])
      expect(leaks(APPLIED_STEP, text)).toBe(false);
  });

  test("an applied leading-tone chord: vii° of ii in C is C♯°7", () => {
    const step = variant(APPLIED_STEP, { solutions: ["I viio7/ii ii V7"] });
    const f = answerForms(step, "I I ii V7");
    for (const text of [
      "viio7/ii",
      "vii°7/ii",
      "seven diminished of two",
      "the leading-tone chord of ii",
      "C#o7",
      "[[chord:C♯°7]]",
      "Dbdim7",
    ])
      expect(answerLeaks(text, f, 3).length).toBeGreaterThan(0);
    expect(answerLeaks("a diminished chord a half step below its target", f, 3)).toEqual([]);
  });

  test("iv in D major: the minor four, and G minor; IV is the learner's own", () => {
    for (const text of [
      "[[rn:iv]]",
      "It is iv.",
      "the minor four",
      "minor IV",
      "four minor",
      "[[chord:Gm]]",
      "Gm",
      "Gm7",
    ])
      expect(leaks(BORROWED_STEP, text)).toBe(true);
    for (const text of ["Your IV in bar 2 is right.", "G major has a B; listen for what changes.", "Gmaj7"])
      expect(leaks(BORROWED_STEP, text)).toBe(false);
  });

  test("flat-side numerals: bVI and bVII in words and as chords of the key", () => {
    const step = variant(BORROWED_STEP, { solutions: ["I bVI bVII I"], key: "C major" });
    const f = answerForms(step, "I vi vii I");
    for (const text of [
      "bVI",
      "♭VI",
      "flat six",
      "the flat-seven chord",
      "lowered VII",
      "A♭",
      "Ab",
      "[[chord:Bb]]",
      "B♭7",
    ])
      expect(answerLeaks(text, f, 3).length).toBeGreaterThan(0);
    for (const text of ["A minor is vi here.", "the note B", "Which degree does the bass stand on?"])
      expect(answerLeaks(text, f, 3)).toEqual([]);
  });

  test("a minor key: the Picardy I and the Dorian IV are the outside chords; iv and VI are the key's own", () => {
    const step = variant(BORROWED_STEP, { solutions: ["i IV V I"], key: "D minor" });
    const f = answerForms(step, "i iv V i");
    for (const text of ["major one", "major IV", "[[rn:IV]]"])
      expect(answerLeaks(text, f, 3).length).toBeGreaterThan(0);
    expect(answerLeaks("Your V in bar 3 is right.", f, 3)).toEqual([]);
  });

  test("a pivot chord named in two keys: the second numeral is the answer, the learner's own is not", () => {
    expect(leak(PIVOT_STEP, "[[rn:ii]]")).toEqual(["answer rn: ii"]);
    expect(leak(PIVOT_STEP, "It is vi, then ii.")).toContain("answer sequence: vi ii");
    expect(leaks(PIVOT_STEP, "Your vi for the old key is right.")).toBe(false);
  });
});

describe("a mode named by ear or built from its parent", () => {
  test("parsing option labels", () => {
    expect(modeAnswer("Mixolydian (major with ♭7)")).toBe("mixolydian");
    expect(modeAnswer("Dorian (minor with ♮6)")).toBe("dorian");
    expect(modeAnswer("Natural minor")).toBe("minor");
    expect(modeAnswer("Major")).toBe("major");
    expect(modeAnswer("verse chorus")).toBeNull();
  });

  test("the name, the changed note in any spelling, and its syllable", () => {
    for (const text of [
      "Mixolydian",
      "mixolydian",
      "[[term:mixolydian]]",
      "major with a ♭7",
      "a flat 7",
      "the lowered seventh",
      "[[deg:b7]]",
      "te",
    ])
      expect(leaks(MODE_STEP, text)).toBe(true);
    for (const text of [
      "Is the home chord major or minor?",
      "Compare degree 7 with G major's.",
      "It is not Lydian: listen lower in the scale.",
      "One note differs from the major scale.",
    ])
      expect(leaks(MODE_STEP, text)).toBe(false);
  });

  test("Dorian's changed note is the scale's own 6 raised back: only words can name it", () => {
    const step = variant(MODE_STEP, { solutions: ["Dorian (minor with ♮6)"], key: "D minor" });
    const f = answerForms(step, "My answer: Phrygian (minor with ♭2)");
    for (const text of ["Dorian", "the raised 6th", "a natural six", "major sixth"])
      expect(answerLeaks(text, f, 3).length).toBeGreaterThan(0);
    for (const text of ["degree 6", "bars 5-6", "the 6 notes of bar 2"])
      expect(answerLeaks(text, f, 3)).toEqual([]);
  });

  test("plain major or minor as the answer: only a sentence that says what the scale is", () => {
    const step = variant(MODE_STEP, { solutions: ["Major"] });
    const f = answerForms(step, "My answer: Lydian");
    expect(answerLeaks("The scale is plain major.", f, 3).length).toBeGreaterThan(0);
    expect(answerLeaks("It is major.", f, 3).length).toBeGreaterThan(0);
    for (const text of [
      "The home chord is G major.",
      "It is major with one note changed, or is it?",
      "G major has an F♯.",
    ])
      expect(answerLeaks(text, f, 3)).toEqual([]);
  });

  test("a scale built from its parent: the set, the changed degree and its words; the mode's name is in the prompt", () => {
    for (const text of ["1 2 3 ♯4 5 6 7", "[[deg:#4]]", "sharp 4", "the raised fourth", "fi", "#4"])
      expect(leaks(MODE_SCALE_STEP, text)).toBe(true);
    for (const text of ["Lydian is bright.", "degree 4", "Play both scales and listen where they part."])
      expect(leaks(MODE_SCALE_STEP, text)).toBe(false);
  });
});

describe("a chromatic degree, a key to find, a push", () => {
  test("♯4 in a line: the code, the degrees, the syllables, and the note alone in every spelling", () => {
    for (const text of [
      'n("4 3# 4 0")',
      "5 ♯4 5 1",
      "sol fi sol do",
      "[[deg:#4]]",
      "♯4",
      "sharp four",
      "the raised 4th",
      "fi",
    ])
      expect(leaks(CHROMATIC_STEP, text)).toBe(true);
    for (const text of [
      "It leans up a half step.",
      "degree 5",
      "Which bar holds the note from outside the key?",
      "tell me",
    ])
      expect(leaks(CHROMATIC_STEP, text)).toBe(false);
  });

  test("in a minor key ♭3 is the key's own note and is not singled out; ♯4 still is", () => {
    const step = variant(CHROMATIC_STEP, {
      key: "A minor",
      starterCode: 'mel: n("<~ ~ ~ ~>").scale("A3:minor").s("piano")',
      solutions: ['mel: n("<4 3# 4 2>").scale("A3:minor").s("piano")'],
    });
    const f = answerForms(step, 'mel: n("<4 3 4 2>").scale("A3:minor").s("piano")');
    expect(f.some((x) => x.label.startsWith("chromatic degree #4"))).toBe(true);
    expect(f.some((x) => x.label.startsWith("chromatic degree b3"))).toBe(false);
  });

  test("keys of a solution's .scale(): parsing", () => {
    expect(scaleKeysOf('mel: n("0").scale("<C4:major!4 D4:major!4>")')).toEqual([
      { tonic: "C", mode: "major" },
      { tonic: "D", mode: "major" },
    ]);
    expect(scaleKeysOf('a: n("0").scale("F#3:harmonic:minor")\nb: n("0").scale("Eb4:mixolydian")')).toEqual([
      { tonic: "F#", mode: "harmonic minor" },
      { tonic: "Eb", mode: "mixolydian" },
    ]);
    expect(keyParts("D major")).toEqual({ tonic: "D", mode: "major" });
    expect(keyParts("Bb4:minor")).toEqual({ tonic: "Bb", mode: "minor" });
    expect(keyParts("verse")).toBeNull();
  });

  test("the key the tune moves to: in prose, in code, as a token, and by how far it moves", () => {
    for (const text of [
      "D major",
      "the key of D",
      'scale("D4:major")',
      "[[term:d-major]]",
      "It goes up a whole step.",
      "up 2 half steps",
      "two half steps higher",
      "It lifts by a whole step.",
    ])
      expect(leaks(KEY_PLAN_STEP, text)).toBe(true);
    for (const text of [
      "C major is where it starts.",
      "Your E♭ is too high: count the half steps again.",
      "Degree 7 is a half step below the home note.",
      "Sing bar 1, then bar 5: which is higher?",
      "D minor",
      "the note D",
    ])
      expect(leaks(KEY_PLAN_STEP, text)).toBe(false);
  });

  test("a single-key solution never makes its key a secret", () => {
    const step = variant(KEY_PLAN_STEP, {
      solutions: ['mel: n("<[0 2 4 2] [4 ~ 2 ~]>").scale("G4:major").s("piano")'],
      keyPlan: null,
      key: "C major",
    });
    expect(answerForms(step).some((f) => f.label.startsWith("key"))).toBe(false);
  });

  test("how early a line is pushed: the call, the fraction with the word, the note value", () => {
    for (const text of [
      ".early(1/8)",
      '.early("1/8")',
      "early by 1/8",
      "an eighth early",
      "one eighth note ahead",
      "1/8 of a bar early",
    ])
      expect(leaks(PUSH_STEP, text)).toBe(true);
    for (const text of [
      "Is the gap half a beat or a quarter of a beat?",
      "Your .early(1/4) moves it too far.",
      "The hats play eighth notes.",
      "a sixteenth early",
    ])
      expect(leaks(PUSH_STEP, text)).toBe(false);
  });
});

describe("the standard choices of U13–U17 and a form map", () => {
  test("option labels are read by their head", () => {
    expect(choicePhrase("Pushed: it arrives early")?.head).toBe("pushed");
    expect(choicePhrase("Compound: each beat splits in three")?.head).toBe("compound");
    expect(choicePhrase("Direct: it just lifts")?.head).toBe("direct");
    expect(choicePhrase("An applied vii°: a diminished chord a half step below its target")?.head).toBe(
      "an applied vii°",
    );
    expect(choicePhrase("Borrowed from the parallel minor (or major)")?.head).toBe(
      "borrowed from the parallel minor",
    );
    expect(choicePhrase("Something else")).toBeNull();
  });

  const choice = (answer: string) =>
    answerForms(
      variant(MODE_STEP, { solutions: [answer], prompt: "What did you hear?", hints: null, key: "C major" }),
    );

  test("each answer in the words prose uses for it; the other option is not withheld", () => {
    const cases: [string, string[], string[]][] = [
      [
        "Pushed: it arrives early",
        ["It is pushed.", "an anticipation", "It arrives early."],
        ["on the beat"],
      ],
      ["On the beat", ["It lands on the beat."], ["pushed", "early"]],
      ["Compound: each beat splits in three", ["compound meter", "each beat splits in three"], ["simple"]],
      ["Simple: each beat splits in two", ["a simple meter", "in twos"], ["compound"]],
      ["Direct: it just lifts", ["a direct modulation", "it just lifts"], ["a pivot chord"]],
      ["Through a pivot chord", ["a pivot", "through a pivot chord"], ["direct"]],
      ["No key change", ["There is no key change.", "It stays in the same key."], ["pivot"]],
      ["A secondary dominant: the V of another chord", ["a secondary dominant", "the V of ii"], ["borrowed"]],
      [
        "Borrowed from the parallel minor (or major)",
        ["It is borrowed.", "from the parallel minor"],
        ["secondary dominant"],
      ],
      ["In the key", ["It is in the key.", "diatonic"], ["borrowed"]],
    ];
    for (const [answer, yes, no] of cases) {
      const f = choice(answer);
      for (const text of yes)
        expect([answer, text, answerLeaks(text, f, 3).length > 0]).toEqual([answer, text, true]);
      for (const text of no)
        expect([answer, text, answerLeaks(text, f, 3).length > 0]).toEqual([answer, text, false]);
    }
  });

  test("a form map: the letters, the list of first bars, and any boundary the learner has not placed", () => {
    const step = variant(MODE_STEP, {
      solutions: ["A A B A", "1 9 17 25"],
      answerKind: "form",
      prompt: "Cut the tune into its sections and label them.",
      hints: null,
    });
    const f = answerForms(step, "sections A B A at bars 1 9 25");
    for (const text of [
      "AABA",
      "The sections start at bars 1, 9, 17 and 25.",
      "The bridge starts at bar 17.",
      "Loop [[bars:17-24]].",
    ])
      expect(answerLeaks(text, f, 3).length).toBeGreaterThan(0);
    for (const text of [
      "Your cut at bar 9 is right.",
      "Listen from bar 1 again.",
      "How many bars until the tune repeats?",
      "bar 16",
    ])
      expect(answerLeaks(text, f, 3)).toEqual([]);
  });
});
