// U03.CP and U04.CP in the real app from their dev seeds ("U03.CP due", "U04.CP due"): every item on screen is
// answered, through its own widget wherever it has one (options, the degree pad, the text field, the interval
// pad's text field, the key-signature staff by keyboard), else through the player's own grading path (code
// items, sung items on their targets, the Make from its passing test). The first widget item is answered wrong
// first and saved again right (a checkpoint shows no verdict per item, only "Answer saved"). The hand-in must
// pass, by skill, with no raw IDs anywhere on the result, and the attempt must be stored on the server. U03.CP also
// holds what checkpoint-w3.pw.ts asked of a whole U03.CP (the key signature, sung items and the Make among the items,
// nothing set aside out of Quiet mode, ear and voice skills only setting the practice level, N03's line).
import type { Page } from "@playwright/test";
import { expect, test } from "./support.ts";
import { api, reseedFresh, seed, setQuiet } from "./w3support.ts";
import { clickOption } from "./walk.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

type Info = {
  kind: "family" | "authored" | "make" | null;
  ex: {
    id: string;
    kind: string;
    answer?: { ui?: string; mode?: string; starter?: string };
    correct?: Record<string, unknown>;
    reference?: { solutions: string[] };
    tests?: { expect: string; response: Record<string, unknown> }[];
  } | null;
  exp: Record<string, unknown> | null;
  params: Record<string, unknown> | null;
  trialCode: string | null;
};
const info = (page: Page) =>
  page.evaluate(() => {
    const d = (
      globalThis as unknown as {
        __oakCheckpoint: {
          kind(): unknown;
          exercise(): unknown;
          expected(): unknown;
          params(): unknown;
          trialCode(): unknown;
        };
      }
    ).__oakCheckpoint;
    return {
      kind: d.kind(),
      ex: d.exercise(),
      exp: d.expected(),
      params: d.params(),
      trialCode: d.trialCode(),
    } as Info;
  });
const devAnswer = (page: Page, r: unknown) =>
  page.evaluate(
    (x) =>
      (
        globalThis as unknown as { __oakCheckpoint: { answer(r: unknown): Promise<void> } }
      ).__oakCheckpoint.answer(x),
    r,
  );

const RAW = /\btb\.|\bfam\.|\bcd\.|[{}]|undefined|NaN|\[object/;

/** The words a learner reads in a region (an engraved staff's own <style> is not text). */
const visibleText = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate(
    (el) => {
      const c = el.cloneNode(true) as HTMLElement;
      for (const s of c.querySelectorAll("style, script")) s.remove();
      return c.textContent ?? "";
    },
    undefined,
    { timeout: 20_000 },
  );

/** Puts an answer into the item's widget; false when the widget is not one the walker drives. */
async function fill(
  page: Page,
  ui: string | undefined,
  mode: string | undefined,
  a: Record<string, unknown>,
) {
  const step = page.getByTestId("lesson-step");
  if (ui === "choice" && Array.isArray(a.choice)) {
    await clickOption(page, String(a.choice[0]));
    return true;
  }
  if (ui === "degree-pad" && Array.isArray(a.degrees)) {
    const pad = step.locator("[data-degree]").first();
    await pad.focus({ timeout: 10_000 });
    for (let i = 0; i < a.degrees.length + 2; i++) await page.keyboard.press("Backspace");
    for (const d of a.degrees as string[]) await step.locator(`[data-degree="${d}"]`).first().click();
    return true;
  }
  if (ui === "staff-input" && mode === "key-signature" && Array.isArray(a.text)) {
    const surface = page.getByTestId("keysig-surface");
    await surface.focus();
    for (let i = 0; i < 8; i++) await page.keyboard.press("Backspace");
    const acc = a.text as string[];
    await page.keyboard.press(acc[0]?.endsWith("b") ? "-" : "#");
    for (const x of acc) await page.keyboard.press((x[0] ?? "").toUpperCase());
    return true;
  }
  if (ui === "number" && typeof a.number === "number") {
    await step.locator("input").first().fill(String(a.number));
    return true;
  }
  if (ui === "text" && Array.isArray(a.text)) {
    const field = step.locator('input[type="text"]').first();
    if ((await field.count()) === 0) return false;
    await field.fill((a.text as string[]).join(" "));
    return true;
  }
  return false;
}

/**
 * A dictation written right: the trial's tune line without its cue bar (`n("<~ A B>")` → `n("<A B>")`, one bar
 * → `n("A")`), as the learner writes the bars they heard. Null for a trial that is not a dictation.
 */
function answerBarsCode(trialCode: string): string | null {
  const mel = trialCode
    .split("\n")
    .find((l) => l.startsWith("mel:"))
    ?.replace(/^mel:\s*/, "");
  const m = mel ? /n\("<~ (.*)>"\)/.exec(mel) : null;
  if (!mel || !m) return null;
  const bars = (m[1] as string).match(/\[[^[\]]*(?:\[[^\]]*\][^[\]]*)*\]|\S+/g) ?? [];
  const inner = bars.length === 1 ? bars[0] : `<${bars.join(" ")}>`;
  return mel.replace(m[0], `n("${inner}")`);
}

/** A wrong answer of the same shape. */
function wrongOf(ui: string | undefined, a: Record<string, unknown>): Record<string, unknown> | null {
  if (ui === "degree-pad" && Array.isArray(a.degrees))
    return { degrees: (a.degrees as string[]).map((d, i) => (i === 0 ? (d === "1" ? "2" : "1") : d)) };
  if (ui === "staff-input" && Array.isArray(a.text) && a.text.length > 1)
    return { text: [...(a.text as string[])].reverse() };
  if (ui === "number" && typeof a.number === "number") return { number: a.number + 1 };
  return null;
}

async function save(page: Page) {
  await page.getByTestId("check").click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "saved", {
    timeout: 20_000,
  });
}

async function walkCheckpoint(page: Page, unit: "U03" | "U04") {
  const def = (await import(`../../../../content/core/${unit}/CP/checkpoint.ts`)).default as {
    make: { tests: { expect: string; response: { code?: string } }[] };
  };
  await page.goto(`/checkpoint/${unit}`);
  await expect(page.getByTestId("checkpoint-intro")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("start-checkpoint").click();
  await expect(page.getByTestId("hint")).toHaveCount(0);
  const kinds: string[] = [];
  const ids: string[] = [];
  let wrongDone = false;
  for (let i = 0; i < 40; i++) {
    const review = page.getByTestId("checkpoint-review");
    await expect(page.getByTestId("lesson-step").or(review)).toBeVisible({ timeout: 30_000 });
    if (await review.isVisible()) break;
    const it = await info(page);
    const ex = it.ex;
    expect(ex, "an item on screen").not.toBeNull();
    ids.push(ex?.id ?? "");
    expect(await visibleText(page, "lesson-step"), "no raw IDs on the item").not.toMatch(RAW);
    if (it.kind === "make") {
      const pass = def.make.tests.find((t) => t.expect === "pass" && typeof t.response.code === "string");
      await devAnswer(page, { code: pass?.response.code });
      kinds.push("make");
      // The Make is the last item: its saved sketch leads to the review.
      await expect(page.getByTestId("checkpoint-review")).toBeVisible({ timeout: 30_000 });
      break;
    }
    if (ex?.kind === "sing") {
      const t = (it.params?.singTargets as { midi: number }[] | undefined) ?? [];
      expect(t.length, "a sung item has its targets").toBeGreaterThan(0);
      await devAnswer(page, { sung: t.map((x) => ({ midi: x.midi, cents: 3, credit: 1 })) });
      kinds.push("sing");
      continue;
    }
    const passTest = ex?.tests?.find((t) => t.expect === "pass");
    if (it.kind === "authored" && passTest && typeof passTest.response.code === "string") {
      await devAnswer(page, { code: passTest.response.code });
      kinds.push("code");
      continue;
    }
    if (it.kind === "family" && ex?.answer?.ui === "code") {
      // Written in code: a dictation's notes as n() values (degree − 1) in the starter, or the notes read off
      // the staff as the trial's own line.
      const code = (it.trialCode && answerBarsCode(it.trialCode)) ?? it.trialCode;
      expect(code, `${ex.id}: something to write`).toBeTruthy();
      await devAnswer(page, { code });
      kinds.push("code-family");
      continue;
    }
    const answer =
      it.kind === "authored"
        ? ((passTest?.response.answer as Record<string, unknown> | undefined) ?? ex?.correct ?? {})
        : (it.exp ?? {});
    const ui = ex?.answer?.ui;
    const mode = ex?.answer?.mode;
    const wrong = wrongDone ? null : wrongOf(ui, answer);
    if (wrong && (await fill(page, ui, mode, wrong))) {
      await save(page);
      wrongDone = true;
    }
    if (await fill(page, ui, mode, answer)) {
      await save(page);
      kinds.push(`ui:${ui}`);
      await page.getByTestId("next-item").click();
    } else {
      // A widget the walker does not drive (a code surface of a family item): the player's own path.
      await devAnswer(page, { answer });
      kinds.push(`dev:${ui}`);
    }
  }
  console.log(`[${unit}.CP items] ${kinds.join(", ")}`);
  expect(wrongDone, "one item was answered wrong first").toBe(true);
  expect(kinds).toContain("make");
  expect(kinds.filter((k) => k.startsWith("ui:")).length, "most items through their widgets").toBeGreaterThan(
    3,
  );
  await expect(page.getByTestId("checkpoint-review")).toBeVisible();
  expect(await visibleText(page, "checkpoint-review")).not.toMatch(RAW);
  if (unit === "U03") {
    // Out of Quiet mode nothing is set aside; the key signature item and a sung item were among the items.
    await expect(page.getByTestId("quiet-set-aside")).toHaveCount(0);
    expect(ids, "U03.CP's key signature item").toContain("keysig-eb");
    expect(kinds, "U03.CP's sung items").toContain("sing");
  }
  await page.getByTestId("hand-in").click();
  const result = page.getByTestId("checkpoint-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  expect(await visibleText(page, "checkpoint-result")).not.toMatch(RAW);
  await expect(result).not.toContainText(/failed|debt/i);
  if (unit === "U03") {
    // Ear and voice skills only set the practice level; the notation skill N03 has its own line.
    await expect(result).toContainText("sets your practice level");
    await expect(page.locator('[data-skill="N03"]')).toBeVisible();
  }
  const text = (await result.textContent()) ?? "";
  console.log(`[${unit}.CP result] ${text.replace(/\s+/g, " ").slice(0, 400)}`);
  // Every item was answered right in the end: every skill's meter is full.
  const values = await page
    .locator('[data-skill] [role="meter"]')
    .evaluateAll((els) => els.map((e) => Number(e.getAttribute("aria-valuenow"))));
  expect(values.length, "per-skill meters").toBeGreaterThan(2);
  expect(
    values.every((v) => v >= 0.999),
    `every skill at 100%: ${values.join(", ")}`,
  ).toBe(true);
  const prog = await api<{ checkpoints: { cpId: string; status: string; attempts: number }[] }>(
    page,
    "GET",
    "/lessons/progress",
  );
  const cp = prog.body?.checkpoints.find((c) => c.cpId === `${unit}.CP`);
  expect(cp, `${unit}.CP on the server`).toMatchObject({ status: "passed", attempts: 1 });
}

for (const unit of ["U03", "U04"] as const) {
  test(`${unit}.CP: every item answered on screen, one wrong then right, handed in, passed`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await seed(page, `${unit}.CP due`);
    await setQuiet(page, false);
    await walkCheckpoint(page, unit);
  });
}
