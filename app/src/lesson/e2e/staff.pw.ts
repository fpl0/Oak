// Staff writing in the lesson player: U02.L04 S5 against the real server (a dev seed) written on the staff
// itself, by keyboard only (letters place notes, arrows step, Mod+↑ moves a note an octave) and by mouse (a click
// places a note where the ghost note shows, a click on it selects it, Delete removes it); the same step through
// the widget's typed note list (its accessible alternative, opened with Enter or Space); and the dev fixture's key
// signature placed with letter keys, and with a click, on the key-signature staff.
import type { Locator, Page } from "@playwright/test";
import { expect, stepIs, test } from "./support.ts";
import { api, FIXTURE, reseedFresh, seed } from "./w3support.ts";

test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

/** Presses Tab until `target` has focus (at most `max` times): the keyboard's own way there. */
async function tabTo(page: Page, target: Locator, max = 40): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement || el.contains(document.activeElement)))
      return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Tab never reached the target");
}

test.describe.configure({ mode: "serial" });

/** The staff's value, as its typed alternative mirrors it. */
const staffValue = (page: Page) => page.locator('input[aria-label$="(as text)"]').inputValue();

test("U02.L04 S5: the notes written on the staff itself with the keyboard, an octave fixed, passed", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seed(page, "after U02.L03");
  await page.goto("/learn/U02.L04?step=S5");
  await stepIs(page, "S5");
  const surface = page.getByTestId("staff-surface");
  await tabTo(page, surface);
  // The ghost starts on the middle line (B4): six steps down is C4, below the staff.
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
  for (const k of ["c", "e", "g"]) await page.keyboard.press(k);
  expect(await staffValue(page)).toMatch(/^C4:4 E4:4 G4:4/);
  await page.keyboard.press("c");
  // Whichever C the letter took, put the last note an octave too low first: a check that fails on answer 4.
  // Home, then three quarters right: the cursor sits on the fourth note.
  const toFourth = async () => {
    await page.keyboard.press("Home");
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("staff-say")).toContainText(/^On C\d/);
  };
  if ((await staffValue(page)).includes("C5:4")) {
    await toFourth();
    await page.keyboard.press("ControlOrMeta+ArrowDown");
  }
  expect(await staffValue(page)).toBe("C4:4 E4:4 G4:4 C4:4");
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  const fb = page.getByTestId("step-feedback");
  await expect(fb).toHaveAttribute("data-status", "fail");
  await expect(fb).not.toContainText(/C5|c5/);
  // Mod+↑ on the last note: an octave up. Checked again: a pass, stored on the server.
  await surface.focus();
  await toFourth();
  await page.keyboard.press("ControlOrMeta+ArrowUp");
  expect(await staffValue(page)).toBe("C4:4 E4:4 G4:4 C5:4");
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(fb).toHaveAttribute("data-status", "pass");
  const s5 = await api<{ passed: boolean; attempts: number }>(page, "GET", "/lessons/U02.L04/steps/S5");
  expect(s5.body).toMatchObject({ passed: true, attempts: 2 });
});

test("U02.L04 S5 by mouse: a click places a note, a click selects it, Delete removes it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seed(page, "after U02.L03");
  await page.goto("/learn/U02.L04?step=S5");
  await stepIs(page, "S5");
  const surface = page.getByTestId("staff-surface");
  const box = await surface.boundingBox();
  if (!box) throw new Error("no staff");
  // Over the staff, near the start of the bar: the ghost shows where the note will go.
  const at = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.5 };
  await page.mouse.move(at.x, at.y);
  await expect(page.getByTestId("staff-ghost")).toBeVisible();
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => staffValue(page)).toMatch(/[A-G]\d:4/);
  const placed = await staffValue(page);
  // Clicking the note itself (its engraved head) selects it; Delete removes it, and the staff is empty again.
  const head = page.getByTestId("lesson-step").locator(".abcjs-note").first();
  const hb = await head.boundingBox();
  if (!hb) throw new Error("the note is not engraved");
  await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height - 4);
  await expect(page.getByTestId("staff-say")).toContainText(/C5|[A-G]\d/);
  await page.keyboard.press("Delete");
  await expect.poll(() => staffValue(page)).not.toBe(placed);
  expect((await staffValue(page)).replace(/r:\d+/g, "").trim()).toBe("");
  await expect(page.getByTestId("continue")).toBeDisabled();
});

test("U02.L04 S5: notes through the typed alternative, keyboard only, against the server", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seed(page, "after U02.L03");
  await page.goto("/learn/U02.L04?step=S5");
  await stepIs(page, "S5");
  await expect(page.getByTestId("step-title")).toBeFocused();
  await expect(page.getByTestId("continue")).toBeDisabled();

  // Open the typed note list from the keyboard (Enter, as any disclosure), then type a wrong list and check.
  const summary = page.getByText("Type the notes instead", { exact: true });
  await tabTo(page, summary);
  await page.keyboard.press("Enter");
  const typed = page.getByRole("textbox", { name: /as text/ });
  await tabTo(page, typed);
  await page.keyboard.type("C4:4 F4:4 G4:4 C5:4");
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
  await expect(page.getByTestId("step-feedback")).toContainText("Note 2");
  await expect(page.getByTestId("continue")).toBeDisabled();

  // Fix the second note and check again: a pass, stored on the server.
  await typed.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("C4:4 E4:4 G4:4 C5:4");
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass");
  const s5 = await api<{ passed: boolean; attempts: number }>(page, "GET", "/lessons/U02.L04/steps/S5");
  expect(s5.body).toMatchObject({ passed: true, attempts: 2 });
  await page.getByTestId("step-title").focus();
  await page.keyboard.press("Enter");
  await stepIs(page, "S6");
});

test("a key signature placed in order with letter keys (dev fixture)", async ({ page }) => {
  await page.goto(`${FIXTURE}&step=S2`);
  await stepIs(page, "S2");
  const staff = page
    .getByRole("img", { name: /Key signature staff/ })
    .or(page.getByLabel(/Key signature staff/));
  await tabTo(page, staff.first());
  await page.keyboard.type("f");
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
  await staff.first().focus();
  await page.keyboard.type("c");
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass");
  await expect(page.getByTestId("continue")).toBeEnabled();
});

test("a key signature by mouse: a click adds the accidental under the pointer, Backspace takes it off", async ({
  page,
}) => {
  await page.goto(`${FIXTURE}&step=S2`);
  await stepIs(page, "S2");
  const surface = page.getByTestId("keysig-surface");
  const box = await surface.boundingBox();
  if (!box) throw new Error("no key-signature staff");
  const list = page.getByRole("list", { name: "Your key signature" }).locator("li");
  await expect(list).toHaveText(["Nothing placed yet."]);
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.45);
  await expect(list).toHaveCount(1);
  await expect(list.first()).toHaveText(/[♯♭]/);
  await surface.focus();
  await page.keyboard.press("Backspace");
  await expect(list).toHaveText(["Nothing placed yet."]);
});

test("notes with a key signature: G major, F♯ by the signature (dev fixture)", async ({ page }) => {
  await page.goto(`${FIXTURE}&step=S3`);
  await stepIs(page, "S3");
  const summary = page.getByText("Type the notes instead", { exact: true });
  await tabTo(page, summary);
  await page.keyboard.press("Space");
  const typed = page.getByRole("textbox", { name: /as text/ });
  await tabTo(page, typed);
  await page.keyboard.type("G4:4 A4:4 B4:4 C5:4 | D5:4 E5:4 F5:4 G5:4");
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
  await typed.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("G4:4 A4:4 B4:4 C5:4 | D5:4 E5:4 F#5:4 G5:4");
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass");
});
