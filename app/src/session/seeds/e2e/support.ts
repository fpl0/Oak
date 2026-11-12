// Helpers for the seeded session specs: the dev seed and the dev clock (wave3.md §5.5), API calls as the
// browser makes them, the HMR block, screenshots across the matrix and the overflow check.
import { join } from "node:path";
import { type APIRequestContext, type BrowserContext, expect, type Page } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";

export const SHOTS = join(import.meta.dirname, "screenshots");
const HEADERS = { "x-oak": "1", origin: stack.apiURL, "content-type": "application/json" };

export async function api<T = unknown>(
  request: APIRequestContext,
  method: "GET" | "PUT" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await request.fetch(`${stack.apiURL}${path}`, {
    method,
    headers: HEADERS,
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
    timeout: 120_000,
  });
  if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** The status of a GET (for endpoints that may still answer 501 while the server engineer builds them). */
export async function status(request: APIRequestContext, path: string): Promise<number> {
  const res = await request.fetch(`${stack.apiURL}${path}`, { method: "GET", headers: HEADERS });
  return res.status();
}

export interface SeedResult {
  point: string;
  done: string[];
  next: string | null;
  day: string;
  gapDays: number;
  sketchIds: string[];
}

/** Wipes the learner and fast-forwards to a seed point; the clock goes back to real time first. */
export async function seed(
  request: APIRequestContext,
  point: string,
  opts: { gapDays?: number; targetMinutes?: 15 | 20 | 25; practice?: boolean } = {},
): Promise<SeedResult> {
  await api(request, "PUT", "/api/dev/clock", { reset: true });
  return api<SeedResult>(request, "POST", "/api/dev/seed", { point, ...opts });
}

/** The seed points the server offers now. */
export async function seedPoints(request: APIRequestContext): Promise<string[]> {
  const r = await api<{ items: { point: string }[] }>(request, "GET", "/api/dev/seed");
  return r.items.map((i) => i.point);
}

/** Moves the server's clock by whole days (the app reads the learner day from the server). */
export async function advanceDays(request: APIRequestContext, days: number): Promise<{ day: string }> {
  return api<{ day: string }>(request, "PUT", "/api/dev/clock", { advanceDays: days });
}

/** Other engineers' edits make Vite reload the page mid-test: block the HMR websocket. */
export async function blockHmr(page: Page): Promise<void> {
  await page.routeWebSocket(/.*/, () => {});
}
export async function blockHmrIn(context: BrowserContext): Promise<void> {
  await context.routeWebSocket(/.*/, () => {});
}

/** No horizontal page scroll: neither the document nor the shell's scrolling <main>. */
export async function expectNoOverflow(page: Page): Promise<void> {
  const o = await page.evaluate(() => {
    const main = document.getElementById("main");
    return {
      doc: document.documentElement.scrollWidth - window.innerWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    };
  });
  expect(o.doc, "document overflows horizontally").toBeLessThanOrEqual(1);
  expect(o.main, "<main> overflows horizontally").toBeLessThanOrEqual(1);
}

export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

/** Today, loaded and decided. */
export async function today(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("today-card")).toBeVisible();
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", /.+/);
}

/** Screenshots of `open` at 1440×900 and 1280×800 in Paper and Bark, with the overflow check. */
export async function matrix(page: Page, name: string, open: (page: Page) => Promise<void>): Promise<void> {
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await useUiPrefs(page, { theme: m.theme });
    await open(page);
    await settle(page);
    await expectNoOverflow(page);
    await shoot(page, SHOTS, name, m.theme);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}
