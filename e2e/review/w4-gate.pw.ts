// Wave 4 review (review:journey): the voicing gate failed again and again (contracts §3.1 rule 6). Defect found:
// "Show the answer" on a gate check left the learner with no way to open the gate. The server keeps the rung at 4,
// so every later check of that series counted as revealed, while the gate box said "type your own voicing and
// check again" and the held Continue on U05.L08's second chance said "or show the answer, to go on". On the second
// chance that was a dead end: U05.L08 could never be completed. Now a revealed gate check offers "Start a fresh
// try" (a new series: rung and attempts start again), the box says so, and the second chance's note names the 90%.
import { expect, type Page, test } from "@playwright/test";
import { useUiPrefs } from "../support/ui.ts";
import { api, resetClock, shootAll, watch } from "./support.ts";
import { quietHmr, seedPoint, step } from "./w4-support.ts";

type Ex = { id: string; tests: { name: string; expect: string; response: { code?: string } }[] };
type Lesson = { steps: { id: string; gateCheck?: boolean; exercise?: Ex }[] };

async function lessonDef(id: string): Promise<Lesson> {
  const [unit, lesson] = id.split(".") as [string, string];
  return ((await import(`../../content/core/${unit}/${lesson}/lesson.ts`)) as { default: Lesson }).default;
}

const setCode = (page: Page, code: string) =>
  page.evaluate((c) => {
    (globalThis as unknown as { __oakLesson: { setCode(c: string): void } }).__oakLesson.setCode(c);
  }, code);

const codes = (ex: Ex | undefined) => ({
  wrong: ex?.tests.find((t) => t.expect === "fail" && t.response.code && !/unchanged/i.test(t.name))?.response
    .code as string,
  right: ex?.tests.find((t) => t.expect === "pass" && t.response.code)?.response.code as string,
});

async function failFiveTimes(page: Page, wrong: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await setCode(page, wrong);
    await page.getByTestId("check").click();
    await expect(page.getByTestId("gate-box")).toHaveAttribute("data-tone", "near", { timeout: 30_000 });
    await expect(page.getByTestId("check")).toBeEnabled({ timeout: 30_000 });
  }
  // Five fails: what to fix is still named, and every way on is offered (hints, the tutor, the answer).
  expect(((await page.getByTestId("gate-fixes").textContent()) ?? "").length).toBeGreaterThan(12);
  await expect(page.getByTestId("hint")).toBeVisible();
  await expect(page.getByTestId("ask-claude")).toBeVisible();
  await expect(page.getByTestId("stuck-line")).toBeVisible();
  await expect(page.getByTestId("reveal-button")).toBeVisible();
}

test("U05.L07: five fails, the answer shown, then a fresh try written by hand opens the gate", async ({
  page,
  request,
}) => {
  test.setTimeout(200_000);
  await resetClock(request);
  await seedPoint(request, "U05.L07 gate open");
  await quietHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watch(page);
  const def = await lessonDef("U05.L07");
  const gate = def.steps.find((s) => s.exercise?.id === "hand-voiced-cadence");
  const { wrong, right } = codes(gate?.exercise);
  await page.goto("/learn/U05.L07");
  await expect(step(page)).toHaveAttribute("data-step", gate?.id ?? "", { timeout: 60_000 });
  await failFiveTimes(page, wrong);

  await page.getByTestId("reveal-button").click();
  await expect(page.getByTestId("continue")).toBeEnabled({ timeout: 30_000 });
  // The revealed code, checked: right, but it does not count, and the box says what does.
  await setCode(page, right);
  await page.getByTestId("check").click();
  await expect(page.getByTestId("gate-title")).toHaveText("A revealed answer does not open the gate", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("gate-box")).toContainText("Start a fresh try");
  const fresh = page.getByTestId("new-series");
  await expect(fresh).toHaveText("Start a fresh try");
  await shootAll(page, "w4-gate-revealed");
  const before = await api<{ passed: boolean }>(request, "GET", "/api/gates/voicing");
  expect(before.passed).toBe(false);

  await fresh.click();
  // A new series: the rung starts again, so the offer goes away.
  await expect(page.getByTestId("new-series")).toHaveCount(0, { timeout: 30_000 });
  await setCode(page, right);
  await page.getByTestId("check").click();
  await expect(page.getByTestId("gate-box")).toHaveAttribute("data-tone", "met", { timeout: 30_000 });
  const after = await api<{ passed: boolean }>(request, "GET", "/api/gates/voicing");
  expect(after.passed, "the fresh try opened the gate on the server").toBe(true);
  expect(problems).toEqual([]);
});

test("U05.L08 second chance: the note names the 90%, a reveal is followed by a fresh try, never a dead end", async ({
  page,
  request,
}) => {
  test.setTimeout(200_000);
  await resetClock(request);
  await seedPoint(request, "U05.L07 gate open");
  await quietHmr(page);
  await useUiPrefs(page, { theme: "bark" });
  const problems = watch(page);
  const def = await lessonDef("U05.L08");
  const first = def.steps[0];
  expect(first?.gateCheck).toBe(true);
  const { wrong, right } = codes(first?.exercise);
  await page.goto("/learn/U05.L08?preview=true");
  await expect(step(page)).toHaveAttribute("data-step", first?.id ?? "", { timeout: 60_000 });
  await expect(page.getByTestId("continue-note")).toHaveText(
    "Pass the check at 90% or more to go on. Hints 1 to 3 are fine.",
  );
  await failFiveTimes(page, wrong);
  await page.getByTestId("reveal-button").click();
  await setCode(page, right);
  await page.getByTestId("check").click();
  await expect(page.getByTestId("gate-title")).toHaveText("A revealed answer does not open the gate", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("continue"), "the one hard gate holds").toBeDisabled();
  await expect(page.getByTestId("continue-note")).not.toContainText("show the answer");
  await shootAll(page, "w4-gate-second-chance-revealed");
  await page.getByTestId("new-series").click();
  // A new series: the rung starts again, so the offer goes away.
  await expect(page.getByTestId("new-series")).toHaveCount(0, { timeout: 30_000 });
  await setCode(page, right);
  await page.getByTestId("check").click();
  await expect(page.getByTestId("gate-box")).toHaveAttribute("data-tone", "met", { timeout: 30_000 });
  await expect(page.getByTestId("continue")).toBeEnabled();
  expect(problems).toEqual([]);
});
