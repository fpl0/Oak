// Wave 3 review of the tutor panel: a reply dense with degree, interval, key, note and numeral tokens (every
// chromatic degree, every interval quality, seven sharps and seven flats), mixed into hostile markdown. Each
// token is a chip whose accessible name carries its meaning (colour is never the only carrier), the chips wrap
// inside the panel, text and chips pass WCAG AA in both themes, malformed tokens stay inert text.
import { expect, type Page, type Route, test } from "@playwright/test";
import { PREFS_KEY, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { contrastIssues, SHOTS, seed } from "./support.ts";

const panel = (page: Page) => page.getByTestId("tutor-chat");
const frame = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

async function splice(route: Route, inject: string) {
  const res = await route.fetch();
  const body = await res.text();
  const at = Math.max(body.lastIndexOf("event: done"), body.lastIndexOf("event: error"));
  const head = at >= 0 ? body.slice(0, at) : body;
  await route.fulfill({ status: 200, headers: res.headers(), body: head + inject });
}

const DEGREES = ["1", "b2", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"];
const DENSE = [
  `Every degree: ${DEGREES.map((d) => `[[deg:${d}]]`).join(" ")}, sung as [[deg:me]] and [[deg:♭3]].`,
  "Intervals: [[term:m2]] [[term:M2]] [[term:m3]] [[term:M3]] [[term:P4]] [[term:A4]] [[term:d5]] [[term:P5]] [[term:m6]] [[term:M6]] [[term:m7]] [[term:M7]] [[term:P8]] [[term:perfect-fifth]] [[term:tritone]].",
  "Keys: [[term:c-sharp-major]] has [[term:7-sharps]], [[term:c-flat-major]] has [[term:7-flats]]; [[term:e-flat-major]] sits between.",
  "Notes: [[note:C♯4]] [[note:Db4]] [[note:B#3]] [[note:Fb4]] [[note:A0]] [[note:C8]]; numerals [[rn:I]] [[rn:IV]] [[rn:V7]] [[rn:ii]].",
  "**Bold [[deg:5]]**, _italic [[deg:b7]]_, `[[deg:3]]` in code, [link [[deg:1]]](javascript:alert(1)), [[deg:[[deg:1]]]], [[deg:b9]], [[deg:]], [[term:<img src=x onerror=alert(1)>]], [[note:H4]].",
  `${"[[deg:5]]".repeat(80)}`,
].join("\n\n");

test.describe.configure({ mode: "serial" });
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await seed(page, "after U03.CP");
  await page.close();
});

async function ask(page: Page, theme: "paper" | "bark", w: number, h: number) {
  await useUiPrefs(page, { theme, motion: "off" });
  await page.addInitScript((key) => {
    const cur = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...cur, tutorOpen: true }));
  }, PREFS_KEY);
  await page.setViewportSize({ width: w, height: h });
  await page.goto("/studio");
  await expect(page.getByTestId("tutor-status")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await page.route("**/api/tutor/chat", (r) => splice(r, frame("text", { delta: `\n\n${DENSE}` })));
  const box = panel(page).getByTestId("composer");
  await box.fill("What do the degrees and intervals of C sharp major look like?");
  await box.press("Enter");
  const msg = panel(page).getByTestId("tutor-message").filter({ hasText: "Every degree" }).last();
  await expect(msg).toBeVisible({ timeout: 30_000 });
  return msg;
}

test("a reply dense with degree and interval tokens: chips that say what they mean, inert junk", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => {
    errors.push(`dialog: ${d.message()}`);
    void d.dismiss();
  });
  const msg = await ask(page, "paper", 1440, 900);
  // The fake tutor's own answer comes first; the spliced paragraph starts at "Every degree".
  const degs = msg.locator("p", { hasText: "Every degree" }).locator('[data-token="deg"]');
  await expect(degs).toHaveCount(14);
  // Each of the twelve degrees is named in words or with its accidental, not only by colour.
  const names = await degs.evaluateAll((els) =>
    els.slice(0, 14).map((e) => e.getAttribute("aria-label") ?? ""),
  );
  for (const [i, d] of DEGREES.entries()) {
    const words = d.startsWith("b")
      ? `degree flat ${d[1]}`
      : d.startsWith("#")
        ? `degree sharp ${d[1]}`
        : `degree ${d}`;
    expect(names[i], d).toMatch(new RegExp(`^${words},`));
  }
  const texts = await degs.evaluateAll((els) => els.slice(0, 12).map((e) => (e.textContent ?? "").trim()));
  for (const [i, d] of DEGREES.entries())
    expect(texts[i], d).toContain(d.replace("b", "♭").replace("#", "♯"));
  // The flattened third written three ways is the same chip.
  expect(names[12]).toBe(names[3]);
  expect(names[13]).toBe(names[3]);
  // A token inside inline code is code, not a chip; the javascript: link keeps its text and loses its target.
  await expect(msg.locator("code", { hasText: "[[deg:3]]" })).toHaveCount(1);
  // Malformed tokens and the javascript: link stay inert.
  expect(await panel(page).locator("img, iframe, script").count()).toBe(0);
  const hrefs = await panel(page)
    .locator("a[href]")
    .evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  for (const h of hrefs) expect(h).toMatch(/^\/(?!\/)/);
  await expect(msg).toContainText("[[deg:b9]]");
  // Intervals in Oak's short names are chips whatever their quality's case (M3 is major, m3 minor).
  const ivs = msg.locator("p", { hasText: "Intervals:" }).locator('[data-token="term"]');
  const ivNames = await ivs.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(ivNames.slice(0, 13)).toEqual([
    "interval minor 2nd",
    "interval major 2nd",
    "interval minor 3rd",
    "interval major 3rd",
    "interval perfect 4th",
    "interval augmented 4th",
    "interval diminished 5th",
    "interval perfect 5th",
    "interval minor 6th",
    "interval major 6th",
    "interval minor 7th",
    "interval major 7th",
    "interval octave",
  ]);
  await expect(msg.locator("p", { hasText: "Intervals:" })).not.toContainText("[[term:");
  // The 80 chips in a row wrap inside the panel: nothing wider than the panel.
  const over = await panel(page).evaluate((p) => {
    const box = p.getBoundingClientRect();
    return [...p.querySelectorAll("[data-token]")].filter(
      (c) => c.getBoundingClientRect().right > box.right + 1,
    ).length;
  });
  expect(over).toBe(0);
  expect(await contrastIssues(page)).toEqual([]);
  expect(errors).toEqual([]);
  await msg.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/w3-tutor-tokens-paper-1440x900.png` });
});

test("the dense reply in Bark and at 1280×800: contrast holds, chips wrap", async ({ page }) => {
  test.setTimeout(180_000);
  for (const [w, h] of [
    [1440, 900],
    [1280, 800],
  ] as const) {
    const msg = await ask(page, "bark", w, h);
    await msg.scrollIntoViewIfNeeded();
    expect(await contrastIssues(page)).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/w3-tutor-tokens-bark-${w}x${h}.png` });
  }
  const msg = await ask(page, "paper", 1280, 800);
  await msg.scrollIntoViewIfNeeded();
  expect(await contrastIssues(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/w3-tutor-tokens-paper-1280x800.png` });
});
