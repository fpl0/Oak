// Keyboard-only use of every widget (ux §7.9 "keyboard-complete", §7.10 keys): focus lands on the widget's first
// control (what `autoFocus` does for a host), then only keys answer and check. The gallery's stand-in host checks
// against the example's answer and shows the result in the widget's own feedback line.
import { expect, type Locator, type Page, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { collectErrors, openGallery } from "./fixtures.ts";

const live = (page: Page, id: string): Locator => page.locator(`[data-live="${id}"]`);
const status = (page: Page, id: string): Locator => live(page, id).getByTestId("answer-status");

async function expectCorrect(page: Page, id: string): Promise<void> {
  await expect(status(page, id)).toHaveText("That's it.");
}

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = collectErrors(page);
  await useUiPrefs(page, { theme: "paper" });
  await openGallery(page, "?state=idle");
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

test("choices, pads and bars: number keys pick, Enter checks", async ({ page }) => {
  await live(page, "choice").getByRole("radio").first().focus();
  await page.keyboard.press("3");
  await expect(live(page, "choice").getByRole("radio", { name: "3. G" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(status(page, "choice")).toHaveText("G is V. Count four letters up from C: C D E F.");
  // Arrows move and pick in a radio group; the next check passes.
  await page.keyboard.press("ArrowLeft");
  await expect(live(page, "choice").getByRole("radio", { name: "2. F" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("Enter");
  await expectCorrect(page, "choice");

  await live(page, "choice-multi").getByRole("checkbox").first().focus();
  await page.keyboard.press("1");
  await page.keyboard.press("3");
  await page.keyboard.press("Enter");
  await expectCorrect(page, "choice-multi");

  await live(page, "degree-pad").getByRole("radio").first().focus();
  await page.keyboard.press("5");
  await page.keyboard.press("Enter");
  await expectCorrect(page, "degree-pad");

  await live(page, "degree-seq").locator("[data-degree]").first().focus();
  for (const k of ["3", "2", "2", "Backspace", "1", "2"]) await page.keyboard.press(k);
  await expect(live(page, "degree-seq").getByRole("list", { name: "Your degrees" })).toContainText(
    "3mi2re1do2re",
  );
  await page.keyboard.press("Enter");
  await expectCorrect(page, "degree-seq");

  await live(page, "degree-minor").getByRole("radio").first().focus();
  await page.keyboard.press("3");
  await expect(live(page, "degree-minor").getByRole("radio", { name: "flat 3" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("Enter");
  await expectCorrect(page, "degree-minor");

  await live(page, "quality-pad").getByRole("radio").first().focus();
  await page.keyboard.press("2");
  await page.keyboard.press("Enter");
  await expectCorrect(page, "quality-pad");

  await live(page, "bar-buttons").getByRole("radio").first().focus();
  await page.keyboard.press("3");
  await page.keyboard.press("Enter");
  await expectCorrect(page, "bar-buttons");

  await live(page, "same-different").getByRole("radio").first().focus();
  await page.keyboard.press("2");
  await page.keyboard.press("Enter");
  await expectCorrect(page, "same-different");
});

test("Roman numerals: digits, Shift for sevenths, - for borrowed, M, Backspace", async ({ page }) => {
  const w = live(page, "rn-palette");
  await w.locator("[data-rn]").first().focus();
  const slots = w.getByRole("list", { name: "Your numerals" });
  for (const k of ["1", "5", "6", "Shift+5"]) await page.keyboard.press(k);
  await expect(slots).toContainText("bar 1Ibar 2Vbar 3vibar 4V7");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("-");
  await page.keyboard.press("7");
  await expect(slots).toContainText("bar 4♭VII");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("4");
  await page.keyboard.press("m");
  await expect(slots).toContainText("bar 4iv");
  await page.keyboard.press("m");
  await expect(slots).toContainText("bar 4IV");
  await page.keyboard.press("Enter");
  await expectCorrect(page, "rn-palette");
});

test("text and numbers: forgiving input, the reading shown before the check", async ({ page }) => {
  const note = live(page, "text-note").getByRole("textbox");
  await note.focus();
  await page.keyboard.type("e flat");
  await expect(live(page, "text-note")).toContainText("Reads as E♭");
  await page.keyboard.press("Enter");
  await expectCorrect(page, "text-note");

  await live(page, "text-interval").getByRole("textbox").focus();
  await page.keyboard.type("perfect fifth");
  await expect(live(page, "text-interval")).toContainText("Reads as P5");
  await page.keyboard.press("Enter");
  await expectCorrect(page, "text-interval");

  await live(page, "number").getByRole("textbox").focus();
  await page.keyboard.type("3");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(live(page, "number").getByRole("textbox")).toHaveValue("6");
  await page.keyboard.press("Enter");
  await expectCorrect(page, "number");
});

test("piano: the typing row plays and picks, Z/X move the octave", async ({ page }) => {
  const one = live(page, "keyboard");
  await one.locator("[data-midi][tabindex='0']").focus();
  await page.keyboard.press("x");
  await page.keyboard.press("a");
  await expect(one.getByRole("button", { name: "C 4, picked" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expectCorrect(page, "keyboard");

  const chord = live(page, "keyboard-chord");
  await chord.locator("[data-midi][tabindex='0']").focus();
  for (const k of ["f", "g", "Backspace", "h", "k"]) await page.keyboard.press(k);
  await expect(chord).toContainText("Picked: F4A4C5");
  await page.keyboard.press("Enter");
  await expectCorrect(page, "keyboard-chord");
});

test("rhythm grid: arrows walk the cells, Space toggles", async ({ page }) => {
  const grid = live(page, "grid");
  await grid.locator("[data-cell='0:0']").focus();
  await page.keyboard.press("Space");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("x");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(grid.locator("[data-cell][aria-pressed='true']")).toHaveCount(3);
  await page.keyboard.press("Enter");
  await expectCorrect(page, "grid");
});

test("ordering: Alt+→ places, Alt+↑/↓ moves, Backspace takes out", async ({ page }) => {
  const w = live(page, "order");
  const place = async (id: string) => {
    await w.locator(`[data-list="pool"] [data-block="${id}"]`).focus();
    await page.keyboard.press("Alt+ArrowRight");
  };
  for (const id of ["c", "am", "g", "dm", "f"]) await place(id);
  await w.locator('[data-list="answer"] [data-block="dm"]').focus();
  await page.keyboard.press("Backspace");
  await w.locator('[data-list="answer"] [data-block="am"]').focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(w.locator('[data-list="answer"] [data-block]')).toHaveText(["1C", "2G", "3Am", "4F"]);
  await page.keyboard.press("Enter");
  await expectCorrect(page, "order");
});

test("code: blanks, the code field, and pointing at a token", async ({ page }) => {
  const blanks = live(page, "blanks");
  await blanks.getByRole("textbox", { name: "Blank 1" }).focus();
  await page.keyboard.type("0 2 4 7");
  await page.keyboard.press("Tab");
  await expect(blanks.getByRole("combobox", { name: "Blank 2" })).toBeFocused();
  await blanks.getByRole("combobox", { name: "Blank 2" }).selectOption("piano");
  await page.keyboard.press("Enter");
  await expectCorrect(page, "blanks");

  const code = live(page, "code").getByRole("textbox");
  await code.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type('setcpm(90/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")');
  // Enter is a new line here; Mod+Shift+Enter checks.
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expectCorrect(page, "code");

  const click = live(page, "click-code");
  await click.getByRole("radio").first().focus();
  for (const k of ["ArrowDown", "ArrowDown", "ArrowRight", "ArrowRight", "ArrowRight"])
    await page.keyboard.press(k);
  await expect(click).toContainText("Pointing at sd on line 4");
  await page.keyboard.press("Enter");
  await expectCorrect(page, "click-code");
});

test("staff and roll picks", async ({ page }) => {
  const staff = live(page, "click-staff");
  await expect(staff.locator(".oak-staff[data-status='ready']")).toBeVisible();
  await staff.locator(".oak-staff-host [tabindex='0']").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(staff).toContainText("Pointing at E4, degree 3, bar 1, beat 2");
  await staff.getByRole("button", { name: "Check" }).focus();
  await page.keyboard.press("Enter");
  await expectCorrect(page, "click-staff");

  const roll = live(page, "click-roll");
  await roll.getByRole("radiogroup", { name: "Notes, in time order" }).getByRole("radio").first().focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(roll).toContainText("Pointing at G4, degree 5");
  await page.keyboard.press("Enter");
  await expectCorrect(page, "click-roll");
});

test("sliders and hum-to-predict", async ({ page }) => {
  const tempo = live(page, "slider-tempo").getByRole("slider");
  await tempo.focus();
  await page.keyboard.press("PageDown");
  await page.keyboard.press("PageDown");
  await expect(live(page, "slider-tempo")).toContainText("100 BPM");
  await page.keyboard.press("Enter");
  await expectCorrect(page, "slider-tempo");

  await live(page, "slider-swing").getByRole("slider").focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowRight");
  await expect(live(page, "slider-swing")).toContainText("1/3 (triplet swing)");
  await page.keyboard.press("Enter");
  await expectCorrect(page, "slider-swing");

  const hum = live(page, "hum");
  await hum.getByRole("button", { name: "Hum it" }).focus();
  await page.keyboard.press("Enter");
  await expect(hum).toContainText("Hum what you expect to hear.");
  await expect(hum).toContainText("Now run the code and compare.", { timeout: 6000 });
  await hum.getByRole("button", { name: "Check" }).focus();
  await page.keyboard.press("Enter");
  await expectCorrect(page, "hum");
});
