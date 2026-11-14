// Wave 6 in a real browser: what only abcjs's drawing can show. A key change draws its cancelling naturals after a
// double bar and none where the signature stays (C major to A minor); guide tones are marked on the noteheads
// inside a voicing; left-hand voicings sit on the bass staff over a walking bass in two voices; triplets pushed over
// the beats, 6/8 and 12/8 beaming, applied and borrowed numerals. One page load: the gallery is engraved once and
// the screenshots change theme and size in place (wave5.md §7.1). Screenshots go to screenshots/ (gitignored).
import { fileURLToPath } from "node:url";
import type { KeySpec, NEvent } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { expect, type Page, test } from "@playwright/test";
import { harmonyLabels, keyChangesOf, type NotationInput, parseNoteList } from "../src/index.ts";
import type { Shown, ShowOptions } from "./page.ts";

const SHOTS = fileURLToPath(new URL("./screenshots/", import.meta.url));
const MATRIX = [
  { theme: "paper", width: 1440, height: 900 },
  { theme: "bark", width: 1440, height: 900 },
  { theme: "paper", width: 1280, height: 800 },
  { theme: "bark", width: 1280, height: 800 },
] as const;

const FOUR = METERS["4/4"];
const C: KeySpec = { tonic: "C", mode: "major" };
const key = (tonic: string, mode = "major") => ({ tonic, mode }) as KeySpec;
const line = (dsl: string, track = "mel", meter = FOUR): NEvent[] => parseNoteList(dsl, { track, meter });
/** Events with no written name (as `n()` and `chord()` give them): the staff decides the spelling. */
const bare = (events: NEvent[]): NEvent[] =>
  events.map((e) => {
    const { written: _w, ...rest } = e;
    return rest as NEvent;
  });
const input = (events: NEvent[], bars: number, extra: Partial<NotationInput> = {}): NotationInput => ({
  events,
  meter: FOUR,
  key: C,
  bars,
  staff: "treble",
  ...extra,
});

const KEY_CHANGE: ShowOptions = {
  title: "Key changes: D to C (two naturals), to F, to A minor (nothing drawn: the signature stays), to D",
  input: input(
    bare(
      line(
        "D4:4 F#4:4 A4:4 F#4:4 | C4:4 E4:4 G4:4 E4:4 | F4:4 A4:4 Bb4:4 A4:4 | D4:4 F4:4 A4:4 C#5:4 | D4:4 F#4:4 A4:4 D5:4",
      ),
    ),
    5,
    keyChangesOf([
      { bar: 1, key: key("D") },
      { bar: 2, key: C },
      { bar: 3, key: key("F") },
      { bar: 4, key: key("D", "harmonic minor") },
      { bar: 5, key: key("D") },
    ]),
  ),
  barsPerLine: 5,
};
const GUIDE: ShowOptions = {
  title:
    "Guide tones: the 3rd and the 7th of Dm7, G7 and Cmaj7 marked inside left-hand voicings on the bass staff",
  input: input(bare(line("[C4,E4,F4,A4]:1 | [B3,E4,F4,A4]:1 | [B3,D4,E4,G4]:1", "chords")), 3, {
    staff: "bass",
    ...harmonyLabels([
      { bar: 1, beat: 1, symbol: "Dm7", rn: "ii7" },
      { bar: 2, beat: 1, symbol: "G7", rn: "V7" },
      { bar: 3, beat: 1, symbol: "C^7", rn: "Imaj7" },
    ]),
  }),
  guide: true,
  barsPerLine: 3,
};
const TRIO: ShowOptions = {
  title: "U12.L06 trio: guitar above; left-hand comping and the walking bass in two voices on the bass staff",
  input: input(
    [
      ...line("r:4 A4:4 r:4 F4:4 | r:4 B4:4 r:4 G4:4", "gtr"),
      ...bare(
        line(
          "r:8 [C4,E4,F4,A4]:8 r:4 [C4,E4,F4,A4]:8 r:8 r:4 | r:8 [B3,E4,F4,A4]:8 r:4 [B3,E4,F4,A4]:8 r:8 r:4",
          "chords",
        ),
      ),
      ...line("D2:4 D2:4 D2:4 D2:4 | G2:4 G2:4 G2:4 G2:4", "bass"),
    ].sort((a, b) => a.onset[0] / a.onset[1] - b.onset[0] / b.onset[1] || (a.midi ?? 0) - (b.midi ?? 0)),
    2,
    {
      staff: "grand",
      trackClefs: { chords: "bass" },
      ...harmonyLabels([
        { bar: 1, beat: 1, symbol: "Dm7", rn: "ii7" },
        { bar: 2, beat: 1, symbol: "G7", rn: "V7" },
      ]),
    },
  ),
  barsPerLine: 2,
};
/** A tune pushed by a triplet eighth: the first note falls before the bar and is not played on the first pass. */
const pushed = line("C4:4 E4:4 G4:4 C5:4 | C4:4 E4:4 G4:4 C5:4")
  .map((e) => ({ ...e, onset: [e.onset[0] * 12 - e.onset[1], e.onset[1] * 12] as [number, number] }))
  .filter((e) => e.onset[0] >= 0);
const RHYTHM: ShowOptions[] = [
  {
    title: "U13.L03: the Ode's last phrase as written, a tie over the bar line and a dotted quarter",
    input: input(
      line("C4:4 D4:4 G3:4 E4:4~ | E4:4 E4:4 F4:4 G4:4 | G4:4 F4:4 E4:4 D4:4 | D4:4. C4:8 C4:2"),
      4,
    ),
  },
  {
    title: "A push by an eighth (tied over each beat) and by a triplet eighth (triplets per beat, tied)",
    input: input(
      [
        ...line("r:8 E4:4 G4:4 C5:4 C4:8~ | C4:8 E4:4 G4:4 C5:4 r:8"),
        ...pushed.map((e) => ({
          ...e,
          onset: [e.onset[0] + 2 * e.onset[1], e.onset[1]] as [number, number],
          id: `${e.id}p`,
        })),
      ],
      4,
    ),
  },
  {
    title: "U13.L05: one bar in 4/4 with triplet brackets",
    input: input(line("C4:4 E4:8t G4:8t C5:8t G4:4 E4:8t D4:8t C4:8t"), 1),
    barsPerLine: 1,
  },
  {
    title: "The same bar in 12/8: dotted quarters and three eighths, no bracket",
    input: {
      ...input(line("C4:4. E4:8 G4:8 C5:8 G4:4. E4:8 D4:8 C4:8", "mel", METERS["12/8"]), 1),
      meter: METERS["12/8"],
    },
    barsPerLine: 1,
  },
  {
    title: "6/8: two beats of three, a hemiola tied over beat 2, dotted eighths for two to the beat",
    input: {
      ...input(
        line("C4:8 D4:8 E4:8 F4:4 G4:8 | C4:4 D4:8~ D4:8 E4:4 | C4:8. D4:8. E4:4.", "mel", METERS["6/8"]),
        3,
      ),
      meter: METERS["6/8"],
    },
    barsPerLine: 3,
  },
];
const HARMONY: ShowOptions[] = [
  {
    title: "U15.L03: G sharp under E7, B flat under C7, C sharp under A7; applied numerals below",
    input: input(
      bare(
        line(
          "G4:4 r:4 E4:4 r:4 | G#4:4 r:4 B4:4 G#4:4 | A4:4 r:4 E4:4 C4:4 | A#4:4 r:4 G4:4 E4:4 | A4:4 r:4 F4:4 r:4 | C#4:4 r:4 E4:4 G4:4 | D4:4 r:4 F4:4 D4:4 | D4:4 r:4 B3:4 r:4",
        ),
      ),
      8,
      harmonyLabels([
        { bar: 1, beat: 1, symbol: "C", rn: "I" },
        { bar: 2, beat: 1, symbol: "E7", rn: "V7/vi" },
        { bar: 3, beat: 1, symbol: "Am", rn: "vi" },
        { bar: 4, beat: 1, symbol: "C7", rn: "V7/IV" },
        { bar: 5, beat: 1, symbol: "F", rn: "IV" },
        { bar: 6, beat: 1, symbol: "A7", rn: "V7/ii" },
        { bar: 7, beat: 1, symbol: "Dm", rn: "ii" },
        { bar: 8, beat: 1, symbol: "G7", rn: "V7" },
      ]),
    ),
  },
  {
    title: "U16.L05: Aura Lee with V7/V and ♭VI ♭VII; the held C split and tied where ♭VII arrives",
    input: input(
      bare(line("G3:4 C4:4 B3:4 C4:4 | D4:4 A3:4 D4:2 | C4:4 B3:4 A3:4 B3:4 | C4:1")),
      4,
      harmonyLabels([
        { bar: 1, beat: 1, symbol: "C", rn: "I" },
        { bar: 2, beat: 1, symbol: "D7", rn: "V7/V" },
        { bar: 3, beat: 1, symbol: "G7", rn: "V7" },
        { bar: 4, beat: 1, symbol: "Ab", rn: "bVI" },
        { bar: 4, beat: 3, symbol: "Bb", rn: "bVII" },
      ]),
    ),
  },
  {
    title: "The five seventh chords on C and a diminished seventh on C sharp, stacked, with their symbols",
    input: input(
      line(
        "[C4,E4,G4,B4]:1 | [C4,E4,G4,Bb4]:1 | [C4,Eb4,G4,Bb4]:1 | [C4,Eb4,Gb4,Bb4]:1 | [C4,Eb4,Gb4,A4]:1 | [C#4,E4,G4,Bb4]:1",
        "chords",
      ),
      6,
      {
        chords: ["C^7", "C7", "Cm7", "Cm7b5", "Co7", "C#o7"].map((symbol, bar) => ({ bar, beat: 1, symbol })),
      },
    ),
    barsPerLine: 6,
  },
];
const MODES: ShowOptions[] = [
  {
    title:
      "U14.L06 Mode Lab, each mode's own signature: Lydian, major, Mixolydian, Dorian, minor, Phrygian on D",
    input: input(
      bare(
        line(
          "D4:8 F#4:8 A4:8 G#4:8 E4:8 B4:8 C#5:8 D5:8 | D4:8 F#4:8 A4:8 G4:8 E4:8 B4:8 C#5:8 D5:8 | D4:8 F#4:8 A4:8 G4:8 E4:8 B4:8 C5:8 D5:8 | D4:8 F4:8 A4:8 G4:8 E4:8 B4:8 C5:8 D5:8 | D4:8 F4:8 A4:8 G4:8 E4:8 A#4:8 C5:8 D5:8 | D4:8 F4:8 A4:8 G4:8 D#4:8 A#4:8 C5:8 D5:8",
        ),
      ),
      6,
      keyChangesOf(
        ["lydian", "major", "mixolydian", "dorian", "minor", "phrygian"].map((mode, i) => ({
          bar: i + 1,
          key: key("D", mode),
        })),
      ),
    ),
    barsPerLine: 3,
  },
  {
    title:
      "The same line with parallel signatures: two sharps, then one flat; the note that drops is the accidental",
    input: input(
      bare(
        line(
          "D4:8 F#4:8 A4:8 G#4:8 E4:8 B4:8 C#5:8 D5:8 | D4:8 F#4:8 A4:8 G4:8 E4:8 B4:8 C#5:8 D5:8 | D4:8 F#4:8 A4:8 G4:8 E4:8 B4:8 C5:8 D5:8 | D4:8 F4:8 A4:8 G4:8 E4:8 B4:8 C5:8 D5:8 | D4:8 F4:8 A4:8 G4:8 E4:8 A#4:8 C5:8 D5:8 | D4:8 F4:8 A4:8 G4:8 D#4:8 A#4:8 C5:8 D5:8",
        ),
      ),
      6,
      keyChangesOf(
        ["lydian", "major", "mixolydian", "dorian", "minor", "phrygian"].map((mode, i) => ({
          bar: i + 1,
          key: key("D", mode),
        })),
        { modal: "parallel" },
      ),
    ),
    barsPerLine: 3,
  },
];
const GALLERY: ShowOptions[] = [KEY_CHANGE, GUIDE, TRIO, ...RHYTHM, ...HARMONY, ...MODES];

async function open(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForFunction(() => window.oakReady === true);
}
const show = (page: Page, o: ShowOptions) =>
  page.evaluate((x) => window.oakNotation.show(x), o) as Promise<Shown>;

test.describe("Wave 6 notation in the browser", () => {
  test("a key change draws its cancelling naturals after a double bar; C major to A minor draws nothing", async ({
    page,
  }) => {
    await open(page);
    const s = await show(page, KEY_CHANGE);
    expect(s.warnings).toEqual([]);
    // Three marked changes (to C, to F, to D): D minor after F keeps the one flat.
    expect(s.abc.match(/\[K:[^\]]+\]/g)).toEqual(["[K:C]", "[K:F]", "[K:D]"]);
    // What is drawn: per signature, its accidental glyphs by kind (abcjs names the glyph in data-name).
    const drawn = await page.evaluate((id) => {
      const svg = document.getElementById(id)?.querySelector("svg");
      return [...(svg?.querySelectorAll(".abcjs-key-signature") ?? [])].map((g) =>
        [...g.querySelectorAll("[data-name]")].map((p) => p.getAttribute("data-name") ?? "").join(" "),
      );
    }, s.id);
    expect(drawn.length).toBe(4);
    const kinds = drawn.map((d) =>
      d
        .split(" ")
        .map((n) => (n.includes("nat") ? "n" : n.includes("sharp") ? "s" : n.includes("flat") ? "f" : "?"))
        .join(""),
    );
    // D major at the start; to C: two naturals; to F: one flat; to D: the flat cancelled, then two sharps.
    expect(kinds).toEqual(["ss", "nn", "f", "nss"]);
    // Two thin lines before each marked change, none before the D minor bar.
    const doubles = await page.locator(`#${s.id} .abcjs-bar[data-name="bar"]`).count();
    expect(doubles).toBeGreaterThanOrEqual(5);
  });

  test("guide tones are marked on the heads inside a voicing, 3rd and 7th apart, and nothing else is", async ({
    page,
  }) => {
    await open(page);
    const s = await show(page, GUIDE);
    expect(s.guide.marks).toEqual([
      "C4=seventh",
      "F4=third",
      "B3=third",
      "F4=seventh",
      "B3=seventh",
      "E4=third",
    ]);
    expect(s.guide.heads.length).toBe(6);
    for (const cls of s.guide.heads) expect(cls).toContain("oak-guide");
    const counts = await page.evaluate((id) => {
      const root = document.getElementById(id);
      const colour = (sel: string) => {
        const el = root?.querySelector(sel);
        return el ? getComputedStyle(el).fill : "";
      };
      return {
        third: root?.querySelectorAll(".oak-guide-third").length ?? 0,
        seventh: root?.querySelectorAll(".oak-guide-seventh").length ?? 0,
        heads: root?.querySelectorAll(".abcjs-notehead").length ?? 0,
        thirdFill: colour(".oak-guide-third"),
        seventhFill: colour(".oak-guide-seventh"),
        plainFill: colour(".abcjs-notehead:not(.oak-guide)"),
      };
    }, s.id);
    expect([counts.third, counts.seventh, counts.heads]).toEqual([3, 3, 12]);
    expect(new Set([counts.thirdFill, counts.seventhFill, counts.plainFill]).size).toBe(3);
    // Marking again with nothing clears every mark.
    const left = await page.evaluate((id) => {
      const el = document.getElementById(id) as HTMLElement;
      window.oakNotation.markGuideTones(el, []);
      return el.querySelectorAll(".oak-guide").length;
    }, s.id);
    expect(left).toBe(0);
  });

  test("left-hand voicings and the walking bass share the bass staff in two voices; the guitar keeps the treble", async ({
    page,
  }) => {
    await open(page);
    const s = await show(page, TRIO);
    expect(s.warnings).toEqual([]);
    expect(s.abc).toContain("%%score {RH (LH LHv2)}");
    const byStaff = new Map<string, number>();
    for (const n of s.geometry.notes) byStaff.set(n.staff, (byStaff.get(n.staff) ?? 0) + 1);
    // Four guitar notes above; four voicings and eight bass notes below.
    expect([byStaff.get("RH"), byStaff.get("LH")]).toEqual([4, 12]);
    // Every voicing is drawn whole on the lower staff: four heads each, all below the treble staff's bottom line.
    const bands = s.geometry.staves;
    const treble = bands.find((b) => b.staff === "RH");
    const voicings = s.geometry.notes.filter((n) => n.staff === "LH" && n.heads.length === 4);
    expect(voicings.length).toBe(4);
    for (const v of voicings)
      for (const h of v.heads)
        expect(h.y).toBeGreaterThan((treble?.topLineY ?? 0) + 4 * (treble?.lineSpacing ?? 0));
  });

  test("the Wave 6 gallery engraves exactly, with no warning, at every size in both themes", async ({
    page,
  }) => {
    await open(page);
    const shown: Shown[] = [];
    for (const o of GALLERY) shown.push(await show(page, o));
    for (const s of shown) expect([s.approximate, s.warnings]).toEqual([false, []]);
    // Brackets are drawn for the triplets, none in 12/8.
    const brackets = await page.evaluate(
      (ids) =>
        ids.map(
          (id) => document.getElementById(id as string)?.querySelectorAll(".abcjs-triplet").length ?? 0,
        ),
      shown.map((s) => s.id),
    );
    const at = (title: string) => brackets[GALLERY.findIndex((g) => g.title?.startsWith(title))] ?? -1;
    expect(at("U13.L05: one bar in 4/4")).toBeGreaterThan(0);
    expect(at("The same bar in 12/8")).toBe(0);
    expect(at("A push by an eighth")).toBeGreaterThan(0);
    for (const m of MATRIX) {
      await page.setViewportSize({ width: m.width, height: m.height });
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, m.theme);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${SHOTS}wave6-${m.theme}-${m.width}.png`, fullPage: true });
    }
  });
});
