// Wave 3 review: what the Studio's staff DRAWS, read back from the SVG (no trust in the ABC we sent). For U03–U04
// examples and reference solutions and a set of hostile pieces (a key change every bar, seven sharps and seven
// flats, notes far off the staff, a 64-bar grand staff), every notehead is read off its line or space under its
// drawn clef, its accidental against the drawn key signature and the bar's earlier accidentals, and compared with
// the pitch the note says it is (its accessible name, which the bun suite proves equals @oak/theory's spelling).
// Ledger lines, the lens lines (degree, solfège, name) and the degree colours of the heads are checked per note;
// the roll and the staff light the same events while playing; the lenses survive being hammered mid-playback.
import { expect, type Page, test } from "@playwright/test";
import { useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { contrastIssues, createSketch, expectNoHorizontalOverflow, SHOTS, seed } from "./support.ts";

const WB = "[data-testid=workbench]";
const STAFF = "[data-testid=staff-view]";

/** One drawn note, as read from the SVG. */
interface DrawnNote {
  n: number;
  bar: number;
  /** Pitches the note claims (its accessible name), low to high as written there. */
  said: string[];
  /** Pitches read off the drawing. */
  drawn: string[];
  ledgers: number;
  ledgersNeeded: number;
  clef: string;
  lines: string[];
  degree: string | null;
  heads: { deg: string | null; fill: string }[];
}

/**
 * Reads the staff host's SVG: staff lines → step of every notehead → letter and octave under the drawn clef;
 * key signature glyphs (in their conventional order) and accidentals inside each note → the sounding alteration.
 */
function readStaff(page: Page): Promise<{ notes: DrawnNote[]; bars: number; problems: string[] }> {
  return page.evaluate(() => {
    const host = document.querySelector(".oak-staff-host") as HTMLElement;
    const svg = host.querySelector("svg") as SVGSVGElement;
    const problems: string[] = [];
    const mid = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    };
    const num = (el: Element, re: RegExp) => {
      for (const c of el.classList) {
        const m = re.exec(c);
        if (m) return Number(m[1]);
      }
      return -1;
    };
    const L = (el: Element) => num(el, /^abcjs-l(\d+)$/);
    const V = (el: Element) => num(el, /^abcjs-v(\d+)$/);
    const MM = (el: Element) => num(el, /^abcjs-mm(\d+)$/);
    const staves = new Map<string, { top: number; space: number }>();
    for (const g of svg.querySelectorAll("g.abcjs-staff")) {
      const ys = [...g.querySelectorAll("path")].map(mid).sort((a, b) => a - b);
      if (ys.length < 5) continue;
      staves.set(`${L(g)}|${V(g)}`, {
        top: ys[0] as number,
        space: ((ys[4] as number) - (ys[0] as number)) / 4,
      });
    }
    const clefs = new Map<string, string>();
    for (const g of svg.querySelectorAll("g.abcjs-clef")) {
      const name = g.querySelector("path")?.getAttribute("data-name") ?? "";
      clefs.set(`${L(g)}|${V(g)}`, name === "clefs.F" ? "bass" : name === "clefs.G" ? "treble" : name);
    }
    // Signatures in force from a global measure on, per voice (a signature repeats at each new line).
    const sigs: { v: number; mm: number; sharps: number; flats: number }[] = [];
    for (const g of svg.querySelectorAll("g.abcjs-key-signature")) {
      const names = [...g.querySelectorAll("path")].map((p) => p.getAttribute("data-name"));
      sigs.push({
        v: V(g),
        mm: MM(g),
        sharps: names.filter((n) => n === "accidentals.sharp").length,
        flats: names.filter((n) => n === "accidentals.flat").length,
      });
    }
    // A line that starts in C major draws no signature at all: the line's first measure resets to none.
    const lineStart = new Map<string, number>();
    for (const g of svg.querySelectorAll("g.abcjs-note")) {
      const k = `${L(g)}|${V(g)}`;
      lineStart.set(k, Math.min(lineStart.get(k) ?? Number.POSITIVE_INFINITY, MM(g)));
    }
    for (const [k, mm] of lineStart) {
      const v = Number(k.split("|")[1]);
      if (!sigs.some((x) => x.v === v && x.mm === mm)) sigs.push({ v, mm, sharps: 0, flats: 0 });
    }
    sigs.sort((a, b) => a.mm - b.mm);
    const sigAt = (v: number, mm: number) => {
      let s = { sharps: 0, flats: 0 };
      for (const k of sigs) if (k.v === v && k.mm <= mm) s = k;
      const out: Record<string, number> = {};
      for (const l of "FCGDAEB".slice(0, s.sharps)) out[l] = 1;
      for (const l of "BEADGCF".slice(0, s.flats)) out[l] = -1;
      return out;
    };
    const LET = "CDEFGAB";
    const barState = new Map<string, number>();
    const notes: DrawnNote[] = [];
    let maxBar = 0;
    for (const g of svg.querySelectorAll("g.abcjs-note[data-oak-events]")) {
      const key = `${L(g)}|${V(g)}`;
      const staff = staves.get(key);
      const clef = clefs.get(`${L(g)}|${V(g)}`) ?? clefs.get(`0|${V(g)}`) ?? "?";
      if (!staff) {
        problems.push(`no staff for ${g.getAttribute("class")}`);
        continue;
      }
      const topP = clef === "bass" ? -2 : 10;
      const mm = MM(g);
      const v = V(g);
      const sig = sigAt(v, mm);
      const half = staff.space / 2;
      const heads = [...g.querySelectorAll(".abcjs-notehead")].map((h) => ({
        el: h,
        y: mid(h),
        step: Math.round((mid(h) - staff.top) / half),
      }));
      const accs = [...g.querySelectorAll('path[data-name^="accidentals."]')].map((a) => {
        const r = a.getBoundingClientRect();
        const name = a.getAttribute("data-name") ?? "";
        // A flat's bowl sits on its line or space, its stem rises above: aim at the bowl.
        const y = name.includes("flat") ? r.bottom - half * 0.8 : r.top + r.height / 2;
        return {
          y,
          alt: name.endsWith("dblsharp")
            ? 2
            : name.endsWith("dblflat")
              ? -2
              : name.endsWith("sharp")
                ? 1
                : name.endsWith("flat")
                  ? -1
                  : 0,
        };
      });
      // Each accidental belongs to its nearest head (a second's heads sit half a space apart).
      const accOf = new Map<number, { y: number; alt: number }>();
      for (const a of accs) {
        let best = -1;
        for (let i = 0; i < heads.length; i++)
          if (
            best < 0 ||
            Math.abs((heads[i] as { y: number }).y - a.y) < Math.abs((heads[best] as { y: number }).y - a.y)
          )
            best = i;
        if (best >= 0 && Math.abs((heads[best] as { y: number }).y - a.y) < half * 1.2) accOf.set(best, a);
      }
      const drawn: string[] = [];
      let above = 0;
      let below = 0;
      for (const [hi, h] of heads.entries()) {
        const p = topP - h.step;
        const letter = LET[((p % 7) + 7) % 7] as string;
        const oct = 4 + Math.floor(p / 7);
        const acc = accOf.get(hi);
        const k = `${v}|${mm}|${letter}${oct}`;
        let alt: number;
        if (acc) {
          alt = acc.alt;
          barState.set(k, alt);
        } else alt = barState.get(k) ?? sig[letter] ?? 0;
        drawn.push(`${letter}${alt > 0 ? "#".repeat(alt) : "b".repeat(-alt)}${oct}`);
        if (h.step <= -2) above = Math.max(above, Math.floor(-h.step / 2));
        if (h.step >= 10) below = Math.max(below, Math.floor((h.step - 8) / 2));
      }
      const label = g.getAttribute("aria-label") ?? "";
      const said = (label.split(",")[0] ?? "").trim().split(/\s+/);
      const bar = Number(/bar (\d+)/.exec(label)?.[1] ?? 0);
      maxBar = Math.max(maxBar, bar);
      const lyric = g.querySelector(".abcjs-lyric");
      const tspans = lyric
        ? [...lyric.querySelectorAll("tspan")].map((t) => (t.textContent ?? "").trim())
        : [];
      notes.push({
        n: num(g, /^oak-e(\d+)$/),
        bar,
        said,
        drawn,
        ledgers: g.querySelectorAll(".abcjs-ledger").length,
        ledgersNeeded: above + below,
        clef,
        lines: tspans.filter(Boolean),
        degree: g.getAttribute("data-oak-degree"),
        heads: heads.map((h) => ({
          deg: h.el.getAttribute("data-oak-deg"),
          fill: getComputedStyle(h.el).fill,
        })),
      });
    }
    return { notes, bars: maxBar, problems };
  });
}

const glyph = (s: string) => s.replace(/#/g, "♯").replace(/(?<=[A-G])b/g, "♭");
const norm = (xs: readonly string[]) => [...xs].sort().join(" ");

/** Every drawn note is the pitch it says, with its ledger lines, lens lines and head colours. */
function verify(notes: DrawnNote[], lenses: { degree: boolean; solfege: boolean; names: boolean }): string[] {
  const out: string[] = [];
  for (const d of notes) {
    if (norm(d.drawn) !== norm(d.said)) out.push(`bar ${d.bar} n${d.n}: drawn ${d.drawn} but is ${d.said}`);
    // abcjs draws one ledger per line per head column; a chord shares them. At least the lines needed, never
    // ledger lines inside the staff.
    if (d.ledgers < d.ledgersNeeded)
      out.push(`bar ${d.bar} n${d.n}: ${d.ledgers} ledger lines, needs ${d.ledgersNeeded}`);
    if (d.ledgersNeeded === 0 && d.ledgers > 0) out.push(`bar ${d.bar} n${d.n}: stray ledger lines`);
    const want: string[] = [];
    if (lenses.degree && d.degree) want.push(d.degree);
    if (lenses.names) want.push(d.said.map(glyph).join(" "));
    const got = d.lines.map((l) => l.replace(/\s+/g, " "));
    if (lenses.degree && d.degree && got[0] !== d.degree)
      out.push(`bar ${d.bar} n${d.n}: degree line "${got[0]}" ≠ ${d.degree}`);
    if (lenses.names && !got.includes(want[want.length - 1] as string))
      out.push(`bar ${d.bar} n${d.n}: name line ${JSON.stringify(got)} lacks ${want[want.length - 1]}`);
    if (lenses.degree && d.degree) {
      const nums = d.degree.split(" ").map((x) => x.replace(/[^\d]/g, ""));
      const heads = d.heads.map((h) => h.deg);
      if (norm(heads.map(String)) !== norm(nums))
        out.push(`bar ${d.bar} n${d.n}: head colours ${heads} for ${nums}`);
    }
  }
  return out;
}

async function openSketch(page: Page, code: string, bars: number, theme: "paper" | "bark" = "paper") {
  const id = await createSketch(page, `Notation ${Date.now()}`, code);
  await page.addInitScript(([sid, n]) => localStorage.setItem(`oak.studio.length.${sid}`, String(n)), [
    id,
    bars,
  ] as const);
  await useUiPrefs(page, { theme, motion: "off" });
  await page.goto(`/studio/${id}`);
  await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
  const tab = page.getByTestId("tab-staff");
  if (await tab.isVisible().catch(() => false)) await tab.click();
  await expect(page.locator(STAFF)).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  return id;
}

async function setLens(page: Page, id: "degrees" | "solfege" | "noteNames", on: boolean) {
  const b = page.getByTestId(`lens-${id}`);
  if ((await b.getAttribute("aria-pressed")) !== String(on)) await b.click();
  await expect(b).toHaveAttribute("aria-pressed", String(on));
}

/** Reads every page of the staff (the pager turns 8 bars at a time) and verifies each. */
async function checkAllPages(page: Page, label: string): Promise<{ notes: number; pages: number }> {
  let total = 0;
  let pages = 1;
  const pager = page.getByTestId("staff-pager");
  if (await pager.isVisible().catch(() => false)) {
    const text = (await pager.textContent()) ?? "";
    const m = /of (\d+)/.exec(text);
    pages = m ? Math.ceil(Number(m[1]) / 8) : 1;
  }
  for (let p = 0; p < pages; p++) {
    if (p > 0) {
      await page.getByRole("button", { name: "Next bars" }).click();
      await expect(page.locator(STAFF)).toHaveAttribute("data-page", String(p));
      await expect(page.locator(STAFF)).toHaveAttribute("data-status", "ready");
    }
    await expect
      .poll(async () => (await readStaff(page)).notes.length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    const r = await readStaff(page);
    expect(r.problems, `${label} p${p}`).toEqual([]);
    expect(verify(r.notes, { degree: true, solfege: true, names: true }), `${label} p${p}`).toEqual([]);
    total += r.notes.length;
  }
  return { notes: total, pages };
}

// U03–U04 examples and reference solutions, every key the lessons use (copied from content/core; the bun suite
// app/src/workbench/spelling.test.ts walks all of them through the same pipeline).
const COURSE: [string, string, number][] = [
  [
    "U03.L07 flats round the circle",
    'mel: n("0 2 4 2").scale("<C4:major F4:major Bb3:major Eb4:major>").s("piano")',
    4,
  ],
  [
    "U03.L07 sharps round the circle",
    'mel: n("0 2 4 2").scale("<C4:major G4:major D4:major A4:major>").s("piano")',
    4,
  ],
  [
    "U03.L05 hook, C then G3",
    'mel: n("<[0 2 4 2] [3 1 0 ~]>").scale("<C4:major!2 G3:major!2>").s("piano")',
    4,
  ],
  [
    "U03.L05 C D F",
    'mel: n("<[0 2 4 2] [3 1 0 ~]>").scale("<C4:major!2 D4:major!2 F4:major!2>").s("piano")',
    6,
  ],
  ["U03.L05 A3 major", 'mel: n("<[0 1 2 1] 0>").scale("A3:major").s("piano")', 2],
  ["U03.L03 below and above", 'mel: n("-3 -1 0 2 4 7").scale("C4:major").s("piano")', 1],
  ["U03.L03 down to -7", 'mel: n("-3 -5 -6 -7").scale("C4:major").s("piano")', 1],
  ["U03.L06 G major", 'mel: n("<[0 2 4 6] [7 [6 4] 5 ~]>").scale("G4:major").s("piano")', 2],
  ["U03.L06 D major scale", 'mel: n("0 .. 7").scale("D4:major").s("piano")', 1],
  ["U03.L01 F major letters", 'mel: note("f4 g4 a4 bb4 c5 d5 e5 f5").s("piano")', 1],
  ["U03.L07 E♭ letters", 'mel: note("eb4 f4 g4 ab4 bb4 c5 d5 eb5").s("piano")', 1],
  [
    "U03.L09 eight bars",
    'mel: n("<[2 2 3 4] [4 3 2 1] [0 0 1 2] [2 1 1@2] [~ 0 2 3] [4@4] [~ 0 2 3] [4@4]>").scale("C4:major").s("piano")',
    8,
  ],
  ["U04.L03 dyads", 'keys: n("<[0,2] [0,4] [-1,3] [0,2]>").scale("C4:major").s("piano")', 4],
  ["U04.L03 a minor second", 'keys: note("<[c4,e4] [c4,db4]>").s("piano")', 2],
  [
    "U04.L02 a fifth above",
    'mel: note("<[c4 e4 g4 e4] [f4 d4 c4 ~]>").s("piano")\nvox: note("<[c4 e4 g4 e4] [f4 d4 c4 ~]>").transpose("5P").s("piano").gain(.6)',
    2,
  ],
  [
    "U04.CP thirds",
    'mel: n("<[[0,2] [1,3] [2,4] [0,2]] [[3,5] [2,4] [1,3] ~]>").scale("C4:major").s("piano")',
    2,
  ],
  [
    "U04.L01 two voices",
    'mel: n("<[0 2 4 2] [3 5 4 ~]>").scale("C4:major").s("piano")\nvox: n("<[2 4 6 4] [5 7 6 ~]>").scale("C4:major").s("piano").gain(.7)',
    2,
  ],
];

const HOSTILE: [string, string, number][] = [
  ["seven sharps, seven flats", 'mel: n("0 1 2 3 4 5 6 7").scale("<C#4:major Cb4:major>").s("piano")', 2],
  ["far off the staff", 'mel: note("c1 c8 a0 c7").s("piano")', 1],
  ["two octaves either side", 'mel: n("-14 -7 0 7 14 21").scale("C4:major").s("piano")', 1],
  [
    "key change every bar on a grand staff, 64 bars",
    'mel: n("0 2 4 [6 7]").scale("<C4:major G4:major D4:major A4:major E4:major B4:major F#4:major C#4:major F4:major Bb4:major Eb4:major Ab4:major Db4:major Gb4:major Cb4:major>").s("piano")\nbass: n("0 -3").scale("<C2:major G2:major D2:major A2:major E2:major B2:major F#2:major C#2:major F2:major Bb2:major Eb2:major Ab2:major Db2:major Gb2:major Cb2:major>").s("piano")',
    64,
  ],
];

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await seed(page, "after U03.CP");
  await page.close();
});

test("U03–U04 examples: every note is drawn where it sounds, with its lines and colours", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  let notes = 0;
  for (const [label, code, bars] of COURSE) {
    await openSketch(page, `setcpm(90/4)\n\n${code}\n`, bars);
    if (notes === 0) {
      await setLens(page, "degrees", true);
      await setLens(page, "solfege", true);
      await setLens(page, "noteNames", true);
    }
    notes += (await checkAllPages(page, label)).notes;
  }
  expect(notes).toBeGreaterThan(150);
});

test("hostile pieces: seven sharps and flats, notes far off the staff", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [label, code, bars] of HOSTILE.slice(0, 3)) {
    await openSketch(page, `setcpm(90/4)\n\n${code}\n`, bars);
    await setLens(page, "noteNames", true);
    await checkAllPages(page, label);
    await expectNoHorizontalOverflow(page);
  }
});

test("a key change every bar on a 64-bar grand staff: all eight pages drawn right", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const [label, code, bars] = HOSTILE[3] as [string, string, number];
  const t0 = Date.now();
  const id = await openSketch(page, `setcpm(90/4)\n\n${code}\n`, bars);
  const opened = Date.now() - t0;
  await setLens(page, "noteNames", true);
  const r = await checkAllPages(page, label);
  expect(r.pages).toBe(8);
  await expect(page.getByTestId("staff-clef")).toHaveText(/Grand staff/);
  await expectNoHorizontalOverflow(page);
  // The host is as tall as the drawing: no blank band under the last system, nothing cut off.
  const fit = await page.evaluate(() => {
    const host = document.querySelector(".oak-staff-host") as HTMLElement;
    const svg = host.querySelector("svg") as SVGSVGElement;
    const systems = svg.querySelectorAll("g.abcjs-staff-wrapper").length;
    return { host: host.getBoundingClientRect().height, svg: svg.getBoundingClientRect().height, systems };
  });
  expect(Math.abs(fit.host - fit.svg), JSON.stringify(fit)).toBeLessThan(40);
  test.info().annotations.push({
    type: "timing",
    description: `opened in ${opened} ms, read in ${Date.now() - t0} ms`,
  });
  // Page 1 of the piece in both themes and both sizes.
  for (const [w, h] of [
    [1440, 900],
    [1280, 800],
  ] as const)
    for (const theme of ["paper", "bark"] as const) {
      await useUiPrefs(page, { theme, motion: "off" });
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/studio/${id}`);
      await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
      const tab = page.getByTestId("tab-staff");
      if (await tab.isVisible().catch(() => false)) await tab.click();
      await expect(page.locator(STAFF)).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
      await page.locator(STAFF).scrollIntoViewIfNeeded();
      await page.locator(STAFF).screenshot({ path: `${SHOTS}/w3-staff-64-${theme}-${w}x${h}.png` });
      await page.screenshot({ path: `${SHOTS}/w3-studio-64-${theme}-${w}x${h}.png` });
    }
});

test("lenses hammered while playing: the lines, the colours and the playhead stay in step", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Both views side by side (1280×800 tabs them: only one is mounted at a time).
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSketch(
    page,
    'setcpm(120/4)\n\nmel: n("0 1 2 3 4 5 6 7").scale("<C4:major A4:major Eb4:major>").s("piano")\n',
    3,
    "bark",
  );
  await page.getByTestId("play-toggle").click();
  await expect(page.locator(WB)).toHaveAttribute("data-playing", "1", { timeout: 20_000 });
  for (let i = 0; i < 24; i++) {
    const id = (["degrees", "solfege", "noteNames"] as const)[i % 3] as "degrees" | "solfege" | "noteNames";
    await page.getByTestId(`lens-${id}`).click();
  }
  // 24 clicks: each lens toggled 8 times, back where it started.
  await expect(page.locator(STAFF)).toHaveAttribute("data-status", "ready");
  await expect(page.getByTestId("piano-roll")).toBeVisible();
  // The roll and the staff light the same events (the staff: those engraved on its page).
  let together = 0;
  for (let i = 0; i < 20; i++) {
    const s = await page.evaluate(() => ({
      staff: (document.querySelector(".oak-staff-host") as HTMLElement).dataset.activeEvents ?? "",
      roll: (document.querySelector("[data-testid=piano-roll]") as HTMLElement | null)?.dataset.active ?? "",
    }));
    const staff = s.staff.split(" ").filter(Boolean);
    const roll = new Set(s.roll.split(" ").filter(Boolean));
    for (const e of staff)
      expect(roll.has(e), `${e} lit on the staff, not on the roll (${s.roll})`).toBe(true);
    if (staff.length) together++;
    await page.waitForTimeout(120);
  }
  expect(together).toBeGreaterThan(5);
  const r = await readStaff(page);
  const lenses = await page.locator(WB).getAttribute("data-lenses");
  expect(
    verify(r.notes, {
      degree: lenses?.includes("degree") ?? false,
      solfege: false,
      names: lenses?.includes("noteName") ?? false,
    }),
  ).toEqual([]);
  await page.getByTestId("play-toggle").click();
  await expect(page.locator(WB)).toHaveAttribute("data-playing", "0");
  expect(errors).toEqual([]);
});

/** Sharps and flats of the drawn key signature at the start of the main staff, and of the key panel's staff. */
function drawnSignatures(page: Page) {
  return page.evaluate(() => {
    const count = (root: Element | null) => {
      const g = root?.querySelector("g.abcjs-key-signature");
      const names = g ? [...g.querySelectorAll("path")].map((p) => p.getAttribute("data-name")) : [];
      return {
        sharps: names.filter((n) => n === "accidentals.sharp").length,
        flats: names.filter((n) => n === "accidentals.flat").length,
      };
    };
    return {
      staff: count(document.querySelector(".oak-staff-host")),
      panel: count(document.querySelector("[data-testid=keysig-staff]")),
    };
  });
}

test("the key panel, the circle and the staff agree, from no accidentals to seven", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const cases: [string, string, number, number][] = [
    ["G4:major", "G major", 1, 0],
    ["F4:major", "F major", 0, 1],
    ["C#4:major", "C♯ major", 7, 0],
    ["Cb4:major", "C♭ major", 0, 7],
  ];
  for (const [arg, name, sharps, flats] of cases) {
    await openSketch(page, `setcpm(90/4)\n\nmel: n("0 2 4 7").scale("${arg}").s("piano")\n`, 1);
    const panels = page.getByTestId("panel-switch");
    for (const label of ["Key", "Circle"]) {
      const b = panels.getByRole("button", { name: label, exact: true });
      if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
    }
    await expect(page.getByTestId("key-panel-name")).toHaveText(name);
    await expect(page.getByTestId("circle-current")).toHaveText(name);
    // The ring's centre names the key's own signature (C♭ sits on B's slot: seven flats, not five sharps).
    await expect(page.locator(".oak-circle-sub")).toHaveText(sharps ? `${sharps}♯` : `${flats}♭`);
    // Key names on the circle are set in the UI face (the code face set "D ♯ m" and "B ♭ m" wide).
    const faces = await page
      .locator(".oak-circle-text, .oak-circle-minor, .oak-circle-center, .oak-circle-sub")
      .evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).fontFamily))]);
    for (const f of faces) expect(f, "circle key names in the code face").not.toMatch(/mono|Menlo|SF Mono/i);
    await expect(page.getByTestId("keysig-staff")).toHaveAttribute("data-ready", "1");
    await expect(page.getByTestId("staff-key")).toContainText(name);
    const sig = await drawnSignatures(page);
    expect(sig.staff, name).toEqual({ sharps, flats });
    expect(sig.panel, name).toEqual({ sharps, flats });
    await expect(page.getByTestId("key-panel-signature")).toContainText(
      sharps ? `${sharps} sharp` : flats ? `${flats} flat` : "no",
    );
    await expectNoHorizontalOverflow(page);
  }
  // C♭ major, panels open, both themes and sizes.
  const url = page.url();
  for (const [w, h] of [
    [1440, 900],
    [1280, 800],
  ] as const)
    for (const theme of ["paper", "bark"] as const) {
      await useUiPrefs(page, { theme, motion: "off" });
      await page.setViewportSize({ width: w, height: h });
      await page.goto(url);
      await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId("key-panel-name")).toHaveText("C♭ major");
      await expectNoHorizontalOverflow(page);
      expect(await contrastIssues(page), `${theme} ${w}`).toEqual([]);
      await page.screenshot({ path: `${SHOTS}/w3-key-panels-${theme}-${w}x${h}.png`, fullPage: true });
    }
});
