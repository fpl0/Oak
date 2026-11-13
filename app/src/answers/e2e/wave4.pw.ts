// The Wave 4 answer widgets, keyboard only (ux §7.9, §7.10): the function and cadence strips, chord names typed
// or built, chords on the staff (treble and grand) and on the keyboard, Roman numerals in a key with inversion
// figures and half-bar slots, and the staged chord dictation (bass, then quality, then numerals). Then the submit
// verb in a checkpoint, the chord-symbol lens off, and the staged flow's screenshots in both themes and sizes.
import { expect, type Locator, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { collectErrors, openGallery, SHOTS } from "./fixtures.ts";

const live = (page: Page, id: string): Locator => page.locator(`[data-live="${id}"]`);
const status = (page: Page, id: string): Locator => live(page, id).getByTestId("answer-status").first();

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = collectErrors(page);
  await useUiPrefs(page, { theme: "paper" });
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

test("function strip and cadences: digits fill slot after slot, Backspace clears, Enter checks", async ({
  page,
}) => {
  await openGallery(page, "?only=slot-function&state=idle");
  const w = live(page, "slot-function");
  await w.locator("[data-slot='0']").focus();
  for (const k of ["1", "3", "3", "1"]) await page.keyboard.press(k);
  await page.keyboard.press("Enter");
  await expect(status(page, "slot-function")).toHaveText(/predominant/);
  await expect(
    w.getByRole("button", { name: /^Bar 2: D: tension \(dominant\), not this one$/ }),
  ).toBeVisible();
  // ←: back to bar 2, then 2 puts PD there.
  await w.locator("[data-slot='0']").focus();
  await page.keyboard.press("ArrowRight");
  await expect(w.locator("[data-slot='1']")).toBeFocused();
  await page.keyboard.press("2");
  await page.keyboard.press("Enter");
  await expect(status(page, "slot-function")).toHaveText("That's it.");
  // The host can play a slot: the button names it.
  await expect(w.getByRole("button", { name: /^Hear bar [1-4]$/ })).toBeVisible();

  await openGallery(page, "?only=slot-cadence&state=idle");
  const c = live(page, "slot-cadence");
  await c.locator("[data-slot='0']").focus();
  await page.keyboard.press("2");
  await page.keyboard.press("1");
  await page.keyboard.press("Backspace");
  await expect(c.getByRole("button", { name: /^Phrase 2: empty/ })).toBeVisible();
  await c.locator("[data-slot='0']").focus();
  await page.keyboard.press("3");
  await page.keyboard.press("1");
  await page.keyboard.press("Enter");
  await expect(status(page, "slot-cadence")).toHaveText("That's it.");
});

test("chord names: forgiving entry shows the lead-sheet symbol; the picker builds C/E", async ({ page }) => {
  await openGallery(page, "?only=text-chord&state=idle");
  const w = live(page, "text-chord");
  const field = w.getByRole("textbox");
  for (const [typed, shown] of [
    ["co", "C°"],
    ["Cdim", "C°"],
    ["c+", "C+"],
    ["Caug", "C+"],
    ["G/B", "G/B, first inversion"],
  ] as const) {
    await field.fill(typed);
    const [symbol, inversion] = shown.split(", ");
    await expect(w.getByTestId("chord-reads")).toContainText(`Reads as ${symbol}`);
    if (inversion) await expect(w.getByTestId("chord-reads")).toContainText(inversion);
  }
  await field.fill("Em");
  await field.press("Enter");
  await expect(status(page, "text-chord")).toHaveText(/E G C stacks into C E G/);
  // Build it instead: root C, quality major, bass E.
  await field.fill("");
  await w.getByRole("button", { name: "C", exact: true }).click();
  await expect(field).toHaveValue("C");
  await w.getByRole("button", { name: "minor", exact: true }).click();
  await expect(field).toHaveValue("Cm");
  await w.getByRole("button", { name: "major", exact: true }).click();
  await w.getByLabel("Bass").selectOption("E");
  await expect(field).toHaveValue("C/E");
  await expect(w.getByTestId("chord-reads")).toContainText("Reads as C/E");
  await expect(w.getByTestId("chord-reads")).toContainText("first inversion");
  await field.press("Enter");
  await expect(status(page, "text-chord")).toHaveText("That's it.");
});

test("chords on the staff by keyboard: stack, step on, stack under the top; named after the check", async ({
  page,
}) => {
  await openGallery(page, "?only=staff-chords&state=idle");
  const w = live(page, "staff-chords");
  await expect(w.locator("[data-status='ready']")).toBeVisible({ timeout: 30_000 });
  await w.getByTestId("staff-surface").focus();
  // The ghost starts on B4: down an octave, then C E G stack C4 E4 G4.
  await page.keyboard.press("Control+ArrowDown");
  for (const k of ["c", "e", "g"]) await page.keyboard.press(k);
  await expect(w.getByTestId("staff-say")).toHaveText("G4 added. The chord: C4 E4 G4");
  await page.keyboard.press("ArrowRight");
  // A new chord on beat 3: G, then D and B under it.
  await page.keyboard.press("g");
  await page.keyboard.press("Shift+D");
  await page.keyboard.press("Shift+B");
  const chords = w.getByTestId("staff-chords");
  await expect(chords.getByRole("listitem")).toHaveCount(2);
  await expect(chords.getByRole("listitem").nth(1)).toContainText("B D G, B at the bottom");
  // Not named yet (the step names chords after a check).
  await expect(chords.getByTestId("chord-name")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(status(page, "staff-chords")).toHaveText("That's it.");
  await expect(chords.getByTestId("chord-name").nth(0)).toHaveText("C: C major, root position");
  await expect(chords.getByTestId("chord-name").nth(1)).toHaveText("G/B: G major, first inversion");
});

test("a chord on the grand staff, named live; Backspace takes out the selected note", async ({ page }) => {
  await openGallery(page, "?only=staff-grand-chords&state=idle");
  const w = live(page, "staff-grand-chords");
  await expect(w.locator("[data-status='ready']")).toBeVisible({ timeout: 30_000 });
  await w.getByTestId("staff-surface").focus();
  await page.keyboard.press("Control+ArrowDown");
  for (const k of ["c", "e", "g"]) await page.keyboard.press(k);
  await page.keyboard.press("Shift+C");
  await expect(w.getByTestId("chord-name")).toHaveText("C: C major, root position");
  // C3 is the wrong bass: the ghost is on it after Shift+C, so Backspace removes it; E3 goes under instead.
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Shift+E");
  await expect(w.getByTestId("staff-say")).toContainText("E3");
  await expect(w.getByTestId("chord-name")).toHaveText("C/E: C major, first inversion");
  await page.keyboard.press("Enter");
  await expect(status(page, "staff-grand-chords")).toHaveText("That's it.");
});

test("the keyboard builds a chord and names it live", async ({ page }) => {
  await openGallery(page, "?only=keyboard-build&state=idle");
  const w = live(page, "keyboard-build");
  await w.locator("[data-midi='60']").focus();
  // Typing row: S = D, F = F, H = A (octave 4).
  for (const k of ["s", "f", "h"]) await page.keyboard.press(k);
  await expect(w.getByTestId("keyboard-chord")).toContainText("D at the bottom");
  await expect(w.getByTestId("chord-name")).toHaveText(". Dm: D minor, root position");
  await expect(w.getByRole("button", { name: "Hear the chord" })).toBeEnabled();
  await page.keyboard.press("Enter");
  await expect(status(page, "keyboard-build")).toHaveText("That's it.");
});

test("Roman numerals in F: half-bar slots, I steps the figure, buttons show the chord in the key", async ({
  page,
}) => {
  await openGallery(page, "?only=rn-key&state=idle");
  const w = live(page, "rn-key");
  await expect(w.getByRole("button", { name: /^IV, B♭, key 4$/ })).toBeVisible();
  await w.locator("[data-rn-slot='0']").focus();
  await page.keyboard.press("1");
  await page.keyboard.press("5");
  await page.keyboard.press("i");
  await expect(w.getByRole("button", { name: /^Bar 1, beat 3: V 6$/ })).toBeVisible();
  await page.keyboard.press("6");
  await page.keyboard.press("4");
  await expect(w.getByRole("button", { name: "Play" })).toBeEnabled();
  await page.keyboard.press("Enter");
  await expect(status(page, "rn-key")).toHaveText("That's it.");

  // The chord-symbol lens off: no "· B♭" on the buttons.
  await openGallery(page, "?only=rn-key&state=idle&lenses=off");
  await expect(live(page, "rn-key").getByRole("button", { name: /^IV, key 4$/ })).toBeVisible();
});

test("staged chord dictation: bass, then quality, then numerals; replays count down", async ({ page }) => {
  await openGallery(page, "?only=staged");
  const w = page.locator("[data-live='staged']");
  const stage = (s: string) => w.locator(`[data-stage="${s}"]`);
  await expect(stage("quality")).toHaveAttribute("data-status", "locked");
  await expect(stage("quality")).toContainText("Opens when the bass is right.");
  await expect(w.getByTestId("replays-left")).toHaveText("Replays left: 6");
  await stage("bass").locator("[data-degree]").first().focus();
  await page.keyboard.press("r");
  await expect(w.getByTestId("replays-left")).toHaveText("Replays left: 5");
  await page.keyboard.press("Shift+R");
  await expect(w.getByTestId("replays-left")).toHaveText("Replays left: 4");
  // A wrong bass first: 1 2 6 4.
  for (const k of ["1", "2", "6", "4"]) await page.keyboard.press(k);
  await page.keyboard.press("Enter");
  await expect(stage("bass")).toHaveAttribute("data-status", "open");
  await expect(stage("bass").getByTestId("answer-status")).toHaveText("Not quite: 1 part differs.");
  await expect(stage("bass").getByRole("button", { name: "Show me" })).toBeVisible();
  await stage("bass").locator("[data-degree]").first().focus();
  for (const k of ["Backspace", "Backspace", "Backspace", "5", "6", "4"]) await page.keyboard.press(k);
  await page.keyboard.press("Enter");
  await expect(stage("bass")).toHaveAttribute("data-status", "passed");
  // The quality stage opens and takes focus: a strip of four, 1 maj, 2 min.
  await expect(stage("quality")).toHaveAttribute("data-status", "open");
  await expect(stage("quality").locator("[data-slot='0']")).toBeFocused();
  for (const k of ["1", "1", "2", "1"]) await page.keyboard.press(k);
  await page.keyboard.press("Enter");
  await expect(stage("quality")).toHaveAttribute("data-status", "passed");
  // Numerals, with the bass as a reminder.
  await expect(stage("rn").getByTestId("bass-reminder")).toContainText("Bass:");
  await expect(stage("rn").locator("[data-rn-slot='0']")).toBeFocused();
  // Stage 2 of BassFirstFlow (ux §4.5): the numerals over bar 1's bass (degree 1) are lit, the others dimmed.
  const filter = stage("rn").getByTestId("rn-bass-filter");
  await expect(filter).toHaveText("Lit: the chords with bass degree 1 in them, for bar 1.");
  for (const rn of ["I", "IV", "vi"])
    await expect(stage("rn").locator(`[data-rn="${rn}"]`)).not.toHaveAttribute("data-off-bass");
  for (const rn of ["ii", "iii", "V", "viio"])
    await expect(stage("rn").locator(`[data-rn="${rn}"]`)).toHaveAttribute("data-off-bass", "true");
  await shoot(page, SHOTS, "staged-rn-bass", "paper");
  for (const k of ["1", "5"]) await page.keyboard.press(k);
  // Bar 3 sits on degree 6: vi, IV and ii hold it.
  await expect(filter).toHaveText("Lit: the chords with bass degree 6 in them, for bar 3.");
  await expect(stage("rn").locator('[data-rn="V"]')).toHaveAttribute("data-off-bass", "true");
  await expect(stage("rn").locator('[data-rn="ii"]')).not.toHaveAttribute("data-off-bass");
  for (const k of ["6", "4"]) await page.keyboard.press(k);
  await page.keyboard.press("Enter");
  await expect(stage("rn")).toHaveAttribute("data-status", "passed");
  await expect(w.getByText("Every stage is done.")).toBeAttached();
});

test("a checkpoint's verb: every hint and the stage buttons say save", async ({ page }) => {
  await openGallery(page, "?only=slot-function&state=idle&verb=save");
  await expect(live(page, "slot-function")).toContainText("save");
  await expect(live(page, "slot-function").getByText("check", { exact: true })).toHaveCount(0);
  await openGallery(page, "?only=staged&verb=save");
  await expect(
    page.locator("[data-live='staged']").getByRole("button", { name: "Save the bass" }),
  ).toBeVisible();
});

for (const m of SCREENSHOT_MATRIX) {
  test(`staged dictation and the chord widgets: ${m.theme} ${m.width}x${m.height}`, async ({ page }) => {
    await page.setViewportSize({ width: m.width, height: m.height });
    await useUiPrefs(page, { theme: m.theme });
    await openGallery(page, "?only=staged");
    await expect(page.locator("[data-moment]")).toHaveCount(4);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shoot(page, SHOTS, "staged", m.theme);
  });
}
