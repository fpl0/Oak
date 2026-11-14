// U09.CP (over U08–U09), U10.CP and U11.CP end to end in the real app from their dev seeds ("U09.CP due" …, wave5.md
// §6; contracts §7.6). Every item on screen is answered through its own widget wherever it has one (the Wave 5 form
// strip, 12-bar grid and scale builder included, see walk.ts), else through the player's own grading path (code
// items, sung items on their targets, the Make from its passing test). The first widget item is answered wrong first
// and saved again right. The hand-in passes, by skill, with no raw IDs, and is stored on the server. Then U10.CP in
// Quiet mode: its sung and ear items set levels and never gate — the sung ones are set aside, the hand-in still
// passes, and the result says singing never counts against it.
import {
  answerAll,
  attemptItems,
  cpStatus,
  handIn,
  oneSkillOut,
  RAW,
  startAttempt,
  type Unit,
  visibleText,
  written,
} from "./cpwalk.ts";
import { expect, test } from "./support.ts";
import { reseedFresh, seed, setQuiet } from "./w3support.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

for (const unit of ["U09", "U10", "U11"] as const) {
  test(`${unit}.CP: every item answered on screen, one wrong then right, handed in, passed`, async ({
    page,
  }) => {
    test.skip(!written(unit), `${unit}.CP's checkpoint.ts is not written yet (author:CP)`);
    test.setTimeout(180_000);
    await seed(page, `${unit}.CP due`);
    await setQuiet(page, false);
    await startAttempt(page, unit);
    const kinds = await answerAll(page, unit, { quiet: false });
    expect(kinds).toContain("make");
    expect(kinds, "one item was answered wrong first").toContain("wrong-first");
    const result = await handIn(page, unit);
    await expect(result).toHaveAttribute("data-passed", "1");
    const values = await page
      .locator('[data-skill] [role="meter"]')
      .evaluateAll((els) => els.map((e) => Number(e.getAttribute("aria-valuenow"))));
    expect(values.length, "per-skill meters").toBeGreaterThan(2);
    expect(
      values.every((v) => v >= 0.999),
      `every skill at 100%: ${values.join(", ")}`,
    ).toBe(true);
    expect(await cpStatus(page, unit), `${unit}.CP on the server`).toMatchObject({
      status: "passed",
      attempts: 1,
    });
  });
}

test("U09.CP to a soft pass: not yet on the first attempt, Continue anyway on the retake", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seed(page, "U09.CP due");
  await setQuiet(page, false);
  // Attempt 1: every item left for later but the Make: well under the line, and no "Continue anyway" yet.
  await startAttempt(page, "U09");
  const first = await attemptItems(page, "U09");
  expect(first.attemptNo).toBe(1);
  await answerAll(page, "U09", { quiet: false, skip: new Set(first.items.map((i) => i.idx)) });
  await expect(page.getByTestId("continue-anyway")).toHaveCount(0);
  const r1 = await handIn(page, "U09");
  await expect(r1).toHaveAttribute("data-passed", "0");
  await expect(page.getByRole("heading", { name: "Not yet" })).toBeVisible();
  await expect(r1).not.toContainText(/fail/i);
  expect(await cpStatus(page, "U09")).toMatchObject({ attempts: 1 });
  // Attempt 2: all right but one gated skill: over 0.75, under the pass. The retake offers "Continue anyway".
  await startAttempt(page, "U09");
  const second = await attemptItems(page, "U09");
  expect(second.attemptNo).toBe(2);
  const out = oneSkillOut(second.items);
  await answerAll(page, "U09", { quiet: false, skip: out });
  await expect(page.getByTestId("checkpoint-review")).toBeVisible();
  const anyway = page.getByTestId("continue-anyway");
  await expect(anyway).toBeVisible();
  await anyway.click();
  const result = page.getByTestId("checkpoint-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "On you go" })).toBeVisible();
  expect(await visibleText(page, "checkpoint-result")).not.toMatch(RAW);
  // What opens is named by title (C3 and the A1 lessons it gates), never by ID.
  const opened = page.getByTestId("checkpoint-opened");
  if ((await opened.count()) > 0) await expect(opened).not.toContainText(/\b[A-Z]\d+\.(L|S|CP)\d*/);
  // The skill left out is "worth another look", never a failure.
  const skill = second.items.find((i) => out.has(i.idx))?.skillId as string;
  await expect(page.locator(`[data-skill="${skill}"]`)).toBeVisible();
  await expect(result).not.toContainText(/failed|debt/i);
  expect(await cpStatus(page, "U09"), "U09.CP soft-passed on the server").toMatchObject({
    status: "soft-passed",
    attempts: 2,
  });
});

test("U10.CP in Quiet mode: sung items set aside, ear items set levels, the gating items alone decide", async ({
  page,
}) => {
  test.skip(!written("U10"), "U10.CP's checkpoint.ts is not written yet (author:CP)");
  test.setTimeout(180_000);
  await seed(page, "U10.CP due");
  await setQuiet(page, true);
  await startAttempt(page, "U10");
  await answerAll(page, "U10", { quiet: true });
  const result = await handIn(page, "U10");
  await expect(result).toHaveAttribute("data-passed", "1");
  // A level-setting skill (E10, the minor degrees by ear) says so, and never reads as holding anyone back.
  const level = page.locator('[data-skill="E10"]');
  if ((await level.count()) > 0) await expect(level).toContainText("never holds you back");
  await expect(result).not.toContainText(/failed|debt/i);
  expect(await cpStatus(page, "U10")).toMatchObject({ status: "passed" });
});

test("a Wave 5 checkpoint whose items are not written yet says so calmly and starts nothing", async ({
  page,
}) => {
  const unit = (["U09", "U10", "U11"] as const).find((u) => !written(u));
  test.skip(unit === undefined, "every Wave 5 checkpoint is written");
  test.setTimeout(90_000);
  await seed(page, `${unit}.CP due`);
  await page.goto(`/checkpoint/${unit}`);
  const intro = page.getByTestId("checkpoint-intro");
  await expect(intro).toBeVisible({ timeout: 30_000 });
  await expect(intro).toContainText("Not written yet");
  await expect(page.getByTestId("start-checkpoint")).toHaveCount(0);
  expect(await visibleText(page, "checkpoint-intro")).not.toMatch(RAW);
  expect(await cpStatus(page, unit as Unit), "nothing was started").toMatchObject({ attempts: 0 });
});
