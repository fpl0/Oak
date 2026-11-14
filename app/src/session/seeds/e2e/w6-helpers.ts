// Helpers for the session area's Wave 6 specs (w6-*.pw.ts). Every Wave 6 field the specs read is the server's own
// (wave6.md §5): nothing here fills or patches an answer, and every seed point must exist (wave6.md §6; a missing
// point is a request to the server engineer, never a replayed day).
import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { advanceDays, api, seed } from "./support.ts";

export interface W6Plan {
  kind: string;
  mapItemId: string | null;
  title: string;
  note: string | null;
  slot?: { fills: "gym" | "cf-t" | "x"; sinceLast: number } | null;
  tracks?: { open: string[]; lessonsAuthored: boolean; note: string } | null;
  core?: "in-progress" | "lessons-done" | "complete";
  alternatives: { kind: string; mapItemId: string | null; title: string }[];
}

export const planOf = (request: APIRequestContext) => api<W6Plan>(request, "GET", "/api/session/today");

/**
 * The Coda of the seed's last day, as the learner saw it. A seed's last activity is yesterday (wave6.md §6): the dev
 * clock goes back one day, so that day is "today" again, and `/session/coda` shows the server's own summary of its
 * last planned session (this browser holds no record of it).
 */
export async function codaOfLastDay(page: Page, request: APIRequestContext, point: string): Promise<void> {
  await seed(request, point);
  // The unlock moment is the Coda suite's own subject elsewhere (w4-days); here its tools are marked seen while
  // the clock still stands at today, so the day's Coda opens on its cards. (Marked after the clock went back, an
  // unlock granted "tomorrow" is not found.)
  const unlocks = await api<{ items: { itemId: string; seen: boolean }[] }>(request, "GET", "/api/unlocks");
  for (const u of unlocks.items.filter((x) => !x.seen))
    await api(request, "POST", `/api/unlocks/${encodeURIComponent(u.itemId)}/seen`);
  await advanceDays(request, -1);
  await page.goto("/session/coda");
  await expect(page.getByTestId("coda-title")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("done-for-today")).toBeVisible();
}

/** Text that must never appear on a surface of the ending (END.md "Never") or beside an advanced track. */
export const NEVER =
  /!|congratulations|well done|course complete|you're done|sessions left|days left|countdown/i;

/** The page's vertical overflow in px (the Oak's tree view must fit the window with the branch bar). */
export const verticalOverflow = (page: Page) =>
  page.evaluate(() => {
    const main = document.getElementById("main");
    return main ? main.scrollHeight - main.clientHeight : 0;
  });
