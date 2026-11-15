// C4 "Minor Indie Ballad" and C5 "12-Bar Shuffle" on the capstone stack (5210/8810, the fake tutor), from seeds:
// - C4 from "C4 open": S1 the Aeolian verse (i–VI–III–VII met; the major V and the ending on 1 still open, the
//   ending anchored to the last bars); the session finishes; S2 the chorus cadence with the major V; every rule
//   met; checked; released by keyboard with its take;
// - C5 from "C5.S1 done": S2 straight hats leave the swing rule open, naming the line; no turnaround leaves bar 12
//   open, anchored to bar 12; the full two choruses meet the brief; Claude's review (two revisions from C5 on)
//   with "Mark done" on each; released.
// - C4 written in D minor first: the workspace names the key the piece reads in (decision 54).
// Both releases use a seeded take (seeded-take.ts: the recorder's own window, uploaded through the release path);
// the real recorder is under test in capstone.pw.ts (C0), ui-review capstone-silent.pw.ts and the journey's C3.
// Screenshots: both themes at 1440×900 and 1280×800, reduced motion on.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { seedTake } from "./seeded-take.ts";
import { C4_FULL, C4_VERSE, C5_FULL, C5_NO_TURNAROUND, C5_STRAIGHT } from "./w5-pieces.ts";
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

async function releaseByKeyboard(page: import("@playwright/test").Page, title: string) {
  const release = page.getByTestId("release");
  await expect(release).toBeEnabled({ timeout: 30_000 });
  await release.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: /Release to the album|Release a new version/ });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByLabel("Title").fill(title);
  await seedTake(page);
  await dialog.getByTestId("record-take").focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByTestId("take-audio")).toBeVisible({ timeout: 30_000 });
  await dialog.getByTestId("confirm-release").focus();
  await page.keyboard.press("Enter");
  const ceremony = page.getByTestId("release-ceremony");
  await expect(ceremony).toBeVisible({ timeout: 30_000 });
  await ceremony.getByRole("link", { name: "Open the track" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("track-audio")).toBeVisible();
}

test("C4 from “C4 open”: the Aeolian verse, then the chorus cadence with the major V; released", async ({
  page,
}) => {
  test.setTimeout(230_000);
  const errors = watchErrors(page);
  await seedFirst(page, ["C4 open", "C4 ready"]);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/capstone/C4");
  await expect(page.getByRole("heading", { level: 1, name: "C4 Minor Indie Ballad" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Start session 1 of 2" }).click();
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  await editor(page, "C4");
  await expect(page.locator('[data-session="C4.S1"]')).toHaveAttribute("aria-current", "step");

  // The same verse written in D minor: every rule reads it in A minor, and the workspace says so first (decision 54).
  const inD = C4_VERSE.replace('chord("<Am F C G>")', 'chord("<Dm Bb F C>")')
    .replace('chord("<F G C Am>")', 'chord("<Bb C F Dm>")')
    .replaceAll("A4:minor", "D4:minor");
  await setCode(page, "C4", inD);
  await expect(page.getByTestId("capstone-key-note")).toHaveText(
    "Your piece reads in D minor; the brief is in A minor, so every check reads it in A minor. Move it to A minor: the key in .scale() and the chords.",
    { timeout: 60_000 },
  );

  // Session 1: the verse loop i–VI–III–VII, the melody on ♭3 and ♭6; the chorus still lands on III and 3.
  await setCode(page, "C4", C4_VERSE);
  await expect(page.getByTestId("capstone-key-note")).toHaveCount(0, { timeout: 60_000 });
  const aeolian = ruleId("C4", "progression");
  const majorV = ruleId("C4", "contains-rn");
  const ending = ruleId("C4", "ends-on-degree");
  if (aeolian) await expect(rule(page, aeolian)).toHaveAttribute("data-state", "met", { timeout: 60_000 });
  if (majorV) await expect(rule(page, majorV)).toHaveAttribute("data-state", "open");
  if (ending) {
    await expect(rule(page, ending)).toHaveAttribute("data-state", "open");
    await expect(rule(page, ending).getByTestId("bar-anchor")).toHaveText(/Bars 15–16/);
  }
  // The form strip shows the sections the verse rule reads.
  await expect(page.getByTestId("form-letters")).toHaveText("A B A B");
  await shots(page, "c4-s1");
  await expect(page.getByTestId("saved-state")).toContainText(/Version \d+ saved/, { timeout: 30_000 });
  await page.getByTestId("finish-session").click();
  await expect(page.getByRole("status").filter({ hasText: "Session 1 of 2 done." })).toBeVisible({
    timeout: 30_000,
  });

  // Session 2: the chorus lands E (V, with G♯) → Am, the melody home on 1.
  await expect(page.locator('[data-session="C4.S2"]')).toHaveAttribute("aria-current", "step", {
    timeout: 30_000,
  });
  await setCode(page, "C4", C4_FULL);
  if (majorV) await expect(rule(page, majorV)).toHaveAttribute("data-state", "met", { timeout: 60_000 });
  if (ending) await expect(rule(page, ending)).toHaveAttribute("data-state", "met");
  const unbuilt = unbuiltRules("C4");
  if (unbuilt.length > 0) {
    test
      .info()
      .annotations.push({ type: "pending content", description: `C4 custom rules: ${unbuilt.join(", ")}` });
    expect(errors).toEqual([]);
    return;
  }
  await expect(page.getByTestId("req-count")).toHaveText(/^(\d+) of \1 met$/, { timeout: 60_000 });
  await page.getByTestId("check-track").click();
  await expect(page.getByRole("status").filter({ hasText: /every requirement is met/ })).toBeVisible({
    timeout: 30_000,
  });
  await shots(page, "c4-s2-ready");
  // c1: an edit after the passing check (still passing) asks for a new check before the release.
  await setCode(
    page,
    "C4",
    C4_FULL.replace('drums: s("bd ~ sd ~, hh*8")', 'drums: s("bd ~ sd ~, hh*8").gain(.9)'),
  );
  await expect(page.getByTestId("check-again")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("check-again")).toContainText("Check this version before you release");
  await expect(page.getByTestId("release")).toBeDisabled();
  await shots(page, "c4-s2-check-again");
  await page.getByTestId("check-track").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("check-again")).toHaveCount(0, { timeout: 30_000 });
  await releaseByKeyboard(page, "Low Light");
  const album = await api<{ tracks: { capstoneId: string | null; title: string }[] }>(page, "GET", "/album");
  expect(album.tracks.find((t) => t.capstoneId === "C4")?.title).toBe("Low Light");
  expect(errors).toEqual([]);
});

test("C5 from “C5.S1 done”: swing and the turnaround anchored, two choruses, a review with two revisions marked done", async ({
  page,
}) => {
  test.setTimeout(230_000);
  const errors = watchErrors(page);
  await seedFirst(page, ["C5.S1 done", "after C5.S1"]);
  await useUiPrefs(page, { theme: "bark", motion: "off" });
  await page.goto("/capstone/C5");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  await editor(page, "C5");
  await expect(page.locator('[data-session="C5.S2"]')).toHaveAttribute("aria-current", "step");

  // Straight hats: the shuffle is gone, and the row names the line to swing.
  const swing = ruleId("C5", "swing");
  await setCode(page, "C5", C5_STRAIGHT);
  if (swing) {
    await expect(rule(page, swing)).toHaveAttribute("data-state", "open", { timeout: 60_000 });
    await expect(rule(page, swing)).toContainText("hats");
  }
  // Bar 12 back on I: the turnaround row points at bar 12 (the Wave 5 rule shape, `section: { bars: [12, 12] }`).
  const turn = ruleId("C5", "contains-rn", (r) => r.section !== undefined);
  await setCode(page, "C5", C5_NO_TURNAROUND);
  if (turn) {
    await expect(rule(page, turn)).toHaveAttribute("data-state", "open", { timeout: 60_000 });
    await expect(rule(page, turn).getByTestId("bar-anchor")).toHaveText("Bar 12");
    await rule(page, turn).getByTestId("bar-anchor").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Loop bar 12" })).toHaveAttribute("aria-pressed", "true", {
      timeout: 30_000,
    });
  }
  await shots(page, "c5-s2-open");

  // The whole shuffle: two choruses of dominant sevenths, swung hats, the riff answered in chorus two.
  await setCode(page, "C5", C5_FULL);
  if (swing) await expect(rule(page, swing)).toHaveAttribute("data-state", "met", { timeout: 60_000 });
  await page.getByTestId("check-track").click();
  await expect(page.getByRole("status").filter({ hasText: /Checked version \d+/ })).toBeVisible({
    timeout: 30_000,
  });

  // Claude's review (the scripted fake tutor): two revisions from C5 on, each with "Mark done"; it names the
  // version it was asked about.
  await page.getByTestId("request-review").click();
  const review = page.getByTestId("review-summary");
  await expect(review).toBeVisible({ timeout: 60_000 });
  await expect(review.locator("[data-revision]")).toHaveCount(2);
  await expect(review.getByTestId("review-heading")).toHaveText(/^Review of version \d+$/);
  const done = review.getByTestId("review-mark-done").first();
  await done.focus();
  await page.keyboard.press("Enter");
  await expect(done).toHaveAttribute("aria-pressed", "true");
  await expect(review.locator('[data-revision="0"]')).toHaveAttribute("data-done", "true");
  await shots(page, "c5-s2-review");
  // The tick is kept in this browser: a reload still shows it.
  await page.reload();
  await expect(page.getByTestId("review-summary").locator('[data-revision="0"]')).toHaveAttribute(
    "data-done",
    "true",
    { timeout: 60_000 },
  );

  const unbuilt = unbuiltRules("C5");
  if (unbuilt.length > 0) {
    test
      .info()
      .annotations.push({ type: "pending content", description: `C5 custom rules: ${unbuilt.join(", ")}` });
    expect(errors).toEqual([]);
    return;
  }
  await editor(page, "C5");
  await expect(page.getByTestId("req-count")).toHaveText(/^(\d+) of \1 met$/, { timeout: 60_000 });
  await page.getByTestId("check-track").click();
  await expect(page.getByRole("status").filter({ hasText: /every requirement is met/ })).toBeVisible({
    timeout: 30_000,
  });
  await releaseByKeyboard(page, "Late Shuffle");
  expect(errors).toEqual([]);
});
