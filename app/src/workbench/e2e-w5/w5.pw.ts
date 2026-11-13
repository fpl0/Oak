// Wave 5 in the Studio and the Toolbox, against the real server on this suite's own stack (5246/8846). Every test
// starts from the dev seed "X1 released" (the learner through U07 and X1); the Wave 5 dev seeds are the server
// engineer's and not built yet, so the unlocks U08–U11 and A1 would grant are written straight into this stack's
// database, as the Wave 3 and 4 suites do. Covered: the section ribbon over the roll, a section loop by mouse and by
// keyboard, the form map and its energy curve, a disagreement said in words; minor keys (the degree lens, the
// numerals, the relative and parallel previews); the bass-role and blue-note lenses, the swing badge and the chord
// chart; Oak's scope with the filter probe, its cost per frame and reduced motion; the Toolbox's Wave 5 pages; Quiet
// mode. Screenshots in both themes and sizes under ./screenshots.
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

const FORM = `setcpm(100/4)

const drumsVerse = s("bd ~ sd ~")
const drumsChorus = s("bd bd sd [~ bd]")
const hatsVerse = s("~ hh ~ hh")
const hatsChorus = s("hh*8")
const melVerse = n("<[0 2 4 2] [3 2 1 ~] [0 2 4 2] [1 ~ 0 ~]>").scale("C4:major").s("piano")
const melChorus = n("<[7 9 7 4] [8 7 5 ~] [7 9 11 9] [8 ~ 7 ~]>").scale("C4:major").s("piano")

drums: arrange([4, drumsVerse], [4, drumsChorus], [4, drumsVerse], [4, drumsChorus])
hats: arrange([4, hatsVerse], [4, hatsChorus], [4, hatsVerse], [4, hatsChorus])
mel: arrange([4, melVerse], [4, melChorus], [4, melVerse], [4, melChorus])
`;

const DISAGREE = `setcpm(100/4)

const drumsVerse = s("bd ~ sd ~")
const drumsChorus = s("bd bd sd ~")
const melVerse = n("0 2 4 2").scale("C4:major").s("piano")
const melChorus = n("7 9 7 4").scale("C4:major").s("piano")

drums: arrange([4, drumsVerse], [4, drumsChorus])
mel: arrange([2, melVerse], [6, melChorus])
`;

const MINOR = `setcpm(90/4)

chords: n("<[0,2,4] [5,7,9] [2,4,6] [6,8,10]>").scale("A3:minor").s("piano")
mel: n("<[4 2 0 2] [5 4 2 ~] [4 2 4 6] [7 ~ ~ ~]>").scale("A4:minor").s("piano")
`;

const BLUES = `setcpm(120/4)

chords: chord("<C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7>").voicing().s("piano").gain(.6)
bass: chord("<C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7>").rootNotes(2).s("sawtooth").lpf(600)
riff: n("<[0 1 2 3] [4 ~ 3 2] [1 2 1 0] ~>").scale("C4:blues").s("piano")
hats: s("hh*8").swing(4).gain(.4)
drums: s("bd ~ sd ~")
`;

const SOUND = `setcpm(90/4)

drums: s("bd ~ sd ~")
bass: note("<c2 c2 g1 bb1>").s("sawtooth").lpf(600).attack(.01).release(.2).scope()
`;

const row = (id: string): [string, string, string] => {
  const t = toolbox.find((x) => x.id === id);
  if (!t) throw new Error(`no toolbox row ${id}`);
  const at = Array.isArray(t.unlock.at) ? t.unlock.at[0] : t.unlock.at;
  return [id, t.kind, at as string];
};
/** What U08–U11 and A1.L01–L04 grant (the rows these views need), plus the earlier ones in case the seed lacks them. */
const WAVE5 = [
  "tb.feature.degree-labels",
  "tb.feature.solfege",
  "tb.feature.keysig",
  "tb.feature.circle",
  "tb.feature.chord-symbols",
  "tb.feature.rn",
  "tb.rootNotes",
  "tb.const",
  "tb.arrange",
  "tb.lens.form",
  "tb.signal",
  "tb.range",
  "tb.mask",
  "scale.minor",
  "scale.harmonic-minor",
  "scale.blues",
  "scale.minor-pentatonic",
  "chord.dom7",
  "tb.swing",
  "tb.swingBy",
  "tb.scope",
  "tb.partials",
  "tb.lpf",
  "tb.hpf",
  "tb.lpq",
  "tb.adsr",
  "tb.delay",
].map(row);

async function api<T>(page: Page, method: string, path: string, body?: unknown) {
  const res = await page.request.fetch(`${stack.apiURL}/api${path}`, {
    method,
    headers: HEADERS,
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
  });
  return { status: res.status(), body: (await res.json().catch(() => null)) as T };
}

/** Wipes the learner, seeds the point and grants the Wave 5 rows. */
async function setup(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await api(page, "PUT", "/dev/clock", { reset: true });
  const r = await api(page, "POST", "/dev/seed", { point: "X1 released", ...extra });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(`${stack.dataDir}/oak.db`);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    const insert = db.prepare(
      "INSERT OR IGNORE INTO unlocks (item_id, kind, source_kind, source_id, unlocked_at, seen) VALUES (?, ?, 'session-complete', ?, ?, 1)",
    );
    const at = new Date(Date.now() - 86_400_000).toISOString();
    for (const [id, kind, lesson] of WAVE5) insert.run(id, kind, lesson, at);
  } finally {
    db.close();
  }
  const u = await api<{ items: { itemId: string }[] }>(page, "GET", "/unlocks");
  for (const [id] of WAVE5) expect(u.body.items.map((i) => i.itemId)).toContain(id);
}

async function sketch(page: Page, title: string, code: string, key: { tonic: string; mode: string } | null) {
  const r = await api<{ sketch: { id: string } }>(page, "POST", "/sketches", {
    title,
    originKind: "free",
    originId: null,
    sessionId: null,
    code,
    bpm: 100,
    meter: "4/4",
    key,
    analysis: null,
    note: null,
    tutorAssisted: false,
    band: null,
    flags: { lockedTools: [], previewTools: [] },
    ranOk: true,
  });
  expect(r.status).toBe(200);
  return r.body.sketch.id;
}

async function open(page: Page, id: string): Promise<void> {
  await page.routeWebSocket(/.*/, () => {});
  await page.goto(`/studio/${id}`);
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

/** No horizontal overflow of the page. */
async function noOverflow(page: Page): Promise<void> {
  const over = await page.evaluate(() => {
    const main = document.getElementById("main") ?? document.documentElement;
    return main.scrollWidth - main.clientWidth;
  });
  expect(over).toBeLessThanOrEqual(1);
}

async function shots(page: Page, name: string, ready: (page: Page) => Promise<void>): Promise<void> {
  for (const m of SCREENSHOT_MATRIX) {
    await useUiPrefs(page, { theme: m.theme });
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.reload();
    await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
    await ready(page);
    await noOverflow(page);
    await shoot(page, SHOTS, name, m.theme);
  }
}

test("Studio: the section ribbon, a section loop by mouse and keyboard, the form map", async ({ page }) => {
  const errors = watchErrors(page);
  await setup(page);
  const id = await sketch(page, "Verse and chorus", FORM, { tonic: "C", mode: "major" });
  await open(page, id);
  const wb = page.locator(WB);
  // The whole 16-bar song is read, not the sketch's 4-bar loop.
  await expect(wb).toHaveAttribute("data-piece-bars", "16");
  await expect(wb).toHaveAttribute("data-sections", "verse chorus verse chorus");
  await expect(wb).toHaveAttribute("data-line-lenses", /sections/);
  const sections = page.locator("[data-testid=section-ribbon] .oak-ribbon-section");
  await expect(sections).toHaveCount(4);
  await expect(sections.nth(1)).toHaveAttribute("aria-label", /^Chorus, bars 5–8, energy \d+%$/);
  await expect(page.getByTestId("sound-hints")).toContainText("Click a section on the ribbon to loop it");

  // A click loops the chorus; a second click stops the loop.
  await sections.nth(1).click();
  await expect(wb).toHaveAttribute("data-loop", "5-8");
  await expect(sections.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("loop-toggle")).toContainText("5–8");
  await sections.nth(1).click();
  await expect(wb).not.toHaveAttribute("data-loop", /./);

  // Keyboard: one tab stop, arrows move, Enter loops, Escape stops.
  await sections.first().focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(sections.nth(2)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(wb).toHaveAttribute("data-loop", "9-12");
  await page.keyboard.press("Escape");
  await expect(wb).not.toHaveAttribute("data-loop", /./);

  // Shift+E: the form map, the energy curve under the ribbon, and how the chorus differs.
  await wb.focus();
  await page.keyboard.press("Shift+E");
  await expect(page.getByTestId("form-map")).toBeVisible();
  await expect(page.getByTestId("form-letters")).toHaveText("A B A B");
  await expect(page.getByTestId("energy-curve")).toBeVisible();
  await expect(page.getByTestId("form-contrast")).toContainText("Chorus against Verse:");
  await page.locator("[data-testid=form-sections] button").nth(3).click();
  await expect(wb).toHaveAttribute("data-loop", "13-16");

  // Play the looped section: the playhead stays in bars 13–16 and the ribbon lights the section that plays.
  await page.getByTestId("play-toggle").click();
  await expect(wb).toHaveAttribute("data-looping", "1", { timeout: 20_000 });
  await expect(sections.nth(3)).toHaveAttribute("data-playing", "1", { timeout: 10_000 });
  await page.getByTestId("play-toggle").click();
  await expect(wb).toHaveAttribute("data-playing", "0");

  // Shift+O turns the ribbon off (the form map, if open, keeps it); both off: no ribbon.
  await page.keyboard.press("Shift+E");
  await expect(page.getByTestId("form-map")).toHaveCount(0);
  await wb.focus();
  await page.keyboard.press("Shift+O");
  await expect(page.getByTestId("section-ribbon")).toHaveCount(0);
  await expect(page.getByTestId("lens-sections")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Shift+O");
  await expect(page.getByTestId("section-ribbon")).toBeVisible();

  await page.keyboard.press("Shift+E");
  await shots(page, "w5-form", async (p) => {
    await expect(p.getByTestId("form-map")).toBeVisible();
    await expect(p.getByTestId("section-ribbon")).toBeVisible();
  });
  expect(errors).toEqual([]);
});

test("Studio: tracks that disagree about the sections are said in words", async ({ page }) => {
  await setup(page);
  const id = await sketch(page, "Out of step", DISAGREE, { tonic: "C", mode: "major" });
  await open(page, id);
  await expect(page.getByTestId("section-problem")).toContainText("The tracks disagree about the sections.");
  await expect(page.locator("[data-testid=section-ribbon] .oak-ribbon-section")).toHaveCount(0);
  await expect(page.locator(WB)).toHaveAttribute("data-form-problem", "1");
});

test("Studio: minor is minor — degrees, numerals and the relative and parallel previews", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await setup(page);
  const id = await sketch(page, "In A minor", MINOR, { tonic: "A", mode: "minor" });
  await open(page, id);
  const wb = page.locator(WB);
  await expect(wb).toHaveAttribute("data-key", "A minor");
  await expect(page.locator("[data-testid=chord-band] .oak-chord-rn")).toHaveText(["i", "VI", "III", "VII"]);
  // The notes table reads the tune in A minor: ♭3 and ♭6, never relabelled in C major.
  await page.getByRole("button", { name: "Notes table" }).first().click();
  const degrees = await page
    .locator("[data-testid=notes-table] tbody tr")
    .evaluateAll((rows) =>
      rows.filter((r) => r.children[2]?.textContent === "mel").map((r) => r.children[3]?.textContent),
    );
  expect(degrees.slice(0, 4)).toEqual(["5", "♭3", "1", "♭3"]);
  await page.getByRole("button", { name: "Notes table" }).first().click();

  await wb.focus();
  await page.keyboard.press("Shift+C");
  await expect(page.getByTestId("circle-panel")).toBeVisible();
  await expect(page.getByTestId("twin-relative")).toContainText("C major");
  await expect(page.getByTestId("twin-parallel")).toContainText("A major");
  await page.getByTestId("twin-parallel").click();
  await expect(page.getByTestId("twin-parallel")).toHaveAttribute("aria-pressed", "true", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("circle-status")).toContainText("A major");
  // The code is untouched by a preview.
  await expect(page.locator(".cm-content")).toContainText('scale("A3:minor")');
  await page.getByTestId("twin-parallel").click();
  await expect(page.getByTestId("twin-parallel")).toHaveAttribute("aria-pressed", "false");
  await shots(page, "w5-minor", async (p) => {
    await p.locator(WB).focus();
    if (!(await p.getByTestId("circle-panel").count())) await p.keyboard.press("Shift+C");
    await expect(p.getByTestId("circle-twins")).toBeVisible();
  });
  expect(errors).toEqual([]);
});

test("Studio: bass roles, blue notes, the swing badge and the 12-bar chart", async ({ page }) => {
  const errors = watchErrors(page);
  await setup(page);
  const id = await sketch(page, "Shuffle in C", BLUES, { tonic: "C", mode: "major" });
  await open(page, id);
  const wb = page.locator(WB);
  await expect(wb).toHaveAttribute("data-line-lenses", "sections bassRoles blueNotes");
  await expect(page.getByTestId("swing-hats")).toHaveText("Swing 8ths");
  await expect(page.getByTestId("swing-drums")).toHaveCount(0);
  // Keys turn the lenses off and on.
  await wb.focus();
  await page.keyboard.press("Shift+B");
  await expect(wb).toHaveAttribute("data-line-lenses", "sections blueNotes");
  await page.keyboard.press("Shift+U");
  await expect(wb).toHaveAttribute("data-line-lenses", "sections");
  await page.keyboard.press("Shift+B");
  await page.keyboard.press("Shift+U");
  await expect(wb).toHaveAttribute("data-line-lenses", "sections bassRoles blueNotes");
  // The chord chart: at the sketch's 4 bars it says the code is longer; at 12 bars it charts the whole chorus,
  // four bars a line, names the form, and writes the chords without their voicing's bass.
  await page.keyboard.press("Shift+P");
  await expect(page.getByTestId("chart-short")).toContainText("Showing 4 of the 12 bars");
  await page.getByRole("combobox", { name: "Length" }).selectOption("12");
  await expect(wb).toHaveAttribute("data-piece-bars", "12");
  await expect(page.getByTestId("chart-form")).toContainText("12-bar blues, quick change, with a turnaround");
  await expect(page.locator("[data-testid=chart] .oak-chart-line")).toHaveCount(3);
  await expect(page.locator("[data-testid=chart] .oak-chart-b9 .oak-chart-chord").first()).toHaveText("G7");
  await shots(page, "w5-blues", async (p) => {
    await p.locator(WB).focus();
    if (!(await p.getByTestId("chart-panel").count())) await p.keyboard.press("Shift+P");
    await expect(p.getByTestId("chart")).toBeVisible();
  });
  expect(errors).toEqual([]);
});

test("Studio: Oak's scope with the filter probe; cheap per frame; reduced motion slows it", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await setup(page);
  const id = await sketch(page, "Saw bass", SOUND, { tonic: "C", mode: "major" });
  await open(page, id);
  const wb = page.locator(WB);
  // .scope() in the code opens the panel once the code runs; Play runs it.
  await page.getByTestId("play-toggle").click();
  const panel = page.getByTestId("scope-panel");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("scope-source")).toHaveText("The whole mix");
  await expect(panel).toHaveAttribute("data-heard", "1", { timeout: 15_000 });
  await expect(page.getByTestId("probe-caption").first()).toContainText("Low-pass at 600 Hz");
  await expect(page.locator("[data-testid=probe][data-kind=envelope]")).toBeVisible();
  // The frame loop's own cost, measured in the page: well under a 60 Hz frame and far from audio dropouts.
  await expect(panel).toHaveAttribute("data-frames", /^(4[5-9]|[5-9]\d|\d{3,})$/, { timeout: 15_000 });
  const ms = Number(await panel.getAttribute("data-frame-ms"));
  expect(ms).toBeLessThan(4);
  const fps = async () => {
    const a = Number(await panel.getAttribute("data-frames"));
    await page.waitForTimeout(2000);
    return (Number(await panel.getAttribute("data-frames")) - a) / 2;
  };
  expect(await fps()).toBeLessThanOrEqual(32);
  await page.getByTestId("play-toggle").click();
  await expect(wb).toHaveAttribute("data-playing", "0");
  await expect(page.getByTestId("scope-idle")).toHaveText("Press Play to see the wave.");

  // Reduced motion: at most 10 frames a second.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId("play-toggle").click();
  await expect(panel).toHaveAttribute("data-heard", "1", { timeout: 15_000 });
  await page.waitForTimeout(1500);
  expect(await fps()).toBeLessThanOrEqual(12);
  await page.getByTestId("play-toggle").click();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await shots(page, "w5-scope", async (p) => {
    await p.getByTestId("play-toggle").click();
    await expect(p.getByTestId("scope-panel")).toHaveAttribute("data-heard", "1", { timeout: 20_000 });
    await p.waitForTimeout(400);
  });
  await page.getByTestId("play-toggle").click();
  expect(errors).toEqual([]);
});

test("Toolbox: the Wave 5 pages play their example with its panel or probe", async ({ page }) => {
  const errors = watchErrors(page);
  await setup(page);
  await page.routeWebSocket(/.*/, () => {});
  await page.goto("/toolbox/tb.lpf");
  await expect(page.getByTestId("tool-hint")).toContainText("Everything above 600 Hz fades");
  await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("[data-testid=probe][data-kind=filter]")).toContainText("Press Run");
  await page.getByTestId("play-toggle").click();
  await expect(page.getByTestId("probe-caption")).toContainText("Low-pass at 600 Hz", { timeout: 20_000 });
  await page.getByTestId("play-toggle").click();
  await shots(page, "w5-tool-lpf", async (p) => {
    await p.getByTestId("play-toggle").click();
    await expect(p.getByTestId("probe-caption")).toBeVisible({ timeout: 20_000 });
    await p.getByTestId("play-toggle").click();
  });

  await page.goto("/toolbox/tb.lens.form");
  await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("form-letters")).toHaveText("A B");
  await expect(page.locator("[data-testid=section-ribbon] .oak-ribbon-section")).toHaveCount(2);
  await shots(page, "w5-tool-form", async (p) => {
    await expect(p.getByTestId("form-map")).toBeVisible();
  });

  for (const id of ["scale.minor", "scale.blues", "tb.swing", "chord.dom7", "tb.adsr", "tb.partials"]) {
    await page.goto(`/toolbox/${id}`);
    await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("tool-hint")).toBeVisible();
    await expect(page.locator(WB)).not.toHaveAttribute("data-analysis", "none");
  }
  expect(errors).toEqual([]);
});

test("Quiet mode: the form and sound views need no microphone", async ({ page }) => {
  await setup(page, { mic: false });
  const v = await api<{ quiet?: boolean }>(page, "GET", "/voice");
  expect(v.status).toBe(200);
  const id = await sketch(page, "Quiet verse and chorus", FORM, { tonic: "C", mode: "major" });
  await open(page, id);
  await expect(page.locator("[data-testid=section-ribbon] .oak-ribbon-section")).toHaveCount(4);
  await page.locator(WB).focus();
  await page.keyboard.press("Shift+W");
  await expect(page.getByTestId("scope-panel")).toBeVisible();
  await expect(page.getByTestId("scope-idle")).toHaveText("Press Play to see the wave.");
  await page.keyboard.press("Shift+W");
  await expect(page.getByTestId("scope-panel")).toHaveCount(0);
});
