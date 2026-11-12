// Wave 3 integration: the tutor on the new step kinds inside the REAL lesson player (wave3.pw.ts stands in for
// the lesson through the dev hook; here the lesson sets the subject itself). A key signature written in the
// wrong order (U03.L06 S4) and a tune written by ear, checked as the starter (U03.L10 S3): the panel shows the
// Answer and Key chips, the hint turn carries the learner's own answer and never the expected one, and the
// reply renders in the panel. Screenshots of the panel in both themes at 1440×900 and 1280×800.
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { PREFS_KEY, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));
const HEADERS = { "content-type": "application/json", origin: stack.baseURL, "x-oak": "1" };

async function seed(page: Page, point: string): Promise<void> {
  await page.request.fetch(`${stack.apiURL}/api/dev/clock`, {
    method: "PUT",
    headers: HEADERS,
    data: JSON.stringify({ reset: true }),
  });
  const r = await page.request.fetch(`${stack.apiURL}/api/dev/seed`, {
    method: "POST",
    headers: HEADERS,
    data: JSON.stringify({ point }),
    timeout: 170_000,
  });
  expect(r.status(), await r.text()).toBe(200);
}

const panel = (page: Page) => page.getByTestId("tutor-chat");
const lastMessage = (page: Page) => panel(page).getByTestId("tutor-message").last();
const nextTurnBody = (page: Page) =>
  page
    .waitForRequest(
      (r) => /\/api\/tutor\/(hint|explain-mistake|chat)$/.test(r.url()) && r.method() === "POST",
    )
    .then((r) => r.postDataJSON() as { userText: string; learnerCode?: string; stepId?: string });

async function openStep(page: Page, lesson: string, step: string, theme: "paper" | "bark" = "paper") {
  await page.routeWebSocket(/.*/, () => {});
  await useUiPrefs(page, { theme, motion: "off" });
  await page.addInitScript((key) => {
    const cur = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...cur, tutorOpen: true }));
  }, PREFS_KEY);
  await page.goto(`/learn/${lesson}?step=${step}`);
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", step, { timeout: 60_000 });
  await expect(page.getByTestId("tutor-status")).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
}

test.describe.configure({ mode: "serial" });

// The other tutor specs start from the empty learner the stack begins with (no lens unlocked yet): leave it so.
test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await seed(page, "fresh");
  await page.close();
});

test("a key signature in the wrong order: the hint reads the learner's order, never the answer's", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await seed(page, "after U03.L05");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStep(page, "U03.L06", "S4");
  const surface = page.getByTestId("keysig-surface");
  await surface.focus();
  await page.keyboard.press("c");
  await page.keyboard.press("f");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail", { timeout: 30_000 });

  const chips = panel(page).getByTestId("context-chips");
  await expect(chips.locator('[data-chip="answer"]')).toBeVisible();
  await expect(chips.locator('[data-chip="key"]')).toHaveText(/Key · D major/);
  const body = nextTurnBody(page);
  await panel(page)
    .getByTestId("quick-actions")
    .getByRole("button", { name: /^Hint 1/ })
    .click();
  const b = await body;
  expect(b.stepId).toBe("S4");
  // The learner's order (C♯ then F♯), as placed; the expected order (F♯ C♯) never travels.
  expect(b.learnerCode ?? "").toMatch(/C#\s+F#|C♯\s*F♯/);
  expect(b.learnerCode ?? "").not.toMatch(/F#\s+C#|F♯\s*C♯/);
  expect(b.userText).toContain("On screen: key D major");
  await expect(lastMessage(page)).toHaveAttribute("data-status", "done", { timeout: 30_000 });
  await expect(lastMessage(page)).not.toBeEmpty();

  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, m.theme);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/w3-lesson-keysig-hint-${m.theme}-${m.width}x${m.height}.png` });
  }
});

test("a tune written by ear: Explain my mistake carries the code as written", async ({ page }) => {
  test.setTimeout(150_000);
  await seed(page, "after U03.L09");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStep(page, "U03.L10", "S3", "bark");
  // The starter as it is (one note, then rests): the check fails, and the learner asks why.
  const check = page.getByRole("button", { name: /^Check/ });
  await expect(check).toBeEnabled({ timeout: 20_000 });
  await check.click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail", { timeout: 30_000 });
  const chips = panel(page).getByTestId("context-chips");
  // One chip for the code written by ear, not a second "Your code" chip with the same lines.
  await expect(chips.locator('[data-chip="answer"]')).toHaveText(/by ear/);
  await expect(chips.locator('[data-chip="code"]')).toHaveCount(0);
  const body = nextTurnBody(page);
  const explain = panel(page)
    .getByTestId("quick-actions")
    .getByRole("button", { name: /Explain/ });
  await explain.click();
  const b = await body;
  expect(b.stepId).toBe("S3");
  expect(b.learnerCode ?? "").toContain("n(");
  await expect(lastMessage(page)).toHaveAttribute("data-status", "done", { timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/w3-lesson-byear-explain-bark-1440x900.png` });
});
