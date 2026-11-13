// Quiet mode (server state, `voice.quiet` for today) on two lessons with singing: U03.L03 (an `all` of two
// sung patterns) and U03.L09 (sight-singing from the staff). Quiet mode changes only the sung steps, so each walk
// opens at the first of them (`?step=`, walk.ts firstSungStep) and walks on to the end as usual (walk-u03a/c walk
// the earlier steps); each sung step offers no mic at all, shows its fallback, records nothing, and never holds
// Continue (contracts §8.5); the lesson completes.

import { expect, test } from "./support.ts";
import { api, reseedFresh, seed, setQuiet } from "./w3support.ts";
import { BEFORE, firstSungStep, lessonDef, shownFrom, walkLesson } from "./walk.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

for (const id of ["U03.L03", "U03.L09"]) {
  test(`${id} in Quiet mode: from its first sung step, the sung steps are their fallbacks, nothing recorded, complete`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await seed(page, `after ${BEFORE[id]}`);
    expect((await api(page, "PUT", "/profile", { targetMinutes: 20 })).status).toBe(200);
    await setQuiet(page, true);
    const v = await api<{ quiet: boolean }>(page, "GET", "/voice");
    expect(v.status, "voice.get answers (no longer 501)").toBe(200);
    expect(v.body?.quiet).toBe(true);
    try {
      const def = await lessonDef(id);
      const from = firstSungStep(def);
      await page.goto(`/learn/${id}?step=${from}`);
      const seen = await walkLesson(page, def, { lessonId: id, mic: false, quiet: true, from });
      for (const s of shownFrom(def, from)) expect(seen, `${id}: ${s} walked`).toContain(s);
    } finally {
      await setQuiet(page, false);
    }
  });
}
