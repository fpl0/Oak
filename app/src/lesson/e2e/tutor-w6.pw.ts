// The Wave 6 step kinds reach the tutor from the real lesson player (the scripted fake backend, OAK_TUTOR_FAKE=1;
// docs/design/wave2.md §5): after a wrong check, a chat turn to a worst-case model (`#echo`: it repeats everything it
// was given) carries the learner's own answer at rung 0 and never the step's expected one — a step of several answers
// part by part (four seventh qualities by ear, U12.L01 S6), and a drum grid in 12/8 row by row (U13.L06 S6). The
// words for every other Wave 6 shape are proven without a page (public-w6.test.ts).
import type { Page, Request } from "@playwright/test";
import { expect, stepIs, test } from "./support.ts";
import { reseedFresh, seed, setQuiet } from "./w3support.ts";
import { lessonDefW5 } from "./w5walk.ts";
import { W6_BEFORE } from "./w6walk.ts";
import { answerWidget, type PartLike } from "./walk.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

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

type Ex = PartLike & { parts?: PartLike[] };
async function exerciseOf(id: string, step: string): Promise<Ex> {
  const def = await lessonDefW5(id);
  return def.steps.find((s) => s.id === step)?.exercise as Ex;
}

test("four seventh qualities by ear (U12.L01 S6): the learner's quality part by part, not the expected one", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await seed(page, W6_BEFORE["U12.L01"] as string);
  await setQuiet(page, false);
  const ex = await exerciseOf("U12.L01", "S6");
  const parts = ex.parts ?? [];
  await page.goto("/learn/U12.L01?step=S6");
  await stepIs(page, "S6");
  // Part 1 heard as a minor seventh (its pinned mistake), the other three right.
  for (const [i, p] of parts.entries()) {
    const t = p.tests.find((x) => x.expect === (i === 0 ? "fail" : "pass"));
    const box = page.getByTestId("lesson-step").locator(`li[data-part="${i + 1}"]`);
    expect(await answerWidget(page, p, t?.response ?? {}, box), `part ${i + 1}`).toBe(true);
  }
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail", { timeout: 30_000 });
  const { sent, echoed } = await echo(page, "Which of the four did I get wrong?");
  expect(sent).toContain("My answers, slot by slot:");
  expect(sent).toContain("Part 1: minor 7th");
  expect(sent).toContain("Part 4: major 7th");
  for (const t of [sent, echoed])
    expect(t, "part 1's major seventh is not sent").not.toContain("Part 1: major 7th");
});

test("a drum grid in 12/8 (U13.L06 S6): the steps the learner switched on, row by row, not the groove", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await seed(page, W6_BEFORE["U13.L06"] as string);
  await setQuiet(page, false);
  const ex = await exerciseOf("U13.L06", "S6");
  const wrong = ex.tests.find((t) => t.name === "the snare counted in fours: steps 5 and 11");
  expect(wrong).toBeDefined();
  await page.goto("/learn/U13.L06?step=S6");
  await stepIs(page, "S6");
  expect(await answerWidget(page, ex, wrong?.response ?? {}), "entered on the grid").toBe(true);
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail", { timeout: 30_000 });
  const { sent, echoed } = await echo(page, "Where does the snare go?");
  expect(sent).toContain(
    "the steps I switched on (of 12 in the bar): kick: steps 1, 3, 7, 9; snare: steps 5, 11",
  );
  for (const t of [sent, echoed])
    expect(t, "the right snare is not sent").not.toContain("snare: steps 4, 10");
});
