// U03.L01–L04 in the real app, every step from a dev seed (see walk.ts): the generated Find-home choice built
// from the trial's own options, the D major scale typed in one field, the n() modify steps, the generated ear
// steps on the degree pad, the sung patterns with the fake microphone (an `all` of two sings in U03.L03), the
// Makes over the Band.

import { expect, test } from "./support.ts";
import { api, fakeMicSingingC, reseedFresh, seed, setQuiet } from "./w3support.ts";
import { BEFORE, lessonDef, walkLesson } from "./walk.ts";

test.use({ launchOptions: { args: fakeMicSingingC() } });
test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

for (const id of ["U03.L01", "U03.L02", "U03.L03", "U03.L04"]) {
  test(`${id}: every step, a wrong answer first on each graded one, complete`, async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page, `after ${BEFORE[id]}`);
    expect((await api(page, "PUT", "/profile", { targetMinutes: 20 })).status).toBe(200);
    await setQuiet(page, false);
    await page.goto(`/learn/${id}`);
    const def = await lessonDef(id);
    const seen = await walkLesson(page, def, { lessonId: id, mic: true, quiet: false });
    expect(seen.length).toBe(def.steps.filter((s) => !s.optional).length);
  });
}
