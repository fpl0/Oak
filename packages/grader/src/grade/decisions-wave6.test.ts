// The learner's decisions of 2026-11-13 that the grader carries (docs/decisions.md "Confirmed by you"), each pinned
// on a song of the repertoire with real Strudel output.
// d11: reading the changes of ladder L6 (and X2, L8, CF-T), a chord with the right root and the wrong quality earns
//      NO credit for its bar: a minor chord for a dominant, and a plain triad where the song has a seventh chord.
//      The pass mark stays 0.85. Steps that use the numeral matcher without `wrongQuality: "none"` keep their credit.
// d12: ladder L5 and every later level require the recording's key: a transposed answer fails with a message that
//      names its key and the recording's. L1–L4 and the X1 phrase checks keep the `melody.transposed` note.
// Music: Careless Love in F, one chord a bar, F C7 F F | F F C7 C7 | F F B♭ B♭ | F C7 F F (content/repertoire).
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { GradeResult, Matcher, PhraseCheck, SongDef } from "@oak/content-kit";
import careless from "../../../../content/repertoire/careless-love/song.ts";
import { headlessDeps, strudel } from "../analyze/__support__/fixtures.ts";
import { renderFeedback } from "../feedback/catalog.ts";
import { runMatcher } from "../match/index.ts";
import { gradeWith } from "./index.ts";
import { ladderGradeRequest } from "./ladder.ts";
import { phraseCheckRequest } from "./phrase-check.ts";
import {
  SONG_LADDER_MATCHERS,
  SONG_LADDER_PASS,
  songLadderPassed,
  songLadderRequest,
} from "./song-ladder.ts";
import { STANDARD_LADDER_MATCHERS, STANDARD_LADDER_PASS } from "./standard-ladder.ts";

setDefaultTimeout(60_000);
const deps = headlessDeps();
const song = careless as SongDef;
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
    allowPreview: false,
    meter: "4/4" as const,
    key: null,
  },
};
const KEY = "F C7 F F F F C7 C7 F F Bb Bb F C7 F F";
const chords = (bars: string): string => `setcpm(88/4)\nchords: chord("<${bars}>").voicing().s("piano")`;
const changes = {
  itemId: "lad.6.song.careless-love",
  level: 6 as const,
  phrase: [1, 4] as [number, number],
  stage: "changes" as const,
};
const gradeChanges = (bars: string): Promise<GradeResult> =>
  gradeWith(songLadderRequest({ item: changes, song, code: chords(bars), ctx }), deps);
const texts = (r: GradeResult): string[] => (r.diagnostics ?? []).map((d) => renderFeedback(d));

describe("d11: the right root with the wrong quality earns no credit for its bar", () => {
  test("the matchers of L6 and L8 read sevenths and give a wrong quality nothing; the mark stays 0.85", () => {
    for (const m of [SONG_LADDER_MATCHERS.changes, STANDARD_LADDER_MATCHERS.changes])
      expect(m).toMatchObject({ m: "harmony", level: "rn", qualityDepth: "seventh", wrongQuality: "none" });
    expect(SONG_LADDER_PASS[6].changes).toBe(0.85);
    expect(STANDARD_LADDER_PASS.changes).toBe(0.85);
  });
  test("Careless Love: the answer key passes", async () => {
    const r = await gradeChanges(KEY);
    expect(r.score).toBe(1);
    expect(songLadderPassed(changes, r)).toBe(true);
  });
  test("every V7 written minor fails, and the first such bar is named", async () => {
    const r = await gradeChanges(KEY.replace(/C7/g, "Cm"));
    expect(r.status).toBe("fail");
    // Four of sixteen bars earn nothing: 12/16.
    expect(r.score).toBeCloseTo(0.75, 6);
    const first = (r.diagnostics ?? []).find((d) => d.where?.bar !== undefined);
    expect(first?.where?.bar).toBe(2);
    expect(texts(r)[0]).toBe("Chord 2: v → V7. Upper case = major, lower = minor.");
    expect((r.diagnostics ?? []).filter((d) => d.id === "harmony.rn-case").map((d) => d.where?.bar)).toEqual([
      2, 7, 8, 14,
    ]);
  });
  test("every V7 written as a plain V fails too, and says what the chord is missing", async () => {
    const r = await gradeChanges(KEY.replace(/C7/g, "C"));
    expect(r.status).toBe("fail");
    expect(r.score).toBeCloseTo(0.75, 6);
    expect(texts(r)[0]).toBe("Chord 2: right degree, but V7 is dominant 7th, not major (V).");
    expect(
      (r.diagnostics ?? []).filter((d) => d.id === "harmony.rn-quality").map((d) => d.where?.bar),
    ).toEqual([2, 7, 8, 14]);
  });
  test("one V7 written as V in sixteen bars still passes (15/16 ≥ 0.85); three do not", async () => {
    const one = await gradeChanges(KEY.replace("C7", "C"));
    expect(one.score).toBeCloseTo(15 / 16, 6);
    expect(songLadderPassed(changes, one)).toBe(true);
    const three = await gradeChanges("F C F F F F C C F F Bb Bb F C7 F F");
    expect(three.score).toBeCloseTo(13 / 16, 6);
    expect(songLadderPassed(changes, three)).toBe(false);
  });
  test("a seventh added to a plain triad of the key keeps its partial credit: it is neither named fault", async () => {
    // F7 in bar 4 leading to the IV of bar... the song has F; the learner hears the blues' I7.
    const r = await gradeChanges("F C7 F F7 F F C7 C7 F F Bb Bb F C7 F F");
    expect(r.score).toBeGreaterThan(15 / 16);
    expect(r.score).toBeLessThan(1);
    expect(songLadderPassed(changes, r)).toBe(true);
  });
  test("a step that does not opt in keeps its credit: the same matcher without wrongQuality", async () => {
    const lenient: Matcher = {
      m: "harmony",
      level: "rn",
      qualityDepth: "seventh",
      inversion: false,
      harmonicRhythm: "given",
    };
    const strict: Matcher = { ...lenient, wrongQuality: "none" };
    const ref = await strudel(`chords: chord("<F C7 F F>").voicing()`, 4);
    const ans = await strudel(`chords: chord("<F C F F>").voicing()`, 4);
    const k = { meter: "4/4" as const, key: { tonic: "F", mode: "major" as const } };
    const a = runMatcher(lenient, ref, ans, k);
    const b = runMatcher(strict, ref, ans, k);
    expect(a.score).toBeGreaterThan(0.9);
    expect(b.score).toBeCloseTo(0.75, 6);
    // A wrong ROOT was never given quality credit at numeral level; that is unchanged.
    const wrongRoot = await strudel(`chords: chord("<F G7 F F>").voicing()`, 4);
    expect(runMatcher(strict, ref, wrongRoot, k).score).toBeCloseTo(0.75, 6);
  });
});

describe("d12: from L5 on, the recording's key", () => {
  const up = (code: string): string =>
    code.replace(/\b([a-g])(#|b)?(\d)\b/g, (_m, l: string, acc: string | undefined, o: string) => {
      const names = ["c", "c#", "d", "eb", "e", "f", "f#", "g", "ab", "a", "bb", "b"];
      const base =
        { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[l as "c"] + (acc === "#" ? 1 : acc === "b" ? -1 : 0);
      const midi = base + 2 + 12 * Number(o);
      return `${names[midi % 12]}${Math.floor(midi / 12)}`;
    });
  const tune = `setcpm(88/4)\nmel: ${song.answerKey.layers.melody}`;
  const l5 = { itemId: "lad.5.song.careless-love.1", level: 5 as const, phrase: 1 };
  test("L5: the phrase in the recording's key passes", async () => {
    const r = await gradeWith(songLadderRequest({ item: l5, song, code: tune, ctx }), deps);
    expect(songLadderPassed(l5, r)).toBe(true);
  });
  test("L5: the same phrase a whole step up fails and names both keys", async () => {
    const r = await gradeWith(songLadderRequest({ item: l5, song, code: up(tune), ctx }), deps);
    expect(r.status).toBe("fail");
    expect(songLadderPassed(l5, r)).toBe(false);
    expect(texts(r)).toContain(
      "Right tune, but in G major. This step wants it as it plays, in F major: move every note 2 half steps down.",
    );
    expect((r.diagnostics ?? []).map((d) => d.id)).not.toContain("melody.transposed");
    expect((r.diagnostics ?? []).filter((d) => d.id === "melody.wrong-degree")).toEqual([]);
  });
  test("L6 melody: transposed fails the same way", async () => {
    const item = {
      itemId: "lad.6.song.careless-love",
      level: 6 as const,
      phrase: [1, 4] as [number, number],
      stage: "melody" as const,
    };
    const ok = await gradeWith(songLadderRequest({ item, song, code: tune, ctx }), deps);
    expect(songLadderPassed(item, ok)).toBe(true);
    const r = await gradeWith(songLadderRequest({ item, song, code: up(tune), ctx }), deps);
    expect(r.status).toBe("fail");
    expect((r.diagnostics ?? []).map((d) => d.id)).toContain("melody.wrong-key");
  });
  test("L6 changes in another key fail with the key named (as before)", async () => {
    const r = await gradeChanges("G D7 G G G G D7 D7 G G C C G D7 G G");
    expect(r.status).toBe("fail");
    expect(texts(r)[0]).toBe(
      "Right changes, but in G major. The song is in F major: move every chord 2 half steps down.",
    );
  });
  test("an X1-style phrase check keeps the note: a tune right in another key still passes there", async () => {
    const check: PhraseCheck = {
      id: "phrase-1",
      phrase: 1,
      layer: "melody",
      matcher: SONG_LADDER_MATCHERS.melody,
      pass: 0.85,
    };
    const r = await gradeWith(
      phraseCheckRequest({ capstoneId: "X1", check, song, code: up(tune), ctx }),
      deps,
    );
    expect(r.status).toBe("pass");
    expect((r.diagnostics ?? []).map((d) => d.id)).toContain("melody.transposed");
  });
  test("L1–L4 are unchanged: the ladder request does not ask for the key", () => {
    const req = ladderGradeRequest({
      item: {
        itemId: "lad.4.1",
        level: 4,
        reference: `mel: note("c4 d4 e4 f4")`,
        bars: 1,
        key: { tonic: "C", mode: "major" },
        meter: "4/4",
        bpm: 100,
      },
      code: `mel: note("c4 d4 e4 f4")`,
      ctx,
    });
    expect(req.ctx.requireKey).toBeUndefined();
    expect(songLadderRequest({ item: l5, song, code: tune, ctx }).ctx.requireKey).toBe(true);
  });
});
