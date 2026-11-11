// Sing capture with Chromium's fake microphone singing a steady 440 Hz: the take opens the mic through
// app/src/lib/mic.ts, the live trace and needle follow it, and gradeSung passes the note on A (folded per note
// into the comfort range). Quiet mode offers "listen and self-check" instead and records nothing.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { collectErrors, fakeMicArgs, MIC_FILES, openGallery } from "./fixtures.ts";

test.use({ launchOptions: { args: fakeMicArgs(MIC_FILES.a4) } });

test("singing A4 (440 Hz) passes at A", async ({ page }) => {
  const errors = collectErrors(page);
  await useUiPrefs(page, { theme: "paper" });
  await openGallery(page, "?only=mic&state=idle");
  const w = page.locator('[data-live="mic"]');
  await w.getByRole("button", { name: "Sing", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(w.getByTestId("sing-phase")).toHaveText(/Get ready|Sing now/, { timeout: 30_000 });
  await expect(w.getByTestId("sing-needle")).toContainText("spot on", { timeout: 10_000 });
  await expect(w.getByTestId("sing-phase")).toHaveText("Done: 1 of 1 in tune.", { timeout: 15_000 });
  await expect(w.getByRole("list", { name: "Notes" })).toContainText(/A[+−]?\d+¢|A0¢/);
  await w.getByRole("button", { name: "Check" }).focus();
  await page.keyboard.press("Enter");
  await expect(w.getByTestId("answer-status")).toHaveText("That's it.");
  expect(errors).toEqual([]);
});

test("Quiet mode: listen and self-check, nothing recorded", async ({ page }) => {
  await useUiPrefs(page, { theme: "paper" });
  await openGallery(page, "?only=mic&state=idle");
  const w = page.locator('[data-live="mic"]');
  await w.getByRole("button", { name: "Can't sing now" }).focus();
  await page.keyboard.press("Enter");
  await expect(w.getByText("Listen and self-check")).toBeVisible();
  await w.getByRole("button", { name: "I heard it" }).focus();
  await page.keyboard.press("Enter");
  await expect(w.getByRole("button", { name: "I heard it" })).toHaveAttribute("aria-pressed", "true");
  await expect(w).toContainText("Noted. Singing it later turns this into voice practice.");
});
