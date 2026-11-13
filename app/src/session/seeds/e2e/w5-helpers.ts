// Helpers for the session area's Wave 5 specs (w5-*.pw.ts): the session handle, the warm-up skip, the console
// watch, Today and the session page. Every Wave 5 field the specs read is the server's own (wave5.md §5): nothing
// here fills or patches an answer.
import { expect, type Page } from "@playwright/test";

export type OakSessionHandle = {
  runner: { toCoda(): void };
  report(r: unknown): void;
  state(): {
    plan: { kind: string; mapItemId: string | null; warmup: { items: { id: string }[] } } | null;
    session: { id: string } | null;
    block: string | null;
  };
};

export const sessionState = (page: Page) =>
  page.evaluate(() => (window as never as { __oakSession: OakSessionHandle }).__oakSession.state());
export const toCoda = (page: Page) =>
  page.evaluate(() => (window as never as { __oakSession: OakSessionHandle }).__oakSession.runner.toCoda());

/** The warm-up is the drills suites': reported skipped here, as the learner's skip would. */
export async function skipWarmup(page: Page): Promise<void> {
  await expect.poll(async () => (await sessionState(page)).block, { timeout: 30_000 }).not.toBeNull();
  await page.evaluate(() => {
    const o = (window as never as { __oakSession: OakSessionHandle }).__oakSession;
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
}

/** Console errors, page errors and failed requests (a 501 included), minus Strudel's one evaluation error and Vite noise. */
export function watch(page: Page, allow: RegExp[] = []): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/\[eval\]|evaluation error|Outdated Optimize Dep|favicon/.test(m.text())) return;
    errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (r.status() >= 400 && !allow.some((a) => a.test(path)))
      errors.push(`${r.status()} ${r.request().method()} ${path}`);
  });
  return errors;
}

/** Today, loaded and decided (the first visit compiles the route in the dev server: allow for it). */
export async function openToday(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("today-card")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", /.+/, { timeout: 30_000 });
}

/** Enter on Today starts the session; the session page opens (a lost first-compile race is loaded again). */
export async function startByEnter(page: Page): Promise<void> {
  await page.locator("main").focus();
  await page.keyboard.press("Enter");
  await sessionPage(page);
}

export async function sessionPage(page: Page): Promise<void> {
  await page.waitForURL(/\/session\/?$/);
  const header = page.getByTestId("session-header");
  const failed = page.getByRole("heading", { name: "Something went wrong" });
  await expect(header.or(failed)).toBeVisible({ timeout: 60_000 });
  if (await failed.isVisible()) await page.reload();
  await expect(header).toBeVisible({ timeout: 60_000 });
}
