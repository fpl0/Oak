// Tap capture end to end: the real adapter's AudioContext, the TapPad's count-in, and Space taps scripted at the
// fixture rhythm's times (1, 2, 3, 3-and, 4 at 90 BPM). Key events are dispatched on the pad at the performance
// time that matches each target on the AudioContext clock (`getOutputTimestamp()` pairs, as the tap input maps
// them back). A late, sloppy take fails with per-beat marks; the clean take passes through `gradeTaps`.
import { expect, type Page, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { collectErrors, openGallery } from "./fixtures.ts";

const RHYTHM = [0, 0.25, 0.5, 0.625, 0.75];
const BAR_SEC = (60 / 90) * 4;

/** Waits for the take to start, then taps `offsetsMs[i]` after each target (null = skip that beat). */
async function tapTake(page: Page, offsetsMs: (number | null)[], extra: number[] = []): Promise<void> {
  const pad = page.locator('[data-live="tap"] [data-start-at]');
  await expect(pad).toHaveAttribute("data-start-at", /\d/, { timeout: 30_000 });
  await page.evaluate(
    async ({ rhythm, barSec, offsetsMs, extra }) => {
      const host = document.querySelector<HTMLElement>('[data-live="tap"] [data-start-at]');
      const surface = host?.querySelector<HTMLElement>("[data-tap-surface]");
      const ctx = (globalThis as unknown as { __oakStrudel?: { ctx: AudioContext } }).__oakStrudel?.ctx;
      if (!host || !surface || !ctx) throw new Error("tap pad or audio context missing");
      const startAt = Number(host.dataset.startAt);
      // A just-started context may not give a timestamp pair yet; then map through currentTime, as the tap input does.
      const ts = ctx.getOutputTimestamp();
      const pair =
        (ts.performanceTime ?? 0) > 0
          ? { perf: ts.performanceTime ?? 0, ctx: ts.contextTime ?? 0 }
          : { perf: performance.now(), ctx: ctx.currentTime };
      const perfOf = (t: number) => pair.perf + (t - pair.ctx) * 1000;
      const times = rhythm
        .map((bars, i) =>
          offsetsMs[i] === null ? null : startAt + bars * barSec + (offsetsMs[i] ?? 0) / 1000,
        )
        .filter((t): t is number => t !== null)
        .concat(extra.map((bars) => startAt + bars * barSec));
      await Promise.all(
        times.map(
          (t) =>
            new Promise<void>((resolve) => {
              setTimeout(
                () => {
                  surface.dispatchEvent(
                    new KeyboardEvent("keydown", {
                      code: "Space",
                      key: " ",
                      bubbles: true,
                      cancelable: true,
                    }),
                  );
                  resolve();
                },
                Math.max(0, perfOf(t) - performance.now()),
              );
            }),
        ),
      );
    },
    { rhythm: RHYTHM, barSec: BAR_SEC, offsetsMs, extra },
  );
}

test("tap the fixture rhythm: a sloppy take is marked, a clean take passes", async ({ page }) => {
  const errors = collectErrors(page);
  await useUiPrefs(page, { theme: "paper" });
  await openGallery(page, "?only=tap&state=idle");
  const w = page.locator('[data-live="tap"]');
  const phase = w.getByTestId("tap-phase");

  // Keyboard only: Enter on "Start tapping", then Space on the pad.
  await w.getByRole("button", { name: "Start tapping" }).focus();
  await page.keyboard.press("Enter");
  await expect(phase).toHaveText(/Count-in|Tap now/, { timeout: 30_000 });
  await tapTake(page, [0, 160, null, 5, -10], [0.875]);
  await expect(w.locator("[data-phase]")).toHaveAttribute("data-phase", "done", { timeout: 10_000 });
  // Tap times in ms from bar 1 (shown on failure): 0, 827, 1672, 1990, plus the extra at 2333.
  await expect(w.locator("[data-taps]")).toHaveAttribute("data-taps", /^-?\d+ \d+ \d+ \d+ \d+$/);
  await expect(phase).toHaveText("5 taps recorded.");
  await expect(w.locator("[data-tap-tick]")).toHaveCount(5);
  await page.keyboard.press("Enter");
  await expect(w.getByTestId("answer-status")).toHaveText(/^3 of 5 beats matched, 2 extra\./);
  // After the attempt the targets are drawn: 5 diamonds.
  await expect(w.locator("[data-tap-surface] span.rotate-45")).toHaveCount(5);

  await w.getByRole("button", { name: "Tap it again" }).focus();
  await page.keyboard.press("Enter");
  await expect(phase).toHaveText(/Count-in|Tap now/);
  await tapTake(page, [8, -12, 4, 10, -6]);
  await expect(phase).toHaveText("5 taps recorded.", { timeout: 10_000 });
  await page.keyboard.press("Enter");
  await expect(w.getByTestId("answer-status")).toHaveText("That's it.");
  expect(errors).toEqual([]);
});
