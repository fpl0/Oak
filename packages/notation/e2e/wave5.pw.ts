// Wave 5 in a real browser: section labels and double bars on a lead sheet, "Swing 8ths" on the tempo line clear of
// the first chord symbol, minor keys with raised 6 and 7, blue notes, a bass line down to E1, the 12-bar chart
// engraved (slash noteheads) and as HTML (`renderChart`), and c5 (lens lines under a second voice clear of the
// numerals, one notehead for a unison, compact chord names at four chords a bar in a narrow host). Screenshots of
// every case in both themes at 1440x900 and 1280x800 go to screenshots/ (read by a person, gitignored).
import { fileURLToPath } from "node:url";
import type { NEvent } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { expect, type Page, test } from "@playwright/test";
import type { ChartOptions, Shown, ShowOptions } from "./page.ts";

const SHOTS = fileURLToPath(new URL("./screenshots/", import.meta.url));
const MATRIX = [
  { theme: "paper", width: 1440, height: 900 },
  { theme: "bark", width: 1440, height: 900 },
  { theme: "paper", width: 1280, height: 800 },
  { theme: "bark", width: 1280, height: 800 },
] as const;

const FOUR_FOUR = METERS["4/4"];
/** Events from MIDI numbers on a grid of `unit` (null = rest), one track, from grid step `from`. */
function line(midis: (number | null)[], track = "mel", unit: [number, number] = [1, 4], from = 0): NEvent[] {
  return midis.flatMap((m, i) =>
    m === null
      ? []
      : [
          {
            id: `${track}|${from + i}`,
            track,
            onset: [(from + i) * unit[0], unit[1]] as [number, number],
            dur: unit,
            midi: m,
            pitchSource: "note-num" as const,
            gain: 0.8,
            locs: [],
          },
        ],
  );
}
const C = { tonic: "C", mode: "major" } as const;
const TWELVE_C = ["C7", "C7", "C7", "C7", "F7", "F7", "C7", "C7", "G7", "F7", "C7", "G7"];
const VERSE_CHORUS = [
  { bar: 0, text: "Verse", tag: "verse", doubleBar: false },
  { bar: 4, text: "Chorus", tag: "chorus", doubleBar: true },
];

const GALLERY: ShowOptions[] = [
  {
    title:
      "Verse and chorus: a label over each section, a double bar before the chorus; Swing 8ths on the tempo line",
    input: {
      events: line([
        64,
        null,
        67,
        64,
        60,
        null,
        64,
        null,
        65,
        null,
        69,
        65,
        62,
        null,
        null,
        null,
        72,
        null,
        69,
        null,
        71,
        null,
        67,
        null,
        72,
        null,
        76,
        72,
        72,
        null,
        null,
        null,
      ]),
      meter: FOUR_FOUR,
      key: C,
      bars: 8,
      staff: "lead",
      swing: { subdivision: 8, amount: 1 / 3 },
      tempoBpm: 108,
      chords: ["C", "Am", "F", "G", "F", "G", "C", "C"].map((symbol, bar) => ({ bar, beat: 1, symbol })),
      sections: VERSE_CHORUS,
    },
    barsPerLine: 4,
    abcOptions: { barNumbers: true },
  },
  {
    title:
      "A melodic minor up and natural minor down in one bar; G sharp in bar 1, a courtesy natural in bar 2",
    input: {
      events: [
        ...line([69, 71, 72, 74, 76, 78, 80, 81, 79, 77, 76, 74, 72, 71, 69, null], "mel", [1, 16]),
        ...line([76, 80, 81, 83], "mel", [1, 4], 4),
        ...line([84, 83, 81, 79], "mel", [1, 4], 8),
      ],
      meter: FOUR_FOUR,
      key: { tonic: "A", mode: "minor" },
      bars: 3,
      staff: "treble",
    },
    annotations: { degree: true, solfege: true },
    // Sixteenths with two lens lines: one bar a line keeps the texts apart (`staffTextLayout`).
    barsPerLine: 1,
  },
  {
    title: "G sharp minor, harmonic: five sharps, the raised 7th F double sharp",
    input: {
      events: line([75, 79, 80, null]),
      meter: FOUR_FOUR,
      key: { tonic: "G#", mode: "harmonic minor" },
      bars: 1,
      staff: "treble",
    },
  },
  {
    title:
      "The C blues scale up and down over C7 and F7: no signature, E flat and B flat, F sharp up, G flat down",
    input: {
      events: line([60, 63, 65, 66, 67, 70, 72, 70, 67, 66, 65, 63, 60, null, null, null], "gtr", [1, 8]),
      meter: FOUR_FOUR,
      key: { tonic: "C", mode: "blues" },
      bars: 2,
      staff: "treble",
      chords: [
        { bar: 0, beat: 1, symbol: "C7" },
        { bar: 1, beat: 1, symbol: "F7" },
      ],
    },
    annotations: { degree: true },
  },
  {
    title: "Bass line with approach tones down to E1: G sharp into A, A flat into G, F sharp 1 into G1",
    input: {
      events: line([36, 40, 32, 33, 36, 35, 32, 31, 28, 30, 31, 35], "bass"),
      meter: FOUR_FOUR,
      key: C,
      bars: 3,
      staff: "bass",
      chords: ["C", "Am", "G"].map((symbol, bar) => ({ bar, beat: 1, symbol })),
    },
    annotations: { degree: true },
  },
  {
    title: "c5: a tune over held chords, degrees and syllables under both voices, numerals below them",
    input: {
      events: [
        ...line([76, 74, 72, 71, 72, null, null, null]),
        ...[60, 64, 67].flatMap((m) => line([m, m], `ch${m}`, [1, 1])),
      ].sort((a, b) => a.onset[0] / a.onset[1] - b.onset[0] / b.onset[1] || (a.midi ?? 0) - (b.midi ?? 0)),
      meter: FOUR_FOUR,
      key: C,
      bars: 2,
      staff: "treble",
      romans: [
        { bar: 0, beat: 1, rn: "I" },
        { bar: 1, beat: 1, rn: "I" },
      ],
    },
    annotations: { degree: true, solfege: true },
  },
  {
    title: "c5: a chord tone in unison with the tune is one notehead",
    input: {
      events: [
        ...line([70, 70], "mel", [1, 1]),
        ...line([63, 66], "ch", [1, 1]),
        ...line([66, 70], "ch2", [1, 1]),
        ...line([70, 73], "ch3", [1, 1]),
      ].sort((a, b) => a.onset[0] / a.onset[1] - b.onset[0] / b.onset[1] || (a.midi ?? 0) - (b.midi ?? 0)),
      meter: FOUR_FOUR,
      key: { tonic: "Eb", mode: "minor" },
      bars: 2,
      staff: "treble",
    },
  },
];

const CHART: ChartOptions = {
  title: "12-bar blues in C (engraved)",
  chart: {
    chords: [
      ...TWELVE_C.slice(0, 11).map((symbol, bar) => ({ bar, beat: 1, symbol })),
      { bar: 11, beat: 1, symbol: "C7" },
      { bar: 11, beat: 3, symbol: "G7" },
    ],
    bars: 12,
    meter: FOUR_FOUR,
    key: C,
    swing: { subdivision: 8, amount: 1 / 3 },
    sections: [{ bar: 0, text: "Chorus 1", tag: "chorus1", doubleBar: false }],
  },
  mode: "abc",
  width: 900,
};

async function open(page: Page, theme = "paper"): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForFunction(() => window.oakReady === true);
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
}
type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width - 0.5 &&
  b.x < a.x + a.width - 0.5 &&
  a.y < b.y + b.height - 0.5 &&
  b.y < a.y + a.height - 0.5;
async function boxes(page: Page, id: string, selector: string): Promise<(Box & { text: string })[]> {
  return page.evaluate(
    ([sel, root]) =>
      [...(document.getElementById(root as string)?.querySelectorAll(sel as string) ?? [])].map((t) => {
        const r = t.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, text: t.textContent ?? "" };
      }),
    [selector, id],
  );
}

test.describe("Wave 5 notation in the browser", () => {
  test("sections: labels tagged over their bars, a double bar before the chorus; Swing 8ths clear of the first symbol", async ({
    page,
  }) => {
    await open(page);
    const s = (await page.evaluate((o) => window.oakNotation.show(o), GALLERY[0] as ShowOptions)) as Shown;
    const labels = await boxes(page, s.id, "text.oak-section");
    expect(labels.map((l) => l.text)).toEqual(["Verse", "Chorus"]);
    expect(await page.locator(`#${s.id} .oak-section-chorus`).count()).toBe(1);
    // The chorus label stands over bar 5, which starts the second system (four bars a line): below the verse's.
    expect((labels[1] as Box).y).toBeGreaterThan((labels[0] as Box).y + 20);
    expect(s.idMap.some((e) => e.bar === 5)).toBe(true);
    const tempo = await boxes(page, s.id, "text");
    const swing = tempo.find((t) => t.text.includes("Swing 8ths"));
    const first = (await boxes(page, s.id, "text.abcjs-chord"))[0];
    expect(swing && first && !overlap(swing, first)).toBe(true);
    for (const l of labels) expect(overlap(l, first as Box)).toBe(false);
    expect(s.abc).toContain("z8 ||\n[P:Chorus]");
  });

  test("c5: the second voice's lens lines sit between the first voice's and the numerals, nothing overlaps", async ({
    page,
  }) => {
    await open(page);
    const s = (await page.evaluate((o) => window.oakNotation.show(o), GALLERY[5] as ShowOptions)) as Shown;
    const lyrics = await boxes(page, s.id, "text.abcjs-lyric tspan");
    const numerals = await boxes(page, s.id, "text.oak-ann-rn");
    expect(numerals.map((n) => n.text)).toEqual(["I", "I"]);
    const words = lyrics.filter((l) => l.text.trim() !== "");
    // Tune: 5 notes x 2 lines; chords: 2 x 2 lines.
    expect(words.length).toBe(14);
    for (const w of words) for (const n of numerals) expect(overlap(w, n)).toBe(false);
    for (let i = 0; i < words.length; i++)
      for (let j = i + 1; j < words.length; j++)
        expect(overlap(words[i] as Box, words[j] as Box)).toBe(false);
    // The chord's lines ("1 3 5", "do mi sol") are under the tune's and above the numerals.
    const chord = words.find((w) => /1\s+3\s+5/.test(w.text));
    const tune = words.find((w) => w.text.trim() === "3");
    expect(chord && tune && chord.y > tune.y).toBe(true);
    expect(chord && numerals[0] && chord.y + chord.height <= (numerals[0] as Box).y + 0.5).toBe(true);
  });

  test("c5: a unison draws one head; compact names keep four chords a bar apart in a narrow host", async ({
    page,
  }) => {
    await open(page);
    const uni = (await page.evaluate((o) => window.oakNotation.show(o), GALLERY[6] as ShowOptions)) as Shown;
    expect(await page.locator(`#${uni.id} .abcjs-note.oak-e0 .abcjs-notehead`).count()).toBe(3);
    // Four three-note chords a bar, names on, in a 390 px host: `staffTextLayout` picks compact names.
    const shown = await page.evaluate(() => {
      const n = window.oakNotation;
      const meter = n.METERS["4/4"];
      const events = [0, 1, 2, 3].flatMap((i) =>
        [63, 66, 70].map((midi, k) => ({
          id: `c|${i * 3 + k}`,
          track: `v${k}`,
          onset: [i, 4] as [number, number],
          dur: [1, 4] as [number, number],
          midi,
          pitchSource: "note-num" as const,
          gain: 0.8,
          locs: [],
        })),
      );
      const input = {
        events,
        meter,
        key: { tonic: "Eb", mode: "minor" as const },
        bars: 1,
        staff: "treble" as const,
      };
      const score = n.buildScore(input);
      const layout = n.staffTextLayout(390, score, { noteName: true });
      return n
        .show({
          input: { ...input, annotations: { noteName: true, compactNames: layout.compactNames } },
          barsPerLine: layout.barsPerLine,
          params: { staffwidth: layout.staffwidth },
          width: 390,
          title: "Four chords a bar, names on, 390 px",
          annotations: { noteName: true, compactNames: layout.compactNames },
        })
        .then((s) => ({ s, layout }));
    });
    expect(shown.layout.compactNames).toBe(true);
    const names = (await boxes(page, shown.s.id, "text.abcjs-lyric")).filter((t) => t.text.trim());
    expect(names).toHaveLength(4);
    for (let i = 1; i < names.length; i++) expect(overlap(names[i - 1] as Box, names[i] as Box)).toBe(false);
  });

  test("the 12-bar chart: engraved slashes and symbols in three lines; the HTML chart lights the bar playing", async ({
    page,
  }) => {
    await open(page);
    const c = await page.evaluate((o) => window.oakNotation.showChart(o), CHART);
    expect(c.warnings).toEqual([]);
    expect(await page.locator(`#${c.id} .abcjs-note`).count()).toBe(48);
    expect(await page.locator(`#${c.id} text.abcjs-chord`).count()).toBe(13);
    expect(await page.locator(`#${c.id} .oak-cb12`).count()).toBeGreaterThanOrEqual(4);
    const html = await page.evaluate(
      (o) => window.oakNotation.showChart({ ...o, mode: "dom", title: "12-bar blues in C (HTML)" }),
      CHART,
    );
    expect(html.bars).toHaveLength(12);
    expect(html.bars[0]).toBe("Chorus 1, bar 1: C7");
    expect(html.bars[11]).toBe("Bar 12: C7, then G7 on beat 3");
    const rows = page.locator(`#${html.id} .oak-chart-line`);
    expect(await rows.count()).toBe(3);
    await page.evaluate((id) => window.oakNotation.lightBar(id, 9), html.id);
    await expect(page.locator(`#${html.id} .oak-chart-b9`)).toHaveClass(/oak-active/);
    await expect(page.locator(`#${html.id} .oak-chart-b9`)).toHaveAttribute("aria-current", "true");
    await page.evaluate((id) => window.oakNotation.lightBar(id, null), html.id);
    await expect(page.locator(`#${html.id} .oak-active`)).toHaveCount(0);
    // Nothing in the chart animates (reduced motion and otherwise).
    const moving = await page.evaluate(
      (id) =>
        [...(document.getElementById(id)?.querySelectorAll("*") ?? [])].filter((e) => {
          const s = getComputedStyle(e);
          return s.transitionDuration !== "0s" || s.animationName !== "none";
        }).length,
      html.id,
    );
    expect(moving).toBe(0);
  });

  test("bass to E1: the degree line clears the lowest ledger-line notes", async ({ page }) => {
    await open(page);
    const s = (await page.evaluate((o) => window.oakNotation.show(o), GALLERY[4] as ShowOptions)) as Shown;
    const heads = await boxes(page, s.id, ".abcjs-notehead");
    const words = (await boxes(page, s.id, "text.abcjs-lyric")).filter((t) => t.text.trim());
    expect(words.map((w) => w.text)).toEqual(["1", "3", "♯5", "6", "1", "7", "♭6", "5", "3", "♯4", "5", "7"]);
    const lowest = Math.max(...heads.map((h) => h.y + h.height));
    for (const w of words) expect(w.y).toBeGreaterThanOrEqual(lowest - 0.5);
  });

  for (const m of MATRIX) {
    test(`wave 5 gallery ${m.theme} ${m.width}x${m.height}`, async ({ page }) => {
      await page.setViewportSize({ width: m.width, height: m.height });
      await open(page, m.theme);
      for (const o of GALLERY) await page.evaluate((x) => window.oakNotation.show(x), o);
      await page.evaluate((o) => window.oakNotation.showChart(o), CHART);
      await page.evaluate(
        (o) => window.oakNotation.showChart({ ...o, mode: "dom", title: "12-bar blues in C (HTML)" }),
        CHART,
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${SHOTS}wave5-${m.theme}-${m.width}.png`, fullPage: true });
    });
  }
});
