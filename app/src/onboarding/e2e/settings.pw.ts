// Settings › Voice, Settings › Audio and /settings/voice/setup run on the same set-up screens as onboarding.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { fakeMic, noHmr, resetData, shootAll, watchErrors } from "./helpers.ts";
import { stack } from "./playwright.config.ts";

test.use({ launchOptions: { args: fakeMic("voice.wav") } });
test.beforeEach(async ({ request }) => resetData(request, stack.apiURL));

test("Settings › Voice: re-run the range from its link, see it saved, the ladder and Quiet mode", async ({
  page,
  request,
}) => {
  await noHmr(page);
  await useUiPrefs(page, { theme: "paper" });
  const problems = watchErrors(page);
  await page.goto("/settings/voice");
  await expect(page.getByTestId("ladder-now")).toHaveText("±70¢ (Auto)");
  await expect(page.getByText("Tightens to ±50¢ when")).toBeVisible();
  await shootAll(page, "30-settings-voice");
  await page.getByTestId("rerun-range").click();
  await expect(page).toHaveURL(/\/settings\/voice\/setup\?part=range/);
  await page.getByTestId("range-start").click();
  await expect(page.getByText(/Your singing zone: A2–E4/)).toBeVisible({ timeout: 20_000 });
  await shootAll(page, "31-setup-range");
  await page.getByTestId("part-continue").click();
  await expect(page.getByTestId("setup-done")).toBeVisible();
  await page.getByRole("link", { name: "Back to Settings › Voice" }).click();
  await expect(page.getByText("A2 – E4")).toBeVisible();
  // Quiet mode switch, stored on the profile.
  await page.getByRole("switch", { name: "Quiet mode" }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get(`${stack.apiURL}/api/profile`, { headers: { "x-oak": "1" } })).json())
          .quiet,
    )
    .toBe(true);
  expect(problems).toEqual([]);
});

test("Settings › Audio: the left/right check plays, the limiter and the sound pack are reported", async ({
  page,
}) => {
  await noHmr(page);
  await useUiPrefs(page, { theme: "bark" });
  await page.goto("/settings/audio");
  await expect(page.getByTestId("pack-status")).toHaveText(/^Pack v1/);
  await expect(page.getByTestId("pack-offline")).toHaveText(/^Not cached/);
  await expect(page.getByText(/nothing goes above -3 dBFS/)).toBeVisible();
  await page.getByTestId("audio-lr").click();
  await expect(page.getByText(/Low on the left, high on the right\?/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("pack-status")).toHaveText(/sounds$/);
  await shootAll(page, "32-settings-audio");
});

test("the wizard's timing part on its own, tapping with the pointer on the pad", async ({ page }) => {
  await noHmr(page);
  await page.goto("/settings/voice/setup?part=latency");
  await page.getByTestId("tap-start").click();
  const pad = page.getByTestId("tap-pad");
  await page.evaluate(() => {
    const list = document.querySelector('[data-testid="latency-tap"] ol');
    const pad = document.querySelector('[data-testid="tap-pad"]');
    let last = -1;
    new MutationObserver(() => {
      const i = [...(list?.children ?? [])].findIndex((li) => li.getAttribute("aria-current") === "step");
      if (i > last) {
        last = i;
        setTimeout(() => pad?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), 25);
      }
    }).observe(list as Node, { subtree: true, attributes: true });
  });
  await expect(page.getByText(/Your taps land \d+ ms/)).toBeVisible({ timeout: 20_000 });
  await expect(pad).toContainText("taps");
});
