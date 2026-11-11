// The journey's first session on the production build (`bun run build`, `--serve-dist`, no OAK_DEV: production
// security, the real tutor detection, no dev hooks): a fresh learner opens Oak, goes through onboarding in Quiet mode
// to Today, and the app then reloads with the network off (the Service Worker serves the shell).
import { expect, test } from "@playwright/test";
import { expectStep, throughTheLoop } from "../../app/src/onboarding/e2e/helpers.ts";
import { PROD_URL } from "./playwright.config.ts";
import { expectClean, watch } from "./support.ts";

test("production: onboarding to Today, then an offline reload", async ({ browser }) => {
  const up = await fetch(`${PROD_URL}/api/health`, { headers: { "X-Oak": "1" } }).catch(() => null);
  test.skip(up === null, `no production server on ${PROD_URL}`);
  const context = await browser.newContext({ baseURL: PROD_URL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  // The production server says no tutor backend is set up here; the panel says so calmly, no error.
  const w = watch(page);
  await page.goto("/");
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "first-run", {
    timeout: 30_000,
  });
  await page.getByTestId("begin-onboarding").click();
  await throughTheLoop(page, 6);
  await page.getByTestId("react-continue").click();
  await expectStep(page, "prefs");
  await page.getByTestId("prefs-continue").click();
  await expectStep(page, "tutor");
  await page.getByTestId("tutor-continue").click();
  await expectStep(page, "headphones");
  await page.getByTestId("lr-play").click();
  await page.getByTestId("lr-left").click({ timeout: 10_000 });
  await page.getByTestId("part-continue").click();
  await expectStep(page, "mic");
  await page.getByTestId("mic-quiet").click();
  // Quiet mode passes over range and the first note; the latency screen keeps only taps, which can wait.
  await expectStep(page, "latency");
  await expect(page.getByTestId("onboarding")).toHaveAttribute("data-quiet", "1");
  await page.getByTestId("part-skip").click();
  await expectStep(page, "sketch");
  await expect(page.getByTestId("workbench")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("sketch-save").click();
  await expectStep(page, "coda");
  await page.getByTestId("coda-done").click();
  await expect(page).toHaveURL(/\/$/);
  // Onboarding is the first day's session: Today shows it done, with what comes next (journey review).
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("today-card")).toContainText("Next time: Set Up & First Sing");

  // The Service Worker (registered with sound) controls the page after a reload; then the network goes away.
  await expect
    .poll(
      () =>
        page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? ""),
      { timeout: 30_000 },
    )
    .toMatch(/\/sw\.js/);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
  await expect(page.getByTestId("today-card")).toBeVisible({ timeout: 30_000 });
  // Online, the whole first session printed no console error and asked nothing of another machine.
  expectClean(w);
  await context.setOffline(true);
  // Offline, the API calls fail on purpose: those console lines are expected here, nothing else.
  w.problems.length = 0;
  await page.reload();
  await expect(page.getByTestId("page-title")).toHaveText(/Today/, { timeout: 30_000 });
  await expect(page.locator("#main")).toBeVisible();
  const offlineProblems = w.problems.filter(
    (p) => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED|fetch/i.test(p),
  );
  expect(offlineProblems).toEqual([]);
  expect(w.remote).toEqual([]);
  await context.setOffline(false);
  await context.close();
});
