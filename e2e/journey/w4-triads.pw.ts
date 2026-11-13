// Wave 4 journey (a) and (h): U05's first lesson, then U05.L07 with the hand-voiced cadence that is the voicing()
// gate, and the next day U05.L08, where chord() and voicing() arrive — each as a real daily session (Today → the
// warm-up → the lesson → the Coda), and the same days again in Quiet mode, where nothing opens the microphone.
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

/** Counts every request for the microphone the page makes (Quiet mode must make none). */
async function countMicRequests(page: Page): Promise<() => Promise<number>> {
  await page.addInitScript(() => {
    const md = navigator.mediaDevices;
    if (!md) return;
    const orig = md.getUserMedia.bind(md);
    (window as unknown as { __oakMicAsks: number }).__oakMicAsks = 0;
    md.getUserMedia = (c) => {
      (window as unknown as { __oakMicAsks: number }).__oakMicAsks++;
      return orig(c);
    };
  });
  return () => page.evaluate(() => (window as unknown as { __oakMicAsks?: number }).__oakMicAsks ?? 0);
}

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
  const micAsks = await countMicRequests(page);
  return { w: watch(page), micAsks };
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

for (const quiet of [false, true]) {
  const mode = quiet ? " (Quiet mode)" : "";

  test(`U05.L01 as a daily session: triads stacked in n(), chord() still locked${mode}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const { w, micAsks } = await begin(page, request, "after U04.L04", quiet);
    const plan = await lessonDay(page, request, u05l01, {
      unlocks: "auto",
      warmupSets: 1,
      makeTitle: `U05.L01 make${quiet ? " quiet" : ""}`,
      shots: quiet ? "w4-quiet-coda-U05.L01" : "w4-coda-U05.L01",
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
    if (quiet) expect(await micAsks()).toBe(0);
    expectClean(w);
  });

  test(`U05.L07 passes the voicing gate by hand; the next day U05.L08 grants chord() and voicing()${mode}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(300_000);
    const { w, micAsks } = await begin(page, request, "after U05.L06", quiet);
    const before = await api<Gate>(request, "GET", "/api/gates/voicing");
    expect(before.passed).toBe(false);
    await lessonDay(page, request, u05l07, {
      unlocks: "auto",
      warmupSets: 0,
      makeTitle: `U05.L07 make${quiet ? " quiet" : ""}`,
      shots: quiet ? "w4-quiet-coda-U05.L07" : "w4-coda-U05.L07",
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
      makeTitle: `U05.L08 make${quiet ? " quiet" : ""}`,
      shots: quiet ? "w4-quiet-coda-U05.L08" : "w4-coda-U05.L08",
    });
    expect(plan.mapItemId).toBe("U05.L08");
    const have = await unlocked(request);
    for (const id of ["tb.chord", "tb.voicing", "snd.rhodes", "snd.organ"]) expect(have).toContain(id);
    if (quiet) expect(await micAsks()).toBe(0);
    expectClean(w);
    await resetClock(request);
  });
}
