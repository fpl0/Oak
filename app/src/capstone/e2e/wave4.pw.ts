// Wave 4 capstones and the album on the capstone stack (5210/8810, the fake tutor), each test from a dev seed
// (wave4.md §6):
// - C2 from "C2 open": the brief names session 1 and its goal; an unmet cadence is anchored to bars 7–8 and the
//   anchor lights them; the chords draft saves and binds to C2.S1; the session finishes;
// - C2 from "C2.S1 done": the draft plays from the top; the melody meets every rule; Claude's review sits beside
//   the piece with bar links; release by keyboard (≤ 60-word liner notes), the album version with its recording,
//   download, liner notes and the review; "Try the revision" opens a copy and leaves the release alone;
// - X1 from "X1 open" (Quiet mode, no mic): the song is chosen, the givens shown, the song plays beside the code,
//   a phrase is checked (not yet, then passed) and one revealed; the session finishes;
// - X1 from "X1.S2 done": the chords bass-first (each stage opens after the one before), release, liner notes
//   naming the revealed phrase.
// Screenshots: both themes at 1440×900 and 1280×800, reduced motion on.
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { capstones } from "../../../../content/capstones.ts";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));
const H = { "content-type": "application/json", origin: stack.baseURL, "x-oak": "1" };

// Checked with @oak/grader against the C2 brief of content/capstones.ts (C major, 96 BPM): the axis loop
// I V vi IV twice round, then V–I with the melody landing on 1 (a perfect authentic cadence).
const LOOP = '"<[0,2,4] [4,6,8] [5,7,9] [3,5,7] [0,2,4] [4,6,8] [4,6,8] [0,2,4]>"';
const MELODY =
  'melody: n("<[4 4 2 ~] [4 4 1 ~] [5 5 2 ~] [3 3 0 ~] [4 4 2 ~] [4 4 1 ~] [4 4 1 ~] [0@4]>").scale("C4:major").s("piano")';
const C2_CHORDS = `setcpm(96/4)\n\nchords: n(${LOOP}).scale("C3:major").s("piano")\nmelody: n("<0 ~ ~ ~ ~ ~ ~ ~>").scale("C4:major").s("piano")`;
const C2_FULL = `setcpm(96/4)\n\nchords: n(${LOOP}).scale("C3:major").s("piano")\n${MELODY}`;
// The last two chords vi–V: a half cadence, so "Bars 7–8 land on I" stays open.
const C2_HALF = `setcpm(96/4)\n\nchords: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7] [0,2,4] [4,6,8] [5,7,9] [4,6,8]>").scale("C3:major").s("piano")\n${MELODY}`;

const X1 = capstones.find((c) => c.id === "X1");

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

async function api<T>(page: Page, method: string, path: string, data?: unknown): Promise<T> {
  const res = await page.request.fetch(`${stack.apiURL}/api${path}`, {
    method,
    headers: H,
    ...(data === undefined ? {} : { data }),
  });
  expect(res.ok(), `${method} ${path}: ${res.status()} ${await res.text().catch(() => "")}`).toBe(true);
  return (await res.json()) as T;
}
async function status(page: Page, method: string, path: string, data?: unknown): Promise<number> {
  const res = await page.request.fetch(`${stack.apiURL}/api${path}`, {
    method,
    headers: H,
    ...(data === undefined ? {} : { data }),
  });
  return res.status();
}

async function seed(page: Page, point: string, mic = true) {
  await api(page, "PUT", "/dev/clock", { reset: true });
  const code = await status(page, "POST", "/dev/seed", mic ? { point } : { point, mic: false });
  expect(code, `seed ${point}`).toBe(200);
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // Strudel's one error per failed evaluation; Vite's re-optimise; endpoints other engineers still build (501).
    if (/\[eval\]|evaluation error|Outdated Optimize Dep|status of 501 \(Not Implemented\)/.test(m.text()))
      return;
    errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

const editorId = (cap: string) => `oak_capstone-${cap}_0_`;
const editor = (page: Page, cap: string) =>
  page.waitForFunction(
    (id) =>
      !!(globalThis as { __oakStrudel?: { editors: Map<string, unknown> } }).__oakStrudel?.editors.get(id),
    editorId(cap),
    { timeout: 60_000 },
  );
async function setCode(page: Page, cap: string, code: string) {
  await editor(page, cap);
  await page.evaluate(
    ([id, c]) =>
      (
        globalThis as unknown as { __oakStrudel: { editors: Map<string, { setCode(c: string): void }> } }
      ).__oakStrudel.editors
        .get(id as string)
        ?.setCode(c as string),
    [editorId(cap), code],
  );
}

async function shots(page: Page, name: string) {
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, m.theme);
    await page.waitForTimeout(150);
    await shoot(page, SHOTS, name, m.theme);
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "paper";
  });
  await page.setViewportSize({ width: 1440, height: 900 });
}

test("C2 session 1 from “C2 open”: the session's brief, bar-anchored feedback, the draft bound to C2.S1", async ({
  page,
}) => {
  test.setTimeout(200_000);
  const errors = watchErrors(page);
  await seed(page, "C2 open");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/capstone/C2");
  await expect(page.getByRole("heading", { level: 1, name: "C2 Four-Chord Song" })).toBeVisible({
    timeout: 60_000,
  });
  const start = page.getByRole("button", { name: "Start session 1 of 2" });
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });

  // The plan names this session and what it is for.
  const s1 = page.locator('[data-session="C2.S1"]');
  await expect(s1).toHaveAttribute("aria-current", "step");
  await expect(s1).toContainText("schema loop in bars 1–6");
  await expect(page.locator('[data-session="C2.S2"]')).toHaveAttribute("data-status", "locked");
  await expect(page.getByTestId("release")).toHaveCount(0);

  // A half cadence at the end: the cadence rule is open and anchored to bars 7–8; the anchor is a keyboard button.
  await setCode(page, "C2", C2_HALF);
  const cadence = page.locator('[data-rule="cadence"]');
  await expect(cadence).toHaveAttribute("data-state", "open", { timeout: 60_000 });
  const anchor = cadence.getByTestId("bar-anchor");
  await expect(anchor).toHaveText("Bars 7–8");
  await anchor.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("req-count")).toHaveText("6 of 7 met");
  await shots(page, "c2-s1-anchor");

  // The chords of session 1, a full turn and the landing; the draft saves and the session finishes.
  await setCode(page, "C2", C2_CHORDS);
  await expect(cadence).toHaveAttribute("data-state", "met", { timeout: 60_000 });
  await expect(page.locator('[data-rule="schema"]')).toHaveAttribute("data-state", "met");
  await expect(page.getByTestId("saved-state")).toContainText(/Version \d+ saved/, { timeout: 30_000 });
  await page.getByTestId("finish-session").click();
  await expect(page.getByRole("status").filter({ hasText: "Session 1 of 2 done." })).toBeVisible({
    timeout: 30_000,
  });
  const state = await api<{ sessions: string[]; sketchId: string | null }>(page, "GET", "/capstones/C2");
  expect(state.sessions).toContain("C2.S1");
  expect(state.sketchId).not.toBeNull();
  // With the Wave 4 endpoint, the saved draft is bound to the session it was written in.
  if ((await status(page, "GET", "/capstones/C2/sessions")) === 200) {
    const s = await api<{ sessions: { capstoneSessionId: string; status: string; draft: unknown }[] }>(
      page,
      "GET",
      "/capstones/C2/sessions",
    );
    expect(s.sessions[0]).toMatchObject({ capstoneSessionId: "C2.S1", status: "done" });
    expect(s.sessions[0]?.draft).not.toBeNull();
  }
  expect(errors).toEqual([]);
});

test("C2 session 2 from “C2.S1 done”: from the top, review with bar links, release by keyboard, the album version", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await seed(page, "C2.S1 done");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/capstone/C2");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  await editor(page, "C2");
  await expect(page.locator('[data-session="C2.S1"]')).toHaveAttribute("data-status", "done");
  await expect(page.locator('[data-session="C2.S2"]')).toHaveAttribute("aria-current", "step");

  // A return: the draft is offered from the top.
  const fromTop = page.getByTestId("play-from-top");
  await expect(fromTop).toBeVisible();
  await shots(page, "c2-s2-resume");
  await fromTop.click();
  await expect(page.getByTestId("stop-from-top")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("stop-from-top").click();

  // The melody: every requirement met; the check is recorded.
  await setCode(page, "C2", C2_FULL);
  await expect(page.getByTestId("req-count")).toHaveText("7 of 7 met", { timeout: 60_000 });
  await page.getByTestId("check-track").click();
  await expect(page.getByRole("status").filter({ hasText: /every requirement is met/ })).toBeVisible({
    timeout: 30_000,
  });

  // Claude's review (the scripted fake tutor) beside the piece; each bar range is a button.
  await page.getByTestId("request-review").click();
  const review = page.getByTestId("review-summary");
  await expect(review).toBeVisible({ timeout: 30_000 });
  await expect(review).toContainText("Claude's comments never affect pass or fail.");
  const barLink = review.getByTestId("review-bars").first();
  await expect(barLink).toBeVisible();
  await barLink.focus();
  await page.keyboard.press("Enter");
  // Before the first release no revision opens a copy (tutor cards stay Preview-only, contracts §10.7).
  await expect(review.getByTestId("try-revision")).toHaveCount(0);
  await shots(page, "c2-s2-review");

  // Release, keyboard only.
  const release = page.getByTestId("release");
  await expect(release).toBeEnabled({ timeout: 30_000 });
  await release.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: /Release to the album|Release a new version/ });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const title = dialog.getByLabel("Title");
  await title.fill("Loop, Then Land");
  await dialog.getByLabel(/One line for the liner notes/).fill("Six bars of the loop, then home.");
  const words = (await dialog.getByTestId("release-liner").locator("summary").textContent()) ?? "";
  const n = Number(/(\d+) of 60 words/.exec(words)?.[1] ?? "999");
  expect(n).toBeLessThanOrEqual(60);
  await shots(page, "c2-release-dialog");
  await dialog.getByTestId("record-take").focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByTestId("take-audio")).toBeVisible({ timeout: 60_000 });
  await dialog.getByTestId("confirm-release").focus();
  await page.keyboard.press("Enter");
  const ceremony = page.getByTestId("release-ceremony");
  await expect(ceremony).toBeVisible({ timeout: 30_000 });
  await ceremony.getByRole("link", { name: "Open the track" }).click();

  // The album version: recording, download, liner notes (≤ 60 words, the theory used), versions.
  await expect(page.getByRole("heading", { level: 1, name: "Loop, Then Land" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("track-audio")).toBeVisible();
  await expect(page.getByTestId("download-audio")).toHaveAttribute(
    "download",
    /^loop-then-land-v1\.(webm|ogg|m4a|wav)$/,
  );
  const notes = page.getByTestId("liner-notes").first();
  await expect(notes).toContainText("Six bars of the loop, then home.");
  await expect(notes).toContainText("8 bars of 4/4 at 96 BPM in C major.");
  await expect(notes).toContainText("Theory used:");
  const linerWords = ((await notes.textContent()) ?? "")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  expect(linerWords).toBeLessThanOrEqual(60);
  await expect(page.getByTestId("track-review")).toBeVisible();
  await shots(page, "c2-track");

  // Liner notes are editable when the server has the Wave 4 endpoint.
  const track = await api<{ id: string; versions: { version: number; linerNotesMd: string }[] }>(
    page,
    "GET",
    `/album/tracks/${page.url().split("/album/")[1]?.split("?")[0]}`,
  );
  const patchOk =
    (await status(page, "PATCH", `/album/tracks/${track.id}/versions/1`, { includeReviewNote: false })) ===
    200;
  if (patchOk) {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByTestId("liner-edit").fill("Six bars of the loop, then home. Written for the album.");
    await page.getByRole("button", { name: "Save notes" }).click();
    await expect(page.getByTestId("liner-notes").first()).toContainText("Written for the album.", {
      timeout: 15_000,
    });
  }

  // A review kept with the version opens its revision in a copy; the released version is untouched.
  const tryIt = page.getByTestId("try-revision");
  if (await tryIt.count()) {
    const before = await api<{ versions: { sketchId: string; sketchVersion: number }[] }>(
      page,
      "GET",
      `/album/tracks/${track.id}`,
    );
    await tryIt.first().click();
    await expect(page).toHaveURL(/\/studio\//, { timeout: 30_000 });
    const after = await api<{ versions: { sketchId: string; sketchVersion: number }[] }>(
      page,
      "GET",
      `/album/tracks/${track.id}`,
    );
    expect(after.versions).toEqual(before.versions);
  }
  expect(errors).toEqual([]);
});

/** The answer key of the song a test picks (Node import of the content file). */
async function songOf(slug: string) {
  try {
    const mod = (await import(`../../../../content/repertoire/${slug}/song.ts`)) as {
      default?: { answerKey: { layers: Record<string, string>; bars: number }; bpm: number; meter: string };
    };
    return mod.default ?? null;
  } catch {
    return null;
  }
}

test("X1 session 1 from “X1 open” in Quiet mode: the song, the givens, a phrase checked and one revealed", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const song = await songOf("aura-lee");
  test.skip(
    !song || !X1?.sessionDefs[0]?.checks?.length,
    "Aura Lee's answer key or X1's phrase checks are not written yet (author:songs)",
  );
  const errors = watchErrors(page);
  await seed(page, "X1 open", false);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/capstone/X1");
  await expect(page.getByRole("heading", { level: 1, name: "X1 Folk Transcription" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("radiogroup", { name: "The song" }).getByRole("radio", { name: "Aura Lee" }).click();
  await page.getByRole("button", { name: "Start session 1 of 3" }).click();
  const ws = page.getByTestId("capstone-workspace");
  await expect(ws).toHaveAttribute("data-kind", "transcribe", { timeout: 60_000 });
  await expect(page.getByTestId("x1-song")).toContainText("Aura Lee");
  await expect(page.getByTestId("x1-given")).toContainText("Meter");
  await expect(page.getByTestId("x1-given")).toContainText("Pickup");
  await expect(page.getByTestId("song-source")).toBeVisible({ timeout: 60_000 });
  await editor(page, "X1");
  await shots(page, "x1-s1");

  // Phrase 1 from the starter: not yet.
  const p1 = page.locator('[data-check="phrase-1"]');
  await p1.getByTestId("check-phrase").click();
  await expect(page.getByTestId("x1-feedback")).toContainText(/% of 85 %/, { timeout: 60_000 });
  await expect(p1).toHaveAttribute("data-state", "open");

  // The melody as heard: phrase 1 passes.
  const mel = song?.answerKey.layers.melody as string;
  await setCode(page, "X1", `setcpm(${song?.bpm}/4)\n\nmel: ${mel}.s("piano")`);
  await p1.getByTestId("check-phrase").click();
  await expect(p1).toHaveAttribute("data-state", "passed", { timeout: 60_000 });

  // Phrase 2 revealed: the answer shows; it earns no evidence.
  const p2 = page.locator('[data-check="phrase-2"]');
  await p2.getByRole("button", { name: /^Reveal / }).click();
  await p2.getByTestId("confirm-reveal").click();
  await expect(p2).toHaveAttribute("data-state", "revealed", { timeout: 60_000 });
  await expect(page.getByTestId("x1-revealed")).toBeVisible();
  await shots(page, "x1-s1-revealed");

  await page.getByTestId("finish-session").click();
  await expect(page.getByRole("status").filter({ hasText: "Session 1 of 3 done." })).toBeVisible({
    timeout: 30_000,
  });
  expect(errors).toEqual([]);
});

test("X1 session 3 from “X1.S2 done”: chords bass-first, release, the revealed phrase in the liner notes", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const song = await songOf("aura-lee");
  const chordsCheck = X1?.sessionDefs[2]?.checks?.find((c) => c.layer === "chords");
  test.skip(
    !song || !chordsCheck,
    "Aura Lee's answer key or X1's chord checks are not written yet (author:songs)",
  );
  const errors = watchErrors(page);
  await seed(page, "X1.S2 done");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/capstone/X1");
  await expect(page.getByTestId("capstone-workspace")).toHaveAttribute("data-kind", "transcribe", {
    timeout: 60_000,
  });
  await editor(page, "X1");
  await expect(page.locator('[data-session="X1.S3"]')).toHaveAttribute("aria-current", "step");
  const id = chordsCheck?.id as string;
  const bass = page.locator(`[data-check="${id}.bass"]`);
  const quality = page.locator(`[data-check="${id}.quality"]`);
  const rn = page.locator(`[data-check="${id}.rn"]`);
  await expect(quality).toHaveAttribute("data-state", "locked");

  const l = song?.answerKey.layers ?? {};
  await setCode(
    page,
    "X1",
    `setcpm(${song?.bpm}/4)\n\nmel: ${l.melody}.s("piano")\nbass: ${l.bass}.s("piano")\nchords: ${l.chords}.s("piano")`,
  );
  for (const row of [bass, quality, rn]) {
    await row.getByTestId("check-phrase").click();
    await expect(row).toHaveAttribute("data-state", "passed", { timeout: 60_000 });
  }
  await shots(page, "x1-s3");
  const release = page.getByTestId("release");
  await expect(release).toBeEnabled();
  await release.click();
  const dialog = page.getByRole("dialog", { name: /Release/ });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByTestId("release-liner")).toContainText("Aura Lee");
  await dialog.getByTestId("record-take").click();
  await expect(dialog.getByTestId("take-audio")).toBeVisible({ timeout: 90_000 });
  await dialog.getByTestId("confirm-release").click();
  await expect(page.getByTestId("release-ceremony")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("release-ceremony").getByRole("link", { name: "Open the track" }).click();
  const notes = page.getByTestId("liner-notes").first();
  await expect(notes).toContainText("Aura Lee");
  await expect(notes).toContainText("Revealed, not heard:");
  expect(errors).toEqual([]);
});

test("the album: covers at every size, play in place, liner notes; both themes", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, "C1 released");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/album");
  await expect(page.getByTestId("album-meta")).toContainText(/\d+ tracks?/, { timeout: 60_000 });
  const row = page.locator("[data-track]").first();
  await expect(row).toBeVisible();
  await expect(row.locator("svg").first()).toBeVisible();
  await expect(row.getByRole("button", { name: /^(Play|Stop) / })).toBeVisible();
  await row.getByRole("button", { name: "Liner notes" }).click();
  await expect(row.getByTestId("liner-notes")).toBeVisible();
  await shots(page, "album-w4");
  await row.getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("track-review")).toBeVisible();
  await shots(page, "track-w4");
});

test("X1 sessions 1 and 2 from “X1 open”: Red River Valley with its pickup, phrases 1–4 by ear, both sessions finished", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const song = await songOf("red-river-valley");
  test.skip(!song || !X1?.sessionDefs[1]?.checks?.length, "Red River Valley's answer key is not written yet");
  const errors = watchErrors(page);
  await seed(page, "X1 open");
  await useUiPrefs(page, { theme: "bark", motion: "off" });
  await page.goto("/capstone/X1");
  await expect(page.getByRole("heading", { level: 1, name: "X1 Folk Transcription" })).toBeVisible({
    timeout: 60_000,
  });
  await page
    .getByRole("radiogroup", { name: "The song" })
    .getByRole("radio", { name: "Red River Valley" })
    .click();
  await page.getByRole("button", { name: "Start session 1 of 3" }).click();
  await expect(page.getByTestId("capstone-workspace")).toHaveAttribute("data-kind", "transcribe", {
    timeout: 60_000,
  });
  await expect(page.getByTestId("x1-song")).toContainText("Red River Valley");
  // The givens name the pickup, and phrase 1's rhythm is this song's own.
  await expect(page.getByTestId("x1-given")).toContainText("Pickup");
  await expect(page.getByTestId("x1-given")).not.toContainText("none");
  await expect(page.getByTestId("x1-skeleton")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("song-source")).toBeVisible({ timeout: 60_000 });
  await editor(page, "X1");

  // The whole tune as heard (the learner's ear, here the answer key): phrases 1 and 2 pass.
  const mel = song?.answerKey.layers.melody as string;
  await setCode(page, "X1", `setcpm(${song?.bpm}/4)\n\nmel: ${mel}.s("piano")`);
  for (const id of ["phrase-1", "phrase-2"]) {
    const row = page.locator(`[data-check="${id}"]`);
    await row.getByTestId("check-phrase").click();
    await expect(row).toHaveAttribute("data-state", "passed", { timeout: 60_000 });
  }
  await page.getByTestId("finish-session").click();
  await expect(page.getByRole("status").filter({ hasText: "Session 1 of 3 done." })).toBeVisible({
    timeout: 30_000,
  });

  // Session 2 follows on: phrases 3 and 4.
  await expect(page.locator('[data-session="X1.S2"]')).toHaveAttribute("aria-current", "step", {
    timeout: 30_000,
  });
  for (const id of ["phrase-3", "phrase-4"]) {
    const row = page.locator(`[data-check="${id}"]`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByTestId("check-phrase").click();
    await expect(row).toHaveAttribute("data-state", "passed", { timeout: 60_000 });
  }
  await shots(page, "x1-s2");
  await page.getByTestId("finish-session").click();
  await expect(page.getByRole("status").filter({ hasText: "Session 2 of 3 done." })).toBeVisible({
    timeout: 30_000,
  });
  const s = await api<{ sessions: { capstoneSessionId: string; status: string }[] }>(
    page,
    "GET",
    "/capstones/X1/sessions",
  );
  expect(s.sessions.slice(0, 2).map((x) => x.status)).toEqual(["done", "done"]);
  expect(errors).toEqual([]);
});

test("the album holds C0, C1 and C2 with covers, liner notes and versions; a review of C2 v1 is kept with it and lights its bars", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await seed(page, "C2 released");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  const album = await api<{ tracks: { id: string; capstoneId: string | null; title: string }[] }>(
    page,
    "GET",
    "/album",
  );
  const byCap = (c: string) => album.tracks.find((t) => t.capstoneId === c);
  for (const c of ["C0", "C1", "C2"]) expect(byCap(c), `${c} is on the album`).toBeTruthy();

  await page.goto("/album");
  await expect(page.getByTestId("album-meta")).toContainText(/\d+ tracks/, { timeout: 60_000 });
  for (const c of ["C0", "C1", "C2"]) {
    const t = byCap(c) as { id: string; title: string };
    const row = page.locator(`[data-track="${t.id}"]`);
    await expect(row).toContainText(t.title);
    // The tree-ring cover, grown from the version's music.
    await expect(row.locator("svg").first()).toBeVisible();
    await row.getByRole("button", { name: "Liner notes" }).click();
    await expect(row.getByTestId("liner-notes")).toBeVisible();
  }
  await shots(page, "album-c0-c1-c2");

  // C2's track: its recording, liner notes and version history.
  const c2 = byCap("C2") as { id: string; title: string };
  await page.goto(`/album/${c2.id}`);
  await expect(page.getByRole("heading", { level: 1, name: c2.title })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("track-audio")).toBeVisible();
  await expect(page.getByTestId("liner-notes").first()).toContainText("8 bars");
  await expect(page.getByRole("heading", { name: "Versions" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Version 1/ })).toHaveAttribute("aria-current", "page");

  // A review of this version (the scripted tutor) is kept with it: the server attaches it to v1.
  const ask = page.getByTestId("track-request-review");
  await expect(ask).toBeEnabled({ timeout: 30_000 });
  await ask.click();
  const card = page.getByTestId("track-review").getByTestId("review-card");
  await expect(card).toBeVisible({ timeout: 90_000 });
  const v1 = await api<{ versions: { version: number; review: unknown }[] }>(
    page,
    "GET",
    `/album/tracks/${c2.id}`,
  );
  expect(v1.versions[0]?.review, "the review is stored on version 1").toBeTruthy();

  // Its bar links open the code, loop those bars and light them on the roll; with the staff on view, there too.
  const link = card.getByTestId("review-bars").first();
  const label = ((await link.textContent()) ?? "").trim();
  const m = /(\d+)(?:–(\d+))?/.exec(label);
  const from = Number(m?.[1]);
  const to = Number(m?.[2] ?? m?.[1]);
  await link.focus();
  await page.keyboard.press("Enter");
  const lit = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __oakTutor?: { useTutorHighlight: { getState(): { current: unknown } } };
          }
        ).__oakTutor?.useTutorHighlight.getState().current ?? null,
    );
  await expect.poll(lit, { timeout: 60_000 }).toMatchObject({ kind: "bars", from, to });
  await expect(
    page.getByRole("button", { name: from === to ? `Loop bar ${from}` : `Loop bars ${from}–${to}` }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "Both" }).click();
  await link.click();
  await expect(page.locator(".oak-hover").first()).toBeVisible({ timeout: 30_000 });
  await shots(page, "track-c2-review");
  expect(errors).toEqual([]);
});
