// Wave 3 journey (b) and (f): U03's first two lessons as real daily sessions, then the first functional-ear set
// with its way home sung — and the same three days again in Quiet mode, where nothing opens the microphone and the
// way home is heard in the head instead. Each test starts from a dev seed (POST /api/dev/seed) on the real stack:
// real server, real content, the scripted fake tutor, Chrome's fake microphone.
//   1. "after U02.L08": today is U03.L01 (Major Scale). No degree labels yet (they arrive with U03.L02).
//   2. "after C1.S1": today is U03.L02 (Degrees in Code). Its Coda grants the Degrees lens; in Studio the lens bar
//      now offers Degrees (not Solfège), and switching it on labels the roll with degrees.
//   3. "after U03.L02": today's warm-up holds the first fam.deg.fet-major set (a blocked intro): each answer walks
//      home, and on some trials the learner sings the way home — or, in Quiet mode, hears it.
import type { LessonDef } from "@oak/content-kit";
import { expect, type Page, test } from "@playwright/test";
import { fakeMic } from "../../app/src/onboarding/e2e/helpers.ts";
import u03l01 from "../../content/core/U03/L01/lesson.ts";
import u03l02 from "../../content/core/U03/L02/lesson.ts";
import { useUiPrefs as setUiPrefs } from "../support/ui.ts";
import { lessonDay, startToday } from "./day.ts";
import {
  api,
  countMicAsks,
  expectClean,
  noHmr,
  resetClock,
  seed,
  shootAll,
  type Watch,
  watch,
} from "./support.ts";
import type { WarmupRun } from "./warmup-walk.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav") }, permissions: ["microphone"] });
test.describe.configure({ mode: "serial" });

async function begin(
  page: Page,
  request: import("@playwright/test").APIRequestContext,
  point: string,
  quiet: boolean,
): Promise<{ w: Watch; micAsks: () => Promise<number> }> {
  await resetClock(request);
  await seed(request, point);
  if (quiet) await api(request, "PUT", "/api/voice/quiet", { quiet: true, scope: "always" });
  await noHmr(page);
  await setUiPrefs(page, { theme: quiet ? "bark" : "paper" });
  // Every getUserMedia call from here on, across navigations (support.ts).
  const micAsks = await countMicAsks(page);
  return { w: watch(page), micAsks };
}

/** The Studio sketch the lesson's Make saved, opened in the Workbench. */
async function openMakeSketch(page: Page, title: RegExp): Promise<void> {
  await page.goto("/studio");
  await page.getByTestId("sketch-card").filter({ hasText: title }).first().click();
  await expect(page).toHaveURL(/\/studio\/[^/]+$/);
  await expect(page.locator('[data-testid="workbench"][data-analysis=ready]')).toBeVisible({
    timeout: 60_000,
  });
}

const makeTitle = (def: LessonDef) => `${def.id} make`;

for (const quiet of [false, true]) {
  const mode = quiet ? " (Quiet mode)" : "";

  // U03.L01 holds no sung step, so its Quiet day shows the same screens. What only a Quiet traversal can prove is
  // that nothing on the way asks for the microphone, so the Quiet day walks one warm-up set for real (a warm-up
  // is where a microphone would open); the ordinary day reports its warm-up skipped: the first functional-ear set
  // has its own test below, and a whole warm-up is walked by gate journey 2.

  test(`U03.L01 as a daily session: the major scale, no degree labels yet${mode}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const { w, micAsks } = await begin(page, request, "after U02.L08", quiet);
    const plan = await lessonDay(page, request, u03l01, {
      unlocks: "auto",
      warmupSets: quiet ? 1 : 0,
      makeTitle: makeTitle(u03l01),
      shots: quiet ? "w3-quiet-coda-U03.L01" : "w3-coda-U03.L01",
    });
    expect(plan.mapItemId).toBe("U03.L01");
    const progress = await api<{ lessons: { lessonId: string; status: string }[] }>(
      request,
      "GET",
      "/api/lessons/progress",
    );
    expect(progress.lessons.find((l) => l.lessonId === "U03.L01")?.status).toBe("completed");
    // Degree labels wait for U03.L02: the Workbench offers no Degrees lens yet.
    await openMakeSketch(page, new RegExp(makeTitle(u03l01)));
    await expect(page.getByTestId("lens-degrees")).toHaveCount(0);
    // The whole day and the Studio after it: the warm-up set, the lesson, the Coda, the sketch.
    if (quiet) expect(await micAsks()).toBe(0);
    expectClean(w);
  });

  test(`U03.L02 as a daily session: degree labels switch on${mode}`, async ({ page, request }) => {
    test.setTimeout(240_000);
    const { w, micAsks } = await begin(page, request, "after C1.S1", quiet);
    await lessonDay(page, request, u03l02, {
      unlocks: true,
      // The warm-up is reported skipped: the first functional-ear set has its own test below, and a whole
      // warm-up is walked by gate journey 2.
      warmupSets: 0,
      makeTitle: makeTitle(u03l02),
      shots: quiet ? "w3-quiet-coda-U03.L02" : "w3-coda-U03.L02",
    });
    const unlocks = await api<unknown>(request, "GET", "/api/unlocks");
    expect(JSON.stringify(unlocks)).toContain("tb.feature.degree-labels");
    // In Studio the lens bar now offers Degrees, not yet Solfège; switched on, the roll is labelled 1–7.
    await openMakeSketch(page, new RegExp(makeTitle(u03l02)));
    const degrees = page.getByTestId("lens-degrees");
    await expect(degrees).toBeVisible();
    await expect(page.getByTestId("lens-solfege")).toHaveCount(0);
    if ((await degrees.getAttribute("aria-pressed")) !== "true") await degrees.click();
    await expect(degrees).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-testid="workbench"]')).toContainText(/\b[1-7]\b/);
    await shootAll(page, quiet ? "w3-quiet-studio-degrees" : "w3-studio-degrees");
    if (quiet) expect(await micAsks()).toBe(0);
    expectClean(w);
  });

  test(`the first functional-ear set, its way home ${quiet ? "heard, never sung" : "sung"}${mode}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const { w, micAsks } = await begin(page, request, "after U03.L02", quiet);
    const today = await api<{ warmup: { items: { familyId: string | null; kind: string; mic: boolean }[] } }>(
      request,
      "GET",
      "/api/session/today",
    );
    // The family U03.L02 seeded comes back the next day as its first set (decision 27: within 7 days).
    expect(today.warmup.items).toContainEqual(
      expect.objectContaining({ familyId: "fam.deg.fet-major", kind: "blocked-intro" }),
    );
    // Quiet mode plans no microphone set at all.
    if (quiet) expect(today.warmup.items.filter((i) => i.mic)).toEqual([]);
    // Every trial the runner posts, as the server receives it.
    const posted: { sungResolution?: { quiet: boolean; path: string[] } | null }[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/api\/drills\/sessions\/[^/]+\/trials$/.test(r.url()))
        posted.push(...((r.postDataJSON() as { trials: (typeof posted)[number][] }).trials ?? []));
    });
    // The warm-up up to the end of the degree set (the sung sets after it are the drill suites' to walk).
    const done = (r: WarmupRun) => (quiet ? r.heardHome : r.sungHome) >= 2 && r.sets >= 1;
    const plan = await startToday(page, request, { until: done });
    expect(plan.mapItemId).toBe("U03.L03");
    const run = plan.run;
    expect(run).not.toBeNull();
    await expect(
      page.getByTestId("set-summary").or(page.getByTestId("trial-feedback")).first(),
    ).toBeVisible();
    await shootAll(page, quiet ? "w3-quiet-fet-home" : "w3-fet-home");
    if (quiet) {
      expect(run?.sungHome).toBe(0);
      expect(run?.heardHome).toBeGreaterThanOrEqual(2);
      expect(await micAsks()).toBe(0);
    } else {
      expect(run?.sungHome).toBeGreaterThanOrEqual(2);
      expect(run?.heardHome).toBe(0);
    }
    // The ways home reached the server with their trials: sung on the mic, or heard in Quiet mode.
    await expect
      .poll(() => posted.filter((t) => t.sungResolution).length, { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1);
    for (const t of posted.filter((x) => x.sungResolution)) {
      expect(t.sungResolution?.quiet).toBe(quiet);
      expect(t.sungResolution?.path.at(-1)).toBe("1");
    }
    expectClean(w);
  });
}
