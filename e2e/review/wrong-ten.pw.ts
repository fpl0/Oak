// Ten wrong answers in a row, then a double-clicked Check: the feedback stays calm and specific (never "Wrong",
// never an exclamation mark, never a score in red words), help is offered after a few tries without being forced,
// the way on (Show the answer) is always there, and a double click is one attempt, not two.
import { expect, test } from "@playwright/test";
import { setCode } from "../journey/lesson-walk.ts";
import { api, noHmr, resetClock, seed, watch } from "./support.ts";

const WRONG = 'setcpm(80/4)\n\ndrums: s("bd sd bd sd")\nhats: s("hh*8")';
const RIGHT = 'setcpm(120/4)\n\ndrums: s("bd sd bd sd")\nhats: s("hh*8")';

test("ten wrong checks read calm, offer help, and a double click counts once", async ({ page, request }) => {
  await resetClock(request);
  await seed(request, "after U00.L02");
  await noHmr(page);
  const problems = watch(page);
  await page.goto("/learn/U01.L01?step=S6");
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", "S6", { timeout: 60_000 });
  const lines: string[] = [];
  for (let i = 0; i < 10; i++) {
    await setCode(page, WRONG);
    await page.getByTestId("check").click();
    await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
    lines.push((await page.getByTestId("step-feedback").textContent()) ?? "");
  }
  for (const l of lines) {
    expect(l).not.toMatch(/wrong|incorrect|fail|!/i);
    expect(l.length).toBeLessThan(200);
  }
  // Help is offered, and the way on is there, after repeated tries.
  await expect(page.getByText(/Talk it through with Claude/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Show the answer/ })).toBeVisible();
  const before = await api<{ attempts: number }>(request, "GET", "/api/lessons/U01.L01/steps/S6");
  expect(before.attempts).toBe(10);
  await setCode(page, RIGHT);
  await page.getByTestId("check").dblclick();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass");
  await page.waitForTimeout(1000);
  const after = await api<{ attempts: number; passed: boolean }>(
    request,
    "GET",
    "/api/lessons/U01.L01/steps/S6",
  );
  expect(after).toMatchObject({ attempts: 11, passed: true });
  expect(problems).toEqual([]);
});
