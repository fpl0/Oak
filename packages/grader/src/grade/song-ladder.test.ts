// Ladder levels L5 (folk, per phrase) and L6 (blues, staged bass → changes → melody): docs/design/wave5.md §3.2.
// A synthetic 12-bar blues in C with a two-phrase melody (the real answer keys are author:repertoire's).
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { SongDef } from "@oak/content-kit";
import { headlessDeps } from "../analyze/__support__/fixtures.ts";
import { gradeWith } from "./index.ts";
import {
  nextSongStage,
  SONG_LADDER_PASS,
  songLadderCheck,
  songLadderPassed,
  songLadderRequest,
} from "./song-ladder.ts";

setDefaultTimeout(60_000);
const deps = headlessDeps();
const C = { tonic: "C", mode: "major" } as const;
const BASS = 'note("<c2 f2 c2 c2 f2 f2 c2 c2 g2 f2 c2 g2>").s("sawtooth")';
const CHORDS = 'chord("<C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7>").voicing()';
const MEL =
  'n("<[2b 4 4b 4] [2b ~ 0 ~] [2b 4 4b 4] [0 ~ ~ ~] [2b 4 4b 4] [2b ~ 0 ~] [4 ~ 2b ~] [0 ~ ~ ~] [4 4 4 2b] [3 ~ 2b ~] [0 ~ ~ ~] [~ ~ ~ ~]>").scale("C4:major").s("piano")';
const SONG: SongDef = {
  id: "song.test-blues",
  title: "Test blues",
  year: "trad",
  status: "trad",
  provenance: { source: "test", year: 1914 },
  verifiedBy: "test",
  key: C,
  meter: "4/4",
  bpm: 100,
  form: "12-bar blues",
  answerKey: {
    bars: 12,
    code: "",
    layers: { bass: BASS, chords: CHORDS, melody: MEL },
    phrases: [
      [1, 4],
      [5, 8],
      [9, 12],
    ],
  },
} as SongDef;
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
const grade = (item: Parameters<typeof songLadderRequest>[0]["item"], code: string) =>
  gradeWith(songLadderRequest({ item, song: SONG, code, ctx }), deps);

describe("L6 stages", () => {
  test("bass, then changes, then melody, at X2's marks", async () => {
    expect(nextSongStage([])).toBe("bass");
    expect(nextSongStage(["bass"])).toBe("changes");
    expect(nextSongStage(["bass", "changes", "melody"])).toBeNull();
    expect(SONG_LADDER_PASS[6]).toEqual({ bass: 0.9, changes: 0.85, melody: 0.85 });
    expect(songLadderCheck({ itemId: "lad.6.x", level: 6, phrase: [1, 3], stage: "changes" }).layer).toBe(
      "chords",
    );
    const item = {
      itemId: "lad.6.test",
      level: 6 as const,
      phrase: [1, 3] as [number, number],
      stage: "bass" as const,
    };
    const right = await grade(item, `setcpm(100/4)\nbass: ${BASS}`);
    expect(right.mode).toBe("capstone");
    expect(songLadderPassed(item, right)).toBe(true);
    const wrong = await grade(item, `setcpm(100/4)\nbass: note("c2").s("sawtooth")`);
    expect(songLadderPassed(item, wrong)).toBe(false);
  });
});

describe("L5 per phrase", () => {
  test("a phrase in lesson mode, key-relative", async () => {
    const item = { itemId: "lad.5.test.1", level: 5 as const, phrase: 1 };
    const r = await grade(item, `setcpm(100/4)\nmel: ${MEL.replace("C4:major", "D4:major")}`);
    expect(r.mode).toBe("lesson");
    expect(songLadderPassed(item, r)).toBe(true);
  });
});

describe("§6.12: given swing, the straightened grid, a phrase's own window, reveals", () => {
  const SWUNG: SongDef = {
    ...SONG,
    id: "song.test-swung",
    swing: { subdivision: 8, amount: 1 / 3 },
  } as SongDef;
  const gradeSong = (
    song: SongDef,
    item: Parameters<typeof songLadderRequest>[0]["item"],
    code: string,
    rung = 0,
  ) => gradeWith(songLadderRequest({ item, song, code, ctx: { ...ctx, rung: rung as 0 } }), deps);
  const EIGHTHS = 'note("<[c4 eb4 e4 g4 c4 eb4 e4 g4] [bb4 g4 e4 c4 ~ ~ ~ ~]>").s("piano")';
  const EIGHTH_SONG: SongDef = {
    ...SWUNG,
    answerKey: {
      ...SWUNG.answerKey,
      bars: 2,
      layers: { ...SWUNG.answerKey.layers, melody: `${EIGHTHS.replace(".s(", ".swingBy(1/3, 4).s(")}` },
      phrases: [[1, 2]],
    },
  } as SongDef;
  test("L6 melody: the swung line passes; the same notes played straight still line up on the grid", async () => {
    const item = { itemId: "lad.6.swung", level: 6 as const, phrase: 1, stage: "melody" as const };
    const swung = await gradeSong(
      EIGHTH_SONG,
      item,
      `setcpm(100/4)\nmel: ${EIGHTHS.replace(".s(", ".swingBy(1/3, 4).s(")}`,
    );
    expect(songLadderPassed(item, swung)).toBe(true);
    const straight = await gradeSong(EIGHTH_SONG, item, `setcpm(100/4)\nmel: ${EIGHTHS}`);
    expect(straight.score).toBeGreaterThanOrEqual(SONG_LADDER_PASS[6].melody);
  });
  test("L6 changes compare on the triad core: C F G triads pass where the strain has dominant sevenths", async () => {
    const item = {
      itemId: "lad.6.test",
      level: 6 as const,
      phrase: [1, 3] as [number, number],
      stage: "changes" as const,
    };
    const triads = CHORDS.replace(/7/g, "");
    const r = await gradeSong(SONG, item, `setcpm(100/4)\nbass: ${BASS}\nchords: ${triads}`);
    expect(r.mode).toBe("capstone");
    expect(songLadderPassed(item, r)).toBe(true);
  });
  test("L6 changes grade the chords alone: a right bass under a wrong last line does not carry it", async () => {
    const item = {
      itemId: "lad.6.test",
      level: 6 as const,
      phrase: [1, 3] as [number, number],
      stage: "changes" as const,
    };
    const chords = (bars: string) => `chord("<${bars}>").voicing()`;
    const RIGHT = "C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7";
    // One bar wrong (IV for V in bar 9): 11 of 12 bars, passes.
    const one = await gradeSong(
      SONG,
      item,
      `setcpm(100/4)\nbass: ${BASS}\nchords: ${chords(RIGHT.replace("C7 C7 G7 F7", "C7 C7 F7 F7"))}`,
    );
    expect(songLadderPassed(item, one)).toBe(true);
    expect(one.score).toBeLessThan(1);
    // The whole last line wrong under the learner's right bass (which passed its own stage): fails. Before Wave 5
    // integration the bass earned part credit per chord and this scored 0.85.
    const line = await gradeSong(
      SONG,
      item,
      `setcpm(100/4)\nbass: ${BASS}\nchords: ${chords("C7 F7 C7 C7 F7 F7 C7 C7 C7 G7 F7 C7")}`,
    );
    expect(line.score).toBeLessThan(SONG_LADDER_PASS[6].changes);
    expect(songLadderPassed(item, line)).toBe(false);
    // Messages read the strain at the graded (triad) depth: a blues' I7 is I, never V7/IV.
    const texts = line.diagnostics.filter((d) => d.id === "harmony.rn").map((d) => d.params);
    expect(texts[0]).toMatchObject({ got: "I7", exp: "V7" });
    expect(texts.some((p) => p.exp === "I7")).toBe(true);
    expect(JSON.stringify(texts)).not.toContain("V7/IV");
  });
  test("L5 reads only its phrase: phrase 2 right with phrase 1 wrong passes phrase 2 and fails phrase 1", async () => {
    const wrongFirst = MEL.replace(
      "[2b 4 4b 4] [2b ~ 0 ~] [2b 4 4b 4] [0 ~ ~ ~]",
      "[0 0 0 0] [0 ~ 0 ~] [0 0 0 0] [0 ~ ~ ~]",
    );
    const code = `setcpm(100/4)\nmel: ${wrongFirst}`;
    const p2 = { itemId: "lad.5.test.2", level: 5 as const, phrase: 2 };
    expect(songLadderPassed(p2, await gradeSong(SONG, p2, code))).toBe(true);
    const p1 = { itemId: "lad.5.test.1", level: 5 as const, phrase: 1 };
    expect(songLadderPassed(p1, await gradeSong(SONG, p1, code))).toBe(false);
  });
  test("a revealed phrase is never a graded pass (§6.6 X1, the ladder alike)", async () => {
    const item = { itemId: "lad.5.test.1", level: 5 as const, phrase: 1 };
    const r = await gradeSong(SONG, item, `setcpm(100/4)\nmel: ${MEL}`, 4);
    expect(r.assist.revealed).toBe(true);
    expect(songLadderPassed(item, r)).toBe(false);
  });
});
