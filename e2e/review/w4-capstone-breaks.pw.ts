// Wave 4 review (review:journey): a capstone day broken on purpose. C2.S1 from Today: the chords written and saved,
// then the page reloaded in the middle of the session, then the same capstone opened in a second tab. Defect found
// and fixed: after the reload the resume card said "The draft doesn't run as it is" for a draft that runs. It
// played the draft through the pattern player's default lint (the content profile), which refuses a part named
// `melody:`; the learner's own code is now linted as Studio lints it (session/playback.ts), and it plays.
import { expect, test } from "@playwright/test";
import { setCapstoneCode, skipWarmup, startSession, today } from "../journey/w4-day.ts";
import { useUiPrefs } from "../support/ui.ts";
import { api, resetClock, shootAll, watch } from "./support.ts";
import { quietHmr, seedPoint } from "./w4-support.ts";

const LOOP = '"<[0,2,4] [4,6,8] [5,7,9] [3,5,7] [0,2,4] [4,6,8] [4,6,8] [0,2,4]>"';
const C2_CHORDS = `setcpm(96/4)\n\nchords: n(${LOOP}).scale("C3:major").s("piano")\nmelody: n("<0 ~ ~ ~ ~ ~ ~ ~>").scale("C4:major").s("piano")`;

test("C2.S1: reload mid-session, then a second tab", async ({ page, context, request }) => {
  test.setTimeout(220_000);
  await resetClock(request);
  await seedPoint(request, "C2 open");
  await quietHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watch(page);
  await today(page);
  await startSession(page);
  await skipWarmup(page);
  const start = page.getByRole("button", { name: "Start session 1 of 2" });
  const ws = page.getByTestId("capstone-workspace");
  await expect(ws.or(start)).toBeVisible({ timeout: 60_000 });
  if (await start.isVisible()) await start.click();
  await expect(ws).toBeVisible({ timeout: 60_000 });
  await setCapstoneCode(page, "C2", C2_CHORDS);
  await expect(page.getByTestId("saved-state")).toContainText(/Version \d+ saved/, { timeout: 30_000 });

  await page.reload();
  const card = page.getByTestId("capstone-resume");
  // A reload mid-session resumes from the top: the draft plays (it runs), then the workspace with the chords.
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("resume-bar")).toHaveText(/Bar \d+ of 8/, { timeout: 30_000 });
  await expect(card).not.toContainText("doesn't run");
  await shootAll(page, "w4-break-capstone-reload");
  await page.getByTestId("resume-continue").click();
  await expect(ws).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".cm-content").first()).toContainText("[5,7,9]", { timeout: 30_000 });

  // The same capstone in a second tab: the same resume card, the same draft.
  const other = await context.newPage();
  await quietHmr(other);
  const p2 = watch(other);
  await other.goto("/session");
  await expect(other.getByTestId("capstone-resume")).toBeVisible({ timeout: 60_000 });
  await expect(other.getByTestId("resume-bar")).toHaveText(/Bar \d+ of 8/, { timeout: 30_000 });
  await other.getByTestId("resume-continue").click();
  await expect(other.getByTestId("capstone-workspace")).toBeVisible({ timeout: 60_000 });
  await other.close();
  const sessions = await api<{ sessions: { capstoneSessionId: string; status: string }[] }>(
    request,
    "GET",
    "/api/capstones/C2/sessions",
  );
  expect(sessions.sessions.map((x) => x.status)).toEqual(["in_progress", "locked"]);
  expect(problems).toEqual([]);
  expect(p2).toEqual([]);
});
