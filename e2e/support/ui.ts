// Small Playwright helpers every Wave 2 area shares (docs/design/wave2.md §8): theme and motion before the first
// paint, and screenshots named by theme and viewport.
import { mkdirSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";

/** The localStorage key boot.js reads before first paint (app/src/ui/theme/prefs.ts `PREFS_KEY`). */
export const PREFS_KEY = "oak.ui.v1";

/** Sets the theme (and optionally reduced motion) for every page load of `page`. Call before `goto`. */
export async function useUiPrefs(
  page: Page,
  prefs: { theme: "paper" | "bark"; motion?: "on" | "off" | "system" },
): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      const cur = (() => {
        try {
          return JSON.parse(localStorage.getItem(key) || "{}") || {};
        } catch {
          return {};
        }
      })();
      localStorage.setItem(key, JSON.stringify({ ...cur, ...JSON.parse(value) }));
    },
    [PREFS_KEY, JSON.stringify(prefs)] as const,
  );
}

/**
 * Saves `<dir>/<name>-<theme>-<w>x<h>[-pN].png` and returns the paths. The app shell scrolls inside `<main>`, so a
 * Playwright `fullPage` shot shows only the first screen: this scrolls `#main` one screen at a time and saves
 * each page (`-p2`, `-p3`, …) until its end. `dir` is created.
 */
export async function shoot(page: Page, dir: string, name: string, theme: string): Promise<string[]> {
  mkdirSync(dir, { recursive: true });
  const size = page.viewportSize() ?? { width: 0, height: 0 };
  const base = `${dir}/${name}-${theme}-${size.width}x${size.height}`;
  const pages = await page.evaluate(() => {
    const main = document.getElementById("main");
    if (!main) return 1;
    main.scrollTop = 0;
    return Math.max(1, Math.ceil(main.scrollHeight / Math.max(1, main.clientHeight)));
  });
  const paths: string[] = [];
  for (let i = 0; i < Math.min(pages, 8); i++) {
    if (i > 0)
      await page.evaluate((n) => {
        const main = document.getElementById("main");
        if (main) main.scrollTop = n * main.clientHeight;
      }, i);
    const path = i === 0 ? `${base}.png` : `${base}-p${i + 1}.png`;
    await page.screenshot({ path, animations: "disabled" });
    paths.push(path);
  }
  await page.evaluate(() => {
    const main = document.getElementById("main");
    if (main) main.scrollTop = 0;
  });
  return paths;
}

/**
 * A locator's text right now, without Playwright's auto-wait: "" when it is absent or not unique. Walkers that poll
 * the screen read with this: `locator.textContent()` waits up to the action timeout (60 s in some suites) for an
 * element that is not there, and `.catch(() => "")` turned each such read into a minute of nothing.
 */
export async function textNow(locator: Locator): Promise<string> {
  const all = await locator.allTextContents();
  return all.length === 1 ? (all[0] ?? "") : "";
}
