// Shared steps of the review specs: direct calls to the stack's own server (Origin and X-Oak as the app sends
// them), seeding the learner at a named point, and the screenshot matrix.
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { contrastIssuesIn } from "./contrast-check.ts";
import { stack } from "./playwright.config.ts";

export const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));
const HEADERS = { "content-type": "application/json", origin: stack.baseURL, "x-oak": "1" };

export async function api<T>(
  page: Page,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) {
  const res = await page.request.fetch(`${stack.apiURL}/api${path}`, {
    method,
    headers: HEADERS,
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
    timeout: 170_000,
  });
  return { status: res.status(), body: (await res.json().catch(() => null)) as T };
}

/** Wipes the learner and fast-forwards to `point` (server/src/services/dev-seed.ts SEED_POINTS). */
export async function seed(page: Page, point: string, opts: { recordings?: boolean } = {}): Promise<void> {
  await api(page, "PUT", "/dev/clock", { reset: true });
  const r = await api(page, "POST", "/dev/seed", { point, ...opts });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
}

export function sketchBody(title: string, code: string, extra: Record<string, unknown> = {}) {
  return {
    title,
    originKind: "free",
    originId: null,
    sessionId: null,
    code,
    bpm: 90,
    meter: "4/4",
    key: null,
    analysis: null,
    note: null,
    tutorAssisted: false,
    band: null,
    flags: { lockedTools: [], previewTools: [] },
    ranOk: false,
    ...extra,
  };
}

export async function createSketch(
  page: Page,
  title: string,
  code: string,
  extra: Record<string, unknown> = {},
) {
  const r = await api<{ sketch: { id: string } }>(page, "POST", "/sketches", sketchBody(title, code, extra));
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.sketch.id;
}

/** Screenshots `path` in both themes at 1440×900 and 1280×800 (`ready` waits for the page's content). */
export async function matrix(
  page: Page,
  path: string,
  name: string,
  ready: (page: Page) => Promise<void>,
): Promise<void> {
  for (const m of SCREENSHOT_MATRIX) {
    await useUiPrefs(page, { theme: m.theme, motion: "off" });
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.goto(path);
    await ready(page);
    await shoot(page, SHOTS, name, m.theme);
  }
}

/**
 * The page has settled: its fonts are loaded, nothing in it is marked busy, and the network has been idle for
 * 500 ms. A condition instead of a fixed sleep before reading the page (contrast.pw.ts): on a warm page it holds
 * sooner than the old 1.5 s, and on a cold first load it waits as long as the page needs.
 */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page.locator("[aria-busy=true]")).toHaveCount(0, { timeout: 30_000 });
  // QueryState's skeleton (role=status, data-state=loading) carries no aria-busy.
  await expect(page.locator("[data-state=loading]")).toHaveCount(0, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  // The old 1.5 s let fades end before colours were read.
  await animationsDone(page);
}

/**
 * Every finite animation or transition on the page has finished: colours and opacity are read at rest, never part-way
 * through a fade (a popover fading in reads as low contrast).
 */
export async function animationsDone(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => Number.isFinite(Number(a.effect?.getComputedTiming().endTime)))
        .map((a) => a.finished.catch(() => undefined)),
    ).then(() => undefined),
  );
}

/** No element wider than the viewport: a horizontal scrollbar on the document or on `#main`. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const over = await page.evaluate(() => {
    const main = document.getElementById("main");
    return {
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    };
  });
  expect(over.doc).toBeLessThanOrEqual(0);
  expect(over.main).toBeLessThanOrEqual(0);
}

/**
 * WCAG AA contrast of every visible text run in `#main` and the tutor panel (contrast-check.ts `contrastIssuesIn`).
 * Returns the failures.
 */
export function contrastIssues(page: Page): Promise<string[]> {
  return contrastIssuesIn(page, ["#main", '[data-testid="tutor-chat"]']);
}
