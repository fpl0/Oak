// Helpers for the session specs: the server's movable clock, API calls as the browser makes them, test-only
// seeding (./server.ts), screenshots and the overflow check.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { stack } from "./playwright.config.ts";

export const SHOTS = join(import.meta.dirname, "screenshots");
const HEADERS = { "x-oak": "1", origin: stack.apiURL, "content-type": "application/json" };

/** Moves the server's clock `days` (and `hours`) from real now. The app reads the day from the server. */
export function travel(days: number, hours = 0): void {
  writeFileSync(
    join(stack.dataDir, "clock.json"),
    JSON.stringify({ offsetMs: (days * 24 + hours) * 3_600_000 }),
  );
}

export async function api<T = unknown>(
  request: APIRequestContext,
  method: "GET" | "PUT" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await request.fetch(`${stack.apiURL}${path}`, {
    method,
    headers: HEADERS,
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
  });
  if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const serverNow = (request: APIRequestContext) =>
  api<{ now: string; day: string }>(request, "POST", "/__e2e/now", {});

/** The Monday of `day`'s week (weeks run Monday to Monday, contracts §7.8). */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Whole days from `a` to `b`. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** No horizontal page scroll: neither the document nor the shell's scrolling <main>. */
export async function expectNoOverflow(page: Page): Promise<void> {
  const o = await page.evaluate(() => {
    const main = document.getElementById("main");
    return {
      doc: document.documentElement.scrollWidth - window.innerWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    };
  });
  expect(o.doc, "document overflows horizontally").toBeLessThanOrEqual(1);
  expect(o.main, "<main> overflows horizontally").toBeLessThanOrEqual(1);
}

/** Lets fades finish and fonts settle before a screenshot. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}
