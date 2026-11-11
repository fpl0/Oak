import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext, Page } from "@playwright/test";

export const RESULTS_DIR = join(import.meta.dirname, "../results");

/** Persist raw measurements so FINDINGS.md can quote real output. */
export function saveResult(name: string, data: unknown) {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(join(RESULTS_DIR, `${name}.json`), `${JSON.stringify(data, (_k, v) => (v === Number.NEGATIVE_INFINITY ? "-Infinity" : v), 2)}\n`);
  console.log(`\n[${name}] ${JSON.stringify(data, (_k, v) => (v === Number.NEGATIVE_INFINITY ? "-Infinity" : v))}`);
}

export interface NetLog {
  local: string[];
  external: string[];
  failed: string[];
}

const isLocal = (url: URL) => ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);

/**
 * Record every http(s) request and ABORT anything that is not localhost, so a passing test proves the page
 * works with third-party hosts unreachable.
 */
export async function guardNetwork(context: BrowserContext, options: { delaySoundsMs?: number } = {}): Promise<NetLog> {
  const log: NetLog = { local: [], external: [], failed: [] };
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol !== "http:" && url.protocol !== "https:") return route.continue();
    if (!isLocal(url)) {
      log.external.push(url.href);
      return route.abort("blockedbyclient");
    }
    log.local.push(url.pathname);
    if (options.delaySoundsMs && url.pathname.startsWith("/sounds/") && !url.pathname.endsWith(".json")) {
      await new Promise((r) => setTimeout(r, options.delaySoundsMs));
    }
    return route.continue();
  });
  context.on("requestfailed", (req) => log.failed.push(`${req.url()} ${req.failure()?.errorText}`));
  return log;
}

export async function openLab(page: Page, options: { serviceWorker?: boolean } = {}) {
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`console.error: ${msg.text()}`);
  });
  await page.goto("/");
  await page.waitForFunction(() => !!window.oak);
  const boot = await page.evaluate((o) => window.oak.boot(o), options);
  return { boot, consoleErrors };
}

export const sounds = (log: NetLog) => log.local.filter((p) => p.startsWith("/sounds/"));
