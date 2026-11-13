// The U03–U04 lesson walks (walk-u03a/b/c.pw.ts, walk-u04.pw.ts): each lesson opened from the dev seed just before
// it in the default order (or the learner the test before it left, chain.ts) and walked step by step by walk.ts, a
// wrong answer first on each graded step, the lesson complete on the server. The browser has Chromium's fake
// microphone singing a steady middle C: every sung step takes a real take through it (TAKES) but U03.L02 S8, which
// goes straight to its targets through the player's own path (sing.pw.ts and take-cases.pw.ts own its take).
import { seedOrChain } from "./chain.ts";
import { expect, test } from "./support.ts";
import { api, fakeMicSingingC, reseedFresh, setQuiet } from "./w3support.ts";
import { BEFORE, lessonDef, walkLesson } from "./walk.ts";

/**
 * The lessons whose sung step takes a real take through the fake microphone: every sung step of U03–U04 but
 * U03.L02 S8, whose take (the same seed, the same step) is sing.pw.ts (Done, per-target marks, the read-back, stored)
 * and take-cases.pw.ts (four take qualities). The `all` of two degree patterns (U03.L03 S7), a resolution (U03.L04
 * S6), a degree pattern in another key (U03.L05 S7, home A), on syllables with ti below do (U03.L08 S4), a sight-sing
 * from the staff (U03.L09 S5), an echo of a stimulus (U03.L10 S4), an echo of the reference (U03.L11 S6), and a
 * degree pattern in leaps (U04.L04 S5).
 */
export const TAKES: ReadonlySet<string> = new Set([
  "U03.L03",
  "U03.L04",
  "U03.L05",
  "U03.L08",
  "U03.L09",
  "U03.L10",
  "U03.L11",
  "U04.L04",
]);

/** Registers one walk test per lesson (serial: they share the stack's one learner). */
export function walkSuiteW3(ids: readonly string[]): void {
  test.use({ launchOptions: { args: fakeMicSingingC() } });
  test.describe.configure({ mode: "serial" });
  test.afterAll(async ({ request }) => {
    await reseedFresh(request);
  });
  for (const [i, id] of ids.entries()) {
    test(`${id}: every step, a wrong answer first on each graded one, complete`, async ({ page }) => {
      test.setTimeout(240_000);
      await seedOrChain(page, id, `after ${BEFORE[id]}`, ids[i - 1] ?? null);
      expect((await api(page, "PUT", "/profile", { targetMinutes: 20 })).status).toBe(200);
      await setQuiet(page, false);
      await page.goto(`/learn/${id}`);
      const def = await lessonDef(id);
      const seen = await walkLesson(page, def, {
        lessonId: id,
        mic: TAKES.has(id),
        quiet: false,
        listen: i < ids.length - 1 ? "short" : "first",
      });
      expect(seen.length).toBe(def.steps.filter((s) => !s.optional).length);
    });
  }
}
