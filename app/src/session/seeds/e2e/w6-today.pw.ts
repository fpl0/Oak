// Wave 6 Today on the real planner, each day from a dev seed (wave6.md §6): CF-T in the transcription slot (what the
// slot has become, where the learner is in the standard, never in the way of a compose capstone under way), C7 and
// CF-A as consecutive New blocks that resume by playing the draft from the top, the advanced tracks in one honest
// line once U13.CP is passed, Today once the lessons of the core are done and on the day after the ending, and a
// second tab starting its own session (d21). Nothing is filled or patched: `plan.slot`, `plan.tracks`, `plan.core`,
// `GET /course/completion` and `session.day.openSessions` are the server's own.
import { expect, type Page, test } from "@playwright/test";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { api, blockHmr, expectNoOverflow, matrix, SHOTS, seed, settle } from "./support.ts";
import { openToday, sessionPage, sessionState, skipWarmup, startByEnter, watch } from "./w5-helpers.ts";
import { NEVER, planOf } from "./w6-helpers.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await blockHmr(page);
});

const newRow = (page: Page) => page.getByTestId("setlist").locator('[data-row="new"]');

test("CF-T's first slot, Today to the Coda: what the slot has become, the five stages, the session, the Coda (Quiet mode)", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const errors = watch(page, [/\/api\/tutor/]);
  await seed(request, "CF-T open (U15.L01 done)");
  await api(request, "PUT", "/api/voice/quiet", { quiet: true, scope: "today" });
  const plan = await planOf(request);
  expect(plan).toMatchObject({ kind: "capstone", mapItemId: "CF-T.S1", slot: { fills: "cf-t" } });
  const gym = await api<{ next: unknown; cfT: { takesSlot: boolean; nextSessionId: string } | null }>(
    request,
    "GET",
    "/api/gym",
  );
  expect(gym.cfT).toMatchObject({ takesSlot: true, nextSessionId: "CF-T.S1" });
  expect(gym.next).toBeNull();
  await useUiPrefs(page, { theme: "paper" });
  const open = async (p: Page) => {
    await openToday(p);
    await expect(p.getByTestId("cft-day")).toBeVisible({ timeout: 20_000 });
    await expect(newRow(p)).toContainText("Standard Transcription · session 1 of 4", { timeout: 20_000 });
  };
  await open(page);
  const card = page.getByTestId("today-card");
  await expect(card).toHaveAttribute("data-state", "capstone");
  await expect(page.getByRole("heading", { name: "Transcription slot: your standard" })).toBeVisible();
  await expect(card).toContainText("Your transcription slot is now a standard from the 1920s");
  await expect(card).toContainText("Your lessons carry on in between.");
  // The row reads as the slot it is (its order number, then "Transcribe"), with the standard's session.
  await expect(newRow(page)).toContainText(/^\d*Transcribe · \d+ min/);
  // Where the learner is: nothing behind them yet, the form map and the bass today, the rest later.
  const stage = (s: string) => page.getByTestId("cft-stages").locator(`[data-stage="${s}"]`);
  for (const s of ["form", "bass"]) await expect(stage(s)).toHaveAttribute("data-state", "today");
  for (const s of ["changes", "melody", "arrange"])
    await expect(stage(s)).toHaveAttribute("data-state", "ahead");
  await expect(page.getByTestId("cft-explain")).toContainText(
    "Until your standard is released the slot is its next session",
  );
  // No compose capstone is under way on this day: nothing waits.
  await expect(page.getByTestId("cft-waiting")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(/final exam|sessions left|countdown/i);
  await matrix(page, "w6-today-cft-s1", open);
  // 1280×800: the one decision stays in view under the stages and the explanation.
  await page.setViewportSize({ width: 1280, height: 800 });
  await settle(page);
  await expect(page.getByTestId("start-session")).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 900 });
  await startByEnter(page);
  expect((await sessionState(page)).plan).toMatchObject({ kind: "capstone", mapItemId: "CF-T.S1" });

  // The session itself: the warm-up is the drills suites' (skipped here, as the learner's skip would), then the
  // standard's workspace inside the session. Passing the map and the bass is the capstone suite's
  // (app/src/capstone/e2e/w6-cf-t.pw.ts); here the learner reveals them, which settles each check, and finishes.
  await skipWarmup(page);
  const ws = page.getByTestId("capstone-workspace");
  const begin = page.getByRole("button", { name: "Start session 1 of 4" });
  await expect(ws.or(begin)).toBeVisible({ timeout: 60_000 });
  if (await begin.isVisible()) {
    await page.getByRole("radiogroup", { name: "The song" }).getByRole("radio").first().click();
    await begin.click();
  }
  await expect(ws).toHaveAttribute("data-kind", "transcribe", { timeout: 60_000 });
  // Two tries at the map (halves, A and B: not the tune's form), then "Show the form", as a learner who cannot hear
  // it yet would; the bass waits for the map and is then revealed section by section.
  const map = page.getByTestId("cft-form-map");
  const bars = await map.locator('[data-testid="form-line"]').count();
  await map
    .locator('[data-testid="form-line"]')
    .nth(Math.floor(bars / 2))
    .click();
  for (const [i, label] of ["A", "B"].entries()) {
    await map.getByTestId("form-section").nth(i).click();
    await page.keyboard.press(label);
    await expect(map.getByTestId("form-section").nth(i)).toHaveAttribute("data-label", label);
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    await map.getByTestId("cft-form-check").click();
    await expect(map.getByTestId("cft-form-feedback")).toContainText(/not yet/i, { timeout: 30_000 });
  }
  await page.getByTestId("cft-form-reveal").click();
  await page.getByTestId("cft-form-reveal-confirm").click();
  await expect(page.getByTestId("cft-form-state")).toHaveAttribute("data-state", "revealed", {
    timeout: 30_000,
  });
  const bass = page.getByTestId("x1-checks").locator('[data-check^="bass-"]');
  await expect(bass).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const row = bass.nth(i);
    await row.getByRole("button", { name: /^Reveal / }).click();
    await row.getByTestId("confirm-reveal").click();
    await expect(row).toHaveAttribute("data-state", "revealed", { timeout: 30_000 });
  }
  await page.getByTestId("finish-session").click();
  await page.waitForURL(/\/session\/coda$/, { timeout: 30_000 });
  await expect(page.getByTestId("coda-title")).toBeVisible({ timeout: 30_000 });
  // The server's own record of the day: the standard's first session done, the slot used.
  const cft = await api<{ sessions: string[] }>(request, "GET", "/api/capstones/CF-T");
  expect(cft.sessions).toContain("CF-T.S1");
  const summaryId = (await api<{ summarySessionId: string | null }>(request, "GET", "/api/session/day"))
    .summarySessionId;
  const summary = await api<{ session: { kind: string; mapItemId: string | null } }>(
    request,
    "GET",
    `/api/session/${summaryId}/summary`,
  );
  expect(summary.session).toMatchObject({ kind: "capstone", mapItemId: "CF-T.S1" });
  // Tomorrow is named; the slot will not come round again for a few sessions.
  await expect(page.getByTestId("coda-tomorrow")).toHaveText(/^Next time: /);
  // RETURN: when the standard comes back, and what it asks then.
  await expect(page.getByTestId("coda-cft-after")).toHaveText(
    "Your standard goes on in your next transcription slot, about five sessions from now, or any day from Today: session 2 of 4, the changes.",
  );
  await expect(page.locator("main")).not.toContainText(/final exam|sessions left|countdown|!/);
  await settle(page);
  await expectNoOverflow(page);
  await shoot(page, SHOTS, "w6-coda-cft-s1", "bark");
  expect(errors).toEqual([]);
});

test("C6 under way with CF-T open: the capstone day is C6's; CF-T is another way, and says where the standard stands", async ({
  page,
  request,
}) => {
  const errors = watch(page, [/\/api\/tutor/]);
  await seed(request, "C6 open");
  const plan = await planOf(request);
  // CF-T.S1 is done and the slot has just been used: today's New block is C6.S1, never a second CF-T session.
  expect(plan).toMatchObject({ kind: "capstone", mapItemId: "C6.S1" });
  await useUiPrefs(page, { theme: "bark" });
  await openToday(page);
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "capstone");
  await expect(page.getByRole("heading", { name: "Capstone day" })).toBeVisible();
  await expect(newRow(page)).toContainText("C6 Modal Vamp · session 1 of 2", { timeout: 20_000 });
  await expect(page.getByTestId("cft-day")).toHaveCount(0);
  // The standard may be opened on any day (contracts §2.5): it then counts as the transcription session.
  const alt = page.getByTestId("alt-capstone").filter({ hasText: "Standard Transcription" });
  await expect(alt).toBeVisible();
  await alt.click();
  await sessionPage(page);
  expect((await sessionState(page)).plan).toMatchObject({ kind: "capstone", mapItemId: "CF-T.S2" });
  await skipWarmup(page);
  const resume = page.getByTestId("capstone-resume");
  await expect(resume).toBeVisible({ timeout: 30_000 });
  await expect(resume).toContainText("Session 2 of 4");
  await expect(page.getByTestId("resume-where")).toHaveText(
    "The form map and the bass are down. Today: the changes.",
  );
  await settle(page);
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

test("C7's last session: three New blocks in a row; the draft plays from the top, then the work resumes (keyboard)", async ({
  page,
  request,
}) => {
  const errors = watch(page, [/\/api\/tutor/]);
  await seed(request, "C7.S2 done");
  expect(await planOf(request)).toMatchObject({ kind: "capstone", mapItemId: "C7.S3" });
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await openToday(page);
  await expect(newRow(page)).toContainText("C7 Chromatic Colour · session 3 of 3", { timeout: 20_000 });
  await expect(page.getByTestId("today-card")).toContainText("The last session");
  await expect(page.getByTestId("today-card")).toContainText("plays from the top");
  await startByEnter(page);
  await skipWarmup(page);
  const resume = page.getByTestId("capstone-resume");
  await expect(resume).toBeVisible({ timeout: 30_000 });
  await expect(resume).toContainText("Session 3 of 3");
  await expect(resume).toContainText("Your draft, from the top", { timeout: 20_000 });
  // It plays by itself and moves (the position, not the bar count, proves it); Stop is always there.
  await expect(page.getByTestId("resume-bar")).toHaveText(/^Bar \d+ of \d+$/, { timeout: 20_000 });
  await expect(page.getByTestId("resume-play")).toHaveText(/Stop/);
  await expect(page.getByTestId("resume-continue")).toBeFocused();
  await settle(page);
  await expectNoOverflow(page);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});

test("CF-A's fourth session: the lessons of the core are done, the single is left, and a long draft never holds the learner", async ({
  page,
  request,
}) => {
  const errors = watch(page, [/\/api\/tutor/]);
  await seed(request, "CF-A.S3 done");
  const plan = await planOf(request);
  expect(plan).toMatchObject({ kind: "capstone", mapItemId: "CF-A.S4", core: "lessons-done" });
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  const open = async (p: Page) => {
    await openToday(p);
    await expect(newRow(p)).toContainText("Album Single · session 4 of 4", { timeout: 20_000 });
    await expect(p.getByTestId("open-to-you")).toBeVisible({ timeout: 20_000 });
  };
  await open(page);
  await expect(page.getByRole("heading", { name: "Capstone day" })).toBeVisible();
  await expect(page.getByTestId("today-card")).toContainText("then release it to your album");
  const list = page.getByTestId("open-to-you");
  await expect(list).toHaveAttribute("data-stage", "lessons-done");
  await expect(page.getByTestId("core-left")).toHaveText(
    /^The lessons of the core are done\. Left to release: .*Album Single.*\.$/,
  );
  // Today's own capstone is the session, not a row under it.
  await expect(list.locator('[data-open="capstone"]').filter({ hasText: "Album Single" })).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(NEVER);
  await matrix(page, "w6-today-cfa-s4", open);
  await startByEnter(page);
  await skipWarmup(page);
  const resume = page.getByTestId("capstone-resume");
  await expect(resume).toBeVisible({ timeout: 30_000 });
  await expect(resume).toContainText("Session 4 of 4");
  await expect(page.getByTestId("resume-bar")).toHaveText(/^Bar \d+ of \d+$/, { timeout: 20_000 });
  // A whole song is over a minute long: the card says the way on does not wait for it, and Enter proves it.
  await expect(page.getByTestId("resume-long")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});

test("the tracks open: the core is still the session; Jazz and Rhythm are offered beside it, one quiet row each", async ({
  page,
  request,
}) => {
  const errors = watch(page, [/\/api\/tutor/, /\/api\/tracks\/focus$/]);
  await seed(request, "tracks open (after U13.CP)");
  const plan = await planOf(request);
  // The core stays the New block (contracts §2.6; wave7.md §5.2: focus "core" while the core is unfinished).
  expect(plan).toMatchObject({ kind: "lesson", mapItemId: "U14.L02" });
  expect(plan.tracks ?? null).toBeNull();
  await useUiPrefs(page, { theme: "paper" });
  const open = async (p: Page) => {
    await openToday(p);
    await expect(p.getByTestId("track-offers")).toBeVisible({ timeout: 20_000 });
  };
  await open(page);
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "normal");
  const offers = page.getByTestId("track-offers");
  await expect(offers.getByTestId("track-lead")).toHaveText(
    "The core is today's session. The open tracks are beside it, never in its place.",
  );
  await expect(offers.locator('[data-offer="J"]')).toContainText("J1.L01 Swing Feel & the Ride");
  await expect(offers.locator('[data-offer="R"]')).toContainText("R1.L01 Metric Weight");
  // One primary action: Start. An offer is a quiet secondary button; nothing reads as required or counts down.
  await expect(page.locator('[data-testid="start-session"]')).toHaveCount(1);
  await expect(
    offers.getByRole("button", { name: "Start J1.L01 Swing Feel & the Ride instead" }),
  ).toBeVisible();
  await expect(page.getByTestId("tracks-line")).toHaveCount(0);
  await expect(page.getByTestId("other-ways")).not.toContainText(/Jazz|Rhythm/);
  await expect(page.locator("main")).not.toContainText(/required|behind|lessons left|still being written/i);
  await matrix(page, "w6-today-tracks", open);
  await startByEnter(page);
  expect((await sessionState(page)).plan).toMatchObject({ kind: "lesson", mapItemId: "U14.L02" });
  expect(errors).toEqual([]);
});

test("the day after the ending: an ordinary review day with what is open under it, and one line back to the record", async ({
  page,
  request,
}) => {
  const errors = watch(page, [/\/api\/tutor/]);
  await seed(request, "core complete");
  const plan = await planOf(request);
  expect(plan.core).toBe("complete");
  // Wave 7 (wave7.md §5.2): with no track chosen, the day after the core is an ordinary review or gym day, and the
  // open tracks are offered beside it (they are never planned in its place before the learner picks one).
  expect(["review", "gym"]).toContain(plan.kind);
  const completion = await api<{
    stage: string;
    open: { kind: string; title: string; note: string; available: boolean }[];
  }>(request, "GET", "/api/course/completion");
  expect(completion.stage).toBe("complete");
  await useUiPrefs(page, { theme: "paper" });
  const open = async (p: Page) => {
    await openToday(p);
    await expect(p.getByTestId("open-to-you")).toBeVisible({ timeout: 20_000 });
  };
  await open(page);
  const card = page.getByTestId("today-card");
  // An ordinary day: its own session, its minutes, Start. Never the edge of the written course, never an empty page.
  await expect(card).toHaveAttribute("data-state", plan.kind === "gym" ? "gym" : "review");
  await expect(page.getByTestId("start-session")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("still being written. Until it arrives");
  // The first day only: one line that leads back to the record.
  await expect(page.getByTestId("first-day")).toHaveText("Side A is complete. Play it.");
  await expect(page.getByTestId("first-day-play")).toHaveAttribute("href", "/album");
  // The album strip ends on the record's last tracks: the standard, then the single (never cut off at C7).
  await expect(page.getByTestId("album-strip").locator("[data-slot]")).toHaveText([
    "C7 Chromatic Colour",
    "Standard Transcription",
    "Album Single",
  ]);
  // "Open to you": the server's rows that can be started, today's own kind left out; then the tracks' line.
  const list = page.getByTestId("open-to-you");
  await expect(list).toHaveAttribute("data-stage", "complete");
  await expect(list.getByRole("heading", { name: "Open to you" })).toBeVisible();
  const startable = completion.open.filter(
    (o) => o.available && o.kind !== plan.kind && o.kind !== "side-lesson" && o.kind !== "track",
  );
  for (const o of startable) await expect(list).toContainText(o.title);
  // The tracks have their own offers (one row each, "Start this instead"), never listed twice in "Open to you".
  await expect(page.getByTestId("track-offers").locator('[data-offer="J"]')).toContainText("J1.L01");
  await expect(list.locator('[data-open="track"]')).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(NEVER);
  await matrix(page, "w6-today-after-core", open);
  // Keyboard: Enter starts the planned session, as on any day.
  await startByEnter(page);
  expect((await sessionState(page)).plan?.kind).toBe(plan.kind);
  expect(errors).toEqual([]);
});

test("d21: a second tab starts its own session; the other tab's stays open and the day counts once", async ({
  page,
  request,
}) => {
  const errors = watch(page, [/\/api\/tutor/]);
  await seed(request, "second tab (d21)");
  const before = await api<{ openSessions?: { id: string; tabId?: string | null }[] }>(
    request,
    "GET",
    "/api/session/day",
  );
  expect(before.openSessions?.map((s) => s.tabId)).toEqual(["tab_00000000000000aa"]);
  const theirs = before.openSessions?.[0]?.id;
  await useUiPrefs(page, { theme: "paper" });
  await openToday(page);
  // Not "in session": that session belongs to another tab. This tab offers to start, and says the other is open.
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "normal");
  await expect(page.getByTestId("start-session")).toHaveText(/Start session/);
  await expect(page.getByTestId("other-tab")).toContainText("Another tab has a session open.");
  await expect(newRow(page)).toContainText("Dominant vs Major 7");
  await settle(page);
  await expectNoOverflow(page);
  await startByEnter(page);
  const mine = (await sessionState(page)).session?.id;
  expect(mine).toBeTruthy();
  expect(mine).not.toBe(theirs);
  // Both plan the same lesson while neither has finished it; both stay open on the server.
  expect((await sessionState(page)).plan).toMatchObject({ kind: "lesson", mapItemId: "U12.L02" });
  const after = await api<{ openSessions?: { id: string }[] }>(request, "GET", "/api/session/day");
  expect(after.openSessions?.map((s) => s.id).sort()).toEqual([mine, theirs].sort());
  // A reload of this tab gets its own session back, not the other tab's and not a third.
  await page.reload();
  await sessionPage(page);
  expect((await sessionState(page)).session?.id).toBe(mine);
  expect(errors).toEqual([]);
});
