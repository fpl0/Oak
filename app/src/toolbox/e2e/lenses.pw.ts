// Wave 3 against the real server (own stack 5236/8836): a seeded learner before U03.L02 sees no degree anywhere
// and no lens control; after U03.L02 a C-major and a G-major pattern are labelled by degree on the roll's notes
// table and under the staff (checked against @oak/theory), the Degrees switch saves the preference; after
// U03.L06–L08 the syllables, the key-signature panel and the circle of fifths work in the Studio (a preview never
// edits; "Use" is one edit that the next Run saves). The Toolbox's feature pages and the unlock moment show the
// features at work. Screenshots in both themes and sizes.
import { fileURLToPath } from "node:url";
import { labelPitch } from "@oak/theory";
import { expect, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../e2e/support/ui.ts";
import { stack } from "./playwright.config.ts";

test.describe.configure({ mode: "serial" });

const SHOTS = fileURLToPath(new URL("./screenshots", import.meta.url));
const HEADERS = { "content-type": "application/json", origin: stack.baseURL, "x-oak": "1" };
const WB = "[data-testid=workbench]";
const C = { tonic: "C", mode: "major" } as const;
const G = { tonic: "G", mode: "major" } as const;

const C_PATTERN = 'setcpm(84/4)\n\nmel: n("0 2 4 2 3 1 0 4").scale("C4:major").s("piano")\n';
const C_MIDIS = [60, 64, 67, 64, 65, 62, 60, 67];
const G_PATTERN = 'setcpm(84/4)\n\nmel: n("0 2 4 6 7 4 2 0").scale("G4:major").s("piano")\n';
const G_MIDIS = [67, 71, 74, 78, 79, 74, 71, 67];
/** A sketch loops 4 bars: a one-bar pattern plays four times, a two-bar one twice. */
const times = <T>(xs: readonly T[], n: number): T[] => Array.from({ length: n }, () => xs).flat();
const D_PATTERN = 'setcpm(88/4)\n\nmel: n("<[0 2 4 6] [7 [6 4] 5 ~]>").scale("D4:major").s("piano")\n';

const FIRST: [string, string, string][] = [
  ["tb.feature.transport", "feature", "U00.L01"],
  ["tb.feature.roll", "feature", "U00.L01"],
  ["tb.feature.studio", "feature", "U00.L01"],
  ["tb.feature.tutor", "feature", "U00.L01"],
  ["tb.feature.staff", "feature", "U01.L05"],
  ["tb.label", "tool", "U00.L01"],
  ["tb.setcpm", "tool", "U01.L01"],
  ["snd.piano", "sound", "U00.L01"],
];
const AFTER_U03_L02: [string, string, string][] = [
  ["tb.feature.degree-labels", "feature", "U03.L02"],
  ["tb.n", "tool", "U03.L02"],
  ["tb.scale", "tool", "U03.L02"],
  ["scale.major", "scale", "U03.L02"],
];
const AFTER_U03_L08: [string, string, string][] = [
  ["tb.feature.keysig", "feature", "U03.L06"],
  ["tb.feature.circle", "feature", "U03.L07"],
  ["tb.feature.solfege", "feature", "U03.L08"],
];

async function api<T>(page: Page, method: string, path: string, body?: unknown) {
  const res = await page.request.fetch(`${stack.apiURL}/api${path}`, {
    method,
    headers: HEADERS,
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
  });
  return { status: res.status(), body: (await res.json().catch(() => null)) as T };
}

/** The rows a completed session grants, written straight into this stack's throwaway database. */
async function grant(page: Page, rows: readonly [string, string, string][]): Promise<void> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(`${stack.dataDir}/oak.db`);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    const insert = db.prepare(
      "INSERT OR IGNORE INTO unlocks (item_id, kind, source_kind, source_id, unlocked_at, seen) VALUES (?, ?, 'session-complete', ?, ?, 1)",
    );
    const at = new Date(Date.now() - 86_400_000).toISOString();
    for (const [id, kind, lesson] of rows) insert.run(id, kind, lesson, at);
  } finally {
    db.close();
  }
  const u = await api<{ items: { itemId: string }[] }>(page, "GET", "/unlocks");
  for (const [id] of rows) expect(u.body.items.map((i) => i.itemId)).toContain(id);
}

async function sketch(page: Page, title: string, code: string, key: { tonic: string; mode: string }) {
  const r = await api<{ sketch: { id: string } }>(page, "POST", "/sketches", {
    title,
    originKind: "free",
    originId: null,
    sessionId: null,
    code,
    bpm: 84,
    meter: "4/4",
    key,
    analysis: null,
    note: null,
    tutorAssisted: false,
    band: null,
    flags: { lockedTools: [], previewTools: [] },
    ranOk: false,
  });
  expect(r.status).toBe(200);
  return r.body.sketch.id;
}

async function open(page: Page, id: string): Promise<void> {
  await page.routeWebSocket(/.*/, () => {});
  await page.goto(`/studio/${id}`);
  await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
  // Roll and staff are tabs when the workbench is short (1280×800): the staff is then one keypress away.
  if (await page.locator(`${WB}.oak-layout--stacked`).count())
    await expect(page.getByTestId("staff-view")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
}

/** Gives the workbench (not the editor) the keyboard. */
async function focusWorkbench(page: Page): Promise<void> {
  await page.locator(WB).focus();
}

/** One text per staff line (abcjs draws a note's lines as tspans of one text element). */
function lyrics(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const rows = new Map<string, string[]>();
    for (const t of document.querySelectorAll(".oak-staff-host .abcjs-lyric")) {
      // By staff (voice) only: a line of text continues across systems (how many bars share a system depends
      // on the staff's width once syllables or names are on).
      const staff = [...t.classList].filter((c) => /^abcjs-v\d+$/.test(c)).join(" ");
      const spans = [...t.querySelectorAll("tspan")].map((s) => (s.textContent ?? "").trim());
      (spans.length ? spans : [(t.textContent ?? "").trim()]).forEach((text, i) => {
        if (!text) return;
        rows.set(`${staff}:${i}`, [...(rows.get(`${staff}:${i}`) ?? []), text]);
      });
    }
    return [...rows.values()].map((r) => r.join(" "));
  });
}

/** The notes table's rows as { note, degree?, syllable? } by its header. */
async function table(page: Page): Promise<Record<string, string>[]> {
  const t = page.getByTestId("notes-table");
  if (!(await t.isVisible())) await page.getByRole("button", { name: "Notes table" }).click();
  await expect(t).toBeVisible();
  return t.evaluate((el) => {
    const heads = [...el.querySelectorAll("thead th")].map((th) => th.textContent ?? "");
    return [...el.querySelectorAll("tbody tr")].map((tr) => {
      const cells = [...tr.querySelectorAll("td")].map((td) => td.textContent ?? "");
      return Object.fromEntries(heads.map((h, i) => [h, cells[i] ?? ""]));
    });
  });
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

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await grant(page, FIRST);
  await page.close();
});

test("before U03.L02: no lens control, no degree in the roll, the notes table or under the staff", async ({
  page,
}) => {
  const errors = watchErrors(page);
  const id = await sketch(page, "Before degrees", C_PATTERN, C);
  await open(page, id);
  const wb = page.locator(WB);
  await expect(wb).toHaveAttribute("data-labels", "lenses");
  await expect(wb).toHaveAttribute("data-lenses", "");
  await expect(page.getByTestId("lens-switch")).toHaveCount(0);
  await expect(page.getByTestId("panel-switch")).toHaveCount(0);
  await expect(page.getByTestId("staff-view")).toHaveAttribute("data-annotations", "");
  expect(await lyrics(page)).toEqual([]);
  const rows = await table(page);
  expect(Object.keys(rows[0] ?? {})).not.toContain("Degree");
  expect(rows.map((r) => r.Note)).toEqual(times(["C4", "E4", "G4", "E4", "F4", "D4", "C4", "G4"], 4));
  // D does nothing yet (no lens to switch).
  await focusWorkbench(page);
  await page.keyboard.press("d");
  await expect(wb).toHaveAttribute("data-lenses", "");
  expect(errors).toEqual([]);
});

test("after U03.L02: a C-major and a G-major pattern carry their degrees (checked with @oak/theory)", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await grant(page, AFTER_U03_L02);
  for (const [title, code, midis, key] of [
    ["C pattern", C_PATTERN, C_MIDIS, C],
    ["G pattern", G_PATTERN, G_MIDIS, G],
  ] as const) {
    const id = await sketch(page, title, code, C);
    await open(page, id);
    const wb = page.locator(WB);
    await expect(wb).toHaveAttribute("data-lenses", "degree");
    await expect(wb).toHaveAttribute("data-key", `${key.tonic} major`);
    await expect(page.getByTestId("lens-switch")).toBeVisible();
    await expect(page.getByTestId("lens-degrees")).toHaveAttribute("aria-pressed", "true");
    // Syllables wait for U03.L08.
    await expect(page.getByTestId("lens-solfege")).toHaveCount(0);
    const expected = times(
      midis.map((m) => labelPitch(m, key).degreeDisplay),
      4,
    );
    const rows = await table(page);
    expect(rows.map((r) => r.Degree)).toEqual(expected);
    expect(rows.map((r) => r.Note)).toEqual(
      times(
        midis.map((m) => labelPitch(m, key).display),
        4,
      ),
    );
    expect(Object.keys(rows[0] ?? {})).not.toContain("Syllable");
    // Eight notes a bar under a text line: fewer bars to a staff line (as many as the staff's width leaves room
    // for under the notes), so more than one system; one line of degrees runs through them.
    await expect.poll(async () => (await lyrics(page)).join(" ")).toEqual(expected.join(" "));
    expect(await lyrics(page)).toHaveLength(1);
    expect(await page.locator(".oak-staff-host g.abcjs-staff-wrapper").count()).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId("staff-key")).toHaveText(
      key.tonic === "C" ? "C major · no ♯/♭" : "G major · 1♯",
    );
  }
  // The Degrees switch is the learner's preference: off, saved, still off after a reload; then on again.
  await focusWorkbench(page);
  await page.keyboard.press("d");
  await expect(page.locator(WB)).toHaveAttribute("data-lenses", "");
  await expect
    .poll(
      async () =>
        (await api<{ settings: { lenses: { degrees: boolean } } }>(page, "GET", "/bootstrap")).body.settings
          .lenses.degrees,
    )
    .toBe(false);
  await page.reload();
  await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(WB)).toHaveAttribute("data-lenses", "");
  await expect.poll(() => lyrics(page)).toEqual([]);
  await page.getByTestId("lens-degrees").click();
  await expect(page.locator(WB)).toHaveAttribute("data-lenses", "degree");
  expect(errors).toEqual([]);
});

test("after U03.L08: syllables, the key panel and the circle; a preview never edits, Use is one saved edit", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await grant(page, AFTER_U03_L08);
  const id = await sketch(page, "In D", D_PATTERN, { tonic: "D", mode: "major" });
  await open(page, id);
  const wb = page.locator(WB);
  await expect(wb).toHaveAttribute("data-lenses", "degree solfege");
  await expect
    .poll(() => lyrics(page))
    .toEqual([times(["1 3 5 7 1 7 5 6"], 2).join(" "), times(["do mi sol ti do ti sol la"], 2).join(" ")]);
  // Keyboard only: the panels open with Shift+K and Shift+C.
  await focusWorkbench(page);
  await page.keyboard.press("Shift+K");
  await page.keyboard.press("Shift+C");
  await expect(page.getByTestId("key-panel-name")).toHaveText("D major");
  await expect(page.getByTestId("key-panel-signature")).toContainText("2 sharps: F♯ C♯");
  const circle = page.getByTestId("circle");
  await expect(circle.locator("[data-here='1']")).toHaveAttribute("data-key", "D major");
  const before = await page.locator(".cm-content").textContent();
  await circle.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("circle-status")).toContainText("Hearing your code in A major", {
    timeout: 20_000,
  });
  expect(await page.locator(".cm-content").textContent()).toBe(before);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("circle-status")).toContainText("Stopped. Your code is still in D major.");
  await page.getByTestId("circle-use").click();
  await expect.poll(() => page.locator(".cm-content").textContent()).toContain('.scale("A3:major")');
  // The next Run plays it and saves it as a version.
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByTestId("save-state")).toContainText("Saved v2", { timeout: 20_000 });
  await expect(page.getByTestId("key-panel-name")).toHaveText("A major", { timeout: 10_000 });
  const saved = await api<{ versions: { code: string }[] }>(page, "GET", `/sketches/${id}`);
  expect(saved.body.versions.at(-1)?.code).toContain('.scale("A3:major")');
  await page.keyboard.press("ControlOrMeta+.");
  expect(errors).toEqual([]);
});

test("the Toolbox: feature pages show the feature at work, and so does the unlock moment", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.routeWebSocket(/.*/, () => {});
  await page.goto("/toolbox/tb.feature.degree-labels");
  const example = page.getByTestId("tool-example");
  await expect(example.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
  await expect(example.locator(WB)).toHaveAttribute("data-lenses", /degree/);
  await expect(example.getByTestId("staff-view")).toHaveAttribute("data-status", "ready");
  await page.getByRole("button", { name: "Replay the unlock moment" }).click();
  await expect(page.getByTestId("feature-glimpse")).toBeVisible();
  await expect(page.locator("[data-testid=glimpse-staff][data-ready='1']")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/toolbox/tb.feature.circle");
  await expect(page.getByTestId("tool-example").getByTestId("circle-panel")).toBeVisible({ timeout: 60_000 });
  await page.goto("/toolbox/tb.feature.keysig");
  await expect(page.getByTestId("tool-example").getByTestId("key-panel-name")).toHaveText("D major", {
    timeout: 60_000,
  });
  expect(errors).toEqual([]);
});

for (const m of SCREENSHOT_MATRIX)
  test(`screens in ${m.theme} at ${m.width}x${m.height}`, async ({ page }) => {
    await useUiPrefs(page, { theme: m.theme });
    await page.setViewportSize({ width: m.width, height: m.height });
    const sketches = await api<{ items: { id: string; title: string }[] }>(page, "GET", "/sketches");
    const pId = sketches.body.items.find((s) => s.title === "G pattern")?.id;
    if (!pId) throw new Error("no G sketch");
    await open(page, pId);
    await focusWorkbench(page);
    await page.keyboard.press("Shift+K");
    await page.keyboard.press("Shift+C");
    await expect(page.getByTestId("circle-panel")).toBeVisible();
    await shoot(page, SHOTS, "studio-lenses", m.theme);
    await page.goto("/toolbox/tb.feature.degree-labels");
    await expect(page.getByTestId("tool-example").locator(`${WB}[data-analysis=ready]`)).toBeVisible({
      timeout: 60_000,
    });
    await shoot(page, SHOTS, "tool-degree-labels", m.theme);
    await page.getByRole("button", { name: "Replay the unlock moment" }).click();
    await expect(page.locator("[data-testid=glimpse-staff][data-ready='1']")).toBeVisible();
    await page.waitForTimeout(700); // the card's pop-in
    await page.screenshot({ path: `${SHOTS}/unlock-glimpse-${m.theme}-${m.width}x${m.height}.png` });
    await page.keyboard.press("Escape");
    await page.goto("/toolbox/tb.feature.circle");
    await expect(page.getByTestId("tool-example").locator(`${WB}[data-analysis=ready]`)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("tool-example").getByTestId("circle-panel")).toBeVisible();
    await shoot(page, SHOTS, "tool-circle", m.theme);
  });
