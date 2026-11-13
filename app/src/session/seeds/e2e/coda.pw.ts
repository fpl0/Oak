// The Coda's unlock ceremony and milestone banner on the real stack. The unlocks a session grants come from the
// server's `session.end`; to show every Wave 3 feature tool (degree labels, solfège, the key-signature panel, the
// circle of fifths) and a code tool without playing four lessons, the spec adds them to the real responses of
// `session.end` and `unlocks.list` (route interception), and marks ms.03 reached in `progress.get`.
import { type APIRequestContext, expect, type Page, type Route, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { blockHmr, expectNoOverflow, SHOTS, seed, settle, today } from "./support.ts";

test.describe.configure({ mode: "serial" });

const TOOLS = [
  "tb.feature.degree-labels",
  "tb.feature.keysig",
  "tb.feature.circle",
  "tb.feature.solfege",
  "tb.scale",
] as const;
const unlock = (itemId: string, seen: boolean) => ({
  itemId,
  kind: itemId.startsWith("tb.feature.") ? "feature" : "tool",
  sourceKind: "session-complete",
  sourceId: "e2e",
  unlockedAt: new Date().toISOString(),
  seen,
});

interface Fakes {
  /** The tool the next Coda load treats as not yet seen. */
  show: string | null;
  seen: string[];
  milestone: boolean;
}

async function intercept(page: Page, f: Fakes): Promise<void> {
  const json = async (route: Route) => (await (await route.fetch()).json()) as Record<string, unknown>;
  await page.route(/\/api\/session\/[^/]+\/end$/, async (route) => {
    const body = await json(route);
    body.unlocks = [...(body.unlocks as unknown[]), ...TOOLS.map((id) => unlock(id, false))];
    await route.fulfill({ json: body });
  });
  await page.route(/\/api\/unlocks$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const body = await json(route);
    body.items = [...(body.items as unknown[]), ...TOOLS.map((id) => unlock(id, id !== f.show))];
    await route.fulfill({ json: body });
  });
  await page.route(/\/api\/unlocks\/([^/]+)\/seen$/, async (route) => {
    const id = decodeURIComponent(/\/unlocks\/([^/]+)\/seen$/.exec(route.request().url())?.[1] ?? "");
    if (!(TOOLS as readonly string[]).includes(id)) return route.fallback();
    f.seen.push(id);
    await route.fulfill({ json: { ok: true } });
  });
  await page.route(/\/api\/progress$/, async (route) => {
    const body = await json(route);
    if (f.milestone)
      body.milestones = (body.milestones as { id: string; reachedAt: string | null }[]).map((m) =>
        // Reached in this session: any instant after it started (an earlier cached read must not predate it).
        m.id === "ms.03" ? { ...m, reachedAt: new Date(Date.now() + 3_600_000).toISOString() } : m,
      );
    await route.fulfill({ json: body });
  });
}

const moment = (page: Page) => page.getByTestId("coda-unlock-moment");

/** The ceremony plays and ends by itself inside 8 seconds (contracts §9.3). */
async function playsThrough(page: Page): Promise<void> {
  await expect(moment(page)).toBeVisible({ timeout: 20_000 });
  const t0 = Date.now();
  await expect(moment(page)).toHaveAttribute("data-phase", "done", { timeout: 10_000 });
  expect(Date.now() - t0).toBeLessThanOrEqual(9_000);
}

/** From the "C1 released" seed: a session started from Today and sent straight to its Coda. */
async function toCoda(page: Page, request: APIRequestContext, f: Fakes): Promise<void> {
  await blockHmr(page);
  await intercept(page, f);
  await seed(request, "C1 released");
  await useUiPrefs(page, { theme: "paper" });
  await today(page);
  await page.getByTestId("start-session").click();
  await page.waitForURL(/\/session\/?$/);
  await page.evaluate(() =>
    (window as never as { __oakSession: { runner: { toCoda(): void } } }).__oakSession.runner.toCoda(),
  );
  await page.waitForURL(/\/session\/coda$/);
}

// Split from one 160-second test (Wave 5 test speed): the degree-labels ceremony with Esc, then each showcase in
// both themes and sizes as its own test, every one from the same seed. Each ceremony still plays through in real
// time and is held to its 8 seconds.
test("the unlock ceremony: the feature itself working, Try it and About it, Esc skips, seen once", async ({
  page,
  request,
}) => {
  const f: Fakes = { show: "tb.feature.degree-labels", seen: [], milestone: true };
  await toCoda(page, request, f);

  // The milestone banner: reached in this session, with its words from content.
  await expect(page.getByTestId("coda-milestone")).toContainText("You can now compose a song.", {
    timeout: 20_000,
  });

  // Degree labels: the tool appears, then its labels arrive under the notes as they sound.
  await expect(page.getByTestId("ceremony-tool")).toHaveText(/degree labels/);
  await expect(moment(page)).toHaveAttribute("data-phase", /intro|playing/);
  await playsThrough(page);
  const roll = page.getByTestId("ceremony-roll");
  await expect(roll.locator("[data-lit]")).toHaveCount(7);
  await expect(roll.locator("svg")).toHaveAttribute("aria-label", /1, 3, 5, 3, 4, 2, 1/);
  await expect(page.getByTestId("ceremony-try")).toHaveAttribute(
    "href",
    /\/studio\?try=tb\.feature\.degree-labels/,
  );
  await expect(page.getByTestId("ceremony-about")).toHaveAttribute(
    "href",
    "/toolbox/tb.feature.degree-labels",
  );
  await expect(page.getByTestId("unlock-continue")).toBeFocused();
  await settle(page);
  await expectNoOverflow(page);
  await shoot(page, SHOTS, "coda-ceremony-degrees", "paper");

  // Esc skips: the compact list stays with Try it / About it for every tool, and the tool is marked seen.
  await page.reload();
  await expect(moment(page)).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Escape");
  await expect(moment(page)).toHaveCount(0);
  await expect(page.getByTestId("coda-tools").getByRole("link", { name: "Try it" })).toHaveCount(
    TOOLS.length,
  );
  await expect(page.getByTestId("done-for-today")).toBeFocused();
  expect(f.seen).toContain("tb.feature.degree-labels");
  // Esc skipped the ceremony only: the Coda is still here.
  await expect(page).toHaveURL(/\/session\/coda$/);
});

const SHOWCASES: Record<string, string> = {
  "tb.feature.keysig": "keysig",
  "tb.feature.circle": "circle",
  "tb.feature.solfege": "solfege",
  "tb.scale": "code",
};

for (const [id, name] of Object.entries(SHOWCASES)) {
  test(`the ${name} showcase plays through in both themes at both sizes`, async ({ page, request }) => {
    // The degree ceremony is seen (as after the test above); this tool is the one the Coda shows.
    const f: Fakes = { show: id, seen: [], milestone: true };
    await toCoda(page, request, f);
    for (const m of SCREENSHOT_MATRIX) {
      await page.setViewportSize({ width: m.width, height: m.height });
      await useUiPrefs(page, { theme: m.theme });
      await page.reload();
      await playsThrough(page);
      await settle(page);
      await expectNoOverflow(page);
      await shoot(page, SHOTS, `coda-ceremony-${name}`, m.theme);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    if (id !== "tb.scale") return;
    await expect(page.getByTestId("ceremony-code").locator("mark")).toHaveText(["scale"]);

    // Keyboard: Enter on the focused Continue ends the moment; Enter again is Done for today.
    await page.keyboard.press("Enter");
    await expect(moment(page)).toHaveCount(0);
    await expect(page.getByTestId("done-for-today")).toBeFocused();
    await page.keyboard.press("Enter");
    await page.waitForURL((u) => u.pathname === "/");
  });
}

test("reduced motion: the showcase appears at once, nothing moves longer than 120 ms", async ({
  page,
  request,
}) => {
  await blockHmr(page);
  const f: Fakes = { show: "tb.feature.solfege", seen: [], milestone: false };
  await intercept(page, f);
  await seed(request, "C1 released");
  await useUiPrefs(page, { theme: "bark", motion: "on" });
  await today(page);
  await page.getByTestId("start-session").click();
  await page.waitForURL(/\/session\/?$/);
  await page.evaluate(() =>
    (window as never as { __oakSession: { runner: { toCoda(): void } } }).__oakSession.runner.toCoda(),
  );
  await page.waitForURL(/\/session\/coda$/);
  await expect(moment(page)).toHaveAttribute("data-phase", "playing", { timeout: 20_000 });
  // Every label is there as soon as the demo plays: do re mi fa mi sol mi do.
  await expect(page.getByTestId("ceremony-roll").locator("[data-lit]")).toHaveCount(8);
  await expect(page.getByTestId("ceremony-roll").locator("svg")).toHaveAttribute(
    "aria-label",
    /1 do, 2 re, 3 mi, 4 fa/,
  );
  const longest = await page.evaluate(() =>
    Math.max(
      0,
      ...[...document.querySelectorAll("*")].map((el) => {
        const cs = getComputedStyle(el);
        const ms = (v: string) => (v.endsWith("ms") ? Number.parseFloat(v) : Number.parseFloat(v) * 1000);
        return Math.max(
          ms(cs.animationDuration.split(",")[0] ?? "0s"),
          ms(cs.transitionDuration.split(",")[0] ?? "0s"),
        );
      }),
    ),
  );
  expect(longest).toBeLessThanOrEqual(120);
  await settle(page);
  await shoot(page, SHOTS, "coda-ceremony-reduced", "bark");
  await page.getByTestId("ceremony-skip").click();
  await expect(moment(page)).toHaveCount(0);
});
