// Wave 4 context and persona fixes (wave4.md §5.6, wave3.md §0): the step's key, the vocabulary the learner has
// met (degree numbers until solfège, chord and numeral forms), the answer kind, the review facts and target.
import { describe, expect, test } from "bun:test";
import { buildOakContext } from "./context.ts";
import { prepareTurn } from "./prepare.ts";
import { PERSONA } from "./prompt/persona.ts";
import { lessonContextView } from "./redaction.ts";
import { factLines, midiName, motifsOf, rangesOf, reviewFactsFrom } from "./review-facts.ts";
import { makePorts } from "./testing/fakes.ts";
import { stepState } from "./testing/fixtures.ts";
import { CHORD_STEP, RN_STEP, SONG_FACTS, SONG_REVIEW_SOURCE, W4_LESSON } from "./testing/wave4-fixtures.ts";
import type { TurnRequest } from "./types.ts";
import { introducedSet, vocabularyLines, vocabularyOf } from "./vocabulary.ts";

const lesson = { subjectKind: "lesson", subjectId: W4_LESSON.id } as const;

function w4Ports(terms: string[], over: { all?: boolean } = {}) {
  const ports = makePorts();
  ports.lessons.lessons.set(W4_LESSON.id, W4_LESSON);
  ports.lessons.steps.set(RN_STEP.id, RN_STEP);
  ports.lessons.steps.set(CHORD_STEP.id, CHORD_STEP);
  ports.progress.terms = {
    count: terms.length,
    recent: [...terms].reverse().slice(0, 30),
    ...(over.all === false ? {} : { all: terms }),
  };
  return ports;
}

const chat = (stepId: string): TurnRequest => ({ thread: lesson, kind: "chat", userText: "Why?", stepId });

/** Every term up to U06.L02, in course order (content/terms.ts). */
const THROUGH_U06_L02 = [
  "term.tonic",
  "term.major-scale",
  "term.scale-degree",
  "term.resolution",
  "term.leading-tone",
  "term.key-signature",
  "term.circle-of-fifths",
  "term.solfege",
  "term.leap",
  "term.legato",
  "term.interval",
  "term.interval-quality",
  "term.consonance",
  "term.dissonance",
  "term.tritone",
  "term.triad",
  "term.root",
  "term.major-triad",
  "term.minor-triad",
  "term.diminished-triad",
  "term.augmented-triad",
  "term.chord-symbol",
  "term.arpeggio",
  "term.inversion",
  "term.slash-chord",
  "term.bass-clef",
  "term.grand-staff",
  "term.voice-leading",
  "term.common-tone",
  "term.voicing",
  "term.diatonic",
  "term.roman-numeral",
  // 30 more to push solfège out of the 30 most recent, as any learner past U07 has.
  ...Array.from({ length: 30 }, (_, i) => `term.later-${i}`),
];

describe("the step's key, not only the lesson's", () => {
  test("oak_context and get_lesson_context name the step's key (G) inside a lesson in C", async () => {
    const ports = w4Ports(THROUGH_U06_L02);
    const prep = await prepareTurn(chat(CHORD_STEP.id), ports);
    expect(prep.user.oakContext).toContain("key: G major · meter: 4/4");
    const view = lessonContextView(W4_LESSON, CHORD_STEP, stepState(), 0);
    expect(view.step?.key).toBe("G major");
    expect(view.lesson.key).toBe("C major");
    // A step without its own key falls back to the lesson's.
    const plain = lessonContextView(W4_LESSON, { ...CHORD_STEP, key: null }, stepState(), 0);
    expect(plain.step?.key).toBe("C major");
  });

  test("the answer kind is named so the persona knows which forms to withhold", async () => {
    const prep = await prepareTurn(chat(RN_STEP.id), w4Ports(THROUGH_U06_L02));
    expect(prep.user.oakContext).toContain("answer_kind: rn-palette");
  });
});

describe("vocabulary: degree numbers until solfège; chord and numeral forms as they are met", () => {
  test("a U03 learner before U03.L08 sings with numbers only; chords are notes together", () => {
    const v = vocabularyOf({ count: 6, recent: THROUGH_U06_L02.slice(0, 6).reverse() });
    const [met, forms] = vocabularyLines(v);
    expect(met).toContain("solfège no");
    expect(forms).toContain("sing with degree numbers only, no syllables");
    expect(forms).toContain("chords as notes sounding together, by degree numbers");
    expect(forms).toContain("no [[rn:…]] yet");
    expect(forms).toContain("function words only as a preview");
  });

  test("after U05.L01 (triads) but before chord symbols: stacked degrees, symbols only as a preview", () => {
    const upTo = THROUGH_U06_L02.indexOf("term.root") + 1;
    const [, forms] = vocabularyLines(vocabularyOf({ count: upTo, recent: THROUGH_U06_L02.slice(0, upTo) }));
    expect(forms).toContain('chords as stacked degrees ("1-3-5 on degree 1"); [[chord:…]] only as a preview');
  });

  test("at U06.L02 every form is open, and solfège stays known after it leaves the recent 30", () => {
    const terms = {
      count: THROUGH_U06_L02.length,
      recent: [...THROUGH_U06_L02].reverse().slice(0, 30),
      all: THROUGH_U06_L02,
    };
    expect(terms.recent).not.toContain("term.solfege");
    expect(introducedSet(terms).has("term.solfege")).toBe(true);
    const [met, forms] = vocabularyLines(vocabularyOf(terms));
    expect(met).toContain("solfège yes");
    expect(met).toContain("roman numerals yes");
    expect(forms).toContain("movable-do syllables allowed");
    expect(forms).toContain("chords as [[chord:…]] with slash chords");
    expect(forms).toContain("numerals as [[rn:…]]");
    // Function and cadences come at U06.L03-L04: still previews here.
    expect(met).toContain("function no");
    expect(forms).toContain("cadence names only as a preview");
  });

  test("the context carries both lines; without the full list it falls back to the recent terms", async () => {
    const full = await prepareTurn(chat(RN_STEP.id), w4Ports(THROUGH_U06_L02));
    expect(full.user.oakContext).toMatch(/^vocabulary: solfège yes/m);
    expect(full.user.oakContext).toMatch(/^forms: sing with degree numbers, movable-do syllables allowed/m);
    const partial = await prepareTurn(chat(RN_STEP.id), w4Ports(THROUGH_U06_L02, { all: false }));
    // The conservative reading: numbers only, never a syllable the learner may not have met.
    expect(partial.user.oakContext).toMatch(/^vocabulary: solfège no/m);
  });

  test("the persona follows the lines: numbers until solfège, forms, the step's key, withheld chords", () => {
    expect(PERSONA).toContain("use degree numbers until `forms` in the context allows movable-do syllables");
    expect(PERSONA).toContain("The `key` line is the key of the current step");
    expect(PERSONA).toContain("`[[rn:…]]` once Roman numerals are met");
    expect(PERSONA).toContain("no expected chord symbol, numeral or note, in a token or in words");
    expect(PERSONA).toContain("Never name a chord, cadence or motif the facts do not show");
  });
});

describe("review facts", () => {
  test("midi names", () => {
    expect([60, 61, 69, 70, 36, 59].map(midiName)).toEqual(["C4", "C#4", "A4", "Bb4", "C2", "B3"]);
  });

  test("motifs: an exact return, a transposed one (a sequence), merged runs; rhythm-only needs 3 notes", () => {
    const line = (bar: number, midis: number[]) =>
      midis.map((midi, i) => ({ track: "mel", midi, bar, beat: i + 1 }));
    const notes = [
      ...line(1, [60, 64, 67, 64]),
      ...line(2, [67, 65, 62]),
      ...line(3, [62, 66, 69, 66]), // bar 1 up a whole step
      ...line(5, [60, 64, 67, 64]),
      ...line(6, [67, 65, 62]),
      ...line(7, [61, 63, 70]), // bar 2's rhythm, other notes
    ];
    expect(motifsOf("mel", notes)).toEqual([
      { track: "mel", bars: [1, 1], at: [[3, 3]], how: "transposed" },
      { track: "mel", bars: [1, 2], at: [[5, 6]], how: "exact" },
      { track: "mel", bars: [2, 2], at: [[7, 7]], how: "rhythm" },
    ]);
    expect(rangesOf(notes)).toEqual([{ track: "mel", low: "C4", high: "Bb4", semitones: 10, highBar: 7 }]);
  });

  test("from a harmony view and an analysis summary, rendered one fact per line", () => {
    const facts = reviewFactsFrom({
      view: {
        key: { tonic: "C", mode: "major" },
        bars: 2,
        pickup: false,
        slots: [
          { symbol: "F", rn: "IV", function: "PD" },
          { symbol: "G", rn: "V", function: "D" },
          { symbol: "C", rn: "I", function: "T" },
        ],
        beats: [
          { bar: 1, beat: 1, chord: 0, change: true },
          { bar: 1, beat: 3, chord: 1, change: true },
          { bar: 2, beat: 1, chord: 2, change: true },
          { bar: 2, beat: 2, chord: 2, change: false },
        ],
        harmonicRhythm: [2, 1],
        chordToneShare: 0.75,
      },
      analysis: { cadences: [{ bar: 2, type: "PAC" }], schemas: [] },
      meter: "4/4",
    });
    expect(factLines(facts)).toEqual([
      "facts: key C major · meter 4/4 · 2 bars · pickup no",
      "chords bar 1: F (IV, PD) then G (V, D) on beat 3",
      "chords bar 2: C (I, T)",
      "harmonic_rhythm (changes per bar): 2 1",
      "cadence: bar 2 authentic cadence (V to I, melody on 1)",
      "motif: no bar of the melody returns",
      "chord_tones_on_strong_beats: 75%",
    ]);
  });

  test("a capstone review's context carries the facts and the album version it is about", () => {
    const ports = makePorts();
    ports.lessons.reviews.set("capstone:C2", SONG_REVIEW_SOURCE);
    return prepareTurn(
      {
        thread: { subjectKind: "capstone", subjectId: "C2" },
        kind: "review-capstone",
        userText: "",
        albumTrackId: "trk-c2",
        albumVersion: 2,
      },
      ports,
    ).then((prep) => {
      const ctx = prep.user.oakContext;
      expect(ctx).toContain("review_target: album track trk-c2 version 2");
      expect(ctx).toContain("chords bar 7: F (IV, PD) then G (V, D) on beat 3");
      expect(ctx).toContain("cadence: bar 8 authentic cadence (V to I, melody on 1)");
      expect(ctx).toContain("schema: schema.axis bars 1-4");
      expect(ctx).toContain("motif: mel bar 1 returns exact at bar 5");
      expect(ctx).toContain("range: mel C4-A4 (9 semitones), highest note in bar 6");
      expect(prep.ctx.review?.target).toEqual({ kind: "album", trackId: "trk-c2", version: 2 });
      expect(prep.ctx.effort).toBe("high");
      // The context is a pure function of the turn: the same inputs give the same bytes.
      expect(buildOakContext(prep.ctx)).toBe(ctx);
    });
  });

  test("a target of the wrong kind is refused before anything runs", async () => {
    const ports = makePorts();
    ports.lessons.reviews.set("capstone:C2", SONG_REVIEW_SOURCE);
    await expect(
      prepareTurn(
        {
          thread: { subjectKind: "capstone", subjectId: "C2" },
          kind: "review-capstone",
          userText: "",
          transcriptionVersion: 1,
        },
        ports,
      ),
    ).rejects.toThrow();
    expect(SONG_FACTS.bars).toBe(8);
  });
});
