// Wave 4 review: chords on the Studio's staff and roll, read back from what is DRAWN. For hand-stacked triads in
// sharp and flat keys (seven of each included), a separate bass making slash chords on a grand staff, voicing(),
// two chords a bar and a chord on every beat, every notehead is read off the SVG and compared with the pitch it
// sounds (staff-read.ts), every chord symbol must stand above the top staff and every numeral below the bottom
// one, each over the note its chord starts on, and the chord band must say the same as the staff (spelled in the
// key: C♯m in A major, never D♭m). Expected chords come from @oak/theory (`chordOfRoman` in the key), never from
// the code under test. Then the chord band under a 64-bar song with a change on every beat, and the chord lenses
// hammered by keyboard while it plays, with the roll and the staff lighting the same notes.

import { chordOfRoman, displayRN, type KeySpec, parseRN, toLeadSheet } from "@oak/theory";
import { expect, type Page, test } from "@playwright/test";
import { SCREENSHOT_MATRIX } from "../../../../../e2e/support/stack.ts";
import { shoot, useUiPrefs } from "../../../../../e2e/support/ui.ts";
import { readStaff, verify } from "./staff-read.ts";
import { contrastIssues, createSketch, expectNoHorizontalOverflow, SHOTS, seed } from "./support.ts";

const WB = "[data-testid=workbench]";
const STAFF = "[data-testid=staff-view]";

interface Want {
  bar: number;
  beat: number;
  symbol: string;
  rn: string;
}

/** What theory says a numeral is in a key: its lead-sheet symbol (spelled in the key) and its display form. */
function chordsOf(key: KeySpec, plan: readonly [bar: number, beat: number, rn: string][]): Want[] {
  return plan.map(([bar, beat, rn]) => {
    const c = chordOfRoman(rn, key);
    const p = parseRN(rn, key);
    if (!c || !p) throw new Error(`theory cannot read ${rn} in ${key.tonic}`);
    return { bar, beat, symbol: toLeadSheet(c), rn: displayRN(p) };
  });
}

const DIATONIC = ["I", "ii", "iii", "IV", "V", "vi", "viio", "I"] as const;
const perBar = (rns: readonly string[]) => rns.map((rn, i) => [i + 1, 1, rn] as [number, number, string]);
const STACKS = "<[0,2,4] [1,3,5] [2,4,6] [3,5,7] [4,6,8] [5,7,9] [6,8,10] [7,9,11]>";
const TUNE = "<[4 2] [5 3] [6 4] [7 5] [8 6] [9 7] [10 8] [7@2]>";
const diatonicIn = (tonic: string, oct = 3) =>
  `chords: n("${STACKS}").scale("${tonic}${oct}:major").s("piano")\nmel: n("${TUNE}").scale("${tonic}${oct + 1}:major").s("piano")`;

interface Case {
  label: string;
  code: string;
  bars: number;
  key: KeySpec;
  want: Want[];
  grand?: boolean;
}

const k = (tonic: string, mode: "major" | "minor" = "major") => ({ tonic, mode }) as KeySpec;

const CASES: Case[] = [
  {
    label: "the seven triads of A major under a tune",
    code: diatonicIn("A"),
    bars: 8,
    key: k("A"),
    want: chordsOf(k("A"), perBar(DIATONIC)),
  },
  {
    label: "C♭ major: seven flats, F♭ and B♭°",
    code: diatonicIn("Cb", 4),
    bars: 8,
    key: k("Cb"),
    want: chordsOf(k("Cb"), perBar(DIATONIC)),
  },
  {
    label: "C♯ major: seven sharps, E♯m and B♯°",
    code: diatonicIn("C#"),
    bars: 8,
    key: k("C#"),
    want: chordsOf(k("C#"), perBar(DIATONIC)),
  },
  {
    label: "E♭ major on a grand staff: the bass line decides the inversion (B♭ over D), two chords a bar",
    code: [
      'chords: n("<[[2,4,7] [1,4,6]] [[0,2,5] [1,3,5]] [[2,4,7] [1,4,6]] [0,2,4]>").scale("Eb4:major").s("piano")',
      'bass: n("<[0 4] [5 1] [0 6] 0>").scale("Eb2:major").s("piano")',
    ].join("\n"),
    bars: 4,
    key: k("Eb"),
    grand: true,
    want: chordsOf(k("Eb"), [
      [1, 1, "I"],
      [1, 3, "V"],
      [2, 1, "vi"],
      [2, 3, "ii"],
      [3, 1, "I"],
      [3, 3, "V6"],
      [4, 1, "I"],
    ]),
  },
  {
    label: "voicing() over a bass: C G/B Am F, the slash chord from the bass",
    code: [
      'chords: chord("<C G Am F>").voicing().s("piano")',
      'bass: note("<c2 b1 a1 f1>").s("piano")',
      'mel: n("<[4 2] [4 1] [2 0] [5 3]>").scale("C5:major").s("piano")',
    ].join("\n"),
    bars: 4,
    key: k("C"),
    grand: true,
    want: chordsOf(k("C"), [
      [1, 1, "I"],
      [2, 1, "V6"],
      [3, 1, "vi"],
      [4, 1, "IV"],
    ]),
  },
  {
    label: "A minor: i iv V i with the raised seventh written as a note",
    code: [
      'chords: note("<[a3,c4,e4] [d4,f4,a4] [e3,g#3,b3] [a3,c4,e4]>").s("piano")',
      'mel: note("<[e5 c5] [d5 f5] [b4 g#4] a4>").s("piano")',
    ].join("\n"),
    bars: 4,
    key: k("A", "minor"),
    want: chordsOf(k("A", "minor"), [
      [1, 1, "i"],
      [2, 1, "iv"],
      [3, 1, "V"],
      [4, 1, "i"],
    ]),
  },
];

async function openSketch(page: Page, code: string, bars: number, theme: "paper" | "bark" = "paper") {
  const id = await createSketch(page, `Chords ${Date.now()}`, code);
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

async function setLens(page: Page, id: string, on: boolean) {
  const b = page.getByTestId(`lens-${id}`);
  if ((await b.getAttribute("aria-pressed")) !== String(on)) await b.click();
  await expect(b).toHaveAttribute("aria-pressed", String(on));
}

/** The labels drawn on the staff page now shown, each with the note it stands over and its staff line. */
function drawnLabels(page: Page) {
  return page.evaluate(() => {
    const svg = document.querySelector(".oak-staff-host svg") as SVGSVGElement;
    const num = (el: Element, re: RegExp) => {
      for (const c of el.classList) {
        const m = re.exec(c);
        if (m) return Number(m[1]);
      }
      return -1;
    };
    // Staff lines per system (abcjs line), top and bottom edges of every staff in it.
    const lines = new Map<number, { top: number; bottom: number }>();
    for (const g of svg.querySelectorAll("g.abcjs-staff")) {
      const l = num(g, /^abcjs-l(\d+)$/);
      const ys = [...g.querySelectorAll("path")].map((p) => p.getBoundingClientRect());
      if (ys.length < 5) continue;
      const top = Math.min(...ys.map((r) => r.top));
      const bottom = Math.max(...ys.map((r) => r.bottom));
      const cur = lines.get(l);
      lines.set(l, { top: Math.min(cur?.top ?? top, top), bottom: Math.max(cur?.bottom ?? bottom, bottom) });
    }
    const notes = [...svg.querySelectorAll("g.abcjs-note[data-oak-events]")].map((g) => {
      const label = g.getAttribute("aria-label") ?? "";
      const heads = [...g.querySelectorAll(".abcjs-notehead")].map((h) => h.getBoundingClientRect());
      return {
        bar: Number(/bar (\d+)/.exec(label)?.[1] ?? -1),
        beat: Number(/beat ([\d.]+)/.exec(label)?.[1] ?? -1),
        line: num(g, /^abcjs-l(\d+)$/),
        x: heads[0] ? heads[0].left + heads[0].width / 2 : -1,
      };
    });
    const labels = (cls: string) =>
      [...svg.querySelectorAll(`.${cls}`)].map((t) => {
        const r = t.getBoundingClientRect();
        return {
          text: (t.textContent ?? "").trim(),
          at: num(t, /^oak-ann-at(\d+)$/),
          line: num(t, /^abcjs-l(\d+)$/),
          x: r.left + r.width / 2,
          left: r.left,
          top: r.top,
          bottom: r.bottom,
        };
      });
    return { lines: [...lines], notes, chords: labels("oak-ann-chord"), rns: labels("oak-ann-rn") };
  });
}

/** The bars the staff shows now ("Bars 9–16 of 64"; one page: all of them). */
async function pageBars(page: Page, total: number): Promise<number[]> {
  const pager = page.getByTestId("staff-pager");
  let [a, b] = [1, total];
  if (await pager.isVisible().catch(() => false)) {
    const text = (await pager.textContent()) ?? "";
    const m = /Bars (\d+)[–-](\d+)/.exec(text) ?? /Bar (\d+)() of/.exec(text);
    if (m) [a, b] = [Number(m[1]), Number(m[2] || m[1])];
  }
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

/** `checkLabels` on every page of the staff (the pager turns its pages), back on page 1 at the end. */
async function checkAllLabels(page: Page, want: Want[], total: number, maxPages = 99): Promise<string[]> {
  const out: string[] = [];
  for (let p = 0; p < maxPages; p++) {
    const bars = await pageBars(page, total);
    out.push(...(await checkLabels(page, want, bars)).map((x) => `bars ${bars[0]}–: ${x}`));
    const next = page.getByRole("button", { name: "Next bars" });
    if (!(await next.isVisible().catch(() => false)) || (await next.isDisabled())) break;
    await next.click();
    await expect(page.locator(STAFF)).toHaveAttribute("data-page", String(p + 1));
    await expect(page.locator(STAFF)).toHaveAttribute("data-status", "ready");
  }
  const prev = page.getByRole("button", { name: "Previous bars" });
  while ((await prev.isVisible().catch(() => false)) && !(await prev.isDisabled())) await prev.click();
  return out;
}

/** Every label says theory's chord, sits over (under) the note of its beat, above (below) the staves. */
async function checkLabels(page: Page, want: Want[], bars: readonly number[]): Promise<string[]> {
  const d = await drawnLabels(page);
  const lines = new Map(d.lines);
  const out: string[] = [];
  const onPage = want.filter((w) => bars.includes(w.bar));
  const glyph = (s: string) => s.replace(/\s+/g, "");
  if (d.chords.map((c) => glyph(c.text)).join(" ") !== onPage.map((w) => w.symbol).join(" "))
    out.push(`symbols ${d.chords.map((c) => c.text).join(" ")} ≠ ${onPage.map((w) => w.symbol).join(" ")}`);
  if (d.rns.map((c) => glyph(c.text)).join(" ") !== onPage.map((w) => w.rn).join(" "))
    out.push(`numerals ${d.rns.map((c) => c.text).join(" ")} ≠ ${onPage.map((w) => w.rn).join(" ")}`);
  onPage.forEach((w, i) => {
    for (const [kind, lab] of [
      ["symbol", d.chords[i]],
      ["numeral", d.rns[i]],
    ] as const) {
      if (!lab) continue;
      const note = d.notes.find((n) => n.bar === w.bar && Math.abs(n.beat - w.beat) < 1e-6);
      if (!note) {
        out.push(`${kind} ${lab.text}: no note at bar ${w.bar} beat ${w.beat}`);
        continue;
      }
      if (note.line !== lab.line)
        out.push(`${kind} ${lab.text} on system ${lab.line}, its note on ${note.line}`);
      // Centred over its note (abcjs sets a label's start a little before the head).
      if (Math.abs(lab.x - note.x) > 14 && Math.abs(lab.left - note.x) > 14)
        out.push(`${kind} ${lab.text} at x ${Math.round(lab.x)}, its note at ${Math.round(note.x)}`);
      const sys = lines.get(lab.line);
      if (sys && kind === "symbol" && lab.bottom > sys.top + 1)
        out.push(`symbol ${lab.text} runs into the staff (${lab.bottom} > ${sys.top})`);
      if (sys && kind === "numeral" && lab.top < sys.bottom - 1)
        out.push(`numeral ${lab.text} runs into the staff (${lab.top} < ${sys.bottom})`);
    }
  });
  return out;
}

/** The chord band on the roll: the same chords, and every label fully visible or not drawn at all. */
async function checkBand(page: Page, want: Want[]): Promise<string[]> {
  const regions = await page.locator("[data-testid=chord-band] li.oak-chord-region").evaluateAll((els) =>
    els.map((el) => {
      const sym = el.querySelector(".oak-chord-symbol");
      const rn = el.querySelector(".oak-chord-rn");
      const box = el.getBoundingClientRect();
      const cut = (x: Element | null) => {
        if (!x || getComputedStyle(x).display === "none") return false;
        const r = x.getBoundingClientRect();
        return r.right > box.right + 0.5 || r.left < box.left - 0.5;
      };
      return {
        symbol: el.getAttribute("data-symbol"),
        rn: el.getAttribute("data-rn"),
        cut: cut(sym) || cut(rn),
        shown: (sym && getComputedStyle(sym).display !== "none" ? sym.textContent : "") ?? "",
      };
    }),
  );
  const out: string[] = [];
  const merged = want.filter((w, i) => i === 0 || want[i - 1]?.symbol !== w.symbol || w.beat === 1);
  if (regions.map((r) => r.symbol).join(" ") !== merged.map((w) => w.symbol).join(" "))
    out.push(`band ${regions.map((r) => r.symbol).join(" ")} ≠ ${merged.map((w) => w.symbol).join(" ")}`);
  if (regions.map((r) => r.rn).join(" ") !== merged.map((w) => w.rn).join(" "))
    out.push(`band numerals ${regions.map((r) => r.rn).join(" ")} ≠ ${merged.map((w) => w.rn).join(" ")}`);
  for (const r of regions) if (r.cut) out.push(`band label ${r.symbol} ${r.rn} is cut off`);
  return out;
}

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await seed(page, "C2 open");
  await page.close();
});

test("chords drawn: noteheads, accidentals, symbols and numerals in sharp and flat keys", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  let first = true;
  for (const c of CASES) {
    await openSketch(page, `setcpm(90/4)\n\n${c.code}\n`, c.bars);
    if (first) {
      await setLens(page, "chordSymbols", true);
      await setLens(page, "romanNumerals", true);
      await setLens(page, "noteNames", true);
      first = false;
    }
    await expect(page.locator(STAFF)).toHaveAttribute("data-status", "ready");
    await expect
      .poll(async () => (await readStaff(page)).notes.length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    const r = await readStaff(page);
    expect(r.problems, c.label).toEqual([]);
    // Pitches of every head (the lens lines of a second voice wait while numerals are drawn: below).
    expect(verify(r.notes, { degree: false, solfege: false, names: false }), c.label).toEqual([]);
    if (c.grand) await expect(page.getByTestId("staff-clef")).toHaveText(/Grand staff/);
    expect(await checkAllLabels(page, c.want, c.bars), c.label).toEqual([]);
    expect(await checkBand(page, c.want), c.label).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await page
      .locator(STAFF)
      .screenshot({ path: `${SHOTS}/w4-chords-${c.label.slice(0, 14).replace(/[^a-z0-9]+/gi, "-")}.png` });
    // Numerals off: every note, the chords under a tune included, has its degree, syllable and name lines.
    await setLens(page, "romanNumerals", false);
    await expect(page.locator(STAFF)).toHaveAttribute("data-status", "ready");
    await expect.poll(async () => (await readStaff(page)).notes.every((n) => n.lines.length > 0)).toBe(true);
    expect(
      verify((await readStaff(page)).notes, { degree: true, solfege: true, names: true }),
      c.label,
    ).toEqual([]);
    await setLens(page, "romanNumerals", true);
  }
});

// 64 bars of I vi IV V with a chord on every beat: 256 chords, a staff of eight pages and a roll of many.
const SONG_BARS = 64;
const SONG = [
  "setcpm(120/4)",
  "",
  'chords: n("<[[0,2,4] [5,7,9] [3,5,7] [4,6,8]] [[1,3,5] [4,6,8] [0,2,4] [6,8,10]]>").scale("Gb3:major").s("piano")',
  'mel: n("<[4 2 0 1] [3 1 4 2]>").scale("Gb4:major").s("piano")',
].join("\n");

test("a 64-bar song with a chord on every beat: the band stays legible, the staff pages right, lenses hammered while playing", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  const t0 = Date.now();
  await openSketch(page, `${SONG}\n`, SONG_BARS, "bark");
  const opened = Date.now() - t0;
  await setLens(page, "chordSymbols", true);
  await setLens(page, "romanNumerals", true);
  const gb = k("Gb");
  const plan: [number, number, string][] = [];
  for (let b = 1; b <= SONG_BARS; b++) {
    const rns = b % 2 ? ["I", "vi", "IV", "V"] : ["ii", "V", "I", "viio"];
    for (const [i, rn] of rns.entries()) plan.push([b, i + 1, rn]);
  }
  const want = chordsOf(gb, plan);
  // The first three pages of the staff: every label at its beat.
  expect(await checkAllLabels(page, want, SONG_BARS, 3)).toEqual([]);
  // The band: every region of the bars on screen is a whole label or none (never "C♯" for "C♯m7").
  const band = await checkBand(page, want);
  expect(band.filter((p) => p.includes("cut off"))).toEqual([]);
  // Hammer the chord lenses by keyboard while it plays.
  await page.getByTestId("play-toggle").click();
  await expect(page.locator(WB)).toHaveAttribute("data-playing", "1", { timeout: 20_000 });
  await page.locator(WB).focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press(i % 2 ? "Shift+R" : "Shift+H");
  await expect(page.locator(STAFF)).toHaveAttribute("data-status", "ready");
  // 10 presses each: back where it started.
  await expect(page.getByTestId("lens-chordSymbols")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("lens-romanNumerals")).toHaveAttribute("aria-pressed", "true");
  // The roll and the staff light the same events while it plays.
  let together = 0;
  for (let i = 0; i < 16; i++) {
    const s = await page.evaluate(() => ({
      staff: (document.querySelector(".oak-staff-host") as HTMLElement).dataset.activeEvents ?? "",
      roll: (document.querySelector("[data-testid=piano-roll]") as HTMLElement | null)?.dataset.active ?? "",
    }));
    const staff = s.staff.split(" ").filter(Boolean);
    const roll = new Set(s.roll.split(" ").filter(Boolean));
    for (const e of staff) expect(roll.has(e), `${e} lit on the staff only`).toBe(true);
    if (staff.length) together++;
    await page.waitForTimeout(120);
  }
  expect(together).toBeGreaterThan(4);
  await page.getByTestId("play-toggle").click();
  expect(errors).toEqual([]);
  await expectNoHorizontalOverflow(page);
  test.info().annotations.push({ type: "timing", description: `64-bar song opened in ${opened} ms` });
  await page.screenshot({ path: `${SHOTS}/w4-song64-bark-1440x900.png` });
});

test("Studio with chords, numerals and function in both themes at both sizes: AA text, nothing cut off", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const c = CASES[3] as Case;
  const id = await openSketch(page, `setcpm(90/4)\n\n${c.code}\n`, c.bars);
  await setLens(page, "chordSymbols", true);
  await setLens(page, "romanNumerals", true);
  await setLens(page, "function", true);
  for (const m of SCREENSHOT_MATRIX) {
    await useUiPrefs(page, { theme: m.theme, motion: "off" });
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.goto(`/studio/${id}`);
    await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("chord-band")).toBeVisible();
    expect(await checkBand(page, c.want), `${m.theme} ${m.width}`).toEqual([]);
    await expectNoHorizontalOverflow(page);
    expect(await contrastIssues(page), `${m.theme} ${m.width}`).toEqual([]);
    await shoot(page, SHOTS, "w4-studio-chords", m.theme);
  }
});

// A waltz in F with its chords as a lead sheet (the learner's switch, Shift+L): the melody alone on one staff in
// 3/4, the symbols over the notes their chords start on, two chords in bar 4.
const WALTZ = [
  "setcpm(90/3)",
  "",
  'chords: n("<[0,2,4] [3,5,7] [4,6,8] [[3,5,7]@2 [4,6,8]] [0,2,4]>").scale("F3:major").s("piano")',
  'mel: n("<[4 2 0] [3 5 3] [4 1 6] [5 3 4] [0@3]>").scale("F4:major").s("piano")',
].join("\n");

test("a lead sheet in 3/4: the melody alone, the symbols on their beats, in both themes", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await createSketch(page, "Waltz", WALTZ, { meter: "3/4" });
  await page.addInitScript((sid) => localStorage.setItem(`oak.studio.length.${sid}`, "5"), id);
  for (const m of SCREENSHOT_MATRIX) {
    await useUiPrefs(page, { theme: m.theme, motion: "off" });
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.goto(`/studio/${id}`);
    await expect(page.locator(`${WB}[data-analysis=ready]`)).toBeVisible({ timeout: 60_000 });
    const tab = page.getByTestId("tab-staff");
    if (await tab.isVisible().catch(() => false)) await tab.click();
    // The loop's length reads as itself (5 is not one of the usual lengths: the select said "1 bar").
    const length = page.getByRole("combobox", { name: "Length" });
    await expect(length).toHaveValue("5");
    expect(await length.evaluate((s: HTMLSelectElement) => s.selectedOptions[0]?.textContent)).toBe("5 bars");
    await setLens(page, "lead", true);
    await expect(page.locator(STAFF)).toHaveAttribute("data-lead", "1");
    // A lead sheet of five bars of one tune is one page.
    await expect(page.getByTestId("staff-pager")).toHaveCount(0);
    await expect(page.locator(STAFF)).toHaveAttribute("data-status", "ready");
    await expect(page.getByTestId("lead-badge")).toBeVisible();
    // One staff, every head the melody's (no chord noteheads), each at its pitch.
    const r = await readStaff(page);
    expect(r.problems).toEqual([]);
    expect(verify(r.notes, { degree: false, solfege: false, names: false })).toEqual([]);
    expect(r.notes.every((n) => n.said.length === 1)).toBe(true);
    const want = chordsOf(k("F"), [
      [1, 1, "I"],
      [2, 1, "IV"],
      [3, 1, "V"],
      [4, 1, "IV"],
      [4, 3, "V"],
      [5, 1, "I"],
    ]);
    const d = await drawnLabels(page);
    expect(d.chords.map((c) => c.text.replace(/\s+/g, ""))).toEqual(want.map((w) => w.symbol));
    expect(
      await checkLabels(
        page,
        want.map((w) => ({ ...w, rn: "" })),
        [1, 2, 3, 4, 5],
      ).then((p) => p.filter((x) => !x.startsWith("numerals"))),
    ).toEqual([]);
    await expectNoHorizontalOverflow(page);
    expect(await contrastIssues(page), `${m.theme} ${m.width}`).toEqual([]);
    await shoot(page, SHOTS, "w4-lead-waltz", m.theme);
    await setLens(page, "lead", false);
  }
});
