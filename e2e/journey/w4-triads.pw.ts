// Wave 4 journey (a) and (h): U05's first lesson, then U05.L07 with the hand-voiced cadence that is the voicing()
// gate, and the next day U05.L08, where chord() and voicing() arrive — each as a real daily session (Today → the
// warm-up → the lesson → the Coda). These lessons hold no sung step, so Quiet mode changes nothing in them: they
// are walked once (the Quiet days with something to sing are in w3-degrees, w5-days and journey.pw.ts).
// Each test starts from a dev seed (POST /api/dev/seed) on the real stack: real server, real content, the scripted
// fake tutor, Chrome's fake microphone.
//   1. "after U04.L04": today is U05.L01 (Stacking Thirds). Chords are stacks of thirds in n(); chord() stays locked.
//   2. "after U05.L06": today is U05.L07. Its gate step is passed with typed code; the server records the gate,
//      but voicing() is granted with U05.L08. The next day (the dev clock moves one day) is U05.L08: its second
//      chance at the gate is not shown, and its Coda grants chord(), voicing(), rhodes and organ.
import { expect, type Page, test } from "@playwright/test";
import { fakeMic } from "../../app/src/onboarding/e2e/helpers.ts";
import u05l01 from "../../content/core/U05/L01/lesson.ts";
import u05l07 from "../../content/core/U05/L07/lesson.ts";
import u05l08 from "../../content/core/U05/L08/lesson.ts";
import { useUiPrefs as setUiPrefs } from "../support/ui.ts";
import { lessonDay } from "./day.ts";
import { advanceDays, api, expectClean, noHmr, resetClock, seed, type Watch, watch } from "./support.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav") }, permissions: ["microphone"] });
test.describe.configure({ mode: "serial" });

async function begin(
  page: Page,
  request: import("@playwright/test").APIRequestContext,
  point: string,
): Promise<Watch> {
  await resetClock(request);
  await seed(request, point);
  await noHmr(page);
  await setUiPrefs(page, { theme: "paper" });
  return watch(page);
}

interface Unlocks {
  items: { itemId: string }[];
}
const unlocked = async (request: import("@playwright/test").APIRequestContext) =>
  (await api<Unlocks>(request, "GET", "/api/unlocks")).items.map((u) => u.itemId);

interface Gate {
  passed: boolean;
  best: number | null;
  passedCode?: string | null;
}

test("U05.L01 as a daily session: triads stacked in n(), chord() still locked", async ({ page, request }) => {
  test.setTimeout(240_000);
  const w = await begin(page, request, "after U04.L04");
  const plan = await lessonDay(page, request, u05l01, {
    unlocks: "auto",
    warmupSets: 0,
    makeTitle: "U05.L01 make",
    shots: "w4-coda-U05.L01",
  });
  expect(plan.mapItemId).toBe("U05.L01");
  const progress = await api<{ lessons: { lessonId: string; status: string }[] }>(
    request,
    "GET",
    "/api/lessons/progress",
  );
  expect(progress.lessons.find((l) => l.lessonId === "U05.L01")?.status).toBe("completed");
  const have = await unlocked(request);
  expect(have).not.toContain("tb.chord");
  expect(have).not.toContain("tb.voicing");
  expectClean(w);
});

test(`U05.L07 passes the voicing gate by hand; the next day U05.L08 grants chord() and voicing()`, async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  const w = await begin(page, request, "after U05.L06");
  const before = await api<Gate>(request, "GET", "/api/gates/voicing");
  expect(before.passed).toBe(false);
  await lessonDay(page, request, u05l07, {
    unlocks: "auto",
    warmupSets: 0,
    makeTitle: "U05.L07 make",
    shots: "w4-coda-U05.L07",
  });
  // The gate is the hand-voiced cadence, typed and checked in the lesson: the server holds the code that passed.
  const gate = await api<Gate>(request, "GET", "/api/gates/voicing");
  expect(gate.passed).toBe(true);
  expect(gate.best ?? 0).toBeGreaterThanOrEqual(0.9);
  expect(gate.passedCode ?? "").toContain("chords:");
  // The tools themselves arrive with U05.L08 (contracts §3.1 rule 6).
  expect(await unlocked(request)).not.toContain("tb.voicing");

  await advanceDays(request, 1);
  const plan = await lessonDay(page, request, u05l08, {
    unlocks: true,
    warmupSets: 0,
    makeTitle: "U05.L08 make",
    shots: "w4-coda-U05.L08",
  });
  expect(plan.mapItemId).toBe("U05.L08");
  const have = await unlocked(request);
  for (const id of ["tb.chord", "tb.voicing", "snd.rhodes", "snd.organ"]) expect(have).toContain(id);
  expectClean(w);
  await resetClock(request);
});
