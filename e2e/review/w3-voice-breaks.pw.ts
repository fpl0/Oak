// Wave 3 review, voice, breaking it on purpose in a U03 lesson (U03.L03 S7, "Sing them home": two sung patterns
// in one step): the microphone revoked in the middle of the step (the track ends, the next request is refused),
// and Quiet mode switched on from another tab while the step is open. Each must leave a calm, specific way
// forward, never a dead end, and nothing may gate (contracts §7.6, §8.5).
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../support/ui.ts";
import { api, noHmr, resetClock, reviewMic, seed, shootAll, watch } from "./support.ts";

test.use({ launchOptions: { args: reviewMic("hold-c4.wav") }, permissions: ["microphone"] });

/** Records every stream the page opens, and lets the test revoke the mic: live tracks end, new requests fail. */
const REVOCABLE_MIC = () => {
  const md = navigator.mediaDevices;
  const real = md.getUserMedia.bind(md);
  const streams: MediaStream[] = [];
  const w = window as unknown as { __revokeMic(): void; __micRevoked: boolean };
  w.__micRevoked = false;
  md.getUserMedia = async (c?: MediaStreamConstraints) => {
    if (w.__micRevoked) throw new DOMException("Permission denied", "NotAllowedError");
    const s = await real(c);
    streams.push(s);
    return s;
  };
  w.__revokeMic = () => {
    w.__micRevoked = true;
    for (const s of streams)
      for (const t of s.getTracks()) {
        t.stop();
        t.dispatchEvent(new Event("ended"));
      }
  };
};

test("the mic revoked mid-step: the next take says why and offers a way on; nothing gates", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  await resetClock(request);
  await seed(request, "after U03.L02");
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  await page.addInitScript(REVOCABLE_MIC);
  const problems = watch(page, [/Permission denied|NotAllowedError|microphone/i]);
  await page.goto("/learn/U03.L03?step=S7");
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", "S7", { timeout: 60_000 });
  const sing = page.getByRole("button", { name: "Sing", exact: true });
  await sing.first().click();
  await expect(page.getByRole("button", { name: "Microphone is live. Close it" })).toBeVisible({
    timeout: 20_000,
  });
  // Mid-take: the browser takes the microphone away.
  await page.evaluate(() => (window as unknown as { __revokeMic(): void }).__revokeMic());
  await expect(page.getByRole("button", { name: "Microphone is live. Close it" })).toHaveCount(0, {
    timeout: 20_000,
  });
  await shootAll(page, "w3-voice-revoked-first");
  // The step is never stuck: Continue (or Skip) is open.
  await expect(page.getByTestId("continue")).toBeEnabled();
  // The second pattern asks for the mic again and is refused: the learner is told why, and can self-check.
  const again = page.getByRole("button", { name: /^(Sing|Try again)$/ });
  await again.last().click();
  await expect(
    page.getByText(/microphone is blocked|blocked for Oak|can't use the microphone/i).first(),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Listen and self-check", { exact: true }).first()).toBeVisible();
  await shootAll(page, "w3-voice-revoked-second");
  await page.getByRole("button", { name: "I heard it" }).first().click();
  await expect(page.getByText(/^Noted\./).first()).toBeVisible();
  await expect(page.getByTestId("continue")).toBeEnabled();
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", "S8", { timeout: 30_000 });
  expect(problems).toEqual([]);
});

test("Quiet mode switched on from another tab while a sung step is open: the step follows, no mic", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(180_000);
  await resetClock(request);
  await seed(request, "after U03.L02");
  await noHmr(page);
  await useUiPrefs(page, { theme: "bark" });
  const problems = watch(page);
  await page.goto("/learn/U03.L03?step=S7");
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", "S7", { timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Sing", exact: true }).first()).toBeVisible();
  // A second tab: Settings → Voice → Quiet mode for today. The lesson tab stays open behind it.
  const other = await context.newPage();
  await noHmr(other);
  await other.goto("/settings/voice");
  await other.getByTestId("quiet-control").getByRole("switch").click();
  await expect(other.getByTestId("quiet-control")).toHaveAttribute("data-quiet", "1", { timeout: 20_000 });
  // The lesson tab follows within seconds, with no visibility change and inside the voice state's 10 s stale
  // time: both sung parts are their Quiet fallbacks and the mic is never offered.
  // Regression: the lesson kept offering Sing (and opened the mic in Quiet mode) until the cached voice state
  // went stale and the tab was hidden and shown again.
  await expect(page.getByTestId("sing-quiet")).toHaveCount(2, { timeout: 8_000 });
  await expect(page.getByTestId("sing-quiet").first()).toHaveAttribute("data-quiet-by", "mode");
  await expect(page.getByRole("button", { name: "Sing", exact: true })).toHaveCount(0);
  await page.bringToFront();
  await shootAll(page, "w3-voice-quiet-from-other-tab");
  await expect(page.getByTestId("continue")).toBeEnabled();
  const r = await api<{ attempts?: number }>(request, "GET", "/api/lessons/U03.L03/steps/S7");
  expect(r.attempts ?? 0).toBe(0);
  // Off again in the other tab: the lesson offers Sing again.
  await other.getByTestId("quiet-control").getByRole("switch").click();
  await expect(page.getByRole("button", { name: "Sing", exact: true })).toHaveCount(2, { timeout: 8_000 });
  await other.close();
  expect(problems).toEqual([]);
});
