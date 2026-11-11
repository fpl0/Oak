// Shared steps of the review specs: direct calls to the stack's own server (Origin and X-Oak as the app sends
// them), seeding the learner at a named point, and the screenshot matrix.
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";

export const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));
const HEADERS = { "content-type": "application/json", origin: stack.baseURL, "x-oak": "1" };

export async function api<T>(
  page: Page,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) {
  const res = await page.request.fetch(`${stack.apiURL}/api${path}`, {
    method,
    headers: HEADERS,
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
    timeout: 170_000,
  });
  return { status: res.status(), body: (await res.json().catch(() => null)) as T };
}

/** Wipes the learner and fast-forwards to `point` (server/src/services/dev-seed.ts SEED_POINTS). */
export async function seed(page: Page, point: string): Promise<void> {
  await api(page, "PUT", "/dev/clock", { reset: true });
  const r = await api(page, "POST", "/dev/seed", { point });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
}

export function sketchBody(title: string, code: string, extra: Record<string, unknown> = {}) {
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
  code: string,
  extra: Record<string, unknown> = {},
) {
  const r = await api<{ sketch: { id: string } }>(page, "POST", "/sketches", sketchBody(title, code, extra));
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.sketch.id;
}

/** Screenshots `path` in both themes at 1440×900 and 1280×800 (`ready` waits for the page's content). */
export async function matrix(
  page: Page,
  path: string,
  name: string,
  ready: (page: Page) => Promise<void>,
): Promise<void> {
  for (const m of SCREENSHOT_MATRIX) {
    await useUiPrefs(page, { theme: m.theme, motion: "off" });
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.goto(path);
    await ready(page);
    await shoot(page, SHOTS, name, m.theme);
  }
}

/** No element wider than the viewport: a horizontal scrollbar on the document or on `#main`. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const over = await page.evaluate(() => {
    const main = document.getElementById("main");
    return {
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    };
  });
  expect(over.doc).toBeLessThanOrEqual(0);
  expect(over.main).toBeLessThanOrEqual(0);
}

/**
 * WCAG AA contrast of every visible text run in `#main` and the tutor panel against its effective background
 * (ancestors' backgrounds composited, colours resolved by painting them). Disabled controls and decorative
 * (`aria-hidden`) text are exempt, as WCAG 1.4.3 allows. Returns the failures.
 */
export async function contrastIssues(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const cx = cv.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    const rgba = (c: string): [number, number, number, number] => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = "#000";
      cx.fillStyle = c;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      return [d[0] as number, d[1] as number, d[2] as number, (d[3] as number) / 255];
    };
    const over = (top: number[], under: number[]) =>
      [0, 1, 2].map(
        (i) => (top[i] as number) * (top[3] as number) + (under[i] as number) * (1 - (top[3] as number)),
      );
    const lum = (c: number[]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0] as number) + 0.7152 * f(c[1] as number) + 0.0722 * f(c[2] as number);
    };
    const bgOf = (el: Element | null): number[] => {
      const chain: number[][] = [];
      for (let e = el; e; e = e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c[3] > 0) chain.push(c);
        if (c[3] >= 1) break;
      }
      let acc = [255, 255, 255];
      for (const c of chain.reverse()) acc = over(c, acc);
      return acc;
    };
    const out: string[] = [];
    const roots = [document.getElementById("main"), document.querySelector('[data-testid="tutor-chat"]')];
    for (const root of roots) {
      if (!root) continue;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.textContent ?? "").trim();
        const el = n.parentElement;
        if (!text || !el) continue;
        if (
          el.closest(
            "[aria-hidden=true], [disabled], [aria-disabled=true], svg, .cm-editor, canvas, .sr-only",
          )
        )
          continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || Number(cs.opacity) < 0.1) continue;
        let alpha = 1;
        for (let e: Element | null = el; e; e = e.parentElement) alpha *= Number(getComputedStyle(e).opacity);
        const bg = bgOf(el);
        const fgRaw = rgba(cs.color);
        const fg = over([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * alpha], bg);
        const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x) as [number, number];
        const ratio = (a + 0.05) / (b + 0.05);
        const size = Number.parseFloat(cs.fontSize);
        const bold = Number(cs.fontWeight) >= 700;
        const large = size >= 24 || (bold && size >= 18.66);
        if (ratio < (large ? 3 : 4.5))
          out.push(
            `${ratio.toFixed(2)} "${text.slice(0, 40)}" (${cs.color} on rgb(${bg.map(Math.round).join(",")}), ${size}px)`,
          );
      }
    }
    return [...new Set(out)];
  });
}
