// Quiet mode (server state, `voice.quiet` for today) on the two Wave 4 lessons with singing: U06.L05 "Hear the
// Bass First" (sing the roots of a chord loop) and U07.L09 "Reading Lead Sheets" (sing a hymn from the lead
// sheet). Every other step is walked as usual (walk.ts); each sung step offers no mic at all, shows its fallback,
// records nothing, and never holds Continue (contracts §8.5); the lesson completes on the server.
import { expect, test } from "./support.ts";
import { api, reseedFresh, seed, setQuiet } from "./w3support.ts";
import { BEFORE, lessonDef, walkLesson } from "./walk.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

for (const id of ["U06.L05", "U07.L09"]) {
  test(`${id} in Quiet mode: the sung step is its fallback, nothing recorded, complete`, async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, `after ${BEFORE[id]}`);
    expect((await api(page, "PUT", "/profile", { targetMinutes: 20 })).status).toBe(200);
    await setQuiet(page, true);
    const v = await api<{ quiet: boolean }>(page, "GET", "/voice");
    expect(v.body?.quiet).toBe(true);
    try {
      await page.goto(`/learn/${id}`);
      const def = await lessonDef(id);
      expect(
        def.steps.some((s) => s.exercise?.kind === "sing"),
        `${id} has a sung step`,
      ).toBe(true);
      await walkLesson(page, def, { lessonId: id, mic: false, quiet: true });
    } finally {
      await setQuiet(page, false);
    }
  });
}
