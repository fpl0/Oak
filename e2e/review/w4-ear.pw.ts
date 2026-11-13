// Wave 4 review (review:journey): ear training stage D as the learner meets it in Practice. Every harmony trial
// sets its key first (a cadence, and the Cadence key to hear it again). Defect found: the learner could hear the
// bass alone only AFTER answering, so the bass-degree drill and the bass step of the staged chord dictation asked
// for the bass without ever letting it be heard by itself. Now "Bass alone" (B) plays it while answering, and it
// counts as a replay. Then Quiet mode is switched on in another tab in the middle of a bass set.
import { expect, type Page, test } from "@playwright/test";
import { useUiPrefs } from "../support/ui.ts";
import { reviewMic, shootAll, watch } from "./support.ts";
import { quietHmr, seedPoint, setQuiet } from "./w4-support.ts";

test.use({ launchOptions: { args: reviewMic("hold-c4.wav") }, permissions: ["microphone"] });

type Trial = { family: string; expected: { degrees?: string[] }; seed: number };
const trialNow = (page: Page) =>
  page.evaluate(() => (globalThis as { __oakDrillTrial?: unknown }).__oakDrillTrial) as Promise<Trial>;

/** Practice → the family's set → its first trial, answering. */
async function firstTrial(page: Page, fam: string): Promise<void> {
  await page.goto(`/practice/${fam}`);
  await expect(page.getByTestId("start-set")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("start-set").click();
  const block = page.getByTestId("listen-block");
  const counter = page.getByTestId("trial-counter");
  await expect(block.or(counter)).toBeVisible({ timeout: 60_000 });
  if (await block.isVisible()) await page.getByRole("button", { name: /Start the set/ }).click();
  await expect(counter).toHaveText(/Trial 1 of/, { timeout: 60_000 });
}

/** The key is set before the chords, every trial: the stage line says so, and the cadence can be heard again. */
async function keyThenTurn(page: Page): Promise<void> {
  await expect(page.getByTestId("stage-text")).toHaveText(/Setting the key/, { timeout: 30_000 });
  await expect(page.getByTestId("stage-text")).toHaveText("Your turn.", { timeout: 60_000 });
  await expect(page.getByRole("button", { name: /^Cadence/ })).toBeVisible();
}

test("bass degrees: the bass alone, by key and by button, while answering; it counts as a replay", async ({
  page,
  request,
}) => {
  test.setTimeout(200_000);
  await seedPoint(request, "U06.CP due");
  await setQuiet(request, false);
  await quietHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watch(page);
  await firstTrial(page, "fam.har.bass");
  await keyThenTurn(page);
  const bass = page.getByTestId("hear-bass-now");
  await expect(bass).toBeVisible();
  await expect(page.getByTestId("sing-part")).toBeVisible();
  await shootAll(page, "w4-ear-bass-answering");
  // From the pad, by key: B plays the bass line by itself, and the pad stays live.
  await page.locator("[data-degree]").first().focus();
  await page.keyboard.press("b");
  await expect(page.getByTestId("stage-text")).toHaveText("The bass alone…", { timeout: 10_000 });
  await expect(page.getByTestId("stage-text")).toHaveText("Your turn.", { timeout: 30_000 });
  await expect(page.getByText(/^Replays 1 of \d+$/)).toBeVisible();
  // Then answered by key: the expected degrees.
  const t = await trialNow(page);
  await page.locator("[data-degree]").first().focus();
  for (const d of t.expected.degrees ?? []) await page.keyboard.press(d.replace(/^[b#]/, ""));
  // A full pad checks itself; Enter only when it has not.
  await page.waitForTimeout(400);
  if (!(await page.getByTestId("trial-feedback").isVisible())) await page.keyboard.press("Enter");
  await expect(page.getByTestId("trial-feedback")).toBeVisible({ timeout: 30_000 });
  // After the answer the bass alone is still there (the answer in context).
  await expect(page.getByTestId("hear-bass")).toBeVisible();
  // Chord symbols print with the music glyphs (C♯m, B♭), never ASCII.
  const ctx = (await page.getByTestId("answer-in-context").textContent()) ?? "";
  console.log(`[context] ${ctx}`);
  expect(ctx).not.toMatch(/[A-G](#|b)/);
  expect(problems).toEqual([]);
});

test("staged chord dictation: the bass alone on the bass step only", async ({ page, request }) => {
  test.setTimeout(200_000);
  await seedPoint(request, "U06.CP due");
  await quietHmr(page);
  await useUiPrefs(page, { theme: "bark" });
  const problems = watch(page);
  await firstTrial(page, "fam.har.progression");
  await keyThenTurn(page);
  await expect(page.getByTestId("step-prompt")).toHaveText("Step 1 · The bass: the degree under each chord.");
  await expect(page.getByTestId("hear-bass-now")).toBeVisible();
  await page.getByTestId("hear-bass-now").click();
  await expect(page.getByTestId("stage-text")).toHaveText("The bass alone…", { timeout: 10_000 });
  await expect(page.getByTestId("stage-text")).toHaveText("Your turn.", { timeout: 30_000 });
  await shootAll(page, "w4-ear-staged-bass");
  const steps = (await page.evaluate(
    () => (globalThis as { __oakDrillSteps?: unknown }).__oakDrillSteps,
  )) as { bass: string[] };
  const pad = page.getByRole("group", { name: "Your answer: the degrees, in order" });
  await pad.locator("button").first().focus();
  for (const d of steps.bass) await page.keyboard.press(d.replace(/^[b#]/, ""));
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("step-prompt")).not.toHaveText(/Step 1/, { timeout: 20_000 });
  await expect(page.getByTestId("hear-bass-now")).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("Quiet mode switched on in another tab mid-set: the sung roots go, the set goes on", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(200_000);
  await seedPoint(request, "U06.CP due");
  await setQuiet(request, false);
  await quietHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watch(page);
  await firstTrial(page, "fam.har.bass");
  await keyThenTurn(page);
  await expect(page.getByTestId("sing-part")).toBeVisible();
  const other = await context.newPage();
  await quietHmr(other);
  await other.goto("/settings/voice");
  const control = other.getByTestId("quiet-control");
  await expect(control).toBeVisible({ timeout: 60_000 });
  await control.getByRole("switch").click();
  await expect(control).toHaveAttribute("data-quiet", "1", { timeout: 20_000 });
  await other.close();
  await expect(page.getByTestId("sing-part"), "no sung part in Quiet mode").toHaveCount(0, {
    timeout: 20_000,
  });
  await expect(page.getByTestId("hear-bass-now")).toBeVisible();
  const t = await trialNow(page);
  await page.locator("[data-degree]").first().focus();
  for (const d of t.expected.degrees ?? []) await page.keyboard.press(d.replace(/^[b#]/, ""));
  // A full pad checks itself; Enter only when it has not.
  await page.waitForTimeout(400);
  if (!(await page.getByTestId("trial-feedback").isVisible())) await page.keyboard.press("Enter");
  await expect(page.getByTestId("trial-feedback")).toHaveAttribute("data-correct", "true", {
    timeout: 30_000,
  });
  await shootAll(page, "w4-ear-bass-quiet-mid-set");
  await setQuiet(request, false);
  expect(problems).toEqual([]);
});
