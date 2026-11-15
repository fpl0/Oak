// Carry f4: the song's melody a capstone passes to the grader (`GradeContext.songMelody`), built from the answer key
// with the real headless Strudel, and the rule that reads it. CF-T's arrangement (session 4) used to check only that
// the song's chords were kept: with the melody passed, a tune with a changed note fails and the song's own passes.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { ExerciseOf, RubricRule, SongDef } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import * as grader from "@oak/grader";
import aintSheSweet from "../../../content/repertoire/aint-she-sweet/song.ts";
import amazingGrace from "../../../content/repertoire/amazing-grace/song.ts";
import auraLee from "../../../content/repertoire/aura-lee/song.ts";
import { melodyLayerCode, songMelodyOf } from "./song-melody.ts";
import { ensureRealm, unlockedFor } from "./test-support.ts";
import { sessionRubricRequest } from "./x1/cft.ts";

setDefaultTimeout(60_000);

const analyze = async (code: string, opts: grader.EvalOptions) => {
  await ensureRealm();
  return grader.evaluateForGrading(code, opts);
};

describe("songMelodyOf", () => {
  test("Aura Lee: 16 bars from bar 1, the first note G3 (degree 5 below C4) on the downbeat", async () => {
    const mel = await songMelodyOf(auraLee as SongDef, analyze);
    expect(melodyLayerCode(auraLee as SongDef)).toStartWith("melody: n(");
    expect(mel[0]).toEqual({ onset: [0, 1], dur: [1, 4], midi: 55 });
    expect(Math.max(...mel.map((x) => R.floor(x.onset)))).toBe(15);
    expect(mel.every((x) => R.toNum(x.onset) >= 0)).toBe(true);
  });
  test("Amazing Grace: the one-beat pickup is negative (bars counted from the first full bar)", async () => {
    const mel = await songMelodyOf(amazingGrace as SongDef, analyze);
    expect(R.toNum(mel[0]?.onset ?? [0, 1])).toBeLessThan(0);
    expect(mel.filter((x) => R.toNum(x.onset) < 0)).toHaveLength(1);
  });
  test("a song without a melody layer gives no notes", async () => {
    const bare = { ...(auraLee as SongDef), answerKey: { ...auraLee.answerKey, layers: {} } };
    expect(await songMelodyOf(bare, analyze)).toEqual([]);
  });
});

describe("CF-T session 4 reads the song's melody (carry f4)", () => {
  const song = aintSheSweet as SongDef;
  const kept: RubricRule = {
    id: "melody-kept",
    label: "The song's melody",
    required: true,
    skills: [],
    rule: "custom",
    fn: "song-melody-kept",
    params: { pitch: "absolute" },
  } as RubricRule;
  const grade = async (code: string, withMelody: boolean) => {
    await ensureRealm();
    const songMelody = withMelody ? await songMelodyOf(song, analyze) : null;
    const req = sessionRubricRequest({
      capstoneId: "CF-T",
      sessionId: "CF-T.S4",
      rubric: [kept],
      song,
      code,
      songMelody,
      lint: {
        profile: "graded",
        unlocked: unlockedFor("CF-T", 4),
        allowPreview: false,
        meter: song.meter,
        key: null,
      },
    });
    expect(req.ctx.songMelody?.length ?? 0).toBe(withMelody ? songMelody?.length : 0);
    return grader.gradeExercise(req as { exercise: ExerciseOf<"compose-brief"> } & typeof req);
  };
  const tempo = song.answerKey.code.split("\n")[0] as string;
  const own = `${tempo}\n\nmelody: ${song.answerKey.layers.melody}\nchords: ${song.answerKey.layers.chords}`;
  test("the arrangement with the song's own melody keeps it", async () => {
    const r = await grade(own, true);
    expect(r.rubric?.[0]?.ok).toBe(true);
  });
  test("the same chords under a melody with its first note moved a step (the right tune, one note wrong) fails", async () => {
    const first = /n\("<\[?(-?\d+)/.exec(song.answerKey.layers.melody ?? "");
    expect(first).not.toBeNull();
    const moved = own.replace(
      `n("<${first?.[0].slice(4)}`,
      `n("<${first?.[0].slice(4).replace(/-?\d+$/, (d) => String(Number(d) + 1))}`,
    );
    expect(moved).not.toBe(own);
    const r = await grade(moved, true);
    expect(r.rubric?.[0]?.ok).toBe(false);
  });
  test("without the song's melody the rule cannot say the tune is kept", async () => {
    const r = await grade(own, false);
    expect(r.rubric?.[0]?.ok).toBe(false);
  });
});
