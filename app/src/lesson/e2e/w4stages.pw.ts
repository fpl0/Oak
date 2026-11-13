// "Show me" on a staged chord dictation (U06.L09 S2, from the dev seed "after U06.L08"): after the bass stage
// misses, the stage offers "Show me", which is the step's own reveal (rung 4, as the hint ladder's last rung): every
// stage then shows its answer, nothing is graded as a pass, and Continue opens. Keyboard only: the reveal is a
// button in the stage's own row.
import { expect, stepIs, submit, test } from "./support.ts";
import { api, reseedFresh, seed, setQuiet } from "./w3support.ts";
import { enterStage, lessonDef } from "./walk.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

test("a staged dictation: a missed bass offers Show me, which reveals every stage and opens Continue", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seed(page, "after U06.L08");
  await setQuiet(page, false);
  const def = await lessonDef("U06.L09");
  const ex = def.steps.find((s) => s.id === "S2")?.exercise;
  await page.goto("/learn/U06.L09?step=S2");
  await stepIs(page, "S2");
  const stage = (id: string) => page.getByTestId("lesson-step").locator(`li[data-stage="${id}"]`);
  // Before the server allows a reveal (it needs checks of the whole step), a missed stage does not offer it.
  await enterStage(page, ex as never, "bass", ["1", "3", "5", "4"]);
  await page.getByTestId("check-stage").click();
  await expect(page.getByTestId("stage-verdict")).toHaveAttribute("data-status", "fail", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Show me" })).toHaveCount(0);
  // Whole answers checked wrong (a revisit after earlier tries), through the player's own path.
  const wrong = (ex as unknown as { tests: { expect: string; response: unknown }[] }).tests.filter(
    (t) => t.expect === "fail",
  );
  for (const t of wrong) expect((await submit(page, t.response))?.status).not.toBe("pass");
  await page.reload();
  await stepIs(page, "S2");
  await enterStage(page, ex as never, "bass", ["1", "3", "5", "4"]);
  await page.getByTestId("check-stage").click();
  await expect(page.getByTestId("stage-verdict")).toHaveAttribute("data-status", "fail", { timeout: 30_000 });
  await expect(page.getByTestId("continue")).toBeDisabled();
  const show = stage("bass").getByRole("button", { name: "Show me" });
  await show.focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await api<{ rung: number }>(page, "GET", "/lessons/U06.L09/steps/S2")).body?.rung, {
      message: "the reveal reaches the server",
      timeout: 15_000,
    })
    .toBe(4);
  for (const id of ["bass", "quality", "rn"])
    await expect(stage(id), `${id} shown`).toHaveAttribute("data-status", "revealed", { timeout: 30_000 });
  await expect(stage("bass")).toContainText("6");
  await expect(page.getByTestId("continue")).toBeEnabled();
  const st = await api<{ rung: number; passed: boolean }>(page, "GET", "/lessons/U06.L09/steps/S2");
  expect(st.body).toMatchObject({ rung: 4, passed: false });
});
