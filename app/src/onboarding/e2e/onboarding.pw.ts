// The whole first ten minutes against the real server (fake tutor, fake mic): with a microphone, in Quiet mode,
// resumed after a reload, and with the mic permission refused.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { expectStep, fakeMic, noHmr, resetData, shootAll, throughTheLoop, watchErrors } from "./helpers.ts";
import { stack } from "./playwright.config.ts";

test.beforeEach(async ({ request }) => resetData(request, stack.apiURL));

test.use({ launchOptions: { args: fakeMic("voice.wav") } });

test.describe("with a microphone", () => {
  test("the full onboarding: loop, edit, preferences, tutor, set-up, first note, Sketch 001, coda", async ({
    page,
    request,
  }) => {
    await noHmr(page);
    await noHmr(page);
    await useUiPrefs(page, { theme: "paper" });
    const problems = watchErrors(page);
    await throughTheLoop(page, 6, { shots: true });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("6 plays B, leaning up toward home");
    await page.getByTestId("react-continue").click();

    // Preferences.
    await expectStep(page, "prefs");
    await page.getByTestId("flavour-jazz-soul").click();
    await page.getByTestId("preview-jazz-soul").click();
    await expect(page.getByTestId("preview-jazz-soul")).toHaveText("Stop", { timeout: 15_000 });
    await shootAll(page, "05-prefs");
    await page.getByRole("radio", { name: "25 min" }).click();
    await page.getByTestId("prefs-continue").click();

    // The tutor (scripted fake backend: ready through the "Claude login").
    await expectStep(page, "tutor");
    await expect(page.getByTestId("tutor-ready")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("tutor-sends")).toContainText("Never your voice");
    await page.getByTestId("tutor-ask").click();
    await expect(page.getByTestId("tutor-ask")).toBeDisabled();
    await shootAll(page, "06-tutor");
    await page.getByTestId("tutor-continue").click();

    // Headphones: left/right.
    await expectStep(page, "headphones");
    await page.getByTestId("lr-play").click();
    await page.getByTestId("lr-left").click({ timeout: 10_000 });
    await shootAll(page, "07-headphones");
    await page.getByTestId("part-continue").click();

    // Microphone: the privacy line, permission, a live signal, the quiet room, no bleed.
    await expectStep(page, "mic");
    await expect(page.getByTestId("privacy-line")).toHaveText(
      "Your voice is analysed live on this computer. Nothing is recorded or sent.",
    );
    await expect(page.getByRole("button", { name: /Microphone is live/ })).toHaveCount(0);
    await shootAll(page, "08-mic-ask");
    await page.getByTestId("mic-allow").click();
    await expect(page.getByTestId("mic-live")).toBeVisible({ timeout: 15_000 });
    // The shell's indicator is truthful: on while the stream is open.
    await expect(page.getByRole("button", { name: /Microphone is live/ })).toBeVisible();
    await expect(page.getByText("Oak can hear you.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("mic-note")).toHaveText(/^C4 /);
    await shootAll(page, "09-mic-live");
    await page.getByTestId("part-continue").click();
    await page.getByTestId("noise-start").click();
    await expect(page.getByText("Quiet enough")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Microphone is live/ })).toHaveCount(0);
    await page.getByTestId("part-continue").click();
    await page.getByTestId("bleed-start").click();
    await expect(page.getByText("No bleed")).toBeVisible({ timeout: 15_000 });
    await shootAll(page, "10-mic-done");
    await page.getByTestId("part-continue").click();

    // Range: the sweep hears A2 and E4.
    await expectStep(page, "range");
    await page.getByTestId("range-start").click();
    await expect(page.getByTestId("range-sweeping")).toBeVisible();
    await expect(page.getByText(/Your singing zone: A2–E4/)).toBeVisible({ timeout: 20_000 });
    await shootAll(page, "11-range");
    await page.getByTestId("part-continue").click();

    // Timing: 16 taps (dispatched on each click as the dots light), then 8 sung "da"s from the fake mic.
    await expectStep(page, "latency");
    await page.getByTestId("tap-start").click();
    await page.evaluate(() => {
      const list = document.querySelector('[data-testid="latency-tap"] ol');
      let last = -1;
      const obs = new MutationObserver(() => {
        const i = [...(list?.children ?? [])].findIndex((li) => li.getAttribute("aria-current") === "step");
        if (i > last) {
          last = i;
          setTimeout(
            () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " })),
            15,
          );
        }
      });
      if (list) obs.observe(list, { subtree: true, attributes: true });
    });
    await expect(page.getByText(/Your taps land \d+ ms (after|before) the click/)).toBeVisible({
      timeout: 20_000,
    });
    await page.getByTestId("sing-start").click();
    await expect(page.getByText(/Your voice lands \d+ ms/)).toBeVisible({ timeout: 20_000 });
    await shootAll(page, "12-latency");
    await page.getByTestId("part-continue").click();

    // The first sung note: C, any octave.
    await expectStep(page, "first-sing");
    await page.getByTestId("first-sing-start").click();
    await expect(page.getByText("That note is 1: home.")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("button", { name: /Microphone is live/ })).toHaveCount(0);
    await shootAll(page, "13-first-sing");
    await page.getByTestId("part-continue").click();

    // Sketch 001.
    await expectStep(page, "sketch");
    await expect(page.locator('[data-testid="workbench"]')).toBeVisible({ timeout: 30_000 });
    await shootAll(page, "14-sketch");
    await page.getByTestId("sketch-save").click();
    await expectStep(page, "coda");
    await expect(page.getByTestId("coda-rows")).toContainText("You changed the last note to 6");
    await expect(page.getByTestId("coda-rows")).toContainText("Jazz-soul · 25 minutes a day");
    await expect(page.getByTestId("coda-rows")).toContainText("Comfortable");
    await expect(page.getByTestId("coda-rows")).toContainText("Sung: that note is home");
    await shootAll(page, "15-coda");
    await page.getByTestId("coda-done").click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    // Everything was stored through the API.
    const profile = await (
      await request.get(`${stack.apiURL}/api/profile`, { headers: { "x-oak": "1" } })
    ).json();
    expect(profile.onboardedAt).not.toBeNull();
    expect(profile.flavour).toBe("flavour.jazz-soul");
    expect(profile.targetMinutes).toBe(25);
    expect(profile.vocalLowMidi).toBe(45);
    expect(profile.vocalHighMidi).toBe(64);
    expect(profile.noiseFloorDb).toBeLessThan(-45);
    expect(profile.tapLatencyMs).not.toBeNull();
    expect(profile.singLatencyMs).not.toBeNull();
    expect(profile.quiet).toBe(false);
    const sketches = await (
      await request.get(`${stack.apiURL}/api/sketches`, { headers: { "x-oak": "1" } })
    ).json();
    expect(sketches.items.map((s: { title: string }) => s.title)).toContain("Sketch 001");
    expect(problems).toEqual([]);
  });
});
