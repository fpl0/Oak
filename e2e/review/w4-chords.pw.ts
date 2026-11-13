// Wave 4 review (review:journey): the chord builder and the Roman-numeral palette as a learner meets them, by mouse
// and by keyboard alone. Every way to get a chord "almost right": the right notes an octave away (passes: the step
// is octave-free), the right chord in another inversion (fails, and after the check the line under the keys names
// it, "F/A: F major, first inversion"), steps instead of 3rds, two notes, a numeral in the wrong case (the palette
// has no "VI": M swaps the case of the slot), a chord symbol typed in capitals ("AM" reads as A major). Defect
// found and fixed: the verdict on a wrong numeral said "Answer 3 is not right yet." under a slot labelled "bar 3";
// it now says "Bar 3".
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../support/ui.ts";
import { resetClock, shootAll, watch } from "./support.ts";
import { active, buildChord, checkStep, openStep, quietHmr, seedPoint, step, tabTo } from "./w4-support.ts";

const picked = (page: import("@playwright/test").Page) =>
  step(page)
    .locator("[aria-pressed=true][data-midi]")
    .evaluateAll((e) => e.map((x) => Number(x.getAttribute("data-midi"))));

test("chord builder: another inversion is named, another octave passes, by keys and by mouse", async ({
  page,
  request,
}) => {
  test.setTimeout(200_000);
  await resetClock(request);
  await seedPoint(request, "after U04.L04");
  await quietHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watch(page);
  await openStep(page, "U05.L01", "S5");
  // Obvious at once: the prompt, the piano with its typing letters, "Pick the notes of the chord." and the keys.
  await expect(step(page)).toContainText("Pick the notes of the chord.");
  await expect(step(page)).toContainText("A W S E D F T G Y H U J K");
  // Keyboard only: Tab into the piano (one stop), then H K (A4 C5), Z (down an octave), F (F3): F major with F at
  // the bottom, spread over two octaves.
  await tabTo(page, (a) => a.midi !== null, "the piano");
  await page.keyboard.press("h");
  await page.keyboard.press("k");
  await page.keyboard.press("x");
  await page.keyboard.press("f");
  // X raised the typing octave: F5 is above the piano's range (C5), so nothing was picked by it.
  expect(await picked(page)).toEqual([69, 72]);
  await page.keyboard.press("z");
  await page.keyboard.press("z");
  await page.keyboard.press("f");
  expect((await picked(page)).sort()).toEqual([53, 69, 72]);
  // The right chord in another inversion: A at the bottom. Backspace takes back the last pick.
  await page.keyboard.press("Backspace");
  await page.keyboard.press("x");
  await page.keyboard.press("f");
  expect((await picked(page)).sort()).toEqual([65, 69, 72]);
  await buildChord(page, [57, 60, 65]);
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail", { timeout: 30_000 });
  await expect(page.getByTestId("chord-name")).toContainText("F major, first inversion");
  await expect(page.getByTestId("keyboard-chord")).toContainText("A at the bottom");
  await shootAll(page, "w4-chords-inversion");
  // Steps instead of 3rds: no name is invented for it.
  await buildChord(page, [53, 55, 57]);
  await page.getByTestId("check").click();
  await expect(page.getByTestId("chord-name")).toContainText("Not a triad or a seventh chord", {
    timeout: 30_000,
  });
  // Two notes: not a chord yet.
  await buildChord(page, [53, 57]);
  await page.getByTestId("check").click();
  await expect(page.getByTestId("chord-name")).toContainText("a triad has three notes", { timeout: 30_000 });
  // F A C an octave up passes (the step is octave-free).
  await buildChord(page, [65, 69, 72]);
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass", { timeout: 30_000 });
  await expect(page.getByTestId("continue")).toBeEnabled();
  expect(problems).toEqual([]);
});

test("RN palette: numerals by digit, the wrong case named by bar and fixed with M; a symbol typed in capitals", async ({
  page,
  request,
}) => {
  test.setTimeout(200_000);
  await resetClock(request);
  await seedPoint(request, "after U05.CP");
  await quietHmr(page);
  await useUiPrefs(page, { theme: "bark" });
  const problems = watch(page);
  await openStep(page, "U06.L02", "S5");
  // The palette in five seconds: function columns, each numeral with its chord in the key, and its digit.
  for (const [rn, sym] of [
    ["I", "C"],
    ["IV", "F"],
    ["V", "G"],
    ["vi", "Am"],
    ["viio", "B°"],
  ] as const)
    await expect(step(page).locator(`[data-rn="${rn}"]`)).toContainText(sym);
  await tabTo(page, (a) => a.slot !== null, "the numeral slots");
  // I V VI IV: the palette offers vi, so "VI" is vi with its case swapped (M).
  for (const k of ["1", "5", "6", "m", "4"]) await page.keyboard.press(k);
  await expect(step(page).locator('[data-rn-slot="2"]')).toHaveAttribute("aria-label", "Bar 3: VI");
  await checkStep(page, /fail/);
  await expect(page.getByTestId("step-feedback-summary")).toHaveText("Bar 3 is not right yet.");
  await expect(step(page).locator('[data-rn-slot="2"]')).toHaveAttribute("aria-label", /not this one/);
  await shootAll(page, "w4-chords-rn-case");
  // Fixed by keys: the focus is on a slot, ← to bar 3, M.
  expect((await active(page)).slot).not.toBeNull();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("m");
  await expect(step(page).locator('[data-rn-slot="2"]')).toHaveAttribute("aria-label", /^Bar 3: vi/);
  await checkStep(page, /pass/);

  // A chord symbol typed in capitals reads as written ("AM" is A major), and the field says so before the check.
  await openStep(page, "U06.L02", "S6");
  await tabTo(page, (a) => a.editable && a.tag === "input", "the chord field");
  await page.keyboard.type("AM");
  await expect(step(page)).toContainText("Reads as A");
  await checkStep(page, /fail/);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("am");
  await checkStep(page, /pass/);
  expect(problems).toEqual([]);
});
