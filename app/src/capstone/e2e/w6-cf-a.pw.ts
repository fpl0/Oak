// CF-A "Album Single" on the capstone stack (5210/8810, the fake tutor), from seeds, split by session:
// - from "CF-A open": the two starts (the plan, or one of the learner's own sketches as the verse: the grown draft
//   opens with the sketch's parts as verse consts); session 1 with the plan: the bridge is found with its bars, the
//   running length reads 2:14 of 2:00 beside the form, the device counter is at 0 of 6 with every row "Not yet",
//   and "Your devices so far" lists the learner's own released tracks per device with two bars to play (one is
//   heard); session 2: the counter names each device with its bars and what is still open;
// - from "CF-A.S3 done": session 4. The draft is a chorus short of two minutes and says how many bars are missing;
//   the Master card measures the limiter while the song plays (real time, a few seconds) and plays a reference
//   from the learner's own record at matched loudness; the full single meets the brief; released by keyboard with a
//   seeded take, and the liner notes say what the master found.
// The device rows, the length and the Master's words are unit-tested with the real grader (wave6.test.ts). The one
// real-time take of the single (over two minutes) belongs to the journey (d9).
// Screenshots: both themes at 1440×900 and 1280×800, reduced motion on.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { editor, rule, ruleId, seedFirst, setCode, shots, watchErrors } from "./w5-support.ts";
import { CF_A_LIFTED, CF_A_PLAIN, CF_A_PLAN, CF_A_SINGLE } from "./w6-pieces.ts";
import { releaseByKeyboard } from "./w6-support.ts";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

const getCode = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () =>
      (
        globalThis as unknown as { __oakStrudel: { editors: Map<string, { getCode(): string }> } }
      ).__oakStrudel.editors
        .get("oak_capstone-CF-A_0_")
        ?.getCode() ?? "",
  );

test("CF-A from “CF-A open”: two starts; the plan with its bridge and length; the device counter reaching four; the learner's own devices; sessions 1–3", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await seedFirst(page, ["CF-A open"]);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/capstone/CF-A");
  await expect(page.getByRole("heading", { level: 1, name: /Album Single/ })).toBeVisible({
    timeout: 60_000,
  });

  // Two starts. A sketch of the learner's own becomes the verse of a 48-bar plan.
  const start = page.getByTestId("single-start");
  await expect(start).toBeVisible();
  await start.getByRole("radio", { name: "One of your sketches" }).click();
  await expect(start.getByTestId("sketch-plan").or(start.getByTestId("sketch-problem"))).toBeVisible({
    timeout: 30_000,
  });
  await shots(page, "cf-a-start");
  const grows = await start.getByTestId("sketch-plan").isVisible();
  if (!grows) await start.getByRole("radio", { name: "The plan" }).click();
  await page.getByRole("button", { name: "Start session 1 of 4" }).click();
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  await editor(page, "CF-A");
  await expect(page.locator('[data-session="CF-A.S1"]')).toHaveAttribute("aria-current", "step");
  if (grows) {
    const code = await getCode(page);
    expect(code).toMatch(/const \w+Verse = /);
    expect(code).toMatch(/const \w+Bridge = \w+Verse/);
    expect(code).toMatch(/: arrange\(\[8, \w+Verse\], \[8, \w+Chorus\]/);
  }

  // Session 1 with the plan: the bridge and the length are met on day one; no device yet.
  const devices = ruleId("CF-A", "device-count");
  const bridge = ruleId("CF-A", "form");
  const duration = ruleId("CF-A", "duration-sec");
  if (!devices || !bridge || !duration) throw new Error("CF-A's brief lacks one of its three rules");
  await setCode(page, "CF-A", CF_A_PLAN);
  await expect(rule(page, bridge)).toHaveAttribute("data-state", "met", { timeout: 60_000 });
  await expect(rule(page, bridge).getByTestId("row-found")).toContainText("Bridge: bars 33–40.");
  await expect(rule(page, duration)).toHaveAttribute("data-state", "met");
  await expect(page.getByTestId("form-length")).toHaveText("56 bars · 2:14 of 2:00");
  await expect(page.getByTestId("form-length")).toHaveAttribute("data-ok", "true");
  await expect(page.locator('[data-testid="form-strip"] [data-section="bridge"]')).toBeVisible();
  await expect(rule(page, devices)).toHaveAttribute("data-state", "open");
  await expect(rule(page, devices).getByTestId("device-count")).toHaveText("0 of 6 · 4 needed");
  await expect(rule(page, devices).locator('[data-device][data-found="false"]')).toHaveCount(6);

  // "Your devices so far": the learner's own record. C7 has a secondary dominant; two bars of it play.
  const card = page.getByTestId("devices-card");
  await expect(card.getByTestId("devices-on-record")).toHaveText(/^\d of 6 are on your record already\.$/, {
    timeout: 60_000,
  });
  const own = card.locator('[data-device="secondary dominant"]');
  await expect(own).toHaveAttribute("data-on-record", "true");
  await expect(own).toContainText(/bars \d+–\d+/);
  const play = own.getByTestId("device-play").first();
  await play.focus();
  await page.keyboard.press("Enter");
  await expect(play).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  await page.keyboard.press("Enter");
  await expect(play).toHaveAttribute("aria-pressed", "false");
  // A device no track of theirs has names its lesson and offers the lesson's own example.
  const never = card.locator('[data-on-record="false"]').first();
  await expect(never).toContainText(/Not on your record yet\. Taught in U\d\d\.L\d\d\./);
  await expect(never.getByRole("link", { name: "Replay the lesson" })).toBeVisible();
  await shots(page, "cf-a-s1");
  await expect(page.getByTestId("saved-state")).toContainText(/Version \d+ saved/, { timeout: 30_000 });
  await page.getByTestId("finish-session").click();
  await expect(page.getByRole("status").filter({ hasText: "Session 1 of 4 done." })).toBeVisible({
    timeout: 30_000,
  });

  // Session 2: harmony. Every device the song has is named with its bars; the one still open says "Not yet".
  await expect(page.locator('[data-session="CF-A.S2"]')).toHaveAttribute("aria-current", "step", {
    timeout: 30_000,
  });
  // The counter as the song grows, on the grader's own reading: three devices, one short; the key lift makes four.
  await setCode(page, "CF-A", CF_A_PLAIN);
  await expect(rule(page, devices).getByTestId("device-count")).toHaveText("3 of 6 · 4 needed", {
    timeout: 60_000,
  });
  await expect(rule(page, devices)).toHaveAttribute("data-state", "open");
  await expect(rule(page, devices).locator('[data-device="modulation"]')).toContainText("Not yet");
  await setCode(page, "CF-A", CF_A_LIFTED);
  await expect(rule(page, devices).getByTestId("device-count")).toHaveText("4 of 6", { timeout: 60_000 });
  await expect(rule(page, devices)).toHaveAttribute("data-state", "met");
  await expect(rule(page, devices).locator('[data-device="modulation"]')).toContainText(
    "In this song: bar 49",
  );
  // The single as it ends up: the borrowed bridge as well.
  await setCode(page, "CF-A", CF_A_SINGLE);
  await expect(rule(page, devices)).toHaveAttribute("data-state", "met", { timeout: 60_000 });
  await expect(rule(page, devices).getByTestId("device-count")).toHaveText("5 of 6");
  const row = (d: string) => rule(page, devices).locator(`[data-device="${d}"]`);
  await expect(row("secondary dominant")).toContainText("In this song: bars 11, 27, 43 and 1 more");
  await expect(row("modulation")).toContainText("In this song: bar 49");
  await expect(row("modulation").getByTestId("found-anchor")).toHaveText("Bars 49–56");
  await expect(row("modal colour")).toContainText("Not yet");
  await page.getByTestId("check-track").click();
  await expect(
    page.getByRole("status").filter({ hasText: /Devices: 5 of 6: secondary dominant in bar 11/ }),
  ).toBeVisible({ timeout: 30_000 });
  await shots(page, "cf-a-s2");
  await page.getByTestId("finish-session").click();
  await expect(page.getByRole("status").filter({ hasText: "Session 2 of 4 done." })).toBeVisible({
    timeout: 30_000,
  });

  // Session 3: the tunes and the bridge. The bridge has its own tune and the line for it is met; the session ends.
  await expect(page.locator('[data-session="CF-A.S3"]')).toHaveAttribute("aria-current", "step", {
    timeout: 30_000,
  });
  await expect(rule(page, bridge)).toHaveAttribute("data-state", "met", { timeout: 60_000 });
  await expect(rule(page, devices)).toHaveAttribute("data-state", "met");
  await page.getByTestId("finish-session").click();
  await expect(page.getByRole("status").filter({ hasText: "Session 3 of 4 done." })).toBeVisible({
    timeout: 30_000,
  });
  expect(errors).toEqual([]);
});

test("CF-A.S4 from “CF-A.S3 done”: a chorus short of two minutes; the Master measures the limiter and matches a reference; released", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await seedFirst(page, ["CF-A.S3 done"]);
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.goto("/capstone/CF-A");
  await expect(page.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  await editor(page, "CF-A");
  await expect(page.locator('[data-session="CF-A.S4"]')).toHaveAttribute("aria-current", "step");
  const duration = ruleId("CF-A", "duration-sec");
  if (!duration) throw new Error("CF-A's brief has no length rule");

  // The seeded draft is under two minutes: the row and the form say by how much.
  await expect(rule(page, duration)).toHaveAttribute("data-state", "open", { timeout: 60_000 });
  await expect(rule(page, duration).getByTestId("duration-read")).toContainText(/more bars? at this tempo/);
  await expect(page.getByTestId("form-length")).toHaveAttribute("data-ok", "false");
  await expect(page.getByTestId("release")).toBeDisabled();

  // The whole single. The Master card: four steps, none required.
  await setCode(page, "CF-A", CF_A_SINGLE);
  await expect(page.getByTestId("req-count")).toHaveText(/^(\d+) of \1 met$/, { timeout: 60_000 });
  const master = page.getByTestId("master-card");
  await expect(master).toBeVisible();
  await expect(master.getByTestId("master-progress")).toHaveText("0 of 4 · never required");
  await expect(master.getByTestId("master-loop-loudest")).toContainText(/Loop the loudest section/);
  await shots(page, "cf-a-s4-master");

  // Step 2, by keyboard: the tabs move with the arrows; the meter reads the bus while the song plays.
  await master.getByRole("tab", { name: /Levels/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(master.getByRole("tab", { name: /The limiter/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: /^Play/ }).first().click();
  await master.getByTestId("master-measure").click();
  await expect(master.getByTestId("master-measure")).toHaveText("Stop measuring", { timeout: 30_000 });
  // A real-time measurement: three seconds of the song through the limiter.
  await page.waitForTimeout(3_000);
  await master.getByTestId("master-measure").click();
  const reading = master.getByTestId("master-reading");
  await expect(reading).toContainText(
    /Average level −\d+\.\d dB\. Loudest moment [−+]?\d+\.\d dB before the limiter\./,
    {
      timeout: 30_000,
    },
  );
  await expect(reading).toHaveAttribute("data-limiter", /resting|touching|working/);
  await expect(master.getByTestId("master-progress")).toHaveText("1 of 4 · never required");

  // Step 4: twenty seconds of the learner's own Chromatic Colour, set to the single's measured level.
  await master.getByRole("tab", { name: /A reference listen/ }).click();
  const ref = master.getByTestId("master-reference");
  await expect(ref.getByRole("combobox")).toContainText("Chromatic Colour", { timeout: 30_000 });
  await ref.getByTestId("master-hear-reference").click();
  await expect(ref.getByTestId("master-hear-reference")).toHaveText("Stop the reference", {
    timeout: 30_000,
  });
  await expect(ref.getByTestId("master-match")).toContainText(/^Your single is .+ Chromatic Colour\./);
  await ref.getByTestId("master-hear-reference").click();
  await expect(ref.getByTestId("master-hear-reference")).toHaveText("Hear 20 seconds of it");
  await master.getByTestId("master-tick-reference").check();
  await expect(master.getByTestId("master-progress")).toHaveText("2 of 4 · never required");
  await shots(page, "cf-a-s4-reference");

  // Check, then release: the liner notes say what the master found.
  await page.getByTestId("check-track").click();
  await expect(page.getByRole("status").filter({ hasText: /every requirement is met/ })).toBeVisible({
    timeout: 30_000,
  });
  // Claude's review of the single, the longest the tutor writes, through the fake backend: three strengths.
  await page.getByTestId("request-review").click();
  const review = page.getByTestId("review-summary");
  await expect(review).toBeVisible({ timeout: 45_000 });
  await expect(review.getByTestId("review-strengths").locator(":scope > li")).toHaveCount(3);
  await page.getByTestId("release").click();
  const dialog = page.getByRole("dialog", { name: /Release to the album/ });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByTestId("release-liner").locator("summary").click();
  await expect(dialog.getByTestId("release-liner")).toContainText(
    /Mastered against Chromatic Colour\. Loudest moment [−+]?\d+ dB; the limiter/,
  );
  await page.keyboard.press("Escape");
  await releaseByKeyboard(page, "The Long Way Round");
  await expect(page.getByTestId("release-ceremony")).toContainText("The Long Way Round");
  expect(errors).toEqual([]);
});
