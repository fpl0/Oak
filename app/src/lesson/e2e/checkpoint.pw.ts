// The checkpoint player: its states against the real server (locked, open), and a whole attempt with the
// server's composition and outcome supplied by the spec (the U01.CP items are authored in parallel): items
// answered from their drawn trials, a practice-level tap item skipped, the hand-in body, the "Not yet" result
// with its practice plan and per-skill bars, "Continue anyway" on a retake, and the tutor opening only after.
import type { Page, Route } from "@playwright/test";
import { completeLessons, expect, resetLessons, test } from "./support.ts";

test.describe.configure({ mode: "serial" });
// The mocked progress route fetches the real response: one still in flight when its test ends (the page polls
// progress) must not fail the test after it ("route.fetch: Test ended", "Response has been disposed").
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

const U01 = ["U00.L01", "U00.L02", ...Array.from({ length: 9 }, (_, i) => `U01.L0${i + 1}`)];

test("the checkpoint is locked until its lessons are done, then opens", async ({ page }) => {
  resetLessons(U01);
  await page.goto("/checkpoint/U01");
  await expect(page.getByTestId("checkpoint-intro")).toBeVisible();
  await expect(page.getByText("Not open yet")).toBeVisible();
  await expect(page.getByTestId("start-checkpoint")).toHaveCount(0);
  completeLessons(U01);
  await page.reload();
  await expect(page.getByTestId("checkpoint-intro")).toBeVisible();
  await expect(page.getByText("Not open yet")).toHaveCount(0);
  // Either its items are written (Start) or the page says they are not, never a dead button.
  await expect(page.getByTestId("start-checkpoint").or(page.getByText("Not written yet"))).toBeVisible();
});

const ITEMS = [
  { idx: 0, skillId: "R05", role: "gating", fam: "fam.rhy.count", seed: 101 },
  { idx: 1, skillId: "R08", role: "gating", fam: "fam.rhy.meter", seed: 202 },
  { idx: 2, skillId: "R01", role: "level-setting", fam: "fam.rhy.pulse", seed: 303 },
  { idx: 3, skillId: "R05", role: "gating", fam: "fam.rhy.count", seed: 404 },
] as const;

async function mockAttempt(page: Page, attemptNo: number, outcome: Record<string, unknown>) {
  const sent: unknown[] = [];
  await page.route("**/api/lessons/progress", async (route: Route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { checkpoints: { cpId: string }[] };
    body.checkpoints = body.checkpoints.map((c) =>
      c.cpId === "U01.CP"
        ? {
            ...c,
            status: attemptNo > 1 ? "failed" : "open",
            attempts: attemptNo - 1,
            lastScore: attemptNo > 1 ? 0.5 : null,
            softPassAvailable: attemptNo > 1,
            pendingAttemptAt: new Date().toISOString(),
          }
        : c,
    );
    await route.fulfill({ response: res, json: body });
  });
  await page.route("**/api/checkpoints/U01.CP/start", (route) =>
    route.fulfill({
      json: {
        cpId: "U01.CP",
        attemptNo,
        startedAt: new Date().toISOString(),
        items: ITEMS.map((i) => ({
          idx: i.idx,
          skillId: i.skillId,
          role: i.role,
          source: { kind: "family", familyId: i.fam, level: 1, category: null, seed: i.seed },
          debt: false,
        })),
      },
    }),
  );
  await page.route("**/api/checkpoints/U01.CP/attempts", (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: { cpId: "U01.CP", attemptNo, ...outcome } });
  });
  return sent;
}

async function answerItems(page: Page, wrongFirst: boolean) {
  for (let n = 0; n < ITEMS.length; n++) {
    await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", `I${n + 1}`);
    const kind = await page.evaluate(
      () =>
        (
          globalThis as unknown as { __oakCheckpoint: { exercise(): { kind: string } } }
        ).__oakCheckpoint.exercise().kind,
    );
    if (kind === "tap") {
      await page.getByTestId("skip-item").click();
      continue;
    }
    const expected = await page.evaluate(() =>
      (
        globalThis as unknown as { __oakCheckpoint: { expected(): { choice?: string[] } } }
      ).__oakCheckpoint.expected(),
    );
    const right = expected?.choice?.[0] ?? "";
    const options = await page
      .locator("[data-option]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-option")));
    const pick = wrongFirst && n === 0 ? (options.find((o) => o !== right) ?? right) : right;
    await page.locator(`[data-option="${pick}"]`).click();
    await page.getByTestId("check").click();
    // No verdict per item: only that the answer is saved.
    await expect(page.getByTestId("step-feedback")).toHaveAttribute("data-status", "saved");
    await expect(page.getByTestId("hint")).toHaveCount(0);
    await page.getByTestId("next-item").click();
  }
}

test("a whole attempt: answers, a skipped practice item, hand in, Not yet with a practice plan", async ({
  page,
}) => {
  const sent = await mockAttempt(page, 1, {
    score: 2 / 3,
    passed: false,
    softPass: false,
    softPassOffered: false,
    perSkill: [
      { skillId: "R05", role: "gating", mean: 0.5, items: 2, ok: false },
      { skillId: "R08", role: "gating", mean: 1, items: 1, ok: true },
    ],
    repairQueue: [{ skillId: "R05", familyId: "fam.rhy.count", sets: 2 }],
    debts: [],
    opened: [],
    unlocks: [],
  });
  await page.goto("/checkpoint/U01");
  await page.getByTestId("start-checkpoint").click();
  await answerItems(page, true);
  await expect(page.getByTestId("checkpoint-review")).toBeVisible();
  await expect(page.getByTestId("continue-anyway")).toHaveCount(0);
  await page.getByTestId("hand-in").click();

  await expect(page.getByTestId("checkpoint-result")).toHaveAttribute("data-passed", "0");
  await expect(page.getByRole("heading", { name: "Not yet" })).toBeVisible();
  await expect(page.getByText("Your practice plan")).toBeVisible();
  await expect(page.getByText(/worth another look/)).toBeVisible();
  const body = sent[0] as {
    attemptNo: number;
    items: { idx: number; score: number; skipped: boolean }[];
    acceptSoftPass: boolean;
  };
  expect(body.attemptNo).toBe(1);
  expect(body.acceptSoftPass).toBe(false);
  expect(body.items.map((i) => [i.idx, i.skipped])).toEqual([
    [0, false],
    [1, false],
    [2, true],
    [3, false],
  ]);
  expect(body.items[0]?.score).toBeLessThan(1);
  expect(body.items[1]?.score).toBe(1);
  expect(body.items[3]?.score).toBe(1);
  await expect(page.locator("body")).not.toContainText("!");

  // The tutor is open for the debrief now.
  await page.getByTestId("debrief").click();
  await expect(page.getByRole("complementary", { name: /tutor/i })).toBeVisible();
});

test("a third attempt under the pass line offers Continue anyway and sends it", async ({ page }) => {
  // Gating 2 of 3 (0.67): below the retake line of 0.75, so only the third attempt offers it.
  const sent = await mockAttempt(page, 3, {
    score: 0.8,
    passed: false,
    softPass: true,
    softPassOffered: true,
    perSkill: [
      { skillId: "R05", role: "gating", mean: 0.5, items: 2, ok: false },
      { skillId: "R08", role: "gating", mean: 1, items: 1, ok: true },
    ],
    repairQueue: [],
    debts: ["R05"],
    opened: ["U02.L03"],
    unlocks: [],
  });
  await page.goto("/checkpoint/U01");
  await page.getByTestId("start-checkpoint").click();
  await answerItems(page, true);
  await expect(page.getByTestId("continue-anyway")).toBeVisible();
  await page.getByTestId("continue-anyway").click();
  await expect(page.getByRole("heading", { name: "On you go" })).toBeVisible();
  expect((sent[0] as { acceptSoftPass: boolean }).acceptSoftPass).toBe(true);
});

test("the real U01.CP against the server: every item answered from its reference, handed in, passed", async ({
  page,
}) => {
  test.skip(
    !(await import("node:fs")).existsSync(
      new URL("../../../../content/core/U01/CP/checkpoint.ts", import.meta.url),
    ),
    "U01.CP is not authored yet",
  );
  const def = (await import("../../../../content/core/U01/CP/checkpoint.ts")) as Record<string, unknown>;
  const cp = Object.values(def).find((v) => !!v && typeof v === "object" && "authored" in (v as object)) as {
    authored: { id: string; tests: { expect: string; response: unknown }[] }[];
    make: { tests: { expect: string; response: unknown }[] };
  };
  resetLessons(U01);
  completeLessons(U01);
  await page.goto("/checkpoint/U01");
  await page.getByTestId("start-checkpoint").click();
  await expect(page.getByTestId("lesson-step")).toBeVisible();
  const dev = <T>(fn: string, arg?: unknown) =>
    page.evaluate(
      ([f, a]) => {
        const d = (globalThis as unknown as { __oakCheckpoint: Record<string, (x?: unknown) => unknown> })
          .__oakCheckpoint;
        return d[f as string]?.(a) as T;
      },
      [fn, arg] as const,
    );
  for (let guard = 0; guard < 30; guard++) {
    if (await page.getByTestId("checkpoint-review").isVisible()) break;
    const kind = await dev<string | null>("kind");
    const ex = await dev<{ id: string; kind: string }>("exercise");
    const before = await page.getByTestId("lesson-step").getAttribute("data-step");
    if (kind === "make") {
      const pass = cp.make.tests.find((t) => t.expect === "pass");
      await dev("answer", pass?.response);
    } else if (kind === "authored") {
      const pass = cp.authored.find((a) => a.id === ex.id)?.tests.find((t) => t.expect === "pass");
      await dev("answer", pass?.response);
    } else if (ex.kind === "tap") {
      // The taps of the trial's own targets (seconds from bar 1; an echo's window starts after the stimulus).
      const prm = await dev<{ tapTargets: number[]; responseAt?: number }>("params");
      await dev("answer", { taps: prm.tapTargets.map((t) => t + (prm.responseAt ?? 0)) });
    } else {
      await dev("answer", { answer: await dev<unknown>("expected") });
    }
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document.querySelector("[data-testid=checkpoint-review]")
              ? "review"
              : (document.querySelector("[data-testid=lesson-step]")?.getAttribute("data-step") ?? ""),
          ),
        { timeout: 30_000 },
      )
      .not.toBe(before ?? "");
  }
  await expect(page.getByTestId("checkpoint-review")).toBeVisible();
  await page.getByTestId("hand-in").click();
  await expect(page.getByTestId("checkpoint-result")).toHaveAttribute("data-passed", "1", {
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { name: "Checkpoint passed" })).toBeVisible();
  const progress = (await (
    await page.request.get("/api/lessons/progress", { headers: { "X-Oak": "1" } })
  ).json()) as { checkpoints: { cpId: string; status: string }[] };
  expect(progress.checkpoints.find((c) => c.cpId === "U01.CP")?.status).toBe("passed");
});
