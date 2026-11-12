// One learner day on the real stack, as the journey specs play it: Today → Start session → the warm-up the plan
// holds → the New block (a lesson, a checkpoint or a capstone) → the Coda → "Done for today". Shared by the Wave 2
// gate journey (journey.pw.ts) and the Wave 3 journeys (w3-*.pw.ts).
import type { LessonDef } from "@oak/content-kit";
import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { walkLesson } from "./lesson-walk.ts";
import { api, openToday, shootAll } from "./support.ts";
import { type WarmupRun, walkWarmup } from "./warmup-walk.ts";

export interface Plan {
  kind: string;
  mapItemId: string | null;
  warmup: { items: { familyIds?: string[]; kind?: string }[] };
}

/** Today → Start session; returns the plan the server made for today and what the warm-up did. */
export async function startToday(
  page: Page,
  request: APIRequestContext,
  o: {
    warmupMs?: number;
    until?: (run: WarmupRun) => boolean;
    /**
     * Walk this many warm-up sets, then report the rest skipped through the session's dev hook, so a journey
     * about the New block stays short (the warm-up itself is walked by the degree journeys and the drill suites).
     */
    warmupSets?: number;
  } = {},
): Promise<Plan & { run: WarmupRun | null }> {
  const plan = await api<Plan>(request, "GET", "/api/session/today");
  await openToday(page);
  // "normal", or the kind of day ("checkpoint", "capstone"): one Start button either way.
  await expect(page.getByTestId("today-card")).not.toHaveAttribute(
    "data-state",
    /first-run|done|in-session/,
    {
      timeout: 30_000,
    },
  );
  await page.getByTestId("start-session").click();
  await expect(page).toHaveURL(/\/session\/?$/);
  const sets = o.warmupSets;
  const until = sets === undefined ? o.until : (r: WarmupRun) => r.sets >= sets || (o.until?.(r) ?? false);
  const run =
    plan.warmup.items.length > 0
      ? await walkWarmup(page, {
          ...(o.warmupMs === undefined ? {} : { maxMs: o.warmupMs }),
          ...(until ? { until } : {}),
        })
      : null;
  if (
    sets !== undefined &&
    (await page
      .getByTestId("warmup")
      .isVisible()
      .catch(() => false))
  )
    await skipRestOfWarmup(page);
  return { ...plan, run };
}

type SessionHandle = {
  report(r: unknown): void;
  state(): { plan: { warmup: { items: { id: string }[] } } | null };
};

/** Reports every warm-up set not done yet as skipped (`__oakSession`, the session runner's dev hook). */
async function skipRestOfWarmup(page: Page): Promise<void> {
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
  await expect(page.getByTestId("warmup")).toBeHidden({ timeout: 30_000 });
}

/** The Coda: the unlock moment (when the session granted tools), then "Done for today" back to Today. */
export async function coda(page: Page, o: { unlocks: boolean | "auto"; shots?: string }): Promise<void> {
  await expect(page).toHaveURL(/\/session\/coda$/, { timeout: 60_000 });
  await expect(page.getByTestId("coda-title")).toBeVisible();
  const moment = page.getByTestId("coda-unlock-moment");
  // "auto": the moment shows when the session granted tools (it appears with the Coda, or not at all).
  const shows =
    o.unlocks === "auto"
      ? await moment
          .waitFor({ state: "visible", timeout: 5_000 })
          .then(() => true)
          .catch(() => false)
      : o.unlocks;
  if (shows) {
    await expect(moment).toBeVisible({ timeout: 30_000 });
    if (o.shots) await shootAll(page, o.shots);
    await moment.getByRole("button", { name: "See the rest of today" }).click();
    await expect(page.getByTestId("coda-tools")).toBeVisible();
  }
  await page.getByTestId("done-for-today").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done");
}

/** A lesson day: the session is today's lesson `def`, walked from its references, then the Coda. */
export async function lessonDay(
  page: Page,
  request: APIRequestContext,
  def: LessonDef,
  o: Parameters<typeof walkLesson>[2] & {
    unlocks?: boolean | "auto";
    shots?: string;
    warmupSets?: number;
  } = {},
): Promise<Plan & { run: WarmupRun | null }> {
  const plan = await startToday(
    page,
    request,
    o.warmupSets === undefined ? {} : { warmupSets: o.warmupSets },
  );
  expect(plan).toMatchObject({ kind: "lesson", mapItemId: def.id });
  await walkLesson(page, def, o);
  await coda(page, { unlocks: o.unlocks ?? true, shots: o.shots ?? `coda-unlock-${def.id}` });
  return plan;
}
