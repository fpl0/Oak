// Sing capture with the fake microphone a semitone sharp (A♯4, 466.16 Hz): gradeSung gives the note half credit
// (`sing.sharp`, +100¢ is outside ±70¢) and the take fails, with the error in cents on the note.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { collectErrors, fakeMicArgs, MIC_FILES, openGallery } from "./fixtures.ts";

test.use({ launchOptions: { args: fakeMicArgs(MIC_FILES.sharp) } });

test("singing a semitone sharp of A fails", async ({ page }) => {
  const errors = collectErrors(page);
  await useUiPrefs(page, { theme: "bark" });
  await openGallery(page, "?only=mic&state=idle");
  const w = page.locator('[data-live="mic"]');
  await w.getByRole("button", { name: "Sing", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(w.getByTestId("sing-needle")).toContainText("high", { timeout: 30_000 });
  await expect(w.getByTestId("sing-phase")).toHaveText("Done: 0 of 1 in tune.", { timeout: 15_000 });
  await expect(w.getByRole("list", { name: "Notes" })).toContainText(/A\+(9\d|10\d)¢/);
  await w.getByRole("button", { name: "Check" }).focus();
  await page.keyboard.press("Enter");
  await expect(w.getByTestId("answer-status")).toHaveText("1 note was outside ±70¢.");
  expect(errors).toEqual([]);
});
