// Shared steps of the Studio and Toolbox specs: direct API calls to the stack's own server (Origin and
// X-Oak as the app sends them), the unlocks of the first lessons, the master-bus level.
import { expect, type Page } from "@playwright/test";
import { stack } from "./playwright.config.ts";

const HEADERS = { "content-type": "application/json", origin: stack.baseURL, "x-oak": "1" };

export async function api<T>(
  page: Page,
  method: "GET" | "POST" | "PATCH" | "PUT",
  path: string,
  body?: unknown,
) {
  const res = await page.request.fetch(`${stack.apiURL}/api${path}`, {
    method,
    headers: HEADERS,
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
  });
  return { status: res.status(), body: (await res.json().catch(() => null)) as T };
}

export const BLANK = 'setcpm(90/4)\n\ndrums: s("bd hh sd hh")\n';

export function sketchBody(title: string, code = BLANK, extra: Record<string, unknown> = {}) {
  return {
    title,
    originKind: "free",
    originId: null,
    sessionId: null,
    code,
    bpm: 90,
    meter: "4/4",
    key: null,
    analysis: null,
    note: null,
    tutorAssisted: false,
    band: null,
    flags: { lockedTools: [], previewTools: [] },
    ranOk: false,
    ...extra,
  };
}

export async function createSketch(
  page: Page,
  title: string,
  code = BLANK,
  extra: Record<string, unknown> = {},
) {
  const r = await api<{ sketch: { id: string } }>(page, "POST", "/sketches", sketchBody(title, code, extra));
  expect(r.status).toBe(200);
  return r.body.sketch.id;
}

/**
 * What the learner has after U00.L01 and U01.L01 (contracts §3.2): the rows a completed session grants. The
 * course cannot be completed through the API yet (U00 has no lesson files while its author writes them, and
 * U01.L01 opens only after U00), so the fixture writes the same `unlocks` rows the server would, straight
 * into this stack's throwaway database.
 */
export const FIRST_UNLOCKS: readonly [string, string, string][] = [
  ["tb.feature.transport", "feature", "U00.L01"],
  ["tb.feature.roll", "feature", "U00.L01"],
  ["tb.feature.studio", "feature", "U00.L01"],
  ["tb.feature.tutor", "feature", "U00.L01"],
  ["tb.feature.band", "feature", "U00.L01"],
  ["tb.label", "tool", "U00.L01"],
  ["tb.s", "tool", "U01.L01"],
  ["tb.setcpm", "tool", "U01.L01"],
  ["tb.mini.seq", "tool", "U01.L01"],
  ["tb.mini.repeat", "tool", "U01.L01"],
  ["snd.drum.bd", "sound", "U01.L01"],
  ["snd.drum.sd", "sound", "U01.L01"],
  ["snd.drum.hh", "sound", "U01.L01"],
  ["snd.drum.cp", "sound", "U01.L01"],
  ["snd.drum.rim", "sound", "U01.L01"],
];

export async function unlockFirstLessons(page: Page): Promise<void> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(`${stack.dataDir}/oak.db`);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    const insert = db.prepare(
      "INSERT OR IGNORE INTO unlocks (item_id, kind, source_kind, source_id, unlocked_at, seen) VALUES (?, ?, 'session-complete', ?, ?, 1)",
    );
    const at = new Date(Date.now() - 86_400_000).toISOString();
    for (const [id, kind, lesson] of FIRST_UNLOCKS) insert.run(id, kind, lesson, at);
  } finally {
    db.close();
  }
  const u = await api<{ items: { itemId: string }[] }>(page, "GET", "/unlocks");
  expect(u.body.items.map((i) => i.itemId)).toContain("tb.setcpm");
}

/** Peak RMS of the master bus over `ms` (the app's dev hook `__oakStrudel`). */
export async function rms(page: Page, ms = 1500): Promise<number> {
  return page.evaluate(async (ms) => {
    const o = (globalThis as { __oakStrudel?: { master: { level(): { rms: number } } } }).__oakStrudel;
    let peak = 0;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      peak = Math.max(peak, o?.master.level().rms ?? 0);
      await new Promise((r) => setTimeout(r, 20));
    }
    return peak;
  }, ms);
}

export const WB = "[data-testid=workbench]";

export async function openSketch(page: Page, id: string): Promise<void> {
  await page.goto(`/studio/${id}`);
  await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
}

/** Types at the end of the editor (CodeMirror). */
export async function typeAtEnd(page: Page, text: string): Promise<void> {
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(text);
}
