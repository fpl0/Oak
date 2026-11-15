// Settings › Voice and the set-up parts Wave 3 adds, with a fake microphone singing F♯3 (match.wav): the one
// Quiet-mode switch (keyboard only, kept across a reload), the tolerance ladder explained (never a score), the
// three pitch-match trials, the quiet check that notices a voice, and Settings › Audio's output level meter.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import {
  expectNoOverflow,
  fakeMic,
  noHmr,
  patchProfile,
  quietNow,
  resetData,
  shootAll,
  watchErrors,
} from "./helpers.ts";
import { stack } from "./playwright.config.ts";

test.use({ launchOptions: { args: fakeMic("match.wav") } });

/** A learner who set up the mic in a quiet room: range A2–E4, comfortable C3–C4 (match targets 54, 58, 49). */
const SET_UP = {
  vocalLowMidi: 45,
  vocalHighMidi: 64,
  comfortLowMidi: 48,
  comfortHighMidi: 60,
  noiseFloorDb: -62,
  outputKind: "wired",
  inputKind: "builtin",
  quiet: false,
};

test.beforeEach(async ({ request }) => {
  await resetData(request, stack.apiURL);
  await patchProfile(request, stack.apiURL, SET_UP);
});

test("Settings › Voice: Quiet mode from the keyboard, kept across a reload; the ladder explained", async ({
  page,
  request,
}) => {
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watchErrors(page);
  await page.goto("/settings/voice");
  await expect(page.getByTestId("ladder-now")).toHaveText("±70¢");
  await expect(page.getByTestId("ladder-why")).toHaveText(/Where everyone starts/);
  await expect(page.getByTestId("quiet-control")).toHaveAttribute("data-quiet", "0");
  await shootAll(page, "40-settings-voice");
  await expectNoOverflow(page);

  // "How it moves" opens from the keyboard and never reads like a grade.
  const how = page.getByText("How it moves");
  await how.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ladder-how")).toBeVisible();
  await expect(page.getByTestId("ladder-how")).toContainText("A hard day simply doesn't count");
  await expect(page.getByTestId("ladder-card")).not.toContainText(/%|score/i);

  // Quiet mode: one switch, Space toggles it; "until I switch it off" chosen with the arrow keys.
  const choice = page.getByRole("radiogroup", { name: "When Quiet mode is switched on" });
  await choice.getByRole("radio", { name: "Just for today" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(choice.getByRole("radio", { name: "Until I switch it off" })).toBeChecked();
  const sw = page.getByRole("switch", { name: "Quiet mode" });
  await sw.focus();
  await page.keyboard.press("Space");
  await expect.poll(() => quietNow(request, stack.apiURL)).toBe(true);
  await expect(page.getByTestId("quiet-control")).toHaveAttribute("data-quiet", "1");
  await expect(page.getByTestId("quiet-line")).toHaveText(/singing steps become listening steps/);
  await shootAll(page, "41-settings-voice-quiet");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Quiet mode" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("switch", { name: "Quiet mode" }).focus();
  await page.keyboard.press("Space");
  await expect.poll(() => quietNow(request, stack.apiURL)).toBe(false);

  // A fixed tolerance, then back to Auto.
  await page.getByLabel("Tolerance").selectOption({ label: "±50¢" });
  await expect(page.getByTestId("ladder-now")).toHaveText("±50¢");
  await expect(page.getByTestId("ladder-why")).toHaveText(/You chose ±50¢/);
  await page.getByLabel("Tolerance").selectOption({ label: "Auto (recommended)" });
  await expect(page.getByTestId("ladder-card")).toContainText("Auto");
  expect(problems).toEqual([]);
});

test("Match three notes: Oak plays, the learner sings back; the result is kept and shown in words", async ({
  page,
}) => {
  await noHmr(page);
  await useUiPrefs(page, { theme: "bark" });
  const problems = watchErrors(page);
  await page.goto("/settings/voice");
  await expect(page.getByTestId("match-last")).toHaveText("not measured");
  await page.getByTestId("rerun-match").click();
  await expect(page).toHaveURL(/\/settings\/voice\/setup\?part=match/);
  // The start button has focus: Enter runs the three trials.
  await expect(page.getByTestId("match-start")).toBeFocused();
  await shootAll(page, "42-match-intro");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("match-status")).toHaveText(/Note 1 of 3/);
  await expect(page.getByTestId("match-verdict")).toBeVisible({ timeout: 40_000 });
  // F♯3 was sung each time: the first note (F♯3) matched, the other two (A♯3, C♯3) were heard but not matched.
  await expect(page.getByText("1 of 3 notes matched within ±50¢")).toBeVisible();
  const rows = page.getByTestId("match-trials").locator("li");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText(/spot on|a little/);
  await expect(rows.nth(1)).toContainText("semitones low");
  await expect(rows.nth(1)).toContainText("↓");
  await expect(rows.nth(2)).toContainText("↑");
  await expect(page.getByTestId("match-verdict")).toContainText("starts wide");
  await expect(page.getByTestId("result-retry")).toBeVisible();
  await expect(page.getByTestId("result-continue")).toBeFocused();
  await shootAll(page, "43-match-result");
  await page.getByTestId("result-continue").click();
  await expect(page.getByTestId("setup-done")).toBeVisible();
  await page.getByRole("link", { name: "Back to Settings › Voice" }).click();
  await expect(page.getByTestId("match-last")).toHaveText("1 of 3 within ±50¢");
  await expect(page.getByTestId("calibration-history")).toContainText("Pitch match · 1 of 3 within ±50¢");
  expect(problems).toEqual([]);
});

test("the quiet check notices a voice and offers Try again instead of storing it", async ({
  page,
  request,
}) => {
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  await page.goto("/settings/voice/setup?part=noise");
  await page.getByTestId("noise-start").click();
  await expect(page.getByTestId("noise-voice")).toBeVisible({ timeout: 15_000 });
  // The take is not kept: Try again measures again; Continue keeps the room measured before (−62 dBFS).
  await expect(page.getByTestId("result-retry")).toBeVisible();
  await expect(page.getByTestId("result-continue")).toBeEnabled();
  await shootAll(page, "44-quiet-check-voice");
  // Nothing was stored: the floor is still the quiet room's.
  const p = await (await request.get(`${stack.apiURL}/api/profile`, { headers: { "x-oak": "1" } })).json();
  expect(p.noiseFloorDb).toBe(-62);
});

test("Settings › Audio: the output meter follows what Oak plays", async ({ page }) => {
  await noHmr(page);
  await useUiPrefs(page, { theme: "bark" });
  const problems = watchErrors(page);
  await page.goto("/settings/audio");
  const meter = page.getByTestId("output-meter");
  await expect(meter).toHaveAttribute("data-playing", "0");
  await expect(meter).toContainText("Silent");
  await page.getByTestId("audio-phrase").focus();
  await page.keyboard.press("Enter");
  await expect(meter).toHaveAttribute("data-playing", "1", { timeout: 15_000 });
  await expect(meter).toContainText(/-\d+ dBFS/);
  await shootAll(page, "45-settings-audio-meter");
  await expect(meter).toHaveAttribute("data-playing", "0", { timeout: 15_000 });
  // The phrase was measured on the master bus, before and after the limiter (Wave 6: the Master meter): its
  // average level and loudest moment in dB below full scale, and a practice-level phrase leaves the limiter alone.
  const readout = page.getByTestId("audio-readout");
  await expect(readout).toHaveText(
    /^Measured over that phrase: average level −\d+\.\d dB, loudest moment −\d+\.\d dB before the limiter \(0 dB is full scale\)\. The limiter rested\.$/,
    { timeout: 15_000 },
  );
  const said = (await readout.textContent()) ?? "";
  const [level, peak] = [...said.matchAll(/−(\d+\.\d) dB/g)].map((m) => -Number(m[1]));
  console.log(`settings audio read-out: ${said}`);
  // A piano phrase at practice volume: well under full scale, its peak above its average.
  expect(level).toBeLessThan(-12);
  expect(level).toBeGreaterThan(-45);
  expect(peak).toBeGreaterThan(level as number);
  expect(peak).toBeLessThan(-3);
  await shootAll(page, "46-settings-audio-readout");
  await expectNoOverflow(page);
  expect(problems).toEqual([]);
});
