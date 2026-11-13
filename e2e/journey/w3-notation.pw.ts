// Wave 3 journey (c), from mid-U03 dev seeds: the key-signature lessons as real daily sessions, with their staff
// steps written by keyboard only, and the key-signature panel and the circle of fifths they open in Studio.
//   1. "after U03.L05": today is U03.L06 (Sharp Keys). Its S4 is written on the key-signature staff with the
//      keyboard: the sharps in the wrong order first (the feedback names the order, never the answer), then
//      F♯ C♯. The Coda opens the key-signature panel; in Studio, Shift+K shows it for the Make's key.
//   2. "after U03.L06": today is U03.L07 (Flat Keys & the Circle). Its S4 is B♭ major's flats, by keyboard. The
//      Coda opens the circle of fifths; in Studio the key panel and the circle agree on the piece's key.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { fakeMic } from "../../app/src/onboarding/e2e/helpers.ts";
import u03l06 from "../../content/core/U03/L06/lesson.ts";
import u03l07 from "../../content/core/U03/L07/lesson.ts";
import { useUiPrefs as setUiPrefs } from "../support/ui.ts";
import { coda, startToday } from "./day.ts";
import { walkLesson } from "./lesson-walk.ts";
import { api, expectClean, noHmr, resetClock, seed, shootAll, watch } from "./support.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav") }, permissions: ["microphone"] });
test.describe.configure({ mode: "serial" });

/** Presses Tab until `target` has focus: the keyboard's own way there. */
async function tabTo(page: Page, target: Locator, max = 60): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement || el.contains(document.activeElement)))
      return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Tab never reached the target");
}

/** The key-signature staff of the step on screen, written with letter keys and checked with Mod+Shift+Enter. */
async function writeSignature(page: Page, keys: string[], expected: "pass" | "fail"): Promise<void> {
  const staff = page.getByTestId("keysig-surface");
  await tabTo(page, staff);
  for (const k of keys) await page.keyboard.press(k);
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", expected, {
    timeout: 30_000,
  });
}

async function clearSignature(page: Page, n: number): Promise<void> {
  await tabTo(page, page.getByTestId("keysig-surface"));
  for (let i = 0; i < n; i++) await page.keyboard.press("Backspace");
  await expect(page.getByRole("list", { name: "Your key signature" }).locator("li")).toHaveText([
    "Nothing placed yet.",
  ]);
}

async function openMakeSketch(page: Page, title: string): Promise<void> {
  await page.goto("/studio");
  await page.getByTestId("sketch-card").filter({ hasText: title }).first().click();
  await expect(page).toHaveURL(/\/studio\/[^/]+$/);
  await expect(page.locator('[data-testid="workbench"][data-analysis=ready]')).toBeVisible({
    timeout: 60_000,
  });
}

/** Shift+K / Shift+C from the Workbench (focus in its editor), as the shortcut sheet lists them. */
async function togglePanel(page: Page, label: "Key" | "Circle", keys: string): Promise<void> {
  const button = page.getByTestId("panel-switch").getByRole("button", { name: label, exact: true });
  await expect(button).toBeVisible();
  if ((await button.getAttribute("aria-pressed")) === "true") return;
  await page.getByTestId("transport").getByTestId("play-toggle").focus();
  await page.keyboard.press(keys);
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

async function begin(page: Page, request: import("@playwright/test").APIRequestContext, point: string) {
  await resetClock(request);
  await seed(request, point);
  await noHmr(page);
  await setUiPrefs(page, { theme: "paper" });
  return watch(page);
}

test("U03.L06 as a daily session: D major's sharps on the staff by keyboard, then the key panel in Studio", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const w = await begin(page, request, "after U03.L05");
  const plan = await startToday(page, request, { warmupSets: 0 });
  expect(plan).toMatchObject({ kind: "lesson", mapItemId: "U03.L06" });
  await walkLesson(page, u03l06, {
    makeTitle: "Sharp keys make",
    before: async (step) => {
      if (step.id !== "S4") return;
      // C♯ first: the order is wrong, and the feedback says so without writing the signature out.
      await writeSignature(page, ["c", "f"], "fail");
      const fb = page.getByTestId("step-feedback");
      await expect(fb).toContainText(/order/i);
      await expect(fb).not.toContainText(/F♯,? C♯|F#,? C#/);
      await shootAll(page, "w3-keysig-order");
      await clearSignature(page, 2);
      await writeSignature(page, ["f", "c"], "pass");
      const s4 = await api<{ passed: boolean; attempts: number }>(
        request,
        "GET",
        "/api/lessons/U03.L06/steps/S4",
      );
      expect(s4).toMatchObject({ passed: true, attempts: 2 });
    },
  });
  await coda(page, { unlocks: true, shots: "w3-coda-U03.L06" });
  expect(JSON.stringify(await api<unknown>(request, "GET", "/api/unlocks"))).toContain("tb.feature.keysig");

  await openMakeSketch(page, "Sharp keys make");
  await togglePanel(page, "Key", "Shift+K");
  await expect(page.getByTestId("key-panel")).toBeVisible();
  await expect(page.getByTestId("key-panel-name")).toHaveText(/major/);
  await expect(page.getByTestId("key-panel-signature")).toBeVisible();
  // The circle opens with U03.L07, not yet.
  await expect(
    page.getByTestId("panel-switch").getByRole("button", { name: "Circle", exact: true }),
  ).toHaveCount(0);
  await shootAll(page, "w3-studio-key-panel");
  expectClean(w);
});

test("U03.L07 as a daily session: B♭ major's flats by keyboard, then the circle and the key panel agree in Studio", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const w = await begin(page, request, "after U03.L06");
  const plan = await startToday(page, request, { warmupSets: 0 });
  expect(plan).toMatchObject({ kind: "lesson", mapItemId: "U03.L07" });
  await walkLesson(page, u03l07, {
    makeTitle: "Flat keys make",
    before: async (step) => {
      if (step.id !== "S4") return;
      // "-" switches the staff to flats; then the letters B and E, in the order flats are written.
      await writeSignature(page, ["-", "b", "e"], "pass");
      await expect(page.getByRole("list", { name: "Your key signature" }).locator("li")).toHaveCount(2);
    },
  });
  await coda(page, { unlocks: true, shots: "w3-coda-U03.L07" });
  expect(JSON.stringify(await api<unknown>(request, "GET", "/api/unlocks"))).toContain("tb.feature.circle");

  await openMakeSketch(page, "Flat keys make");
  await togglePanel(page, "Key", "Shift+K");
  await togglePanel(page, "Circle", "Shift+C");
  await expect(page.getByTestId("circle-panel")).toBeVisible();
  const name = (await page.getByTestId("key-panel-name").textContent())?.trim() ?? "";
  expect(name).toMatch(/major/);
  await expect(page.getByTestId("circle-current")).toHaveText(name);
  await shootAll(page, "w3-studio-circle");
  expectClean(w);
});
