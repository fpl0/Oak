// The Wave 3 step kinds reach the tutor from the real lesson player (the scripted fake backend, OAK_TUTOR_FAKE=1;
// docs/design/wave2.md §5): after a wrong check, "Nudge from Claude" on a key-signature step and on an ear step
// on the degree pad, and "Explain my mistake" after a sung take Oak could not hear, each send a turn whose subject
// carries the learner's own answer in words (the accidentals placed, the degree picked, what the tracker heard),
// the step's key and its labels, and never the expected answer below the reveal.
import type { Page, Request } from "@playwright/test";
import { expect, stepIs, submit, test } from "./support.ts";
import { reseedFresh, seed, setQuiet } from "./w3support.ts";

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

test("a key signature written out of order: the nudge carries the accidentals placed, not the answer", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seed(page, "after U03.L05");
  await setQuiet(page, false);
  await page.goto("/learn/U03.L06?step=S4");
  await stepIs(page, "S4");
  const surface = page.getByTestId("keysig-surface");
  await surface.focus();
  // D major is F♯ C♯; written C♯ first.
  await page.keyboard.press("#");
  await page.keyboard.press("C");
  await page.keyboard.press("F");
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
  // A worst-case model (`#echo`: it repeats everything it was given) at rung 0 sees the accidentals placed and
  // the step's key, and never the signature itself.
  await page.getByRole("button", { name: "Show tutor" }).first().click();
  const chat = nextTurn(page);
  await page.getByTestId("composer").fill("#echo What is wrong with my signature?");
  await page.getByTestId("composer").press("Enter");
  const sent = JSON.stringify(await chat);
  expect(sent).toContain("Accidentals I placed");
  expect(sent).toContain("C# F#");
  expect(sent).toMatch(/key D major/);
  const echoed = page.getByTestId("tutor-message").last();
  await expect(echoed).toHaveAttribute("data-status", "done", { timeout: 30_000 });
  await expect(echoed).toContainText("hint_rung: 0");
  await expect(echoed).toContainText("learner_code: attached");
  await expect(echoed).toContainText('"solution":null');
  await expect(echoed).not.toContainText(/F# C#|F♯ C♯/);
  // The nudge is a hint turn about the same answer.
  const turn = nextTurn(page);
  await page.getByTestId("ask-nudge").click();
  const body = await turn;
  expect(body.kind).toBe("hint");
  expect(JSON.stringify(body)).toContain("C# F#");
});

test("an ear step on the degree pad: the nudge says which degree was picked", async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, "after C1.S1");
  await setQuiet(page, false);
  await page.goto("/learn/U03.L02?step=S7");
  await stepIs(page, "S7");
  const want = await page.evaluate(
    () =>
      (globalThis as unknown as { __oakLesson: { trial(): { degrees: string[] } } }).__oakLesson.trial()
        .degrees,
  );
  const wrong = ["1", "3", "5"].find((d) => d !== want[0]) as string;
  await page.getByTestId("lesson-step").locator(`[data-degree="${wrong}"]`).click();
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
  const turn = nextTurn(page);
  await page.getByTestId("ask-nudge").click();
  const body = JSON.stringify(await turn);
  expect(body).toContain(`degree ${wrong}`);
  expect(body).not.toContain(`degree ${want[0]}`);
});

test("a sung pattern that went wrong: Ask Claude carries the cents per target, never the pitches to sing", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seed(page, "after C1.S1");
  await setQuiet(page, false);
  await page.goto("/learn/U03.L02?step=S8");
  await stepIs(page, "S8");
  const r = await submit(page, {
    sung: [60, 65, 69, 65, 60].map((midi) => ({ midi, cents: 6, credit: 1 })),
  });
  expect(r?.status).not.toBe("pass");
  const turn = nextTurn(page);
  await page.getByTestId("ask-claude").click();
  const body = JSON.stringify(await turn);
  expect(body).toContain("pitch tracker heard");
  expect(body).toMatch(/target 3/);
  // The expected pitches (E4, G4 as MIDI or names) are not in the learner's answer.
  expect(body).not.toMatch(/\b(E4|G4)\b/);
});
