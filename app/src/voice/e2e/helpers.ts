// Shared bits of the voice specs: the fake microphone, the HMR block, data reset, error watching, screenshots in
// both themes and sizes, and reading the voice state the way the app does (GET /voice, or the profile while that
// endpoint answers its typed 501).
import { resolve } from "node:path";
import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot } from "../../../../e2e/support/ui.ts";

export const SHOTS = resolve(import.meta.dirname, "screenshots");
export const GENERATED = resolve(import.meta.dirname, ".generated");
export const HEADERS = { "x-oak": "1", "content-type": "application/json" } as const;

/** Chromium flags: a fake mic reading `wav` (restarted at every open), granted or refused; or no mic at all. */
export function fakeMic(wav: string | null, permission: "grant" | "deny" = "grant"): string[] {
  const base = ["--autoplay-policy=no-user-gesture-required"];
  if (wav === null) return [...base, "--use-fake-ui-for-media-stream=deny"];
  return [
    ...base,
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${resolve(GENERATED, wav)}`,
    permission === "grant" ? "--use-fake-ui-for-media-stream" : "--use-fake-ui-for-media-stream=deny",
  ];
}

/** Page errors and console errors; the typed 501 of a Wave 3 endpoint not built yet is expected, not a fault. */
export function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/status of 501/.test(m.text())) problems.push(`console.error: ${m.text()}`);
  });
  return problems;
}

/** Other engineers edit shared files while these specs run: a hot update would remount the screen under test. */
export async function noHmr(page: Page): Promise<void> {
  await page.routeWebSocket(/.*/, () => {});
}

export async function resetData(request: APIRequestContext, apiURL: string): Promise<void> {
  const h = { ...HEADERS, origin: apiURL };
  const { nonce } = await (
    await request.post(`${apiURL}/api/confirm`, { headers: h, data: { action: "data.reset", target: "*" } })
  ).json();
  const r = await request.post(`${apiURL}/api/data/reset`, { headers: { ...h, "x-oak-confirm": nonce } });
  expect(r.ok()).toBe(true);
}

export async function patchProfile(
  request: APIRequestContext,
  apiURL: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const r = await request.put(`${apiURL}/api/profile`, {
    headers: { ...HEADERS, origin: apiURL },
    data: patch,
  });
  expect(r.ok(), await r.text()).toBe(true);
}

/** Quiet mode as the app reads it: GET /voice when the server has it, else the profile. */
export async function quietNow(request: APIRequestContext, apiURL: string): Promise<boolean> {
  const v = await request.get(`${apiURL}/api/voice`, { headers: HEADERS });
  if (v.ok()) return ((await v.json()) as { quiet: boolean }).quiet;
  const p = await (await request.get(`${apiURL}/api/profile`, { headers: HEADERS })).json();
  return (
    (p as { quiet: boolean; inputKind: string }).quiet || (p as { inputKind: string }).inputKind === "none"
  );
}

/** Screenshots the current screen at 1440×900 and 1280×800 in Paper and Bark, then restores the page. */
export async function shootAll(page: Page, name: string): Promise<void> {
  const size = page.viewportSize();
  const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? "paper");
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, m.theme);
    await page.waitForTimeout(120);
    await shoot(page, SHOTS, name, m.theme);
  }
  if (size) await page.setViewportSize(size);
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
}

/** No element wider than the viewport (ux §10: no horizontal overflow). */
export async function expectNoOverflow(page: Page): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
}
