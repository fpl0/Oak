// Shared steps of the Transcribe specs: direct calls to this stack's server (Origin and X-Oak as the app sends
// them) and seeding the learner at a named point (docs/design/wave4.md §6).
import { expect, type Page } from "@playwright/test";
import { stack } from "./playwright.config.ts";

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

/** Wipes the learner and fast-forwards to `point` (`GET /api/dev/seed` lists the points). */
export async function seed(page: Page, point: string): Promise<void> {
  await api(page, "PUT", "/dev/clock", { reset: true });
  const r = await api(page, "POST", "/dev/seed", { point });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
}

/**
 * Check what is written (the panel's Check). After a failed check the answer is changed through Try again
 * (docs/design/retry.md §3.6): Check comes back once the verdict goes, so Try again is pressed first when it is the
 * way back to Check.
 */
export async function checkIt(page: Page): Promise<void> {
  const check = page.getByTestId("check");
  const retry = page.getByTestId("result-retry");
  if (!(await check.isVisible()) && (await retry.isVisible())) await retry.click();
  await check.click();
}
