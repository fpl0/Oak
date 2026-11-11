// Onboarding as a first-time learner with a microphone (the gate journey's walk, with an optional hook at the
// Coda). Ends on Today.
import { expect, type Page } from "@playwright/test";
import { expectStep, throughTheLoop } from "../../app/src/onboarding/e2e/helpers.ts";

/** The latency screen's 16 taps: one Space as each dot lights. */
export async function tapAlong(page: Page): Promise<void> {
  await page.getByTestId("tap-start").click();
  await page.evaluate(() => {
    const list = document.querySelector('[data-testid="latency-tap"] ol');
    let last = -1;
    const obs = new MutationObserver(() => {
      const i = [...(list?.children ?? [])].findIndex((li) => li.getAttribute("aria-current") === "step");
      if (i > last) {
        last = i;
        setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " })), 15);
      }
    });
    if (list) obs.observe(list, { subtree: true, attributes: true });
  });
}

export async function walkOnboarding(page: Page, o: { atCoda?(): Promise<void> } = {}): Promise<void> {
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
  await page.getByTestId("mic-allow").click();
  await expect(page.getByTestId("mic-live")).toBeVisible();
  await page.getByTestId("part-continue").click();
  await page.getByTestId("noise-start").click();
  await expect(page.getByText("Quiet enough")).toBeVisible();
  await page.getByTestId("part-continue").click();
  await page.getByTestId("bleed-start").click();
  await expect(page.getByText("No bleed")).toBeVisible();
  await page.getByTestId("part-continue").click();
  await expectStep(page, "range");
  await page.getByTestId("range-start").click();
  await expect(page.getByText(/Your singing zone/)).toBeVisible();
  await page.getByTestId("part-continue").click();
  await expectStep(page, "latency");
  await tapAlong(page);
  await expect(page.getByText(/Your taps land \d+ ms (after|before) the click/)).toBeVisible();
  await page.getByTestId("sing-start").click();
  await expect(page.getByText(/Your voice lands \d+ ms/)).toBeVisible();
  await page.getByTestId("part-continue").click();
  await expectStep(page, "first-sing");
  await page.getByTestId("first-sing-start").click();
  await expect(page.getByText("That note is 1: home.")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("part-continue").click();
  await expectStep(page, "sketch");
  await expect(page.getByTestId("workbench")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("sketch-save").click();
  await expectStep(page, "coda");
  await o.atCoda?.();
  await page.getByTestId("coda-done").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("today-card")).toBeVisible();
}
