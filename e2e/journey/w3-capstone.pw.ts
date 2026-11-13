// Wave 3 journey (a): from "after U02.CP" (C0 released, U02's checkpoint passed yesterday), today is the C1 capstone
// session. Start it from Today (its start grants ebass and .lpf()), write the loop, watch the living checklist
// tick, check it, release it with a real recording and a liner line, take the Coda, and find two tracks on the
// album — C0's and C1's — each with its own cover.
import { expect, test } from "@playwright/test";
import { fakeMic } from "../../app/src/onboarding/e2e/helpers.ts";
import { capstones } from "../../content/capstones.ts";
import { useUiPrefs } from "../support/ui.ts";
import { walkCapstone } from "./capstone-walk.ts";
import { coda, startToday } from "./day.ts";
import { api, expectClean, noHmr, openToday, resetClock, seed, shootAll, watch } from "./support.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav") }, permissions: ["microphone"] });

test("C1 from Today: the loop made, checked and released; the album holds two tracks", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  await resetClock(request);
  await seed(request, "after U02.CP");
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const w = watch(page);

  const c1 = capstones.find((c) => c.id === "C1");
  if (!c1) throw new Error("C1 is not in content/capstones.ts");
  const brief = c1.brief as unknown as {
    tests: { name: string; response: { code?: string } }[];
    rubric: { required: boolean }[];
  };
  const ref = brief.tests.find((t) => t.name === "four bars, riff answers itself")?.response.code;
  if (!ref) throw new Error("C1's passing loop is not in content/capstones.ts");
  const rules = brief.rubric.filter((r) => r.required).length;

  // One warm-up set is walked before C1, as in HEAD: with the whole warm-up reported skipped at once, the capstone
  // workspace opened with the unlock list read before the session start granted ebass and .lpf(), and refused the
  // piece ("The sound "ebass" unlocks in C1.S1"). That is the app's to fix (cut:journey apiNotes), not this test's.
  const plan = await startToday(page, request, { warmupSets: 1 });
  expect(plan).toMatchObject({ kind: "capstone", mapItemId: "C1.S1" });
  await walkCapstone(page, {
    id: "C1",
    code: ref,
    rules,
    linerLine: "A walking bass under a riff that answers itself.",
  });
  // Starting C1 granted the electric bass and the low-pass filter (contracts §3.1 rule 12).
  const unlocks = JSON.stringify(await api<unknown>(request, "GET", "/api/unlocks"));
  expect(unlocks).toContain("tb.lpf");
  await shootAll(page, "w3-c1-release");
  await page.getByRole("button", { name: "Continue to the coda" }).click();
  await coda(page, { unlocks: "auto" });

  const status = await api<{ status: string; trackId: string }>(request, "GET", "/api/capstones/C1");
  expect(status.status).toBe("released");
  await page.goto("/album");
  const tracks = page.locator("[data-track]");
  await expect(tracks).toHaveCount(2, { timeout: 30_000 });
  const row = page.locator(`[data-track="${status.trackId}"]`);
  await expect(row.locator("svg[data-cover-rings]")).toBeVisible({ timeout: 30_000 });
  await row.getByRole("button", { name: "Liner notes" }).click();
  await expect(row.getByTestId("liner-notes")).toContainText(
    "A walking bass under a riff that answers itself.",
  );
  await shootAll(page, "w3-album-two-tracks");
  // The recording the release made: real audio bytes.
  const bytes = await page.evaluate(async (id) => {
    const res = await fetch(`/api/album/tracks/${id}/versions/1/audio`);
    return res.ok ? (await res.arrayBuffer()).byteLength : -res.status;
  }, status.trackId);
  expect(bytes).toBeGreaterThan(4000);
  await openToday(page);
  await expect(page.getByTestId("album-strip").getByRole("link", { name: /released/ })).toHaveCount(2);
  expectClean(w);
});
