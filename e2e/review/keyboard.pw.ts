// A whole day's session with the keyboard alone (Tab, Shift+Tab, Enter, Space; never the mouse), with reduced
// motion and in Bark: Today → the lesson's set-up parts (one done, the others "Set up later") → the first sung
// note → the Make (Run, Save) → the Coda → Done for today. Every focused control shows a focus ring.
// Regression: finishing a set-up part (or "Keep it") dropped the keyboard focus on <body>, so the next Tab
// started again from the top of the page; it now lands on the next part's button, or on the step's Continue.
// Regression: U00.L02's step 2 ran the quiet and bleed checks twice (the mic part ran its onboarding sequence
// above the lesson's own noise and bleed parts) and printed the same two paragraphs three times.
import { expect, type Page, test } from "@playwright/test";
import { useUiPrefs } from "../support/ui.ts";
import { noHmr, openToday, resetClock, reviewMic, seed, shootAll, watch } from "./support.ts";

test.use({
  launchOptions: { args: reviewMic("hold-c4.wav") },
  permissions: ["microphone"],
  reducedMotion: "reduce",
});

const active = (page: Page) =>
  page.evaluate(() => {
    const e = document.activeElement as HTMLElement | null;
    if (!e || e === document.body) return { id: "body", text: "", ring: false };
    const cs = getComputedStyle(e);
    const ring =
      (cs.outlineStyle !== "none" && Number.parseFloat(cs.outlineWidth) > 0) ||
      (cs.boxShadow !== "none" && cs.boxShadow !== "");
    return {
      id: e.dataset.testid ?? "",
      text: (e.textContent || e.getAttribute("aria-label") || "").trim(),
      ring,
    };
  });

/** Tab forward until the focused control matches; asserts it shows a focus ring. */
async function tabTo(page: Page, match: { id?: string; text?: RegExp }, max = 40): Promise<void> {
  // The screen may already have put focus on it (the Coda focuses "Done for today"): check before tabbing away.
  for (let i = -1; i < max; i++) {
    if (i >= 0) await page.keyboard.press("Tab");
    else await page.waitForTimeout(600);
    const a = await active(page);
    if ((match.id && a.id === match.id) || match.text?.test(a.text)) {
      expect(a.ring, `focus ring on ${a.id || a.text}`).toBe(true);
      return;
    }
  }
  throw new Error(`Tab never reached ${match.id ?? match.text}`);
}

async function press(page: Page, match: { id?: string; text?: RegExp }, key = "Enter"): Promise<void> {
  await tabTo(page, match);
  await page.keyboard.press(key);
}

async function onStep(page: Page, id: string) {
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", id, { timeout: 30_000 });
}

test("a whole session from the keyboard, with reduced motion", async ({ page, request }) => {
  await resetClock(request);
  await seed(request, "onboarded");
  await noHmr(page);
  await useUiPrefs(page, { theme: "bark", motion: "system" });
  const problems = watch(page);
  await openToday(page);
  await press(page, { id: "start-session" });

  // S1 headphones: set up later (an optional part), then Continue — focus must not be lost on the way.
  await onStep(page, "S1");
  await press(page, { id: "part-skip" });
  await expect.poll(async () => (await active(page)).id).toBe("continue");
  await page.keyboard.press("Enter");

  // S2 microphone: allow it, hum (the fake mic holds a C), the quiet moment, the bleed check, done.
  await onStep(page, "S2");
  await press(page, { id: "mic-allow" });
  await expect(page.getByTestId("mic-live")).toBeVisible();
  await expect(page.getByText("Oak can hear you.", { exact: true })).toBeVisible({ timeout: 15_000 });
  // The mic part ends once Oak hears the learner ("Done"); focus moves straight to the quiet check's button.
  await press(page, { id: "result-continue" });
  // Wave 3: the "onboarded" seed has measured the room and the bleed already, so the quiet and bleed parts read
  // "Already set up" and focus moves to their "Keep it" in turn, then to Continue — never onto <body>.
  for (const part of ["noise", "bleed"]) {
    const kept = page.getByTestId(`setup-${part}-kept`);
    if (await kept.isVisible()) {
      await expect.poll(async () => (await active(page)).id).toBe("setup-keep");
      await page.keyboard.press("Enter");
      continue;
    }
    await expect.poll(async () => (await active(page)).id).toBe(`${part}-start`);
    await expect(page.getByTestId(`${part}-start`)).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("result-continue")).toBeVisible({ timeout: 15_000 });
    await press(page, { id: "result-continue" });
  }
  await expect.poll(async () => (await active(page)).id).toBe("continue");
  await shootAll(page, "keyboard-mic-step-done");
  await page.keyboard.press("Enter");

  // S3 timing: set up later. S4 holds two parts (range, then sing latency): after the first is put off, focus
  // goes to the second part's button; after the second, to Continue.
  await onStep(page, "S3");
  await press(page, { id: "part-skip" });
  await expect.poll(async () => (await active(page)).id).toBe("continue");
  await page.keyboard.press("Enter");
  await onStep(page, "S4");
  // (Wave 3: the seeded range is already set up, so only the sing-latency part may still be open.)
  await press(page, { id: "part-skip" });
  await expect.poll(async () => (await active(page)).id).toMatch(/^(sing-start|continue)$/);
  if ((await active(page)).id === "sing-start") {
    await press(page, { id: "part-skip" });
    await expect.poll(async () => (await active(page)).id).toBe("continue");
  }
  await page.keyboard.press("Enter");

  // S5, the first sung note: the fake microphone hummed through the quiet check above (so the room measured
  // loud), so this learner takes "Can't sing now" and self-checks, all from the keyboard, then goes on.
  await onStep(page, "S5");
  await expect(page.getByTestId("sing-phase")).toContainText("One note", { timeout: 20_000 });
  await press(page, { text: /^Can't sing now$/ });
  await press(page, { text: /^I heard it$/ });
  await expect(page.getByText(/^Noted\./)).toBeVisible();
  await press(page, { id: "continue" });

  // S6, the Make: Run (Enter on the play button), stop, save.
  await onStep(page, "S6");
  await shootAll(page, "keyboard-make");
  await press(page, { id: "play-toggle" });
  await page.waitForTimeout(1500);
  await page.keyboard.press("Enter");
  await press(page, { id: "save-sketch" });

  // The Coda: past the toolbox moment, then Done for today.
  await expect(page).toHaveURL(/\/session\/coda$/, { timeout: 60_000 });
  const moment = page.getByTestId("coda-unlock-moment");
  if (await moment.isVisible().catch(() => false)) await press(page, { text: /See the rest of today/ });
  // The session closes first ("Closing the session…"); Done for today appears when it has.
  await expect(page.getByTestId("done-for-today")).toBeVisible({ timeout: 30_000 });
  await press(page, { id: "done-for-today" });
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", "done");
  expect(problems).toEqual([]);
});
