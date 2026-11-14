// The checkpoint walker of the lesson suite (w5-checkpoints.pw.ts, w6-checkpoints.pw.ts): a checkpoint opened from
// its dev seed is answered item by item in the real app. Every item on screen is answered through its own widget
// wherever it has one (walk.ts `answerWidget`), else through the player's own grading path (`__oakCheckpoint`: code
// items, sung items on their targets, the Make from its passing test); the first widget item is answered wrong
// first and saved again right. Then the hand-in and the result screen, read for raw IDs.
import { existsSync } from "node:fs";
import type { Page } from "@playwright/test";
import { REPO_ROOT } from "../../../../e2e/support/stack.ts";
import { expect } from "./support.ts";
import { api } from "./w3support.ts";
import { answerWidget, enterStage, type PartLike, wrongFor } from "./walk.ts";

/** A core unit with a checkpoint (`U09`: its checkpoint is `U09.CP`, its route `/checkpoint/U09`). */
export type Unit = `U${number}`;

/** Whether author:CP has written the checkpoint's authored items and Make (`content/core/Uxx/CP/checkpoint.ts`). */
export const written = (unit: Unit) => existsSync(`${REPO_ROOT}content/core/${unit}/CP/checkpoint.ts`);
export type Info = {
  kind: "family" | "authored" | "make" | null;
  idx: number | null;
  ex: (PartLike & { tests?: PartLike["tests"] }) | null;
  exp: Record<string, unknown> | null;
  params: Record<string, unknown> | null;
  trialCode: string | null;
};
export const info = (page: Page) =>
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
export const devAnswer = (page: Page, r: unknown) =>
  page.evaluate(
    (x) =>
      (
        globalThis as unknown as { __oakCheckpoint: { answer(r: unknown): Promise<void> } }
      ).__oakCheckpoint.answer(x),
    r,
  );

export const RAW = /\btb\.|\bfam\.|\bcd\.|[{}]|undefined|NaN|\[object/;

export const visibleText = (page: Page, testId: string) =>
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
export function answerBarsCode(trialCode: string): string | null {
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

export async function save(page: Page) {
  const check = page.getByTestId("check-stage").or(page.getByTestId("check"));
  await check.first().click();
  await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "saved", {
    timeout: 20_000,
  });
}

export async function startAttempt(page: Page, unit: Unit) {
  await page.goto(`/checkpoint/${unit}`);
  await expect(page.getByTestId("checkpoint-intro")).toBeVisible({ timeout: 30_000 });
  expect(await visibleText(page, "checkpoint-intro"), "the intro has no raw IDs").not.toMatch(RAW);
  await page.getByTestId("start-checkpoint").click();
  await expect(page.getByTestId("hint")).toHaveCount(0);
}

export async function makeCode(unit: Unit): Promise<string> {
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
export async function answerAll(
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

export async function cpStatus(page: Page, unit: Unit) {
  const prog = await api<{ checkpoints: { cpId: string; status: string; attempts: number }[] }>(
    page,
    "GET",
    "/lessons/progress",
  );
  return prog.body?.checkpoints.find((c) => c.cpId === `${unit}.CP`);
}

export async function handIn(page: Page, unit: Unit) {
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

export type AttemptItem = { idx: number; skillId: string; role: string; source: { kind: string } };

/** The attempt on screen, as the server composed it (starting again returns the same pending attempt). */
export async function attemptItems(page: Page, unit: Unit) {
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
export function oneSkillOut(items: readonly AttemptItem[]): Set<number> {
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
