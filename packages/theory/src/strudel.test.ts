// Golden facts re-derived from Strudel 1.2.6 itself (headless, through @oak/grader/testing): every chord row
// voiced in every dictionary (contracts §6.7 rule 6), every chromatic step pair of STYLE §6 in C, G, F, D, E♭
// major and A minor (contracts §7.3), every scale Oak uses, Euclidean rhythms and the timelines.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { ROWS } from "./chord-table.ts";
import {
  ALIAS_DICTS,
  bpmToCpm,
  CHORD_TABLE,
  chordInDict,
  chordOf,
  chordPcs,
  degreeOf,
  euclid,
  formatScaleName,
  gridOnsets,
  gridToMini,
  keyFromScaleCtx,
  noteToMidi,
  onsetsOf,
  parseChordSymbol,
  parseScaleArg,
  RHYTHM_GRIDS,
  SCALES,
  spellMidi,
  stepToMidi,
  strudelStep,
  toCode,
  VOICING_DICTS,
  type VoicingDict,
} from "./index.ts";

setDefaultTimeout(60_000);

const pcsOf = (midis: (number | null)[]) =>
  [...new Set(midis.filter((m): m is number => m !== null).map((m) => ((m % 12) + 12) % 12))].sort(
    (a, b) => a - b,
  );

async function voiced(symbol: string, dict: VoicingDict): Promise<number[] | "error"> {
  try {
    const r = await evalHeadless(`chord("${symbol}").dict("${dict}").voicing()`);
    return pcsOf(r.events.map((e) => e.midi));
  } catch {
    return "error";
  }
}

/** Measured status: ok = ≥ 2 notes, all chord tones or the row's usual tensions; wrong = sounds, other notes. */
function status(pcs: number[] | "error", allowed: Set<number>): "ok" | "missing" | "wrong" {
  if (pcs === "error" || pcs.length === 0) return "missing";
  if (pcs.length >= 2 && pcs.every((p) => allowed.has(p))) return "ok";
  return "wrong";
}

describe("chord table × voicing dictionaries (STYLE §5.2, measured)", () => {
  for (const row of ROWS) {
    test(`${toCode(chordOf("C", row.quality))} in every dictionary`, async () => {
      const allowed = new Set([...chordPcs(chordOf("C", row.quality)), ...row.tensions]);
      const measured: Record<string, string> = {};
      for (const dict of VOICING_DICTS) measured[dict] = status(await voiced(`C${row.code}`, dict), allowed);
      expect(measured).toEqual(row.dicts);
    });
  }
  test("in another key the table still holds (Eb, F#)", async () => {
    for (const root of ["Eb", "F#"]) {
      for (const row of CHORD_TABLE) {
        const c = chordOf(root, row.quality);
        const pcs = await voiced(toCode(c), "ireal");
        const r = ROWS.find((x) => x.quality === row.quality);
        const allowed = new Set([...chordPcs(c), ...(r?.tensions ?? []).map((t) => (t + c.rootPc) % 12)]);
        expect(status(pcs, allowed)).toBe(row.dicts.ireal);
      }
    }
  });
  test("forbidden and dictionary-specific spellings resolve as ALIAS_DICTS says", async () => {
    for (const [suffix, dicts] of Object.entries(ALIAS_DICTS)) {
      const symbol = `C${suffix}`;
      const c = chordOf("C", parseChordSymbol(symbol)?.quality ?? "maj");
      const r = ROWS.find((x) => x.quality === c.quality);
      const allowed = new Set([...chordPcs(c), ...(r?.tensions ?? [])]);
      for (const dict of ["ireal", "triads", "lefthand", "guidetones"] as const) {
        expect([symbol, dict, status(await voiced(symbol, dict), allowed)]).toEqual([
          symbol,
          dict,
          dicts[dict],
        ]);
        expect(chordInDict(symbol, dict)).toBe(dicts[dict]);
      }
    }
  });
  test("lead-sheet spellings are silent in Strudel; C+ is a parse error; C/E throws", async () => {
    for (const s of ["Cmaj7", "Cdim", "Cdim7", "Csus4", "Csus2", "Cmaj9"]) {
      expect(await voiced(s, "ireal")).toEqual([]);
      expect(chordInDict(s, "ireal")).toBe("missing");
    }
    expect(await voiced("C+", "ireal")).toBe("error");
    expect(await voiced("C/E", "ireal")).toBe("error");
  });
});

describe("n steps and .scale() (STYLE §6)", () => {
  const KEYS: KeySpec[] = [
    { tonic: "C", mode: "major" },
    { tonic: "G", mode: "major" },
    { tonic: "F", mode: "major" },
    { tonic: "D", mode: "major" },
    { tonic: "Eb", mode: "major" },
    { tonic: "A", mode: "minor" },
  ];
  // STYLE §6 table: degree ↔ chromatic step string, in the major scale.
  const PAIRS: [string, string][] = [
    ["#1", "0#"],
    ["b2", "1b"],
    ["#2", "1#"],
    ["b3", "2b"],
    ["#4", "3#"],
    ["b5", "4b"],
    ["#5", "4#"],
    ["b6", "5b"],
    ["#6", "5#"],
    ["b7", "6b"],
  ];
  for (const key of KEYS) {
    test(`every chromatic step pair in ${key.tonic} ${key.mode}`, async () => {
      const scale = formatScaleName(key, 4);
      const ref = parseScaleArg(scale);
      if (!ref) throw new Error(scale);
      const degrees = PAIRS.map(([d]) => d);
      const steps = degrees.map((d) => strudelStep(d as never, key));
      if (key.mode === "major") expect(steps).toEqual(PAIRS.map(([, s]) => s));
      const r = await evalHeadless(`n("${steps.join(" ")}").scale("${scale}")`);
      const midis = r.events.map((e) => e.midi);
      // Strudel plays what stepToMidi predicts, and the played note is the degree asked for.
      expect(midis).toEqual(
        steps.map((s) =>
          stepToMidi(s, { tonic: ref.tonic, octave: 4, mode: key.mode, strudelName: ref.def.strudelName }),
        ),
      );
      expect(midis.map((m) => degreeOf(m as number, key).semitones)).toEqual(
        degrees.map(
          (d) =>
            degreeOf(
              stepToMidi(0, {
                tonic: ref.tonic,
                octave: 4,
                mode: key.mode,
                strudelName: ref.def.strudelName,
              }) + semis(d),
              key,
            ).semitones,
        ),
      );
    });
  }
  test('the trap: "4#" is ♯5 and "7b" is the natural 7 (C major)', async () => {
    const r = await evalHeadless(`n("4# 7b 3#").scale("C4:major")`);
    expect(r.events.map((e) => e.midi)).toEqual([68, 71, 66]);
  });

  const STEPS = "0 1 2 3 4 5 6 7 8 -1 -2 3# 6b 2b 7b 3## 0s 1f";
  const tokens = STEPS.split(" ").map((t) => (/^-?\d+$/.test(t) ? Number(t) : t));
  for (const def of SCALES) {
    for (const tonic of ["C4", "Eb4", "F#3", "A2"]) {
      test(`stepToMidi = Strudel for ${tonic}:${def.strudelName}`, async () => {
        const arg = `${tonic}:${def.strudelName}`;
        const ref = parseScaleArg(arg);
        if (!ref) throw new Error(arg);
        const r = await evalHeadless(`n("${STEPS}").scale("${arg}")`);
        const want = tokens.map((t) =>
          stepToMidi(t, {
            tonic: ref.tonic,
            octave: ref.octave,
            mode: def.mode ?? "major",
            strudelName: def.strudelName,
          }),
        );
        expect(r.events.map((e) => e.midi)).toEqual(want);
        if (def.mode)
          expect(keyFromScaleCtx(r.events[0]?.scale ?? "")).toEqual({ tonic: ref.tonic, mode: def.mode });
      });
    }
  }
  test("a scale with no octave plays in octave 3", async () => {
    const r = await evalHeadless(`n("0").scale("C:major")`);
    expect(r.events[0]?.midi).toBe(48);
    expect(stepToMidi(0, { tonic: "C", octave: null, mode: "major", strudelName: "major" })).toBe(48);
  });
  test("Strudel misspells chromatic steps; spellMidi does not", async () => {
    const r = await evalHeadless(`n("3#").scale("Eb4:major")`);
    expect(r.events[0]?.note).toBe("Bbb4"); // Strudel's own spelling of A natural
    const m = r.events[0]?.midi as number;
    expect(spellMidi(m, { key: { tonic: "Eb", mode: "major" } }).name).toBe("A4");
  });
  test("note names: Strudel and parseNote agree", async () => {
    const names = ["c4", "cs4", "ef4", "f4", "ff4", "c", "bb3", "bf3", "b", "E#5", "Bs3", "Fb4", "g#2"];
    const r = await evalHeadless(`note("${names.join(" ")}")`);
    expect(r.events.map((e) => e.midi)).toEqual(names.map((n) => noteToMidi(n)));
  });
});

describe("rhythm (Strudel's euclid and the timelines)", () => {
  const cases: [number, number, number][] = [
    [3, 8, 0],
    [5, 8, 0],
    [3, 8, 2],
    [5, 16, 0],
    [7, 16, 3],
    [2, 5, 0],
    [4, 9, 0],
    [-3, 8, 0],
    [3, 8, -1],
    [0, 8, 0],
    [8, 8, 0],
    [5, 12, 0],
    [7, 12, 0],
    [9, 16, 0],
    [4, 7, 1],
    [3, 4, 0],
    [5, 9, 2],
    [11, 24, 0],
  ];
  for (const [k, n, r] of cases) {
    test(`euclid(${k},${n},${r}) = s("bd(${k},${n},${r})")`, async () => {
      const res = await evalHeadless(`s("bd(${k},${n},${r})")`);
      const strudel = res.events.map((e) => e.begin);
      const ours = onsetsOf(euclid(k, n, r)).map((i) => frac(i, n));
      expect(ours).toEqual(strudel);
    });
  }
  test("tresillo is euclid(3,8)", () => {
    expect(onsetsOf(euclid(3, 8))).toEqual([0, 3, 6]);
  });
  for (const g of RHYTHM_GRIDS) {
    test(`${g.id} plays its onsets`, async () => {
      const res = await evalHeadless(`s("${gridToMini(g, "bd")}")`, g.bars);
      expect(res.events.map((e) => e.begin)).toEqual(gridOnsets(g).map(([a, b]) => frac(a, b)));
    });
  }
  test("tempo line of the meter table plays at the right cps", async () => {
    const r = await evalHeadless(`setcpm(120/4)\ns("bd")`);
    expect(r.cps).toBeCloseTo(bpmToCpm(120, "4/4") / 60, 9);
  });
});

function frac(a: number, b: number): string {
  const g = gcd(Math.abs(a), b);
  const n = a / g;
  const d = b / g;
  return d === 1 ? `${n}` : `${n}/${d}`;
}
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
function semis(d: string): number {
  const m = /^(b|#)?(\d)$/.exec(d);
  const base = [0, 2, 4, 5, 7, 9, 11][Number(m?.[2]) - 1] as number;
  return base + (m?.[1] === "#" ? 1 : m?.[1] === "b" ? -1 : 0);
}
