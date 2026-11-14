// Wave 6 journeys (a), (b), (c), (d: the U14 day), (e), (g: the U17 day) and (j: (a) and (e) in Quiet mode): real
// daily sessions on the real stack (real server, real content, the scripted fake tutor, Chrome's fake microphone),
// each from a dev seed (wave6.md §6), each Today → the warm-up (reported skipped: the session-seeds days walk the
// Wave 6 sets, w6-warmups.pw.ts) → the New block → the Coda.
//   (a) "after U11.L08": U12.L01 Major 7 & Minor 7 (it comes before GYM.11, U11.CP, C5 and X2 in the default
//       order). The Make is a loop of seventh chords: F^7 Em7 Dm7 C^7, saved as the learner's sketch.
//   (b) "after U13.L01": U13.L02 Sixteenth Grooves & Ghost Notes. The tap step (the kick's syncopation: 1, the "and"
//       of 2, the "and" of 3) is on screen with its pad; the Make keeps ghost notes in `.velocity()`.
//   (c) "U13.CP due": the Sevenths & Rhythm II checkpoint as a session, to a pass (sung items left out: they never
//       gate); the result names the Jazz Harmony and Advanced Rhythm tracks; the server has them open; the Coda,
//       then Today says so in one line.
//   (d) "after U14.L03": U14.L04 Lydian Glow; the Make is on F Lydian.
//   (e) "after U14.L06": U15.L01 Chromatic Degrees. Its completion opens CF-T: the Coda explains the transcription
//       slot (what it has become, the three standards, nothing waits for it). Then "C6 released": U15.L02 Five of
//       Five, whose Make holds the applied dominant (D7 → G7 in C).
//   (g) "after U17.L01": U17.L02 Truck-Driver & Direct Modulation; the Make lifts its last chorus a whole step with
//       a patterned `.scale()`.
//   (j) (a) and the U15.L02 day of (e) again in Quiet mode: nothing asks for the microphone.
// The lesson steps themselves (every step, a pinned mistake first) are the lesson suite's walks; here each graded
// step is answered from its reference through the player, as a learner who knows the answer would.
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { fakeMic } from "../../app/src/onboarding/e2e/helpers.ts";
import u12l01 from "../../content/core/U12/L01/lesson.ts";
import u13l02 from "../../content/core/U13/L02/lesson.ts";
import u14l04 from "../../content/core/U14/L04/lesson.ts";
import u15l01 from "../../content/core/U15/L01/lesson.ts";
import u15l02 from "../../content/core/U15/L02/lesson.ts";
import u17l02 from "../../content/core/U17/L02/lesson.ts";
import { useUiPrefs as setUiPrefs } from "../support/ui.ts";
import { walkCheckpoint } from "./checkpoint-walk.ts";
import { coda, lessonDay, startToday } from "./day.ts";
import { api, countMicAsks, expectClean, noHmr, resetClock, type Watch, watch } from "./support.ts";
import { today } from "./w4-day.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav") }, permissions: ["microphone"] });
test.describe.configure({ mode: "serial" });

/** Seeds `point` (Quiet mode: no mic, `voice.quiet` always), cuts HMR, sets the theme; watches the page. */
async function begin(
  page: Page,
  request: APIRequestContext,
  point: string,
  o: { quiet?: boolean; theme?: "paper" | "bark" } = {},
): Promise<{ w: Watch; micAsks: () => Promise<number> }> {
  await resetClock(request);
  await api(request, "POST", "/api/dev/seed", o.quiet ? { point, mic: false } : { point });
  if (o.quiet) await api(request, "PUT", "/api/voice/quiet", { quiet: true, scope: "always" });
  await noHmr(page);
  await setUiPrefs(page, { theme: o.theme ?? (o.quiet ? "bark" : "paper"), motion: "off" });
  const micAsks = await countMicAsks(page);
  return { w: watch(page), micAsks };
}

interface SketchRow {
  id: string;
  originId: string | null;
}

/** The code of the latest version of the sketch a lesson's Make saved. */
async function makeCode(request: APIRequestContext, lessonId: string): Promise<string> {
  const list = await api<{ items: SketchRow[] }>(request, "GET", "/api/sketches");
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
  test(`(a${quiet ? ", j" : ""}) U12.L01 as a daily session${quiet ? " in Quiet mode" : ""}: it ends in a loop of seventh chords`, async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const { w, micAsks } = await begin(page, request, "after U11.L08", { quiet });
    const plan = await lessonDay(page, request, u12l01, {
      warmupSets: 0,
      unlocks: "auto",
      shots: quiet ? "w6-journey-u12-coda-quiet" : "w6-journey-u12-coda",
    });
    expect(plan).toMatchObject({ kind: "lesson", mapItemId: "U12.L01" });
    // The Make: a loop of major and minor sevenths over a root bass, with a tune.
    const code = await makeCode(request, "U12.L01");
    expect(code).toMatch(/chord\(changes\)\.voicing\(\)/);
    expect(code).toMatch(/\^7/);
    expect(code).toMatch(/m7/);
    await completed(request, "U12.L01");
    // Return: Today says the day is done.
    await today(page);
    await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done");
    if (quiet) expect(await micAsks(), "Quiet mode never asks for the microphone").toBe(0);
    expectClean(w);
  });
}

test("(b) a U13 day: U13.L02, the kick's syncopation tapped, then a groove with ghost notes", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const { w } = await begin(page, request, "after U13.L01", { theme: "bark" });
  let tapped = false;
  await lessonDay(page, request, u13l02, {
    warmupSets: 0,
    unlocks: "auto",
    shots: "w6-journey-u13-coda",
    async before(step) {
      if (step.kind !== "tap") return;
      // The tap pad is on screen for the syncopated kick (three taps a bar: 1, the "and" of 2, the "and" of 3).
      await expect(page.getByTestId("lesson-step")).toContainText("the “and” of 2");
      await expect(page.getByTestId("tap-phase").first()).toBeVisible({ timeout: 30_000 });
      tapped = true;
    },
  });
  expect(tapped, "the tap step was reached").toBe(true);
  const code = await makeCode(request, "U13.L02");
  // Ghost notes: some snare hits at .3 among full ones.
  expect(code).toMatch(/snare: .*\.velocity\("[^"]*\.3/);
  await completed(request, "U13.L02");
  expectClean(w);
});

test("(c) U13.CP passed as a session: the Jazz Harmony and Advanced Rhythm tracks open, said on the result, the server and Today", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const { w } = await begin(page, request, "U13.CP due");
  const plan = await startToday(page, request, { warmupSets: 0 });
  expect(plan).toMatchObject({ kind: "checkpoint", mapItemId: "U13.CP" });
  const { passed } = await walkCheckpoint(page);
  expect(passed, "U13.CP passed").toBe(true);
  const result = page.getByTestId("checkpoint-result");
  await expect(result.getByTestId("tracks-opened")).toContainText(
    "The Jazz Harmony and Advanced Rhythm tracks are open",
  );
  await expect(result).not.toContainText(/\bU\d{2}\.L\d{2}\b|\bfam\.|\btb\./);
  const tracks = await api<{ items: { trackId: string; note: string }[] }>(request, "GET", "/api/tracks");
  for (const t of ["J", "R"])
    expect(tracks.items.find((x) => x.trackId === t)?.note, `track ${t} is open on the server`).toMatch(
      /^Open\./,
    );
  await page.getByTestId("checkpoint-done").click();
  await coda(page, { unlocks: "auto" });
  // Tomorrow: the core is still the session; the tracks are one line on Today.
  await api(request, "PUT", "/api/dev/clock", { advanceDays: 1 });
  await today(page);
  await expect(page.getByTestId("tracks-line")).toBeVisible({ timeout: 20_000 });
  const next = await api<{ kind: string; mapItemId: string | null }>(request, "GET", "/api/session/today");
  expect(next).toMatchObject({ kind: "lesson", mapItemId: "U14.L02" });
  expectClean(w);
  await resetClock(request);
});

test("(d) a U14 day: U14.L04, a melody on F Lydian over one held chord", async ({ page, request }) => {
  test.setTimeout(90_000);
  const { w } = await begin(page, request, "after U14.L03");
  await lessonDay(page, request, u14l04, { warmupSets: 0, unlocks: "auto", shots: "w6-journey-u14-coda" });
  expect(await makeCode(request, "U14.L04")).toMatch(/\.scale\("F\d:lydian"\)/);
  await completed(request, "U14.L04");
  expectClean(w);
});

test("(e) U15.L01's day: its completion opens CF-T, and the Coda explains the transcription slot", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const { w } = await begin(page, request, "after U14.L06");
  const before = await api<{ status: string }>(request, "GET", "/api/capstones/CF-T");
  expect(before.status, "CF-T waits for U15.L01").not.toBe("open");
  await lessonDay(page, request, u15l01, {
    warmupSets: 0,
    unlocks: "auto",
    shots: "w6-journey-u15l01-coda",
    async inspectCoda() {
      const card = page.getByTestId("coda-cft-opened");
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card).toContainText("The core finale has opened: part one");
      await expect(card).toContainText("Five Foot Two, Ain't She Sweet or Bye Bye Blackbird");
      await expect(card).toContainText("Nothing waits for it: your lessons carry on in between.");
    },
  });
  expect((await api<{ status: string }>(request, "GET", "/api/capstones/CF-T")).status).toBe("open");
  expect(await makeCode(request, "U15.L01")).toMatch(/\d#/);
  expectClean(w);
});

for (const quiet of [false, true]) {
  test(`(e${quiet ? ", j" : ""}) a U15 day${quiet ? " in Quiet mode" : ""}: U15.L02, a loop with its applied dominant`, async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const { w, micAsks } = await begin(page, request, "C6 released", { quiet });
    await lessonDay(page, request, u15l02, {
      warmupSets: 0,
      unlocks: "auto",
      shots: quiet ? "w6-journey-u15-coda-quiet" : "w6-journey-u15-coda",
    });
    // V7/V in C: D7 leans to G7.
    expect(await makeCode(request, "U15.L02")).toMatch(/D7 G7/);
    await completed(request, "U15.L02");
    if (quiet) expect(await micAsks(), "Quiet mode never asks for the microphone").toBe(0);
    expectClean(w);
  });
}

test("(g) a U17 day: U17.L02, the last chorus lifted a whole step by a patterned .scale()", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const { w } = await begin(page, request, "after U17.L01", { theme: "bark" });
  await lessonDay(page, request, u17l02, { warmupSets: 0, unlocks: "auto", shots: "w6-journey-u17-coda" });
  expect(await makeCode(request, "U17.L02")).toMatch(/\.scale\("<C\d:major!\d+ D\d:major!\d+>"\)/);
  await completed(request, "U17.L02");
  expectClean(w);
});
