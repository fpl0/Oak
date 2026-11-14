// Wave 6 (U12, seventh chords): the whole STYLE §5.2 table — every symbol, every dictionary the dialect allows,
// every root spelling a lesson writes — voiced by headless Strudel 1.2.6 and read against @oak/theory's
// `chordInDict`, which the lint and content CI use. Then the two dictionaries U12 teaches by name: `lefthand`
// (U12.L06) plays four notes that hold the chord's guide tones, and `guidetones` plays exactly the 3rd and the 7th,
// so the five qualities stay five different sounds in both.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { evalHeadless } from "@oak/grader/testing";
import { chordInDict, guideTones, parseChordSymbol, SEVENTH_CHORDS } from "@oak/theory";
import { DICTS, pcsOf, ROOT_SPELLINGS, statusOf, styleTable } from "./style-chords.ts";

setDefaultTimeout(60_000);

const cells = styleTable();
/** The notes `chord("<roots…>").dict(d).voicing()` plays, one cycle per root spelling. */
async function voiced(suffix: string, dict: string): Promise<number[][]> {
  const roots = ROOT_SPELLINGS.map((r) => `${r}${suffix}`);
  const r = await evalHeadless(`chord("<${roots.join(" ")}>").dict("${dict}").voicing()`, roots.length);
  return roots.map((_, i) =>
    r.events.filter((e) => Math.floor(e.onset + 1e-9) === i && e.midi !== null).map((e) => e.midi as number),
  );
}

describe("STYLE §5.2 against @oak/theory, in every root spelling", () => {
  test("the table is all there: every seventh quality of U12 in all five dictionaries", () => {
    expect(cells.length).toBeGreaterThan(130);
    for (const q of SEVENTH_CHORDS)
      for (const dict of DICTS) expect(cells.some((c) => c.suffix === q.code && c.dict === dict)).toBe(true);
  });

  test("chordInDict says what STYLE says for every cell and root spelling (the lint's verdict)", () => {
    const wrong: string[] = [];
    for (const c of cells)
      for (const root of ROOT_SPELLINGS) {
        const got = chordInDict(`${root}${c.suffix}`, c.dict);
        if (got !== c.status) wrong.push(`${root}${c.suffix} in ${c.dict}: theory ${got}, STYLE ${c.status}`);
      }
    expect(wrong).toEqual([]);
  });

  test("Strudel voices every cell as STYLE says, in every root spelling (with the default dictionary too)", async () => {
    const wrong: string[] = [];
    for (const c of cells) {
      const played = await voiced(c.suffix, c.dict);
      ROOT_SPELLINGS.forEach((root, i) => {
        const got = statusOf(`${root}${c.suffix}`, played[i] ?? []);
        if (got !== c.status) wrong.push(`${root}${c.suffix} in ${c.dict}: plays ${got}, STYLE ${c.status}`);
      });
    }
    // `ireal` is the default: the column holds without `.dict()`.
    for (const c of cells.filter((x) => x.dict === "ireal")) {
      const roots = ROOT_SPELLINGS.map((r) => `${r}${c.suffix}`);
      const r = await evalHeadless(`chord("<${roots.join(" ")}>").voicing()`, roots.length);
      roots.forEach((symbol, i) => {
        const notes = r.events.filter((e) => Math.floor(e.onset + 1e-9) === i).map((e) => e.midi);
        const got = statusOf(symbol, notes);
        if (got !== c.status) wrong.push(`${symbol} without .dict(): plays ${got}, STYLE ${c.status}`);
      });
    }
    expect(wrong).toEqual([]);
  });

  test("the spellings STYLE forbids for sevenths are silent or ireal-only, as chordInDict says", async () => {
    // Cmaj7, Cdim7 and lowercase roots are silent everywhere; C-7, Ch7 and CM7 work only in the ireal dictionaries.
    for (const symbol of ["Cmaj7", "Cdim7", "C-7", "Ch7", "CM7"])
      for (const dict of DICTS) {
        const r = await evalHeadless(`chord("${symbol}").dict("${dict}").voicing()`, 1);
        const notes = r.events.map((e) => e.midi);
        const measured = notes.length === 0 ? "missing" : statusOf(symbol.replace(/^C/, "C"), notes);
        expect([symbol, dict, measured]).toEqual([symbol, dict, chordInDict(symbol, dict)]);
      }
    expect((await evalHeadless('chord("cm7").voicing()', 1)).events).toEqual([]);
  });
});

describe("the dictionaries U12 names keep the five qualities apart", () => {
  for (const q of SEVENTH_CHORDS)
    test(`${q.code}: lefthand holds the guide tones in four notes; guidetones plays exactly the 3rd and the 7th`, async () => {
      const [left, guide] = [await voiced(q.code, "lefthand"), await voiced(q.code, "guidetones")];
      ROOT_SPELLINGS.forEach((root, i) => {
        const chord = parseChordSymbol(`${root}${q.code}`);
        if (!chord) throw new Error(`${root}${q.code}`);
        const g = guideTones(chord);
        const want = [g.third?.pc, g.seventh?.pc].map((pc) => pc as number).sort((a, b) => a - b);
        const l = left[i] ?? [];
        expect([root, l.length]).toEqual([root, 4]);
        expect(
          want.every((pc) => pcsOf(l).includes(pc)),
          `${root}${q.code} lefthand ${l}`,
        ).toBe(true);
        expect([`${root}${q.code}`, pcsOf(guide[i] ?? [])]).toEqual([`${root}${q.code}`, want]);
        // The left hand sits where U12.L06 comps: around middle C, never in the bass's octave.
        expect(Math.min(...l)).toBeGreaterThanOrEqual(55);
        expect(Math.max(...l)).toBeLessThanOrEqual(74);
      });
    });

  test("half a step in one voice: neighbouring qualities on one root never voice the same notes", async () => {
    // Full voicings and the left hand only: m7 and m7b5 differ in the 5th, which `guidetones` leaves out (below).
    for (const dict of ["ireal", "lefthand"]) {
      const played = await Promise.all(SEVENTH_CHORDS.map((q) => voiced(q.code, dict)));
      ROOT_SPELLINGS.forEach((root, i) => {
        for (let k = 1; k < played.length; k++) {
          const [a, b] = [pcsOf(played[k - 1]?.[i] ?? []), pcsOf(played[k]?.[i] ?? [])];
          expect(
            a.join() === b.join(),
            `${root}${SEVENTH_CHORDS[k - 1]?.code} and ${root}${SEVENTH_CHORDS[k]?.code} in ${dict}`,
          ).toBe(false);
        }
      });
    }
  });

  test("guidetones: m7 and m7b5 are the same two notes (the 5th tells them apart), every other neighbour differs", async () => {
    const played = await Promise.all(SEVENTH_CHORDS.map((q) => voiced(q.code, "guidetones")));
    const codes = SEVENTH_CHORDS.map((q) => q.code);
    ROOT_SPELLINGS.forEach((root, i) => {
      for (let k = 1; k < played.length; k++) {
        const same = pcsOf(played[k - 1]?.[i] ?? []).join() === pcsOf(played[k]?.[i] ?? []).join();
        const pair = `${codes[k - 1]}|${codes[k]}`;
        expect([root, pair, same]).toEqual([root, pair, pair === "m7|m7b5"]);
      }
    });
  });
});
