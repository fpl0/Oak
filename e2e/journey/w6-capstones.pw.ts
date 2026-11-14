// Wave 6 journeys (d: C6), (f: CF-T), (g: C7), (h: CF-A) and (i: the end of the core): the capstone sessions as
// daily sessions on the real stack (real server, real content, the scripted fake tutor, Chrome's fake microphone),
// ONE session per test, each from the dev seed of its own day (wave6.md §6): Today names the session, Start, the
// warm-up reported skipped, the workspace inside the session, the session's work, then the Coda and "Done for
// today". The pieces are the capstone suite's own (app/src/capstone/e2e/w6-pieces.ts, graded against the briefs
// with the real grader in grade/capstone-wave6.test.ts); CF-T is written from the chosen standard's answer key. What
// each checklist row says is the capstone suite's (w6-c6-c7, w6-cf-t, w6-cf-a); here the days are walked.
//   (d) C6 Modal Vamp: "C6 open" (S1, the vamp), "after C6.S1" (S2, sixteen bars; released).
//   (f) CF-T Standard Transcription, each session in the transcription slot: "CF-T open (U15.L01 done)" (S1, the
//       form map, then the bass; the Coda says when the standard comes back), "after U15.L03" (S2, the changes),
//       "after U16.L01" (S3, the tune), "after U16.L05" (S4, arranged by the song's sections; reviewed; released).
//   (g) C7 Chromatic Colour: "C7 open" (S1), "after C7.S1" (S2), "C7.S2 done" (S3, the lift; reviewed; released).
//   (h) CF-A Album Single: "CF-A open" (S1, the plan), "after CF-A.S1" (S2, four devices), "after CF-A.S2" (S3,
//       the tunes and the bridge), "CF-A.S3 done" (S4: over two minutes, mastered, reviewed, released with a take
//       recorded in real time — the suite's one real CF-A take, d9).
//   (i) the same S4 day goes on: the last Coda of the core (the finale: the record of twelve tracks, what the
//       learner can now do, the Oak, what is open), the album of twelve tracks, and Today the day after.
// Every test but (h, i) S4 runs well under the suite's 90-second guide; that one records the 2:14 single in real
// time (CF-A's brief asks for a song of two minutes or more, and its take is the whole song).
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { seedTake } from "../../app/src/capstone/e2e/seeded-take.ts";
import {
  C6_SHORT,
  C6_VAMP,
  C7_FULL,
  C7_NO_LIFT,
  CF_A_LIFTED,
  CF_A_PLAN,
  CF_A_SINGLE,
} from "../../app/src/capstone/e2e/w6-pieces.ts";
import { arranged, type Song, songOf } from "../../app/src/capstone/e2e/w6-support.ts";
import { fakeMic } from "../../app/src/onboarding/e2e/helpers.ts";
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

const statuses = async (request: APIRequestContext, cap: string) =>
  (await api<Sessions>(request, "GET", `/api/capstones/${cap}/sessions`)).sessions.map((s) => s.status);

async function begin(
  page: Page,
  request: APIRequestContext,
  point: string,
  theme: "paper" | "bark" = "paper",
): Promise<Watch> {
  await resetClock(request);
  await api(request, "POST", "/api/dev/seed", { point });
  await noHmr(page);
  await setUiPrefs(page, { theme, motion: "off" });
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

/**
 * Into the workspace: the first session's Start page (the song or the start chosen first), or a later session's
 * resume card (the draft from the top), or its Start card when the day before left no draft.
 */
async function intoWorkspace(page: Page, n: number, of: number, choose?: () => Promise<void>): Promise<void> {
  const ws = page.getByTestId("capstone-workspace");
  const start = page.getByRole("button", { name: new RegExp(`^(Start|Continue) session ${n} of ${of}$`) });
  const resume = page.getByTestId("resume-continue");
  await expect(ws.or(start).or(resume).first()).toBeVisible({ timeout: 60_000 });
  if (await resume.isVisible().catch(() => false)) {
    await expect(page.getByTestId("capstone-resume")).toContainText(`Session ${n} of ${of}`);
    await expect(resume).toBeFocused();
    await page.keyboard.press("Enter");
  } else if (await start.isVisible().catch(() => false)) {
    await choose?.();
    await start.focus();
    await page.keyboard.press("Enter");
  }
  await expect(ws).toBeVisible({ timeout: 60_000 });
}

/** Finishes a session that does not release: saved, finished, the Coda (`inspect` reads it), "Done for today". */
async function finishSession(page: Page, inspect?: () => Promise<void>): Promise<void> {
  await expect(page.getByTestId("saved-state")).toContainText(/Version \d+ saved/, { timeout: 30_000 });
  await page.getByTestId("finish-session").click();
  await page.waitForURL(/\/session\/coda$/, { timeout: 60_000 });
  await expect(page.getByTestId("coda-title")).toBeVisible({ timeout: 30_000 });
  await inspect?.();
  await doneForToday(page);
}

async function checkAllMet(page: Page): Promise<void> {
  await expect(page.getByTestId("req-count")).toHaveText(/^(\d+) of \1 met$/, { timeout: 90_000 });
  await page.getByTestId("check-track").click();
  await expect(page.getByRole("status").filter({ hasText: /every requirement is met/ })).toBeVisible({
    timeout: 60_000,
  });
}

async function review(page: Page, o: { revisions?: number; strengths?: number }): Promise<void> {
  await page.getByTestId("request-review").click();
  const r = page.getByTestId("review-summary");
  await expect(r).toBeVisible({ timeout: 60_000 });
  await expect(r).toContainText("Claude's comments never affect pass or fail.");
  if (o.revisions !== undefined) await expect(r.locator("[data-revision]")).toHaveCount(o.revisions);
  if (o.strengths !== undefined)
    await expect(r.getByTestId("review-strengths").locator(":scope > li")).toHaveCount(o.strengths);
}

/**
 * The release dialog with a take (seeded: a take of the same window given to the recorder at once; real: the whole
 * piece recorded in real time), then the ceremony and on to the Coda.
 */
async function releaseToCoda(
  page: Page,
  title: string,
  liner: string,
  take: { kind: "seeded" } | { kind: "real"; ms: number },
): Promise<void> {
  const btn = page.getByTestId("release");
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  await btn.click();
  const dialog = page.getByRole("dialog", { name: /Release to the album|Release a new version/ });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel(/One line for the liner notes/).fill(liner);
  if (take.kind === "seeded") await seedTake(page);
  await dialog.getByTestId("record-take").click();
  await expect(dialog.getByTestId("take-audio")).toBeVisible({
    timeout: take.kind === "real" ? take.ms : 60_000,
  });
  await dialog.getByTestId("confirm-release").click();
  const ceremony = page.getByTestId("release-ceremony");
  await expect(ceremony).toBeVisible({ timeout: 30_000 });
  await ceremony.getByRole("button", { name: "Continue to the coda" }).click();
  await page.waitForURL(/\/session\/coda$/);
  await expect(page.getByTestId("coda-release")).toBeVisible({ timeout: 30_000 });
}

async function onAlbum(request: APIRequestContext, cap: string, title: string): Promise<AlbumTrack> {
  const album = await api<{ tracks: AlbumTrack[] }>(request, "GET", "/api/album");
  const t = album.tracks.find((x) => x.capstoneId === cap);
  expect(t, `${cap} is on the album`).toBeTruthy();
  expect(t?.title).toBe(title);
  return t as AlbumTrack;
}

// --- (d) C6 Modal Vamp ---------------------------------------------------------------------------------------

test("(d) C6 session 1 as a day: eight bars of the Mixolydian vamp, the session finished", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const w = await begin(page, request, "C6 open");
  await capstoneDay(page, "C6 Modal Vamp · session 1 of 2", "C6.S1");
  await intoWorkspace(page, 1, 2);
  await setCapstoneCode(page, "C6", C6_SHORT);
  await finishSession(page);
  expect(await statuses(request, "C6")).toEqual(["done", "open"]);
  expectClean(w);
});

test("(d) C6 session 2 as a day: sixteen bars meet the brief; released; the Coda names the album", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const w = await begin(page, request, "after C6.S1", "bark");
  await capstoneDay(page, "C6 Modal Vamp · session 2 of 2", "C6.S2");
  await intoWorkspace(page, 2, 2);
  await setCapstoneCode(page, "C6", C6_VAMP);
  await checkAllMet(page);
  await releaseToCoda(page, "Seven Flat", "G Mixolydian: the ♭7 on the strong beats.", { kind: "seeded" });
  await expect(page.getByTestId("coda-release")).toContainText("joins your album");
  await doneForToday(page);
  expect(await statuses(request, "C6")).toEqual(["done", "done"]);
  await onAlbum(request, "C6", "Seven Flat");
  expectClean(w);
});

// --- (f) CF-T Standard Transcription, in the transcription slots --------------------------------------------

/** Today on a CF-T slot day: the slot heading, the standard's session; then the session to its workspace. */
async function cftDay(page: Page, n: number): Promise<Song> {
  await capstoneDay(page, `Standard Transcription · session ${n} of 4`, `CF-T.S${n}`);
  await intoWorkspace(page, n, 4, async () => {
    await page.getByRole("radiogroup", { name: "The song" }).getByRole("radio").first().click();
  });
  await expect(page.getByTestId("capstone-workspace")).toHaveAttribute("data-kind", "transcribe");
  const id = await page.getByTestId("song-source").getAttribute("data-song", { timeout: 60_000 });
  return songOf(String(id));
}

async function cftSlotOnToday(page: Page, request: APIRequestContext, n: number): Promise<void> {
  const plan = await api<{ kind: string; mapItemId: string; slot: { fills: string } | null }>(
    request,
    "GET",
    "/api/session/today",
  );
  expect(plan).toMatchObject({ kind: "capstone", mapItemId: `CF-T.S${n}`, slot: { fills: "cf-t" } });
  await today(page);
  await expect(page.getByTestId("cft-day")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Transcription slot: your standard" })).toBeVisible();
}

async function passRows(page: Page, layer: string): Promise<void> {
  const rows = page.getByTestId("x1-checks").locator(`[data-check^="${layer}-"]`);
  await expect(rows).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const row = rows.nth(i);
    await expect(row).not.toHaveAttribute("data-state", "passed");
    await row.getByTestId("check-phrase").click();
    await expect(row).toHaveAttribute("data-state", "passed", { timeout: 60_000 });
  }
}

const tempo = (s: Song) => `setcpm(${s.bpm}/4)`;

test("(f) CF-T session 1 in the transcription slot: the form map, then the bass; the Coda says when the standard comes back", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const w = await begin(page, request, "CF-T open (U15.L01 done)");
  await cftSlotOnToday(page, request, 1);
  const song = await cftDay(page, 1);
  const sections = song.answerKey.sections ?? [];
  expect(sections.length).toBe(4);
  // The form map first: the song's own sections, by their first bars and letters.
  const map = page.getByTestId("cft-form-map");
  await expect(map).toBeVisible({ timeout: 30_000 });
  for (const s of sections.slice(1))
    await map.locator(`[data-testid="form-line"][data-bar="${s.bars[0]}"]`).click();
  await expect(map.getByTestId("form-section")).toHaveCount(sections.length);
  for (const [i, s] of sections.entries()) {
    await map.getByTestId("form-section").nth(i).click();
    await page.keyboard.press(s.label);
  }
  await map.getByTestId("cft-form-check").click();
  await expect(map.getByTestId("cft-form-state")).toHaveAttribute("data-state", "passed", {
    timeout: 30_000,
  });
  // The draft is written from the map (one const per section); then the bass, section by section.
  await expect(page.locator(".cm-content").first()).toContainText("bass: arrange(", { timeout: 30_000 });
  await setCapstoneCode(page, "CF-T", `${tempo(song)}\n\nbass: ${song.answerKey.layers.bass}`);
  await passRows(page, "bass");
  await shootAll(page, "w6-journey-cft-s1");
  await finishSession(page, async () => {
    await expect(page.getByTestId("coda-cft-after")).toHaveText(
      "Your standard goes on in your next transcription slot, about five sessions from now, or any day from Today: session 2 of 4, the changes.",
    );
  });
  expect(await statuses(request, "CF-T")).toEqual(["done", "open", "locked", "locked"]);
  expectClean(w);
});

test("(f) CF-T session 2 in the next transcription slot: the changes", async ({ page, request }) => {
  test.setTimeout(90_000);
  const w = await begin(page, request, "after U15.L03", "bark");
  await cftSlotOnToday(page, request, 2);
  const song = await cftDay(page, 2);
  const l = song.answerKey.layers;
  await setCapstoneCode(page, "CF-T", `${tempo(song)}\n\nbass: ${l.bass}\nchords: ${l.chords}`);
  await passRows(page, "changes");
  await finishSession(page);
  expect((await statuses(request, "CF-T")).slice(0, 2)).toEqual(["done", "done"]);
  expectClean(w);
});

test("(f) CF-T session 3 in the next transcription slot: the tune", async ({ page, request }) => {
  test.setTimeout(90_000);
  const w = await begin(page, request, "after U16.L01");
  await cftSlotOnToday(page, request, 3);
  const song = await cftDay(page, 3);
  const l = song.answerKey.layers;
  await setCapstoneCode(
    page,
    "CF-T",
    `${tempo(song)}\n\nbass: ${l.bass}\nchords: ${l.chords}\nmelody: ${l.melody}`,
  );
  await passRows(page, "melody");
  await finishSession(page);
  expect((await statuses(request, "CF-T")).slice(0, 3)).toEqual(["done", "done", "done"]);
  expectClean(w);
});

test("(f) CF-T session 4 in the last transcription slot: arranged by the song's sections, reviewed, released", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const w = await begin(page, request, "after U16.L05", "bark");
  await cftSlotOnToday(page, request, 4);
  const song = await cftDay(page, 4);
  const l = song.answerKey.layers;
  const sections = song.answerKey.sections ?? [];
  const groove = 's("bd ~ bd ~, ~ sd ~ sd, rd*8").gain(.4)';
  const drums = {
    consts: [...new Set(sections.map((x) => x.label))].map((x) => `const drums${x} = ${groove}`),
    track: `drums: arrange(${sections.map((x) => `[${x.bars[1] - x.bars[0] + 1}, drums${x.label}]`).join(", ")})`,
  };
  const tracks = [
    drums,
    arranged("bass", l.bass as string, sections),
    arranged("chords", l.chords as string, sections),
    arranged("mel", l.melody as string, sections),
  ];
  await setCapstoneCode(
    page,
    "CF-T",
    [tempo(song), "", ...tracks.flatMap((t) => t.consts), "", ...tracks.map((t) => t.track)].join("\n"),
  );
  const rubric = page.getByTestId("session-rubric");
  await expect(rubric.locator('[data-rule="roles"]')).toHaveAttribute("data-state", "met", {
    timeout: 60_000,
  });
  await expect(rubric.locator('[data-rule="form"]')).toHaveAttribute("data-state", "met");
  await review(page, { revisions: 2 });
  await releaseToCoda(page, song.title, "Written down by ear: the form first, then the bass.", {
    kind: "seeded",
  });
  await expect(page.getByTestId("coda-release")).toContainText("joins your album");
  await doneForToday(page);
  expect(await statuses(request, "CF-T")).toEqual(["done", "done", "done", "done"]);
  await onAlbum(request, "CF-T", song.title);
  expectClean(w);
});

// --- (g) C7 Chromatic Colour ---------------------------------------------------------------------------------

test("(g) C7 session 1 as a day: verse and chorus with their colour chords", async ({ page, request }) => {
  test.setTimeout(90_000);
  const w = await begin(page, request, "C7 open");
  await capstoneDay(page, "C7 Chromatic Colour · session 1 of 3", "C7.S1");
  await intoWorkspace(page, 1, 3);
  await setCapstoneCode(page, "C7", C7_NO_LIFT);
  await finishSession(page);
  expect(await statuses(request, "C7")).toEqual(["done", "open", "locked"]);
  expectClean(w);
});

test("(g) C7 session 2 as a day: the draft from the top, the tune over it", async ({ page, request }) => {
  test.setTimeout(90_000);
  const w = await begin(page, request, "after C7.S1", "bark");
  await capstoneDay(page, "C7 Chromatic Colour · session 2 of 3", "C7.S2");
  await intoWorkspace(page, 2, 3);
  await setCapstoneCode(page, "C7", C7_NO_LIFT);
  await finishSession(page);
  expect(await statuses(request, "C7")).toEqual(["done", "done", "open"]);
  expectClean(w);
});

test("(g) C7 session 3 as a day: the last chorus lifted a whole step, the key ribbon, reviewed, released", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const w = await begin(page, request, "C7.S2 done");
  await capstoneDay(page, "C7 Chromatic Colour · session 3 of 3", "C7.S3");
  await intoWorkspace(page, 3, 3);
  await setCapstoneCode(page, "C7", C7_FULL);
  await expect(page.getByTestId("key-ribbon").first()).toBeVisible({ timeout: 60_000 });
  await checkAllMet(page);
  await review(page, { revisions: 2 });
  await shootAll(page, "w6-journey-c7-s3");
  await releaseToCoda(page, "Up a Step", "The last chorus climbs a whole step.", { kind: "seeded" });
  await expect(page.getByTestId("coda-release")).toContainText("joins your album");
  await doneForToday(page);
  expect(await statuses(request, "C7")).toEqual(["done", "done", "done"]);
  await onAlbum(request, "C7", "Up a Step");
  expectClean(w);
});

// --- (h) CF-A Album Single, and (i) the end of the core ----------------------------------------------------------

test("(h) CF-A session 1 as a day: the plan, verse, chorus and bridge at full length", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const w = await begin(page, request, "CF-A open");
  await capstoneDay(page, "Album Single · session 1 of 4", "CF-A.S1");
  await intoWorkspace(page, 1, 4, async () => {
    await page.getByTestId("single-start").getByRole("radio", { name: "The plan" }).click();
  });
  await setCapstoneCode(page, "CF-A", CF_A_PLAN);
  await expect(page.getByTestId("form-length")).toHaveAttribute("data-ok", "true", { timeout: 60_000 });
  await finishSession(page);
  expect(await statuses(request, "CF-A")).toEqual(["done", "open", "locked", "locked"]);
  expectClean(w);
});

test("(h) CF-A session 2 as a day: the harmony reaches four devices", async ({ page, request }) => {
  test.setTimeout(90_000);
  const w = await begin(page, request, "after CF-A.S1", "bark");
  await capstoneDay(page, "Album Single · session 2 of 4", "CF-A.S2");
  await intoWorkspace(page, 2, 4);
  await setCapstoneCode(page, "CF-A", CF_A_LIFTED);
  await expect(page.getByTestId("device-count")).toHaveText("4 of 6", { timeout: 60_000 });
  await finishSession(page);
  expect((await statuses(request, "CF-A")).slice(0, 2)).toEqual(["done", "done"]);
  expectClean(w);
});

test("(h) CF-A session 3 as a day: the tunes and the bridge", async ({ page, request }) => {
  test.setTimeout(90_000);
  const w = await begin(page, request, "after CF-A.S2");
  await capstoneDay(page, "Album Single · session 3 of 4", "CF-A.S3");
  await intoWorkspace(page, 3, 4);
  await setCapstoneCode(page, "CF-A", CF_A_SINGLE);
  await expect(page.getByTestId("device-count")).toHaveText("5 of 6", { timeout: 60_000 });
  await finishSession(page);
  expect((await statuses(request, "CF-A")).slice(0, 3)).toEqual(["done", "done", "done"]);
  expectClean(w);
});

test("(h, i) CF-A session 4: over two minutes, mastered, reviewed, released with a real take; the last Coda of the core; twelve tracks; Today the day after", async ({
  page,
  request,
}) => {
  // A real-time take: the single is 56 bars at 100 bpm, 2:14, recorded whole (d9: the suite's one CF-A take).
  test.setTimeout(330_000);
  const w = await begin(page, request, "CF-A.S3 done");
  await capstoneDay(page, "Album Single · session 4 of 4", "CF-A.S4");
  await intoWorkspace(page, 4, 4);
  await setCapstoneCode(page, "CF-A", CF_A_SINGLE);
  await expect(page.getByTestId("form-length")).toHaveAttribute("data-ok", "true", { timeout: 60_000 });
  await checkAllMet(page);
  // Mastered: the limiter is measured on the real master bus while the single plays (a few seconds of real time).
  const master = page.getByTestId("master-card");
  await expect(master).toBeVisible();
  await master.getByRole("tab", { name: /The limiter/ }).click();
  await page.getByRole("button", { name: /^Play/ }).first().click();
  await master.getByTestId("master-measure").click();
  await expect(master.getByTestId("master-measure")).toHaveText("Stop measuring", { timeout: 30_000 });
  await page.waitForTimeout(3_000);
  await master.getByTestId("master-measure").click();
  await expect(master.getByTestId("master-reading")).toHaveAttribute(
    "data-limiter",
    /resting|touching|working/,
    {
      timeout: 30_000,
    },
  );
  await page.getByRole("button", { name: /^Stop/ }).first().click();
  await review(page, { strengths: 3 });
  await shootAll(page, "w6-journey-cfa-s4");
  await releaseToCoda(
    page,
    "The Long Way Round",
    "Verse, chorus, a borrowed bridge, and the last chorus up.",
    {
      kind: "real",
      ms: 200_000,
    },
  );

  // (i) The last Coda of the core: the finale, in its four parts; the record of twelve tracks, the single last.
  await expect(page.getByTestId("coda-finale")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("finale-heading")).toHaveText("You finished the core. Side A is complete.");
  const covers = page.getByTestId("finale-record").locator("[data-cover]");
  await expect(covers).toHaveCount(12);
  await expect(covers.last()).toHaveAttribute("data-cover", "CF-A");
  await expect(page.getByTestId("finale-cando").locator("[data-cando]").first()).toBeVisible();
  await expect(page.getByTestId("finale-oak").locator("svg").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("finale-tomorrow")).toHaveText(/^Tomorrow: /);
  await expect(page.locator("main")).not.toContainText(/final exam|countdown/i);
  await shootAll(page, "w6-journey-ending-coda");
  await doneForToday(page);
  const completion = await api<{ stage: string; album: { released: number; total: number } }>(
    request,
    "GET",
    "/api/course/completion",
  );
  expect(completion).toMatchObject({ stage: "complete", album: { released: 12, total: 12 } });

  // The single on the album: its recording is the whole song.
  const single = await onAlbum(request, "CF-A", "The Long Way Round");
  const detail = await api<{ versions: { hasAudio: boolean; durationS: number | null }[] }>(
    request,
    "GET",
    `/api/album/tracks/${single.id}`,
  );
  expect(detail.versions[0]?.hasAudio).toBe(true);
  expect(detail.versions[0]?.durationS ?? 0).toBeGreaterThanOrEqual(120);
  await page.goto("/album");
  await expect(page.getByTestId("album-meta")).toContainText("12 tracks", { timeout: 60_000 });
  await shootAll(page, "w6-journey-album-twelve");

  // The day after: an ordinary day with one line back to the record.
  await advanceDays(request, 1);
  await today(page);
  await expect(page.getByTestId("first-day")).toHaveText("Side A is complete. Play it.", { timeout: 20_000 });
  await expect(page.getByTestId("start-session")).toBeVisible();
  await expect(page.getByTestId("open-to-you")).toBeVisible();
  await shootAll(page, "w6-journey-today-after-core");
  expectClean(w);
  await resetClock(request);
});
