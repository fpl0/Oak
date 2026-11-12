// Wave 3 review, layout sweep: every step of U03 and U04 opened at the smallest window the review tries
// (1280×720, Bark) and at 1440×900 (Paper), with every lens on: no horizontal overflow, the step's primary
// action (Check or Continue) on screen without scrolling, and no console errors. Each lesson is its own test
// (a few seconds each) from one dev seed, so no test comes near the 4-minute limit.
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { LessonDef } from "@oak/content-kit";
import { expect, test } from "@playwright/test";
import { REPO_ROOT } from "../support/stack.ts";
import { useUiPrefs } from "../support/ui.ts";
import { api, noHmr, resetClock, seed, snap, watch } from "./support.ts";

const LESSONS: string[] = [];
for (const unit of ["U03", "U04"]) {
  const dir = resolve(REPO_ROOT, "content/core", unit);
  for (const l of readdirSync(dir)
    .filter((d) => /^L\d\d$/.test(d))
    .sort())
    LESSONS.push(`${unit}.${l}`);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await resetClock(request);
  await seed(request, "U04.CP due");
  await api(request, "PUT", "/api/settings/lenses", {
    value: { degrees: true, solfege: true, noteNames: true },
  });
});

for (const id of LESSONS) {
  test(`${id}: every step fits 1280×720 and 1440×900`, async ({ page }) => {
    test.setTimeout(180_000);
    const [unit, l] = id.split(".") as [string, string];
    const def = (
      (await import(resolve(REPO_ROOT, "content/core", unit, l, "lesson.ts"))) as { default: LessonDef }
    ).default;
    await noHmr(page);
    await useUiPrefs(page, { theme: "bark" });
    const problems = watch(page);
    for (const step of def.steps) {
      for (const size of [
        { width: 1280, height: 720, theme: "bark" },
        { width: 1440, height: 900, theme: "paper" },
      ]) {
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.goto(`/learn/${id}?step=${step.id}`);
        await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", step.id, {
          timeout: 60_000,
        });
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
        }, size.theme);
        await page.waitForTimeout(400);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        await snap(page, `w3-sweep-${id}-${step.id}-${size.width}x${size.height}`);
        expect(overflow, `${id} ${step.id} overflows at ${size.width}`).toBeLessThanOrEqual(0);
        const primary = page
          .getByTestId("continue")
          .or(page.getByRole("button", { name: /Save sketch/ }))
          .first();
        await expect(
          primary,
          `${id} ${step.id}: Continue on screen at ${size.width}×${size.height}`,
        ).toBeInViewport();
      }
    }
    expect(problems).toEqual([]);
  });
}
