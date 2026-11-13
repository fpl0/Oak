// The Transcribe area's stack is up and its page is reachable (Foundation): the list opens from a seeded learner
// with its heading and the own-audio entry. The transcribe engineer grows this suite.
import { expect, test } from "@playwright/test";
import { seed } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

test("Transcribe opens with the own-audio entry", async ({ page }) => {
  await seed(page, "after U04.CP");
  await page.goto("/transcribe");
  await expect(page.getByRole("heading", { level: 1, name: "Transcribe" })).toBeVisible();
  await expect(page.getByRole("button", { name: /own audio/i }).first()).toBeVisible();
});
