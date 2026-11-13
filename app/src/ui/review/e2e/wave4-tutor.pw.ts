// Wave 4 review of the tutor panel over a song with chords: a turn and a review full of chord and numeral tokens
// (spelled every way a model might: C#m7, Cb, Bbm7b5, V65/V, bVII, viiø7, i64), mixed with hostile markdown,
// hostile HTML and tokens that try to break out (`[[chord:<img …>]]`, `[[rn:javascript:…]]`, bars past the end,
// bars backwards). The server's fake tutor answers; the hostile frames are spliced into its real SSE stream, so
// the client parses exactly what a misbehaving model could send. Checked: nothing runs or loads, every chip shows
// theory's spelling, a chord chip lights the bars the Studio's chord band has that chord in, a bar link past the
// end lights nothing and breaks nothing, the panel never scrolls sideways, AA contrast in both themes.
import { expect, type Page, type Route, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../../e2e/support/stack.ts";
import { PREFS_KEY, shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { contrastIssues, createSketch, SHOTS, seed } from "./support.ts";

const panel = (page: Page) => page.getByTestId("tutor-chat");
const spliced = (page: Page) =>
  panel(page).locator('[data-testid="tutor-message"][data-status="error"]').last();
const frame = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

async function splice(route: Route, inject: string) {
  const res = await route.fetch();
  const body = await res.text();
  const at = Math.max(body.lastIndexOf("event: done"), body.lastIndexOf("event: error"));
  await route.fulfill({
    status: 200,
    headers: res.headers(),
    body: (at >= 0 ? body.slice(0, at) : body) + inject,
  });
}

/** I V vi IV in G, twice: G D Em C (checked against the chord band below). */
const SONG = [
  "setcpm(90/4)",
  "",
  'chords: n("<[0,2,4] [4,6,8] [5,7,9] [3,5,7]>").scale("G3:major").s("piano")',
  'mel: n("<[4 2] [4 1] [2 0] [5 3]>").scale("G4:major").s("piano")',
].join("\n");

const TOKENS = [
  "The loop is [[rn:I]] [[rn:V]] [[rn:vi]] [[rn:IV]]: [[chord:G]] [[chord:D]] [[chord:Em]] [[chord:C]].",
  "Spellings a model might use: [[chord:C#m7]] [[chord:Cb]] [[chord:Bbm7b5]] [[chord:F#o7]] [[chord:G/B]]",
  "and numerals [[rn:V65/V]] [[rn:bVII]] [[rn:viih7]] [[rn:i64]] [[rn:#ivo7]].",
  "Bars [[bars:1-2]], [[bars:3-4]], [[bars:7-999]], [[bars:4-2]], [[bars:0-0]].",
].join(" ");

const HOSTILE = [
  '[[chord:<img src=x onerror="window.__pwned=1">]] [[rn:javascript:window.__pwned=2]] [[bars:1-2"><script>window.__pwned=3</script>]]',
  `[[chord:${"C".repeat(200)}]] [[rn:${"V".repeat(80)}]]`,
  '<a href="javascript:window.__pwned=4">x</a> [y](javascript:window.__pwned=5) ![z](https://evil.example/p.png)',
  `${"**".repeat(300)}${"[[chord:Am]] ".repeat(120)}`,
  "| a | b |\n|---|---|\n| [[rn:ii]] | [[chord:Am7]] |",
  "```\n[[chord:C]] inside code stays text\n```",
].join("\n\n");

const REVIEW = {
  reviewKind: "capstone",
  review: {
    strengths: [
      {
        text: "The [[rn:V]] in [[bars:2-2]] pulls home to [[rn:vi]]: [[chord:D]] to [[chord:Em]].",
        bars: [2, 3],
      },
      { text: '<img src=x onerror="window.__pwned=6"> [[chord:C]] lands on [[deg:5]].', bars: [4, 4] },
    ],
    revisions: [
      {
        title: "Try [[rn:ii]] before [[rn:V]] <script>window.__pwned=7</script>",
        bars: [3, 4],
        why: "A [[rn:ii]]–[[rn:V]]–[[rn:I]] ([[chord:Am]] [[chord:D]] [[chord:G]]) sets up home. ".repeat(6),
        tryCode: 'chords: n("<[0,2,4] [1,3,5] [4,6,8] [0,2,4]>").scale("G3:major").s("piano")',
        skills: ["H03"],
      },
    ],
    listeningQuestion: "Can you hear [[rn:IV]] in [[bars:4-4]] lean back to [[rn:I]]?",
    linerNote: "Four chords, [[rn:I]] [[rn:V]] [[rn:vi]] [[rn:IV]], with a tune on [[deg:5]].",
  },
};

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});
test.use({ serviceWorkers: "block" });

let sketchId = "";
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await seed(page, "C2 open");
  sketchId = await createSketch(page, "Four chords in G", SONG);
  await page.close();
});

async function open(page: Page, theme: "paper" | "bark", size = { width: 1440, height: 900 }) {
  await page.setViewportSize(size);
  await useUiPrefs(page, { theme, motion: "off" });
  await page.addInitScript(
    ([key, sid]) => {
      const cur = JSON.parse(localStorage.getItem(key as string) || "{}");
      localStorage.setItem(key as string, JSON.stringify({ ...cur, tutorOpen: true }));
      localStorage.setItem(`oak.studio.length.${sid}`, "4");
    },
    [PREFS_KEY, sketchId],
  );
  await page.goto(`/studio/${sketchId}`);
  await expect(page.locator("[data-testid=workbench][data-analysis=ready]")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("tutor-status")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
}

async function ask(page: Page) {
  await page.route("**/api/tutor/chat", (r) =>
    splice(r, frame("text", { delta: `\n\n${TOKENS}\n\n${HOSTILE}` }) + frame("review", REVIEW)),
  );
  const box = panel(page).getByTestId("composer");
  await box.fill("How do my chords work?");
  await box.press("Enter");
  const msg = spliced(page);
  await expect(msg).toBeVisible({ timeout: 30_000 });
  return msg;
}

test("chord and numeral tokens, hostile markdown and a hostile review: inert, spelled by theory, linked to the bars", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "paper");
  const msg = await ask(page);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(await panel(page).locator("img, iframe, script, object, embed").count()).toBe(0);
  for (const h of await panel(page)
    .locator("a[href]")
    .evaluateAll((as) => as.map((a) => a.getAttribute("href"))))
    expect(h).toMatch(/^\/(?!\/)/);
  // Chips show theory's spelling (♯ ♭ °, ø), never the model's ASCII.
  const chips = msg.locator("[data-token]");
  const labels = await chips.evaluateAll((els) =>
    els.map((e) => `${e.getAttribute("data-token")}:${(e.textContent ?? "").trim()}`),
  );
  const has = (re: RegExp) => labels.some((l) => re.test(l));
  for (const re of [
    /^chord:C♯m7/,
    /^chord:C♭/,
    /^chord:B♭m7♭5|^chord:B♭ø7/,
    /^rn:♭VII/,
    /^rn:viiø7/,
    /^rn:♯iv°7/,
  ])
    expect(has(re), `${re} in ${labels.join(" | ")}`).toBe(true);
  for (const l of labels)
    expect(l, "ASCII spelling leaked into a chip").not.toMatch(
      /^(chord|rn):.*((?<=[A-G])#|(?<=[A-G])b(?![a-z]))/,
    );
  // A slash chord (outside the token grammar) reads as its text, never as raw brackets.
  await expect(msg).toContainText("G/B");
  await expect(msg).not.toContainText("[[chord:G/B]]");
  // A backwards range says the bars it lights.
  expect(labels).toContain("bars:bars 2–4");
  // Out-of-grammar tokens stay text (no chip for 200 Cs, a script or an img).
  expect(labels.some((l) => l.includes("CCCCCCCC") || l.includes("<"))).toBe(false);
  await expect(msg).toContainText("inside code stays text");
  // A chord chip lights the bars that chord sounds in on the Studio's chord band: D is bar 2.
  const band = await page
    .locator("[data-testid=chord-band] li.oak-chord-region")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-symbol")));
  expect(band).toEqual(["G", "D", "Em", "C"]);
  const chip = (sym: string) =>
    msg.locator('[data-token="chord"]', { hasText: new RegExp(`^${sym}$`) }).first();
  await expect(chip("G")).toHaveAttribute("data-bars", "1");
  await expect(chip("D")).toHaveAttribute("data-bars", "2");
  await expect(chip("Em")).toHaveAttribute("data-bars", "3");
  await expect(chip("C")).toHaveAttribute("data-bars", "4");
  await expect(msg.locator('[data-token="rn"]', { hasText: /^vi$/ }).first()).toHaveAttribute(
    "data-bars",
    "3",
  );
  // Not in the song: it only plays.
  await expect(chip("C♯m7")).not.toHaveAttribute("data-bars", /.+/);
  await chip("D").click();
  await expect
    .poll(() => page.locator(".oak-staff-host .oak-hover").count(), { timeout: 5_000 })
    .toBeGreaterThan(0);
  const lit = await page.evaluate(() =>
    [...document.querySelectorAll(".oak-staff-host .oak-hover")].map(
      (n) => n.getAttribute("aria-label") ?? "",
    ),
  );
  for (const l of lit) expect(l, "D lights bar 2 only").toMatch(/bar 2,/);
  // Bars past the end and backwards: focusing them throws nothing.
  for (const t of await msg.locator('[data-token="bars"]').all()) {
    await t.focus();
    await page.keyboard.press("Enter");
  }
  // The review: rendered as a card, its HTML inert, its tokens chips.
  const review = msg.getByTestId("review");
  await expect(review).toBeVisible();
  await expect(review).toContainText("<script>");
  expect(await review.locator('[data-token="rn"]').count()).toBeGreaterThan(5);
  // Every token in the review is a chip, the revision's title and its Try card included.
  await expect(review).not.toContainText("[[");
  const revision = review.getByTestId("review-revisions").locator("li").first();
  expect(await revision.locator('[data-token="rn"]').count()).toBeGreaterThanOrEqual(2);
  // A long unbroken word in a title wraps inside the card instead of running out of it.
  const fits = await revision.evaluate((li) => {
    const box = li.getBoundingClientRect();
    return [...li.querySelectorAll("*")].every((e) => e.getBoundingClientRect().right <= box.right + 1);
  });
  expect(fits).toBe(true);
  // The panel never scrolls sideways, whatever the text.
  const over = await panel(page).evaluate((el) => {
    const out: string[] = [];
    for (const e of el.querySelectorAll<HTMLElement>("*"))
      if (
        e.scrollWidth > e.clientWidth + 1 &&
        getComputedStyle(e).overflowX === "visible" &&
        e.clientWidth > 0
      )
        out.push(`${e.tagName}.${e.className}`.slice(0, 80));
    return { panel: el.scrollWidth - el.clientWidth, out: out.slice(0, 5) };
  });
  expect(over.panel, JSON.stringify(over.out)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("the same turn in both themes at both sizes: AA contrast, screenshots", async ({ page }) => {
  test.setTimeout(240_000);
  for (const m of SCREENSHOT_MATRIX) {
    await open(page, m.theme, { width: m.width, height: m.height });
    const msg = await ask(page);
    await msg.getByTestId("review").scrollIntoViewIfNeeded();
    expect(await contrastIssues(page), `${m.theme} ${m.width}`).toEqual([]);
    await shoot(page, SHOTS, "w4-tutor-tokens", m.theme);
    await page.unroute("**/api/tutor/chat");
  }
});
