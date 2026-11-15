// The journey's first session on the production build (`bun run build`, `--serve-dist`, no OAK_DEV: production
// security, the real tutor detection, no dev hooks): a fresh learner opens Oak, goes through onboarding in Quiet mode
// to Today, and the app then reloads with the network off (the Service Worker serves the shell). A second test
// moves a learner who is mid-U03 onto the production server the way a person would (a backup made on the dev
// stack, imported with the confirm nonce of contracts §11.6), starts that day's U03 session, and reloads it offline.
import { expect, test } from "@playwright/test";
import {
  expectStep,
  partContinue,
  reactContinue,
  throughTheLoop,
} from "../../app/src/onboarding/e2e/helpers.ts";
import { PROD_URL, stack } from "./playwright.config.ts";
import { expectClean, resetClock, seed, watch } from "./support.ts";

test.describe.configure({ mode: "serial" });

test("production: onboarding to Today, then an offline reload", async ({ browser }) => {
  const up = await fetch(`${PROD_URL}/api/health`, { headers: { "X-Oak": "1" } }).catch(() => null);
  test.skip(up === null, `no production server on ${PROD_URL}`);
  const context = await browser.newContext({ baseURL: PROD_URL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  // The production server says no tutor backend is set up here; the panel says so calmly, no error.
  const w = watch(page);
  await page.goto("/");
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "first-run", {
    timeout: 30_000,
  });
  await page.getByTestId("begin-onboarding").click();
  await throughTheLoop(page, 6);
  await reactContinue(page).click();
  await expectStep(page, "prefs");
  await page.getByTestId("prefs-continue").click();
  await expectStep(page, "tutor");
  await page.getByTestId("tutor-continue").click();
  await expectStep(page, "headphones");
  await page.getByTestId("lr-play").click();
  await page.getByTestId("lr-left").click({ timeout: 10_000 });
  await partContinue(page).click();
  await expectStep(page, "mic");
  await page.getByTestId("mic-quiet").click();
  // Quiet mode passes over the range; the latency screen keeps only taps, which can wait; the first note is a
  // listening step.
  await expectStep(page, "latency");
  await expect(page.getByTestId("onboarding")).toHaveAttribute("data-quiet", "1");
  await page.getByTestId("part-skip").click();
  await expectStep(page, "first-sing");
  await page.getByTestId("first-sing-start").click();
  await partContinue(page).click();
  await expectStep(page, "sketch");
  await expect(page.getByTestId("workbench")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("sketch-save").click();
  await expectStep(page, "coda");
  await page.getByTestId("coda-done").click();
  await expect(page).toHaveURL(/\/$/);
  // Onboarding is the first day's session: Today shows it done, with what comes next (journey review).
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("today-card")).toContainText("Next time: Set Up & First Sing");

  // The Service Worker (registered with sound) controls the page after a reload; then the network goes away.
  await expect
    .poll(
      () =>
        page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? ""),
      { timeout: 30_000 },
    )
    .toMatch(/\/sw\.js/);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
  await expect(page.getByTestId("today-card")).toBeVisible({ timeout: 30_000 });
  // Online, the whole first session printed no console error and asked nothing of another machine.
  expectClean(w);
  await context.setOffline(true);
  // Offline, the API calls fail on purpose: those console lines are expected here, nothing else.
  w.problems.length = 0;
  await page.reload();
  await expect(page.getByTestId("page-title")).toHaveText(/Today/, { timeout: 30_000 });
  await expect(page.locator("#main")).toBeVisible();
  const offlineProblems = w.problems.filter(
    (p) => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED|fetch/i.test(p),
  );
  expect(offlineProblems).toEqual([]);
  expect(w.remote).toEqual([]);
  await context.setOffline(false);
  await context.close();
});

test("production: a mid-U03 learner from a backup starts the day's U03 session, then reloads offline", async ({
  browser,
  request,
}) => {
  test.setTimeout(240_000);
  const up = await fetch(`${PROD_URL}/api/health`, { headers: { "X-Oak": "1" } }).catch(() => null);
  test.skip(up === null, `no production server on ${PROD_URL}`);
  // The learner on the dev stack: U03.L02 done yesterday, so today is U03.L03. Exported as a backup.
  await resetClock(request);
  await seed(request, "after U03.L02");
  const exported = await request.get(`${stack.apiURL}/api/backup/export?audio=0`, {
    headers: { "x-oak": "1", origin: stack.apiURL },
  });
  expect(exported.ok()).toBe(true);
  const bytes = await exported.body();
  // Imported on the production server: a destructive action, so it needs a fresh confirm nonce.
  const prodHeaders = { "x-oak": "1", origin: PROD_URL };
  const nonce = await request.post(`${PROD_URL}/api/confirm`, {
    headers: { ...prodHeaders, "content-type": "application/json" },
    data: JSON.stringify({ action: "backup.import", target: "*" }),
  });
  expect(nonce.ok()).toBe(true);
  const imported = await request.post(`${PROD_URL}/api/backup/import`, {
    headers: {
      ...prodHeaders,
      "content-type": "application/octet-stream",
      "x-oak-confirm": ((await nonce.json()) as { nonce: string }).nonce,
    },
    data: bytes,
  });
  expect(imported.ok(), await imported.text()).toBe(true);

  const context = await browser.newContext({ baseURL: PROD_URL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const w = watch(page);
  await page.goto("/");
  const today = page.getByTestId("today-card");
  await expect(today).toBeVisible({ timeout: 30_000 });
  await expect(today).not.toHaveAttribute("data-state", /first-run|done/);
  await expect(today).toContainText("Restless Neighbours");
  // No dev hooks in a production build.
  expect(await page.evaluate(() => "__oakSession" in window || "__oakLesson" in window)).toBe(false);
  await page.getByTestId("start-session").click();
  await expect(page).toHaveURL(/\/session\/?$/);
  await expect(page.getByTestId("warmup").or(page.getByTestId("lesson-step")).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("list", { name: "Today's setlist" })).toBeVisible();

  // Offline: the Service Worker serves the shell and the session page still renders.
  await expect
    .poll(
      () =>
        page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? ""),
      { timeout: 30_000 },
    )
    .toMatch(/\/sw\.js/);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
  expectClean(w);
  await context.setOffline(true);
  w.problems.length = 0;
  await page.reload();
  await expect(page.locator("#main")).toBeVisible({ timeout: 30_000 });
  await expect(
    page
      .getByTestId("page-title")
      .or(page.getByRole("list", { name: "Today's setlist" }))
      .first(),
  ).toBeVisible({
    timeout: 30_000,
  });
  const offlineProblems = w.problems.filter(
    (p) => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED|fetch/i.test(p),
  );
  expect(offlineProblems).toEqual([]);
  expect(w.remote).toEqual([]);
  await context.setOffline(false);
  await context.close();
});

test("production: a U06 learner from a backup starts the day's U06 session and opens Transcribe, then both reload offline", async ({
  browser,
  request,
}) => {
  test.setTimeout(240_000);
  const up = await fetch(`${PROD_URL}/api/health`, { headers: { "X-Oak": "1" } }).catch(() => null);
  test.skip(up === null, `no production server on ${PROD_URL}`);
  // The learner on the dev stack: U06.L05 done yesterday, so today is U06.L06. Exported with its own audio.
  await resetClock(request);
  await seed(request, "after U06.L05");
  const exported = await request.get(`${stack.apiURL}/api/backup/export?audio=1`, {
    headers: { "x-oak": "1", origin: stack.apiURL },
  });
  expect(exported.ok()).toBe(true);
  const prodHeaders = { "x-oak": "1", origin: PROD_URL };
  const nonce = await request.post(`${PROD_URL}/api/confirm`, {
    headers: { ...prodHeaders, "content-type": "application/json" },
    data: JSON.stringify({ action: "backup.import", target: "*" }),
  });
  expect(nonce.ok()).toBe(true);
  const imported = await request.post(`${PROD_URL}/api/backup/import`, {
    headers: {
      ...prodHeaders,
      "content-type": "application/octet-stream",
      "x-oak-confirm": ((await nonce.json()) as { nonce: string }).nonce,
    },
    data: await exported.body(),
  });
  expect(imported.ok(), await imported.text()).toBe(true);

  const context = await browser.newContext({ baseURL: PROD_URL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const w = watch(page);
  await page.goto("/");
  const today = page.getByTestId("today-card");
  await expect(today).toBeVisible({ timeout: 30_000 });
  await expect(today).not.toHaveAttribute("data-state", /first-run|done/);
  await expect(today).toContainText("The Four-Chord Schema");
  await page.getByTestId("start-session").click();
  await expect(page).toHaveURL(/\/session\/?$/);
  await expect(page.getByTestId("warmup").or(page.getByTestId("lesson-step")).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("list", { name: "Today's setlist" })).toBeVisible();

  // The Transcription Studio on the production build: the own-audio entry, nothing sent off this machine.
  await page.goto("/transcribe");
  await expect(page.getByRole("heading", { level: 1, name: "Transcribe" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("import")).toContainText("Bring a recording");
  await expect(page.getByTestId("import")).toContainText("It stays on this device.");

  await expect
    .poll(
      () =>
        page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? ""),
      { timeout: 30_000 },
    )
    .toMatch(/\/sw\.js/);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
  expectClean(w);

  // Offline: the Service Worker serves the shell; Transcribe and the session page still render.
  await context.setOffline(true);
  w.problems.length = 0;
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Transcribe" })).toBeVisible({ timeout: 30_000 });
  await page.goto("/session");
  await expect(page.locator("#main")).toBeVisible({ timeout: 30_000 });
  const offlineProblems = w.problems.filter(
    (p) => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED|fetch/i.test(p),
  );
  expect(offlineProblems).toEqual([]);
  expect(w.remote).toEqual([]);
  await context.setOffline(false);
  await context.close();
});

/** Moves the dev stack's learner at `point` onto the production server (a backup, imported with its confirm nonce). */
async function importSeed(
  request: import("@playwright/test").APIRequestContext,
  point: string,
): Promise<void> {
  await resetClock(request);
  await seed(request, point);
  const exported = await request.get(`${stack.apiURL}/api/backup/export?audio=1`, {
    headers: { "x-oak": "1", origin: stack.apiURL },
  });
  expect(exported.ok()).toBe(true);
  const prodHeaders = { "x-oak": "1", origin: PROD_URL };
  const nonce = await request.post(`${PROD_URL}/api/confirm`, {
    headers: { ...prodHeaders, "content-type": "application/json" },
    data: JSON.stringify({ action: "backup.import", target: "*" }),
  });
  expect(nonce.ok()).toBe(true);
  const imported = await request.post(`${PROD_URL}/api/backup/import`, {
    headers: {
      ...prodHeaders,
      "content-type": "application/octet-stream",
      "x-oak-confirm": ((await nonce.json()) as { nonce: string }).nonce,
    },
    data: await exported.body(),
  });
  expect(imported.ok(), await imported.text()).toBe(true);
}

test("production (Wave 5): a U10 session and the C4 capstone workspace, each reloaded offline", async ({
  browser,
  request,
}) => {
  test.setTimeout(240_000);
  const up = await fetch(`${PROD_URL}/api/health`, { headers: { "X-Oak": "1" } }).catch(() => null);
  test.skip(up === null, `no production server on ${PROD_URL}`);
  const u10l04 = (await import("../../content/core/U10/L04/lesson.ts")).default;

  // A U10 learner (U10.L03 done yesterday): today's session is U10.L04.
  await importSeed(request, "after U10.L03");
  const context = await browser.newContext({ baseURL: PROD_URL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const w = watch(page);
  await page.goto("/");
  const today = page.getByTestId("today-card");
  await expect(today).toBeVisible({ timeout: 30_000 });
  await expect(today).not.toHaveAttribute("data-state", /first-run|done/);
  await expect(today).toContainText(u10l04.title);
  await page.getByTestId("start-session").click();
  await expect(page).toHaveURL(/\/session\/?$/);
  await expect(page.getByTestId("warmup").or(page.getByTestId("lesson-step")).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? ""),
      { timeout: 30_000 },
    )
    .toMatch(/\/sw\.js/);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
  expectClean(w);
  await context.setOffline(true);
  w.problems.length = 0;
  await page.reload();
  await expect(page.locator("#main")).toBeVisible({ timeout: 30_000 });
  await context.setOffline(false);

  // A learner at C4's first session: the capstone workspace on the production build, then offline.
  await importSeed(request, "C4 open");
  await page.goto("/capstone/C4");
  await expect(page.getByRole("heading", { level: 1, name: "C4 Minor Indie Ballad" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Start session 1 of 2" }).click();
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  // Offline the Service Worker serves the shell: the page keeps its title and says calmly that the server is away
  // (the learner's data lives on the local server, which is not cached).
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("banner")).toContainText("C4 Minor Indie Ballad", { timeout: 30_000 });
  await expect(page.locator("#main")).toBeVisible();
  const offlineProblems = w.problems.filter(
    (p) => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED|fetch/i.test(p),
  );
  expect(offlineProblems).toEqual([]);
  expect(w.remote).toEqual([]);
  await context.setOffline(false);
  await context.close();
});

test("production (Wave 6): a U15 session, then the finished album of twelve tracks, each reloaded offline", async ({
  browser,
  request,
}) => {
  test.setTimeout(240_000);
  const up = await fetch(`${PROD_URL}/api/health`, { headers: { "X-Oak": "1" } }).catch(() => null);
  test.skip(up === null, `no production server on ${PROD_URL}`);
  const u15l02 = (await import("../../content/core/U15/L02/lesson.ts")).default;

  // A U15 learner (C6 released yesterday): today's session is U15.L02, Five of Five.
  await importSeed(request, "C6 released");
  const context = await browser.newContext({ baseURL: PROD_URL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const w = watch(page);
  await page.goto("/");
  const today = page.getByTestId("today-card");
  await expect(today).toBeVisible({ timeout: 30_000 });
  await expect(today).not.toHaveAttribute("data-state", /first-run|done/);
  await expect(today).toContainText(u15l02.title);
  await page.getByTestId("start-session").click();
  await expect(page).toHaveURL(/\/session\/?$/);
  await expect(page.getByTestId("warmup").or(page.getByTestId("lesson-step")).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? ""),
      { timeout: 30_000 },
    )
    .toMatch(/\/sw\.js/);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
  expectClean(w);
  await context.setOffline(true);
  w.problems.length = 0;
  await page.reload();
  await expect(page.locator("#main")).toBeVisible({ timeout: 30_000 });
  await context.setOffline(false);

  // A learner who has finished the core: the album holds Side A's twelve tracks, each with its recording.
  await importSeed(request, "core complete");
  await page.goto("/album");
  await expect(page.getByTestId("album-meta")).toContainText("12 tracks", { timeout: 60_000 });
  await expect(page.getByTestId("play-side-a").first()).toBeVisible();
  await context.setOffline(true);
  w.problems.length = 0;
  await page.reload();
  await expect(page.locator("#main")).toBeVisible({ timeout: 30_000 });
  const offlineProblems = w.problems.filter(
    (p) => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED|fetch/i.test(p),
  );
  expect(offlineProblems).toEqual([]);
  expect(w.remote).toEqual([]);
  await context.setOffline(false);
  await context.close();
});

test("production (Wave 7): a jazz session, the album's Side B and an Export rendered offline, each reloaded offline", async ({
  browser,
  request,
}) => {
  test.setTimeout(240_000);
  const up = await fetch(`${PROD_URL}/api/health`, { headers: { "X-Oak": "1" } }).catch(() => null);
  test.skip(up === null, `no production server on ${PROD_URL}`);
  const j3l02 = (await import("../../content/advanced/J3/L02/lesson.ts")).default;

  // A jazz learner (J3.L01 done yesterday): today's session is J3.L02, Drop-2 & Spread.
  await importSeed(request, "J3.L02 next");
  const context = await browser.newContext({ baseURL: PROD_URL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const w = watch(page);
  await page.goto("/");
  const today = page.getByTestId("today-card");
  await expect(today).toBeVisible({ timeout: 30_000 });
  await expect(today).toContainText(j3l02.title);
  await page.getByTestId("start-session").click();
  await expect(page).toHaveURL(/\/session\/?$/);
  await expect(page.getByTestId("warmup").or(page.getByTestId("lesson-step")).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? ""),
      { timeout: 30_000 },
    )
    .toMatch(/\/sw\.js/);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
  // The shell is warmed with the offline renderer's document (Export renders in a frame of it).
  await expect
    .poll(
      () =>
        page.evaluate(
          async () => !!(await (await caches.open("oak-shell-v1")).match("/offline-render.html")),
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
  expectClean(w);
  await context.setOffline(true);
  w.problems.length = 0;
  await page.reload();
  await expect(page.locator("#main")).toBeVisible({ timeout: 30_000 });
  await context.setOffline(false);

  // JC1 released: Side B holds it; its Export renders a WAV offline (two bars of it, wave7.md §7.3).
  await importSeed(request, "JC1 released");
  await page.route(/\/api\/album\/tracks\/[^/]+\/versions\/\d+\/source$/, async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { code: string };
    const tempo = body.code.split("\n")[0] ?? "setcpm(72/4)";
    await route.fulfill({
      response: res,
      json: { ...body, code: `${tempo}\n\nkeys: note("<[d4,f4,a4,c5] [g3,b3,d4,f4]>").s("rhodes").gain(.5)` },
    });
  });
  await page.goto("/album");
  const sideB = page.locator("section[data-side='B']");
  await expect(sideB).toBeVisible({ timeout: 60_000 });
  await sideB.locator("li[data-track]").first().getByRole("link").first().click();
  await expect(page.getByTestId("export")).toBeVisible({ timeout: 60_000 });
  const download = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByTestId("export-wav").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.wav$/);
  const bytes = (await import("node:fs")).readFileSync(await file.path());
  expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
  expect(bytes.subarray(8, 12).toString()).toBe("WAVE");
  await expect(page.getByTestId("export-done")).toContainText("The release recording stays as it is.");
  await page.unroute(/\/api\/album\/tracks\/[^/]+\/versions\/\d+\/source$/);
  // The track page reloads offline.
  await context.setOffline(true);
  w.problems.length = 0;
  await page.reload();
  await expect(page.locator("#main")).toBeVisible({ timeout: 30_000 });
  const offlineProblems = w.problems.filter(
    (p) => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED|fetch/i.test(p),
  );
  expect(offlineProblems).toEqual([]);
  expect(w.remote).toEqual([]);
  await context.setOffline(false);
  await context.close();
});
