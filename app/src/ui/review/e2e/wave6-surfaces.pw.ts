// Wave 6 review (review:surfaces): the Workbench's lenses and staff on the U12–U17 harmony and rhythm, the tutor's
// applied-chord tokens, driven in the real Studio against the real server from the "core complete" seed (every tool
// and lens of the core unlocked). Each test tries to break one surface:
// - a piece that changes key five times (C, D, B♭, E, A♭, F♯): the key ribbon names six keys with signed marks
//   (−4, −2: down a step — it said +8 and +10 before this review), every head on the staff is the pitch it says,
//   each key's signature is drawn, the chord band reads Imaj7 in each key, and while it plays the staff lights only
//   notes the roll lights, through the key changes;
// - a 12/8 groove with a triplet over two eighths: one `3` bracket over those two eighths (was a 9:6 bracket over the
//   whole beat), every head right, the beat grid counting four dotted-quarter beats;
// - seven sharps with a secondary dominant: seven sharps in the signature, F𝄪 drawn as a double sharp, V7/V on the
//   chord band, the guide-tone lens ringing the 3rds and 7ths on the staff;
// - every Wave 6 lens key hammered while that piece plays: no error, the music never stops;
// - a tutor turn full of applied and borrowed numerals in C♯ major with hostile markdown: chips, nothing runs.
// The pure parts are proved in bun: packages/notation/src/review-w6.test.ts, app/src/workbench/review-w6.test.ts and
// app/src/tutor/review-w6.test.ts. Screenshots in both themes at 1440×900 and 1280×800 go to ./screenshots (w6s-*):
// one load per theme, the size changes in place (wave5.md §7.1).
import { expect, type Page, test } from "@playwright/test";
import { PREFS_KEY, shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { readStaff, verify } from "./staff-read.ts";
import {
  animationsDone,
  contrastIssues,
  createSketch,
  expectNoHorizontalOverflow,
  SHOTS,
  seed,
} from "./support.ts";

const WB = "[data-testid=workbench]";
const STAFF = "[data-testid=staff-view]";
const SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
] as const;

test.describe.configure({ mode: "serial" });
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await seed(page, "core complete");
  await page.close();
});

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      !/\[eval\]|strudel|Failed to load resource|\n\s+at eval \(eval at /i.test(m.text())
    )
      errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function openSketch(page: Page, id: string, bars: number): Promise<void> {
  await page.addInitScript(([sid, n]) => localStorage.setItem(`oak.studio.length.${sid}`, String(n)), [
    id,
    bars,
  ] as const);
  await page.goto(`/studio/${id}`);
  await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
}

async function staffTab(page: Page): Promise<void> {
  // After a resize the views may fold into tabs a frame later: wait for one or the other.
  const tab = page.getByTestId("tab-staff");
  await expect(page.locator(`${STAFF}, [data-testid=tab-staff]`).first()).toBeVisible();
  // The fold can re-render the tabs on Roll after a click landed, even after the staff was shown once (the race
  // of the Wave 6 run: the staff seen, then gone when its status was read). One state is waited for: the staff
  // shown AND drawn, clicking the tab again while the fold settles.
  await expect(async () => {
    if (await tab.isVisible().catch(() => false)) {
      if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
    }
    await expect(page.locator(STAFF)).toBeVisible({ timeout: 2_000 });
    await expect(page.locator(STAFF)).toHaveAttribute("data-status", "ready", { timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
}

async function setLens(page: Page, id: string, on: boolean): Promise<void> {
  const b = page.getByTestId(`lens-${id}`);
  if ((await b.getAttribute("aria-pressed")) !== String(on)) await b.click();
  await expect(b).toHaveAttribute("aria-pressed", String(on));
}

async function play(page: Page, on: boolean): Promise<void> {
  const wb = page.locator(WB);
  if ((await wb.getAttribute("data-playing")) === (on ? "1" : "0")) return;
  await page.getByTestId("play-toggle").click();
  await expect(wb).toHaveAttribute("data-playing", on ? "1" : "0", { timeout: 20_000 });
}

/** Every page of the staff read off the SVG: heads against what they say, and the key signatures drawn. */
async function readAllPages(page: Page) {
  const notes: Awaited<ReturnType<typeof readStaff>>["notes"] = [];
  const problems: string[] = [];
  const sigs: { sharps: number; flats: number; naturals: number }[] = [];
  const glyphs: { dblsharp: number; third: number; seventh: number } = { dblsharp: 0, third: 0, seventh: 0 };
  for (let p = 0; p < 6; p++) {
    await expect
      .poll(async () => (await readStaff(page)).notes.length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    const r = await readStaff(page);
    problems.push(...r.problems, ...verify(r.notes, { degree: false, solfege: false, names: false }));
    notes.push(...r.notes);
    sigs.push(
      ...(await page.evaluate(() =>
        [...document.querySelectorAll(".oak-staff-host svg g.abcjs-key-signature")].map((g) => ({
          sharps: g.querySelectorAll('path[data-name="accidentals.sharp"]').length,
          flats: g.querySelectorAll('path[data-name="accidentals.flat"]').length,
          naturals: g.querySelectorAll('path[data-name="accidentals.nat"]').length,
        })),
      )),
    );
    const g = await page.evaluate(() => {
      const host = document.querySelector(".oak-staff-host svg") as SVGSVGElement;
      return {
        dblsharp: host.querySelectorAll('g.abcjs-note path[data-name="accidentals.dblsharp"]').length,
        third: host.querySelectorAll(".oak-guide-third").length,
        seventh: host.querySelectorAll(".oak-guide-seventh").length,
      };
    });
    glyphs.dblsharp += g.dblsharp;
    glyphs.third += g.third;
    glyphs.seventh += g.seventh;
    const next = page.getByRole("button", { name: "Next bars" });
    if (!(await next.isVisible().catch(() => false)) || (await next.isDisabled())) break;
    await next.click();
    await expect(page.locator(STAFF)).toHaveAttribute("data-page", String(p + 1));
    await expect(page.locator(STAFF)).toHaveAttribute("data-status", "ready");
  }
  return { notes, problems, sigs, glyphs };
}

/** Both reference sizes in the current theme, in place: no overflow, AA text, a screenshot each. */
async function sizes(page: Page, name: string, theme: "paper" | "bark"): Promise<void> {
  for (const s of SIZES) {
    await page.setViewportSize(s);
    // Narrower, the views may fold into tabs: the staff is the one under review.
    await staffTab(page);
    await animationsDone(page);
    await expectNoHorizontalOverflow(page);
    expect(await contrastIssues(page), `${name} ${theme} ${s.width}`).toEqual([]);
    await shoot(page, SHOTS, name, theme);
  }
}

// --- five keys ---------------------------------------------------------------------------------------------------

const FIVE = [
  "setcpm(100/4)",
  "",
  'mel: n("<[0 2 4 7] [0 2 4 7] [0 2 4 7] [0 2 4 7] [0 2 4 7] [0 2 4 7]>").scale("<C4:major D4:major Bb3:major E4:major Ab3:major F#4:major>").s("piano")',
  'ch: chord("<C^7 D^7 Bb^7 E^7 Ab^7 F#^7>").voicing().s("piano")',
].join("\n");

test("five changes of key: ribbon, signatures, heads and numerals right; the staff lights what the roll lights", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const id = await createSketch(page, "Five keys", FIVE, { key: { tonic: "C", mode: "major" } });
  for (const theme of ["paper", "bark"] as const) {
    await page.setViewportSize(SIZES[0]);
    await useUiPrefs(page, { theme, motion: "off" });
    await openSketch(page, id, 6);
    const wb = page.locator(WB);
    await setLens(page, "keyPlan", true);
    const ribbon = page.getByTestId("key-ribbon");
    await expect(ribbon).toHaveAttribute(
      "data-keys",
      "C major → D major → B♭ major → E major → A♭ major → F♯ major",
    );
    // The change marks, signed the shorter way (B♭ after D is 4 half steps down, F♯ after A♭ a step down).
    await expect(ribbon).toHaveAttribute(
      "aria-label",
      "Key along the piece: C major from bar 1, then D major from bar 2 (+2: up a step), then B♭ major from bar 3 (−4), then E major from bar 4 (+6), then A♭ major from bar 5 (+4), then F♯ major from bar 6 (−2: down a step)",
    );
    // One-bar spans: each mark keeps its number, the words go to the hover, and every key's name is read whole
    // (the marks' words cut the names to "E m…" before this review).
    await expect(ribbon.getByTestId("key-change")).toHaveText(["+2", "−4", "+6", "+4", "−2"]);
    await expect(ribbon.getByTestId("key-change").last()).toHaveAttribute("data-words", "−2: down a step");
    const cut = await ribbon
      .locator(".oak-keyribbon-name")
      .evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
    expect(cut).toEqual([]);
    await expect(ribbon.locator(".oak-keyribbon-name")).toHaveText(["C", "D", "B♭", "E", "A♭", "F♯"]);
    if (theme === "paper") {
      // The guide-tone line over the roll writes F♯, never the code's "F#".
      await setLens(page, "guideTones", true);
      await expect(page.getByTestId("guide-facts")).toContainText("F♯");
      await expect(page.getByTestId("guide-facts")).not.toContainText("#");
      // Imaj7 in each key, never a numeral read in C.
      await setLens(page, "romanNumerals", true);
      const rns = await page
        .locator("li.oak-chord-region")
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-rn") ?? ""));
      expect(rns.map((r) => r.replace(/\d+$/, ""))).toEqual(["Imaj", "Imaj", "Imaj", "Imaj", "Imaj", "Imaj"]);
      await staffTab(page);
      const r = await readAllPages(page);
      expect(r.problems).toEqual([]);
      // The six signatures (a key's signature may repeat at a new line): 0, 2♯, 2♭, 4♯, 4♭, 6♯.
      const drawn = new Set(r.sigs.map((s) => (s.sharps ? `${s.sharps}#` : s.flats ? `${s.flats}b` : "0")));
      for (const k of ["2#", "2b", "4#", "4b", "6#"]) expect(drawn, [...drawn].join(" ")).toContain(k);
      // Highlight sync through the key changes: the staff lights only events the roll lights.
      const prev = page.getByRole("button", { name: "Previous bars" });
      if (await prev.isVisible().catch(() => false))
        while (!(await prev.isDisabled())) {
          await prev.click();
          await expect(page.locator(STAFF)).toHaveAttribute("data-status", "ready");
        }
      await play(page, true);
      let together = 0;
      const bars = new Set<string>();
      await expect
        .poll(
          async () => {
            const s = await page.evaluate(() => {
              const words = (x: string | undefined) => (x ?? "").split(" ").filter(Boolean);
              return {
                roll: words(
                  (document.querySelector("[data-testid=piano-roll]") as HTMLElement | null)?.dataset.active,
                ),
                staff: words(
                  (document.querySelector(".oak-staff-host") as HTMLElement | null)?.dataset.activeEvents,
                ),
                bar: document
                  .querySelector("[data-testid=key-ribbon] [data-current='1']")
                  ?.getAttribute("data-key"),
              };
            });
            const roll = new Set(s.roll);
            for (const e of s.staff) expect(roll.has(e), `${e} lit on the staff only`).toBe(true);
            if (s.staff.length) together++;
            if (s.bar) bars.add(s.bar);
            return bars.size;
          },
          { timeout: 30_000, intervals: [100] },
        )
        .toBeGreaterThanOrEqual(4);
      await play(page, false);
      expect(together).toBeGreaterThan(5);
    } else await staffTab(page);
    await expect(wb).toHaveAttribute("data-playing", "0");
    await sizes(page, "w6s-five-keys", theme);
  }
  expect(errors).toEqual([]);
});

// --- 12/8 with a triplet ----------------------------------------------------------------------------------------

const TWELVE = [
  "setcpm(50/4)",
  "",
  'drums: s("bd ~ ~ sd ~ ~ bd ~ ~ sd ~ ~, hh*12").gain(.6)',
  'mel: n("[0 [1 2 3]@2] [4 ~ 5] [[6 5 4] [3 2 1]] [0 ~ ~]").scale("A3:minor").s("piano")',
].join("\n");

test("12/8 with a triplet over two eighths: one 3 over those eighths, every head right, four beats counted", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const id = await createSketch(page, "Twelve eight", TWELVE, {
    meter: "12/8",
    key: { tonic: "A", mode: "minor" },
  });
  for (const theme of ["paper", "bark"] as const) {
    await page.setViewportSize(SIZES[0]);
    await useUiPrefs(page, { theme, motion: "off" });
    await openSketch(page, id, 2);
    await setLens(page, "beatGrid", true);
    if (theme === "paper") {
      // The roll counts four dotted-quarter beats a bar, and the triplet inside one does not turn it into a
      // triplet grid.
      const roll = page.getByTestId("roll-canvas");
      await expect(roll).toHaveAttribute("data-beat-grid", "compound");
      await expect(roll).toHaveAttribute("data-counts", "1 la li 2 la li 3 la li 4 la li");
      await expect(page.getByTestId("beat-grid-facts")).toContainText("4 beats of three eighths");
    }
    await staffTab(page);
    if (theme === "paper") {
      const r = await readAllPages(page);
      // The drum staff's heads are drum positions (staff-read reads pitches): the pitched heads are checked.
      expect(r.problems.filter((p) => !/ but is [a-z]/.test(p))).toEqual([]);
      const svg = await page.evaluate(() => {
        const host = document.querySelector(".oak-staff-host svg") as SVGSVGElement;
        return {
          triplets: [...host.querySelectorAll("g.abcjs-triplet")].map((g) => g.textContent?.trim() ?? ""),
        };
      });
      // One bracket per bar played, each a 3 (never a 9).
      expect(svg.triplets.length).toBeGreaterThan(0);
      for (const t of svg.triplets) expect(t).toBe("3");
      await expect(page.getByTestId("transport")).toContainText("12/8");
    }
    await sizes(page, "w6s-twelve-eight", theme);
  }
  expect(errors).toEqual([]);
});

// --- seven sharps and a secondary dominant ---------------------------------------------------------------------

const SEVEN = [
  "setcpm(90/4)",
  "",
  'mel: n("<[0 2 4 6] [1 3# 5 0] [4 6 1 3] [0 ~ ~ ~]>").scale("C#4:major").s("piano")',
  'ch: chord("<C#^7 D#7 G#7 C#^7>").voicing().s("piano")',
].join("\n");

test("seven sharps with V7/V: the signature, F𝄪 as a double sharp, V7/V on the band, guide tones ringed", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const id = await createSketch(page, "Seven sharps", SEVEN, { key: { tonic: "C#", mode: "major" } });
  for (const theme of ["paper", "bark"] as const) {
    await page.setViewportSize(SIZES[0]);
    await useUiPrefs(page, { theme, motion: "off" });
    await openSketch(page, id, 4);
    await setLens(page, "romanNumerals", true);
    await setLens(page, "guideTones", true);
    if (theme === "paper") {
      const regions = page.locator("li.oak-chord-region");
      await expect(regions.nth(1)).toHaveAttribute("data-rn", "V7/V");
      await expect(regions.nth(1)).toHaveAttribute("data-target", "V");
      await staffTab(page);
      const r = await readAllPages(page);
      expect(r.problems).toEqual([]);
      for (const s of r.sigs) expect(s.sharps).toBe(7);
      // F𝄪 in bar 2 (the melody's ♯4 and the chord's 3rd: one glyph when they share a head column).
      expect(r.glyphs.dblsharp).toBeGreaterThanOrEqual(1);
      expect(r.glyphs.third).toBeGreaterThan(0);
      expect(r.glyphs.seventh).toBeGreaterThan(0);
      // The drawn double sharps are the G-sounding notes the code plays.
      const fx = r.notes.flatMap((n) => n.drawn).filter((d) => d.startsWith("F##"));
      expect(fx.length).toBeGreaterThanOrEqual(2);
    } else await staffTab(page);
    await sizes(page, "w6s-seven-sharps", theme);
  }
  expect(errors).toEqual([]);
});

test("every Wave 6 lens key hammered while five keys play: no error, the music never stops", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await page.setViewportSize(SIZES[1]);
  await useUiPrefs(page, { theme: "bark", motion: "off" });
  const id = await createSketch(page, "Five keys hammered", FIVE, { key: { tonic: "C", mode: "major" } });
  await openSketch(page, id, 6);
  const wb = page.locator(WB);
  await play(page, true);
  await page.getByTestId("transport").click({ position: { x: 300, y: 5 } });
  for (let round = 0; round < 6; round++)
    for (const k of ["Shift+I", "Shift+J", "Shift+V", "Shift+R", "Shift+H", "Shift+K"])
      await page.keyboard.press(k);
  await expect(wb).toHaveAttribute("data-playing", "1");
  // The switches settle on what the server saved, and the ribbon follows its switch.
  await expect
    .poll(async () => {
      const on = await page.getByTestId("lens-keyPlan").getAttribute("aria-pressed");
      const shown = await page.getByTestId("key-ribbon").count();
      return on === "true" ? shown === 1 : shown === 0;
    })
    .toBe(true);
  await expect(wb).toHaveAttribute("data-playing", "1");
  await play(page, false);
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

// --- the tutor ---------------------------------------------------------------------------------------------------

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const TALK = [
  "In C♯ major, [[rn:V7/V]] ([[chord:D#7]]) leans into [[rn:V7]]; [[rn:vii°7/V]] ([[chord:F##o7]]) does it a half step below.",
  "Borrow [[rn:bVI]] and [[rn:♭VII]], then [[rn:iv]] and [[rn:ii⌀7]]; the ♯4 is [[deg:#4]] (fi).",
  'Hostile: <img src=x onerror="window.__pwned=1"> [[rn:<script>window.__pwned=2</script>]] [x](javascript:window.__pwned=3) [[rn:V7/V]][[rn:V7/V]] `[[rn:iv]] stays code` [[rn:]]',
].join("\n\n");

test("a tutor turn full of applied and borrowed numerals in seven sharps, hostile: chips, nothing runs", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const id = await createSketch(page, "Seven sharps tutor", SEVEN, { key: { tonic: "C#", mode: "major" } });
  await page.addInitScript((key) => {
    const cur = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...cur, tutorOpen: true }));
  }, PREFS_KEY);
  await page.route("**/api/tutor/chat", async (route) => {
    const res = await route.fetch();
    const body = await res.text();
    const at = Math.max(body.lastIndexOf("event: done"), body.lastIndexOf("event: error"));
    await route.fulfill({
      status: 200,
      headers: res.headers(),
      // The terminal frame is dropped: a "done" frame carries the server's own final text, which would replace the
      // spliced words (wave5-surfaces.pw.ts and tutor-hostile.pw.ts splice the same way).
      body: `${at >= 0 ? body.slice(0, at) : body}${frame("text", { delta: `\n\n${TALK}` })}`,
    });
  });
  for (const theme of ["paper", "bark"] as const) {
    await page.setViewportSize(SIZES[0]);
    await useUiPrefs(page, { theme, motion: "off" });
    await openSketch(page, id, 4);
    await expect(page.getByTestId("tutor-status")).toHaveAttribute("data-state", "ready", {
      timeout: 30_000,
    });
    const chat = page.getByTestId("tutor-chat");
    const box = chat.getByTestId("composer");
    await box.fill("Which chords lean where?");
    await box.press("Enter");
    const msg = chat.locator('[data-testid="tutor-message"]').filter({ hasText: "Hostile" }).last();
    await expect(msg).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(await chat.locator("img, iframe, script, object, embed").count()).toBe(0);
    const rns = await msg.locator("[data-token=rn]").allTextContents();
    for (const want of ["V7/V", "V7", "vii°7/V", "♭VI", "♭VII", "iv", "iiø7"])
      expect(
        rns.map((t) => t.trim()),
        want,
      ).toContainEqual(expect.stringContaining(want));
    // The code span stays code, the empty token stays text.
    await expect(msg.locator("code").filter({ hasText: "[[rn:iv]] stays code" })).toHaveCount(1);
    await expect(msg).not.toContainText("[[rn:V7/V]]");
    // Each applied chip says what it is in this key; vii°7/V is not "the V of".
    const vii = msg.locator("[data-token=rn]").filter({ hasText: "vii°7/V" }).first();
    const title = (await vii.getAttribute("title")) ?? (await vii.getAttribute("aria-description")) ?? "";
    if (title) expect(title).not.toContain("the V of");
    const chord = msg.locator("[data-token=chord]").filter({ hasText: "F♯♯°7" }).first();
    await expect(chord).toHaveCount(1);
    for (const s of SIZES) {
      await page.setViewportSize(s);
      await animationsDone(page);
      await shoot(page, SHOTS, "w6s-tutor-applied", theme);
      await expectNoHorizontalOverflow(page);
      expect(await contrastIssues(page), `tutor ${theme} ${s.width}`).toEqual([]);
    }
  }
  expect(errors).toEqual([]);
});
