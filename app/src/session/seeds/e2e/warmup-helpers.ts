// Helpers for the warm-up days (w5-warmups.pw.ts, w6-warmups.pw.ts): a real day from a dev seed, Today → Start →
// the session's warm-up, moved to the first item of one family (the items before it reported skipped, as the
// learner's skip would), its trials read from the runner's dev hooks and every record read back from the wire.
import type { DrillTrialRecord, Trial } from "@oak/api";
import { expect, type Page } from "@playwright/test";
import { shoot } from "../../../../../e2e/support/ui.ts";
import { expectNoOverflow, SHOTS, settle } from "./support.ts";

export interface WarmItem {
  id: string;
  kind: string;
  familyId: string | null;
  level: number | null;
  trials: number;
  mic: boolean;
}
type Handle = {
  report(r: unknown): void;
  state(): {
    plan: { kind: string; mapItemId: string | null; warmup: { items: WarmItem[] } } | null;
    session: { id: string } | null;
    warmupIndex: number;
  };
};
export const warmState = (page: Page) =>
  page.evaluate(() => (window as never as { __oakSession: Handle }).__oakSession.state());

/** The drill sets the runner opens (`drills.start`) and every trial record it posts. */
export function wire(page: Page): {
  starts: Record<string, unknown>[];
  trials: Map<number, DrillTrialRecord>;
} {
  const starts: Record<string, unknown>[] = [];
  const trials = new Map<number, DrillTrialRecord>();
  page.on("request", (r) => {
    if (r.method() !== "POST") return;
    if (/\/api\/drills\/sessions$/.test(r.url())) starts.push(r.postDataJSON() as Record<string, unknown>);
    if (/\/api\/drills\/sessions\/[^/]+\/trials$/.test(r.url()))
      for (const t of (r.postDataJSON() as { trials: DrillTrialRecord[] }).trials) trials.set(t.idx, t);
  });
  return { starts, trials };
}

/** Counts every request for the microphone (Quiet mode must never make one). */
export async function countMic(page: Page): Promise<() => number> {
  let asked = 0;
  await page.exposeFunction("__warmMicAsked", () => {
    asked++;
  });
  await page.addInitScript(() => {
    const md = navigator.mediaDevices;
    if (!md) return;
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = (c) => {
      (window as unknown as { __warmMicAsked(): void }).__warmMicAsked();
      return orig(c);
    };
  });
  return () => asked;
}

/** Today → Start (keyboard) → the session's warm-up. */
export async function startDay(page: Page, item: string): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("today-card")).toHaveAttribute("data-state", /.+/, { timeout: 30_000 });
  await expect(page.getByTestId("setlist").locator('[data-row="warmup"]')).toBeVisible();
  await page.locator("main").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/session\/?$/);
  const block = page.getByTestId("session-block");
  const failed = page.getByRole("heading", { name: "Something went wrong" });
  await expect(block.or(failed)).toBeVisible({ timeout: 60_000 });
  if (await failed.isVisible()) await page.reload();
  await expect(block).toContainText("Warm-up", { timeout: 60_000 });
  expect((await warmState(page)).plan?.mapItemId).toBe(item);
}

/**
 * Moves the warm-up to the first item of `familyId` and starts its set. A family's first set is a blocked intro:
 * the listening comes first, ended with Enter. With `hear`, the listening is heard through (focus reaches "Start the
 * set" once every example has played: asserted once per file); otherwise the set starts while it plays, as
 * listening never gates. `shot` names the intro's screenshot (Paper, 1440×900).
 */
export async function toFamily(
  page: Page,
  familyId: string,
  opts: { hear?: boolean; kind?: string; shot?: string } = {},
): Promise<WarmItem> {
  const items = (await warmState(page)).plan?.warmup.items ?? [];
  const at = items.findIndex((i) => i.familyId === familyId);
  expect(
    at,
    `${familyId} in today's warm-up: ${items.map((i) => i.familyId).join(", ")}`,
  ).toBeGreaterThanOrEqual(0);
  await page.evaluate(
    (skip) => {
      const o = (window as never as { __oakSession: Handle }).__oakSession;
      for (const item of skip)
        o.report({
          block: "warmup",
          source: "drills",
          warmupItemId: item.id,
          drillSessionId: null,
          meanCredit: null,
          skipped: true,
        });
    },
    items.slice(0, at),
  );
  const item = items[at] as WarmItem;
  expect(item.kind).toBe(opts.kind ?? "blocked-intro");
  if (item.kind === "blocked-intro") {
    await expect(page.getByTestId("listen-block")).toBeVisible({ timeout: 30_000 });
    const start = page.getByRole("button", { name: /Start the set/ });
    if (opts.hear) await expect(start).toBeFocused({ timeout: 60_000 });
    else await expect(start).toBeEnabled();
    await settle(page);
    await expectNoOverflow(page);
    if (opts.shot) await shoot(page, SHOTS, opts.shot, "paper");
    if (!opts.hear) await start.focus();
    await page.keyboard.press("Enter");
  }
  await expect(page.getByTestId("trial-counter")).toHaveText(/Trial 1 of \d+/, { timeout: 60_000 });
  return item;
}

export async function currentTrial(page: Page): Promise<Trial> {
  return (await page.evaluate(() => (globalThis as { __oakDrillTrial?: unknown }).__oakDrillTrial)) as Trial;
}
export async function trialNo(page: Page, n: number, of: number): Promise<Trial> {
  await expect(page.getByTestId("trial-counter")).toHaveText(`Trial ${n} of ${of}`, { timeout: 30_000 });
  await expect.poll(async () => (await currentTrial(page))?.seed !== undefined).toBe(true);
  return currentTrial(page);
}
export async function totalOf(page: Page): Promise<number> {
  return Number((await page.getByTestId("trial-counter").textContent())?.match(/of (\d+)/)?.[1]);
}

/** A choice trial answered by its number key: the options in the order the trial offers them. */
export async function answerChoice(page: Page, t: Trial, wrong = false): Promise<void> {
  const options = (t.params.options as string[] | undefined) ?? [];
  const want = t.expected.choice?.[0] as string;
  expect(options, `options of ${t.family}`).toContain(want);
  const pick = wrong ? (options.find((o) => o !== want) as string) : want;
  await page.keyboard.press(String(options.indexOf(pick) + 1));
  await expect(page.getByTestId("trial-feedback")).toHaveAttribute("data-correct", wrong ? "false" : "true");
}

/** The set's summary, then on with the session (the next set or the New block). */
export async function finishSet(page: Page, warmupIndexBefore: number, shot: string): Promise<void> {
  const summary = page.getByTestId("set-summary");
  await expect(summary).toBeVisible({ timeout: 30_000 });
  await settle(page);
  await expectNoOverflow(page);
  await shoot(page, SHOTS, shot, "paper");
  await summary.getByRole("button", { name: /Next set|On to the lesson|On to the gym|Continue/ }).click();
  await expect.poll(async () => (await warmState(page)).warmupIndex).toBeGreaterThan(warmupIndexBefore);
}

/** Both themes at both sizes on the trial in view: the next action in view, no horizontal overflow. */
export async function frameMatrix(page: Page, name: string): Promise<void> {
  for (const m of [
    { width: 1440, height: 900, theme: "paper" },
    { width: 1440, height: 900, theme: "bark" },
    { width: 1280, height: 800, theme: "paper" },
    { width: 1280, height: 800, theme: "bark" },
  ] as const) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((theme) => document.documentElement.setAttribute("data-theme", theme), m.theme);
    await expect(page.getByTestId("next-trial")).toBeInViewport();
    await settle(page);
    await expectNoOverflow(page);
    await shoot(page, SHOTS, name, m.theme);
  }
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "paper"));
  await page.setViewportSize({ width: 1440, height: 900 });
}

export async function nextTrial(page: Page): Promise<void> {
  await page.getByTestId("next-trial").focus();
  await page.keyboard.press("Enter");
}
