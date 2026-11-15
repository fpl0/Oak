// Wave 7 (the jazz track): what every voicing dictionary and mode the dialect allows actually plays, measured in
// headless Strudel 1.2.6 and read with @oak/theory. style-chords.test.ts already holds STYLE §5.2's table (sounds /
// silent / wrong notes, every symbol, every dictionary, 17 root spellings) against `chordInDict`; this file pins
// the PROSE of STYLE §5.2–§5.3 that lessons and the tutor repeat (which notes `lefthand` plays, what `duck`,
// `offset`, `anchor` and `root:` do), and keeps packages/strudel/dictionaries.json: for each jazz symbol on C and
// each dictionary, the notes it plays, how many, whether the root is there, and the shape @oak/theory reads.
// `OAK_WRITE_TABLES=1 bun test --isolate packages/strudel/e2e/wave7-dictionaries.test.ts` rewrites the JSON;
// otherwise the test fails when Strudel and the committed table disagree.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { evalHeadless } from "@oak/grader/testing";
import { chordInDict, JAZZ_QUALITIES, jazzSymbol, parseChordSymbol, voicingType } from "@oak/theory";
import { DICTS } from "./style-chords.ts";

setDefaultTimeout(120_000);

const NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const nameOf = (m: number) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

async function played(code: string, cycles = 1): Promise<number[][]> {
  const r = await evalHeadless(code, cycles);
  return Array.from({ length: cycles }, (_, i) =>
    r.events
      .filter((e) => Math.floor(e.onset + 1e-9) === i && e.midi !== null)
      .map((e) => Math.round(e.midi as number))
      .sort((a, b) => a - b),
  );
}
const one = async (code: string) => (await played(code))[0] ?? [];
const names = (ms: readonly number[]) => ms.map(nameOf).join(" ");

describe("STYLE §5.2–§5.3, the prose: every sentence about a dictionary or a mode, as Strudel plays it", () => {
  test("lefthand: C7 → B♭ D E A, C^7 → B D E G (7th lowest), G7 → B E F A (3rd lowest)", async () => {
    expect(names(await one('chord("C7").dict("lefthand").voicing()'))).toBe("Bb3 D4 E4 A4");
    expect(names(await one('chord("C^7").dict("lefthand").voicing()'))).toBe("B3 D4 E4 G4");
    expect(names(await one('chord("G7").dict("lefthand").voicing()'))).toBe("B3 E4 F4 A4");
  });

  test("lefthand's exceptions: Cm7b5 and Co7 keep their root (no 9th), C7#9 has three notes, C7b9 = C7b13, C7#11 has no 3rd, C69 sounds as C9", async () => {
    const half = await one('chord("Cm7b5").dict("lefthand").voicing()');
    expect(names(half)).toBe("Eb4 Gb4 Bb4 C5");
    expect(voicingType(half, "Cm7b5").rootless).toBe(false);
    expect((await one('chord("C7#9").dict("lefthand").voicing()')).length).toBe(3);
    expect(await one('chord("C7b9").dict("lefthand").voicing()')).toEqual(
      await one('chord("C7b13").dict("lefthand").voicing()'),
    );
    const sharp11 = (await one('chord("C7#11").dict("lefthand").voicing()')).map((m) => m % 12);
    expect(sharp11.includes(4)).toBe(false);
    expect(names(await one('chord("C69").dict("lefthand").voicing()'))).toBe("E3 G3 Bb3 D4");
    // So `lefthand` is MOSTLY rootless: the root is absent from ^7, 7, m7, m6 and the altered dominants, and
    // present in m7b5 and o7 (STYLE names only m7b5: the diminished seventh is C E♭ G♭ A, its root included).
    expect(names(await one('chord("Co7").dict("lefthand").voicing()'))).toBe("C4 Eb4 Gb4 A4");
    for (const s of ["C^7", "C7", "Cm7", "Cm6", "C7b9", "C7b13"])
      expect([s, voicingType(await one(`chord("${s}").dict("lefthand").voicing()`), s).rootless]).toEqual([
        s,
        true,
      ]);
  });

  test("offset(1) is the other rootless position (C^7 → E G B D); offset after voicing() does nothing", async () => {
    expect(names(await one('chord("C^7").dict("lefthand").offset(1).voicing()'))).toBe("E4 G4 B4 D5");
    expect(await one('chord("C^7").dict("lefthand").voicing().offset(1)')).toEqual(
      await one('chord("C^7").dict("lefthand").voicing()'),
    );
  });

  test('mode("duck") anchored on G4 leaves the anchor\'s note out (C^7 lefthand → B3 D4 E4); it keeps a root that is there', async () => {
    expect(names(await one('chord("C^7").dict("lefthand").anchor("g4").mode("duck").voicing()'))).toBe(
      "B3 D4 E4",
    );
    const full = await one('chord("C^7").anchor("c5").mode("duck").voicing()');
    expect(full.some((m) => m % 12 === 0 && m !== 72)).toBe(true);
    expect(full.includes(72)).toBe(false);
  });

  test('mode("below") is the default: the top note at or below the anchor (default c5); root:g2 puts C on C2, A on A1, G on G2', async () => {
    for (const s of ["C", "Am", "F^7", "G7", "Dm9", "Bb13"]) {
      const notes = await one(`chord("${s}").voicing()`);
      expect([s, Math.max(...notes) <= 72]).toEqual([s, true]);
      expect(await one(`chord("${s}").mode("below").voicing()`)).toEqual(notes);
    }
    expect(Math.max(...(await one('chord("C^7").anchor("g4").voicing()')))).toBeLessThanOrEqual(67);
    const roots = await played('chord("<C A G>").mode("root:g2").voicing()', 3);
    expect(roots.map((r) => nameOf(r[0] as number))).toEqual(["C2", "A1", "G2"]);
  });

  test("guidetones plays two notes, the 3rd and the 7th (or 6th); ireal-ext colours plain symbols (C → C E A, Co → C E♭ G♭ A)", async () => {
    for (const s of ["C^7", "C7", "Cm7", "Cm7b5", "Co7", "Cm6", "C6", "C7b9", "C^9", "Cm9"]) {
      const notes = await one(`chord("${s}").dict("guidetones").voicing()`);
      expect([s, notes.length]).toEqual([s, 2]);
    }
    expect(
      [...new Set((await one('chord("C").dict("ireal-ext").voicing()')).map((m) => m % 12))].sort(
        (a, b) => a - b,
      ),
    ).toEqual([0, 4, 9]);
    expect(
      [...new Set((await one('chord("Co").dict("ireal-ext").voicing()')).map((m) => m % 12))].sort(
        (a, b) => a - b,
      ),
    ).toEqual([0, 3, 6, 9]);
  });

  test("the dictionaries that are left out: mode above is forbidden, legacy and voicings() are not used (the lint says so)", async () => {
    // Read from STYLE itself so the sentence and the test move together.
    const style = readFileSync(resolve(import.meta.dirname, "../../../content/STYLE.md"), "utf8");
    expect(style).toContain('**`mode("above")` is forbidden**');
    expect(style).toContain("The `legacy` dictionary and the deprecated `.voicings()` are not used.");
  });
});

interface Row {
  symbol: string;
  dict: string;
  verdict: "ok" | "missing" | "wrong";
  notes: string;
  count: number;
  root: boolean;
  shape: string;
}

describe("packages/strudel/dictionaries.json: every jazz symbol on C in every dictionary, as played", () => {
  test("the table matches what headless Strudel plays, and every verdict matches chordInDict", async () => {
    const symbols = JAZZ_QUALITIES.map((q) => jazzSymbol(`C${q === "maj7" ? "^7" : q}`).ireal);
    const extra = ["C", "Cm", "Co", "Caug"];
    const rows: Row[] = [];
    for (const symbol of [...extra, ...symbols])
      for (const dict of DICTS) {
        const notes = await one(`chord("${symbol}").dict("${dict}").voicing()`);
        const chord = parseChordSymbol(symbol);
        if (!chord) throw new Error(symbol);
        const reading = notes.length ? voicingType(notes, symbol) : null;
        rows.push({
          symbol,
          dict,
          verdict: chordInDict(symbol, dict),
          notes: names(notes),
          count: notes.length,
          root: notes.some((m) => m % 12 === chord.rootPc),
          shape: reading?.type ?? "silent",
        });
      }
    // Every verdict agrees with what was played: silent ⇔ missing.
    for (const r of rows)
      expect([r.symbol, r.dict, r.count === 0]).toEqual([r.symbol, r.dict, r.verdict === "missing"]);
    const file = resolve(import.meta.dirname, "../dictionaries.json");
    const table = {
      generatedBy: "packages/strudel/e2e/wave7-dictionaries.test.ts (OAK_WRITE_TABLES=1 rewrites it)",
      strudel: "1.2.6",
      note: "chord(symbol).dict(dict).voicing() on C with the default anchor (c5) and mode (below). verdict: @oak/theory chordInDict (ok / missing = silent / wrong = sounds with wrong notes, STYLE §5.2). shape: @oak/theory voicingType of the notes played. root: whether C sounds.",
      rows,
    };
    if (process.env.OAK_WRITE_TABLES === "1") writeFileSync(file, `${JSON.stringify(table, null, 2)}\n`);
    const committed = JSON.parse(readFileSync(file, "utf8")) as typeof table;
    expect(committed.rows).toEqual(rows);
  });
});
