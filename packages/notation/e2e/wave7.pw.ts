// Wave 7 in a real browser: what only abcjs's drawing can show. Slash noteheads under jazz-glyph chord symbols with
// section letters; ghost notes drawn in parentheses beside their heads; the additive time signatures of 5/4 and 7/8;
// a 4:3 tuplet with its bracket text; a polymeter's accents; rootless voicings over a walking bass on the grand
// staff. ONE test, one page load: the gallery is engraved once and the screenshots change theme and size in place
// (wave5.md §7.1). Everything the Score decides is proven by bun tests (wave7.test.ts, the golden corpus); this spec
// checks the drawing only. Screenshots go to screenshots/ (gitignored).
import { fileURLToPath } from "node:url";
import type { NEvent } from "@oak/content-kit";
import { rat } from "@oak/content-kit";
import { METERS, meterWith } from "@oak/theory";
import { expect, type Page, test } from "@playwright/test";
import {
  compingInput,
  formSectionMarks,
  type NotationInput,
  parseNoteList,
  polymeterMarks,
  polyrhythmMarks,
} from "../src/index.ts";
import type { Shown, ShowOptions } from "./page.ts";

const SHOTS = fileURLToPath(new URL("./screenshots/", import.meta.url));
const MATRIX = [
  { theme: "paper", width: 1440, height: 900 },
  { theme: "bark", width: 1440, height: 900 },
  { theme: "paper", width: 1280, height: 800 },
  { theme: "bark", width: 1280, height: 800 },
] as const;
const FOUR = METERS["4/4"];
const line = (dsl: string, track: string, meter = FOUR): NEvent[] => parseNoteList(dsl, { track, meter });
const input = (events: NEvent[], bars: number, extra: Partial<NotationInput> = {}): NotationInput => ({
  events,
  meter: FOUR,
  key: null,
  bars,
  staff: "treble",
  ...extra,
});
const sortEv = (e: NEvent[]) =>
  e.sort((a, b) => a.onset[0] / a.onset[1] - b.onset[0] / b.onset[1] || (a.midi ?? 0) - (b.midi ?? 0));

const CHANGES = [
  ["Bb^7", "Gm7"],
  ["Cm7", "F7"],
  ["Bb^7", "Gm7"],
  ["Cm7", "F7"],
];
const chords = (bars: string[][], from = 0) =>
  bars.flatMap((b, i) => b.map((symbol, k) => ({ bar: from + i, beat: k ? 3 : 1, symbol })));
const COMPING: ShowOptions = {
  title:
    "J3.L03 comping as slashes: the Charleston, then four to the bar, under rhythm changes in jazz glyphs",
  input: {
    ...compingInput(
      line(
        "[D4,F4,A4]:4. [D4,F4,A4]:8 r:2 | [D4,F4,A4]:4. [D4,F4,A4]:8 r:2 | [D4,F4,A4]:4 [D4,F4,A4]:4 [D4,F4,A4]:4 [D4,F4,A4]:4 | r:2 r:4 r:8 [D4,F4,A4]:8~ | [D4,F4,A4]:8 r:8 r:4 r:2",
        "chords",
      ),
      { track: "chords", bars: 5, chords: chords([...CHANGES, ["Bb^7"]]) },
    ),
    sections: formSectionMarks(["A", "B"], 4),
    chordStyle: "jazz",
  },
  barsPerLine: 5,
};
const groove = (): NEvent[] => {
  const hats = line(Array.from({ length: 16 }, () => "hh:16").join(" "), "hats").map((e, i) => ({
    ...e,
    gain: i % 2 ? 0.25 : 0.8,
  }));
  const snare = line("r:4 sd:16 r:16 r:16 sd:16 r:16 sd:16 r:16 sd:16 sd:16 r:16 r:16 sd:16", "snare").map(
    (e) => ({ ...e, gain: [4, 12].includes(Math.round((e.onset[0] / e.onset[1]) * 16)) ? 0.8 : 0.25 }),
  );
  const kick = line("bd:16 r:16 r:16 bd:16 r:16 r:16 bd:16 r:16 r:4 r:4", "kick");
  return sortEv([...hats, ...snare, ...kick]);
};
const GHOSTS: ShowOptions = {
  title: "R1.L03 funk pocket: the snare's and the hats' ghost notes in parentheses",
  input: input(groove(), 1, { staff: "percussion", ghosts: true }),
  ghosts: true,
  barsPerLine: 1,
};
const ODD: ShowOptions[] = [
  {
    title: "R2.L01 5/4 as 3+2 and R2.L02 7/8 as 2+2+3: the grouping in the time signature",
    input: {
      ...input(line("E4:8 G4:8 B4:8 G4:8 E4:8 G4:8 A4:8 B4:8 D5:8 B4:8", "mel", METERS["5/4"]), 1),
      meter: METERS["5/4"],
      showGrouping: true,
    },
    barsPerLine: 1,
  },
  {
    title: "7/8 as 2+2+3",
    input: {
      ...input(line("A4:8 C5:8 B4:8 D5:8 C5:8 B4:8 A4:8", "mel", meterWith("7/8")), 1),
      meter: meterWith("7/8"),
      showGrouping: true,
    },
    barsPerLine: 1,
  },
];
const POLY: ShowOptions[] = [
  {
    title: "R2.L04 4 against 3 in 3/4: four cowbells as a (4:3) bracket of quarters over three kicks",
    input: {
      ...input(
        sortEv([
          ...line("cb:8. cb:8. cb:8. cb:8.", "perc", METERS["3/4"]),
          ...line("bd:4 bd:4 bd:4", "kick", METERS["3/4"]),
        ]),
        1,
        { staff: "percussion", ...polyrhythmMarks({ track: "perc", a: 4, b: 3, bars: 1 }) },
      ),
      meter: METERS["3/4"],
    },
    barsPerLine: 1,
  },
  {
    title: "R2.L05 polymeter {0 ~ 4}%4: an accent where the three-step figure starts again",
    input: input(line("D3:4 r:4 A3:4 D3:4 | r:4 A3:4 D3:4 r:4 | A3:4 D3:4 r:4 A3:4", "bass"), 3, {
      staff: "bass",
      ...polymeterMarks({ track: "bass", steps: 3, stepsPerBar: 4 }),
    }),
    barsPerLine: 3,
  },
];
const VOICINGS: ShowOptions = {
  title:
    "J3.L01 rootless A and B voicings over a walk whose chromatic approach tones are spelled by direction",
  input: input(
    sortEv([
      ...line("[Bb3,D4,F4,A4]:2 [Bb3,D4,E4,A4]:2 | [A3,C4,E4,G4]:1 | [Bb3,D4,F4,A4]:1", "chords"),
      ...line("G2:4 A2:4 Bb2:4 B2:4 | C3:4 E3:4 F3:4 F#3:4 | G3:1", "bass").map((e) => {
        const { written: _w, ...rest } = e;
        return rest as NEvent;
      }),
    ]),
    3,
    {
      staff: "grand",
      split: "track",
      key: { tonic: "F", mode: "major" },
      chordStyle: "jazz",
      chords: [
        { bar: 0, beat: 1, symbol: "Gm7" },
        { bar: 0, beat: 3, symbol: "C7" },
        { bar: 1, beat: 1, symbol: "F^7" },
        { bar: 2, beat: 1, symbol: "Gm7" },
      ],
      brackets: [{ bar: 0, from: rat(0), to: rat(2), text: "A B A" }],
    },
  ),
  barsPerLine: 3,
};
const GALLERY: ShowOptions[] = [COMPING, GHOSTS, ...ODD, ...POLY, VOICINGS];

async function open(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Other engineers' edits must not reload the page mid-test (wave5.md §7.1).
  await page.routeWebSocket(/.*/, () => {});
  await page.goto("/");
  await page.waitForFunction(() => window.oakReady === true);
}
const show = (page: Page, o: ShowOptions) =>
  page.evaluate((x) => window.oakNotation.show(x), o) as Promise<Shown>;

test("Wave 7 notation draws slashes, ghost parentheses, additive meters, a 4:3 bracket and accents", async ({
  page,
}) => {
  await open(page);
  const shown: Shown[] = [];
  for (const o of GALLERY) shown.push(await show(page, o));
  for (const s of shown) {
    expect(s.approximate).toBe(false);
    expect(s.warnings).toEqual([]);
  }
  const [comping, ghosts, five, seven, fourThree, poly, voicings] = shown as [
    Shown,
    Shown,
    Shown,
    Shown,
    Shown,
    Shown,
    Shown,
  ];
  const glyphs = (id: string, sel: string) =>
    page.evaluate(
      ([i, q]) =>
        [...(document.getElementById(i as string)?.querySelectorAll(q as string) ?? [])].map(
          (e) => e.getAttribute("data-name") ?? e.textContent ?? "",
        ),
      [id, sel],
    );

  // Slashes: every stroke of the comping staff is a slash head (the tied push too), no round head anywhere.
  expect(comping.headGlyphs.length).toBe(10);
  for (const h of comping.headGlyphs) expect(h).toMatch(/^noteheads\.slash/);
  expect(five.headGlyphs.every((h) => !h.includes("slash"))).toBe(true);
  expect(comping.labels.filter((l) => l.kind === "symbol").map((l) => l.text)).toEqual([
    "B♭∆7",
    "G–7",
    "C–7",
    "F7",
    "B♭∆7",
    "G–7",
    "C–7",
    "F7",
    "B♭∆7",
  ]);
  expect(await page.locator(`#${comping.id} .oak-section`).allTextContents()).toEqual(["A", "B"]);

  // Ghost notes: a pair of parentheses either side of each ghost head, vertically centred on it.
  expect(ghosts.ghosts.length).toBe(12);
  const parens = await page.evaluate((id) => {
    const root = document.getElementById(id);
    return [...(root?.querySelectorAll(".oak-ghost") ?? [])].map((h) => {
      const r = h.getBoundingClientRect();
      const texts = [...(h.parentNode?.querySelectorAll(".oak-ghost-paren") ?? [])].map((t) => {
        const b = t.getBoundingClientRect();
        return { text: t.textContent, cx: b.left + b.width / 2, cy: b.top + b.height / 2 };
      });
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, texts };
    });
  }, ghosts.id);
  expect(parens.length).toBe(12);
  for (const p of parens) {
    // The nearest "(" on the left and ")" on the right of each ghost head: level with it and close beside it.
    for (const [glyph, side] of [
      ["(", -1],
      [")", 1],
    ] as const) {
      const near = p.texts
        .filter((t) => t.text === glyph && Math.sign(t.cx - p.cx) === side)
        .sort((a, b) => Math.abs(a.cy - p.cy) - Math.abs(b.cy - p.cy))[0];
      expect(near).toBeDefined();
      expect(Math.abs((near?.cy ?? 0) - p.cy)).toBeLessThan(p.h);
      expect(Math.abs((near?.cx ?? 0) - p.cx)).toBeLessThan(p.w * 2.5);
    }
  }
  // Marking again with nothing clears every mark.
  const left = await page.evaluate((id) => {
    const el = document.getElementById(id) as HTMLElement;
    window.oakNotation.markGhostNotes(el, []);
    return el.querySelectorAll(".oak-ghost, .oak-ghost-paren").length;
  }, ghosts.id);
  expect(left).toBe(0);
  // Marked again for the screenshots.
  const again = await page.evaluate(
    ([id, inp]) => {
      const el = document.getElementById(id as string) as HTMLElement;
      const n = window.oakNotation;
      return n.markGhostNotes(el, n.ghostMarks(n.buildScore(inp as NotationInput))).length;
    },
    [ghosts.id, GHOSTS.input] as const,
  );
  expect(again).toBe(12);

  // Additive time signatures: the groups over the denominator.
  expect(await glyphs(five.id, ".abcjs-time-signature [data-name]")).toEqual(["3+2", "4"]);
  expect(await glyphs(seven.id, ".abcjs-time-signature [data-name]")).toEqual(["2+2+3", "8"]);

  // 4:3: one bracket with its 4, and the ratio over it.
  expect(await glyphs(fourThree.id, ".abcjs-triplet [data-name]")).toEqual(["triplet-bracket", "4"]);
  expect(await page.locator(`#${fourThree.id} .abcjs-annotation`).allTextContents()).toEqual(["4:3"]);

  // The polymeter's accents: one per cycle start, every three beats (each D: bar 1 beats 1 and 4, bar 2 beat 3, bar 3
  // beat 2).
  expect((await glyphs(poly.id, "[data-name='scripts.sforzato']")).length).toBe(4);
  expect(await page.locator(`#${poly.id} .abcjs-annotation`).allTextContents()).toEqual(["3 over 4"]);

  // Voicings on the treble staff, the walk on the bass staff, B natural approaching C written as B.
  const byStaff = new Map<string, number>();
  for (const n of voicings.geometry.notes) byStaff.set(n.staff, (byStaff.get(n.staff) ?? 0) + 1);
  expect([...byStaff.values()].sort()).toEqual([4, 9]);
  const names = voicings.idMap.flatMap((e) => e.pitches);
  expect(names).toContain("B2");
  expect(names).toContain("F#3");

  for (const m of MATRIX) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), m.theme);
    await page.screenshot({ path: `${SHOTS}wave7-${m.theme}-${m.width}.png`, fullPage: true });
  }
});
