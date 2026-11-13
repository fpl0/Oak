// The voicing gate on the real lessons (contracts §3.1 rule 6, wave4.md §5.6), from the dev seed
// "U05.L07 gate open" (U05.L07 resumed at its gate check, one attempt at 0.72 on the server):
//  - below 0.9 the gate box says by how much and what to fix, `voicing()` stays locked (a graded step that uses it
//    is refused with a locked-tool finding, `gates.voicing` is not passed, the tool is not in the toolbox), and
//    the learner retries at once;
//  - at 0.9 the unlock moment shows the learner's hand voicing next to Strudel's `chord(…).voicing()`, the server
//    reports the gate passed with the typed code, U05.L07 completes, and U05.L08 opens without its second chance
//    and with the gated tools: its `.voicing()` steps pass and its completion lists them as new in the toolbox.
// With the gate unmet, U05.L08 opens on the second chance and Continue waits for a gate pass (the one hard gate).
import { expect, setCode, snapshot, stepIs, test } from "./support.ts";
import { api, reseedFresh, seed, setQuiet } from "./w3support.ts";
import { expectHonestFeedback, lessonDef, shownFrom, walkLesson } from "./walk.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

interface TestLike {
  name: string;
  expect: string;
  response: { code?: string };
  feedback?: string[];
}
type Gate = { passed: boolean; best: number | null; passedCode?: string | null; holds: string[] };
type Unlock = { itemId: string };

const RAW = /\btb\.|\bfam\.|[{}]|undefined|NaN/;

test("U05.L07: a fail keeps voicing() locked and says what to fix; a pass opens it, then U05.L08", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await seed(page, "U05.L07 gate open");
  await setQuiet(page, false);
  const def = await lessonDef("U05.L07");
  const gateStep = def.steps.find((s) => s.exercise?.id === "hand-voiced-cadence");
  expect(gateStep, "U05.L07 has the gate check").toBeDefined();
  const id = gateStep?.id as string;
  const ex = gateStep?.exercise as unknown as { tests: TestLike[] };
  const before = await api<Gate>(page, "GET", "/gates/voicing");
  expect(before.status).toBe(200);
  expect(before.body?.passed, "the seed left the gate open").toBe(false);
  expect(before.body?.holds).toContain("tb.voicing");

  // Today resumes U05.L07 at the gate check.
  await page.goto("/learn/U05.L07");
  await stepIs(page, id);
  const box = page.getByTestId("gate-box");
  await expect(box).toHaveAttribute("data-tone", /open|near/);

  // The lesson's own pinned mistake: below 0.9, the box says by how much and what to fix.
  const wrong = ex.tests.find((t) => t.expect === "fail" && t.response.code && !/unchanged/i.test(t.name));
  expect(wrong, "a pinned mistake").toBeDefined();
  await setCode(page, wrong?.response.code as string);
  await page.getByTestId("check").click();
  await expect(box).toHaveAttribute("data-tone", "near", { timeout: 30_000 });
  await expect(page.getByTestId("gate-title")).toHaveText(/^\d+% of the 90% the gate needs$/);
  const fixes = ((await page.getByTestId("gate-fixes").textContent()) ?? "").trim();
  expect(fixes.length, "what to fix, in words").toBeGreaterThan(12);
  expect(fixes).not.toMatch(RAW);
  console.log(`[gate] near: ${fixes.replace(/\s+/g, " ")}`);
  await expect(page.getByTestId("gate-moment")).toHaveCount(0);

  // voicing() stays locked: the same step answered with it is refused as a tool not yet open.
  await setCode(page, 'setcpm(80/4)\n\nchords: chord("<C F G C>").voicing().s("piano")');
  await page.getByTestId("check").click();
  // The verdict leads with the tool that is not open yet (the earlier verdict was about the notes).
  await expect(page.getByTestId("step-feedback-summary"), "names the locked tool").toContainText(
    /voicing|chord/,
    { timeout: 30_000 },
  );
  await expectHonestFeedback(page, [], "U05.L07 voicing() before the gate");
  await expect
    .poll(async () => {
      const snap = (await snapshot(page)) as { lastResult?: { diagnostics: { id: string }[] } | null } | null;
      return (snap?.lastResult?.diagnostics ?? []).some((d) => d.id.startsWith("code.locked"));
    })
    .toBe(true);
  const still = await api<Gate>(page, "GET", "/gates/voicing");
  expect(still.body?.passed, "still locked on the server").toBe(false);
  const unlocks = await api<{ items: Unlock[] }>(page, "GET", "/unlocks");
  expect((unlocks.body?.items ?? []).map((u) => u.itemId)).not.toContain("tb.voicing");

  // Retry at once with the smooth voicing: the gate opens with the unlock moment.
  const right = ex.tests.find((t) => t.expect === "pass" && t.response.code);
  await setCode(page, right?.response.code as string);
  await page.getByTestId("check").click();
  await expect(box).toHaveAttribute("data-tone", "met", { timeout: 30_000 });
  await expect(page.getByTestId("gate-title")).toHaveText(/the gate is open/);
  const moment = page.getByTestId("gate-moment");
  await expect(moment).toBeVisible();
  await expect(page.getByTestId("gate-strudel-code")).toContainText('.voicing().s("piano")', {
    timeout: 30_000,
  });
  await expect(moment.locator(":scope > figure")).toHaveCount(2);
  for (const f of await moment.locator(":scope > figure").all())
    await expect(f.locator("svg").first(), "both voicings drawn").toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("gate-play-strudel")).toBeEnabled();
  const after = await api<Gate>(page, "GET", "/gates/voicing");
  expect(after.body?.passed, "gates.voicing reports the pass").toBe(true);
  expect(after.body?.passedCode, "with the code the learner typed").toContain("bass:");

  // The rest of U05.L07, then U05.L08: no second chance, the gated tools in hand.
  await page.getByTestId("continue").click();
  const rest = def.steps[def.steps.findIndex((s) => s.id === id) + 1];
  if (rest) await walkLesson(page, def, { lessonId: "U05.L07", mic: false, quiet: false, from: rest.id });
  const l08 = await lessonDef("U05.L08");
  await page.goto("/learn/U05.L08");
  const first = l08.steps.find((s) => !s.gateCheck) as { id: string };
  await stepIs(page, first.id);
  await expect(page.getByTestId("gate-box")).toHaveCount(0);
  // U05.L08's only full walk (walk-u05.pw.ts stops at U05.L07): every shown step, a pinned mistake first, complete.
  const seen = await walkLesson(page, l08, { lessonId: "U05.L08", mic: false, quiet: false });
  for (const s of shownFrom(l08)) expect(seen, `U05.L08: ${s} walked`).toContain(s);
  const complete = page.getByTestId("lesson-complete");
  await expect(complete).toContainText("New in your toolbox");
  await expect(complete).toContainText("voicing");
  const opened = await api<{ items: Unlock[] }>(page, "GET", "/unlocks");
  expect((opened.body?.items ?? []).map((u) => u.itemId)).toEqual(
    expect.arrayContaining(["tb.voicing", "tb.chord"]),
  );
});

test("U05.L08 with the gate unmet: the second chance first, and Continue waits for a gate pass", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seed(page, "U05.L07 gate open");
  await setQuiet(page, false);
  const def = await lessonDef("U05.L08");
  const first = def.steps[0] as unknown as {
    id: string;
    gateCheck?: boolean;
    exercise: { tests: TestLike[] };
  };
  expect(first.gateCheck, "U05.L08 S1 is the second chance").toBe(true);
  await page.goto("/learn/U05.L08?preview=true");
  await stepIs(page, first.id);
  await expect(page.getByTestId("gate-title")).toHaveText("One check before this lesson");
  await expect(page.getByTestId("continue")).toBeDisabled();
  const wrong = first.exercise.tests.find(
    (t) => t.expect === "fail" && t.response.code && !/unchanged/i.test(t.name),
  );
  await setCode(page, wrong?.response.code as string);
  await page.getByTestId("check").click();
  await expect(page.getByTestId("gate-box")).toHaveAttribute("data-tone", "near", { timeout: 30_000 });
  await expect(page.getByTestId("continue"), "below 0.9 the lesson stays shut").toBeDisabled();
  const right = first.exercise.tests.find((t) => t.expect === "pass" && t.response.code);
  await setCode(page, right?.response.code as string);
  await page.getByTestId("check").click();
  await expect(page.getByTestId("gate-box")).toHaveAttribute("data-tone", "met", { timeout: 30_000 });
  await expect(page.getByTestId("continue")).toBeEnabled();
});
