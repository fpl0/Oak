// The same degree pattern sung with 6 (F♯4) where 5 belongs: 1 and 3 pass, the third target is marked outside the
// band (+200¢ reads as "another note", no credit), the take fails (mean credit below 0.8) and the stand-in host
// says why.
import { expect, test } from "@playwright/test";
import { useUiPrefs } from "../../../../e2e/support/ui.ts";
import { collectErrors, fakeMicArgs, MIC_FILES, openGallery } from "./fixtures.ts";

test.use({ launchOptions: { args: fakeMicArgs(MIC_FILES.patternWrong) } });

test("singing 1 3 6 for 1 3 5 fails on the third target", async ({ page }) => {
  const errors = collectErrors(page);
  await page.routeWebSocket(/.*/, () => {});
  await useUiPrefs(page, { theme: "bark" });
  await openGallery(page, "?only=sing-degrees&state=idle");
  const w = page.locator('[data-live="sing-degrees"]');
  await w.getByRole("button", { name: "Sing", exact: true }).click();
  await expect(w.getByTestId("sing-phase")).toHaveText("Done: 2 of 3 in tune.", { timeout: 30_000 });
  const notes = w.getByRole("list", { name: "Notes" });
  await expect(
    notes.getByRole("listitem", { name: /^degree 5, another note, outside the band$/ }),
  ).toHaveCount(1);
  await expect(notes.getByRole("listitem", { name: /^degree 1, .*in tune$/ })).toHaveCount(1);
  await w.getByRole("button", { name: "Check" }).click();
  await expect(w.getByTestId("answer-status")).toHaveText("1 note was outside ±50¢.");
  expect(errors).toEqual([]);
});
