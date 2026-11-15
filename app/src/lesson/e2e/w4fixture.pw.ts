// The Wave 4 step shapes in the real app, on the dev fixture U05.L99 (preview: nothing is saved): U05.L08's second
// chance at the voicing gate (the one hard gate: below 0.9 the step does not open and the box says what to fix;
// a pass opens it), U05.L07's gate check with its unlock moment (the learner's hand voicing next to Strudel's
// `chord("<C F G C>").voicing()`), a staged chord dictation (bass on the degree pad, a quality pad per chord,
// numerals; each stage opens after the one before; a one-bar loop in the source player), a by-ear step in parts
// (the bass part checked alone, then the chords; the step's Check opens after), a lead sheet read from the page,
// a step that opens the key panel over the grand staff, notes in the bass clef by the typed alternative, and
// the Make. Keyboard only where the widget allows it.
import type { Page } from "@playwright/test";
import {
  CADENCE_C,
  CADENCE_C_JUMPY,
  CADENCE_G,
  CADENCE_G_JUMPY,
  PARTS_BASS_ONLY,
  PARTS_REF,
} from "../dev/wave4-fixture.ts";
import { expect, setCode, stepIs, test, tryAgainIfShown } from "./support.ts";
import { noOverflow, reseedFresh, setQuiet } from "./w3support.ts";
import { openFixture } from "./w4support.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

const check = (page: Page) => page.getByTestId("check").click();
const cont = (page: Page) => page.getByTestId("continue");

async function verdict(page: Page, status: RegExp) {
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", status, { timeout: 30_000 });
}

test("the voicing gate: the hard second chance, then the gate check and the unlock moment", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openFixture(page);
  await stepIs(page, "S1");
  const box = page.getByTestId("gate-box");
  await expect(box).toHaveAttribute("data-tone", "open");
  await expect(page.getByTestId("gate-title")).toHaveText("One check before this lesson");
  await expect(cont(page), "the one hard gate: Continue waits for a gate pass").toBeDisabled();
  // Root-position jumps: below 0.9; the box says by how much and what to fix, and the step stays shut.
  await setCode(page, CADENCE_G_JUMPY.replace("[0,2,4]>", "[7,9,11]>"));
  await check(page);
  await verdict(page, /fail/);
  await expect(box).toHaveAttribute("data-tone", "near");
  await expect(page.getByTestId("gate-title")).toHaveText(/^\d+% of the 90% the gate needs$/);
  // What to fix is said in words, once: in the gate box, or in the step's own feedback line under it.
  const said = `${(await page.getByTestId("gate-box").textContent()) ?? ""} ${(await page.getByTestId("step-feedback").textContent()) ?? ""}`;
  expect(said).toMatch(/a voice moves \d+ half steps/);
  console.log(`[gate] ${said.replace(/\s+/g, " ")}`);
  await expect(cont(page)).toBeDisabled();
  // A retry at once with the smooth voicing opens it.
  await setCode(page, CADENCE_G);
  await check(page);
  await verdict(page, /pass/);
  await expect(box).toHaveAttribute("data-tone", "met");
  await expect(page.getByTestId("gate-title")).toHaveText(/the gate is open/);
  await expect(cont(page)).toBeEnabled();
  await cont(page).click();

  await stepIs(page, "S2");
  await expect(page.getByTestId("gate-title")).toHaveText("This check opens new tools");
  await setCode(page, CADENCE_C_JUMPY.replace("[0,2,4]>", "[7,9,11]>"));
  await check(page);
  await verdict(page, /fail/);
  await expect(page.getByTestId("gate-box")).toHaveAttribute("data-tone", "near");
  await expect(page.getByTestId("gate-moment")).toHaveCount(0);
  await setCode(page, CADENCE_C);
  await check(page);
  await verdict(page, /pass/);
  // The unlock moment: the hand voicing next to Strudel's, both drawn and playable.
  const moment = page.getByTestId("gate-moment");
  await expect(moment).toBeVisible();
  await expect(page.getByTestId("gate-strudel-code")).toHaveText(
    'chords: chord("<C F G C>").voicing().s("piano")',
    {
      timeout: 30_000,
    },
  );
  await expect(moment.locator("figure svg")).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByTestId("gate-play-strudel")).toBeEnabled();
  await page.getByTestId("gate-play-mine").click();
  await noOverflow(page);
});

test("a staged chord dictation: bass first, then one quality pad per chord, then numerals", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openFixture(page, "S3");
  await stepIs(page, "S3");
  const step = page.getByTestId("lesson-step");
  const stage = (id: string) => step.locator(`li[data-stage="${id}"]`);
  await expect(stage("bass")).toHaveAttribute("data-status", "open");
  await expect(stage("quality")).toHaveAttribute("data-status", "locked");
  await expect(stage("rn")).toHaveAttribute("data-status", "locked");
  // The source loops one bar at a time.
  await page.getByTestId("loop-bar-3").click();
  await expect(page.getByTestId("loop-bar-3")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("play-source").click();
  await expect(page.getByTestId("play-source")).toHaveAttribute("data-playing", "1");
  await page.getByTestId("play-source").click();
  // A wrong bass: the stage stays, the next one stays shut, and the lesson says where to listen.
  for (const d of ["1", "5", "5", "4"]) await stage("bass").locator(`[data-degree="${d}"]`).first().click();
  await stage("bass").getByRole("button", { name: "Check the bass" }).click();
  await expect(page.getByTestId("stage-verdict")).toHaveAttribute("data-status", "fail", { timeout: 30_000 });
  console.log(`[stage] ${(await page.getByTestId("stage-verdict").textContent())?.replace(/\s+/g, " ")}`);
  await expect(stage("quality")).toHaveAttribute("data-status", "locked");
  // Right: the quality stage opens.
  await stage("bass").locator("[data-degree]").first().focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("Backspace");
  for (const d of ["1", "5", "6", "4"]) await stage("bass").locator(`[data-degree="${d}"]`).first().click();
  await stage("bass").getByRole("button", { name: "Check the bass" }).click();
  await expect(stage("bass")).toHaveAttribute("data-status", "passed", { timeout: 30_000 });
  await expect(stage("quality")).toHaveAttribute("data-status", "open");
  // One quality per chord, on a strip of slots.
  for (const [c, q] of ["maj", "maj", "min", "maj"].entries()) {
    await stage("quality").locator(`[data-slot="${c}"]`).click();
    await stage("quality").locator(`[data-option="${q}"]`).click();
  }
  await stage("quality").getByRole("button", { name: "Check the quality" }).click();
  await expect(stage("rn")).toHaveAttribute("data-status", "open", { timeout: 30_000 });
  // The last stage is the step's own Check: everything is graded and saved.
  for (const [i, r] of ["I", "V", "vi", "IV"].entries()) {
    await stage("rn").locator(`[data-rn-slot="${i}"]`).click();
    await stage("rn").locator(`[data-rn="${r}"]`).click();
  }
  await stage("rn")
    .getByRole("button", { name: /^Check the / })
    .click();
  await verdict(page, /pass/);
  await expect(cont(page)).toBeEnabled();
  await noOverflow(page);
});

test("a by-ear step in parts: the bass checked alone, then the chords, then the whole", async ({ page }) => {
  test.setTimeout(120_000);
  await openFixture(page, "S4");
  await stepIs(page, "S4");
  const parts = page.getByTestId("by-ear-parts");
  await expect(parts.locator('[data-part-track="bass"]')).toHaveAttribute("data-mark", "open");
  await expect(parts.locator('[data-part-track="chords"]')).toHaveAttribute("data-mark", "locked");
  await expect(page.getByTestId("check"), "the step's Check waits for the parts").toBeDisabled();
  // Only the bass of the source can be heard.
  await page.getByTestId("hear-part").click();
  await expect(page.getByTestId("hear-part")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("loop-bar-2").click();
  // The bass right, the chords still wrong: the bass part passes on its own.
  await setCode(page, PARTS_BASS_ONLY);
  await page.getByTestId("check-part").click();
  await expect(parts.locator('[data-part-track="bass"]')).toHaveAttribute("data-mark", "passed", {
    timeout: 30_000,
  });
  await expect(parts.locator('[data-part-track="chords"]')).toHaveAttribute("data-mark", "open");
  await page.getByTestId("check-part").click();
  await expect(page.getByTestId("part-verdict")).toHaveAttribute("data-status", "fail");
  await expect(page.getByTestId("hear-part")).toHaveText("Only the chords");
  await setCode(page, PARTS_REF);
  await page.getByTestId("check-part").click();
  await expect(parts.locator('[data-part-track="chords"]')).toHaveAttribute("data-mark", "passed", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("check")).toBeEnabled();
  await check(page);
  await verdict(page, /pass/);
});

test("a lead sheet, the key panel over the grand staff, the bass clef, the Make", async ({ page }) => {
  test.setTimeout(120_000);
  await openFixture(page, "S5");
  await stepIs(page, "S5");
  const lead = page.getByTestId("lead-sheet");
  await expect(lead).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  await expect(lead).toHaveAttribute("data-chords", "C G Am F");
  await expect(lead.locator("svg")).toHaveCount(1);
  await page.getByTestId("lesson-step").locator('[data-option="F"]').click();
  await check(page);
  await verdict(page, /fail/);
  // The verdict locks the answer until Try again (docs/design/retry.md §2.5).
  await tryAgainIfShown(page);
  await page.getByTestId("lesson-step").locator('[data-option="Am"]').click();
  await check(page);
  await verdict(page, /pass/);
  await cont(page).click();

  await stepIs(page, "S6");
  await expect(page.getByTestId("key-panel").first(), "the step opens the key panel").toBeVisible({
    timeout: 30_000,
  });
  await cont(page).click();

  await stepIs(page, "S7");
  // The staff's typed alternative (keyboard and screen-reader users): open it, type the note list.
  await page.getByText("Type the notes instead").click();
  const typed = page.locator('input[aria-label$="(as text)"]');
  await typed.fill("C4:4 E4:4 G4:4");
  await check(page);
  await verdict(page, /fail/);
  await tryAgainIfShown(page);
  await typed.fill("C3:4 E3:4 G3:4");
  await check(page);
  await verdict(page, /pass/);
  await cont(page).click();

  await stepIs(page, "S8");
  await expect(page.locator('[data-rule="smooth"]')).toHaveAttribute("data-ok", "0", { timeout: 30_000 });
  await setCode(page, CADENCE_C);
  await expect(page.locator('[data-rule="smooth"]')).toHaveAttribute("data-ok", "1", { timeout: 30_000 });
  await page.getByTestId("save-sketch").click();
  await expect(page.getByTestId("lesson-complete")).toBeVisible({ timeout: 30_000 });
});

test("keyboard only: the staged dictation from the bass to the numerals", async ({ page }) => {
  test.setTimeout(120_000);
  await openFixture(page, "S3");
  await stepIs(page, "S3");
  const step = page.getByTestId("lesson-step");
  const stage = (id: string) => step.locator(`li[data-stage="${id}"]`);
  // The bass pad: digits enter degrees; Mod+Shift+Enter checks the stage that is open.
  await stage("bass").locator("[data-degree]").first().focus();
  for (const d of ["1", "5", "6", "4"]) await page.keyboard.press(d);
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(stage("quality")).toHaveAttribute("data-status", "open", { timeout: 30_000 });
  // Focus moves into the stage that opened; digits put a quality in each slot in turn (1 maj, 2 min).
  for (const d of ["1", "1", "2", "1"]) await page.keyboard.press(d);
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(stage("rn")).toHaveAttribute("data-status", "open", { timeout: 30_000 });
  // The RN palette: digits place the diatonic triad on that degree (6 → vi in C).
  for (const d of ["1", "5", "6", "4"]) await page.keyboard.press(d);
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass", { timeout: 30_000 });
});

test("Quiet mode: nothing on these steps waits for a voice", async ({ page }) => {
  test.setTimeout(90_000);
  await openFixture(page, "S5");
  await setQuiet(page, true);
  await page.reload();
  await stepIs(page, "S5");
  await expect(page.getByTestId("lead-sheet")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Sing", exact: true })).toHaveCount(0);
  await page.goto("/learn/U05.L99?preview=true&step=S3");
  await stepIs(page, "S3");
  await expect(page.getByTestId("play-source")).toBeEnabled();
  await expect(page.getByTestId("check-stage")).toHaveText("Check the bass");
  await setQuiet(page, false);
});
