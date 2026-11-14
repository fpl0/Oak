// C6 "Modal Vamp" and C7 "Chromatic Colour" on the capstone stack (5210/8810, the fake tutor), from seeds:
// - C6 from "C6 open" with a Mode Lab vamp in the sketchbook: it is offered and opens session 1; eight bars of a Mixolydian vamp: the mode row is met and says where the colour
//   note lands (a bar chip lights those bars), the length is still open; the session finishes; session 2, the
//   vamp without its ♭7 leaves the mode open in the grader's own words; the full sixteen bars meet the brief;
//   checked; released by keyboard with a seeded take;
// - C7 from "C7.S2 done": session 3, the song without its lift: the secondary dominant row says what the chord is,
//   its bar and where it resolves, the run ♭VI–♭VII–I has its bars, the lift is open; with the lift the row names
//   both keys, the bar and the distance, and the Workbench draws the key ribbon; Claude's review from the fake
//   tutor; released.
// What the rows say is unit-tested with the real grader (wave6.test.ts): here they are read once, on the page.
// Screenshots: both themes at 1440×900 and 1280×800, reduced motion on.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { api, editor, rule, ruleId, seedFirst, setCode, shots, watchErrors } from "./w5-support.ts";
import { C6_NO_COLOUR, C6_SHORT, C6_VAMP, C7_FULL, C7_NO_LIFT } from "./w6-pieces.ts";
import { releaseByKeyboard } from "./w6-support.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

test("C6 from “C6 open”: the mode and its colour note with their bars, over two sessions; released", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await seedFirst(page, ["C6 open", "C6 ready"]);
  // The learner's own Mode Lab vamp (U14.L06's Make): C6 offers it as the first bars (gate W6).
  await api(page, "POST", "/sketches", {
    title: "My modal vamp",
    originKind: "lesson-make",
    originId: "U14.L06",
    sessionId: null,
    code: C6_SHORT,
    bpm: 100,
    meter: "4/4",
    key: null,
    analysis: null,
    note: null,
    tutorAssisted: false,
    band: null,
    flags: { lockedTools: [], previewTools: [] },
    ranOk: true,
  });
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/capstone/C6");
  await expect(page.getByRole("heading", { level: 1, name: "C6 Modal Vamp" })).toBeVisible({
    timeout: 60_000,
  });
  const vampStart = page.getByTestId("vamp-start");
  await expect(vampStart).toContainText("“My modal vamp”");
  await expect(vampStart.getByRole("radio", { name: "Your Mode Lab vamp" })).toBeChecked();
  await page.getByRole("button", { name: "Start session 1 of 2" }).click();
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  await editor(page, "C6");
  // It opened on the learner's vamp, not Oak's two-bar starter.
  await expect(page.locator(".cm-content").first()).toContainText(C6_SHORT.split("\n").at(-1) ?? "", {
    timeout: 30_000,
  });
  await expect(page.locator('[data-session="C6.S1"]')).toHaveAttribute("aria-current", "step");

  // Session 1: the vamp. The mode row is met and says where its colour note lands; the length is still open.
  const mode = ruleId("C6", "mode");
  const bars = ruleId("C6", "bars");
  if (!mode || !bars) throw new Error("C6's brief has no mode or bars rule");
  await setCode(page, "C6", C6_SHORT);
  await expect(rule(page, mode)).toHaveAttribute("data-state", "met", { timeout: 60_000 });
  await expect(rule(page, mode).getByTestId("row-found")).toContainText(
    "G Mixolydian: its colour note ♭7 lands on a strong beat in bars 1, 2 and 4.",
  );
  await expect(rule(page, mode).getByTestId("row-found")).toContainText(
    "The home chord is in 50% of the bars.",
  );
  await expect(rule(page, bars)).toHaveAttribute("data-state", "open");
  // The bar chip is a button: it lights that bar on the roll and the staff.
  const chip = rule(page, mode).getByTestId("found-anchor").first();
  await expect(chip).toHaveText("Bar 1");
  await chip.focus();
  await page.keyboard.press("Enter");
  await shots(page, "c6-s1");
  await expect(page.getByTestId("saved-state")).toContainText(/Version \d+ saved/, { timeout: 30_000 });
  await page.getByTestId("finish-session").click();
  await expect(page.getByRole("status").filter({ hasText: "Session 1 of 2 done." })).toBeVisible({
    timeout: 30_000,
  });

  // Session 2: without its ♭7 the mode row is open, in the grader's own words; the full vamp meets the brief.
  await expect(page.locator('[data-session="C6.S2"]')).toHaveAttribute("aria-current", "step", {
    timeout: 30_000,
  });
  await setCode(page, "C6", C6_NO_COLOUR);
  await expect(rule(page, mode)).toHaveAttribute("data-state", "open", { timeout: 60_000 });
  await expect(rule(page, mode)).toContainText(/colour note ♭7 \(F\) is on a strong beat 0 times/);
  await setCode(page, "C6", C6_VAMP);
  await expect(page.getByTestId("req-count")).toHaveText(/^(\d+) of \1 met$/, { timeout: 60_000 });
  await page.getByTestId("check-track").click();
  await expect(page.getByRole("status").filter({ hasText: /every requirement is met/ })).toBeVisible({
    timeout: 30_000,
  });
  await releaseByKeyboard(page, "Seven Flat");
  await expect(page.getByTestId("release-ceremony")).toContainText("Seven Flat");
  expect(errors).toEqual([]);
});

test("C7 from “C7.S2 done”: where the dominant resolves, the run, then the lift with its keys and the key ribbon; reviewed; released", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const point = await seedFirst(page, ["C7.S2 done", "after C7.S2"]);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/capstone/C7");
  if (point === "after C7.S2") {
    // The generic seed completes the sessions without a draft: start the third from the map's Start card.
    const start = page.getByRole("button", { name: /Start session/ });
    if (await start.isVisible().catch(() => false)) await start.click();
  }
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  await editor(page, "C7");
  await expect(page.locator('[data-session="C7.S3"]')).toHaveAttribute("aria-current", "step");
  const secondary = ruleId("C7", "contains-rn", (r) => !r.inOrder);
  const run = ruleId("C7", "contains-rn", (r) => r.inOrder === true);
  const lift = ruleId("C7", "key-change");
  if (!secondary || !run || !lift) throw new Error("C7's brief lacks one of its three colour rules");

  // The song as session 2 left it: the colour chords and the tune, no key lift.
  await setCode(page, "C7", C7_NO_LIFT);
  await expect(rule(page, secondary)).toHaveAttribute("data-state", "met", { timeout: 60_000 });
  await expect(rule(page, secondary).getByTestId("row-found")).toContainText(
    "V7/ii (A7) in bar 2 resolves to ii (Dm) in bar 3.",
  );
  await expect(rule(page, secondary).getByTestId("found-anchor").first()).toHaveText("Bars 2–3");
  await expect(rule(page, run)).toHaveAttribute("data-state", "met");
  await expect(rule(page, run).getByTestId("row-found")).toContainText("♭VI–♭VII–I in bars 15–16.");
  await expect(rule(page, lift)).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("key-ribbon")).toHaveCount(0);
  await shots(page, "c7-s3-no-lift");

  // The last chorus up a whole step: the row names both keys, the bar and the distance; the ribbon shows the plan.
  await setCode(page, "C7", C7_FULL);
  await expect(rule(page, lift)).toHaveAttribute("data-state", "met", { timeout: 60_000 });
  await expect(rule(page, lift).getByTestId("row-found")).toContainText(
    "C major → D major at bar 25: up a whole step, 8 bars.",
  );
  await expect(page.getByTestId("key-ribbon").first()).toBeVisible({ timeout: 30_000 });
  // The music lenses work in the capstone workspace as in Studio: the guide tones and the key ribbon are on, and
  // their switches turn them off and on again (the learner's own preference).
  const wb = page.locator("[data-testid=workbench]");
  await expect(wb).toHaveAttribute("data-music-lenses", /guideTones/);
  await expect(wb).toHaveAttribute("data-music-lenses", /keyPlan/);
  await page.getByTestId("lens-keyPlan").click();
  await expect(page.getByTestId("key-ribbon")).toHaveCount(0);
  await page.getByTestId("lens-guideTones").click();
  await expect(wb).not.toHaveAttribute("data-music-lenses", /guideTones/);
  await page.getByTestId("lens-keyPlan").click();
  await page.getByTestId("lens-guideTones").click();
  await expect(page.getByTestId("key-ribbon").first()).toBeVisible();
  await expect(wb).toHaveAttribute("data-music-lenses", /guideTones/);
  await expect(page.getByTestId("req-count")).toHaveText(/^(\d+) of \1 met$/, { timeout: 30_000 });
  await page.getByTestId("check-track").click();
  await expect(page.getByRole("status").filter({ hasText: /every requirement is met/ })).toBeVisible({
    timeout: 30_000,
  });
  await shots(page, "c7-s3-lift");

  // Claude's review through the fake tutor: it arrives in the brief panel and never changes the checklist.
  await page.getByTestId("request-review").click();
  await expect(page.getByTestId("review-summary")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("req-count")).toHaveText(/^(\d+) of \1 met$/);
  await releaseByKeyboard(page, "Up a Step");
  expect(errors).toEqual([]);
});
