// Wave 4 review (review:journey): a whole U06 day from the keyboard alone, with reduced motion, at 1280×800 in
// Bark: Today → the warm-up (stage D sets by keys; the rest reported skipped to keep the test short) → U06.L02
// "Roman Numerals" step by step (choices, the numerals typed into the RN palette, a chord symbol typed, code typed
// into the region, the Make) → the Coda → Done for today. The page is only read (to know what a trial asks); every
// action is a key press, and every control that takes focus shows a focus ring.
import { expect, type Page, test } from "@playwright/test";
import { lessonDef } from "../../app/src/lesson/e2e/walk.ts";
import { textNow, useUiPrefs } from "../support/ui.ts";
import { api, openToday, resetClock, reviewMic, shootAll, watch } from "./support.ts";
import {
  active,
  byId,
  byText,
  checkStep,
  continueStep,
  quietHmr,
  seedPoint,
  step,
  tabTo,
  typeCode,
  typeRegion,
} from "./w4-support.ts";

test.use({
  launchOptions: { args: reviewMic("hold-c4.wav") },
  permissions: ["microphone"],
  reducedMotion: "reduce",
  viewport: { width: 1280, height: 800 },
});

type DrillTrial = {
  expected: { degrees?: string[]; qualities?: string[]; rn?: string[]; choice?: string[] };
  options?: { id: string }[];
};
const QUALITY_KEYS: Record<string, string> = { maj: "1", min: "2", dim: "3", aug: "4" };
const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7" };
const romanDigit = (rn: string) => ROMAN[rn.toLowerCase().replace(/[^iv]/g, "")] ?? "1";

type WarmItem = { id: string; familyId: string; kind: string };
type SessionHandle = {
  report(r: unknown): void;
  state(): { plan: { warmup: { items: WarmItem[] } } | null; warmupIndex: number };
};

/** Reports these warm-up items skipped (the session's dev hook), as the learner's own skip would. */
async function skipItems(page: Page, items: readonly WarmItem[]): Promise<void> {
  await page.evaluate((list) => {
    const o = (window as never as { __oakSession: SessionHandle }).__oakSession;
    for (const item of list)
      o.report({
        block: "warmup",
        source: "drills",
        warmupItemId: item.id,
        drillSessionId: null,
        meanCredit: null,
        skipped: true,
      });
  }, items);
}

/**
 * The warm-up: the first stage D set (chord quality, inversions, numerals, function, bass degree…) is run by keys
 * to its summary, from the drawn trials; the sets before and after it are reported skipped, so the test stays
 * short (the drill and warm-up suites walk every family).
 */
async function stageDSetByKeys(page: Page): Promise<string> {
  const warmup = page.getByTestId("warmup");
  await expect(warmup).toBeVisible({ timeout: 60_000 });
  const items = await page.evaluate(
    () => (window as never as { __oakSession: SessionHandle }).__oakSession.state().plan?.warmup.items ?? [],
  );
  const at = items.findIndex(
    (i) => /^fam\.(chd|har)\./.test(i.familyId) && i.familyId !== "fam.har.progression",
  );
  expect(
    at,
    `a stage D set in today's warm-up: ${items.map((i) => i.familyId).join(", ")}`,
  ).toBeGreaterThanOrEqual(0);
  const item = items[at] as WarmItem;
  await skipItems(page, items.slice(0, at));
  const vis = (id: string) =>
    page
      .getByTestId(id)
      .filter({ visible: true })
      .first()
      .isVisible()
      .catch(() => false);
  const deadline = Date.now() + 120_000;
  let lastTrial = "";
  while (Date.now() < deadline) {
    if ((await vis("start-set")) || (await vis("listen-block"))) {
      if (await vis("start-set"))
        await expect(page.getByTestId("start-set")).toBeFocused({ timeout: 10_000 });
      await page.keyboard.press("Enter");
    } else if (await vis("set-summary")) {
      await shootAll(page, "w4-kbd-warmup-summary");
      await skipItems(page, items.slice(at));
      await expect(warmup).toBeHidden({ timeout: 30_000 });
      return item.familyId;
    } else if (await vis("trial-feedback")) {
      const a = await active(page);
      expect(a.tag, "after the answer, focus is on a control (never lost to the page)").not.toBe("body");
      await page.keyboard.press("Enter");
    } else {
      const stage = (await textNow(page.getByTestId("stage-text"))).trim();
      const counter = await textNow(page.getByTestId("trial-counter"));
      if (/your turn/i.test(stage) && counter !== lastTrial) {
        lastTrial = counter;
        const t = await page.evaluate(
          () => (globalThis as { __oakDrillTrial?: DrillTrial }).__oakDrillTrial ?? null,
        );
        const ids = await page
          .locator("main [data-option]")
          .evaluateAll((els) => els.map((e) => e.getAttribute("data-option") ?? ""));
        const keys = t?.expected.degrees?.length
          ? t.expected.degrees.map((d) => d.replace(/^[b#]/, ""))
          : t?.expected.qualities?.length
            ? t.expected.qualities.map((q) => QUALITY_KEYS[q] ?? "1")
            : t?.expected.rn?.length
              ? t.expected.rn.map(romanDigit)
              : t?.expected.choice?.length
                ? t.expected.choice.map((c) => String(ids.indexOf(c) + 1))
                : [];
        expect(keys.length, `${item.familyId}: a trial answered by keys`).toBeGreaterThan(0);
        const a = await active(page);
        expect(a.tag, "the pad has focus when the trial is ready").toBe("button");
        for (const k of keys) await page.keyboard.press(k);
        await page.waitForTimeout(300);
        if (!(await vis("trial-feedback"))) await page.keyboard.press("Enter");
      }
    }
    await page.waitForTimeout(300);
  }
  throw new Error(`${item.familyId}: the set did not finish in time`);
}

test("a whole U06 day from the keyboard, with reduced motion", async ({ page, request }) => {
  test.setTimeout(240_000);
  await resetClock(request);
  await seedPoint(request, "after U05.CP");
  await quietHmr(page);
  await useUiPrefs(page, { theme: "bark", motion: "system" });
  const problems = watch(page);
  const plan = await api<{ kind: string; mapItemId: string }>(request, "GET", "/api/session/today");
  expect(plan).toMatchObject({ kind: "lesson", mapItemId: "U06.L02" });
  await openToday(page);
  await tabTo(page, byId("start-session"), "Start session");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/session\/?$/);
  console.log(`[warm-up] ${await stageDSetByKeys(page)} by keys`);

  const def = await lessonDef("U06.L02");
  for (const s of def.steps) {
    await expect(step(page)).toHaveAttribute("data-step", s.id, { timeout: 60_000 });
    const ex = s.exercise as
      | (NonNullable<typeof s.exercise> & {
          correct?: { rn?: string[]; text?: string[] };
          code?: { starter?: string };
          questions?: { q: string; options?: { id: string }[] }[];
        })
      | undefined;
    console.log(`[step] ${s.id} ${s.kind} ${ex?.kind ?? ""} focus=${(await active(page)).text}`);
    if (!ex) {
      await continueStep(page);
      continue;
    }
    if (s.kind === "make") {
      const code = ex.tests?.find((t) => t.expect === "pass")?.response.code as string;
      await typeCode(page, code);
      // The rule that counts today is met (the others are the learner's own choices).
      await expect(
        page.locator('[data-rule][data-ok="1"]').filter({ hasText: "the one that counts today" }),
      ).toHaveCount(1, { timeout: 30_000 });
      await shootAll(page, "w4-kbd-make");
      await tabTo(page, byId("save-sketch"), "Save");
      await page.keyboard.press("Enter");
      continue;
    }
    if (ex.kind === "listen") {
      await tabTo(page, byId("play-toggle"), "Play");
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("continue")).toHaveText(/Continue/, { timeout: 30_000 });
      await tabTo(page, byId("play-toggle"), "Stop");
      await page.keyboard.press("Enter");
      await continueStep(page);
      continue;
    }
    if (ex.kind === "predict") {
      const opt = step(page).locator("[data-option]").first();
      const id = (await opt.getAttribute("data-option")) as string;
      await tabTo(page, (a) => a.option !== null, "the options");
      await page.keyboard.press("1");
      await expect(step(page).locator(`[data-option="${id}"]`).first()).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await tabTo(page, byId("check"), "Check");
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("predict-outcome")).toBeVisible();
      await continueStep(page);
      continue;
    }
    if (ex.kind === "run-investigate") {
      const pass = ex.tests?.find((t) => t.expect === "pass")?.response.answer as {
        choice?: string[];
        number?: number;
      };
      for (const [i, q] of (ex.questions ?? []).entries()) {
        if (q.q === "choice") {
          const ids = (q.options ?? []).map((o) => o.id);
          const want = (pass.choice ?? []).find((c) => ids.includes(c)) as string;
          await tabTo(page, (a) => a.option !== null && ids.includes(a.option), `question ${i + 1}`);
          await page.keyboard.press(String(ids.indexOf(want) + 1));
        } else {
          await tabTo(page, (a) => a.editable && a.tag === "input", `question ${i + 1}'s field`);
          await page.keyboard.type(String(pass.number));
        }
      }
      await checkStep(page, /pass/);
      await continueStep(page);
      continue;
    }
    if (ex.answer?.ui === "rn-palette") {
      // The numerals by digit into the palette; the case is the palette's (vi is lower case already).
      await tabTo(page, (a) => a.slot !== null, "the numeral slots");
      for (const rn of ex.correct?.rn ?? []) await page.keyboard.press(romanDigit(rn));
      await shootAll(page, "w4-kbd-rn-palette");
      await checkStep(page, /pass/);
      await continueStep(page);
      continue;
    }
    if (ex.answer?.ui === "text") {
      await tabTo(page, (a) => a.editable && a.tag === "input", "the text field");
      await page.keyboard.type(ex.correct?.text?.[0] ?? "");
      await checkStep(page, /pass/);
      await continueStep(page);
      continue;
    }
    if (ex.kind === "code-modify" || ex.kind === "code-make") {
      const code = ex.tests?.find((t) => t.expect === "pass")?.response.code as string;
      const starter = ex.code?.starter ?? "";
      const open = starter.indexOf("⟪");
      const close = starter.indexOf("⟫");
      if (open >= 0 && close > open) {
        const before = starter.slice(0, open);
        const after = starter.slice(close + 1);
        await typeRegion(
          page,
          starter.slice(open + 1, close),
          code.slice(before.length, code.length - after.length),
        );
      } else await typeCode(page, code);
      await checkStep(page, /pass/);
      await continueStep(page);
      continue;
    }
    throw new Error(`no keyboard path for ${s.id} (${ex.kind}, ${ex.answer?.ui})`);
  }

  await expect(page).toHaveURL(/\/session\/coda$/, { timeout: 60_000 });
  const moment = page.getByTestId("coda-unlock-moment");
  if (
    await moment
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await shootAll(page, "w4-kbd-coda-moment");
    await tabTo(page, byText(/See the rest of today/), "See the rest of today");
    await page.keyboard.press("Enter");
  }
  await shootAll(page, "w4-kbd-coda");
  await tabTo(page, byId("done-for-today"), "Done for today");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done");
  const prog = await api<{ lessons: { lessonId: string; status: string }[] }>(
    request,
    "GET",
    "/api/lessons/progress",
  );
  expect(prog.lessons.find((l) => l.lessonId === "U06.L02")?.status).toBe("completed");
  expect(problems).toEqual([]);
});
