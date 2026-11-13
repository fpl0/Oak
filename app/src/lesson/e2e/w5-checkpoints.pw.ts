// U09.CP (over U08–U09), U10.CP and U11.CP end to end in the real app from their dev seeds ("U09.CP due" …, wave5.md
// §6; contracts §7.6). Every item on screen is answered through its own widget wherever it has one (the Wave 5 form
// strip, 12-bar grid and scale builder included, see walk.ts), else through the player's own grading path (code
// items, sung items on their targets, the Make from its passing test). The first widget item is answered wrong first
// and saved again right. The hand-in passes, by skill, with no raw IDs, and is stored on the server. Then U10.CP in
// Quiet mode: its sung and ear items set levels and never gate — the sung ones are set aside, the hand-in still
// passes, and the result says singing never counts against it.
import { existsSync } from "node:fs";
import type { Page } from "@playwright/test";
import { REPO_ROOT } from "../../../../e2e/support/stack.ts";
import { expect, test } from "./support.ts";
import { api, reseedFresh, seed, setQuiet } from "./w3support.ts";
import { answerWidget, enterStage, type PartLike, wrongFor } from "./walk.ts";

test.describe.configure({ mode: "serial" });
test.afterAll(async ({ request }) => {
  await reseedFresh(request);
});

type Unit = "U09" | "U10" | "U11";

/** Whether author:CP has written the checkpoint's authored items and Make (`content/core/Uxx/CP/checkpoint.ts`). */
const written = (unit: Unit) => existsSync(`${REPO_ROOT}content/core/${unit}/CP/checkpoint.ts`);
type Info = {
  kind: "family" | "authored" | "make" | null;
  idx: number | null;
  ex: (PartLike & { tests?: PartLike["tests"] }) | null;
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
          idx(): unknown;
          exercise(): unknown;
          expected(): unknown;
          params(): unknown;
          trialCode(): unknown;
        };
      }
    ).__oakCheckpoint;
    return {
      kind: d.kind(),
      idx: d.idx(),
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

/** A dictation written right: the trial's tune line without its cue bar (`n("<~ A B>")` → `n("<A B>")`). */
function answerBarsCode(trialCode: string): string | null {
  const mel = trialCode
    .split("\n")
    .find((l) => l.startsWith("mel:") || l.startsWith("bass:"))
    ?.replace(/^(mel|bass):\s*/, "");
  const m = mel ? /n\("<~ (.*)>"\)/.exec(mel) : null;
  if (!mel || !m) return null;
  const bars = (m[1] as string).match(/\[[^[\]]*(?:\[[^\]]*\][^[\]]*)*\]|\S+/g) ?? [];
  const inner = bars.length === 1 ? bars[0] : `<${bars.join(" ")}>`;
  return mel.replace(m[0], `n("${inner}")`);
}

async function save(page: Page) {
  const check = page.getByTestId("check-stage").or(page.getByTestId("check"));
  await check.first().click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "saved", {
    timeout: 20_000,
  });
}

async function startAttempt(page: Page, unit: Unit) {
  await page.goto(`/checkpoint/${unit}`);
  await expect(page.getByTestId("checkpoint-intro")).toBeVisible({ timeout: 30_000 });
  expect(await visibleText(page, "checkpoint-intro"), "the intro has no raw IDs").not.toMatch(RAW);
  await page.getByTestId("start-checkpoint").click();
  await expect(page.getByTestId("hint")).toHaveCount(0);
}

async function makeCode(unit: Unit): Promise<string> {
  const def = (await import(`../../../../content/core/${unit}/CP/checkpoint.ts`)).default as {
    make: { tests: { expect: string; response: { code?: string } }[] };
  };
  const pass = def.make.tests.find((t) => t.expect === "pass" && typeof t.response.code === "string");
  return pass?.response.code as string;
}

/**
 * Every item answered right (the first widget item wrong first); returns how each was answered. `skip` names the
 * item indexes left unanswered ("Skip this one": a gating item skipped counts 0), for a score under the line.
 */
async function answerAll(
  page: Page,
  unit: Unit,
  o: { quiet: boolean; skip?: ReadonlySet<number> },
): Promise<string[]> {
  const kinds: string[] = [];
  let wrongDone = false;
  for (let i = 0; i < 40; i++) {
    const review = page.getByTestId("checkpoint-review");
    await expect(page.getByTestId("lesson-step").or(review)).toBeVisible({ timeout: 30_000 });
    if (await review.isVisible()) break;
    const it = await info(page);
    const ex = it.ex;
    expect(ex, "an item on screen").not.toBeNull();
    expect(await visibleText(page, "lesson-step"), "no raw IDs on the item").not.toMatch(RAW);
    if (it.idx !== null && o.skip?.has(it.idx) && it.kind !== "make") {
      await page.getByTestId("skip-item").click();
      kinds.push("skipped");
      continue;
    }
    if (it.kind === "make") {
      await devAnswer(page, { code: await makeCode(unit) });
      kinds.push("make");
      await expect(review).toBeVisible({ timeout: 30_000 });
      break;
    }
    if (ex?.kind === "sing") {
      if (o.quiet) {
        // Quiet mode: the sung item is set aside, nothing waits for a voice (contracts §8.5).
        await expect(page.getByRole("button", { name: "Sing", exact: true })).toHaveCount(0);
        await page.getByTestId("skip-item").click();
        kinds.push("sing-set-aside");
        continue;
      }
      const t = (it.params?.singTargets as { midi: number }[] | undefined) ?? [];
      expect(t.length, "a sung item has its targets").toBeGreaterThan(0);
      await devAnswer(page, { sung: t.map((x) => ({ midi: x.midi, cents: 3, credit: 1 })) });
      kinds.push("sing");
      continue;
    }
    if (ex?.kind === "all") {
      // Several answers in one item (U11.CP build-the-scales: three scales on the keyboard), each in its own part.
      const parts = (ex as PartLike & { parts?: PartLike[] }).parts ?? [];
      for (const [k, part] of parts.entries()) {
        const box = page.getByTestId("lesson-step").locator(`li[data-part="${k + 1}"]`);
        const pass = part.tests.find((t) => t.expect === "pass");
        expect(pass, `${ex.id} part ${k + 1}: a passing test`).toBeDefined();
        expect(
          await answerWidget(page, part, (pass as { response: Record<string, unknown> }).response, box),
          `${ex.id} part ${k + 1} through its widget`,
        ).toBe(true);
      }
      await save(page);
      kinds.push(`ui:all(${parts.map((p) => p.answer?.ui).join(",")})`);
      await page.getByTestId("next-item").click();
      continue;
    }
    const passTest = ex?.tests?.find((t) => t.expect === "pass");
    if (it.kind === "authored" && passTest && typeof passTest.response.code === "string") {
      await expect(page.getByTestId("lesson-step").locator(".cm-editor").first()).toBeVisible({
        timeout: 30_000,
      });
      await devAnswer(page, { code: passTest.response.code });
      kinds.push(`code:${ex?.id}`);
      continue;
    }
    if (it.kind === "family" && ex?.answer?.ui === "code") {
      const code = (it.trialCode && answerBarsCode(it.trialCode)) ?? it.trialCode;
      expect(code, `${ex.id}: something to write`).toBeTruthy();
      await devAnswer(page, { code });
      kinds.push("code-family");
      continue;
    }
    const response: Record<string, unknown> =
      it.kind === "authored"
        ? (passTest?.response ?? { answer: ex?.correct ?? {} })
        : ex?.kind === "tap"
          ? { taps: (it.params?.tapTimes as number[] | undefined) ?? [] }
          : { answer: it.exp ?? {} };
    if (ex?.stageAnswers) {
      const stages = (response.answer as { stages?: Record<string, string[]> }).stages ?? {};
      for (const [id, values] of Object.entries(stages)) await enterStage(page, ex, id, values);
      await save(page);
      kinds.push("ui:staged");
      await page.getByTestId("next-item").click();
      continue;
    }
    const ui = ex?.answer?.ui;
    if (
      !wrongDone &&
      ex &&
      it.kind === "family" &&
      ["choice", "degree-pad", "text", "quality-pad", "form", "scale-builder", "bar-grid"].includes(ui ?? "")
    ) {
      const wrong = await wrongFor(page, ex, response.answer as Record<string, unknown>);
      if (await answerWidget(page, ex, wrong)) {
        await save(page);
        wrongDone = true;
        kinds.push("wrong-first");
      }
    }
    if (ex && ex.kind !== "tap" && (await answerWidget(page, ex, response))) {
      await save(page);
      kinds.push(`ui:${typeof response.staff === "string" ? "staff" : ui}`);
      await page.getByTestId("next-item").click();
    } else {
      await devAnswer(page, response);
      kinds.push(`dev:${ui ?? ex?.kind}`);
    }
  }
  console.log(`[${unit}.CP items${o.quiet ? ", Quiet" : ""}] ${kinds.join(", ")}`);
  return kinds;
}

async function cpStatus(page: Page, unit: Unit) {
  const prog = await api<{ checkpoints: { cpId: string; status: string; attempts: number }[] }>(
    page,
    "GET",
    "/lessons/progress",
  );
  return prog.body?.checkpoints.find((c) => c.cpId === `${unit}.CP`);
}

async function handIn(page: Page, unit: Unit) {
  await expect(page.getByTestId("checkpoint-review")).toBeVisible();
  expect(await visibleText(page, "checkpoint-review")).not.toMatch(RAW);
  await page.getByTestId("hand-in").click();
  const result = page.getByTestId("checkpoint-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  expect(await visibleText(page, "checkpoint-result")).not.toMatch(RAW);
  console.log(
    `[${unit}.CP result] ${((await result.textContent()) ?? "").replace(/\s+/g, " ").slice(0, 400)}`,
  );
  return result;
}

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

type AttemptItem = { idx: number; skillId: string; role: string; source: { kind: string } };

/** The attempt on screen, as the server composed it (starting again returns the same pending attempt). */
async function attemptItems(page: Page, unit: Unit) {
  const r = await api<{ attemptNo: number; items: AttemptItem[] }>(
    page,
    "POST",
    `/checkpoints/${unit}.CP/start`,
  );
  expect(r.status, "the pending attempt").toBe(200);
  return r.body as { attemptNo: number; items: AttemptItem[] };
}

/**
 * The items of one gated skill, chosen so that the rest still scores at least 0.75 on the gating items: the
 * skill falls under 70 % (so not a pass) while a retake is over the soft-pass line.
 */
function oneSkillOut(items: readonly AttemptItem[]): Set<number> {
  const gating = items.filter((i) => i.role === "gating");
  const bySkill = new Map<string, AttemptItem[]>();
  for (const i of gating) bySkill.set(i.skillId, [...(bySkill.get(i.skillId) ?? []), i]);
  const make = new Set(items.filter((i) => i.source.kind === "make").map((i) => i.skillId));
  const pick = [...bySkill.entries()]
    .filter(([skill, its]) => !make.has(skill) && (gating.length - its.length) / gating.length >= 0.76)
    .sort((a, b) => a[1].length - b[1].length)[0];
  expect(pick, "a gated skill to leave out").toBeDefined();
  return new Set((pick?.[1] ?? []).map((i) => i.idx));
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
