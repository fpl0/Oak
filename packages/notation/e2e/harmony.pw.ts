// Wave 4 in a real browser: chords on the staff (seconds offset, accidentals stacked), chord symbols above and
// Roman numerals below with their stable classes (`tagChordLabels`), each over the note it starts on, the grand
// staff with left-hand chords, lead sheets with a pickup laid out and paged for a narrow host, a key change
// inside a bar. Screenshots of every case in both themes at 1440x900 and 1280x800 go to screenshots/ (read by a
// person, gitignored).
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import type { LeadOptions, Shown, ShowOptions } from "./page.ts";

const SHOTS = fileURLToPath(new URL("./screenshots/", import.meta.url));
const MATRIX = [
  { theme: "paper", width: 1440, height: 900 },
  { theme: "bark", width: 1440, height: 900 },
  { theme: "paper", width: 1280, height: 800 },
  { theme: "bark", width: 1280, height: 800 },
] as const;

const AXIS = [
  { bar: 0, beat: 1, symbol: "C", rn: "I" },
  { bar: 1, beat: 1, symbol: "G/B", rn: "V6" },
  { bar: 2, beat: 1, symbol: "Am", rn: "vi" },
  { bar: 3, beat: 1, symbol: "F", rn: "IV" },
];
const GRACE: LeadOptions = {
  title: "Amazing Grace: 3/4, a one-beat pickup",
  melody:
    "r:2 C4:4 | F4:2 A4:8 F4:8 | A4:2 G4:4 | F4:2 D4:4 | C4:2 C4:4 | F4:2 A4:8 F4:8 | A4:2 G4:4 | C5:2 r:4",
  meter: "3/4",
  key: "F",
  bars: 8,
  pickup: { units: [1, 1] },
  chords: [
    { bar: 1, beat: 1, symbol: "F", rn: "I" },
    { bar: 2, beat: 1, symbol: "F", rn: "I" },
    { bar: 3, beat: 1, symbol: "Bb", rn: "IV" },
    { bar: 4, beat: 1, symbol: "F", rn: "I" },
    { bar: 5, beat: 1, symbol: "F", rn: "I" },
    { bar: 6, beat: 1, symbol: "F", rn: "I" },
    { bar: 7, beat: 1, symbol: "C", rn: "V" },
  ],
  width: 900,
};

const GALLERY: ShowOptions[] = [
  {
    title: "Triads in root position and inversions: I V6 vi IV, symbols above, numerals below",
    list: "[C4,E4,G4]:1 | [B3,D4,G4]:1 | [A3,C4,E4]:1 | [A3,C4,F4]:1",
    key: "C",
    bars: 4,
    labels: AXIS,
  },
  {
    title: "Seconds and stacked accidentals: Cadd9, G7 in its inversions, an F♯–G♯–A–B cluster",
    list: "[C4,D4,E4,G4]:4 [B3,D4,F4,G4]:4 [D4,F4,G4,B4]:4 [F4,G4,B4,D5]:4 | [C#4,E#4,G#4,B4]:2 [F#4,G#4,A4,B4]:2",
    key: "C",
    bars: 2,
    labels: [
      { bar: 0, beat: 1, symbol: "Cadd9", rn: "Iadd9" },
      { bar: 0, beat: 2, symbol: "G7/B", rn: "V65" },
      { bar: 0, beat: 3, symbol: "G7/D", rn: "V43" },
      { bar: 0, beat: 4, symbol: "G7/F", rn: "V42" },
      { bar: 1, beat: 1, symbol: "C#7", rn: "V7/IV" },
    ],
  },
  {
    title: "Bass clef: B♭ major triads, I ii V I",
    list: "[Bb2,D3,F3]:2 [C3,Eb3,G3]:2 | [F2,A2,C3,Eb3]:2 [Bb2,D3,F3]:2",
    key: "Bb",
    bars: 2,
    staff: "bass",
    labels: [
      { bar: 0, beat: 1, symbol: "Bb", rn: "I" },
      { bar: 0, beat: 3, symbol: "Cm", rn: "ii" },
      { bar: 1, beat: 1, symbol: "F7", rn: "V7" },
      { bar: 1, beat: 3, symbol: "Bb", rn: "I" },
    ],
  },
  {
    title: "Grand staff: the tune in the right hand, triads in the left, two chords in bar 3",
    tracks: {
      mel: "G4:4 r:4 E4:4 G4:4 | B4:4 r:4 G4:4 r:4 | A4:4 r:4 C5:4 A4:4 | A4:4 r:4 F4:4 r:4",
      lh: "[C3,E3,G3]:1 | [G2,B2,D3]:1 | [A2,C3,E3]:2 [E2,G2,B2]:2 | [F2,A2,C3]:1",
    },
    key: "C",
    bars: 4,
    staff: "grand",
    split: "track",
    trackClefs: { mel: "treble", lh: "bass" },
    labels: [
      { bar: 0, beat: 1, symbol: "C", rn: "I" },
      { bar: 1, beat: 1, symbol: "G", rn: "V" },
      { bar: 2, beat: 1, symbol: "Am", rn: "vi" },
      { bar: 2, beat: 3, symbol: "Em", rn: "iii" },
      { bar: 3, beat: 1, symbol: "F", rn: "IV" },
    ],
  },
  {
    title: "A key change on beat 3: G major from the middle of bar 2",
    list: "C4:4 D4:4 E4:4 F4:4 | G4:8 A4:8 B4:8 C5:8 D5:8 E5:8 F#5:8 G5:8",
    key: "C",
    bars: 2,
    keyChanges: [{ bar: 1, beat: 3, key: { tonic: "G", mode: "major" } }],
  },
  {
    title: "Numeral glyphs: V65/V, vii°7, iiø7, ♭VII",
    list: "[F#3,A3,C4,D4]:2 [G3,B3,D4]:2 | [B3,D4,F4,Ab4]:2 [C4,E4,G4]:2 | [D4,F4,Ab4,C5]:2 [Bb3,D4,F4]:2",
    key: "C",
    bars: 3,
    labels: [
      { bar: 0, beat: 1, symbol: "D7/F#", rn: "V65/V" },
      { bar: 0, beat: 3, symbol: "G", rn: "V" },
      { bar: 1, beat: 1, symbol: "Bo7", rn: "viio7" },
      { bar: 1, beat: 3, symbol: "C", rn: "I" },
      { bar: 2, beat: 1, symbol: "Dm7b5", rn: "iih7" },
      { bar: 2, beat: 3, symbol: "Bb", rn: "bVII" },
    ],
  },
];

async function open(page: Page, theme = "paper"): Promise<void> {
  await page.routeWebSocket(/.*/, () => {});
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForFunction(() => window.oakReady === true);
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
}
const show = (page: Page, o: ShowOptions): Promise<Shown> =>
  page.evaluate((o) => window.oakNotation.show(o), o);
const showLead = (page: Page, o: LeadOptions): Promise<Shown[]> =>
  page.evaluate((o) => window.oakNotation.showLead(o), o);

/** Label text as compared: abcjs draws b, # and o of a chord symbol as glyphs. */
const key = (t: string) => t.replace(/♭/g, "b").replace(/♯/g, "#").replace(/°/g, "o").replace(/\s+/g, "");

/** The labels the Score asked for are all tagged, in order, with their texts. */
function expectTagged(s: Shown): void {
  const got = (kind: "symbol" | "roman") =>
    s.labels.filter((l) => l.kind === kind).map((l) => `${l.i}:${key(l.text)}`);
  const want = (list: { text: string }[]) => list.map((a, i) => `${i}:${key(a.text)}`);
  expect(got("symbol")).toEqual(want(s.want.symbols));
  expect(got("roman")).toEqual(want(s.want.romans));
}

/** Each label stands over (under) the note that starts where it does, symbols above every head, numerals below. */
function expectAligned(s: Shown, opts: { romanStaff: string; topStaff: string }): void {
  const headOf = (onset: number, staff: string) => {
    const ids = s.idMap.filter((e) => Math.abs(e.onset - onset) < 1e-9).map((e) => e.n);
    const notes = s.geometry.notes.filter((g) => ids.includes(g.n) && g.staff === staff);
    return notes[0]?.heads ?? [];
  };
  for (const l of s.labels) {
    const want = l.kind === "symbol" ? s.want.symbols[l.i] : s.want.romans[l.i];
    expect(want).toBeDefined();
    const heads = headOf(want?.at ?? -1, l.kind === "symbol" ? opts.topStaff : opts.romanStaff);
    expect(heads.length).toBeGreaterThan(0);
    const cx = Math.min(...heads.map((h) => h.x)) + 3;
    // abcjs centres a chord symbol on the note and starts an annotation at its head: within a head or two.
    expect(Math.abs(l.x - cx)).toBeLessThan(l.kind === "symbol" ? 24 : 40);
    const hy = (heads[0]?.y ?? 0) + (heads[0]?.height ?? 0) / 2;
    const band = s.geometry.staves.find(
      (b) => b.staff === (l.kind === "symbol" ? opts.topStaff : opts.romanStaff) && b.y0 <= hy && hy <= b.y1,
    );
    expect(band).toBeDefined();
    if (l.kind === "symbol") expect(l.bottom).toBeLessThanOrEqual((band?.topLineY ?? 0) + 1);
    else expect(l.top).toBeGreaterThanOrEqual((band?.topLineY ?? 0) + 4 * (band?.lineSpacing ?? 0) - 1);
  }
}

test("chord symbols and numerals are tagged with stable classes, in order, over the note they start on", async ({
  page,
}) => {
  await open(page);
  const triads = await show(page, GALLERY[0] as ShowOptions);
  expect(triads.labels.filter((l) => l.kind === "symbol")).toHaveLength(4);
  expect(triads.labels.filter((l) => l.kind === "roman")).toHaveLength(4);
  expectTagged(triads);
  expectAligned(triads, { topStaff: "S1", romanStaff: "S1" });
  // Re-tagging replaces the classes rather than adding more.
  const again = await page.evaluate((id) => {
    const N = window.oakNotation;
    const el = document.getElementById(id) as HTMLElement;
    const melody = N.parseNoteList("[C4,E4,G4]:1 | [B3,D4,G4]:1 | [A3,C4,E4]:1 | [A3,C4,F4]:1");
    const { score } = N.notate({
      events: melody,
      meter: N.METERS["4/4"],
      key: { tonic: "C", mode: "major" },
      bars: 4,
      staff: "treble",
      ...N.chordLabelInput(
        [
          { bar: 0, beat: 1, symbol: "C", rn: "I" },
          { bar: 1, beat: 1, symbol: "G/B", rn: "V6" },
          { bar: 2, beat: 1, symbol: "Am", rn: "vi" },
          { bar: 3, beat: 1, symbol: "F", rn: "IV" },
        ],
        { symbols: true, romans: true },
      ),
    });
    N.tagChordLabels(el, score);
    N.tagChordLabels(el, score);
    return [...el.querySelectorAll(".oak-ann-chord")].map((t) => t.getAttribute("class"));
  }, triads.id);
  expect(again).toHaveLength(4);
  for (const c of again) expect((c ?? "").match(/oak-ann-at\d+/g)).toHaveLength(1);

  // The grand staff: symbols over the right hand, numerals under the left hand, two in bar 3.
  const grand = await show(page, GALLERY[3] as ShowOptions);
  expectTagged(grand);
  expectAligned(grand, { topStaff: "RH", romanStaff: "LH" });
  expect(grand.geometry.staves.map((b) => b.clef)).toEqual(["treble", "bass"]);
});

test("the lens filter: symbols only, numerals only", async ({ page }) => {
  await open(page);
  const symbols = await show(page, { ...(GALLERY[0] as ShowOptions), lenses: { symbols: true } });
  expect(symbols.labels.map((l) => l.kind)).toEqual(["symbol", "symbol", "symbol", "symbol"]);
  const romans = await show(page, { ...(GALLERY[0] as ShowOptions), lenses: { romans: true } });
  expect(romans.labels.map((l) => l.text)).toEqual(["I", "V6", "vi", "IV"]);
  expect(romans.abc).not.toContain('"G/B"');
});

test("a lead sheet with a pickup: bar 0 short, numbered from the first full bar, paged for a narrow host", async ({
  page,
}) => {
  await open(page);
  // Wide host: one page, the pickup plus four bars on the first system, bar 5 starts the second.
  const wide = await showLead(page, GRACE);
  expect(wide).toHaveLength(1);
  const [one] = wide as [Shown];
  expectTagged(one);
  expectAligned(one, { topStaff: "S1", romanStaff: "S1" });
  expect(one.barNumbers).toEqual(["5"]);
  expect(one.idMap[0]?.bar).toBe(0);
  expect(one.idMap[1]?.bar).toBe(1);
  expect(one.abc).not.toMatch(/:\||\|:/);
  // The pickup bar is short: its bar line comes right after the pickup note.
  const firstBand = one.geometry.staves[0];
  const bar0 = firstBand?.bars[0];
  const bar1 = firstBand?.bars[1];
  expect(bar0 && bar1 && bar0.x1 - bar0.x0 < (bar1.x1 - bar1.x0) * 0.7).toBe(true);
  // Narrow host (a 300 px panel, numerals on): one bar a system, three systems a page, so three pages, each
  // numbered from its own first bar; only the last ends with the final barline.
  const narrow = await showLead(page, { ...GRACE, width: 300, romans: true });
  expect(narrow.map((p) => p.idMap.map((e) => e.bar))).toEqual([
    [0, 1, 1, 1, 2, 2, 3, 3],
    [4, 4, 5, 5, 5, 6, 6],
    [7],
  ]);
  expect(narrow.map((p) => p.barNumbers)).toEqual([["2", "3"], ["4", "5", "6"], ["7"]]);
  expect(narrow[1]?.abc).toContain("%%setbarnb 4");
  expect(narrow[1]?.abc).toContain("%%stretchlast 1");
  expect(narrow[0]?.abc).not.toContain("|]");
  expect(narrow[2]?.abc).toContain("|]");
  // A 480 px panel: two bars a system; the bar left over stays on the page instead of making a page alone.
  const half = await showLead(page, { ...GRACE, width: 480, romans: true });
  expect(half).toHaveLength(1);
  expect(half[0]?.barNumbers).toEqual(["3", "5", "7"]);
  for (const p of [...narrow, ...half]) expectTagged(p);
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("section.staff svg")].some(
      (svg) => (svg.getBoundingClientRect().right ?? 0) > window.innerWidth,
    ),
  );
  expect(overflow).toBe(false);
});

test("a key change inside a bar draws the new signature there and keeps the bar one measure", async ({
  page,
}) => {
  await open(page);
  const s = await show(page, GALLERY[4] as ShowOptions);
  expect(s.abc).toContain("[K:G]");
  // Still two measures: the geometry counts two bars, and the eighth notes before and after the change are in bar 2.
  const band = s.geometry.staves[0];
  expect(band?.bars.map((b) => b.cycle)).toEqual([0, 1]);
  expect(s.idMap.filter((e) => e.bar === 2)).toHaveLength(8);
  // The new signature's sharp is drawn between the fourth and fifth eighth of bar 2.
  const sharpX = await page.evaluate((id) => {
    const el = document.getElementById(id) as HTMLElement;
    const keys = [...el.querySelectorAll(".abcjs-staff-extra.abcjs-key-signature, g.abcjs-key-signature")];
    return keys.map((k) => k.getBoundingClientRect().left);
  }, s.id);
  const x4 = s.geometry.notes.find((g) => g.n === 7)?.box.x ?? 0;
  const x5 = s.geometry.notes.find((g) => g.n === 8)?.box.x ?? 0;
  expect(sharpX.some((x) => x > x4 && x < x5)).toBe(true);
});

for (const m of MATRIX) {
  test(`harmony gallery ${m.theme} ${m.width}x${m.height}`, async ({ page }) => {
    await page.setViewportSize({ width: m.width, height: m.height });
    await open(page, m.theme);
    for (const o of GALLERY) {
      const s = await show(page, o);
      expectTagged(s);
    }
    await showLead(page, { ...GRACE, romans: true });
    await showLead(page, { ...GRACE, title: "Amazing Grace in a 480 px panel", width: 480, romans: true });
    await showLead(page, { ...GRACE, title: "Amazing Grace in a 300 px panel", width: 300 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await page.screenshot({ path: `${SHOTS}harmony-${m.theme}-${m.width}.png`, fullPage: true });
  });
}
