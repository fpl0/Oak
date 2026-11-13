// Wave 5 context (wave5.md §10 items 12–13): the step's key and mode in full (degrees, do-based syllables, minor
// numerals), the vocabulary of bass lines, form, minor, blues, swing and the sound lessons as the learner meets it,
// and the analysed facts a review of C3, C4, C5 or X2 is anchored to.
import { describe, expect, test } from "bun:test";
import { buildOakContext } from "./context.ts";
import { prepareTurn } from "./prepare.ts";
import { PERSONA } from "./prompt/persona.ts";
import { factLines, formFacts, reviewFactsFrom, sectionName, stageFacts } from "./review-facts.ts";
import { makePorts } from "./testing/fakes.ts";
import {
  C3_FACTS,
  C5_FACTS,
  MINOR_DICTATION_STEP,
  SCALE_STEP,
  W5_LEARNER,
  W5_LESSON,
  w5GradeFor,
  X2_FACTS,
} from "./testing/wave5-fixtures.ts";
import type { TurnRequest } from "./types.ts";
import {
  keyScaleLine,
  modeOf,
  type Vocabulary,
  vocabularyOf,
  W5_TERMS,
  w5VocabularyLines,
  w5VocabularyOf,
} from "./vocabulary.ts";

const ALL_EARLY = [
  "term.solfege",
  "term.triad",
  "term.major-triad",
  "term.chord-symbol",
  "term.slash-chord",
  "term.roman-numeral",
];
const vocab = (terms: string[]): Vocabulary =>
  vocabularyOf({ count: terms.length, recent: terms, all: terms });

describe("the key and its mode", () => {
  test("mode names from key texts and Strudel scales", () => {
    expect(modeOf("A minor")).toBe("minor");
    expect(modeOf("F# harmonic minor")).toBe("harmonic minor");
    expect(modeOf("A3:harmonic:minor")).toBe("harmonic minor");
    expect(modeOf("C4:major:pentatonic")).toBe("major pentatonic");
    expect(modeOf("C4:minor:pentatonic")).toBe("minor pentatonic");
    expect(modeOf("C blues")).toBe("blues");
    expect(modeOf("Eb major")).toBe("major");
    expect(modeOf(null)).toBeNull();
  });

  test("a minor key: degrees, do-based syllables once solfège is met, minor numerals once numerals are met", () => {
    expect(keyScaleLine("A minor", vocab(ALL_EARLY))).toBe(
      "scale: minor · degrees 1 2 b3 4 5 b6 b7 · sung do re me fa sol le te (do-based: 1 is do) · numerals i ii° III iv v VI VII; V and vii° with the raised 7",
    );
    // A U03 learner before solfège and numerals: the degrees only.
    expect(keyScaleLine("A minor", vocab([]))).toBe("scale: minor · degrees 1 2 b3 4 5 b6 b7");
    expect(keyScaleLine("A harmonic minor", vocab(ALL_EARLY))).toContain("degrees 1 2 b3 4 5 b6 7");
    expect(keyScaleLine("A harmonic minor", vocab(ALL_EARLY))).toContain("sung do re me fa sol le ti");
    expect(keyScaleLine("A melodic minor", vocab(ALL_EARLY))).toContain("descending as natural minor: b7 b6");
    expect(keyScaleLine("C blues", vocab([]))).toBe(
      "scale: blues · degrees 1 b3 4 b5 5 b7 · in n() these scales count their own notes, so n is not degree - 1 here",
    );
    expect(keyScaleLine("C major", vocab(ALL_EARLY))).toBeNull();
    expect(keyScaleLine(null, vocab(ALL_EARLY))).toBeNull();
  });

  test("oak_context of a minor step names its key and mode and the minor scale, never the relative major", async () => {
    const ports = makePorts();
    ports.lessons.lessons.set(MINOR_DICTATION_STEP.lessonId, {
      ...W5_LESSON,
      id: MINOR_DICTATION_STEP.lessonId,
    });
    ports.lessons.steps.set(MINOR_DICTATION_STEP.id, MINOR_DICTATION_STEP);
    const terms = [...ALL_EARLY, W5_TERMS.naturalMinor];
    ports.progress.terms = { count: terms.length, recent: [...terms].reverse(), all: terms };
    const req: TurnRequest = {
      thread: { subjectKind: "lesson", subjectId: MINOR_DICTATION_STEP.lessonId },
      kind: "chat",
      userText: "Why does bar 2 sound dark?",
      stepId: MINOR_DICTATION_STEP.id,
    };
    const ctx = (await prepareTurn(req, ports)).user.oakContext;
    expect(ctx).toContain("key: A minor · meter: 4/4");
    expect(ctx).toMatch(/^scale: minor · degrees 1 2 b3 4 5 b6 b7 · sung do re me fa sol le te/m);
    expect(ctx).not.toContain("C major");
    expect(ctx).toMatch(/^vocabulary_more: .*natural minor yes/m);
    expect(ctx).toMatch(/^forms_more: .*minor degrees 1 2 b3 4 5 b6 b7 written \[\[deg:b3\]\]/m);
    expect(ctx).toContain("never relabel a minor piece in its relative major");
  });

  test("on a scale-builder step the scale line is the answer: withheld below the reveal, shown after it", async () => {
    const ports = makePorts();
    ports.lessons.lessons.set(SCALE_STEP.lessonId, { ...W5_LESSON, id: SCALE_STEP.lessonId });
    ports.lessons.steps.set(SCALE_STEP.id, SCALE_STEP);
    const req: TurnRequest = {
      thread: { subjectKind: "lesson", subjectId: SCALE_STEP.lessonId },
      kind: "chat",
      userText: "Which one am I missing?",
      learnerCode: W5_LEARNER[SCALE_STEP.id] as string,
      graderResult: w5GradeFor(SCALE_STEP),
      stepId: SCALE_STEP.id,
    };
    for (const rung of [0, 3] as const) {
      ports.progress.set(SCALE_STEP.id, { rung });
      const ctx = (await prepareTurn(req, ports)).user.oakContext;
      expect(ctx).toContain("scale: blues · its degrees are this step's answer: withheld until the reveal");
      expect(ctx).not.toContain("1 b3 4 b5 5 b7");
      expect(ctx).toContain("answer_kind: scale-builder");
    }
    ports.progress.set(SCALE_STEP.id, { rung: 4 });
    expect((await prepareTurn(req, ports)).user.oakContext).toContain(
      "scale: blues · degrees 1 b3 4 b5 5 b7",
    );
  });
});

describe("the Wave 5 vocabulary", () => {
  test("an early learner in a major key gets no Wave 5 lines; the first Wave 5 term brings them", () => {
    const early = { count: ALL_EARLY.length, recent: ALL_EARLY, all: ALL_EARLY };
    expect(w5VocabularyLines(w5VocabularyOf(early), vocabularyOf(early), "C major")).toEqual([]);
    const later = { ...early, all: [...ALL_EARLY, W5_TERMS.approachTone] };
    const [met, forms] = w5VocabularyLines(w5VocabularyOf(later), vocabularyOf(later), "C major");
    expect(met).toContain("approach tones yes");
    expect(met).toContain("verse and chorus no");
    expect(forms).toContain("bass notes by role: root, fifth, octave, approach tone");
    expect(forms).toContain("verse and chorus only as a preview");
    expect(forms).toContain("swing only as a preview");
  });

  test("a minor key brings the lines even before any Wave 5 term (U10.L01 is a minor lesson)", () => {
    const t = { count: 0, recent: [], all: [] };
    const lines = w5VocabularyLines(w5VocabularyOf(t), vocabularyOf(t), "C minor");
    expect(lines[1]).toContain(
      "minor keys only as a preview: describe them by sound and by degrees b3 b6 b7",
    );
  });

  test("by U11: sections, minors, pentatonic, blue notes, sevenths, the 12 bars, swing", () => {
    const terms = [
      ...ALL_EARLY,
      ...Object.values(W5_TERMS).filter((id) => !/filter|envelope|delay|harmonic-series/.test(id)),
    ];
    const t = { count: terms.length, recent: terms, all: terms };
    const [met, forms] = w5VocabularyLines(w5VocabularyOf(t), vocabularyOf(t), "C blues");
    expect(met).toContain("12-bar blues yes");
    expect(met).toContain("filters no");
    expect(forms).toContain("sections by the names the section ribbon prints (Verse, Chorus 2, Bridge)");
    expect(forms).toContain("as letters by first appearance (A B A B)");
    expect(forms).toContain("blue notes b3 b5 b7");
    expect(forms).toContain("dominant sevenths as [[chord:C7]] and [[rn:V7]]");
    expect(forms).toContain(
      "a 12-bar chorus counted bars 1-12 from the first full bar; quick change; turnaround",
    );
    expect(forms).toContain("swing as long-short eighths (shuffle)");
    expect(forms).toContain("sound controls only as a preview");
  });

  test("A1 side lessons: the sound words once met", () => {
    const terms = [W5_TERMS.harmonics, W5_TERMS.filter];
    const t = { count: terms.length, recent: terms, all: terms };
    const [, forms] = w5VocabularyLines(w5VocabularyOf(t), vocabularyOf(t), "C major");
    expect(forms).toContain(
      "sound words: harmonics, filter and cutoff; other sound controls only as a preview",
    );
  });

  test("the persona carries the Wave 5 rules", () => {
    expect(PERSONA).toContain("sung do-based (do re me fa sol le te; a raised 6 or 7 is la or ti)");
    expect(PERSONA).toContain("Never relabel a minor piece in its relative major.");
    expect(PERSONA).toContain("`n` counts that scale's own notes");
    expect(PERSONA).toContain(
      'Sections are named as Oak\'s section ribbon prints them ("Verse", "Chorus 2")',
    );
    expect(PERSONA).toContain("a scale to build (not its degrees or notes in any order)");
    expect(PERSONA).toContain("never the source: say what to listen for");
  });
});

describe("Wave 5 review facts", () => {
  test("sections count from the first full bar after a pickup (c4)", () => {
    const view = {
      kind: "sections" as const,
      sections: [
        { label: "verse", tag: "verse", bars: 4, startBar: 1, tracks: ["mel"], features: { energy: 0.4 } },
        { label: "chorus", tag: "chorus2", bars: 4, startBar: 5, tracks: ["mel"], features: { energy: 0.8 } },
      ],
      totalBars: 9,
      energy: [0.1, 0.4, 0.4, 0.4, 0.4, 0.8, 0.8, 0.8, 0.8],
    };
    const withPickup = formFacts({ form: view, pickupBars: true }, []);
    expect(withPickup?.sections.map((s) => [s.name, s.bars])).toEqual([
      ["Verse", [1, 4]],
      ["Chorus 2", [5, 8]],
    ]);
    const without = formFacts({ form: view }, []);
    expect(without?.sections.map((s) => s.bars)).toEqual([
      [2, 5],
      [6, 9],
    ]);
    expect(sectionName("prechorus3")).toBe("Prechorus 3");
  });

  test("an inconsistent arrange() says so; a through-composed piece gives its phrase letters", () => {
    const bad = reviewFactsFrom({
      form: { kind: "inconsistent", detail: "mel has 3 sections, chords 4", totalBars: 16, energy: [] },
    });
    expect(factLines(bad)).toContain("form: the arranged tracks disagree: mel has 3 sections, chords 4");
    const through = reviewFactsFrom({
      form: { kind: "through", letters: "AABA", totalBars: 16, energy: [] },
    });
    expect(factLines(through)).toContain("form: no arrange(); phrase letters AABA (4-bar phrases)");
  });

  test("checks carry scores and marks, never notes", () => {
    const check = {
      checkId: "melody-2",
      phrase: [5, 8] as const,
      layer: "melody",
      stage: "melody",
      open: false,
      score: null,
      passed: false,
      revealed: false,
      passAt: 0.85,
    };
    expect(stageFacts([check])[0]).toEqual({
      check: "melody-2",
      layer: "melody",
      stage: "melody",
      phrase: "phrases 5-8",
      score: null,
      passed: false,
      revealed: false,
      passAt: 0.85,
      open: false,
    });
    expect(factLines(reviewFactsFrom({ checks: [check] }))).toContain(
      "check melody-2: melody stage melody · phrases 5-8 · not checked yet · mark 85% · locked until the checks before it pass",
    );
  });

  test("the C3, C5 and X2 facts as oak_context lines", () => {
    const c3 = factLines(C3_FACTS);
    expect(c3).toContain(
      "section Chorus: bars 5-8 · letter B · tracks bass, chords, kick, mel, tamb · energy 96% · chords F (IV) G (V) C (I)",
    );
    expect(c3).toContain("bass: bass · 24 notes · roles root 24 · root on 100% of chord changes");
    const c5 = factLines(C5_FACTS);
    expect(c5).toContain(
      "blues: quick-change with a turnaround (bar 12 on V) · 1 chorus of 12 bars · every chord a dominant seventh",
    );
    expect(c5).toContain("blues_bars (1-12): C7 | F7 | C7 | C7 | F7 | F7 | C7 | C7 | G7 | F7 | C7 | G7");
    expect(c5).toContain("swing: hats ratio 2 · swung 8ths");
    const x2 = factLines(X2_FACTS);
    expect(x2).toContain("check bass: bass stage bass · phrases 1-3 · best 94% · mark 90% · passed");
    expect(x2).toContain("check melody-1: melody stage melody · phrase 1 · best 71% · mark 85% · open");
  });

  test("a review of a minor piece gets the minor scale line from its facts", () => {
    const ports = makePorts();
    const ctx = buildOakContext({
      conversation: { subjectKind: "capstone", subjectId: "C4", day: "2026-11-11", threadKind: "review" },
      conversationId: "capstone:C4:2026-11-11:review",
      kind: "review-capstone",
      lane: "review",
      effort: "high",
      limits: { maxWords: null, maxCards: 0 },
      isFirstTurn: true,
      facts: {
        tutorOpen: true,
        closedReason: null,
        title: "Grey Morning",
        released: false,
        transcriptionSource: null,
      },
      lesson: null,
      step: null,
      stepState: null,
      rung: 0,
      disclosure: 0,
      answerPolicy: "open",
      revealAllowed: false,
      apply: "preview_only",
      gradedContext: false,
      learnerCode: null,
      grade: null,
      progress: ports.progress.progress,
      terms: { count: 0, recent: [], all: [] },
      notes: [],
      handoffs: [],
      review: {
        title: "Grey Morning",
        code: "",
        brief: "",
        analysis: "",
        rubric: [],
        learnerNote: null,
        checklist: [],
        reference: null,
        totalBars: 16,
        revisions: 1,
        facts: { ...C3_FACTS, key: "A minor" },
      },
    } as unknown as Parameters<typeof buildOakContext>[0]);
    expect(ctx).toMatch(/^scale: minor · degrees 1 2 b3 4 5 b6 b7$/m);
  });
});
