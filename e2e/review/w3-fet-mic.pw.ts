// Wave 3 review, ear training: a degree set (fam.deg.fet-major) on the real server, then broken on purpose.
// Regressions:
// - A wrong pick was not marked: the pad outlined the answer but the learner's own key looked untouched
//   ("the answer is shown next to yours" — yours was nowhere). The picked key now reads "not this one".
// - The microphone denied in the middle of a set: the way home was skipped with "Singing skipped. No penalty."
//   and nothing else — no reason and no way out, and every later trial asked the mic again. The line now says
//   why and offers Quiet mode for today in place.
// - Quiet mode switched on mid-set: the drill machine kept the Quiet mode it started with, so the next way home
//   still opened the microphone while the page showed Quiet mode. The machine follows Quiet mode now; after the
//   switch the way home is "heard in your head" and the mic is never asked again.
// - The listen block's "Start the set" showed Enter, but Enter did nothing unless the button had focus; its
//   lines read "deg.1, deg.3…" (IDs) instead of "Degree 1…".
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../support/ui.ts";
import { api, noHmr, resetClock, seed, shootAll, watch } from "./support.ts";

test.use({
  launchOptions: {
    args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-device-for-media-stream"],
  },
  permissions: ["microphone"],
});

test("a degree set survives a denied mic and Quiet mode switched on mid-set", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(220_000);
  await resetClock(request);
  await seed(request, "after U03.L02");
  await api(request, "PUT", "/api/voice/quiet", { quiet: false, scope: "today" }).catch(() => null);
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  // Count every microphone request the page makes.
  await page.addInitScript(() => {
    const md = navigator.mediaDevices;
    const real = md.getUserMedia.bind(md);
    (globalThis as { __micAsks?: number }).__micAsks = 0;
    md.getUserMedia = (c) => {
      (globalThis as { __micAsks?: number }).__micAsks =
        ((globalThis as { __micAsks?: number }).__micAsks ?? 0) + 1;
      return real(c);
    };
  });
  const asks = () => page.evaluate(() => (globalThis as { __micAsks?: number }).__micAsks ?? 0);
  const problems = watch(page, [/Permission denied|NotAllowedError/i]);
  await page.goto("/practice/fam.deg.fet-major");
  await expect(page.getByTestId("start-set")).toBeFocused({ timeout: 60_000 });
  await page.keyboard.press("Enter");

  // A blocked introduction may open the set: Enter starts it wherever focus is, and its lines are words.
  const block = page.getByTestId("listen-block");
  const counter = page.getByTestId("trial-counter");
  await expect(block.or(counter)).toBeVisible({ timeout: 60_000 });
  if (await block.isVisible()) {
    await expect(block.locator("ol > li").first()).not.toContainText("deg.");
    await page.locator("body").focus();
    await page.keyboard.press("Enter");
  }
  await expect(counter).toHaveText(/Trial 1 of \d+/, { timeout: 60_000 });

  let denied = false;
  let quietAt = -1;
  let quietHome = 0;
  for (let i = 0; i < 12; i++) {
    if (await page.getByTestId("set-summary").isVisible()) break;
    await expect(page.getByRole("group", { name: /Your answer/ })).toBeVisible({ timeout: 30_000 });
    // Wait for the question to be asked (the key first, then the note), then answer 6: often wrong.
    await expect(page.getByTestId("stage-text")).toHaveText(/Your turn/, { timeout: 30_000 });
    // Trial 1 is answered wrong (to see the marks); the rest right, so ways home are offered.
    const expected = await page.evaluate(
      () =>
        ((globalThis as { __oakDrillTrial?: { expected: { degrees?: string[] } } }).__oakDrillTrial?.expected
          .degrees ?? ["1"])[0] as string,
    );
    const keys = await page
      .locator("[data-degree]")
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.degree as string));
    const six = i === 0 ? (keys.find((k) => k !== expected) ?? expected) : expected;
    await page.keyboard.press(six);
    const feedback = page.getByTestId("trial-feedback");
    await expect(feedback).toBeVisible({ timeout: 30_000 });
    if (i === 0) {
      await expect(feedback).toHaveAttribute("data-correct", "false");
      // The learner's own wrong pick is marked, beside the outlined answer.
      await expect(page.locator(`[data-degree="${six}"]`)).toHaveAttribute("aria-checked", "true");
      await expect(
        page.locator(`[data-degree="${six}"] [data-mark="bad"], [data-degree="${six}"] svg`),
      ).not.toHaveCount(0);
      await shootAll(page, "w3-fet-wrong-pick");
    }
    const next = page.getByTestId("next-trial");
    const label = (await next.textContent()) ?? "";
    if (label.includes("Sing it home") && !denied) {
      // The mic is taken away in the middle of the set.
      await context.clearPermissions();
      denied = true;
      await page.keyboard.press("Enter");
      await expect(feedback).toContainText(/microphone|Microphone/, { timeout: 30_000 });
      await expect(feedback).toContainText(/no penalty/i);
      await expect(feedback).not.toContainText("Shift+S");
      await shootAll(page, "w3-fet-mic-denied");
      await page.getByTestId("quiet-today").click();
      quietAt = await asks();
      await expect(page.getByTestId("quiet-today")).toHaveCount(0, { timeout: 15_000 });
    } else if (label.includes("Hear it home")) {
      quietHome++;
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("quiet-resolution")).toBeVisible({ timeout: 30_000 });
      await shootAll(page, "w3-fet-quiet-home");
      await page.keyboard.press("Space");
      await expect(feedback).toContainText("in your head", { timeout: 15_000 });
    } else if (label.includes("Sing it home")) {
      throw new Error("asked to sing after Quiet mode was switched on");
    }
    await expect(next).toBeEnabled({ timeout: 30_000 });
    const last = (await next.textContent())?.includes("Finish set");
    await page.keyboard.press("Enter");
    if (last) break;
  }
  await expect(page.getByTestId("set-summary")).toBeVisible({ timeout: 60_000 });
  await shootAll(page, "w3-fet-summary");
  expect(denied, "the set offered a way home to sing").toBe(true);
  // After Quiet mode went on, the page never asked for the microphone again.
  expect(await asks()).toBe(quietAt);
  console.log(`quiet ways home after the switch: ${quietHome}`);
  await api(request, "PUT", "/api/voice/quiet", { quiet: false, scope: "today" }).catch(() => null);
  expect(problems).toEqual([]);
});
