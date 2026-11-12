// The U03 exemplar, U03.L02 "Degrees in Code", against the real server from a dev seed: degree labels switching
// on in the lesson's Workbench at S1, every step solved from its authored passing test, a known-wrong variant
// first on the checked steps with the feedback the grader gives (the numbers-only wording on S4, the target's
// roll after the first failed check), the code stimulus that plays the chords that set home and then one note
// (S6, the single-note plan whose `done` @oak/strudel resolves itself), the generated 1-3-5 ear step, the sung
// pattern graded through the player's path, the Make saved under the lesson title, idempotency keys on every
// attempt, and the lesson complete on the server.
import type { Request } from "@playwright/test";
import { expect, setCode, stepIs, submit, test, trialAnswer } from "./support.ts";
import { api, reseedFresh, seed } from "./w3support.ts";

test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

const T = "setcpm(84/4)\n\n";
const deg = (p: string, key = "C4:major") => `${T}mel: n("${p}").scale("${key}").s("piano")`;
const ODE = "<[2 2 3 4] [4 3 2 1]>";

test.describe.configure({ mode: "serial" });

test("U03.L02 Degrees in Code: every step, wrong variants first, the Make, completion", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, "after U02.CP");
  const keys: string[] = [];
  page.on("request", (r: Request) => {
    if (r.method() === "POST" && /\/api\/lessons\/U03\.L02\/steps\/S\d+\/attempts$/.test(r.url()))
      keys.push(String((r.postDataJSON() as { idempotencyKey?: string }).idempotencyKey ?? ""));
  });
  await page.goto("/learn/U03.L02");

  // S1: degree labels arrive in the Workbench, then the loop plays.
  await stepIs(page, "S1");
  const moment = page.getByTestId("feature-moment");
  await expect(moment).toHaveAttribute("data-tools", /tb\.feature\.degree-labels/);
  await expect(moment).toHaveAttribute("data-on", "1", { timeout: 5_000 });
  await expect(moment).toContainText("degree labels");
  await page.getByTestId("feature-replay").click();
  await expect(moment).toHaveAttribute("data-on", "1", { timeout: 5_000 });
  await page.getByTestId("play-toggle").click();
  await expect(page.getByTestId("continue")).toHaveText(/Continue/, { timeout: 20_000 });
  await page.getByTestId("play-toggle").click();
  await page.getByTestId("continue").click();

  // S2 predict: every other note of the scale.
  await stepIs(page, "S2");
  await expect(page.getByTestId("feature-moment")).toHaveCount(0);
  await page.locator('[data-option="steps"]').click();
  await page.getByTestId("check").click();
  await expect(page.getByTestId("predict-outcome")).toBeVisible();
  await page.getByTestId("continue").click();

  // S3 investigate: labels counted from 0 (wrong), then 1 and n 4.
  await stepIs(page, "S3");
  await page.locator('[data-question="1"] [data-option="zero"]').click();
  await page.locator('[data-question="2"] input').fill("4");
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
  await page.locator('[data-question="1"] [data-option="one"]').click();
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass");
  await page.getByTestId("continue").click();

  // S4 graded: the degrees typed as n (every note a step high), in numbers; then the target's roll appears.
  await stepIs(page, "S4");
  await expect(page.getByTestId("continue")).toBeDisabled();
  await expect(page.getByTestId("target-roll")).toHaveCount(0);
  await setCode(page, deg("<[3 3 4 5] [5 4 3 2]>"));
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
  await expect(page.getByTestId("step-feedback")).not.toContainText(/\b(do|re|mi|fa|sol|la|ti)\b/);
  await expect(page.getByTestId("target-roll")).toBeVisible();
  await setCode(page, deg(ODE));
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass");
  await page.getByTestId("continue").click();

  // S5 graded: A instead of G, then G.
  await stepIs(page, "S5");
  await setCode(page, deg(ODE, "A4:major"));
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
  await setCode(page, deg(ODE, "G4:major"));
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass");
  const s5 = await api<{ passed: boolean; attempts: number }>(page, "GET", "/lessons/U03.L02/steps/S5");
  expect(s5.body).toMatchObject({ passed: true, attempts: 2 });
  await page.getByTestId("continue").click();

  // S6: the chords that set home, then one note; the player settles when that single note has sounded.
  await stepIs(page, "S6");
  const play = page.getByTestId("play-stimulus");
  await play.click();
  await expect(play).toHaveText("Stop");
  await expect(play).toHaveText("Play again", { timeout: 15_000 });
  await page.locator('[data-option="one"]').click();
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "fail");
  await page.locator('[data-option="five"]').click();
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "pass");
  await page.getByTestId("continue").click();

  // S7 graded ear: a generated 1, 3 or 5; a wrong degree first, then the drawn one.
  await stepIs(page, "S7");
  const want = (await trialAnswer(page))?.degrees ?? [];
  expect(["1", "3", "5"]).toContain(want[0]);
  const wrong = ["1", "3", "5"].find((d) => d !== want[0]) as string;
  expect((await submit(page, { answer: { degrees: [wrong] } }))?.status).toBe("fail");
  expect((await submit(page, { answer: { degrees: want } }))?.status).toBe("pass");
  await expect(page.getByTestId("continue")).toBeEnabled();
  await page.getByTestId("continue").click();

  // S8 sing: the targets on numbers; a take off on the middle notes, then in tune (graded through the
  // player's path: the fake microphone take is sing.pw.ts). Singing never gates: Continue is open throughout.
  await stepIs(page, "S8");
  await expect(page.getByTestId("sing-targets")).toContainText("1");
  await expect(page.getByTestId("sing-targets")).not.toContainText("sol");
  await expect(page.getByTestId("continue")).toBeEnabled();
  const sung = (ms: number[]) => ms.map((midi) => ({ midi, cents: 4, credit: 1 }));
  expect((await submit(page, { sung: sung([60, 65, 69, 65, 60]) }))?.status).not.toBe("pass");
  expect((await submit(page, { sung: sung([60, 64, 67, 64, 60]) }))?.status).toBe("pass");
  await page.getByTestId("continue").click();

  // S9 the Make: the starter (no 3) leaves the required rule open, the minimal answer ticks it; saved under the
  // lesson's title, the lesson completes on the server.
  await stepIs(page, "S9");
  await expect(page.getByTestId("sketch-title")).toHaveValue("Degrees in Code");
  await setCode(page, deg("<[0 1 2 ~] [4 [5 4] 1 ~]>"));
  await expect(page.locator('[data-rule="one-three-five"]')).toHaveAttribute("data-ok", "1", {
    timeout: 20_000,
  });
  await page.getByTestId("save-sketch").click();
  await expect(page.getByTestId("lesson-complete")).toBeVisible({ timeout: 20_000 });
  const prog = await api<{ lessons: { lessonId: string; status: string }[] }>(
    page,
    "GET",
    "/lessons/progress",
  );
  expect(prog.body?.lessons.find((l) => l.lessonId === "U03.L02")?.status).toBe("completed");
  const sketches = await api<{ items: { title: string; originId: string }[] }>(page, "GET", "/sketches");
  expect(sketches.body?.items.some((s) => s.originId === "U03.L02" && s.title === "Degrees in Code")).toBe(
    true,
  );

  // Every attempt carried an idempotency key, one per Check.
  expect(keys.length).toBeGreaterThanOrEqual(10);
  for (const k of keys) expect(k).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  expect(new Set(keys).size).toBe(keys.length);
});
