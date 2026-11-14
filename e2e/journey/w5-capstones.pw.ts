// Wave 5 journeys (d), (e and j: C4 in Quiet mode), (f: C5) and (g): the multi-session capstones as daily
// sessions on the real stack (real server, real content, the scripted fake tutor, Chrome's fake microphone), each
// from a dev seed, the dev clock moving one day between sessions. Every piece is the capstone suite's own
// (app/src/capstone/e2e/w5-pieces.ts), graded against the briefs with the real grader in w5-pieces.test.ts.
//   (d) "C3 open": C3 Verse–Chorus Demo over four sessions (d13) — groove and changes (the form strip reads
//       A B A B), then the melodies, then the arrangement: every requirement met, the lead sheet with its sections;
//       then from "C3.S3 done" session 4: Claude's review, a recorded take of the whole 96-second demo, the
//       release; the album track has its recording (≥ 90 s), cover, liner notes and review.
//   (e) "C4 open": C4 Minor Indie Ballad — the Aeolian verse, then the chorus cadence with the major V; released.
//       Walked in Quiet mode (j), the only C4 journey.
//   (f) "C5 open": C5 12-Bar Shuffle — one swung chorus, then two with the riff answered; a review with two
//       revisions; released.
//   (g) "X2 open": X2 Blues Transcription — bass, then the changes, then the melody line by line the next day;
//       released. The album then holds eight tracks: C0, C1, C2, X1, C3, C4, C5 and X2.
// (d)'s session 4 runs longer than the suite's 90-second guide: its release records the whole demo in real time
// (C3's brief asks for 96 seconds; no other spec records it). The other releases take a seeded take of the same window
// (app/src/capstone/e2e/seeded-take.ts); the real recorder is under test here (C3), in gate journey 5 (C0), in the
// C1 journey and in the capstone suite.
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { seedTake } from "../../app/src/capstone/e2e/seeded-take.ts";
import {
  C3_FULL,
  C3_GROOVE,
  C4_FULL,
  C4_VERSE,
  C5_FULL,
  C5_ONE_CHORUS,
} from "../../app/src/capstone/e2e/w5-pieces.ts";
import { fakeMic } from "../../app/src/onboarding/e2e/helpers.ts";
import careless from "../../content/repertoire/careless-love/song.ts";
import { useUiPrefs as setUiPrefs } from "../support/ui.ts";
import { advanceDays, api, expectClean, noHmr, resetClock, shootAll, type Watch, watch } from "./support.ts";
import { doneForToday, sessionState, setCapstoneCode, skipWarmup, startSession, today } from "./w4-day.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav") }, permissions: ["microphone"] });
test.describe.configure({ mode: "serial" });

interface Sessions {
  sessions: { capstoneSessionId: string; status: string }[];
}
interface AlbumTrack {
  id: string;
  capstoneId: string | null;
  title: string;
}
interface TrackDetail {
  id: string;
  title: string;
  versions: {
    version: number;
    linerNotesMd: string;
    review: unknown;
    hasAudio: boolean;
    durationS: number | null;
  }[];
}

const sessionsOf = (request: APIRequestContext, cap: string) =>
  api<Sessions>(request, "GET", `/api/capstones/${cap}/sessions`);

async function begin(
  page: Page,
  request: APIRequestContext,
  point: string,
  o: { quiet?: boolean; theme?: "paper" | "bark" } = {},
): Promise<Watch> {
  await resetClock(request);
  await api(request, "POST", "/api/dev/seed", o.quiet ? { point, mic: false } : { point });
  if (o.quiet) await api(request, "PUT", "/api/voice/quiet", { quiet: true, scope: "always" });
  await noHmr(page);
  await setUiPrefs(page, { theme: o.theme ?? "paper", motion: "off" });
  return watch(page);
}

/** Today names the capstone session; Start; the warm-up is skipped; the New block is the capstone. */
async function capstoneDay(page: Page, label: string, mapItemId: string): Promise<void> {
  await today(page);
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "capstone");
  await expect(page.getByTestId("setlist").locator('[data-row="new"]')).toContainText(label, {
    timeout: 20_000,
  });
  await startSession(page);
  expect((await sessionState(page)).plan).toMatchObject({ kind: "capstone", mapItemId });
  await skipWarmup(page);
}

/** The first session's Start page (a song chosen first for a transcription), then the workspace. */
async function firstSession(page: Page, of: number, song?: string): Promise<void> {
  const start = page.getByRole("button", { name: `Start session 1 of ${of}` });
  const ws = page.getByTestId("capstone-workspace");
  await expect(ws.or(start)).toBeVisible({ timeout: 60_000 });
  if (await start.isVisible()) {
    if (song)
      await page.getByRole("radiogroup", { name: "The song" }).getByRole("radio", { name: song }).click();
    await start.focus();
    await page.keyboard.press("Enter");
  }
  await expect(ws).toBeVisible({ timeout: 60_000 });
}

/** A later session resumes the draft from the top: the resume card, then the workspace. */
async function resume(page: Page, session: string): Promise<void> {
  const card = page.getByTestId("capstone-resume");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText(session);
  await expect(page.getByTestId("resume-continue")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
}

/** Finishes a session that does not release: saved, finished, the Coda, "Done for today". */
async function finishSession(page: Page): Promise<void> {
  await expect(page.getByTestId("saved-state")).toContainText(/Version \d+ saved/, { timeout: 30_000 });
  await page.getByTestId("finish-session").click();
  await doneForToday(page);
}

/** Every requirement met and checked. */
async function checkAllMet(page: Page): Promise<void> {
  await expect(page.getByTestId("req-count")).toHaveText(/^(\d+) of \1 met$/, { timeout: 90_000 });
  await page.getByTestId("check-track").click();
  await expect(page.getByRole("status").filter({ hasText: /every requirement is met/ })).toBeVisible({
    timeout: 60_000,
  });
}

/** Claude's review (the scripted fake tutor) with its revisions. */
async function review(page: Page, revisions: number): Promise<void> {
  await page.getByTestId("request-review").click();
  const r = page.getByTestId("review-summary");
  await expect(r).toBeVisible({ timeout: 60_000 });
  await expect(r).toContainText("Claude's comments never affect pass or fail.");
  await expect(r.locator("[data-revision]")).toHaveCount(revisions);
  await expect(r.getByTestId("review-heading")).toHaveText(/^Review of version \d+$/);
}

/**
 * The release with a recorded take, the ceremony, the Coda naming the album; "Done for today". `take: "real"`
 * records the whole piece in real time (C3's brief asks for its 96 seconds: this journey is the suite's only real
 * C3 take); `"seeded"` gives the recorder a take of the same window at once (app/src/capstone/e2e/seeded-take.ts),
 * uploaded through the same release path, as the capstone suite does for every piece whose brief needs no take.
 */
async function release(
  page: Page,
  title: string,
  liner: string,
  takeMs: number,
  take: "real" | "seeded",
): Promise<void> {
  const btn = page.getByTestId("release");
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  await btn.click();
  const dialog = page.getByRole("dialog", { name: /Release to the album|Release a new version/ });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel(/One line for the liner notes/).fill(liner);
  if (take === "seeded") await seedTake(page);
  await dialog.getByTestId("record-take").click();
  await expect(dialog.getByTestId("take-audio")).toBeVisible({ timeout: takeMs });
  await dialog.getByTestId("confirm-release").click();
  const ceremony = page.getByTestId("release-ceremony");
  await expect(ceremony).toBeVisible({ timeout: 30_000 });
  await ceremony.getByRole("button", { name: "Continue to the coda" }).click();
  await page.waitForURL(/\/session\/coda$/);
  await expect(page.getByTestId("coda-release")).toContainText("joins your album", { timeout: 30_000 });
  await expect(page.getByTestId("coda-album-count")).toContainText(/Your album now holds \d+ tracks\./);
  await doneForToday(page);
}

/** The released track: its recording, cover and liner notes on its page; a review kept with version 1. */
async function trackOf(page: Page, request: APIRequestContext, cap: string, title: string, shots: string) {
  const album = await api<{ tracks: AlbumTrack[] }>(request, "GET", "/api/album");
  const t = album.tracks.find((x) => x.capstoneId === cap) as AlbumTrack;
  expect(t, `${cap} is on the album`).toBeTruthy();
  expect(t.title).toBe(title);
  await page.goto(`/album/${t.id}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("track-audio")).toBeVisible();
  await expect(page.locator("main svg").first()).toBeVisible();
  let detail = await api<TrackDetail>(request, "GET", `/api/album/tracks/${t.id}`);
  if (!detail.versions[0]?.review) {
    // A review asked for before the release belongs to the capstone thread: ask for one of this version.
    await page.getByTestId("track-request-review").click();
    await expect(page.getByTestId("track-review").getByTestId("review-card")).toBeVisible({
      timeout: 90_000,
    });
    detail = await api<TrackDetail>(request, "GET", `/api/album/tracks/${t.id}`);
  }
  expect(detail.versions[0]?.review, "a review is kept with version 1").toBeTruthy();
  expect(detail.versions[0]?.hasAudio).toBe(true);
  await expect(page.getByTestId("track-review")).toBeVisible();
  await shootAll(page, shots);
  return detail;
}

test("(d) C3 sessions 1–3: groove and changes, the melodies, then the arrangement and its lead sheet", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const w = await begin(page, request, "C3 open");

  // Day 1, C3.S1: groove and changes for verse and chorus, arranged V C V C.
  await capstoneDay(page, "C3 Verse–Chorus Demo · session 1 of 4", "C3.S1");
  await firstSession(page, 4);
  await setCapstoneCode(page, "C3", C3_GROOVE);
  await expect(page.getByTestId("form-letters")).toHaveText("A B A B", { timeout: 60_000 });
  await finishSession(page);
  expect((await sessionsOf(request, "C3")).sessions.map((s) => s.status)).toEqual([
    "done",
    "open",
    "locked",
    "locked",
  ]);

  // Day 2, C3.S2: the draft from the top; the melodies over it.
  await advanceDays(request, 1);
  await capstoneDay(page, "C3 Verse–Chorus Demo · session 2 of 4", "C3.S2");
  await resume(page, "Session 2 of 4");
  await setCapstoneCode(page, "C3", C3_FULL);
  await finishSession(page);

  // Day 3, C3.S3 (d13): the arrangement, every requirement, the lead sheet. The take and the release are S4's.
  await advanceDays(request, 1);
  await capstoneDay(page, "C3 Verse–Chorus Demo · session 3 of 4", "C3.S3");
  await resume(page, "Session 3 of 4");
  await checkAllMet(page);
  const sheet = page.getByTestId("lead-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".oak-section").first()).toBeVisible({ timeout: 30_000 });
  await finishSession(page);
  expect((await sessionsOf(request, "C3")).sessions.map((s) => s.status)).toEqual([
    "done",
    "done",
    "done",
    "open",
  ]);
  expectClean(w);
  await resetClock(request);
});

// (d) runs longer than the suite's 90-second guide: its release records the whole demo in real time (C3's brief
// asks for 96 seconds; no other spec records it).
test("(d) C3 session 4: Claude's review, a recorded take of the whole 96-second demo, the release", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const w = await begin(page, request, "C3.S3 done");
  await capstoneDay(page, "C3 Verse–Chorus Demo · session 4 of 4", "C3.S4");
  await resume(page, "Session 4 of 4");
  // The release is of a checked version: the arranged demo is checked again in this session.
  await checkAllMet(page);
  await review(page, 1);
  await shootAll(page, "w5-journey-c3-s4");
  await release(page, "Two Rooms", "The verse waits low; the chorus climbs.", 150_000, "real");
  expect((await sessionsOf(request, "C3")).sessions.map((s) => s.status)).toEqual([
    "done",
    "done",
    "done",
    "done",
  ]);
  const detail = await trackOf(page, request, "C3", "Two Rooms", "w5-journey-c3-track");
  expect(detail.versions[0]?.durationS ?? 0).toBeGreaterThan(90);
  await expect(page.getByTestId("liner-notes").first()).toContainText(
    "The verse waits low; the chorus climbs.",
  );
  expectClean(w);
  await resetClock(request);
});

// C4 is walked once, in Quiet mode (Bark): the same two days, release and album title as a day with a microphone
// (Quiet mode changes nothing in a capstone workspace), and the capstone days with a microphone are (d), (f), (g)
// and the Wave 4 journeys.
test("(e, j) C4 over its two sessions in Quiet mode: the Aeolian verse, then the major V; released", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const w = await begin(page, request, "C4 open", { quiet: true, theme: "bark" });
  await capstoneDay(page, "C4 Minor Indie Ballad · session 1 of 2", "C4.S1");
  await firstSession(page, 2);
  await setCapstoneCode(page, "C4", C4_VERSE);
  await expect(page.getByTestId("form-letters")).toHaveText("A B A B", { timeout: 60_000 });
  await finishSession(page);

  await advanceDays(request, 1);
  await capstoneDay(page, "C4 Minor Indie Ballad · session 2 of 2", "C4.S2");
  await resume(page, "Session 2 of 2");
  await setCapstoneCode(page, "C4", C4_FULL);
  await checkAllMet(page);
  await shootAll(page, "w5-journey-c4-quiet");
  await release(page, "Low Light (quiet)", "Home on A, after the bright E.", 120_000, "seeded");
  expect((await sessionsOf(request, "C4")).sessions.map((s) => s.status)).toEqual(["done", "done"]);
  const album = await api<{ tracks: AlbumTrack[] }>(request, "GET", "/api/album");
  expect(album.tracks.find((t) => t.capstoneId === "C4")?.title).toBe("Low Light (quiet)");
  expectClean(w);
  await resetClock(request);
});

test("(f) C5 over its two sessions: one swung chorus, then two with the riff answered; a two-revision review; released", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const w = await begin(page, request, "C5 open", { theme: "bark" });
  await capstoneDay(page, "C5 12-Bar Shuffle · session 1 of 2", "C5.S1");
  await firstSession(page, 2);
  await setCapstoneCode(page, "C5", C5_ONE_CHORUS);
  await finishSession(page);

  await advanceDays(request, 1);
  await capstoneDay(page, "C5 12-Bar Shuffle · session 2 of 2", "C5.S2");
  await resume(page, "Session 2 of 2");
  await setCapstoneCode(page, "C5", C5_FULL);
  await checkAllMet(page);
  // From C5 on a review has two revisions (contracts §10).
  await review(page, 2);
  await shootAll(page, "w5-journey-c5-review");
  await release(page, "Late Shuffle", "Two choruses; the riff asks, then answers.", 120_000, "seeded");
  await trackOf(page, request, "C5", "Late Shuffle", "w5-journey-c5-track");
  expectClean(w);
  await resetClock(request);
});

test("(g) X2 over its two sessions: bass, changes, then the melody; released; the album holds eight tracks", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const w = await begin(page, request, "X2 open");
  const l = careless.answerKey.layers as Record<string, string>;
  const head = `setcpm(${careless.bpm}/4)\n\n`;
  const check = async (id: string) => {
    const row = page.locator(`[data-check="${id}"]`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).not.toHaveAttribute("data-state", "locked");
    await row.getByTestId("check-phrase").click();
    await expect(row).toHaveAttribute("data-state", "passed", { timeout: 60_000 });
  };

  // Day 1, X2.S1: the song chosen; the bass first, then the changes (they open after the bass).
  await capstoneDay(page, "X2 Blues Transcription · session 1 of 2", "X2.S1");
  await firstSession(page, 2, "Careless Love");
  await expect(page.getByTestId("capstone-workspace")).toHaveAttribute("data-kind", "transcribe");
  await expect(page.locator('[data-check="changes"]')).toHaveAttribute("data-state", "locked");
  await setCapstoneCode(page, "X2", `${head}bass: ${l.bass}`);
  await check("bass");
  await setCapstoneCode(page, "X2", `${head}bass: ${l.bass}\nchords: ${l.chords}`);
  await check("changes");
  await shootAll(page, "w5-journey-x2-s1");
  await finishSession(page);

  // Day 2, X2.S2: from the top, the melody a line at a time; then the release.
  await advanceDays(request, 1);
  await capstoneDay(page, "X2 Blues Transcription · session 2 of 2", "X2.S2");
  await resume(page, "Session 2 of 2");
  await setCapstoneCode(
    page,
    "X2",
    `${head}bass: ${l.bass}\nchords: ${l.chords}\nmelody: ${l.melody}.s("piano")`,
  );
  const rows = page.getByTestId("x1-checks").locator("[data-check^='melody']");
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await check((await rows.nth(i).getAttribute("data-check")) as string);
  await release(page, "Careless Love", "Written down by ear, bass first.", 120_000, "seeded");
  expect((await sessionsOf(request, "X2")).sessions.map((s) => s.status)).toEqual(["done", "done"]);

  // The album: eight tracks, each with its cover; X2's names the song.
  const album = await api<{ tracks: AlbumTrack[] }>(request, "GET", "/api/album");
  const caps = album.tracks.map((t) => t.capstoneId).filter((c) => c !== null);
  for (const c of ["C0", "C1", "C2", "X1", "C3", "C4", "C5", "X2"]) expect(caps).toContain(c);
  await page.goto("/album");
  await expect(page.getByTestId("album-meta")).toContainText("8 tracks", { timeout: 60_000 });
  await shootAll(page, "w5-journey-album-eight");
  const x2 = album.tracks.find((t) => t.capstoneId === "X2") as AlbumTrack;
  await page.goto(`/album/${x2.id}`);
  await expect(page.getByTestId("track-audio")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("liner-notes").first()).toContainText("Careless Love");
  expectClean(w);
  await resetClock(request);
});
