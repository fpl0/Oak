// Renders desktop/build/icon.svg to icon.png (1024×1024, transparent) with the repo's Playwright Chromium.
// Run from the repository root: `node desktop/scripts/render-icon.mjs`.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "build");
const svg = readFileSync(join(dir, "icon.svg"), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.locator("svg").screenshot({ path: join(dir, "icon.png"), omitBackground: true });
await browser.close();
console.log("wrote", join(dir, "icon.png"));
