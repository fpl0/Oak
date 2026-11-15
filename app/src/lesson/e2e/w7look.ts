// Looking at a Wave 7 screen as the learner does (wave7.md §10; wave2.md §8): Paper and Bark at 1440×900 and
// 1280×800 on the page as it is (one page per state, resized in place): nothing overflows, then the picture
// (under ./screenshots, gitignored), read by whoever changes the screen.
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { shoot } from "../../../../e2e/support/ui.ts";
import { noOverflow } from "./w3support.ts";

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));

/** Both themes at both sizes, on the page as it is: nothing overflows, then the picture. */
export async function lookAt(page: Page, name: string): Promise<void> {
  for (const theme of ["paper", "bark"] as const) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    for (const size of [
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(size);
      await noOverflow(page);
      await shoot(page, SHOTS, name, theme);
    }
  }
  await page.evaluate(() => {
    delete document.documentElement.dataset.theme;
  });
}
