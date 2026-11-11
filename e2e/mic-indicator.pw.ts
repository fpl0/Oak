// The Mic-live indicator against a real (fake-device) stream in the real app (contracts §11: the mic opens only
// in sing steps and calibration; the indicator is visible exactly while it is open; Cmd/Ctrl+Shift+M closes
// it; ux §10.6: it closes within 200 ms of leaving the step). Before the runtime review nothing connected the
// shell's dot to @oak/audio's mic graph: it could never light. app/src/lib/mic.ts is that bridge.
import { expect, type Page, test } from "@playwright/test";

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
});

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

async function noHmr(page: Page): Promise<void> {
  await page.routeWebSocket(/\/(\?token=|@vite)/, () => {});
}

test("the Mic-live dot follows the real stream; Mod+Shift+M and leaving the page close it within 200 ms", async ({
  page,
}) => {
  const problems = watch(page);
  await noHmr(page);
  await page.goto("/settings/voice/setup");
  await page.keyboard.press("a"); // wakes sound (the mic shares the adapter's context)
  await expect(page.getByRole("banner").getByTestId("audio-status")).toHaveAccessibleName(/Ready/, {
    timeout: 30_000,
  });
  const dot = page.getByRole("button", { name: "Microphone is live. Close it" });
  await expect(dot).toHaveCount(0);
  const open = () =>
    page.evaluate(async () => {
      // The app's own module, served by the Vite dev server (the instance main.tsx shares the shell with).
      const path = "/src/lib/mic.ts";
      const mic = (await import(/* @vite-ignore */ path)) as {
        openMic(): Promise<{ sampleRate: number; frames(): unknown[] }>;
      };
      const session = await mic.openMic();
      (window as unknown as { __mic: { frames(): unknown[] } }).__mic = session;
      return session.sampleRate;
    });
  expect(await open()).toBeGreaterThan(0);
  await expect(dot).toBeVisible();
  // The shortcut closes it; the stream's tracks end.
  const t0 = Date.now();
  await page.keyboard.press("ControlOrMeta+Shift+M");
  await expect(dot).toHaveCount(0, { timeout: 200 });
  expect(Date.now() - t0).toBeLessThan(1000);
  // The indicator's own button closes it too.
  await open();
  await expect(dot).toBeVisible();
  await dot.click();
  await expect(dot).toHaveCount(0, { timeout: 200 });
  // Leaving the page closes it.
  await open();
  await expect(dot).toBeVisible();
  await page.getByRole("link", { name: /Today/ }).first().click();
  await expect(dot).toHaveCount(0, { timeout: 200 });
  expect(problems).toEqual([]);
});
