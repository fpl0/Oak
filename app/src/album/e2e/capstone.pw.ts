// The capstone flow and the album as the learner, adversarially (Wave 4 review), on the real stack from seeds:
// - C2 released, then revised: "Release a new version" records a take while the tab is hidden for a while; the
//   release's answer is lost (the server has it); the learner reads a calm sentence (it read "capstones.release:
//   HTTP 502"), presses Release again and gets one new version, not two; both recordings are in the backup;
// - a review that arrives late: the request waits visibly and cannot be sent twice; once it is in, nothing polls
//   (the timeline was polled every 3 s for as long as the workspace was open, once any review had been asked for);
// - twenty tracks: one note, sixty-four bars, a piece whose code no longer runs, an empty one, a 120-character
//   title; the broken one says so on its page and is not offered for recording (it was, and failed with "fix the
//   error first" on read-only code).
import { expect, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";
import { api, blockHmr, seed, watchErrors } from "./support.ts";

const SHOTS = new URL("./screenshots", import.meta.url).pathname;

test.beforeEach(async ({ page }) => {
  await blockHmr(page);
});

async function shots(page: Page, name: string) {
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, m.theme);
    await page.waitForTimeout(150);
    await shoot(page, SHOTS, name, m.theme);
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "paper";
  });
  await page.setViewportSize({ width: 1440, height: 900 });
}

// Checked with @oak/grader against the C2 brief (C major, 96 BPM): I V vi IV I V V I under a melody that reuses
// its bar-1 idea and lands on 1 (the capstone suite's C2_FULL); the revision moves the chords to the Rhodes.
const LOOP = '"<[0,2,4] [4,6,8] [5,7,9] [3,5,7] [0,2,4] [4,6,8] [4,6,8] [0,2,4]>"';
const MELODY =
  'melody: n("<[4 4 2 ~] [4 4 1 ~] [5 5 2 ~] [3 3 0 ~] [4 4 2 ~] [4 4 1 ~] [4 4 1 ~] [0@4]>").scale("C4:major").s("piano")';
const C2_FULL = `setcpm(96/4)\n\nchords: n(${LOOP}).scale("C3:major").s("piano")\n${MELODY}`;
const C2_RHODES = `setcpm(96/4)\n\nchords: n(${LOOP}).scale("C3:major").s("rhodes")\n${MELODY}`;
const EDITOR = "oak_capstone-C2_0_";

async function setCode(page: Page, code: string) {
  await page.waitForFunction(
    (id) =>
      !!(globalThis as { __oakStrudel?: { editors: Map<string, unknown> } }).__oakStrudel?.editors.get(id),
    EDITOR,
    { timeout: 60_000 },
  );
  // The draft loads into the editor first; then the new code goes in.
  await page.waitForTimeout(1500);
  await page.evaluate(
    ([id, c]) =>
      (
        globalThis as unknown as { __oakStrudel: { editors: Map<string, { setCode(c: string): void }> } }
      ).__oakStrudel.editors
        .get(id as string)
        ?.setCode(c as string),
    [EDITOR, code],
  );
}

async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((h) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (h ? "hidden" : "visible"),
    });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

test("a new version: the tab hidden mid-take, the release's answer lost and retried, both recordings in the backup", async ({
  page,
}) => {
  test.setTimeout(220_000);
  const errors = watchErrors(page);
  await seed(page, "C2 released");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  const album = await api<{ tracks: { id: string; capstoneId: string | null }[] }>(page, "GET", "/album");
  const trackId = album.body.tracks.find((t) => t.capstoneId === "C2")?.id as string;
  await page.goto("/capstone/C2");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  await setCode(page, C2_RHODES);
  await expect(page.getByTestId("req-count")).toHaveText("7 of 7 met", { timeout: 60_000 });
  await page.getByTestId("check-track").click();
  const release = page.getByTestId("release");
  await expect(release).toHaveText(/Release a new version/, { timeout: 30_000 });
  await expect(release).toBeEnabled();
  await release.click();
  const dialog = page.getByRole("dialog", { name: "Release a new version" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/One line for the liner notes/).fill("Now on the Rhodes.");
  await dialog.getByTestId("record-take").click();
  await expect(dialog.getByText(/^Recording /)).toBeVisible({ timeout: 15_000 });
  // The learner switches tabs for a few seconds while the piece is recorded.
  await page.waitForTimeout(3000);
  await setHidden(page, true);
  await page.waitForTimeout(5000);
  await setHidden(page, false);
  await expect(dialog.getByTestId("take-audio")).toBeVisible({ timeout: 60_000 });
  // The whole piece is on the take (8 bars at 96 BPM is 20 s, then the tail), with sound in every second of it.
  const take = await dialog.getByTestId("take-audio").evaluate(async (a: HTMLAudioElement) => {
    const bytes = await (await fetch(a.src)).arrayBuffer();
    const buf = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(bytes);
    const x = buf.getChannelData(0);
    const peaks: number[] = [];
    for (let s = 0; s + buf.sampleRate <= x.length; s += buf.sampleRate) {
      let m = 0;
      for (let i = s; i < s + buf.sampleRate; i++) m = Math.max(m, Math.abs(x[i] as number));
      peaks.push(m);
    }
    return { seconds: buf.duration, peaks };
  });
  console.log(
    `[review] take with the tab hidden: ${take.seconds.toFixed(2)} s, peaks ${JSON.stringify(take.peaks.map((p) => Math.round(p * 100) / 100))}`,
  );
  expect(take.seconds).toBeGreaterThan(20.5);
  expect(take.seconds).toBeLessThan(23.5);
  for (const p of take.peaks.slice(0, 20)) expect(p).toBeGreaterThan(0.02);

  // The release reaches the server, but its answer is lost on the way back.
  let lost = false;
  await page.route("**/api/capstones/C2/release", async (route) => {
    if (!lost) {
      lost = true;
      await route.fetch();
      await route.fulfill({ status: 502, contentType: "application/json", body: "{}" });
      return;
    }
    await route.continue();
  });
  await dialog.getByTestId("confirm-release").click();
  const callout = dialog.getByRole("status").filter({ hasText: "That didn't work" });
  await expect(callout).toContainText(
    "The album couldn't be saved just now. Your take is kept: press Release to try again.",
  );
  await expect(dialog).not.toContainText("HTTP");
  await expect(dialog).not.toContainText("capstones.release");
  await shots(page, "release-retry");
  await dialog.getByTestId("confirm-release").click();
  const ceremony = page.getByTestId("release-ceremony");
  await expect(ceremony).toContainText("Version 2 is on the album.", { timeout: 30_000 });

  // One new version (the retry was not a third), with its recording; version 1 keeps its own.
  const track = await api<{
    currentVersion: number;
    versions: { version: number; hasAudio: boolean; durationS: number | null; linerNotesMd: string }[];
  }>(page, "GET", `/album/tracks/${trackId}`);
  expect(track.body.versions.map((v) => v.version)).toEqual([1, 2]);
  expect(track.body.currentVersion).toBe(2);
  expect(track.body.versions.every((v) => v.hasAudio)).toBe(true);
  expect(track.body.versions[1]?.linerNotesMd).toContain("Now on the Rhodes.");

  // The backup carries both recordings.
  const zip = await page.request.fetch(`${stack.apiURL}/api/backup/export?audio=1`, {
    headers: { origin: stack.baseURL, "x-oak": "1" },
    timeout: 60_000,
  });
  expect(zip.status()).toBe(200);
  const names = (await zip.body()).toString("latin1");
  expect(names).toMatch(new RegExp(`album/${trackId}/v1\\.[a-z0-9]+`));
  expect(names).toMatch(new RegExp(`album/${trackId}/v2\\.[a-z0-9]+`));
  expect(errors.filter((e) => !/502/.test(e))).toEqual([]);
});

test("a review that arrives late waits visibly, cannot be asked twice, and nothing polls once it is in", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  let timeline = 0;
  page.on("request", (r) => {
    if (/\/api\/tutor\/timeline/.test(r.url())) timeline++;
  });
  // The review request reaches the server 10 s late (a slow model, a busy machine).
  let reviews = 0;
  await page.route("**/api/tutor/reviews/capstone", async (route) => {
    reviews++;
    await new Promise((r) => setTimeout(r, 10_000));
    await route.continue();
  });
  await seed(page, "C2.S1 done");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/capstone/C2");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  await setCode(page, C2_FULL);
  await expect(page.getByTestId("req-count")).toHaveText("7 of 7 met", { timeout: 60_000 });
  await page.getByTestId("check-track").click();
  const ask = page.getByTestId("request-review");
  await expect(ask).toBeEnabled({ timeout: 30_000 });
  await ask.click();
  // On its way: said so, and the button cannot send a second request.
  await expect(page.getByTestId("review-wait")).toHaveAttribute("data-state", "pending");
  await expect(ask).toBeDisabled();
  await expect(ask).toHaveText(/Review requested/);
  await shots(page, "review-pending");
  await expect(page.getByTestId("review-summary")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("review-wait")).toHaveCount(0);
  await expect(ask).toBeEnabled();
  await expect(ask).toHaveText(/Ask for a new review/);
  expect(reviews).toBe(1);
  // Once it is in, the timeline is not polled any more…
  await page.waitForTimeout(1000);
  const after = timeline;
  await page.waitForTimeout(9000);
  expect(timeline - after, "timeline requests in 9 s after the review arrived").toBeLessThanOrEqual(1);
  // …nor after coming back to the workspace.
  await page.reload();
  await expect(page.getByTestId("review-summary")).toBeVisible({ timeout: 60_000 });
  const reloaded = timeline;
  await page.waitForTimeout(9000);
  expect(timeline - reloaded, "timeline requests in 9 s after a reload").toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

const LONG = `setcpm(120/4)\nmelody: n("<${Array.from({ length: 64 }, (_, i) => `[${i % 7} ${(i + 2) % 7}]`).join(" ")}>").scale("D4:minor").s("piano")\nbass: n("<${Array.from({ length: 64 }, (_, i) => (i * 3) % 7).join(" ")}>").scale("D2:minor").s("ebass")`;
const PIECES: { title: string; code: string }[] = [
  { title: "One note", code: `note("c4")` },
  { title: "Sixty-four bars", code: LONG },
  { title: "Broken now", code: `setcpm(90/4)\nmelody: note("c4 e4").nosuchfunction(3)` },
  { title: "Nothing at all", code: "// nothing yet" },
  { title: "Just drums", code: `setcpm(100/4)\ndrums: s("bd sd bd sd")` },
  {
    title:
      "A very long title that goes on and on about a loop, a cadence and a tune nobody will remember tomorrow, ok",
    code: `setcpm(96/4)\nmelody: n("0 2 4 7").scale("C4:major").s("piano")`,
  },
];

test("twenty tracks: covers for one note and sixty-four bars, a version whose code no longer runs", async ({
  page,
}) => {
  test.setTimeout(200_000);
  const errors = watchErrors(page);
  await seed(page, "C2 released");
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  const ids = new Map<string, string>();
  for (let i = 0; i < 17; i++) {
    const p = PIECES[i] ?? {
      title: `Sketch ${i + 1}`,
      code: `setcpm(${80 + i * 5}/4)\nmelody: n("<0 2 4 ${i % 7}>").scale("${["C", "G", "D", "A", "E", "F", "Bb"][i % 7]}4:major").s("piano")`,
    };
    const s = await api<{ sketch: { id: string } }>(page, "POST", "/sketches", {
      title: p.title.slice(0, 120),
      originKind: "free",
      originId: null,
      sessionId: null,
      code: p.code,
      bpm: null,
      meter: "4/4",
      key: null,
      analysis: null,
      note: null,
      tutorAssisted: false,
      band: null,
      flags: { lockedTools: [], previewTools: [] },
      ranOk: true,
    });
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    const t = await api<{ id: string }>(page, "POST", "/album/tracks", {
      capstoneId: null,
      side: "Bside",
      title: p.title.slice(0, 120),
      flavour: i % 2 ? "flavour.jazz-soul" : "flavour.pop",
      sketchId: s.body.sketch.id,
      sketchVersion: 1,
      linerNotesMd: `Notes for ${p.title}.`,
      theoryTags: [],
      attribution: null,
    });
    expect(t.status, JSON.stringify(t.body)).toBe(200);
    ids.set(p.title, t.body.id);
  }

  await page.goto("/album");
  await expect(page.getByText("20 tracks")).toBeVisible({ timeout: 60_000 });
  // Every B-side is listed, the long title included, and nothing runs off the page.
  for (const p of PIECES)
    await expect(page.getByRole("link", { name: p.title.slice(0, 120) }).first()).toBeVisible();
  const overflow = await page.evaluate(() => {
    const main = document.getElementById("main");
    return main ? main.scrollWidth - main.clientWidth : 0;
  });
  expect(overflow).toBeLessThanOrEqual(0);
  await page.waitForTimeout(4000);
  await shots(page, "album-twenty");

  // One note and sixty-four bars: their covers grow (rings), their pages work.
  for (const name of ["One note", "Sixty-four bars"]) {
    await page.goto(`/album/${ids.get(name)}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Play it live" }).click();
    await expect(page.getByRole("button", { name: /Record this version/ })).toBeEnabled({ timeout: 60_000 });
    await expect(page.getByTestId("version-broken")).toHaveCount(0);
  }

  // The broken version: the page says what stays and what to do; it is not offered for recording.
  await page.goto(`/album/${ids.get("Broken now")}`);
  await expect(page.getByRole("heading", { level: 1, name: "Broken now" })).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText("No recording of this version, and its code no longer runs (below)."),
  ).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Play it live" }).click();
  await expect(page.getByTestId("version-broken")).toContainText("This version doesn't run in Oak today", {
    timeout: 60_000,
  });
  await expect(page.getByTestId("version-broken")).toContainText("use Revise");
  await expect(page.getByRole("button", { name: /Record this version/ })).toBeDisabled();
  await expect(page.getByText(/nosuchfunction/).first()).toBeVisible();
  await shots(page, "track-broken");
  expect(errors).toEqual([]);
});
