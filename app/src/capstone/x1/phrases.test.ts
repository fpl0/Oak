import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { CapstoneCheckState, GradeResult, PhraseCheck, SongDef } from "@oak/api";
import { gradePhraseCheck, phraseCheckPassed } from "@oak/grader";
import { evalHeadless, midisOf } from "@oak/grader/testing";
import {
  applyResult,
  checkRows,
  chordAnswer,
  givenLines,
  phraseLoop,
  phraseText,
  revealedItems,
  rowLabel,
  sessionComplete,
  songCycles,
  x1Starter,
} from "./phrases.ts";

setDefaultTimeout(60_000);

// A made-up 16-bar tune in C (four 4-bar phrases), not any real song: the fixture only has to exercise the checks.
const MELODY =
  'n("<[0 2 4 2] [4 5 4 ~] [2 1 0 ~] [1@4] [0 2 4 2] [4 5 4 ~] [2 1 2 ~] [0@4] [4 4 5 5] [4 2 0 ~] [1 1 2 3] [4@4] [0 2 4 2] [4 5 4 ~] [2 1 1 ~] [0@4]>").scale("C4:major")';
const SONG = {
  id: "song.test-tune",
  title: "Test Tune",
  year: "trad",
  status: "trad",
  provenance: { source: "test", year: 1900 },
  verifiedBy: "test",
  key: { tonic: "C", mode: "major" },
  meter: "4/4",
  bpm: 90,
  form: "AABA",
  answerKey: {
    bars: 16,
    code: `setcpm(90/4)\n\nmel: ${MELODY}.s("piano")`,
    layers: { melody: MELODY },
    phrases: [
      [1, 4],
      [5, 8],
      [9, 12],
      [13, 16],
    ],
  },
} as unknown as SongDef;

const MEL_MATCH = {
  m: "melody",
  pitch: "key-relative",
  wPitch: 0.8,
  wRhythm: 0.2,
  rhythmTol: [1, 16],
} as unknown as PhraseCheck["matcher"];
const P1: PhraseCheck = { id: "phrase-1", phrase: 1, layer: "melody", pass: 0.85, matcher: MEL_MATCH };
const P2: PhraseCheck = { id: "phrase-2", phrase: 2, layer: "melody", pass: 0.85, matcher: MEL_MATCH };
const CHORDS: PhraseCheck = {
  id: "chords",
  phrase: [1, 4],
  layer: "chords",
  pass: 0.8,
  stages: ["bass", "quality", "rn"],
  matcher: {
    m: "harmony",
    level: "rn",
    qualityDepth: "triad",
    inversion: false,
    harmonicRhythm: "given",
  } as never,
};

const at = "2026-11-11T10:00:00.000Z";
const result = (o: Partial<GradeResult> & { revealed?: boolean }): GradeResult =>
  ({
    status: "pass",
    score: 0.9,
    diagnostics: [],
    messages: [],
    dims: {},
    assist: { rung: 0, tutorHints: 0, extraReplays: 0, revealed: o.revealed ?? false },
    ...o,
  }) as unknown as GradeResult;

describe("checkRows", () => {
  test("one row per phrase; a staged check has a row per stage, each open after the one before", () => {
    const rows = checkRows([P1, CHORDS], [], {});
    expect(rows.map((r) => r.key)).toEqual(["phrase-1", "chords.bass", "chords.quality", "chords.rn"]);
    expect(rows.map((r) => r.open)).toEqual([true, true, false, false]);
    const after = checkRows([CHORDS], [], {
      "chords.bass": { score: 0.9, passed: true, revealed: false, attempts: 1 },
    });
    expect(after.map((r) => r.open)).toEqual([true, true, false]);
    const revealed = checkRows([CHORDS], [], {
      "chords.bass": { score: 0.5, passed: false, revealed: true, attempts: 2 },
      "chords.quality": { score: 0.85, passed: true, revealed: false, attempts: 1 },
    });
    expect(revealed.map((r) => r.open)).toEqual([true, true, true]);
  });

  test("the server's rows merge with checks graded here: best score, passed stays passed", () => {
    const server: CapstoneCheckState[] = [
      {
        checkId: "phrase-1",
        phrase: 1,
        layer: "melody",
        stage: null,
        open: true,
        score: 0.7,
        passed: false,
        revealed: false,
        attempts: 3,
        lastAt: at,
      },
    ];
    const rows = checkRows([P1, P2], server, {
      "phrase-1": { score: 0.9, passed: true, revealed: false, attempts: 1 },
    });
    expect(rows[0]).toMatchObject({ score: 0.9, passed: true, attempts: 3 });
    expect(rows[1]).toMatchObject({ score: null, passed: false, attempts: 0 });
    expect(sessionComplete(rows)).toBe(false);
  });

  test("applyResult: a revealed result never counts as passed; a session completes when all settle", () => {
    const a = applyResult(undefined, result({ score: 0.95, revealed: true }), true);
    expect(a).toEqual({ score: 0.95, passed: false, revealed: true, attempts: 1 });
    const b = applyResult(a, result({ score: 0.6, status: "fail" }), false);
    expect(b).toEqual({ score: 0.95, passed: false, revealed: true, attempts: 2 });
    const rows = checkRows([P1, P2], [], {
      "phrase-1": a,
      "phrase-2": applyResult(undefined, result({}), true),
    });
    expect(sessionComplete(rows)).toBe(true);
    expect(revealedItems(rows)).toEqual(["phrase 1"]);
    expect(sessionComplete([])).toBe(false);
  });
});

describe("chordAnswer", () => {
  test("symbols in lead-sheet form and numerals from @oak/theory, only the phrase's bars", () => {
    const song = {
      ...SONG,
      answerKey: {
        ...SONG.answerKey,
        chords: [
          { bar: 1, beat: 1, symbol: "C" },
          { bar: 2, beat: 1, symbol: "G7" },
          { bar: 3, beat: 1, symbol: "Am" },
          { bar: 5, beat: 1, symbol: "F" },
        ],
      },
    } as SongDef;
    expect(chordAnswer(song, 1)).toEqual([
      { bar: 1, beat: 1, symbol: "C", rn: "I" },
      { bar: 2, beat: 1, symbol: "G7", rn: "V7" },
      { bar: 3, beat: 1, symbol: "Am", rn: "vi" },
    ]);
    expect(chordAnswer(song, [2, 2]).map((c) => c.rn)).toEqual(["IV"]);
  });
});

describe("labels and the givens", () => {
  test("labels", () => {
    expect(phraseText(2)).toBe("Phrase 2");
    expect(phraseText([1, 4])).toBe("Phrases 1–4");
    expect(rowLabel({ phrase: [1, 4], layer: "chords", stage: "quality" })).toBe(
      "Phrases 1–4 · chords: chord qualities",
    );
  });
  test("the givens name the meter, key, tonic, tempo and pickup", () => {
    const g = givenLines({ ...SONG, pickup: { units: [1, 1] } } as SongDef);
    expect(g.map((x) => x.label)).toEqual(["Meter", "Key", "Tonic (1)", "Tempo", "Pickup"]);
    expect(g.at(-1)?.value).toBe("1 beat before bar 1 (bar 0, from beat 4)");
    expect(givenLines(SONG).at(-1)?.value).toContain("none");
  });
  test("phrase loops: whole bars; with a pickup the pickup bar is cycle 0", () => {
    expect(phraseLoop(SONG, 2)).toEqual({ fromBar: 4, bars: 4 });
    expect(phraseLoop(SONG, [1, 4])).toEqual({ fromBar: 0, bars: 16 });
    expect(phraseLoop(SONG, 9)).toBeNull();
    const withPickup = { ...SONG, pickup: { units: [1, 1] } } as SongDef;
    expect(phraseLoop(withPickup, 2)).toEqual({ fromBar: 4, bars: 5 });
    expect(songCycles(withPickup)).toBe(17);
  });
});

describe("the starter and a real phrase check (headless Strudel, capstone mode)", () => {
  test("the starter runs and is silent", async () => {
    const code = x1Starter(SONG);
    expect(code).toContain("setcpm(90/4)");
    const ev = await evalHeadless(code, 16);
    expect(ev.tracks).toEqual(["mel"]);
    expect(await midisOf(code, 16)).toEqual([]);
  });

  const ctx = {
    params: {},
    attemptNo: 1,
    firstAttempt: true,
    rung: 0 as const,
    tutorHints: 0,
    extraReplays: 0,
    lint: {
      profile: "graded" as const,
      unlocked: new Set<never>(),
      allowPreview: true,
      meter: "4/4" as const,
      key: null,
    },
  };

  test("phrase 1 written right passes in another octave (key-relative); a wrong phrase 1 does not", async () => {
    const right =
      'setcpm(90/4)\n\nmel: n("<[0 2 4 2] [4 5 4 ~] [2 1 0 ~] [1@4]>").scale("C5:major").s("piano")';
    const r = await gradePhraseCheck({ capstoneId: "X1", check: P1, song: SONG, code: right, ctx });
    expect(phraseCheckPassed(r)).toBe(true);
    const wrong =
      'setcpm(90/4)\n\nmel: n("<[0 1 2 3] [4 3 2 ~] [1 1 0 ~] [4@4]>").scale("C4:major").s("piano")';
    const w = await gradePhraseCheck({ capstoneId: "X1", check: P1, song: SONG, code: wrong, ctx });
    expect(phraseCheckPassed(w)).toBe(false);
  });

  test("hint 4 (Reveal) gives a result that is revealed and never passes", async () => {
    const code =
      'setcpm(90/4)\n\nmel: n("<[0 2 4 2] [4 5 4 ~] [2 1 0 ~] [1@4]>").scale("C4:major").s("piano")';
    const r = await gradePhraseCheck({
      capstoneId: "X1",
      check: P1,
      song: SONG,
      code,
      ctx: { ...ctx, rung: 4 as never },
    });
    expect(r.assist.revealed).toBe(true);
    expect(phraseCheckPassed(r)).toBe(false);
  });
});
