// The Wave 4 lesson walks (walk-u05.pw.ts, walk-u06a/b.pw.ts, walk-u07a/b.pw.ts): each U05–U07 lesson opened from
// the dev seed just before it in the default order (`after <session>`, wave4.md §6) and walked step by step by
// walk.ts — every graded step gets one of the lesson's own pinned mistakes first and its feedback is read, then
// the right answer; the lesson must end complete on the server. One test per lesson, each under a minute.
import { expect, test } from "./support.ts";
import { api, reseedFresh, seed, setQuiet } from "./w3support.ts";
import { BEFORE, lessonDef, walkLesson } from "./walk.ts";

/** Registers one walk test per lesson (serial: they share the stack's one learner). */
export function walkSuite(ids: readonly string[]): void {
  test.describe.configure({ mode: "serial" });
  test.afterAll(async ({ request }) => {
    await reseedFresh(request);
  });
  for (const id of ids) {
    test(`${id}: every step, a pinned mistake first on each graded one, complete`, async ({ page }) => {
      test.setTimeout(90_000);
      const t0 = Date.now();
      await seed(page, `after ${BEFORE[id]}`);
      expect((await api(page, "PUT", "/profile", { targetMinutes: 20 })).status).toBe(200);
      await setQuiet(page, false);
      await page.goto(`/learn/${id}`);
      const def = await lessonDef(id);
      const seen = await walkLesson(page, def, { lessonId: id, mic: false, quiet: false });
      const shown = def.steps.filter((s) => !s.optional && !s.gateCheck).map((s) => s.id);
      for (const s of shown) expect(seen, `${id}: ${s} walked`).toContain(s);
      console.log(`[walk] ${id}: ${seen.length} steps in ${Math.round((Date.now() - t0) / 1000)} s`);
    });
  }
}
