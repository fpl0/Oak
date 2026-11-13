// Shared bits of the onboarding specs: the fake microphone, screenshots in both themes and sizes, and the
// steps every path walks through.
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot } from "../../../../e2e/support/ui.ts";

export const SHOTS = resolve(import.meta.dirname, "screenshots");

/** Chromium flags: a fake mic reading `wav` (restarted at every open), granted or refused. */
export function fakeMic(wav: string, permission: "grant" | "deny" = "grant"): string[] {
  return [
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${resolve(import.meta.dirname, ".generated", wav)}`,
    permission === "grant" ? "--use-fake-ui-for-media-stream" : "--use-fake-ui-for-media-stream=deny",
  ];
}

/** Collects page errors and console errors (Strudel's one evaluation error is allowed by the caller). */
export function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    // `/api/onboarding` answers a typed 501 until the server engineer lands it; the app falls back on purpose.
    if (m.type() === "error" && !/status of 501/.test(m.text())) problems.push(`console.error: ${m.text()}`);
  });
  return problems;
}

/** Screenshots the current screen at 1440×900 and 1280×800 in Paper and Bark, then restores the page. */
export async function shootAll(page: Page, name: string): Promise<void> {
  const size = page.viewportSize();
  const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? "paper");
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, m.theme);
    await page.waitForTimeout(120);
    await shoot(page, SHOTS, name, m.theme);
  }
  if (size) await page.setViewportSize(size);
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
}

export async function step(page: Page): Promise<string | null> {
  return page.getByTestId("onboarding").getAttribute("data-step");
}

export async function expectStep(page: Page, s: string, timeout = 15_000): Promise<void> {
  await expect(page.getByTestId("onboarding")).toHaveAttribute("data-step", s, { timeout });
  await expect(page).toHaveURL(new RegExp(`/onboarding/${s}$`));
}

/** Welcome → loop (the build-up) → edit (types `value`, runs with the keyboard) → reaction. */
export async function throughTheLoop(page: Page, value: number, opts: { shots?: boolean } = {}) {
  await page.goto("/onboarding/1");
  await expectStep(page, "welcome");
  await expect(page.getByTestId("start-sound")).toBeFocused();
  if (opts.shots) await shootAll(page, "01-welcome");
  await page.keyboard.press("Enter");
  await expectStep(page, "loop", 60_000);
  // The four musicians come in one per bar: drums first, the melody in bar 5.
  await expect(page.locator('[data-layer="drums"]')).toHaveAttribute("data-on", "1", { timeout: 20_000 });
  await expect(page.locator('[data-layer="mel"]')).toHaveAttribute("data-on", "0");
  await expect(page.locator('[data-layer="bass"]')).toHaveAttribute("data-on", "1", { timeout: 10_000 });
  if (opts.shots) await shootAll(page, "02-loop-building");
  await expect(page.locator('[data-layer="mel"]')).toHaveAttribute("data-on", "1", { timeout: 20_000 });
  await expect(page.getByTestId("loop-continue")).toBeEnabled();
  await page.getByTestId("loop-continue").focus();
  await page.keyboard.press("Enter");
  await expectStep(page, "edit");
  const box = page.locator(".oak-mark-target");
  await expect(box).toHaveText("4");
  if (opts.shots) await shootAll(page, "03-edit");
  await box.dblclick();
  await page.keyboard.type(String(value));
  await page.keyboard.press("ControlOrMeta+Enter");
  await expectStep(page, "react");
  if (opts.shots) await shootAll(page, "04-react");
}

/**
 * The reaction screen from the dev seed "onboarding at react (edit <value>)": the welcome, the loop's build-up and the
 * edit are the full onboarding's subject (e2e/journey/journey.pw.ts gate journey 1, the journeys' Quiet day and
 * quiet.pw.ts walk them with `throughTheLoop`; the Quiet resume test edits and reloads); a spec about the screens after
 * them starts here instead of waiting out the four bars of the build-up.
 */
export async function fromTheReaction(
  page: Page,
  request: import("@playwright/test").APIRequestContext,
  apiURL: string,
  value: number,
) {
  const h = { "x-oak": "1", "content-type": "application/json", origin: apiURL };
  expect((await request.put(`${apiURL}/api/dev/clock`, { headers: h, data: { reset: true } })).ok()).toBe(
    true,
  );
  const point = `onboarding at react (edit ${value})`;
  expect((await request.post(`${apiURL}/api/dev/seed`, { headers: h, data: { point } })).ok()).toBe(true);
  await page.goto("/onboarding/1");
  await expectStep(page, "react");
  await page.getByTestId("gate-start").click();
  await expect(page.getByTestId("react-continue")).toBeVisible();
}

/** Wipes the stack's data between tests (the data dir is shared by every test of a run). */
export async function resetData(request: import("@playwright/test").APIRequestContext, apiURL: string) {
  const h = { "x-oak": "1", "content-type": "application/json", origin: apiURL };
  const { nonce } = await (
    await request.post(`${apiURL}/api/confirm`, { headers: h, data: { action: "data.reset", target: "*" } })
  ).json();
  const r = await request.post(`${apiURL}/api/data/reset`, { headers: { ...h, "x-oak-confirm": nonce } });
  expect(r.ok()).toBe(true);
}

/**
 * Cuts the Vite HMR socket: other engineers edit shared files while these specs run, and a hot update would
 * remount the screen under test (the platform's mic-indicator spec does the same).
 */
export async function noHmr(page: Page): Promise<void> {
  await page.routeWebSocket(/\/(\?token=|@vite)/, () => {});
}
