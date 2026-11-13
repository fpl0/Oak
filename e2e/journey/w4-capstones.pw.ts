// Wave 4 journeys (e) and (f): the multi-session capstones as daily sessions on the real stack (real server, real
// content, the scripted fake tutor, Chrome's fake microphone), each from a dev seed, the dev clock moving one day
// between sessions:
//   1. "C2 open": C2 Four-Chord Song over its two sessions. Day 1 writes the chords (the draft is the session's
//      Make); day 2 resumes the draft from the top, adds the melody until every requirement is met, asks Claude
//      for a review, records a take and releases it. The album then holds C0, C1 and C2, each with its tree-ring
//      cover and liner notes; C2's track has its recording, its liner notes and the review.
//   2. "X1 open": X1 Folk Transcription over its three sessions on Aura Lee. Day 1 hears phrases 1–2 by ear (the
//      answer key stands in for the learner's ear), day 2 phrases 3–4, day 3 the chords bass first (bass, then
//      qualities, then numerals) and the release; the album's X1 track names the song in its liner notes.
import { expect, type Page, test } from "@playwright/test";
import { fakeMic } from "../../app/src/onboarding/e2e/helpers.ts";
import auraLee from "../../content/repertoire/aura-lee/song.ts";
import { useUiPrefs as setUiPrefs } from "../support/ui.ts";
import { advanceDays, api, expectClean, noHmr, resetClock, seed, shootAll, watch } from "./support.ts";
import { doneForToday, sessionState, setCapstoneCode, skipWarmup, startSession, today } from "./w4-day.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav") }, permissions: ["microphone"] });
test.describe.configure({ mode: "serial" });

// Checked with @oak/grader against the C2 brief (content/capstones.ts; C major, 96 BPM; the capstone suite's
// pieces): the axis loop I V vi IV twice round, then V–I with the melody landing on 1.
const LOOP = '"<[0,2,4] [4,6,8] [5,7,9] [3,5,7] [0,2,4] [4,6,8] [4,6,8] [0,2,4]>"';
const C2_CHORDS = `setcpm(96/4)\n\nchords: n(${LOOP}).scale("C3:major").s("piano")\nmelody: n("<0 ~ ~ ~ ~ ~ ~ ~>").scale("C4:major").s("piano")`;
const C2_FULL = `setcpm(96/4)\n\nchords: n(${LOOP}).scale("C3:major").s("piano")\nmelody: n("<[4 4 2 ~] [4 4 1 ~] [5 5 2 ~] [3 3 0 ~] [4 4 2 ~] [4 4 1 ~] [4 4 1 ~] [0@4]>").scale("C4:major").s("piano")`;

interface Sessions {
  sessions: {
    capstoneSessionId: string;
    status: string;
    checks: { checkId: string; stage: "bass" | "quality" | "rn" | null }[];
  }[];
}
interface AlbumTrack {
  id: string;
  capstoneId: string | null;
  title: string;
}
interface TrackDetail {
  id: string;
  title: string;
  versions: { version: number; linerNotesMd: string; review: unknown; audioId?: string | null }[];
}

const sessionsOf = (request: import("@playwright/test").APIRequestContext, cap: string) =>
  api<Sessions>(request, "GET", `/api/capstones/${cap}/sessions`);

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

/** A later session of a capstone resumes the draft from the top: the resume card, then the workspace. */
async function resume(page: Page, session: string): Promise<void> {
  const card = page.getByTestId("capstone-resume");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText(session);
  await expect(page.getByTestId("resume-continue")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
}

test("C2 over its two sessions: chords, then the melody, a review, a recorded release; the album holds C0, C1 and C2", async ({
  page,
  request,
}) => {
  test.setTimeout(270_000);
  await resetClock(request);
  await seed(request, "C2 open");
  await noHmr(page);
  await setUiPrefs(page, { theme: "paper", motion: "off" });
  const w = watch(page);

  // Day 1, C2.S1: the chords. The draft saves and is bound to the session; finishing it is the day's Make.
  await capstoneDay(page, "C2 Four-Chord Song · session 1 of 2", "C2.S1");
  const start = page.getByRole("button", { name: "Start session 1 of 2" });
  const ws = page.getByTestId("capstone-workspace");
  await expect(ws.or(start)).toBeVisible({ timeout: 60_000 });
  if (await start.isVisible()) await start.click();
  await expect(ws).toBeVisible({ timeout: 60_000 });
  await setCapstoneCode(page, "C2", C2_CHORDS);
  await expect(page.getByTestId("saved-state")).toContainText(/Version \d+ saved/, { timeout: 30_000 });
  await expect
    .poll(
      async () =>
        (await sessionsOf(request, "C2")).sessions.find((s) => s.capstoneSessionId === "C2.S1")?.status,
    )
    .toBe("in_progress");
  await page.getByTestId("finish-session").click();
  await doneForToday(page);
  expect((await sessionsOf(request, "C2")).sessions.map((s) => s.status)).toEqual(["done", "open"]);

  // Day 2, C2.S2: the draft from the top, the melody, every requirement met, Claude's review, the release.
  await advanceDays(request, 1);
  await capstoneDay(page, "C2 Four-Chord Song · session 2 of 2", "C2.S2");
  await resume(page, "Session 2 of 2");
  await setCapstoneCode(page, "C2", C2_FULL);
  await expect(page.getByTestId("req-count")).toHaveText("7 of 7 met", { timeout: 60_000 });
  await page.getByTestId("check-track").click();
  await expect(page.getByRole("status").filter({ hasText: /every requirement is met/ })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("request-review").click();
  const review = page.getByTestId("review-summary");
  await expect(review).toBeVisible({ timeout: 60_000 });
  await expect(review).toContainText("Claude's comments never affect pass or fail.");
  await shootAll(page, "w4-journey-c2-review");
  const release = page.getByTestId("release");
  await expect(release).toBeEnabled({ timeout: 30_000 });
  await release.click();
  const dialog = page.getByRole("dialog", { name: /Release to the album|Release a new version/ });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByLabel("Title").fill("Loop, Then Land");
  await dialog.getByLabel(/One line for the liner notes/).fill("Six bars of the loop, then home.");
  await dialog.getByTestId("record-take").click();
  await expect(dialog.getByTestId("take-audio")).toBeVisible({ timeout: 60_000 });
  await dialog.getByTestId("confirm-release").click();
  const ceremony = page.getByTestId("release-ceremony");
  await expect(ceremony).toBeVisible({ timeout: 30_000 });
  await ceremony.getByRole("button", { name: "Continue to the coda" }).click();
  await page.waitForURL(/\/session\/coda$/);
  await expect(page.getByTestId("coda-release")).toContainText("joins your album", { timeout: 30_000 });
  await doneForToday(page);
  expect((await sessionsOf(request, "C2")).sessions.map((s) => s.status)).toEqual(["done", "done"]);

  // The album: C0, C1 and C2, each with its cover and liner notes.
  const album = await api<{ tracks: AlbumTrack[] }>(request, "GET", "/api/album");
  const byCap = (c: string) => album.tracks.find((t) => t.capstoneId === c);
  for (const c of ["C0", "C1", "C2"]) expect(byCap(c), `${c} is on the album`).toBeTruthy();
  await page.goto("/album");
  await expect(page.getByTestId("album-meta")).toContainText(/\d+ tracks/, { timeout: 60_000 });
  for (const c of ["C0", "C1", "C2"]) {
    const t = byCap(c) as AlbumTrack;
    const row = page.locator(`[data-track="${t.id}"]`);
    await expect(row).toContainText(t.title);
    await expect(row.locator("svg").first()).toBeVisible();
    await row.getByRole("button", { name: "Liner notes" }).click();
    await expect(row.getByTestId("liner-notes")).toBeVisible();
  }
  await shootAll(page, "w4-journey-album");

  // C2's track: the recording, the liner notes with the learner's line, and a review kept with version 1.
  const c2 = byCap("C2") as AlbumTrack;
  expect(c2.title).toBe("Loop, Then Land");
  await page.goto(`/album/${c2.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Loop, Then Land" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("track-audio")).toBeVisible();
  await expect(page.getByTestId("liner-notes").first()).toContainText("Six bars of the loop, then home.");
  let detail = await api<TrackDetail>(request, "GET", `/api/album/tracks/${c2.id}`);
  if (!detail.versions[0]?.review) {
    // The review asked for before the release belongs to the capstone thread: ask for one of this version.
    await page.getByTestId("track-request-review").click();
    await expect(page.getByTestId("track-review").getByTestId("review-card")).toBeVisible({
      timeout: 90_000,
    });
    detail = await api<TrackDetail>(request, "GET", `/api/album/tracks/${c2.id}`);
  }
  expect(detail.versions[0]?.review, "a review is kept with version 1").toBeTruthy();
  await expect(page.getByTestId("track-review")).toBeVisible();
  await shootAll(page, "w4-journey-c2-track");

  // C1's track (the Wave 4 gate: C1 and C2 on the album with reviews): a review asked for on the track page is kept
  // with its version and shown there.
  const c1 = byCap("C1") as AlbumTrack;
  await page.goto(`/album/${c1.id}`);
  await expect(page.getByRole("heading", { level: 1, name: c1.title })).toBeVisible({ timeout: 30_000 });
  let c1Detail = await api<TrackDetail>(request, "GET", `/api/album/tracks/${c1.id}`);
  const c1Latest = () => c1Detail.versions[c1Detail.versions.length - 1];
  if (!c1Latest()?.review) {
    await page.getByTestId("track-request-review").click();
    await expect(page.getByTestId("track-review").getByTestId("review-card")).toBeVisible({
      timeout: 90_000,
    });
    c1Detail = await api<TrackDetail>(request, "GET", `/api/album/tracks/${c1.id}`);
  }
  expect(c1Latest()?.review, "a review is kept with C1's latest version").toBeTruthy();
  await expect(page.getByTestId("track-review")).toBeVisible();
  expectClean(w);
  await resetClock(request);
});

test("X1 over its three sessions on Aura Lee: phrases by ear, then the chords bass first, then the release", async ({
  page,
  request,
}) => {
  test.setTimeout(270_000);
  await resetClock(request);
  await seed(request, "X1 open");
  await noHmr(page);
  await setUiPrefs(page, { theme: "bark", motion: "off" });
  const w = watch(page);
  const l = auraLee.answerKey.layers as Record<string, string>;
  const melody = `setcpm(${auraLee.bpm}/4)\n\nmel: ${l.melody}.s("piano")`;
  const whole = `${melody}\nbass: ${l.bass}.s("piano")\nchords: ${l.chords}.s("piano")`;
  const check = async (id: string) => {
    const row = page.locator(`[data-check="${id}"]`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByTestId("check-phrase").click();
    await expect(row).toHaveAttribute("data-state", "passed", { timeout: 60_000 });
  };

  // Day 1, X1.S1: the song chosen, phrases 1 and 2 heard and written.
  await capstoneDay(page, "X1 Folk Transcription · session 1 of 3", "X1.S1");
  const start = page.getByRole("button", { name: "Start session 1 of 3" });
  const ws = page.getByTestId("capstone-workspace");
  await expect(ws.or(start)).toBeVisible({ timeout: 60_000 });
  if (await start.isVisible()) {
    await page.getByRole("radiogroup", { name: "The song" }).getByRole("radio", { name: "Aura Lee" }).click();
    await start.click();
  }
  await expect(ws).toHaveAttribute("data-kind", "transcribe", { timeout: 60_000 });
  await expect(page.getByTestId("x1-song")).toContainText("Aura Lee");
  await setCapstoneCode(page, "X1", melody);
  for (const id of ["phrase-1", "phrase-2"]) await check(id);
  await page.getByTestId("finish-session").click();
  await doneForToday(page);

  // Day 2, X1.S2: from the top, phrases 3 and 4.
  await advanceDays(request, 1);
  await capstoneDay(page, "X1 Folk Transcription · session 2 of 3", "X1.S2");
  await resume(page, "Session 2 of 3");
  await expect(page.getByTestId("capstone-workspace")).toHaveAttribute("data-kind", "transcribe");
  for (const id of ["phrase-3", "phrase-4"]) await check(id);
  await page.getByTestId("finish-session").click();
  await doneForToday(page);

  // Day 3, X1.S3: the chords, bass first; then the release with a recorded take.
  await advanceDays(request, 1);
  await capstoneDay(page, "X1 Folk Transcription · session 3 of 3", "X1.S3");
  await resume(page, "Session 3 of 3");
  await setCapstoneCode(page, "X1", whole);
  const s3 = (await sessionsOf(request, "X1")).sessions.find((s) => s.capstoneSessionId === "X1.S3");
  const stageIds = (s3?.checks ?? []).filter((c) => c.stage).map((c) => `${c.checkId}.${c.stage}`);
  expect(stageIds.map((s) => s.split(".").pop())).toEqual(["bass", "quality", "rn"]);
  // Each stage opens only after the one before has passed.
  await expect(page.locator(`[data-check="${stageIds[1]}"]`)).toHaveAttribute("data-state", "locked");
  for (const id of stageIds) await check(id);
  await shootAll(page, "w4-journey-x1-s3");
  const release = page.getByTestId("release");
  await expect(release).toBeEnabled({ timeout: 30_000 });
  await release.click();
  const dialog = page.getByRole("dialog", { name: /Release/ });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByTestId("release-liner")).toContainText("Aura Lee");
  await dialog.getByTestId("record-take").click();
  await expect(dialog.getByTestId("take-audio")).toBeVisible({ timeout: 90_000 });
  await dialog.getByTestId("confirm-release").click();
  const ceremony = page.getByTestId("release-ceremony");
  await expect(ceremony).toBeVisible({ timeout: 30_000 });
  await ceremony.getByRole("button", { name: "Continue to the coda" }).click();
  await page.waitForURL(/\/session\/coda$/);
  await expect(page.getByTestId("coda-release")).toContainText("joins your album", { timeout: 30_000 });
  await doneForToday(page);
  expect((await sessionsOf(request, "X1")).sessions.map((s) => s.status)).toEqual(["done", "done", "done"]);

  const album = await api<{ tracks: AlbumTrack[] }>(request, "GET", "/api/album");
  const x1 = album.tracks.find((t) => t.capstoneId === "X1") as AlbumTrack;
  expect(x1).toBeTruthy();
  await page.goto(`/album/${x1.id}`);
  await expect(page.getByTestId("track-audio")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("liner-notes").first()).toContainText("Aura Lee");
  expectClean(w);
  await resetClock(request);
});
