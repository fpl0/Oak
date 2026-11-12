// The engraving gallery: what the notation package draws, in both themes and both sizes
// (screenshots/, read by a person). Also pins the abcjs limit the same-step chord warning is about.
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import type { ShowOptions } from "./page.ts";

const SHOTS = fileURLToPath(new URL("./screenshots/", import.meta.url));
const MATRIX = [
  { theme: "paper", width: 1440, height: 900 },
  { theme: "bark", width: 1440, height: 900 },
  { theme: "paper", width: 1280, height: 800 },
  { theme: "bark", width: 1280, height: 800 },
] as const;

const GALLERY: ShowOptions[] = [
  {
    title: "D major, treble, degree + solfège",
    list: "D4:4 E4:4 F#4:4 G4:4 | A4:4 B4:4 C#5:4 D5:4",
    key: "D",
    bars: 2,
    annotations: { degree: true, solfege: true },
  },
  {
    title: "B♭ major, bass clef, note names",
    list: "Bb2:4 D3:4 F3:4 Bb3:4 | Eb3:2 F2:2",
    key: "Bb",
    bars: 2,
    staff: "bass",
    annotations: { noteName: true },
  },
  {
    title: "Grand staff split at middle C, ledger lines both sides",
    list: "[C3,G3,E4]:2 [B2,D4,G4]:2 | [A2,C4,A5]:2 [E2,B3,C6]:2",
    key: "C",
    bars: 2,
    staff: "grand",
  },
  {
    title: "Accidentals: bar-scoped, courtesy and natural signs (G major)",
    list: "F4:4 F4:4 F5:4 F#5:4 | F#4:4 C#5:4 C5:4 C#5:4",
    key: "G",
    bars: 2,
  },
  {
    title: "3/4 in E♭ minor, degrees above",
    list: "Eb4:4 Gb4:4 Bb4:4 | D5:2 Eb5:4",
    meter: "3/4",
    key: "Ebm",
    bars: 2,
    annotations: { degree: true, solfege: true, position: "above" },
  },
  { title: "C♯ major: seven sharps", list: "C#5:2 E#5:2 | G#5:2 C#5:2", key: "C#", bars: 2 },
  {
    title: "C♭ major: seven flats, bass clef",
    list: "Cb3:2 Eb3:2 | Gb3:2 Cb3:2",
    key: "Cb",
    bars: 2,
    staff: "bass",
  },
  {
    title: "Drawn annotations (staff engraved without them), names and degrees",
    list: "A4:4 C5:4 E5:4 A4:4",
    key: "Am",
    annotations: { degree: true, noteName: true },
    domAnnotations: true,
  },
];

async function open(page: Page, theme: string): Promise<void> {
  await page.routeWebSocket(/.*/, () => {});
  await page.goto("/");
  await page.waitForFunction(() => window.oakReady === true);
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
}

for (const m of MATRIX) {
  test(`gallery ${m.theme} ${m.width}x${m.height}`, async ({ page }) => {
    await page.setViewportSize({ width: m.width, height: m.height });
    await open(page, m.theme);
    for (const o of GALLERY) await page.evaluate((o) => window.oakNotation.show(o), o);
    // No horizontal overflow; every staff drew its notes.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    expect(await page.locator("svg").count()).toBe(GALLERY.length);
    await page.screenshot({ path: `${SHOTS}gallery-${m.theme}-${m.width}.png`, fullPage: true });
  });
}

test("abcjs limit pinned: a chord on one staff step draws its two heads at the same height", async ({
  page,
}) => {
  await open(page, "paper");
  const s = await page.evaluate(() => window.oakNotation.show({ list: "[F4,F#4]:2 r:2", key: "C" }));
  expect(s.abc).toContain("[F^F]8");
  const heads = s.geometry.notes[0]?.heads ?? [];
  expect(heads.length).toBe(2);
  expect(Math.abs((heads[0]?.y ?? 0) - (heads[1]?.y ?? 99))).toBeLessThan(1);
  await page.locator(`#${s.id}`).screenshot({ path: `${SHOTS}limit-same-step-chord.png` });
});
