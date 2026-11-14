// Wave 6 Codas on the real server, each from a dev seed (wave6.md §6). A seed's last activity is yesterday, so the
// dev clock goes back one day and `/session/coda` shows that day's own summary (w6-helpers.ts `codaOfLastDay`): six
// days of U12–U17 read as the learner saw them, each naming what they can now do and what comes next; the card that
// opens the first part of the core finale (U15.L01); a release day; the tracks opening after U13.CP; and the ending,
// on the day the core was completed and reopened from Progress. Nothing is filled or patched: `SessionSummary.gatesOpened`,
// `SessionSummary.coreComplete` and `GET /course/completion` are the server's own.
import { expect, type Page, test } from "@playwright/test";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { advanceDays, api, blockHmr, expectNoOverflow, matrix, SHOTS, type seed, settle } from "./support.ts";
import { watch } from "./w5-helpers.ts";
import { codaOfLastDay, NEVER } from "./w6-helpers.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await blockHmr(page);
});

/** One day's Coda: the line under the title is the lesson's own can-do, and "Next" names tomorrow. */
async function readDay(
  page: Page,
  request: Parameters<typeof seed>[0],
  day: { point: string; lesson: string; canNow: string; next: RegExp },
): Promise<void> {
  await codaOfLastDay(page, request, day.point);
  const summaryId = (await api<{ summarySessionId: string | null }>(request, "GET", "/api/session/day"))
    .summarySessionId;
  expect(summaryId, `${day.point}: the day has a summary`).toBeTruthy();
  const summary = await api<{ session: { kind: string; mapItemId: string | null } }>(
    request,
    "GET",
    `/api/session/${summaryId}/summary`,
  );
  expect(summary.session).toMatchObject({ kind: "lesson", mapItemId: day.lesson });
  // What the learner can now do, in a sentence about music, before any card.
  const line = page.getByTestId("coda-can-now").locator("li").first();
  await expect(line).toHaveText(day.canNow, { timeout: 20_000 });
  // The same statement is not repeated as a row of the ledger card on the day it is first shown.
  await expect(
    page.getByTestId("coda-cando").getByText(day.canNow.replace(/^You can now /, "I can ")),
  ).toHaveCount(0);
  // Tomorrow is named: the next item of the course, or the slot that comes first.
  await expect(page.getByTestId("coda-tomorrow")).toHaveText(day.next);
  // What is said once is not said again: the tracks opened with U13.CP, the finale's first part with U15.L01.
  await expect(page.getByTestId("coda-tracks")).toHaveCount(0);
  await expect(page.getByTestId("coda-cft-opened")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(/!|sessions left|behind/);
  await settle(page);
  await expectNoOverflow(page);
}

test("a release day's Coda says what the track shows, above the release card (C5)", async ({
  page,
  request,
}) => {
  const errors = watch(page, [/\/api\/tutor/]);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await codaOfLastDay(page, request, "C5 released");
  const line = page.getByTestId("coda-can-now");
  await expect(line.locator("li").first()).toHaveText(
    "You can now write a 12-bar blues with a shuffle feel.",
    {
      timeout: 20_000,
    },
  );
  const release = page.getByTestId("coda-release");
  await expect(release).toBeVisible();
  // One line of the display face under the title, not a card; the release follows it.
  expect((await line.boundingBox())?.y ?? 0).toBeLessThan((await release.boundingBox())?.y ?? 0);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await settle(page);
    await expectNoOverflow(page);
    await expect(line).toBeInViewport();
    await shoot(page, SHOTS, "w6-coda-can-now", "paper");
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(errors).toEqual([]);
});

test("three days of sevenths, rhythm and modes: each Coda says what the learner can now do, and what is next", async ({
  page,
  request,
}) => {
  const errors = watch(page, [/\/api\/tutor/]);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await readDay(page, request, {
    point: "after U12.L05",
    lesson: "U12.L05",
    canNow: "You can now follow the 3rds and 7ths as a thread through a chord progression.",
    next: /^Next time: a Transcription Gym session/,
  });
  await shoot(page, SHOTS, "w6-coda-u12-l05", "paper");
  await readDay(page, request, {
    point: "after U13.L03",
    lesson: "U13.L03",
    canNow: "You can now read and write tied and dotted rhythms.",
    next: /^Next time: a Transcription Gym session/,
  });
  await readDay(page, request, {
    point: "after U14.L03",
    lesson: "U14.L03",
    canNow: "You can now write a Dorian groove over i and IV.",
    next: /^Next time: .*Lydian/,
  });
  await shoot(page, SHOTS, "w6-coda-u14-l03", "paper");
  expect(errors).toEqual([]);
});

test("three days of the long stretch (U15–U17): each Coda names something a song does", async ({
  page,
  request,
}) => {
  const errors = watch(page, [/\/api\/tutor/]);
  await useUiPrefs(page, { theme: "bark", motion: "off" });
  await readDay(page, request, {
    point: "after U15.L05",
    lesson: "U15.L05",
    canNow: "You can now write a chain of dominant sevenths that falls by fifths.",
    next: /^Next time: /,
  });
  await shoot(page, SHOTS, "w6-coda-u15-l05", "bark");
  await readDay(page, request, {
    point: "after U16.L03",
    lesson: "U16.L03",
    canNow: "You can now name the chords a major key borrows from the minor key on the same note.",
    next: /^Next time: /,
  });
  await readDay(page, request, {
    point: "after U17.L02",
    lesson: "U17.L02",
    canNow: "You can now lift a chorus into a new key with a patterned .scale().",
    next: /^Next time: .*Hearing Key Changes/,
  });
  await shoot(page, SHOTS, "w6-coda-u17-l02", "bark");
  expect(errors).toEqual([]);
});

test("U15.L01's Coda opens the first part of the core finale, once, after the lesson's own lines", async ({
  page,
  request,
}) => {
  const errors = watch(page, [/\/api\/tutor/]);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  // The day U15.L01 was finished (session 154; the next day is the U14 checkpoint): its completion met CF-T's gate.
  await codaOfLastDay(page, request, "after U15.L01");
  const cft = await api<{ status: string }>(request, "GET", "/api/capstones/CF-T");
  expect(cft.status).toBe("open");
  await expect(page.getByTestId("coda-can-now").locator("li").first()).toHaveText(
    "You can now write a note from outside the key as a chromatic degree in code.",
    { timeout: 20_000 },
  );
  const card = page.getByTestId("coda-cft-opened");
  await expect(card).toBeVisible();
  await expect(card).toContainText("The core finale has opened: part one");
  await expect(card).toContainText("Five Foot Two, Ain't She Sweet or Bye Bye Blackbird");
  await expect(card).toContainText("Nothing waits for it: your lessons carry on in between.");
  await expect(card).not.toContainText(/final exam|!/);
  // It follows the can-do line and the day's cards; the next lesson is still what tomorrow is.
  await expect(page.getByTestId("coda-tomorrow")).toHaveText(/^Next time: /);
  await settle(page);
  await expectNoOverflow(page);
  await shoot(page, SHOTS, "w6-coda-cft-opened", "paper");
  expect(errors).toEqual([]);
});

test("U13.CP's Coda: the Jazz and Rhythm tracks are open, said honestly, with nothing to start that is not written", async ({
  page,
  request,
}) => {
  const errors = watch(page, [/\/api\/tutor/]);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  const open = async (p: Page) => {
    await codaOfLastDay(p, request, "tracks open (after U13.CP)");
    await expect(p.getByTestId("coda-tracks")).toBeVisible({ timeout: 20_000 });
  };
  await open(page);
  const card = page.getByTestId("coda-tracks");
  await expect(card).toHaveAttribute("data-tracks", "J,R");
  await expect(card).toContainText("The Jazz and Rhythm tracks are open");
  await expect(card).toContainText("Jazz Harmony and Advanced Rhythm");
  await expect(card).toContainText("Their first lessons are still being written.");
  await expect(card).toContainText("The core stays your path");
  // Honest: a link to the branches on the Oak, and nothing that starts a lesson that does not exist.
  await expect(card.getByRole("link", { name: "See the branches on the Oak" })).toHaveAttribute(
    "href",
    /\/oak\?view=course/,
  );
  await expect(card.getByRole("button")).toHaveCount(0);
  await expect(page.locator('a[href^="/learn/J"], a[href^="/learn/R"]')).toHaveCount(0);
  // Tomorrow is the core: the next lesson, as on any day.
  await expect(page.getByTestId("coda-tomorrow")).toHaveText(/^Next time: /);
  await expect(page.getByTestId("coda-tomorrow")).not.toContainText(/Jazz|Rhythm track/);
  await matrix(page, "w6-coda-tracks-open", async (p) => {
    await p.goto("/session/coda");
    await expect(p.getByTestId("coda-tracks")).toBeVisible({ timeout: 20_000 });
  });
  // Keyboard: Enter is "Done for today" with the card on screen.
  await page.locator("main").focus();
  await expect(page.getByTestId("done-for-today")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the ending: the Coda of the day the core was completed, four parts in order, no teaser; reopened from Progress, read-only (keyboard, reduced motion)", async ({
  page,
  request,
}) => {
  const errors = watch(page, [/\/api\/tutor/]);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  const open = async (p: Page) => {
    await codaOfLastDay(p, request, "core complete");
    await expect(p.getByTestId("coda-finale")).toBeVisible({ timeout: 30_000 });
    await expect(p.getByTestId("finale-oak").locator("svg").first()).toBeVisible({ timeout: 30_000 });
  };
  await open(page);
  const completion = await api<{
    stage: string;
    milestone: { title: string } | null;
    canDo: { text: string }[];
    album: { released: number; total: number };
    open: { title: string; available: boolean }[];
  }>(request, "GET", "/api/course/completion");
  expect(completion.stage).toBe("complete");
  expect(completion.album).toMatchObject({ released: 12, total: 12 });
  // The session's own release first (the single), then the heading: the milestone's sentence, once.
  await expect(page.getByTestId("coda-release")).toBeVisible();
  await expect(page.getByTestId("finale-heading")).toHaveText("You finished the core. Side A is complete.");
  await expect(page.getByText("You finished the core. Side A is complete.")).toHaveCount(1);
  await expect(page.getByTestId("finale-road")).toHaveText(/^Since .+: \d+ sessions on \d+ days/);
  // The four parts, in order: the record, what you can now do, the Oak, what is open now.
  const order = await page
    .locator(
      '[data-testid="finale-record"], [data-testid="finale-cando"], [data-testid="finale-oak"], [data-testid="finale-open"]',
    )
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(order).toEqual(["finale-record", "finale-cando", "finale-oak", "finale-open"]);
  // The record: twelve tracks in running order, the single last.
  const tracks = page.getByTestId("finale-record").locator("[data-cover]");
  await expect(tracks).toHaveCount(12);
  await expect(tracks.first()).toHaveAttribute("data-cover", "C0");
  await expect(tracks.nth(10)).toHaveAttribute("data-cover", "CF-T");
  await expect(tracks.last()).toHaveAttribute("data-cover", "CF-A");
  // The record is the album's own player: offered, never started for the learner.
  await expect(page.getByTestId("play-side-a")).toHaveText(/Play Side A/);
  await expect(page.getByTestId("finale-record").getByTestId("open-album")).toHaveAttribute("href", "/album");
  await expect(page.getByTestId("side-a-record")).toHaveAttribute("data-state", "stopped");
  // What you can now do: the server's statements (at most seven), each solid or strong, with the counts.
  const lines = page.getByTestId("finale-cando").locator("[data-cando]");
  await expect(lines).toHaveCount(Math.min(7, completion.canDo.length));
  await expect(lines.first()).toContainText(completion.canDo[0]?.text ?? "no statement");
  await expect(page.getByTestId("finale-cando-counts")).toHaveText(
    /^\d+ of \d+ statements are solid or strong\./,
  );
  // The Oak, with the lines its leaf counts give.
  await expect(page.getByTestId("finale-oak")).toContainText("Every limb of the core is at full length");
  await expect(page.getByTestId("finale-oak")).toContainText(
    "The crown and the deep roots are still to grow",
  );
  // What is open now ends on tomorrow: one thing that can be started; the tracks are named, never linked.
  await expect(page.getByTestId("finale-tomorrow")).toHaveText(/^Tomorrow: /);
  const waiting = page.getByTestId("finale-waiting");
  for (const o of completion.open.filter((x) => !x.available)) await expect(waiting).toContainText(o.title);
  await expect(waiting.getByRole("link")).toHaveCount(0);
  // In place of the day's teaser, can-do card and tree card; the week and the two buttons stay.
  for (const id of ["coda-next", "coda-tomorrow", "coda-cando", "coda-oak", "coda-milestone"])
    await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(page.getByTestId("coda-week")).toBeVisible();
  await expect(page.getByTestId("done-for-today")).toBeVisible();
  await expect(page.getByRole("link", { name: "Keep playing in Studio" })).toBeVisible();
  // Nothing celebrates on the learner's behalf, nothing plays by itself, nothing stands in the way.
  await expect(page.locator("main")).not.toContainText(NEVER);
  // Nothing drawn moves on the page (the engine's hidden 1×1 draw canvas lives outside <main>).
  await expect(page.locator("main canvas")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => [...document.querySelectorAll("audio")].every((a) => a.paused))).toBe(
    true,
  );
  // 1280×800: the heading, the road and the top of the record are on the first screen.
  await page.setViewportSize({ width: 1280, height: 800 });
  await settle(page);
  await expect(page.getByTestId("finale-heading")).toBeInViewport();
  await expect(page.getByTestId("finale-road")).toBeInViewport();
  await expect(page.getByTestId("side-a-title")).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 900 });
  // The day is seeded once; the matrix loads the same Coda again in each theme.
  await matrix(page, "w6-coda-ending", async (p) => {
    await p.goto("/session/coda");
    await expect(p.getByTestId("coda-finale")).toBeVisible({ timeout: 30_000 });
    await expect(p.getByTestId("finale-oak").locator("svg").first()).toBeVisible({ timeout: 30_000 });
  });

  // Reopened from Progress on a later day (the clock back at today): the same four parts, read-only.
  await advanceDays(request, 1);
  await page.goto("/progress");
  const entry = page.getByTestId("progress-ending");
  await expect(entry).toBeVisible({ timeout: 30_000 });
  await entry.getByTestId("open-ending").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/session\/coda\?ending=1$/);
  await expect(page.getByTestId("ending-page")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("finale-heading")).toHaveText("You finished the core. Side A is complete.");
  for (const id of ["finale-record", "finale-cando", "finale-oak", "finale-open"])
    await expect(page.getByTestId(id)).toBeVisible();
  // Read-only: no session is ended here, nothing is "new today", and the day's two buttons are gone.
  await expect(page.getByTestId("done-for-today")).toHaveCount(0);
  await expect(page.getByTestId("finale-cando")).not.toContainText("new today");
  await expect(page.getByTestId("ending-back")).toBeFocused();
  await expect(page.locator("main")).not.toContainText(NEVER);
  await settle(page);
  await expectNoOverflow(page);
  await shoot(page, SHOTS, "w6-ending-reopened", "bark");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/progress$/);
  await expect(page.getByTestId("progress-ending")).toBeVisible();
  expect(errors).toEqual([]);
});
