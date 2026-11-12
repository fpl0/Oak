// Plays a session's warm-up in the real drill runner, set by set, as a learner would: listen blocks are heard,
// tap trials are tapped with Space on the beat, sung trials are sung by Chrome's fake microphone, pad trials are
// answered from the keyboard, and each set summary moves on with Enter. It does not aim for a perfect score; the
// grades come from the real drill engine and go to the real server.
import { expect, type Page } from "@playwright/test";

export interface WarmupRun {
  /** Set summaries moved past. */
  sets: number;
  /** Ear-training trials whose way home was sung on the microphone ("Sing it home"). */
  sungHome: number;
  /** Ways home heard in the head in Quiet mode ("Hear it home", then Space). */
  heardHome: number;
  /** Passive-listen blocks played through. */
  passive: number;
}

/** Runs until the warm-up hands over to the next block (the lesson step, a checkpoint, a capstone or the Make). */
export async function walkWarmup(
  page: Page,
  opts: { maxMs?: number; until?: (run: WarmupRun) => boolean } = {},
): Promise<WarmupRun> {
  const deadline = Date.now() + (opts.maxMs ?? 6 * 60_000);
  const warmup = page.getByTestId("warmup");
  await expect(warmup).toBeVisible({ timeout: 60_000 });
  const run: WarmupRun = { sets: 0, sungHome: 0, heardHome: 0, passive: 0 };
  let tappedTrial: string | null = null;
  while (Date.now() < deadline) {
    if (!(await warmup.isVisible().catch(() => false))) return run;
    if (opts.until?.(run)) return run;
    const passive = page.getByTestId("passive-listen").filter({ visible: true }).first();
    if (await passive.isVisible().catch(() => false)) {
      // Nothing to answer: the first pair is heard and named, then Continue skips the rest.
      await expect(passive.getByTestId("passive-caption")).toBeVisible({ timeout: 30_000 });
      run.passive++;
      await passive.getByTestId("passive-continue").click();
      continue;
    }
    const listen = page.getByTestId("listen-block").filter({ visible: true }).first();
    if (await listen.isVisible().catch(() => false)) {
      // Heard once on arrival; the primary button moves on.
      await listen.getByRole("button").first().click();
      continue;
    }
    // A fact deck: flip each card (an honest "I don't know"), move on, then leave its summary.
    const factSummary = page.getByTestId("fact-summary").filter({ visible: true }).first();
    if (await factSummary.isVisible().catch(() => false)) {
      run.sets++;
      await factSummary.getByRole("button").first().click();
      await page.waitForTimeout(300);
      continue;
    }
    const fact = page.getByTestId("fact-card").filter({ visible: true }).first();
    if (await fact.isVisible().catch(() => false)) {
      const flip = fact.getByRole("button", { name: "Flip the card" });
      if (await flip.isVisible().catch(() => false)) await flip.click();
      else
        await fact
          .getByRole("button", { name: /^(Next card|Finish)/ })
          .click()
          .catch(() => {});
      await page.waitForTimeout(200);
      continue;
    }
    const summary = page.getByTestId("set-summary").filter({ visible: true }).first();
    if (await summary.isVisible().catch(() => false)) {
      run.sets++;
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
      const next = page.getByTestId("next-trial").filter({ visible: true }).first();
      const label = (await next.textContent().catch(() => "")) ?? "";
      if (/Sing it home/.test(label)) {
        // The way home, sung on Chrome's fake microphone; singing never gates, so a skipped take moves on too.
        run.sungHome++;
        await next.click();
        await expect(feedback).toContainText(/Sung home|Singing skipped/, { timeout: 30_000 });
        continue;
      }
      if (/Hear it home/.test(label)) {
        run.heardHome++;
        await next.click();
        await expect(page.getByTestId("quiet-resolution")).toBeVisible({ timeout: 20_000 });
        await page.keyboard.press("Space");
        await expect(feedback).toContainText("Heard home", { timeout: 20_000 });
        continue;
      }
      await next.click();
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
    const runner = page.getByTestId("drill-runner");
    const typed = runner.getByRole("textbox", { name: "Your answer" });
    if ((await typed.isVisible().catch(() => false)) && /your turn/i.test(stage)) {
      // A typed answer (a scale to spell, a note to name): "Show me" is the honest way on for this walker.
      await runner
        .getByRole("button", { name: "Show me" })
        .click()
        .catch(() => {});
    } else if (
      (await pad.isVisible().catch(() => false)) &&
      /answer|which|choose|pick|your turn/i.test(stage)
    ) {
      await pad
        .locator("button:not([disabled])")
        .first()
        .click()
        .catch(() => {});
      // Most pads answer on the click; one that waits for a confirmation takes Enter (never Enter on the
      // feedback, which would start the trial's next action unseen).
      await page.waitForTimeout(300);
      if (!(await feedback.isVisible().catch(() => false)))
        await page.keyboard.press("Enter").catch(() => {});
    }
    await page.waitForTimeout(400);
  }
  throw new Error("the warm-up did not finish in time");
}
