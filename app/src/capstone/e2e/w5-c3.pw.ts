// C3 "Verse–Chorus Demo" over three sessions on the capstone stack (5210/8810, the fake tutor), each from a seed:
// - S1 from "C3 open": the plan names three sessions; the groove and changes for verse and chorus arranged V C V C;
//   the form strip reads A B A B and a section loops from the keyboard; the contrast row says which axes the chorus
//   already differs on; the length is read from the code; the session finishes;
// - S3 from "C3.S2 done" (the melodies written): the demo too fast is too short, with the bars still to add; at
//   80 BPM every requirement is met; the lead sheet of the arranged piece shows its sections; an edit after the
//   check says "check again before you release" (c1); release by keyboard with a recorded 96-second take; the
//   album track plays it and offers the download.
// Screenshots: both themes at 1440×900 and 1280×800, reduced motion on.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { C3_FAST, C3_FULL, C3_GROOVE } from "./w5-pieces.ts";
import {
  api,
  editor,
  rule,
  ruleId,
  seedFirst,
  setCode,
  shots,
  unbuiltRules,
  watchErrors,
} from "./w5-support.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

const CONTRAST = ruleId("C3", "contrast");
const DURATION = ruleId("C3", "duration-sec");

test("C3 session 1 from “C3 open”: groove and changes, the form strip, contrast axes, the length from the code", async ({
  page,
}) => {
  test.setTimeout(200_000);
  const errors = watchErrors(page);
  // Quiet mode (no mic): nothing here waits for a voice.
  await seedFirst(page, ["C3 open", "C3 ready"], false);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/capstone/C3");
  await expect(page.getByRole("heading", { level: 1, name: "C3 Verse–Chorus Demo" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Groove and changes for verse and chorus.").first()).toBeVisible();
  await shots(page, "c3-start");
  const start = page.getByRole("button", { name: "Start session 1 of 3" });
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  await editor(page, "C3");
  await expect(page.locator('[data-session="C3.S1"]')).toHaveAttribute("aria-current", "step");
  await expect(page.locator('[data-session="C3.S3"]')).toHaveAttribute("data-status", "locked");

  // The groove and the changes for both sections, arranged V C V C with one arrange() per labelled part.
  await setCode(page, "C3", C3_GROOVE);
  const strip = page.getByTestId("form-strip");
  await expect(strip.getByTestId("form-letters")).toHaveText("A B A B", { timeout: 60_000 });
  await expect(strip.locator("[data-section]")).toHaveCount(4);
  // A section is a button: the arrow keys move along the form, Enter loops it.
  const first = strip.locator('[data-section="verse"]').first();
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(strip.locator('[data-section="chorus"]').first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Loop bars 9–16" })).toHaveAttribute("aria-pressed", "true", {
    timeout: 30_000,
  });

  // The chorus differs from the verse only in its chords so far: the row says so, and what else to try.
  if (CONTRAST) {
    const row = rule(page, CONTRAST);
    await expect(row).toHaveAttribute("data-state", "open");
    await expect(row.locator('[data-axis="harmony"]')).toHaveAttribute("data-found", "true");
    await expect(row.getByTestId("contrast-axes")).toContainText("Differs on 1 of 2 needed: chords. Try");
    await expect(row.getByTestId("bar-anchor")).toHaveText("Chorus · bars 9–16");
  }
  // The length, read from the code (32 bars at 80 BPM), never played.
  if (DURATION) {
    const row = rule(page, DURATION);
    await expect(row).toHaveAttribute("data-state", "met");
    await expect(row.getByTestId("duration-read")).toHaveText("1:36 of at least 1:30 (32 bars at 80 BPM).");
  }
  await shots(page, "c3-s1-form");
  // The strip is the brief's, not a lens: with the Sections lens off it still reads the form.
  const lens = page.getByRole("button", { name: "Sections", exact: true });
  if (await lens.count()) {
    const pressed = await lens.getAttribute("aria-pressed");
    await lens.click();
    await expect(lens).not.toHaveAttribute("aria-pressed", pressed ?? "true");
    await expect(strip.getByTestId("form-letters")).toHaveText("A B A B");
    await lens.click();
  }

  await expect(page.getByTestId("saved-state")).toContainText(/Version \d+ saved/, { timeout: 30_000 });
  await page.getByTestId("finish-session").click();
  await expect(page.getByRole("status").filter({ hasText: "Session 1 of 3 done." })).toBeVisible({
    timeout: 30_000,
  });
  const state = await api<{ sessions: string[] }>(page, "GET", "/capstones/C3");
  expect(state.sessions).toContain("C3.S1");
  expect(errors).toEqual([]);
});

test("C3 session 3 from “C3.S2 done”: too short, then 96 seconds; the lead sheet; check again after an edit; release", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await seedFirst(page, ["C3.S2 done", "after C3.S2"]);
  await useUiPrefs(page, { theme: "bark", motion: "off" });
  await page.goto("/capstone/C3");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  await editor(page, "C3");
  await expect(page.locator('[data-session="C3.S3"]')).toHaveAttribute("aria-current", "step");

  // At 120 BPM the 32 bars last 64 seconds: the row says how many bars are missing at this tempo.
  await setCode(page, "C3", C3_FAST);
  if (DURATION) {
    const row = rule(page, DURATION);
    await expect(row).toHaveAttribute("data-state", "open", { timeout: 60_000 });
    await expect(row.getByTestId("duration-read")).toContainText("1:04 of at least 1:30");
    await expect(row.getByTestId("duration-read")).toContainText("13 more bars at this tempo");
  }

  // At 80 BPM: the melodies in their sections, the lead sheet with a label at each section.
  await setCode(page, "C3", C3_FULL);
  if (DURATION) await expect(rule(page, DURATION)).toHaveAttribute("data-state", "met", { timeout: 60_000 });
  if (CONTRAST) await expect(rule(page, CONTRAST)).toHaveAttribute("data-state", "met");
  const sheet = page.getByTestId("lead-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Bars 1–16 of 32");
  await expect(sheet.locator(".oak-section").first()).toBeVisible({ timeout: 30_000 });
  await expect(sheet.locator(".oak-section-chorus")).toHaveCount(1);
  await sheet.getByRole("button", { name: "Next page of the lead sheet" }).click();
  await expect(sheet).toContainText("Bars 17–32 of 32");
  await shots(page, "c3-s3-lead-sheet");

  const unbuilt = unbuiltRules("C3");
  if (unbuilt.length > 0) {
    test.info().annotations.push({
      type: "pending content",
      description: `C3's brief still has rules the grader does not build (${unbuilt.join(", ")}): the release waits for author:capstones`,
    });
    expect(errors).toEqual([]);
    return;
  }
  const count = page.getByTestId("req-count");
  await expect(count).toHaveText(/^(\d+) of \1 met$/, { timeout: 60_000 });
  await page.getByTestId("check-track").click();
  await expect(page.getByRole("status").filter({ hasText: /every requirement is met/ })).toBeVisible({
    timeout: 30_000,
  });
  const release = page.getByTestId("release");
  await expect(release).toBeEnabled();

  // c1: an edit after the check (still passing) asks for a new check before the release.
  await setCode(page, "C3", C3_FULL.replace('hats: s("hh*8").gain(.4)', 'hats: s("hh*8").gain(.45)'));
  await expect(page.getByTestId("check-again")).toBeVisible({ timeout: 60_000 });
  await expect(release).toBeDisabled();
  await shots(page, "c3-s3-check-again");
  await page.getByTestId("check-track").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("check-again")).toHaveCount(0, { timeout: 30_000 });
  await expect(release).toBeEnabled();

  // Release, keyboard only; the take is the whole 96-second demo.
  await release.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Release to the album" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByLabel("Title").fill("Two Rooms");
  await dialog.getByLabel(/One line for the liner notes/).fill("The verse waits low; the chorus climbs.");
  await dialog.getByTestId("record-take").focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByText(/Recording \d:\d\d of 1:3\d/)).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByTestId("take-audio")).toBeVisible({ timeout: 130_000 });
  await dialog.getByTestId("confirm-release").focus();
  await page.keyboard.press("Enter");
  const ceremony = page.getByTestId("release-ceremony");
  await expect(ceremony).toBeVisible({ timeout: 30_000 });
  await ceremony.getByRole("link", { name: "Open the track" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Two Rooms" })).toBeVisible({ timeout: 30_000 });
  const audio = page.getByTestId("track-audio");
  await expect(audio).toBeVisible();
  // The long take is kept whole, plays and downloads.
  const trackId = page.url().split("/album/")[1]?.split("?")[0] as string;
  const t = await api<{ versions: { hasAudio: boolean; durationS: number | null }[] }>(
    page,
    "GET",
    `/album/tracks/${trackId}`,
  );
  expect(t.versions[0]?.hasAudio).toBe(true);
  expect(t.versions[0]?.durationS ?? 0).toBeGreaterThan(90);
  await audio.evaluate((a: HTMLAudioElement) => a.play().catch(() => undefined));
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime), { timeout: 15_000 })
    .toBeGreaterThan(0.2);
  await expect(page.getByTestId("download-audio")).toHaveAttribute("download", /^two-rooms-v1\.\w+$/);
  await expect(page.getByTestId("liner-notes").first()).toContainText("32 bars");
  expect(errors).toEqual([]);
});
