// Helpers of the review suite: API calls against this suite's own server (8821), the dev clock and seeder, a watch
// on console errors, and screenshots of every screen in both themes and both sizes (`e2e/review/screenshots/`).
import { resolve } from "node:path";
import { type APIRequestContext, type Browser, expect, type Page, type Request } from "@playwright/test";
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

/** The page's requests still in flight (long-lived streams excepted), counted from the moment this is called. */
export function inFlight(page: Page): { readonly count: number } {
  const pending = new Set<Request>();
  page.on("request", (r) => {
    if (!["websocket", "eventsource"].includes(r.resourceType())) pending.add(r);
  });
  page.on("requestfinished", (r) => pending.delete(r));
  page.on("requestfailed", (r) => pending.delete(r));
  return {
    get count() {
      return pending.size;
    },
  };
}

/**
 * Waits until the page has settled, in place of a fixed sleep before a layout read: no request in flight, the
 * fonts loaded, no region marked busy, then two animation frames (the layout of the last change is painted).
 */
export async function settled(page: Page, requests: { readonly count: number }): Promise<void> {
  await expect.poll(() => requests.count, { message: "requests still in flight", timeout: 20_000 }).toBe(0);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          await document.fonts.ready;
          return document.querySelectorAll('[aria-busy="true"]').length;
        }),
      { message: "a region still busy", timeout: 20_000 },
    )
    .toBe(0);
  await page.evaluate(
    () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
}

export async function noHmr(page: Page): Promise<void> {
  await page.routeWebSocket(/\/(\?token=|@vite)/, () => {});
}

type SessionHandle = {
  report(r: unknown): void;
  state(): { plan: { warmup: { items: { id: string }[] } } | null };
};

/**
 * Reports every set of the warm-up on screen skipped through the session's dev hook (`__oakSession`), as the
 * learner's own skip would, and waits for the hand-over: for specs whose subject comes after the warm-up (the
 * warm-up's sets are walked by the drill, warm-up and journey suites).
 */
export async function skipWarmup(page: Page): Promise<void> {
  const warmup = page.getByTestId("warmup");
  await expect(warmup).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => {
    const o = (window as never as { __oakSession: SessionHandle }).__oakSession;
    for (const item of o.state().plan?.warmup.items ?? [])
      o.report({
        block: "warmup",
        source: "drills",
        warmupItemId: item.id,
        drillSessionId: null,
        meanCredit: null,
        skipped: true,
      });
  });
  await expect(warmup).toBeHidden({ timeout: 30_000 });
}

/**
 * The body of the session's `POST /api/session/:id/end` once it comes, so a Coda can know at once whether its
 * unlock moment is due (the tools unlocked since the session began) instead of waiting to see if it appears.
 */
export function sessionEnd(page: Page): () => Promise<{ unlocks: unknown[] }> {
  const ends: Promise<{ unlocks: unknown[] }>[] = [];
  page.on("response", (r) => {
    if (r.request().method() === "POST" && /\/api\/session\/[^/]+\/end$/.test(new URL(r.url()).pathname))
      ends.push(r.json() as Promise<{ unlocks: unknown[] }>);
  });
  return async () => {
    await expect
      .poll(() => ends.length, { message: "the session ended", timeout: 30_000 })
      .toBeGreaterThan(0);
    return (await ends.at(-1)) as { unlocks: unknown[] };
  };
}

/**
 * A listening step just started: it plays (the toggle is pressed), listening never gates (Skip is offered from
 * the start), and the transport moves on from its first reading (beat-level, so a one-bar loop moves too).
 */
export async function playsAndMoves(page: Page): Promise<void> {
  const toggle = page.getByTestId("play-toggle").first();
  await expect(toggle, "it plays").toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  await expect(page.getByTestId("continue"), "listening never gates (Skip from the start)").toHaveText(
    /Skip/,
  );
  const counter = page.getByTestId("bar-counter").first();
  const first = ((await counter.textContent()) ?? "").trim();
  expect(first, "the bar counter").toMatch(/^\d+\.\d+ \/ \d+$/);
  await expect
    .poll(async () => ((await counter.textContent()) ?? "").trim(), {
      message: `the transport moves on from ${first}`,
      timeout: 15_000,
    })
    .not.toBe(first);
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
    // The new size and theme laid out and painted (two frames), in place of a fixed 150 ms per shot.
    await page.evaluate(
      () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
    );
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
export type ReviewWav =
  | "hold-c4.wav"
  | "flat-c4.wav"
  | "sharp-c4.wav"
  | "octave-c3.wav"
  | "late-c4.wav"
  | "short-c4.wav"
  | "noisy-c4.wav"
  | "silent.wav";

export function reviewMic(wav: ReviewWav): string[] {
  // The quiet room is the onboarding suite's fixture (generated by the same web-server command).
  const file =
    wav === "silent.wav"
      ? resolve(import.meta.dirname, "../../app/src/onboarding/e2e/.generated/silent.wav")
      : resolve(import.meta.dirname, ".generated", wav);
  return [
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${file}`,
    "--use-fake-ui-for-media-stream",
  ];
}

/**
 * A page in its own Chromium whose fake microphone reads `wav` (Playwright cannot switch `launchOptions` per
 * test inside one file): for specs that try several voices in a row. Close it with `done()`.
 */
export async function micPage(
  pw: { chromium: { launch(o: { args: string[]; headless: boolean }): Promise<Browser> } },
  wav: ReviewWav,
): Promise<{ page: Page; done(): Promise<void> }> {
  const browser = await pw.chromium.launch({ args: reviewMic(wav), headless: true });
  const context = await browser.newContext({
    baseURL: stack.baseURL,
    viewport: { width: 1440, height: 900 },
    permissions: ["microphone"],
  });
  const page = await context.newPage();
  return { page, done: () => browser.close() };
}
