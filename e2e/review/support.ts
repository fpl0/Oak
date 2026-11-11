// Helpers of the review suite: API calls against this suite's own server (8821), the dev clock and seeder, a watch
// on console errors, and screenshots of every screen in both themes and both sizes (`e2e/review/screenshots/`).
import { resolve } from "node:path";
import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../support/stack.ts";
import { shoot } from "../support/ui.ts";
import { stack } from "./playwright.config.ts";

export const SHOTS = resolve(import.meta.dirname, "screenshots");

export async function api<T = unknown>(
  request: APIRequestContext,
  method: "GET" | "PUT" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await request.fetch(`${stack.apiURL}${path}`, {
    method,
    headers: { "x-oak": "1", origin: stack.apiURL, "content-type": "application/json" },
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
  });
  if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const seed = (request: APIRequestContext, point: string) =>
  api<{ point: string; done: string[] }>(request, "POST", "/api/dev/seed", { point });

export const advanceDays = (request: APIRequestContext, days: number) =>
  api<{ now: string; day: string }>(request, "PUT", "/api/dev/clock", { advanceDays: days });

export const clockTo = (request: APIRequestContext, iso: string) =>
  api<{ now: string; day: string }>(request, "PUT", "/api/dev/clock", { at: iso });

export const advanceMinutes = (request: APIRequestContext, minutes: number) =>
  api<{ now: string; day: string }>(request, "PUT", "/api/dev/clock", {
    advanceMs: Math.round(minutes * 60_000),
  });

export const resetClock = (request: APIRequestContext) =>
  api(request, "PUT", "/api/dev/clock", { reset: true });

const ALLOWED = [/\[eval\] error/i, /\berror: .*(evaluat|parse|unexpected)/i];

/** Console errors and uncaught exceptions (Strudel's report of a learner's broken code is allowed). */
export function watch(page: Page, allow: RegExp[] = []): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if ([...ALLOWED, ...allow].some((r) => r.test(t))) return;
    problems.push(`console.error: ${t}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

export async function noHmr(page: Page): Promise<void> {
  await page.routeWebSocket(/\/(\?token=|@vite)/, () => {});
}

export async function openToday(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("today-card")).toBeVisible();
}

/** The screen at 1440×900 and 1280×800 in Paper and Bark. */
export async function shootAll(page: Page, name: string): Promise<void> {
  const size = page.viewportSize();
  const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? "paper");
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, m.theme);
    await page.waitForTimeout(150);
    await shoot(page, SHOTS, name, m.theme);
  }
  if (size) await page.setViewportSize(size);
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
}

/** One quick screenshot of the visible window (for reading during exploration). */
export async function snap(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: resolve(SHOTS, `${name}.png`) });
}

/** Chromium flags: a fake microphone reading one of this suite's WAVs (`make-fixtures.bun.ts`), granted. */
export function reviewMic(wav: "hold-c4.wav"): string[] {
  return [
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${resolve(import.meta.dirname, ".generated", wav)}`,
    "--use-fake-ui-for-media-stream",
  ];
}
