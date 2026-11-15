// Shared steps of the Wave 7 journeys (not a spec): a day begun from a dev seed, the Coda's next line read against
// the planner's own (carry f6), and a track capstone session walked as a day — Today names it, the session starts,
// the warm-up is reported skipped, the workspace opens, the session is finished or released with a seeded take.
import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { seedTake } from "../../app/src/capstone/e2e/seeded-take.ts";
import { useUiPrefs as setUiPrefs } from "../support/ui.ts";
import { api, countMicAsks, noHmr, resetClock, type Watch, watch } from "./support.ts";
import { doneForToday, sessionState, skipWarmup, startSession, today } from "./w4-day.ts";

export const TRACK_TITLE = { J: "Jazz Harmony", R: "Advanced Rhythm", A: "Arrangement & Sound" } as const;

/** Words the tracks never use: they are optional, nothing counts down, nothing failed (wave7.md §10 item 18). */
export const NEVER =
  /congratulations|sessions left|days left|countdown|behind (schedule|pace)|falling behind|failed/i;

/** Seeds `point` (Quiet mode: no mic, `voice.quiet` always), cuts HMR, sets the theme; watches the page. */
export async function begin(
  page: Page,
  request: APIRequestContext,
  point: string,
  theme: "paper" | "bark" = "paper",
  o: { quiet?: boolean } = {},
): Promise<Watch & { micAsks: () => Promise<number> }> {
  await resetClock(request);
  await api(request, "POST", "/api/dev/seed", o.quiet ? { point, mic: false } : { point });
  if (o.quiet) await api(request, "PUT", "/api/voice/quiet", { quiet: true, scope: "always" });
  await noHmr(page);
  await setUiPrefs(page, { theme, motion: "off" });
  const micAsks = await countMicAsks(page);
  return Object.assign(watch(page), { micAsks });
}

interface Summary {
  next?: { kind: string; mapItemId: string | null; trackId?: "J" | "R" | "A" | null } | null;
}

/** The summary of the session that just ended (this browser's record of it, app/src/session/persist.ts). */
export async function endedSummary(page: Page): Promise<Summary> {
  const id = await page.evaluate(() => {
    const raw = localStorage.getItem("oak.session.ended.v1");
    return raw ? ((JSON.parse(raw) as { sessionId?: string }).sessionId ?? null) : null;
  });
  expect(id, "the ended session is recorded in this browser").toBeTruthy();
  return api<Summary>(page.request, "GET", `/api/session/${id}/summary`);
}

/** The Coda's next line is the planner's own next session (carry f6), with its track named. */
export async function nextLineIs(
  page: Page,
  mapItemId: string,
  track: keyof typeof TRACK_TITLE,
): Promise<void> {
  const next = (await endedSummary(page)).next;
  expect(next).toMatchObject({ mapItemId, trackId: track });
  const line = page.getByTestId("coda-tomorrow");
  await expect(line).toHaveAttribute("data-item", mapItemId);
  await expect(line).toContainText(TRACK_TITLE[track]);
  await expect(page.locator("main")).not.toContainText(NEVER);
}

export const statuses = async (request: APIRequestContext, cap: string) =>
  (
    await api<{ sessions: { capstoneSessionId: string; status: string }[] }>(
      request,
      "GET",
      `/api/capstones/${cap}/sessions`,
    )
  ).sessions.map((s) => s.status);

/** Today names the capstone session; Start; the warm-up is skipped; the New block is the capstone. */
export async function capstoneDay(page: Page, label: RegExp, mapItemId: string): Promise<void> {
  await today(page);
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "capstone");
  await expect(page.getByTestId("setlist").locator('[data-row="new"]')).toContainText(label, {
    timeout: 20_000,
  });
  await startSession(page);
  expect((await sessionState(page)).plan).toMatchObject({ kind: "capstone", mapItemId });
  await skipWarmup(page);
}

/** Into the workspace: the session's Start card, or the resume card of a later session (the draft from the top). */
export async function intoWorkspace(page: Page, n: number, of: number): Promise<void> {
  const ws = page.getByTestId("capstone-workspace");
  const start = page.getByRole("button", { name: new RegExp(`^(Start|Continue) session ${n} of ${of}$`) });
  const resume = page.getByTestId("resume-continue");
  await expect(ws.or(start).or(resume).first()).toBeVisible({ timeout: 60_000 });
  if (await resume.isVisible().catch(() => false)) {
    await expect(page.getByTestId("capstone-resume")).toContainText(`Session ${n} of ${of}`);
    await resume.press("Enter");
  } else if (await start.isVisible().catch(() => false)) await start.press("Enter");
  await expect(ws).toBeVisible({ timeout: 60_000 });
}

/** Finishes a session that does not release: saved, finished, the Coda (`inspect` reads it), "Done for today". */
export async function finishSession(page: Page, inspect?: () => Promise<void>): Promise<void> {
  await expect(page.getByTestId("saved-state")).toContainText(/Version \d+ saved/, { timeout: 30_000 });
  await page.getByTestId("finish-session").click();
  await page.waitForURL(/\/session\/coda$/, { timeout: 60_000 });
  await expect(page.getByTestId("coda-title")).toBeVisible({ timeout: 30_000 });
  await inspect?.();
  await doneForToday(page);
}

export async function checkAllMet(page: Page): Promise<void> {
  await expect(page.getByTestId("req-count")).toHaveText(/^(\d+) of \1 met$/, { timeout: 90_000 });
  await page.getByTestId("check-track").click();
  await expect(page.getByRole("status").filter({ hasText: /every requirement is met/ })).toBeVisible({
    timeout: 60_000,
  });
}

/** The release dialog with a seeded take (the same window given to the recorder at once), the ceremony, the Coda. */
export async function releaseToCoda(page: Page, title: string, liner: string): Promise<void> {
  const btn = page.getByTestId("release");
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  await btn.click();
  const dialog = page.getByRole("dialog", { name: /Release to the album|Release a new version/ });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel(/One line for the liner notes/).fill(liner);
  await seedTake(page);
  await dialog.getByTestId("record-take").click();
  await expect(dialog.getByTestId("take-audio")).toBeVisible({ timeout: 60_000 });
  await dialog.getByTestId("confirm-release").click();
  const ceremony = page.getByTestId("release-ceremony");
  await expect(ceremony).toBeVisible({ timeout: 30_000 });
  await ceremony.getByRole("button", { name: "Continue to the coda" }).click();
  await page.waitForURL(/\/session\/coda$/);
  await expect(
    page.getByTestId("coda-release").or(page.getByTestId("coda-course-finale")).first(),
  ).toBeVisible({
    timeout: 30_000,
  });
}

export async function onAlbum(
  request: APIRequestContext,
  cap: string,
  title: string,
): Promise<{ id: string; side: string; title: string }> {
  const album = await api<{
    tracks: { id: string; capstoneId: string | null; title: string; side: string }[];
  }>(request, "GET", "/api/album");
  const t = album.tracks.find((x) => x.capstoneId === cap);
  expect(t, `${cap} is on the album`).toBeTruthy();
  expect(t?.title).toBe(title);
  return t as { id: string; side: string; title: string };
}
