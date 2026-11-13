// Wave 4 in the panel (pure parts): chord and numeral chips that know where they sound and when they are still a
// preview, the learner's answer for the new step kinds and a transcription, review targets, the drill debrief.
import { beforeEach, describe, expect, test } from "bun:test";
import type { TermEntry, ToolEntry } from "@oak/content-kit";
import { keyOf } from "@oak/theory";
import {
  answerText,
  askReview,
  askTranscriptionReview,
  buildTurnRequest,
  chipsOf,
  debriefDrill,
  setAvailability,
  setSubject,
  type TutorAnswer,
  type TutorSubject,
  useTutorContext,
} from "./context.ts";
import { barsPhrase, barsWhere, chordMapFromCode, runsOf } from "./harmony-chips.ts";
import { describeToken, type TokenContext } from "./music-tokens.ts";

const C = keyOf("C major");
const G = keyOf("G major");
const SONG = 'chords: chord("<C G Am F C G [F G] C>").voicing().s("piano")';

describe("where a chord sounds", () => {
  test("a chord() pattern read bar by bar, with numerals from @oak/theory", () => {
    const map = chordMapFromCode(SONG, C);
    expect(map.map((c) => [c.bar, c.symbol, c.rn])).toEqual([
      [1, "C", "I"],
      [2, "G", "V"],
      [3, "Am", "vi"],
      [4, "F", "IV"],
      [5, "C", "I"],
      [6, "G", "V"],
      [7, "F", "IV"],
      [7, "G", "V"],
      [8, "C", "I"],
    ]);
    expect(map[6]?.beat).toBe(1);
    expect(map[7]?.beat).toBe(3);
    // One bar without angle brackets; rests and unreadable symbols are skipped.
    expect(chordMapFromCode('chord("C ~ Zz F")', C).map((c) => [c.bar, c.symbol])).toEqual([
      [1, "C"],
      [1, "F"],
    ]);
    expect(chordMapFromCode('n("0 2 4")', C)).toEqual([]);
  });

  test("a chord token or a numeral finds its bars; same root, quality and bass", () => {
    const map = chordMapFromCode(SONG, C);
    expect(barsWhere(map, { kind: "chord", value: "G" }, C)).toEqual([2, 6, 7]);
    expect(barsWhere(map, { kind: "rn", value: "vi" }, C)).toEqual([3]);
    expect(barsWhere(map, { kind: "rn", value: "V" }, C)).toEqual([2, 6, 7]);
    expect(barsWhere(map, { kind: "chord", value: "G/B" }, C)).toEqual([]);
    expect(barsWhere(map, { kind: "chord", value: "Am7" }, C)).toEqual([]);
    // In G the numeral vi is Em, which this piece does not play.
    expect(barsWhere(map, { kind: "rn", value: "vi" }, G)).toEqual([]);
    expect(runsOf([2, 3, 6, 7, 8])).toEqual([
      { from: 2, to: 3 },
      { from: 6, to: 8 },
    ]);
    expect(barsPhrase([3])).toBe("bar 3");
    expect(barsPhrase([2, 6, 7])).toBe("bars 2, 6 and 7");
  });
});

const CTX: TokenContext = {
  terms: [] as TermEntry[],
  tools: [] as ToolEntry[],
  introduced: new Set(["term.triad", "term.chord-symbol"]),
  unlocked: null,
  key: C,
  harmony: chordMapFromCode(SONG, C),
};

describe("chord and numeral chips (Wave 4 vocabulary)", () => {
  test("a chord chip lights its first bars, says where it sounds and plays the chord", () => {
    const info = describeToken({ kind: "chord", value: "G" }, CTX);
    expect(info?.highlight).toEqual({ from: 2, to: 2 });
    expect(info?.where).toEqual([2, 6, 7]);
    expect(info?.title).toContain("Sounds in bars 2, 6 and 7");
    expect(info?.aria).toBe("chord G, in bars 2, 6 and 7");
    expect(info?.preview).toBeUndefined();
    // G B D from G3.
    expect(info?.play).toEqual([[55, 59, 62]]);
  });

  test("a slash chord sounds its bass below the stack", () => {
    const info = describeToken({ kind: "chord", value: "G/B" }, CTX);
    expect(info?.label).toBe("G/B");
    expect(info?.play?.[0]?.[0]).toBe(47);
  });

  test("numerals before U06.L02 carry the preview badge; after, not", () => {
    const before = describeToken({ kind: "rn", value: "vi" }, CTX);
    expect(before?.preview).toBe(true);
    expect(before?.title).toMatch(/^Roman numerals come later\./);
    expect(before?.highlight).toEqual({ from: 3, to: 3 });
    const after = describeToken(
      { kind: "rn", value: "vi" },
      { ...CTX, introduced: new Set(["term.chord-symbol", "term.roman-numeral"]) },
    );
    expect(after?.preview).toBeUndefined();
    expect(after?.aria).toBe("Roman numeral vi, in bar 3");
  });

  test("chord symbols before U05.L04 are a preview; unknown vocabulary gives no badge", () => {
    expect(describeToken({ kind: "chord", value: "Am" }, { ...CTX, introduced: new Set() })?.preview).toBe(
      true,
    );
    expect(
      describeToken({ kind: "chord", value: "Am" }, { ...CTX, introduced: null })?.preview,
    ).toBeUndefined();
  });

  test("without a chord map the chip only plays", () => {
    const { harmony: _h, ...noMap } = CTX;
    const info = describeToken({ kind: "chord", value: "G" }, noMap);
    expect(info?.highlight).toBeUndefined();
    expect(info?.title).toContain("Click to hear it.");
  });
});

describe("the learner's answer for the new step kinds", () => {
  const cases: [TutorAnswer, RegExp, string][] = [
    [
      {
        kind: "chords",
        chords: [
          { bar: 1, symbol: "G" },
          { bar: 2, symbol: "E" },
        ],
        key: G,
      },
      /bar 2: E/,
      "Your chords · 2 chords",
    ],
    [
      { kind: "numerals", numerals: [{ bar: 3, rn: "VI" }], key: C },
      /Numerals I placed \(in C major\):\nbar 3: VI/,
      "Your numerals · 1 numeral",
    ],
    [
      {
        kind: "slots",
        prompt: "The job of each chord",
        slots: [
          { label: "bar 1", value: "tonic" },
          { label: "bar 2", value: null },
        ],
      },
      /2\. bar 2: \(not answered\)/,
      "Your answers · 1 of 2",
    ],
    [
      {
        kind: "stages",
        stage: "quality",
        answers: [
          { stage: "bass", values: ["1", "5", "6", "4"], passed: true },
          { stage: "quality", values: ["maj", "maj"] },
        ],
      },
      /bass notes: 1 5 6 4 \(passed\)\nchord qualities: maj maj/,
      "Your chord qualities stage",
    ],
    [
      {
        kind: "voicing",
        code: 'chords: note("<[c4,e4,g4] [g4,b4,d5]>")',
        chords: [
          ["c4", "e4", "g4"],
          ["g4", "b4", "d5"],
        ],
      },
      /as voiced, chord by chord: c4 e4 g4 \| g4 b4 d5/,
      "Your voicing · 1 lines",
    ],
    [
      {
        kind: "drill-set",
        family: "fam.har.rn",
        trials: [
          { n: 1, asked: "loop 1", answered: "I V vi IV", ok: true },
          { n: 2, answered: "I IV V I", ok: false },
        ],
      },
      /2\. I answered I IV V I, not right/,
      "Your set · 1 of 2",
    ],
  ];
  test.each(cases)("%# answer text and chip", (answer, text, chip) => {
    expect(answerText(answer)).toMatch(text);
    const s: TutorSubject = {
      thread: { subjectKind: "lesson", subjectId: "U06.L02" },
      title: "t",
      tutorOpen: true,
      lessonId: "U06.L02",
      stepId: "S5",
      answer,
    };
    expect(chipsOf(s).find((c) => c.id === "answer")?.label).toBe(chip);
  });

  test("a transcription sends the learner's code and the per-bar check, never a source", () => {
    const answer: TutorAnswer = {
      kind: "transcription",
      code: 'bass: n("<0 4 4 3>").scale("C2:major")',
      layer: "bass",
      diff: [
        { bar: 1, status: "match" },
        { bar: 3, status: "differs", note: "bass" },
        { bar: 4, status: "unchecked" },
      ],
    };
    const subject: TutorSubject = {
      thread: { subjectKind: "transcription", subjectId: "tr-1" },
      title: "Ladder L2",
      tutorOpen: true,
      answer,
    };
    const req = buildTurnRequest(subject, "chat", "Where should I listen?");
    expect(req.learnerCode).toContain('bass: n("<0 4 4 3>")');
    expect(req.learnerCode).toContain("// bar 3: differs (bass)");
    expect(req.learnerCode).toContain("// bar 4: not checked yet");
    expect(Object.keys(answer)).not.toContain("source");
    expect(chipsOf(subject).find((c) => c.id === "answer")?.label).toBe(
      "Your transcription · 3 bars, 1 to recheck",
    );
  });
});

describe("review targets and the drill debrief", () => {
  beforeEach(() => {
    useTutorContext.setState({ subject: null, queue: [], notice: null, availability: "unknown" });
    setAvailability({ tutor: "ready", tutorBackend: "claude-cli" });
  });

  test("a capstone review of one album version names it; a transcription review names its version", () => {
    const a = askReview({
      capstoneId: "C2",
      title: "Four-Chord Song",
      code: SONG,
      albumTrackId: "trk-c2",
      albumVersion: 2,
    });
    expect(a.ok && a.ask.request).toMatchObject({
      kind: "review-capstone",
      albumTrackId: "trk-c2",
      albumVersion: 2,
    });
    const plain = askReview({ capstoneId: "C2", title: "Four-Chord Song", code: SONG });
    expect(plain.ok && "albumTrackId" in plain.ask.request).toBe(false);
    const t = askTranscriptionReview({
      projectId: "tr-1",
      title: "Kitchen radio",
      code: 'bass: n("0")',
      version: 3,
    });
    expect(t.ok && t.ask.request).toMatchObject({
      kind: "review-transcription",
      thread: { subjectKind: "transcription", subjectId: "tr-1" },
      transcriptionVersion: 3,
    });
    // A chat on the same subject never carries a review target.
    const chat = buildTurnRequest(
      {
        thread: { subjectKind: "capstone", subjectId: "C2" },
        title: "C2",
        tutorOpen: true,
        albumTrackId: "trk",
        albumVersion: 1,
      },
      "chat",
      "Hi",
    );
    expect("albumTrackId" in chat).toBe(false);
  });

  test("after a set the drill opens the tutor with the trials as the answer", () => {
    const thread = { subjectKind: "drill" as const, subjectId: "fam.har.rn" };
    setSubject({ thread, title: "Numerals", tutorOpen: false });
    debriefDrill(thread, { family: "fam.har.rn", trials: [{ n: 1, answered: "I V vi IV", ok: true }] });
    const s = useTutorContext.getState().subject;
    expect(s?.tutorOpen).toBe(true);
    expect(s?.answer?.kind).toBe("drill-set");
    expect(buildTurnRequest(s as TutorSubject, "chat", "How did I do?").learnerCode).toContain(
      "1. I answered I V vi IV, right",
    );
  });
});
