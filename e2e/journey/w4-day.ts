// Shared steps of the Wave 4 journeys: a day started from Today with the keyboard, the warm-up reported skipped
// through the session's dev hook (the stage D sets are walked by w4-harmony.pw.ts and the drill suites), the
// capstone editor's code set as one change, and the Coda's "Done for today".
import { expect, type Page } from "@playwright/test";

type SessionHandle = {
  report(r: unknown): void;
  state(): {
    plan: { kind: string; mapItemId: string | null; warmup: { items: { id: string }[] } } | null;
    session: { id: string } | null;
    block: string | null;
  };
};

export const sessionState = (page: Page) =>
  page.evaluate(() => (window as never as { __oakSession: SessionHandle }).__oakSession.state());

/** Today, loaded and decided (the first visit compiles the route in the dev server: allow for it). */
export async function today(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("today-card")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", /.+/, { timeout: 30_000 });
}

/** Enter on Today starts the session; the session page opens (a lost first-compile race is loaded again). */
export async function startSession(page: Page): Promise<void> {
  await page.locator("main").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/session\/?$/);
  const header = page.getByTestId("session-header");
  const failed = page.getByRole("heading", { name: "Something went wrong" });
  await expect(header.or(failed)).toBeVisible({ timeout: 60_000 });
  if (await failed.isVisible()) await page.reload();
  await expect(header).toBeVisible({ timeout: 60_000 });
}

/** Reports every warm-up set skipped, as the learner's skip would; the session moves on to the New block. */
export async function skipWarmup(page: Page): Promise<void> {
  await expect.poll(async () => (await sessionState(page)).block, { timeout: 30_000 }).not.toBeNull();
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
}

/** Writes `code` into a capstone's editor (`oak_capstone-<id>_0_`), as one change (the tutor's Apply path). */
export async function setCapstoneCode(page: Page, cap: string, code: string): Promise<void> {
  const id = `oak_capstone-${cap}_0_`;
  await page.waitForFunction(
    (e) =>
      !!(globalThis as { __oakStrudel?: { editors: Map<string, unknown> } }).__oakStrudel?.editors.get(e),
    id,
    { timeout: 60_000 },
  );
  await page.evaluate(
    ([e, c]) =>
      (
        globalThis as unknown as { __oakStrudel: { editors: Map<string, { setCode(c: string): void }> } }
      ).__oakStrudel.editors
        .get(e as string)
        ?.setCode(c as string),
    [id, code],
  );
}

/** The Coda's "Done for today", back to Today, which then says the day is done. */
export async function doneForToday(page: Page): Promise<void> {
  await page.waitForURL(/\/session\/coda$/, { timeout: 60_000 });
  const done = page.getByTestId("done-for-today");
  await expect(done).toBeVisible({ timeout: 30_000 });
  await done.click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 30_000 });
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done");
}
