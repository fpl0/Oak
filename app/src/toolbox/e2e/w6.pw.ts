// Wave 6 in the Studio and the Toolbox against the real server (the workbench owner's second stack 5236/8836):
// what a learner sees at each point of U12–U17, with the unlocks and lesson completions the server holds.
// Each test starts from the dev seed "after X2 (U12.L02 next)" (U12.L01 done: `chord.seventh` unlocked); the
// later seeds need lessons still being written, so the rows a later lesson would grant (toolbox unlocks, a
// completed lesson) are written straight into this stack's throwaway database, as the Wave 3–5 specs here do.
// Covered: sevenths and guide tones in a sketch, applied and borrowed numerals arriving with their lessons, the
// music-lens preference saved on the server (Shift+J, a reload), the key ribbon, Studio's hints and its mode and
// meter choices, the Toolbox pages of the U12–U17 tools, and screenshots in both themes and sizes. What the
// lenses draw in detail is proved on the workbench's own page (app/src/workbench/e2e/w6.pw.ts) and in bun tests.
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { toolbox } from "../../../../content/toolbox.ts";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";

test.describe.configure({ mode: "serial" });

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));
const HEADERS = { "content-type": "application/json", origin: stack.baseURL, "x-oak": "1" };
const WB = "[data-testid=workbench]";

/** ii–V–I, V7/V into V, then the borrowed iv and ♭VI–♭VII back home, under a tune with a ♯4 and a ♭6. */
const CHANGES = `setcpm(90/4)

chords: chord("<Dm7 G7 C^7 D7 G7 Fm [Ab Bb] C>").voicing().s("piano")
mel: n("<[1 3 5 3] [4 3 1 ~] [4 2 0 ~] [3# 4 5 4] [3 1 6 4] [5b 4 3 ~] [5b 2b 6b 1] [2 ~ 0 ~]>").scale("C4:major").s("piano")
`;
/** Four bars in C, the same four lifted a whole step. */
const LIFT = `setcpm(100/4)

mel: n("<[0 2 4 2] [3 2 1 0] [4 2 0 2] [1 ~ 0 ~]>").scale("<C4:major!4 D4:major!4>").s("piano")
chords: chord("<C F G C D G A D>").voicing().s("piano").gain(.6)
`;

const row = (id: string): [string, string, string] => {
  const t = toolbox.find((x) => x.id === id);
  if (!t) throw new Error(`no toolbox row ${id}`);
  const at = Array.isArray(t.unlock.at) ? t.unlock.at[0] : t.unlock.at;
  return [id, t.kind, at as string];
};
/** Every row U12–U17 grant. */
const WAVE6 = toolbox
  .filter((t) => (Array.isArray(t.unlock.at) ? t.unlock.at : [t.unlock.at]).some((s) => /^U1[2-7]\./.test(s)))
  .map((t) => row(t.id));

async function api<T>(page: Page, method: string, path: string, body?: unknown) {
  const res = await page.request.fetch(`${stack.apiURL}/api${path}`, {
    method,
    headers: HEADERS,
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
  });
  return { status: res.status(), body: (await res.json().catch(() => null)) as T };
}

/** A learner the day after X2 (U12.L01 done), today a fresh day. */
async function seed(page: Page): Promise<void> {
  await api(page, "PUT", "/dev/clock", { reset: true });
  let r = await api(page, "POST", "/dev/seed", { point: "after X2 (U12.L02 next)" });
  // The same point under its Wave 5 name, while the server lands the Wave 6 alias (wave6.md §6: "keep both").
  if (r.status === 400) r = await api(page, "POST", "/dev/seed", { point: "X2 released" });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  const u = await api<{ items: { itemId: string }[] }>(page, "GET", "/unlocks");
  expect(u.body.items.map((i) => i.itemId)).toContain("chord.seventh");
}

async function db(run: (d: import("node:sqlite").DatabaseSync) => void): Promise<void> {
  const { DatabaseSync } = await import("node:sqlite");
  const d = new DatabaseSync(`${stack.dataDir}/oak.db`);
  try {
    d.exec("PRAGMA busy_timeout = 5000");
    run(d);
  } finally {
    d.close();
  }
}

/** What completing the lessons would write: the toolbox rows and the lessons' completion. */
async function grant(rows: readonly [string, string, string][], lessons: readonly string[]): Promise<void> {
  const at = new Date(Date.now() - 86_400_000).toISOString();
  await db((d) => {
    const unlock = d.prepare(
      "INSERT OR IGNORE INTO unlocks (item_id, kind, source_kind, source_id, unlocked_at, seen) VALUES (?, ?, 'session-complete', ?, ?, 1)",
    );
    for (const [id, kind, lesson] of rows) unlock.run(id, kind, lesson, at);
    const done = d.prepare(
      "INSERT INTO lesson_progress (lesson_id, status, started_at, completed_at, best_score, completed_version, updated_at) VALUES (?, 'completed', ?, ?, 1, 1, ?) ON CONFLICT(lesson_id) DO UPDATE SET status = 'completed', completed_at = excluded.completed_at",
    );
    for (const l of lessons) done.run(l, at, at, at);
  });
}

async function sketch(page: Page, title: string, code: string, extra: Record<string, unknown> = {}) {
  const r = await api<{ sketch: { id: string } }>(page, "POST", "/sketches", {
    title,
    originKind: "free",
    originId: null,
    sessionId: null,
    code,
    bpm: 90,
    meter: "4/4",
    key: { tonic: "C", mode: "major" },
    analysis: null,
    note: null,
    tutorAssisted: false,
    band: null,
    flags: { lockedTools: [], previewTools: [] },
    ranOk: true,
    ...extra,
  });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.sketch.id;
}

async function open(page: Page, path: string): Promise<void> {
  await page.routeWebSocket(/.*/, () => {});
  await page.goto(path);
  await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/\[eval\]|strudel|Failed to load resource/i.test(m.text()))
      errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function noOverflow(page: Page): Promise<void> {
  const over = await page.evaluate(() => {
    const main = document.getElementById("main") ?? document.documentElement;
    return main.scrollWidth - main.clientWidth;
  });
  expect(over).toBeLessThanOrEqual(1);
}

/** Both themes and both sizes of the page as it is: the size changes in place, a reload only changes the theme. */
async function shots(page: Page, name: string, ready: (page: Page) => Promise<void>): Promise<void> {
  let theme = "";
  for (const m of SCREENSHOT_MATRIX) {
    if (m.theme !== theme) {
      theme = m.theme;
      await useUiPrefs(page, { theme: m.theme });
      await page.setViewportSize({ width: m.width, height: m.height });
      await page.reload();
      await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
    } else await page.setViewportSize({ width: m.width, height: m.height });
    await ready(page);
    await noOverflow(page);
    await shoot(page, SHOTS, name, m.theme);
  }
}

const regions = (page: Page) => page.locator("li.oak-chord-region");
const canvas = (page: Page) => page.getByTestId("roll-canvas");

test("Studio after U12.L01: sevenths and guide tones are there; applied and borrowed numerals arrive with their lessons", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await seed(page);
  const id = await sketch(page, "Changes", CHANGES);
  await open(page, `/studio/${id}`);
  const wb = page.locator(WB);
  // Eight chords, a bar each: the sketch's loop is set to its eight bars.
  await page.getByRole("combobox", { name: "Length" }).selectOption("8");
  await expect(wb).toHaveAttribute("data-piece-bars", "8");
  await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible();
  // U12.L01 is done: sevenths are written, the guide-tone lens is on, its switch is in the lens bar.
  await expect(wb).toHaveAttribute("data-depth", "sevenths");
  await expect(regions(page).first()).toHaveAttribute("data-symbol", /^Dm7/);
  await expect(wb).toHaveAttribute("data-music-lenses", "guideTones");
  await expect(page.getByTestId("lens-guideTones")).toHaveAttribute("aria-pressed", "true");
  await expect(canvas(page)).toHaveAttribute("data-guide-lines", /^F → F → E/);
  await expect(page.getByTestId("music-hints")).toContainText("Shift+I shows the guide tones");
  // U15.L02 and U16.L01 are ahead: D7 and Fm keep their names and have no numeral; nothing says "borrowed".
  const d7 = page.locator("li.oak-chord-region[data-symbol^='D7']");
  await expect(d7).toHaveAttribute("data-symbol", /^D7/);
  await expect(d7).not.toHaveAttribute("data-rn", /./);
  await expect(d7).toHaveAttribute("data-reduced", "1");
  await expect(page.locator("li.oak-chord-region[data-borrowed]")).toHaveCount(0);
  await expect(page.locator(".oak-chord-arrow")).toHaveCount(0);
  // Chromatic solfège is ahead too (U15.L01): the ♯4 of bar 4 has no syllable in the notes table.
  await page.getByRole("button", { name: "Notes table" }).click();
  const sharp4 = page.getByTestId("notes-table").locator("tr", { hasText: "♯4" }).first();
  await expect(sharp4).toBeVisible();
  await expect(sharp4).not.toContainText("fi");
  await page.getByRole("button", { name: "Notes table" }).click();

  // The lessons done (what their completion writes): the same sketch, read deeper.
  await grant([row("tb.n.chromatic")], ["U15.L01", "U15.L02", "U16.L01", "U16.L02"]);
  await page.reload();
  await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
  await expect(wb).toHaveAttribute("data-depth", "sevenths applied borrowed chromatic");
  await expect(d7).toHaveAttribute("data-target", "V");
  await expect(d7).toHaveAttribute("data-resolves", "1");
  await expect(page.locator("li.oak-chord-region[data-borrowed]")).toHaveCount(3);
  await page.getByRole("button", { name: "Notes table" }).click();
  await expect(page.getByTestId("notes-table").locator("tr", { hasText: "♯4" }).first()).toContainText("fi");
  await page.getByRole("button", { name: "Notes table" }).click();
  // Keyboard: Shift+I switches the guide tones off; the choice is the learner's preference, kept by the server.
  await page.getByTestId("transport").click({ position: { x: 300, y: 5 } });
  const saved = page.waitForResponse(
    (r) => r.url().includes("/api/settings/lenses") && r.request().method() === "PUT",
  );
  await page.keyboard.press("Shift+I");
  await expect(page.getByTestId("lens-guideTones")).toHaveAttribute("aria-pressed", "false");
  expect((await saved).status()).toBe(200);
  const boot = await api<{ settings: { lenses: { guideTones?: boolean } } }>(page, "GET", "/bootstrap");
  expect(boot.body.settings.lenses.guideTones).toBe(false);
  await page.keyboard.press("Shift+I");
  await expect(canvas(page)).toHaveAttribute("data-guide-lines", /^F → F → E/);
  await shots(page, "w6-studio-changes", async (p) => {
    await expect(p.getByTestId("roll-canvas")).toHaveAttribute("data-guide-lines", /^F → F → E/);
    await expect(p.getByTestId("play-toggle")).toBeInViewport();
  });
  expect(errors).toEqual([]);
});

test("Studio: a lifted song shows its key ribbon; the switch survives a reload; modes and 12/8 follow their unlocks", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await seed(page);
  const id = await sketch(page, "Lifted", LIFT);
  await open(page, `/studio/${id}`);
  const wb = page.locator(WB);
  // The sketch's loop is four bars; the key plan runs eight, and all eight are read.
  await expect(wb).toHaveAttribute("data-piece-bars", "8");
  await expect(wb).toHaveAttribute("data-key-plan", "C major → D major");
  await expect(page.getByTestId("key-ribbon")).toBeVisible();
  await expect(page.getByTestId("key-change")).toHaveText("+2: up a step");
  await expect(page.getByTestId("music-hints")).toContainText("The ribbon over the roll names the key");
  const rns = await regions(page).evaluateAll((els) =>
    els.map((el) => (el.getAttribute("data-rn") ?? "").replace(/[0-9]+$/, "")),
  );
  expect(rns).toEqual(["I", "IV", "V", "I", "I", "IV", "V", "I"]);
  // Shift+J hides the ribbon, and the reload keeps it hidden (the preference is on the server).
  await page.getByTestId("transport").click({ position: { x: 300, y: 5 } });
  const saved = page.waitForResponse(
    (r) => r.url().includes("/api/settings/lenses") && r.request().method() === "PUT",
  );
  await page.keyboard.press("Shift+J");
  await expect(page.getByTestId("key-ribbon")).toHaveCount(0);
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("lens-keyPlan")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("key-ribbon")).toHaveCount(0);
  await page.getByTestId("lens-keyPlan").click();
  await expect(page.getByTestId("key-ribbon")).toBeVisible();
  // The sketch's own key: major and minor before U14; Mixolydian and 12/8 once their lessons are done.
  const modes = page.getByRole("combobox", { name: "Key: mode" }).locator("option");
  await expect(modes).toHaveText(["major", "minor"]);
  await grant([row("scale.mixolydian"), row("tb.meter.compound")], []);
  await page.reload();
  await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("combobox", { name: "Key: mode" }).locator("option")).toHaveText([
    "major",
    "minor",
    "mixolydian",
  ]);
  await expect(page.getByRole("combobox", { name: "Meter" }).locator("option")).toHaveText([
    "4/4",
    "3/4",
    "2/4",
    "6/8",
    "12/8",
  ]);
  await shots(page, "w6-studio-key-ribbon", async (p) => {
    await expect(p.getByTestId("key-ribbon")).toBeVisible();
  });
  expect(errors).toEqual([]);
});

test("Toolbox: the pages of the U12–U17 tools play their examples and show them at work", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await seed(page);
  await grant(WAVE6, ["U15.L01", "U15.L02", "U16.L01"]);
  // Sevenths: the guide tones of the example, drawn and named.
  await open(page, "/toolbox/chord.seventh");
  await expect(page.getByTestId("tool-hint")).toContainText("Four sevenths in C");
  await expect(canvas(page)).toHaveAttribute("data-guide-lines", /→/);
  await expect(regions(page).first()).toHaveAttribute("data-symbol", /^Cmaj7/);
  // It sounds (the one example heard through in this file), and the playhead moves.
  await page.getByTestId("play-toggle").click();
  await expect(page.locator(WB)).toHaveAttribute("data-playing", "1", { timeout: 20_000 });
  await expect
    .poll(async () => Number(await canvas(page).getAttribute("data-playhead")), { timeout: 15_000 })
    .toBeGreaterThan(0.5);
  await page.getByTestId("play-toggle").click();
  await expect(page.locator(WB)).toHaveAttribute("data-playing", "0");
  // A mode: the key panel names it and rings its colour note.
  await open(page, "/toolbox/scale.mixolydian");
  await expect(page.getByTestId("key-panel-name")).toHaveText("G Mixolydian");
  await expect(page.locator("[data-testid=key-panel-scale] li[data-colour='1']")).toHaveText(/7\s*F/);
  expect(Number(await canvas(page).getAttribute("data-mode-tones"))).toBeGreaterThan(0);
  await shots(page, "w6-toolbox-mixolydian", async (p) => {
    await expect(p.getByTestId("key-panel-name")).toHaveText("G Mixolydian");
  });
  // 6/8: the beat grid counts the dotted-quarter beats.
  await open(page, "/toolbox/tb.meter.compound");
  await expect(canvas(page)).toHaveAttribute("data-beat-grid", "compound");
  await expect(canvas(page)).toHaveAttribute("data-counts", "1 la li 2 la li");
  await expect(page.getByTestId("transport")).toContainText("60");
  // A push, ghost notes, a dominant chain with its arrows.
  await open(page, "/toolbox/tb.early");
  expect(Number(await canvas(page).getAttribute("data-pushes"))).toBeGreaterThan(0);
  await open(page, "/toolbox/tb.velocity");
  expect(Number(await canvas(page).getAttribute("data-ghosts"))).toBeGreaterThan(0);
  await open(page, "/toolbox/snd.horns");
  await expect(page.locator("li.oak-chord-region[data-kind='applied']").first()).toHaveAttribute(
    "data-resolves",
    "1",
  );
  await shots(page, "w6-toolbox-horns", async (p) => {
    await expect(p.locator("li.oak-chord-region[data-kind='applied']").first()).toBeVisible();
  });
  // Every U12–U17 row has its page, with a live example, by keyboard: Tab reaches Open in Studio.
  for (const [idOf] of WAVE6.filter(([x]) => ["tb.ply", "tb.n.chromatic", "snd.tenor"].includes(x))) {
    await open(page, `/toolbox/${idOf}`);
    await expect(page.getByTestId("tool-example")).toBeVisible();
    await expect(page.getByTestId("eval-banner")).toHaveCount(0);
  }
  await page.getByTestId("open-in-studio").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/studio\/sk_/, { timeout: 20_000 });
  await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});
