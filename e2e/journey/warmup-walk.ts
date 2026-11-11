// Plays a session's warm-up in the real drill runner, set by set, as a learner would: listen blocks are heard,
// tap trials are tapped with Space on the beat, sung trials are sung by Chrome's fake microphone, pad trials are
// answered from the keyboard, and each set summary moves on with Enter. It does not aim for a perfect score; the
// grades come from the real drill engine and go to the real server.
import { expect, type Page } from "@playwright/test";

/** Runs until the warm-up hands over to the next block (the lesson step, a checkpoint, a capstone or the Make). */
export async function walkWarmup(page: Page, opts: { maxMs?: number } = {}): Promise<{ sets: number }> {
  const deadline = Date.now() + (opts.maxMs ?? 6 * 60_000);
  const warmup = page.getByTestId("warmup");
  await expect(warmup).toBeVisible({ timeout: 60_000 });
  let sets = 0;
  let tappedTrial: string | null = null;
  while (Date.now() < deadline) {
    if (!(await warmup.isVisible().catch(() => false))) return { sets };
    const listen = page.getByTestId("listen-block").filter({ visible: true }).first();
    if (await listen.isVisible().catch(() => false)) {
      // Heard once on arrival; the primary button moves on.
      await listen.getByRole("button").first().click();
      continue;
    }
    const summary = page.getByTestId("set-summary").filter({ visible: true }).first();
    if (await summary.isVisible().catch(() => false)) {
      sets++;
      // "Next set" / "On to the lesson": the summary's primary button (Enter).
      await warmup
        .getByRole("button", { name: /^(Next set|On to|Continue|Done)/ })
        .first()
        .click();
      await page.waitForTimeout(300);
      continue;
    }
    const feedback = page.getByTestId("trial-feedback").filter({ visible: true }).first();
    if (await feedback.isVisible().catch(() => false)) {
      await page.getByTestId("next-trial").filter({ visible: true }).first().click();
      continue;
    }
    const stage = (
      (await page
        .getByTestId("stage-text")
        .textContent()
        .catch(() => "")) ?? ""
    ).trim();
    const counter =
      (await page
        .getByTestId("trial-counter")
        .textContent()
        .catch(() => null)) ?? "";
    if (/tap with Space/i.test(stage) && tappedTrial !== counter) {
      tappedTrial = counter;
      // Taps on the beat while the pad is armed (the drill engine grades them against the click).
      for (let k = 0; k < 8; k++) {
        await page.keyboard.press("Space");
        await page.waitForTimeout(450);
        if (await feedback.isVisible().catch(() => false)) break;
      }
      continue;
    }
    // A pad answer: pick the first option with its digit (focus is in the widget once it is armed).
    const pad = page.locator('[data-testid="drill-runner"] [role="group"]').filter({ visible: true }).first();
    if ((await pad.isVisible().catch(() => false)) && /answer|which|choose|pick|your turn/i.test(stage)) {
      await pad
        .locator("button:not([disabled])")
        .first()
        .click()
        .catch(() => {});
      await page.keyboard.press("Enter").catch(() => {});
    }
    await page.waitForTimeout(400);
  }
  throw new Error("the warm-up did not finish in time");
}
