// The Wave 4 step kinds reach the tutor from the real lesson player (the scripted fake backend, OAK_TUTOR_FAKE=1;
// docs/design/wave2.md §5): after a wrong check (the lesson's own pinned mistake), a chat turn to a worst-case model
// (`#echo`: it repeats everything it was given) carries the learner's own answer in the tutor's Wave 4 shapes —
// numerals placed on the RN palette, a function strip slot by slot, a staged chord dictation so far — with the
// step's key, at rung 0, and never the step's expected answer.
import type { Page, Request } from "@playwright/test";
import { expect, stepIs, test } from "./support.ts";
import { reseedFresh, seed, setQuiet } from "./w3support.ts";
import { answerWidget, enterStage, lessonDef, type PartLike } from "./walk.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

/** The next tutor turn the page sends (hint or chat), as JSON. */
function nextTurn(page: Page): Promise<Record<string, unknown>> {
  return page
    .waitForRequest((r: Request) => r.method() === "POST" && /\/api\/tutor\/(hint|chat)$/.test(r.url()), {
      timeout: 20_000,
    })
    .then((r) => r.postDataJSON() as Record<string, unknown>);
}

/** Opens the tutor and sends an `#echo` chat; returns what was sent and the echoed reply's text. */
async function echo(page: Page, question: string): Promise<{ sent: string; echoed: string }> {
  await page.getByRole("button", { name: "Show tutor" }).first().click();
  const chat = nextTurn(page);
  await page.getByTestId("composer").fill(`#echo ${question}`);
  await page.getByTestId("composer").press("Enter");
  const sent = JSON.stringify(await chat);
  const reply = page.getByTestId("tutor-message").last();
  await expect(reply).toHaveAttribute("data-status", "done", { timeout: 30_000 });
  await expect(reply).toContainText("hint_rung: 0");
  await expect(reply).toContainText('"solution":null');
  return { sent, echoed: (await reply.textContent()) ?? "" };
}

async function exerciseOf(
  id: string,
  step: string,
): Promise<PartLike & { correct?: Record<string, unknown> }> {
  const def = await lessonDef(id);
  return def.steps.find((s) => s.id === step)?.exercise as PartLike & { correct?: Record<string, unknown> };
}

test("numerals on the RN palette (U06.L02 S5): the learner's numerals bar by bar, not the answer", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seed(page, "after U05.CP");
  await setQuiet(page, false);
  const ex = await exerciseOf("U06.L02", "S5");
  const right = (ex.correct as { rn: string[] }).rn;
  await page.goto("/learn/U06.L02?step=S5");
  await stepIs(page, "S5");
  // The first of the lesson's pinned mistakes the palette can enter.
  let mine: string[] | null = null;
  for (const t of ex.tests.filter((x) => x.expect === "fail")) {
    if (!(await answerWidget(page, ex, t.response))) continue;
    mine = (t.response.answer as { rn: string[] }).rn;
    break;
  }
  if (!mine) throw new Error("no pinned mistake the palette can enter");
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
  const { sent, echoed } = await echo(page, "Which numeral is off?");
  expect(sent).toContain("Numerals I placed (in C major)");
  for (const [i, rn] of mine.entries()) expect(sent).toContain(`bar ${i + 1}: ${rn}`);
  const answer = right.map((rn, i) => `bar ${i + 1}: ${rn}`).join("\\n");
  expect(sent, "the expected numerals are not sent").not.toContain(answer);
  expect(echoed).not.toContain(right.join(" "));
});

test("a function strip (U06.L03 S6): each slot's choice by its label, not the answer", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, "after U06.L02");
  await setQuiet(page, false);
  const ex = await exerciseOf("U06.L03", "S6");
  const wrong = ex.tests.find((t) => t.expect === "fail");
  await page.goto("/learn/U06.L03?step=S6");
  await stepIs(page, "S6");
  expect(await answerWidget(page, ex, wrong?.response ?? {})).toBe(true);
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
  const { sent } = await echo(page, "Which bar did I get wrong?");
  expect(sent).toContain("My answers, slot by slot:");
  expect(sent).toContain("3. Bar 3: PD: away (predominant)");
  expect(sent, "the right job of bar 3 is not sent").not.toContain("3. Bar 3: D: tension (dominant)");
});

test("a staged chord dictation (U06.L09 S2): the bass stage as answered, before any later stage", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seed(page, "after U06.L08");
  await setQuiet(page, false);
  const ex = await exerciseOf("U06.L09", "S2");
  await page.goto("/learn/U06.L09?step=S2");
  await stepIs(page, "S2");
  // The lesson's own pinned mistake: the bass under bar 3 heard as 5 (it is 6).
  await enterStage(page, ex, "bass", ["1", "3", "5", "4"]);
  await page.getByTestId("check-stage").click();
  await expect(page.getByTestId("stage-verdict")).toHaveAttribute("data-status", "fail", { timeout: 30_000 });
  await expect(page.getByTestId("stage-verdict")).toContainText("bar 3");
  const { sent, echoed } = await echo(page, "What is wrong with my bass?");
  expect(sent).toContain("Chord dictation, bass first. I am on the bass notes.");
  expect(sent).toContain("bass notes: 1 3 5 4");
  expect(sent, "the right bass is not sent").not.toContain("1 3 6 4");
  expect(echoed).not.toContain("1 3 6 4");
});
