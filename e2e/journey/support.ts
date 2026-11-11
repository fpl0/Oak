// Helpers of the gate journey: API calls as the browser makes them, the dev clock and seeder, and the watch on
// console errors and requests that leave this machine.
import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { stack } from "./playwright.config.ts";

const HEADERS = { "x-oak": "1", origin: stack.apiURL, "content-type": "application/json" };

export async function api<T = unknown>(
  request: APIRequestContext,
  method: "GET" | "PUT" | "POST",
  path: string,
  body?: unknown,
  base = stack.apiURL,
): Promise<T> {
  const res = await request.fetch(`${base}${path}`, {
    method,
    headers: { ...HEADERS, origin: base },
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
  });
  if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Wipes the learner and fast-forwards to a named point (`POST /api/dev/seed`, server/src/services/dev-seed.ts). */
export const seed = (request: APIRequestContext, point: string) =>
  api<{ point: string; done: string[]; capstoneSketchId: string | null; trackId: string | null }>(
    request,
    "POST",
    "/api/dev/seed",
    { point },
  );

/** Moves the server's clock (`PUT /api/dev/clock`). The app reads "today" from the server. */
export const advanceDays = (request: APIRequestContext, days: number) =>
  api<{ now: string; day: string }>(request, "PUT", "/api/dev/clock", { advanceDays: days });

export const resetClock = (request: APIRequestContext) =>
  api(request, "PUT", "/api/dev/clock", { reset: true });

/**
 * The only console error a page may print: Strudel's report of a learner's broken code (it logs evaluation errors
 * with `console.error`), and the browser's own line for a 4xx the app handles (a refused check, a 409).
 */
const ALLOWED = [/\[eval\] error/i, /\berror: .*(evaluat|parse|unexpected)/i];

export interface Watch {
  problems: string[];
  remote: string[];
}

/** Console errors, uncaught exceptions and any request that leaves 127.0.0.1 / localhost. */
export function watch(page: Page, allow: RegExp[] = []): Watch {
  const w: Watch = { problems: [], remote: [] };
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if ([...ALLOWED, ...allow].some((r) => r.test(t))) return;
    w.problems.push(`console.error: ${t}`);
  });
  page.on("pageerror", (e) => w.problems.push(`pageerror: ${e.message}`));
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (
      (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "ws:") &&
      !["127.0.0.1", "localhost"].includes(u.hostname)
    )
      w.remote.push(r.url());
  });
  return w;
}

export function expectClean(w: Watch): void {
  expect(w.remote, "requests that left this machine").toEqual([]);
  expect(w.problems, "console errors").toEqual([]);
}

/** Cuts Vite's HMR socket so a file saved elsewhere cannot remount the screen under test. */
export async function noHmr(page: Page): Promise<void> {
  await page.routeWebSocket(/\/(\?token=|@vite)/, () => {});
}

export async function openToday(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("today-card")).toBeVisible();
}

/** Screenshots the screen at 1440×900 and 1280×800 in Paper and Bark (`test-results/journey-screens/`). */
export async function shootAll(page: Page, name: string): Promise<void> {
  const { SCREENSHOT_MATRIX, REPO_ROOT } = await import("../support/stack.ts");
  const { shoot } = await import("../support/ui.ts");
  const size = page.viewportSize();
  const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? "paper");
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, m.theme);
    await page.waitForTimeout(150);
    await shoot(page, `${REPO_ROOT}test-results/journey-screens`, name, m.theme);
  }
  if (size) await page.setViewportSize(size);
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
}
