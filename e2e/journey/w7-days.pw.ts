// Wave 7 journeys (a), (c: the rhythm day), (d: the sound day) and (h): track days on the real stack (real server,
// real content, the scripted fake tutor, Chrome's fake microphone), each from a dev seed (wave7.md §6), each
// Today → the warm-up (reported skipped: the session-seeds and drill suites walk the Wave 7 sets) → the track lesson
// → the Coda, whose next line is the planner's own (carry f6) → Today done.
//   (a) "core complete, tracks untouched": the day the tracks are open and nothing is chosen. Today offers the three
//       tracks beside an ordinary day; the learner starts Jazz Harmony. J1.L01 Swing Feel & the Ride ends in a Make
//       whose required rule is heard: the ride swings. Tomorrow is J1.L02, the focus is remembered.
//   (c) "R2.L04 next": R2.L04 Polyrhythm 3:2, 4:3 as a day; S2 is the two-hand tap (`tap.lanes`): the pad draws two
//       lanes, F for the kick's two and J for the cowbell's three, and both hands are graded at once.
//   (d) "A1.L05 next": A1.L05 as a sound day; its Make's grit is heard (the required rule ticks).
//   (h) (a) again in Quiet mode: nothing asks for the microphone.
// The lesson steps themselves are the lesson suite's walks (walk-j1, walk-r2, walk-a1b); here each graded step is
// answered from its reference through the player, as a learner who knows the answer would.
import { type APIRequestContext, expect, test } from "@playwright/test";
import { fakeMic } from "../../app/src/onboarding/e2e/helpers.ts";
import a1l05 from "../../content/advanced/A1/L05/lesson.ts";
import j1l01 from "../../content/advanced/J1/L01/lesson.ts";
import r2l04 from "../../content/advanced/R2/L04/lesson.ts";
import { coda, lessonDay } from "./day.ts";
import { walkLesson } from "./lesson-walk.ts";
import { api, expectClean, shootAll } from "./support.ts";
import { sessionState, skipWarmup, today } from "./w4-day.ts";
import { begin, NEVER, nextLineIs } from "./w7-support.ts";

interface Plan {
  kind: string;
  mapItemId: string | null;
  focus?: string;
  trackOffers?: { trackId: "J" | "R" | "A"; next: { mapItemId: string | null } }[];
}

test.use({ launchOptions: { args: fakeMic("voice.wav") }, permissions: ["microphone"] });
test.describe.configure({ mode: "serial" });

async function makeCode(request: APIRequestContext, lessonId: string): Promise<string> {
  const list = await api<{ items: { id: string; originId: string | null }[] }>(
    request,
    "GET",
    "/api/sketches",
  );
  const sk = list.items.find((s) => s.originId === lessonId);
  expect(sk, `${lessonId}'s Make is saved as a sketch`).toBeTruthy();
  const d = await api<{ versions: { code: string }[] }>(request, "GET", `/api/sketches/${sk?.id}`);
  return d.versions.at(-1)?.code ?? "";
}

async function completed(request: APIRequestContext, lessonId: string): Promise<void> {
  const p = await api<{ lessons: { lessonId: string; status: string }[] }>(
    request,
    "GET",
    "/api/lessons/progress",
  );
  expect(p.lessons.find((l) => l.lessonId === lessonId)?.status, `${lessonId} is completed`).toBe(
    "completed",
  );
}

for (const quiet of [false, true]) {
  test(`(a${quiet ? ", h" : ""}) the tracks offered, Jazz Harmony started: J1.L01 ends in a swinging loop${quiet ? ", in Quiet mode" : ""}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const w = await begin(page, request, "core complete, tracks untouched", quiet ? "bark" : "paper", {
      quiet,
    });
    const plan = await api<Plan>(request, "GET", "/api/session/today");
    expect(plan.focus).toBe("core");
    expect(plan.trackOffers?.map((o) => o.trackId)).toEqual(["J", "R", "A"]);
    // Today: an ordinary day, each open track one quiet row beside it; nothing makes a track look required.
    await today(page);
    const offers = page.getByTestId("track-offers");
    await expect(offers).toBeVisible({ timeout: 20_000 });
    await expect(offers.getByTestId("start-offer")).toHaveCount(3);
    await expect(offers.locator('[data-offer="J"]')).toContainText("J1.L01");
    await expect(page.locator("main")).not.toContainText(NEVER);
    if (!quiet) await shootAll(page, "w7-journey-tracks-offered");
    // The learner picks Jazz Harmony: it is today's session, and the focus is remembered.
    await offers.locator('[data-offer="J"]').getByTestId("start-offer").click();
    await page.waitForURL(/\/session\/?$/);
    await expect(page.getByTestId("session-header")).toBeVisible({ timeout: 60_000 });
    expect((await sessionState(page)).plan).toMatchObject({ mapItemId: "J1.L01" });
    await skipWarmup(page);
    await walkLesson(page, j1l01, { makeRuleMet: true });
    await coda(page, {
      unlocks: "auto",
      shots: quiet ? "w7-journey-j1l01-coda-quiet" : "w7-journey-j1l01-coda",
      inspect: () => nextLineIs(page, "J1.L02", "J"),
    });
    // The loop the learner keeps: the ride pattern with the swing on it.
    const code = await makeCode(request, "J1.L01");
    expect(code).toMatch(/rd/);
    expect(code).toMatch(/swing/);
    await completed(request, "J1.L01");
    expect((await api<{ focus: string }>(request, "GET", "/api/tracks/focus")).focus).toBe("J");
    if (quiet) expect(await w.micAsks(), "Quiet mode never asks for the microphone").toBe(0);
    expectClean(w);
  });
}

test("(c) a rhythm day: R2.L04 with both hands tapping three against two", async ({ page, request }) => {
  test.setTimeout(90_000);
  const w = await begin(page, request, "R2.L04 next", "bark");
  let lanes = 0;
  await lessonDay(page, request, r2l04, {
    warmupSets: 0,
    unlocks: "auto",
    shots: "w7-journey-r2l04-coda",
    async before(step) {
      if (step.kind !== "tap") return;
      // The two-hand pad: one lane per hand, each named with its key, before anything is tapped.
      const s = page.getByTestId("lesson-step");
      await expect(s.locator("[data-lane]").first()).toBeVisible({ timeout: 30_000 });
      lanes = await s.locator("[data-lane]").count();
      await expect(s.getByLabel(/^Tap pad: F for .+, J for .+/)).toBeVisible();
      await expect(s).toContainText("Left hand: the two, with the kick");
      await expect(s).toContainText("Right hand: the three, with the cowbell");
    },
    inspectCoda: () => nextLineIs(page, "R2.L05", "R"),
  });
  expect(lanes, "the pad draws a lane per hand").toBeGreaterThanOrEqual(2);
  await completed(request, "R2.L04");
  expectClean(w);
});

test("(d) a sound day: A1.L05, its grit heard in the Make", async ({ page, request }) => {
  test.setTimeout(90_000);
  const w = await begin(page, request, "A1.L05 next");
  const plan = await lessonDay(page, request, a1l05, {
    warmupSets: 0,
    unlocks: "auto",
    makeRuleMet: true,
    shots: "w7-journey-a1l05-coda",
    inspectCoda: () => nextLineIs(page, "A1.L06", "A"),
  });
  expect(plan).toMatchObject({ kind: "lesson", mapItemId: "A1.L05" });
  await completed(request, "A1.L05");
  expectClean(w);
});
