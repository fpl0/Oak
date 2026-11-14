// U13.CP (over U12–U13), U14.CP and U17.CP (over U15–U17) end to end in the real app from their dev seeds ("U13.CP
// due" …, wave6.md §6; contracts §7.6): every item answered on screen through its own widget wherever it has one
// (cpwalk.ts; the first widget item wrong first, then right), handed in, passed and stored on the server; and what a
// pass says about the advanced tracks it opens (contracts §4.3; wave6.md §5.3): after U13.CP the Jazz Harmony and
// Advanced Rhythm tracks are open, named by title, honestly (their lessons are still being written), and the
// result's one primary action still leads on with the core. Then U13.CP to a soft pass (it counts eight gated
// skills, so one can be left out above the soft-pass line; U17.CP's three cannot): the first attempt handed in
// empty is "Not yet", the retake with one gated skill left out offers "Continue anyway", and the result names that
// skill as worth another look, never a failure.
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { shoot } from "../../../../e2e/support/ui.ts";
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
import { api, noOverflow, onScreen, reseedFresh, seed, setQuiet } from "./w3support.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));

/** What each pass opens (contracts §4.3), as the result's card names it. */
const OPENS: Record<string, { title: string; first: boolean }> = {
  U13: { title: "The Jazz Harmony and Advanced Rhythm tracks are open", first: true },
  U14: { title: "More of the Jazz Harmony track is open", first: false },
  U17: { title: "More of the Jazz Harmony track is open", first: false },
};

/** The tracks card of a passed result: by title, honest, no IDs, and the core still the one primary action. */
async function expectTracksCard(page: Page, unit: string) {
  const card = page.getByTestId("tracks-opened");
  await expect(card).toBeVisible();
  const want = OPENS[unit] as { title: string; first: boolean };
  await expect(card).toContainText(want.title);
  const text = await visibleText(page, "tracks-opened");
  expect(text, "the tracks are named by title, never by ID").not.toMatch(/\b[JR]\d|\bJ\.|\bR\.|\bU\d\d\b/);
  expect(text).not.toMatch(RAW);
  if ((await card.getAttribute("data-authored")) === "0") {
    await expect(card).toContainText("still being written");
    await expect(card).toContainText("the core goes on");
  } else await expect(card).toContainText("stays on the core");
  // Nothing in the card is a button or a link: it interrupts nothing, the result's own action leads on.
  await expect(card.getByRole("button")).toHaveCount(0);
  await expect(card.getByRole("link")).toHaveCount(0);
  await expect(page.getByTestId("checkpoint-done")).toBeVisible();
}

for (const unit of ["U13", "U14", "U17"] as const satisfies readonly Unit[]) {
  test(`${unit}.CP: every item answered on screen, handed in, passed, and the tracks it opens`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(written(unit), `${unit}.CP is authored`).toBe(true);
    await seed(page, `${unit}.CP due`);
    await setQuiet(page, false);
    await startAttempt(page, unit);
    const kinds = await answerAll(page, unit, { quiet: false });
    expect(kinds).toContain("make");
    expect(kinds, "one item was answered wrong first").toContain("wrong-first");
    const result = await handIn(page, unit);
    await expect(result).toHaveAttribute("data-passed", "1");
    expect(await cpStatus(page, unit), `${unit}.CP on the server`).toMatchObject({
      status: "passed",
      attempts: 1,
    });
    await expectTracksCard(page, unit);
    // The pass is stored with the gates it opened: the tracks are open on the server too.
    if (unit === "U13") {
      const tracks = await api<{ items: { trackId: string; status: string; note: string }[] }>(
        page,
        "GET",
        "/tracks",
      );
      expect(tracks.status).toBe(200);
      for (const t of ["J", "R"]) {
        const st = tracks.body?.items.find((x) => x.trackId === t);
        expect(st?.note, `track ${t} is open on the server`).toMatch(/^Open\./);
      }
    }
    // Both sizes and both themes, on the one result screen (it is this visit's: a reload would lose it).
    for (const theme of ["paper", "bark"] as const) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      for (const size of [
        { width: 1440, height: 900 },
        { width: 1280, height: 800 },
      ]) {
        await page.setViewportSize(size);
        await noOverflow(page);
        await onScreen(page, "checkpoint-done");
        await shoot(page, SHOTS, `w6-${unit.toLowerCase()}cp-tracks`, theme);
      }
    }
    // Keyboard: the heading holds the focus after the hand-in, and Tab reaches the primary action first.
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("checkpoint-done")).toBeFocused();
  });
}

test("U13.CP to a soft pass: not yet on the first attempt, Continue anyway on the retake", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seed(page, "U13.CP due");
  await setQuiet(page, false);
  // Attempt 1: every item left for later but the Make: well under the line, and no "Continue anyway" yet.
  await startAttempt(page, "U13");
  const first = await attemptItems(page, "U13");
  expect(first.attemptNo).toBe(1);
  await answerAll(page, "U13", { quiet: false, skip: new Set(first.items.map((i) => i.idx)) });
  await expect(page.getByTestId("continue-anyway")).toHaveCount(0);
  const r1 = await handIn(page, "U13");
  await expect(r1).toHaveAttribute("data-passed", "0");
  await expect(page.getByRole("heading", { name: "Not yet" })).toBeVisible();
  await expect(r1).not.toContainText(/fail/i);
  // Attempt 2: all right but one gated skill: over the soft-pass line, under the pass.
  await startAttempt(page, "U13");
  const second = await attemptItems(page, "U13");
  expect(second.attemptNo).toBe(2);
  const out = oneSkillOut(second.items);
  await answerAll(page, "U13", { quiet: false, skip: out });
  const anyway = page.getByTestId("continue-anyway");
  await expect(anyway).toBeVisible();
  await anyway.click();
  const result = page.getByTestId("checkpoint-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "On you go" })).toBeVisible();
  expect(await visibleText(page, "checkpoint-result")).not.toMatch(RAW);
  const skill = second.items.find((i) => out.has(i.idx))?.skillId as string;
  await expect(page.locator(`[data-skill="${skill}"]`)).toBeVisible();
  await expect(result).not.toContainText(/failed|debt/i);
  // A soft pass meets the tracks' gate as a pass does (contracts §4.3).
  await expect(page.getByTestId("tracks-opened")).toContainText(OPENS.U13?.title as string);
  expect(await cpStatus(page, "U13"), "U13.CP soft-passed on the server").toMatchObject({
    status: "soft-passed",
    attempts: 2,
  });
});
