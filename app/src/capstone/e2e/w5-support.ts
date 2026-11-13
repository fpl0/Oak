// Helpers for the Wave 5 capstone specs (not a spec): seeds with their Wave 5 names and the generic patterns the
// server already answers ("C3 ready", "after C3.S2"), direct API calls, the editor, screenshots in both themes at
// both sizes, the capstone content as the specs need it, and the console errors a spec must not see.
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { capstones } from "../../../../content/capstones.ts";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot } from "../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";

export const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));
const H = { "content-type": "application/json", origin: stack.baseURL, "x-oak": "1" };

export async function api<T>(page: Page, method: string, path: string, data?: unknown): Promise<T> {
  const res = await page.request.fetch(`${stack.apiURL}/api${path}`, {
    method,
    headers: H,
    ...(data === undefined ? {} : { data }),
  });
  expect(res.ok(), `${method} ${path}: ${res.status()} ${await res.text().catch(() => "")}`).toBe(true);
  return (await res.json()) as T;
}

export async function status(page: Page, method: string, path: string, data?: unknown): Promise<number> {
  const res = await page.request.fetch(`${stack.apiURL}/api${path}`, {
    method,
    headers: H,
    ...(data === undefined ? {} : { data }),
  });
  return res.status();
}

/**
 * Seeds the first point of `points` the server knows (the Wave 5 names of wave5.md §6, then the generic patterns
 * that reach the same state). Skips the test, naming what is missing, when none is there yet.
 */
export async function seedFirst(page: Page, points: readonly string[], mic = true): Promise<string> {
  await api(page, "PUT", "/dev/clock", { reset: true });
  const tried: string[] = [];
  for (const point of points) {
    const res = await page.request.fetch(`${stack.apiURL}/api/dev/seed`, {
      method: "POST",
      headers: H,
      data: mic ? { point } : { point, mic: false },
    });
    if (res.ok()) return point;
    tried.push(`${point}: ${res.status()} ${(await res.text()).slice(0, 160)}`);
  }
  test.skip(true, `no seed for this yet (${tried.join("; ")})`);
  return "";
}

export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // Strudel's one error per failed evaluation; Vite's re-optimise; endpoints other engineers still build (501).
    if (/\[eval\]|evaluation error|Outdated Optimize Dep|status of 501 \(Not Implemented\)/.test(m.text()))
      return;
    errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

const editorId = (cap: string) => `oak_capstone-${cap}_0_`;
export const editor = (page: Page, cap: string) =>
  page.waitForFunction(
    (id) =>
      !!(globalThis as { __oakStrudel?: { editors: Map<string, unknown> } }).__oakStrudel?.editors.get(id),
    editorId(cap),
    { timeout: 60_000 },
  );
export async function setCode(page: Page, cap: string, code: string) {
  await editor(page, cap);
  await page.evaluate(
    ([id, c]) =>
      (
        globalThis as unknown as { __oakStrudel: { editors: Map<string, { setCode(c: string): void }> } }
      ).__oakStrudel.editors
        .get(id as string)
        ?.setCode(c as string),
    [editorId(cap), code],
  );
}

/** Screenshots in Paper and Bark at 1440×900 and 1280×800, then back to Paper at 1440×900. */
export async function shots(page: Page, name: string) {
  for (const m of SCREENSHOT_MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, m.theme);
    await page.waitForTimeout(150);
    await shoot(page, SHOTS, name, m.theme);
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "paper";
  });
  await page.setViewportSize({ width: 1440, height: 900 });
}

export const capstoneDef = (id: string) => {
  const c = capstones.find((x) => x.id === id);
  if (!c) throw new Error(`no capstone ${id}`);
  return c;
};

/** The id of the brief's first rule of a kind (the specs never hard-code the author's ids). */
export function ruleId(
  cap: string,
  kind: string,
  pick: (r: Record<string, unknown>) => boolean = () => true,
) {
  return capstoneDef(cap).brief?.rubric.find((r) => r.rule === kind && pick(r as never))?.id ?? null;
}

/** Rules the grader does not build (a `custom` left from Wave 1): the release cannot be reached until they go. */
export function unbuiltRules(cap: string): string[] {
  return (capstoneDef(cap).brief?.rubric ?? []).filter((r) => r.rule === "custom").map((r) => r.id);
}

export const rule = (page: Page, id: string) => page.locator(`[data-rule="${id}"]`);
