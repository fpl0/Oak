// Staff input, the key-signature builder, the circle of fifths and the interval pad (Wave 3): notes placed by
// keyboard and by pointer (click, then drag to move), every placement read back to screen readers, a full answer
// checked wrong (per-note marks) then fixed by keyboard and checked right; a key signature written out of order,
// fixed, and read back; a key picked on the circle; an interval built from its number and quality.
import { expect, type Locator, type Page, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { collectErrors, openGallery } from "./fixtures.ts";

const live = (page: Page, id: string): Locator => page.locator(`[data-live="${id}"]`);
const status = (page: Page, id: string): Locator => live(page, id).getByTestId("answer-status");
const typed = (page: Page, id: string): Locator => live(page, id).locator("input[id$='-typed']");

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = collectErrors(page);
  await page.routeWebSocket(/.*/, () => {});
  await useUiPrefs(page, { theme: "paper" });
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** The staff's top line, line spacing and the x range of bar 1, in page pixels. */
async function staffBox(page: Page, id: string) {
  const w = live(page, id);
  await expect(w.locator("[data-status='ready'] .abcjs-staff").first()).toBeVisible();
  return w.evaluate((root) => {
    const staff = root.querySelector("g.abcjs-staff") as Element;
    const r = staff.getBoundingClientRect();
    const extras = [...root.querySelectorAll(".abcjs-staff-extra")].map(
      (e) => e.getBoundingClientRect().right,
    );
    const bar = (root.querySelector(".abcjs-bar") as Element).getBoundingClientRect();
    return { top: r.top, sp: r.height / 4, x0: Math.max(...extras), x1: bar.left };
  });
}

test("keyboard only: letters place, a wrong note is marked, arrows fix it, Enter checks", async ({
  page,
}) => {
  await openGallery(page, "?only=staff-input&state=idle");
  const w = live(page, "staff-input");
  await expect(w.locator("[data-status='ready']")).toBeVisible();
  await w.getByTestId("staff-surface").focus();
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowDown");
  for (const k of ["c", "f", "g", "c"]) await page.keyboard.press(k);
  await expect(w.getByTestId("staff-say")).toHaveText("C5, quarter, bar 1 beat 4");
  await expect(typed(page, "staff-input")).toHaveValue("C4:4 F4:4 G4:4 C5:4");
  await page.keyboard.press("Enter");
  await expect(status(page, "staff-input")).toHaveText(
    "The second note is one space too high: E4 is the bottom line.",
  );
  const notes = w.getByRole("list", { name: "Your notes" });
  await expect(notes.getByRole("listitem").nth(1)).toHaveText("F4, quarter, bar 1 beat 2, not this one");
  await expect(notes.getByRole("listitem").nth(0)).toHaveText("C4, quarter, bar 1 beat 1, right");
  await expect(w.locator(".oak-si-bad").first()).toBeVisible();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(w.getByTestId("staff-say")).toHaveText("On F4, quarter, bar 1 beat 2");
  await page.keyboard.press("ArrowDown");
  await expect(typed(page, "staff-input")).toHaveValue("C4:4 E4:4 G4:4 C5:4");
  await page.keyboard.press("Enter");
  await expect(status(page, "staff-input")).toHaveText("That's it.");
});

test("pointer: click places on lines and spaces, drag moves, the ghost follows", async ({ page }) => {
  await openGallery(page, "?only=staff-input&state=idle");
  const w = live(page, "staff-input");
  let s = await staffBox(page, "staff-input");
  const y = (step: number) => s.top + (step * s.sp) / 2;
  // Middle C: one ledger line below the treble staff (step 10), on beat 1.
  await page.mouse.move(s.x0 + 6, y(10));
  await expect(w.getByTestId("staff-ghost")).toBeVisible();
  await page.mouse.click(s.x0 + 6, y(10));
  await expect(typed(page, "staff-input")).toHaveValue("C4:4 r:4 r:2");
  // E4, the bottom line, where the quarter rest stands now (beat 2).
  const rest = await w.locator(".abcjs-rest").first().boundingBox();
  if (!rest) throw new Error("no rest");
  s = await staffBox(page, "staff-input");
  await page.mouse.click(rest.x + rest.width / 2, y(8));
  await expect(typed(page, "staff-input")).toHaveValue("C4:4 E4:4 r:2");
  // Drag the E4 up to G4 (second line).
  const head = await w.locator(".oak-e1 .abcjs-notehead").first().boundingBox();
  if (!head) throw new Error("no notehead");
  s = await staffBox(page, "staff-input");
  await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2);
  await page.mouse.down();
  await page.mouse.move(head.x + head.width / 2, y(6) - 3, { steps: 4 });
  await page.mouse.move(head.x + head.width / 2, y(6), { steps: 2 });
  await page.mouse.up();
  await expect(typed(page, "staff-input")).toHaveValue("C4:4 G4:4 r:2");
  // A click on a note selects it (the toolbar's Delete then removes it).
  const g4 = await w.locator(".oak-e1 .abcjs-notehead").first().boundingBox();
  if (!g4) throw new Error("no notehead");
  await page.mouse.click(g4.x + g4.width / 2, g4.y + g4.height / 2);
  await expect(w.getByTestId("staff-say")).toHaveText("Selected G4, quarter, bar 1 beat 2");
  await w.getByRole("button", { name: "Delete note" }).click();
  await expect(typed(page, "staff-input")).toHaveValue("C4:4 r:4 r:2");
});

test("the typed note list is the accessible alternative and stays in sync", async ({ page }) => {
  await openGallery(page, "?only=staff-key&state=idle");
  const w = live(page, "staff-key");
  await w.getByText("Type the notes instead").click();
  await typed(page, "staff-key").fill("G4 A4 B4 G4 D5:2 G4:2");
  await expect(w.getByRole("list", { name: "Your notes" }).getByRole("listitem")).toHaveCount(6);
  await w.getByRole("button", { name: "Check" }).click();
  await expect(status(page, "staff-key")).toHaveText("That's it.");
});

test("rhythm: digits pick the length, Ctrl+arrows move by an octave; a passed staff is read-only", async ({
  page,
}) => {
  await openGallery(page, "?only=staff-key&state=idle");
  const w = live(page, "staff-key");
  await expect(w.locator("[data-status='ready']")).toBeVisible();
  await w.getByTestId("staff-surface").focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
  for (const k of ["g", "a", "b", "g", "5", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "d", "g"])
    await page.keyboard.press(k);
  // G is nearer above D5: the last note is G5, still under the cursor; Ctrl+↓ takes it down an octave.
  await expect(typed(page, "staff-key")).toHaveValue("G4:4 A4:4 B4:4 G4:4 | D5:2 G5:2");
  await page.keyboard.press("Control+ArrowDown");
  await expect(typed(page, "staff-key")).toHaveValue("G4:4 A4:4 B4:4 G4:4 | D5:2 G4:2");
  await expect(w.getByRole("button", { name: "half" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(status(page, "staff-key")).toHaveText("That's it.");
  // Passed: the staff is read-only now; a key changes nothing.
  await page.keyboard.press("Home");
  await page.keyboard.press("f");
  await expect(typed(page, "staff-key")).toHaveValue("G4:4 A4:4 B4:4 G4:4 | D5:2 G4:2");
});

test("key signature: out of order is marked and read back; fixed by keys; flats on the bass staff", async ({
  page,
}) => {
  await openGallery(page, "?only=keysig&state=idle");
  const w = live(page, "keysig");
  await expect(w.locator("[data-status='ready']")).toBeVisible();
  await w.getByTestId("keysig-surface").focus();
  await page.keyboard.press("c");
  await page.keyboard.press("f");
  await page.keyboard.press("Enter");
  await expect(status(page, "keysig")).toHaveText("Sharps are written in the order F C G D A E B.");
  await expect(w.getByTestId("keysig-reading")).toHaveText(
    "The right sharps for D major or B minor, but written out of order.",
  );
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("f");
  await page.keyboard.press("c");
  await page.keyboard.press("Enter");
  await expect(status(page, "keysig")).toHaveText("That's it.");
  await expect(w.getByTestId("keysig-reading")).toHaveText("Reads as D major or B minor.");

  // The key-signature staff has no circle any more (one click on the asked key filled the whole answer in):
  // the flats are placed by keys, `-` for flats, then the letters in order.
  await openGallery(page, "?only=keysig-bass&state=idle");
  const b = live(page, "keysig-bass");
  await expect(b.getByRole("radio", { name: "E flat major" })).toHaveCount(0);
  await b.getByTestId("keysig-surface").focus();
  for (const k of ["-", "b", "e", "a"]) await page.keyboard.press(k);
  await expect(b.getByRole("list", { name: "Your key signature" })).toHaveText("B♭E♭A♭");
  await page.keyboard.press("Enter");
  await expect(status(page, "keysig-bass")).toHaveText("That's it.");
});

test("circle of fifths and interval pad by keyboard", async ({ page }) => {
  await openGallery(page, "?only=text-key&state=idle");
  const k = live(page, "text-key");
  await k.getByRole("radio", { name: "C major" }).focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowLeft");
  await expect(k.getByRole("radio", { name: "A flat major" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(status(page, "text-key")).toHaveText("A♭ major has four flats. One step back clockwise.");
  await page.keyboard.press("ArrowRight");
  await expect(k.getByRole("textbox")).toHaveValue("Eb major");
  await page.keyboard.press("Enter");
  await expect(status(page, "text-key")).toHaveText("That's it.");

  await openGallery(page, "?only=text-interval-quality&state=idle");
  const iv = live(page, "text-interval-quality");
  await iv.locator("[data-num]").first().focus();
  await page.keyboard.press("3");
  await expect(iv).toContainText("Now the quality: major, minor, augmented, diminished.");
  await page.keyboard.press("m");
  await expect(iv).toContainText("Reads as m3 (minor third)");
  await page.keyboard.press("Enter");
  await expect(status(page, "text-interval-quality")).toHaveText("That's it.");
});
