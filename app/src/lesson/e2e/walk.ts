// The step walker of the U03–U04 lesson specs (walk-u03*.pw.ts, walk-u04.pw.ts): a lesson opened from a dev seed
// is played step by step in the real app against the real server, with each step's own authored material. Every
// graded step is answered once with a plausible wrong answer first (the lesson's own failing test, or a wrong
// pick of the drawn trial), and its feedback is read: never empty, no raw IDs (`tb.`, `fam.`, `{param}`), and not
// the answer itself below rung 4. Then the reference (the passing test, or the drawn trial's answer) passes.
// Answers go through the widgets themselves (options, the degree pad, the text field, the key-signature staff
// by keyboard, the Workbench editor through the same CODE event as typing); a sung take is sung through the
// fake microphone when the browser has one, then the targets are submitted through the player's own grading
// path. Ungraded steps are played (a listen loop, a passive stream, a run) and continued. The Make is solved from
// its passing test and saved; the lesson must end complete on the server.
import type { Page } from "@playwright/test";
import { expect, setCode, stepIs, submit } from "./support.ts";
import { api } from "./w3support.ts";

/** The lesson file's shape as far as the walker reads it (content-kit types stay out of the e2e project). */
interface TestCaseLike {
  name: string;
  expect: "pass" | "fail" | "error";
  response: Record<string, unknown>;
  feedback?: string[];
}
interface PartLike {
  kind: string;
  id: string;
  answer?: { ui?: string; mode?: string; normalize?: string; options?: { id: string }[] };
  stimulus?: { src: string; family?: string };
  correct?: { text?: string[]; choice?: string[]; number?: number; degrees?: string[] };
  reference?: { solutions: string[] };
  code?: { starter?: string };
  questions?: { q: string; options?: { id: string }[]; correct?: unknown }[];
  passive?: unknown;
  rubric?: { id: string; required?: boolean }[];
  byEar?: unknown;
  mode?: string;
  target?: { from: string; degrees?: string[] };
  tests: TestCaseLike[];
}
interface StepLike {
  id: string;
  kind: string;
  graded?: boolean;
  optional?: boolean;
  exercise?: PartLike & { parts?: PartLike[] };
}
export interface LessonLike {
  id: string;
  title: string;
  steps: StepLike[];
}

/** The authored lesson (`content/core/U03/L05/lesson.ts` for `U03.L05`). */
export async function lessonDef(id: string): Promise<LessonLike> {
  const [unit, lesson] = id.split(".") as [string, string];
  const mod = (await import(`../../../../content/core/${unit}/${lesson}/lesson.ts`)) as {
    default: LessonLike;
  };
  return mod.default;
}

type Dev = {
  trial(): Record<string, unknown> | null;
  singTargets(): Record<string, number[]>;
};
const drawnAnswer = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as { __oakLesson: Dev }).__oakLesson.trial());
const singTargetsOf = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as { __oakLesson: Dev }).__oakLesson.singTargets());

const RAW = /\btb\.|\bfam\.|\bcd\.|\bterm\.|[{}]|undefined|NaN|\[object/;

/** Words that, in a below-rung-4 feedback, would hand over the answer. */
function answerLeaks(part: PartLike, trial: Record<string, unknown> | null): string[] {
  const out: string[] = [];
  const text = (trial?.text as string[] | undefined) ?? part.correct?.text;
  if (text && text.length > 1) out.push(text.join(" "), text.join(", "));
  if (part.kind === "staff-write" && part.answer?.mode === "key-signature") {
    const pass = part.tests.find((t) => t.expect === "pass");
    const sig = (pass?.response.answer as { text?: string[] } | undefined)?.text ?? [];
    if (sig.length > 1) {
      out.push(sig.join(" "), sig.join(", "));
      const pretty = sig.map((a) => a.replace("#", "♯").replace(/b$/, "♭"));
      out.push(pretty.join(" "), pretty.join(", "));
    }
  }
  // A code step: a quoted pattern of the reference that the starter does not have.
  const ref = part.reference?.solutions[0] ?? passingCode(part);
  if (ref) {
    const starter = (part.code?.starter ?? "").replace(/[⟪⟫]/g, "");
    for (const m of ref.matchAll(/"([^"]{6,})"/g)) {
      const q = m[1] as string;
      if (!starter.includes(q)) out.push(q);
    }
  }
  return out;
}

function passingCode(part: PartLike): string | null {
  const t = part.tests.find((x) => x.expect === "pass" && typeof x.response.code === "string");
  return (t?.response.code as string | undefined) ?? null;
}

/** The step's verdict box after a wrong answer: there, specific, clean, not the answer. */
export async function expectHonestFeedback(page: Page, leaks: readonly string[], label: string) {
  const fb = page.getByTestId("step-feedback");
  await expect(fb, `${label}: feedback`).toHaveAttribute("data-status", /fail|error/, { timeout: 30_000 });
  const text = ((await fb.textContent()) ?? "").trim();
  expect(text.length, `${label}: feedback text`).toBeGreaterThan(8);
  expect(text, `${label}: no raw IDs or template slots`).not.toMatch(RAW);
  for (const l of leaks) expect(text, `${label}: does not print the answer`).not.toContain(l);
  console.log(`[feedback] ${label}: ${text.replace(/\s+/g, " ")}`);
  return text;
}

async function expectPass(page: Page, label: string) {
  await expect(page.getByTestId("step-feedback"), `${label}: passes`).toHaveAttribute("data-status", "pass", {
    timeout: 30_000,
  });
}

async function next(page: Page) {
  const c = page.getByTestId("continue");
  await expect(c).toBeEnabled({ timeout: 30_000 });
  await c.click();
}

/** Plays the Workbench of the step until it says the loop has been heard (Continue, no longer Skip). */
async function playUntilDone(page: Page, label: string) {
  const toggle = page.getByTestId("play-toggle").first();
  await toggle.click();
  await expect(page.getByTestId("continue"), `${label}: one loop heard`).toHaveText(/Continue/, {
    timeout: 30_000,
  });
  await toggle.click();
}

const check = (page: Page) => page.getByTestId("check").click();

/** Answers one investigate/run response through the question widgets. */
async function answerQuestions(page: Page, part: PartLike, response: Record<string, unknown>) {
  const qs = part.questions ?? [];
  const parts = Array.isArray(response.parts) ? (response.parts as Record<string, unknown>[]) : null;
  for (const [i, q] of qs.entries()) {
    const r = (parts ? parts[i]?.answer : response.answer) as
      | { choice?: string[]; number?: number; text?: string[] }
      | undefined;
    const box = page.locator(`[data-question="${i + 1}"]`);
    if (q.q === "choice") {
      const ids = new Set((q.options ?? []).map((o) => o.id));
      const pick = (r?.choice ?? []).find((c) => ids.has(c));
      if (pick) await box.locator(`[data-option="${pick}"]`).click();
    } else if (q.q === "number") {
      if (r?.number !== undefined) await box.locator("input").fill(String(r.number));
    } else if (r?.text?.[0] !== undefined) await box.locator("input").fill(r.text.join(" "));
  }
}

/** Types a key signature on the staff by keyboard: `#` or `-` picks sharps or flats, letters place them. */
async function typeKeySignature(page: Page, accidentals: readonly string[]) {
  const surface = page.getByTestId("keysig-surface");
  await surface.focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press("Backspace");
  if (accidentals.length === 0) return;
  await page.keyboard.press(accidentals[0]?.endsWith("b") ? "-" : "#");
  for (const a of accidentals) await page.keyboard.press(`${(a[0] ?? "").toUpperCase()}`);
}

/** Clicks the option with this ID (IDs can be code, with quotes no CSS selector takes). */
export async function clickOption(page: Page, id: string) {
  const options = page.getByTestId("lesson-step").locator("[data-option]");
  const ids = await options.evaluateAll((els) => els.map((e) => e.getAttribute("data-option")));
  const at = ids.indexOf(id);
  expect(at, `the option "${id}" is shown`).toBeGreaterThanOrEqual(0);
  await options.nth(at).click();
}

async function typeText(page: Page, text: string) {
  const field = page.getByTestId("lesson-step").locator('input[type="text"]').first();
  await field.fill(text);
}

async function pickDegrees(page: Page, degrees: readonly string[]) {
  const step = page.getByTestId("lesson-step");
  // Clear what an earlier attempt left on the pad.
  const pad = step.locator("[data-degree]").first();
  await pad.focus();
  for (let i = 0; i < degrees.length + 2; i++) await page.keyboard.press("Backspace");
  for (const d of degrees) await step.locator(`[data-degree="${d}"]`).first().click();
}

/** The fake microphone sings one take (whatever it hears), Check reads it out; then the targets pass. */
async function singStep(page: Page, step: StepLike, o: WalkOptions) {
  const label = `${step.id} sing`;
  const ex = step.exercise as PartLike & { parts?: PartLike[] };
  const parts = ex.kind === "all" ? (ex.parts ?? []) : [ex];
  await expect(page.getByTestId("continue"), `${label}: singing never gates`).toBeEnabled();
  if (o.quiet) {
    // Quiet mode (server state): no mic anywhere, the fallback instead, nothing posted.
    await expect(page.getByRole("button", { name: "Sing", exact: true })).toHaveCount(0);
    if (ex.kind === "sing") {
      await expect(page.getByTestId("quiet-chip")).toBeVisible();
      const identify = page.getByTestId("sing-quiet-identify");
      if ((await identify.count()) > 0) {
        for (const d of ex.target?.degrees ?? []) await identify.locator(`[data-degree="${d}"]`).click();
        await page.getByTestId("quiet-check").click();
        await expect(page.getByTestId("quiet-verdict")).toContainText("That's the pattern");
      } else {
        await page.getByTestId("heard-it").click();
        await expect(page.getByTestId("heard-it-done")).toBeVisible();
      }
    }
    const r = await api<{ attempts: number }>(page, "GET", `/lessons/${o.lessonId}/steps/${step.id}`);
    expect(r.body?.attempts ?? 0, `${label}: nothing recorded in Quiet mode`).toBe(0);
    return;
  }
  if (o.mic) {
    const sing = page.getByRole("button", { name: "Sing", exact: true }).first();
    await sing.click();
    await expect(page.getByTestId("sing-phase").first()).toHaveText(/Done/, { timeout: 60_000 });
    if (ex.kind === "sing") {
      await check(page);
      const fb = page.getByTestId("step-feedback");
      await expect(fb).toHaveAttribute("data-status", /fail|pass|error/, { timeout: 30_000 });
      const text = ((await fb.textContent()) ?? "").trim();
      expect(text.length, `${label}: the take is read back`).toBeGreaterThan(8);
      expect(text, `${label}: no raw IDs`).not.toMatch(RAW);
      console.log(`[take] ${label}: ${text.replace(/\s+/g, " ")}`);
      // A take that missed says where: the first note that went wrong, or why nothing could be heard.
      if ((await fb.getAttribute("data-status")) === "fail")
        expect(text, `${label}: names the note`).toMatch(/Note \d|note \d|Hold each note|noise|voice/);
    }
  }
  // The targets themselves, through the player's own path: in tune passes, a wrong first note does not.
  const targets = await singTargetsOf(page);
  const sung = (ms: readonly number[]) => ms.map((midi) => ({ midi, cents: 4, credit: 1 }));
  const each = parts.map((p) => targets[p.id] ?? []);
  for (const [i, t] of each.entries())
    expect(t.length, `${label}: part ${i + 1} has targets`).toBeGreaterThan(0);
  // Home right, then every later note a minor third off: a pattern sung wrong, not one slip in five.
  const wrongTake = (t: readonly number[]) => sung(t.map((m, i) => (i === 0 && t.length > 1 ? m : m + 3)));
  const wrong =
    ex.kind === "all"
      ? { parts: each.map((t) => ({ sung: wrongTake(t) })) }
      : { sung: wrongTake(each[0] ?? []) };
  const w = await submit(page, wrong);
  expect(w?.status, `${label}: a pattern sung wrong does not pass`).not.toBe("pass");
  if (ex.kind === "sing") {
    const said = await expectHonestFeedback(page, [], `${label} wrong`);
    // The grader's pattern finding, not a generic line: the first note that is not the pattern's.
    expect(said, `${label}: names the first wrong note`).toMatch(/Note 2/);
  }
  const right =
    ex.kind === "all" ? { parts: each.map((t) => ({ sung: sung(t) })) } : { sung: sung(each[0] ?? []) };
  const r = await submit(page, right);
  expect(r?.status, `${label}: on the targets passes`).toBe("pass");
}

export interface WalkOptions {
  lessonId: string;
  /** The browser has the fake microphone: sung steps take a real take first. */
  mic: boolean;
  /** Quiet mode is on for today: sung steps are their fallbacks. */
  quiet: boolean;
}

/** Answers a single answer-kind part through its widget. */
async function answerWidget(page: Page, part: PartLike, response: Record<string, unknown>) {
  const a = (response.answer ?? {}) as {
    choice?: string[];
    text?: string[];
    number?: number;
    degrees?: string[];
  };
  const ui = part.answer?.ui;
  if (ui === "choice") {
    await clickOption(page, a.choice?.[0] as string);
  } else if (ui === "number") {
    await page.getByTestId("lesson-step").locator("input").first().fill(String(a.number));
  } else if (ui === "staff-input" && part.answer?.mode === "key-signature") {
    await typeKeySignature(page, a.text ?? []);
  } else if (ui === "degree-pad") {
    await pickDegrees(page, a.degrees ?? []);
  } else if (ui === "text") {
    await typeText(page, (a.text ?? []).join(" "));
  } else throw new Error(`walker: no way to answer ${ui}`);
}

/** A wrong answer to a drawn trial: another option, another first degree, another letter. */
async function wrongFor(page: Page, part: PartLike, expected: Record<string, unknown>) {
  const ui = part.answer?.ui;
  if (ui === "choice") {
    const right = (expected.choice as string[])[0];
    const ids = await page
      .getByTestId("lesson-step")
      .locator("[data-option]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-option") ?? ""));
    expect(ids, `${part.id}: the drawn answer is one of the options shown`).toContain(right);
    return { answer: { choice: [ids.find((i) => i !== right) as string] } };
  }
  if (ui === "degree-pad") {
    const right = expected.degrees as string[];
    const shown = await page
      .getByTestId("lesson-step")
      .locator("[data-degree]")
      .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-degree") ?? ""))]);
    const other = shown.find((d) => d !== right[0]) as string;
    return { answer: { degrees: [other, ...right.slice(1)] } };
  }
  if (ui === "text") {
    const right = expected.text as string[];
    const first = right[0] ?? "C";
    const other = /^C/.test(first) ? "D" : "C";
    return { answer: { text: [other, ...right.slice(1)] } };
  }
  throw new Error(`walker: no wrong answer for ${ui}`);
}

/** Walks the whole lesson from the step on screen to completion. */
export async function walkLesson(page: Page, def: LessonLike, o: WalkOptions): Promise<string[]> {
  const seen: string[] = [];
  for (const step of def.steps) {
    if (step.optional) continue;
    await stepIs(page, step.id);
    seen.push(step.id);
    const label = `${def.id} ${step.id}`;
    const ex = step.exercise;
    if (!ex) {
      await next(page);
      continue;
    }
    if (step.kind === "make") {
      const rule = (ex.rubric ?? []).find((r) => r.required);
      // The starter leaves the rule that counts open; the passing sketch ticks it.
      if (rule)
        await expect(page.locator(`[data-rule="${rule.id}"]`)).toHaveAttribute("data-ok", "0", {
          timeout: 30_000,
        });
      const code = passingCode(ex);
      expect(code, `${label}: the Make has a passing test`).not.toBeNull();
      await setCode(page, code as string);
      if (rule)
        await expect(
          page.locator(`[data-rule="${rule.id}"]`),
          `${label}: the rule that counts`,
        ).toHaveAttribute("data-ok", "1", { timeout: 30_000 });
      await page.getByTestId("save-sketch").click();
      continue;
    }
    if (ex.kind === "sing" || (ex.kind === "all" && (ex.parts ?? []).every((p) => p.kind === "sing"))) {
      await singStep(page, step, o);
      await next(page);
      continue;
    }
    if (ex.kind === "listen") {
      if (ex.passive) {
        await page.getByTestId("passive-play").click();
        await expect(
          page.getByTestId("passive-names"),
          `${label}: the stream names what it plays`,
        ).not.toBeEmpty({
          timeout: 30_000,
        });
        await expect(page.getByTestId("passive-names")).not.toHaveText(RAW);
      } else await playUntilDone(page, label);
      await next(page);
      continue;
    }
    if (ex.kind === "predict") {
      const step$ = page.getByTestId("lesson-step");
      const opt = step$.locator("[data-option]").first();
      if ((await opt.count()) > 0) await opt.click();
      else await step$.locator("input").first().fill("4");
      await check(page);
      await expect(page.getByTestId("predict-outcome")).toBeVisible();
      await next(page);
      continue;
    }
    if (ex.kind === "run-investigate" && (ex.questions ?? []).length === 0) {
      await playUntilDone(page, label);
      await next(page);
      continue;
    }
    if (ex.kind === "run-investigate") {
      const wrong = ex.tests.find((t) => t.expect === "fail");
      const pass = ex.tests.find((t) => t.expect === "pass");
      if (wrong) {
        await answerQuestions(page, ex, wrong.response);
        await check(page);
        await expectHonestFeedback(page, [], `${label} wrong`);
      }
      if (pass) await answerQuestions(page, ex, pass.response);
      await check(page);
      await expectPass(page, label);
      await next(page);
      continue;
    }
    const codeKind =
      ["code-modify", "code-make", "error-hunt", "compose-brief"].includes(ex.kind) ||
      (ex.kind === "dictation" && ex.answer?.ui === "code");
    if (codeKind) {
      const leaks = answerLeaks(ex, null);
      // A real mistake (the lesson's own pinned one), not the untouched starter, when there is one.
      const fails = ex.tests.filter((t) => t.expect === "fail" && typeof t.response.code === "string");
      const wrong =
        fails.find((t) => !(t.feedback ?? []).includes("code.unchanged") && !/unchanged/i.test(t.name)) ??
        fails[0];
      if (wrong) {
        await setCode(page, wrong.response.code as string);
        await check(page);
        await expectHonestFeedback(page, leaks, `${label} wrong (${wrong.name})`);
        // The Workbench's own list says what and where: read it with the same rules.
        const panel = page.getByTestId("feedback-panel").first();
        if ((await panel.count()) > 0) {
          const said = ((await panel.textContent()) ?? "").trim();
          expect(said, `${label}: the Workbench feedback`).not.toMatch(RAW);
          for (const l of leaks)
            expect(said, `${label}: the Workbench does not print the answer`).not.toContain(l);
          console.log(`[panel] ${label}: ${said.replace(/\s+/g, " ").slice(0, 240)}`);
        }
      }
      await setCode(page, passingCode(ex) as string);
      await check(page);
      await expectPass(page, label);
      await next(page);
      continue;
    }
    // Answer kinds: a drawn trial, or the step's own tests.
    const generator = ex.stimulus?.src === "generator";
    if (ex.stimulus?.src === "code") {
      const play = page.getByTestId("play-stimulus");
      if ((await play.count()) > 0) {
        await play.click();
        await expect(play, `${label}: the stimulus plays`).toHaveText(/Stop|Play again/);
      }
    }
    if (generator) {
      const expected = (await drawnAnswer(page)) as Record<string, unknown>;
      expect(expected, `${label}: a drawn trial`).not.toBeNull();
      const wrong = await wrongFor(page, ex, expected);
      await answerWidget(page, ex, wrong);
      await check(page);
      await expectHonestFeedback(page, answerLeaks(ex, expected), `${label} wrong`);
      await answerWidget(page, ex, { answer: expected });
      await check(page);
      await expectPass(page, label);
      await next(page);
      continue;
    }
    const wrong = ex.tests.find((t) => t.expect === "fail");
    const pass = ex.tests.find((t) => t.expect === "pass");
    expect(pass, `${label}: a passing test`).toBeDefined();
    if (wrong) {
      await answerWidget(page, ex, wrong.response);
      await check(page);
      await expectHonestFeedback(page, answerLeaks(ex, null), `${label} wrong (${wrong.name})`);
    }
    await answerWidget(page, ex, (pass as TestCaseLike).response);
    await check(page);
    await expectPass(page, label);
    await next(page);
  }
  await expect(page.getByTestId("lesson-complete"), `${def.id}: complete`).toBeVisible({ timeout: 30_000 });
  const prog = await api<{ lessons: { lessonId: string; status: string }[] }>(
    page,
    "GET",
    "/lessons/progress",
  );
  expect(
    prog.body?.lessons.find((l) => l.lessonId === def.id)?.status,
    `${def.id} completed on the server`,
  ).toBe("completed");
  return seen;
}

/** The session before each U03–U04 lesson in the default order (the dev seed `after <it>`). */
export const BEFORE: Record<string, string> = {
  "U03.L01": "U02.L08",
  "U03.L02": "C1.S1",
  "U03.L03": "U03.L02",
  "U03.L04": "U03.L03",
  "U03.L05": "U03.L04",
  "U03.L06": "U03.L05",
  "U03.L07": "U03.L06",
  "U03.L08": "U03.L07",
  "U03.L09": "U03.L08",
  "U03.L10": "U03.L09",
  "U03.L11": "U03.L10",
  "U04.L01": "U03.L11",
  "U04.L02": "U03.CP",
  "U04.L03": "U04.L02",
  "U04.L04": "U04.L03",
};
