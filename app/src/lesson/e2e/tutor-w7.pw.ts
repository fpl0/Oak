// The Wave 7 step kinds reach the tutor from the real lesson player (the scripted fake backend, OAK_TUTOR_FAKE=1;
// docs/design/wave2.md §5): after a wrong check, a chat turn to a worst-case model (`#echo`: it repeats everything it
// was given) carries the learner's own answer at rung 0 and never the step's expected one — a Euclidean rhythm read
// back as its numbers, part by part (R3.L03 S6, the Euclid widget's steppers), and a rootless voicing played on the
// keyboard in chord mode (J3.L01 S3). Both lessons are opened as previews from the core's end (dev only: the tutor
// reads the step on screen; nothing is saved). The words for every other Wave 7 shape (a grouping, two-lane taps, a
// jazz chord name) are proven without a page (wave7.test.ts, public tests).
import type { Page, Request } from "@playwright/test";
import { expect, stepIs, test } from "./support.ts";
import { reseedFresh, seed, setQuiet } from "./w3support.ts";
import { lessonDefW5 } from "./w5walk.ts";
import { SMOKE_POINT } from "./w7walk.ts";
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

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await seed(page, SMOKE_POINT);
  await setQuiet(page, false);
  await page.close();
});

test("a Euclidean rhythm (R3.L03 S6): the learner's numbers part by part, not the rhythm's", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const ex = await exerciseOf("R3.L03", "S6");
  const parts = ex.parts ?? [];
  expect(parts.map((p) => p.answer?.ui)).toEqual(["euclid", "euclid"]);
  await page.goto("/learn/R3.L03?preview=true&step=S6");
  await stepIs(page, "S6");
  // Part 1 started two steps late (its pinned mistake), part 2 right.
  const wrong = parts[0]?.tests.find((t) => t.name === "the right hits and steps, started later");
  const right = parts[1]?.tests.find((t) => t.expect === "pass");
  expect(wrong && right).toBeTruthy();
  const box = (i: number) => page.getByTestId("lesson-step").locator(`li[data-part="${i + 1}"]`);
  expect(await answerWidget(page, parts[0] as PartLike, wrong?.response ?? {}, box(0)), "part 1").toBe(true);
  expect(await answerWidget(page, parts[1] as PartLike, right?.response ?? {}, box(1)), "part 2").toBe(true);
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail", { timeout: 30_000 });
  const { sent, echoed } = await echo(page, "Which of the two is off?");
  expect(sent).toContain("3 hits in 16 steps, rotated by 2");
  expect(sent).toContain("5 hits in 8 steps, rotated by 1");
  for (const t of [sent, echoed]) {
    // Part 1's own rhythm, (3,16) unrotated, is never sent: every "3 hits in 16 steps" is the learner's.
    expect(t, "part 1's rhythm is not sent").not.toMatch(/3 hits in 16 steps(?!, rotated by 2)/);
    expect(t, "the step's correct numbers are not sent").not.toMatch(/"euclid":\[3,16\]/);
  }
});

test("a rootless voicing on the keyboard (J3.L01 S3): the keys the learner played, not the voicing asked for", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const ex = await exerciseOf("J3.L01", "S3");
  const wrong = ex.tests.find((t) => t.name === "the B voicing: E G A C");
  expect(wrong).toBeDefined();
  await page.goto("/learn/J3.L01?preview=true&step=S3");
  await stepIs(page, "S3");
  expect(await answerWidget(page, ex, wrong?.response ?? {}), "played on the keyboard").toBe(true);
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail", { timeout: 30_000 });
  const { sent, echoed } = await echo(page, "Why is this not the A voicing?");
  expect(sent).toMatch(/notes E3 G3 A3 C4/);
  for (const t of [sent, echoed]) {
    expect(t, "the A voicing is not sent").not.toMatch(/A3 C4 E4 G4/);
    expect(t, "the expected pitch classes are not sent").not.toContain('"pcs":[9,0,4,7]');
  }
});
