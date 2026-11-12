// Wave 3 review, breaking it on purpose: reload in the middle of a sung take, lenses switched mid-trial, and
// reduced motion on the degree drill. Each test starts from a dev seed.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../support/ui.ts";
import { api, noHmr, resetClock, reviewMic, seed, shootAll, watch } from "./support.ts";

test.use({ launchOptions: { args: reviewMic("hold-c4.wav") }, permissions: ["microphone"] });

test("reload mid-take: the step comes back closed, the mic is off, nothing is graded, nothing gates", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  await resetClock(request);
  await seed(request, "after U02.CP");
  await noHmr(page);
  await useUiPrefs(page, { theme: "bark" });
  const problems = watch(page);
  await page.goto("/learn/U03.L02?step=S8");
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", "S8", { timeout: 60_000 });
  await page.getByRole("button", { name: "Sing", exact: true }).click();
  const live = page.getByRole("button", { name: "Microphone is live. Close it" });
  await expect(live).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", "S8", { timeout: 60_000 });
  await expect(live).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sing", exact: true })).toBeVisible();
  await expect(page.getByTestId("continue")).toBeEnabled();
  const s8 = await api<{ attempts: number }>(request, "GET", "/api/lessons/U03.L02/steps/S8");
  expect(s8.attempts ?? 0).toBe(0);
  await shootAll(page, "w3-break-reload-take");
  expect(problems).toEqual([]);
});

test("lenses switched mid-trial keep the trial, the answer and the layout", async ({ page, request }) => {
  test.setTimeout(150_000);
  await resetClock(request);
  await seed(request, "after U03.L02");
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watch(page);
  await page.goto("/practice/fam.deg.fet-major");
  await expect(page.getByTestId("start-set")).toBeFocused({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  const block = page.getByTestId("listen-block");
  const counter = page.getByTestId("trial-counter");
  await expect(block.or(counter)).toBeVisible({ timeout: 60_000 });
  if (await block.isVisible()) await page.keyboard.press("Enter");
  await expect(counter).toHaveText(/Trial 1 of/, { timeout: 60_000 });
  await expect(page.getByTestId("stage-text")).toHaveText(/Your turn/, { timeout: 30_000 });
  const before = await page.evaluate(
    () => (globalThis as { __oakDrillTrial?: { seed: number } }).__oakDrillTrial?.seed,
  );
  const lenses = page.getByRole("group", { name: "Labels" });
  for (const b of await lenses.getByRole("button").all()) {
    await b.click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
  await shootAll(page, "w3-break-lenses-mid-trial");
  const after = await page.evaluate(
    () => (globalThis as { __oakDrillTrial?: { seed: number } }).__oakDrillTrial?.seed,
  );
  expect(after).toBe(before);
  await expect(counter).toHaveText(/Trial 1 of/);
  // The pad still answers from the keyboard (focus came back to the drill after the clicks).
  await page.locator("[data-degree]").first().focus();
  await page.keyboard.press("1");
  await expect(page.getByTestId("trial-feedback")).toBeVisible({ timeout: 30_000 });
  // Put the lenses back as they were.
  for (const b of await lenses.getByRole("button").all()) await b.click();
  expect(problems).toEqual([]);
});

test("reduced motion: nothing on the degree drill moves for longer than 120 ms", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  await resetClock(request);
  await seed(request, "after U03.L02");
  await noHmr(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await useUiPrefs(page, { theme: "paper", motion: "system" });
  await page.goto("/practice/fam.deg.fet-major");
  await expect(page.getByTestId("start-set")).toBeFocused({ timeout: 60_000 });
  await page.keyboard.press("Enter");
  const block = page.getByTestId("listen-block");
  const counter = page.getByTestId("trial-counter");
  await expect(block.or(counter)).toBeVisible({ timeout: 60_000 });
  if (await block.isVisible()) await page.keyboard.press("Enter");
  await expect(page.getByTestId("stage-text")).toHaveText(/Your turn/, { timeout: 60_000 });
  // A wrong answer (the shake of ux §4.2 is the risk).
  const expected = await page.evaluate(
    () =>
      ((globalThis as { __oakDrillTrial?: { expected: { degrees?: string[] } } }).__oakDrillTrial?.expected
        .degrees ?? ["1"])[0],
  );
  const keys = await page
    .locator("[data-degree]")
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.degree as string));
  await page.keyboard.press(keys.find((k) => k !== expected) ?? "1");
  await expect(page.getByTestId("trial-feedback")).toBeVisible({ timeout: 30_000 });
  const long = await page.evaluate(() =>
    document
      .getAnimations()
      .map((a) => {
        const t = a.effect?.getTiming();
        const d = typeof t?.duration === "number" ? t.duration : 0;
        const it = typeof t?.iterations === "number" ? t.iterations : 1;
        return { name: (a as CSSAnimation).animationName ?? a.constructor.name, ms: d * it };
      })
      .filter((a) => a.ms > 120),
  );
  expect(long).toEqual([]);
});
