// The Wave 5 lesson walks (walk-w5-*.pw.ts): each U08–U11 lesson and A1 side lesson opened from the dev seed just
// before it (wave5.md §6, or the generic `after <session>` of the default order, contracts §2.5) and walked step by
// step by walk.ts — every graded step gets one of the lesson's own pinned mistakes first and its feedback is read,
// then the right answer; the lesson must end complete on the server. One test per lesson, each under a minute.
// The integrator extends `W5_BEFORE` and the suites to all 31 lessons as they are authored.
import { expect, test } from "./support.ts";
import { api, reseedFresh, seed, setQuiet } from "./w3support.ts";
import { type LessonLike, walkLesson } from "./walk.ts";

/**
 * The seed point before each Wave 5 lesson: the session just before it in the default order (contracts §2.5),
 * as `after <it>`, or a named Wave 5 point. Side lessons start from the point where their gate (U03.L02) is met.
 */
export const W5_BEFORE: Record<string, string> = {
  "U08.L01": "after U07.L10",
  "U08.L02": "after X1.S3",
  "U08.L03": "after U08.L02",
  "U08.L04": "after U08.L03",
  "U08.L05": "after U08.L04",
  "U09.L01": "after GYM.04",
  "U09.L02": "after U09.L01",
  "U09.L03": "after U09.L02",
  "U09.L04": "after U09.L03",
  "U09.L05": "after GYM.05",
  "U10.L01": "after U09.L05",
  "U10.L02": "after GYM.06",
  "U10.L03": "after U10.L02",
  "U10.L04": "after U10.L03",
  "U10.L05": "after U10.L04",
  "U10.L06": "after GYM.07",
  "U10.L07": "after U10.L06",
  "U10.L08": "after U10.L07",
  "U10.L09": "after U10.L08",
  "U11.L01": "after GYM.08",
  "U11.L02": "after GYM.09",
  "U11.L03": "after U11.L02",
  "U11.L04": "after U11.L03",
  "U11.L05": "after U11.L04",
  "U11.L06": "after GYM.10",
  "U11.L07": "after U11.L06",
  "U11.L08": "after U11.L07",
  "A1.L01": "side lesson offered",
  "A1.L02": "side lesson offered",
  "A1.L03": "A1.L02 done",
  "A1.L04": "A1.L02 done",
};

/**
 * The side lessons walked first, in the same test, when no seed has them done (A1 is a track, in order: wave5.md
 * §5.1; the seeds give "nothing taken" and "A1.L01–L02 done"). They are walked like any lesson and not timed.
 */
export const SIDE_BEFORE: Record<string, readonly string[]> = {
  "A1.L01": [],
  "A1.L02": ["A1.L01"],
  "A1.L03": [],
  "A1.L04": ["A1.L03"],
};

/** The authored lesson, core or advanced (`content/advanced/A1/L01/lesson.ts` for `A1.L01`). */
export async function lessonDefW5(id: string): Promise<LessonLike> {
  const [unit, lesson] = id.split(".") as [string, string];
  const base = /^U\d\d$/.test(unit) ? "core" : "advanced";
  const mod = (await import(`../../../../content/${base}/${unit}/${lesson}/lesson.ts`)) as {
    default: LessonLike;
  };
  return mod.default;
}

export interface W5WalkOptions {
  quiet?: boolean;
}

/** Registers one walk test per lesson (serial: they share the stack's one learner). */
export function walkSuiteW5(ids: readonly string[], o: W5WalkOptions = {}): void {
  test.describe.configure({ mode: "serial" });
  test.afterAll(async ({ request }) => {
    await reseedFresh(request);
  });
  for (const id of ids) {
    const name = o.quiet ? `${id} in Quiet mode` : id;
    test(`${name}: every step, a pinned mistake first on each graded one, complete`, async ({ page }) => {
      test.setTimeout(120_000);
      const t0 = Date.now();
      const point = W5_BEFORE[id];
      expect(point, `${id}: a seed point`).toBeDefined();
      await seed(page, point as string);
      expect((await api(page, "PUT", "/profile", { targetMinutes: 20 })).status).toBe(200);
      await setQuiet(page, o.quiet === true);
      for (const before of SIDE_BEFORE[id] ?? []) {
        await page.goto(`/learn/${before}`);
        await walkLesson(page, await lessonDefW5(before), {
          lessonId: before,
          mic: false,
          quiet: o.quiet === true,
        });
      }
      const tSeed = Date.now();
      await page.goto(`/learn/${id}`);
      const def = await lessonDefW5(id);
      const seen = await walkLesson(page, def, { lessonId: id, mic: false, quiet: o.quiet === true });
      const shown = def.steps.filter((s) => !s.optional && !s.gateCheck).map((s) => s.id);
      for (const s of shown) expect(seen, `${id}: ${s} walked`).toContain(s);
      const walkS = Math.round((Date.now() - tSeed) / 1000);
      console.log(
        `[walk] ${name}: ${seen.length} steps in ${walkS} s (seed ${Math.round((tSeed - t0) / 1000)} s)`,
      );
      expect(walkS, `${id}: the walk itself takes under a minute`).toBeLessThan(60);
    });
  }
}
