// Wave 5 review (review:journey): a whole U10 day from the keyboard alone, with reduced motion, at 1280×800 in
// Bark: Today → the warm-up (the minor degrees, fam.deg.fet-minor, answered by keys with the way home sung on the
// fake microphone until each of its key paths is taken; the rest reported skipped to keep the test short) →
// U10.L04 "Minor-Key Chords" step by step (a predict, a run-and-answer, code typed into the region, the numerals
// of a minor loop into the RN palette, the minor bass by degree keys, the Make) → the Coda → Done for today. The
// page is only read (to know what a trial asks); every action is a key press, and every control that takes focus
// shows a focus ring.
import { expect, type Page, test } from "@playwright/test";
import { textNow, useUiPrefs } from "../support/ui.ts";
import {
  api,
  openToday,
  playsAndMoves,
  resetClock,
  reviewMic,
  sessionEnd,
  shootAll,
  watch,
} from "./support.ts";
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

type WarmItem = { id: string; familyId: string; kind: string };
type SessionHandle = {
  report(r: unknown): void;
  state(): { plan: { warmup: { items: WarmItem[] } } | null; warmupIndex: number };
};
type LessonStep = {
  id: string;
  kind: string;
  exercise?: {
    kind: string;
    answer?: { ui?: string };
    correct?: { rn?: string[] };
    code?: { starter?: string };
    questions?: { q: string; options?: { id: string }[] }[];
    tests?: { expect: string; response: { code?: string; answer?: unknown } }[];
  };
};

const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7" };
const romanDigit = (rn: string) => ROMAN[rn.toLowerCase().replace(/[^iv]/g, "")] ?? "1";

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

const vis = (page: Page, id: string) =>
  page
    .getByTestId(id)
    .filter({ visible: true })
    .first()
    .isVisible()
    .catch(() => false);

/**
 * The minor-degree set by keys, the sets around it reported skipped. The set is walked by keys until every key path
 * it has has been taken: a trial with a flat degree (♭3, ♭6, ♭7 by their digits), a way home sung (Enter on "Sing it
 * home", the take, then Enter on Next) and the trial after it; the rest of the set is then reported skipped (its
 * further trials repeat the same keys; "Finish set" and the summary by keys are walked in w3-keyboard-u03's warm-up
 * and w3-fet-mic). A set that ends first is left at its summary, as before.
 */
async function minorSetByKeys(page: Page): Promise<void> {
  const warmup = page.getByTestId("warmup");
  await expect(warmup).toBeVisible({ timeout: 60_000 });
  const items = await page.evaluate(
    () => (window as never as { __oakSession: SessionHandle }).__oakSession.state().plan?.warmup.items ?? [],
  );
  const at = items.findIndex((i) => i.familyId === "fam.deg.fet-minor");
  expect(
    at,
    `the minor degrees in today's warm-up: ${items.map((i) => i.familyId).join(", ")}`,
  ).toBeGreaterThan(-1);
  await skipItems(page, items.slice(0, at));
  const deadline = Date.now() + 150_000;
  let lastTrial = "";
  let sung = 0;
  let flatAnswered = false;
  let sungAndOn = false;
  while (Date.now() < deadline) {
    if ((await vis(page, "start-set")) || (await vis(page, "listen-block"))) {
      if (await vis(page, "start-set"))
        await expect(page.getByTestId("start-set")).toBeFocused({ timeout: 10_000 });
      await page.keyboard.press("Enter");
    } else if (await vis(page, "set-summary")) {
      await shootAll(page, "w5-kbd-warmup-summary");
      await skipItems(page, items.slice(at));
      await expect(warmup).toBeHidden({ timeout: 30_000 });
      console.log(`[warm-up] minor degrees by keys; the way home sung ${sung} times`);
      return;
    } else if (await vis(page, "pitch-lane")) {
      // Singing the way home: the take ends by itself (sung, or skipped after its window).
      const fb = page.getByTestId("trial-feedback");
      if (/Sung home|Sung\. The trace|Singing skipped/.test(await textNow(fb))) {
        sung++;
        await expect(page.getByTestId("way-home")).toBeVisible();
        const a = await active(page);
        expect(a.tag, "after the take, focus is on a control").not.toBe("body");
        await page.keyboard.press("Enter");
      }
    } else if (await vis(page, "trial-feedback")) {
      const a = await active(page);
      const next = await textNow(page.getByTestId("next-trial")).catch(() => "");
      const said = await textNow(page.getByTestId("trial-feedback"));
      console.log(`[trial] ${said.slice(0, 80)} · next: ${next}`);
      if (/Sung home|Sung\. The trace|Singing skipped/.test(said)) {
        sung++;
        sungAndOn = true;
      }
      expect(a.tag, "after the answer, focus is on a control (never lost to the page)").not.toBe("body");
      // The runner's own region holds focus (its keys work there, wave3 drills design), else a ringed control.
      if (a.id !== "drill-runner") expect(a.ring, `focus ring on ${a.id || a.text}`).toBe(true);
      await page.keyboard.press("Enter");
    } else {
      const stage = (await textNow(page.getByTestId("stage-text"))).trim();
      const counter = await textNow(page.getByTestId("trial-counter"));
      if (/your turn/i.test(stage) && counter !== lastTrial && flatAnswered && sungAndOn) {
        // Every key path of the set taken: the rest of it (and the sets after it) reported skipped.
        await skipItems(page, items.slice(at));
        await expect(warmup).toBeHidden({ timeout: 30_000 });
        console.log(`[warm-up] minor degrees by keys to ${counter}; the way home sung ${sung} times`);
        return;
      }
      if (/your turn/i.test(stage) && counter !== lastTrial) {
        lastTrial = counter;
        const t = await page.evaluate(
          () =>
            (
              globalThis as {
                __oakDrillTrial?: { expected: { degrees?: string[] }; params: { key: { mode: string } } };
              }
            ).__oakDrillTrial ?? null,
        );
        // The key is set as minor before every trial.
        expect(t?.params.key.mode).toMatch(/minor/);
        const a = await active(page);
        expect(a.tag, "the pad has focus when the trial is ready").toBe("button");
        for (const d of t?.expected.degrees ?? []) await page.keyboard.press(d.replace(/^[b#]/, ""));
        if ((t?.expected.degrees ?? []).some((d) => d.startsWith("b"))) flatAnswered = true;
        await page.waitForTimeout(300);
        if (!(await vis(page, "trial-feedback"))) await page.keyboard.press("Enter");
      }
    }
    await page.waitForTimeout(300);
  }
  throw new Error("the minor-degree set did not finish in time");
}

test("a whole U10 day from the keyboard, with reduced motion", async ({ page, request }) => {
  test.setTimeout(240_000);
  await resetClock(request);
  await seedPoint(request, "after U10.L03");
  await quietHmr(page);
  await useUiPrefs(page, { theme: "bark", motion: "system" });
  const problems = watch(page);
  const ended = sessionEnd(page);
  const plan = await api<{ kind: string; mapItemId: string }>(request, "GET", "/api/session/today");
  expect(plan).toMatchObject({ kind: "lesson", mapItemId: "U10.L04" });
  await openToday(page);
  // Today has decided before Tab is pressed (under load the card shows before its Start button).
  await expect(page.getByTestId("start-session")).toBeVisible({ timeout: 30_000 });
  await tabTo(page, byId("start-session"), "Start session");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/session\/?$/);
  await minorSetByKeys(page);

  const def = (await import("../../content/core/U10/L04/lesson.ts")).default as { steps: LessonStep[] };
  for (const s of def.steps) {
    await expect(step(page)).toHaveAttribute("data-step", s.id, { timeout: 60_000 });
    const ex = s.exercise;
    console.log(`[step] ${s.id} ${s.kind} ${ex?.kind ?? ""} focus=${(await active(page)).text}`);
    if (!ex) {
      await continueStep(page);
      continue;
    }
    if (s.kind === "make") {
      const code = ex.tests?.find((t) => t.expect === "pass")?.response.code as string;
      await typeCode(page, code);
      await expect(
        page.locator('[data-rule][data-ok="1"]').filter({ hasText: "the one that counts today" }),
      ).toHaveCount(1, { timeout: 30_000 });
      await shootAll(page, "w5-kbd-make");
      await tabTo(page, byId("save-sketch"), "Save");
      await page.keyboard.press("Enter");
      continue;
    }
    if (ex.kind === "listen") {
      // Play by key: it plays and moves on; then Stop by key and on (listening never gates; a whole loop heard
      // through to "Continue" is the lesson walkers' check, once per walker file).
      await tabTo(page, byId("play-toggle"), "Play");
      await page.keyboard.press("Enter");
      await playsAndMoves(page);
      await tabTo(page, byId("play-toggle"), "Stop");
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("play-toggle").first()).toHaveAttribute("aria-pressed", "false");
      await continueStep(page);
      continue;
    }
    if (ex.kind === "predict") {
      await tabTo(page, (a) => a.option !== null, "the options");
      await page.keyboard.press("1");
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
      // In A minor the palette's digits give the key's own chords: 1 → i, 6 → VI, 7 → VII (no case to fix).
      await tabTo(page, (a) => a.slot !== null, "the numeral slots");
      for (const rn of ex.correct?.rn ?? []) await page.keyboard.press(romanDigit(rn));
      await shootAll(page, "w5-kbd-rn-minor");
      await checkStep(page, /pass/);
      await continueStep(page);
      continue;
    }
    if (ex.answer?.ui === "degree-pad") {
      // The drawn loop's bass by degree keys (♭3, ♭6 and ♭7 are digits too).
      const trial = (await page.evaluate(() =>
        (globalThis as unknown as { __oakLesson: { trial(): unknown } }).__oakLesson.trial(),
      )) as { degrees?: string[] } | null;
      expect(trial?.degrees?.length, "a drawn bass to answer").toBeGreaterThan(0);
      await tabTo(page, (a) => a.option === "degree", "the degree pad");
      for (const d of trial?.degrees ?? []) await page.keyboard.press(d.replace(/^[b#]/, ""));
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
  // The moment plays only for tools this session unlocked: with none, it is absent at once (no 5-s wait).
  const shows =
    (await ended()).unlocks.length > 0 &&
    (await moment
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false));
  if (!shows) await expect(moment).toHaveCount(0);
  if (shows) {
    await shootAll(page, "w5-kbd-coda-moment");
    await tabTo(page, byText(/See the rest of today/), "See the rest of today");
    await page.keyboard.press("Enter");
  }
  await shootAll(page, "w5-kbd-coda");
  await tabTo(page, byId("done-for-today"), "Done for today");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done");
  const prog = await api<{ lessons: { lessonId: string; status: string }[] }>(
    request,
    "GET",
    "/api/lessons/progress",
  );
  expect(prog.lessons.find((l) => l.lessonId === "U10.L04")?.status).toBe("completed");
  expect(problems).toEqual([]);
});
