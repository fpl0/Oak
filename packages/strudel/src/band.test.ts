// The Band's register in every key (contracts §5.10): Band code is written in C, so `{{key}}` from F♯ to B
// must not lift the whole Band up to a fifth. Checked on the real Band code of every band, flavour and stage
// in all twelve major keys, evaluated in headless Strudel, the way an app hands a Band to the adapter.
import { describe, expect, test } from "bun:test";
import { evalHeadless } from "@oak/grader/testing";
import { BAND_STAGES, bandCodeAt, bands } from "../../../content/bands/index.ts";
import { bandCodeFor, bandOctave, foldBandRegister, tonicOffset } from "./band.ts";
import type { BandSetup } from "./types.ts";

const TONICS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;

/** What every app does with a Band before the adapter sees it: `{{key}}` → `<tonic>4:<mode>`. */
function setupOf(code: string, tonic: string, followsLearnerKey = false): BandSetup {
  return {
    band: "band.two-chord-vamp" as never,
    flavour: "flavour.pop" as never,
    code: code.replaceAll("{{key}}", `${tonic}4:major`),
    followsLearnerKey,
    tracks: ["drums", "bass", "chords"],
  };
}

async function rangeOf(code: string, bars: number): Promise<Record<string, [number, number]>> {
  const r = await evalHeadless(`setcpm(90/4)\n${code}`, bars);
  const out: Record<string, [number, number]> = {};
  for (const e of r.events) {
    if (e.midi === null) continue;
    const m = Math.round(e.midi);
    const cur = out[e.track];
    out[e.track] = cur ? [Math.min(cur[0], m), Math.max(cur[1], m)] : [m, m];
  }
  return out;
}

describe("register fold", () => {
  test("tonic offsets and folded octaves", () => {
    expect(TONICS.map(tonicOffset)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(["Cb", "B#", "E#", "Fb"].map(tonicOffset)).toEqual([-1, 12, 5, 4]);
    // C to F stay, F♯/G♭ to B go down an octave; Cb4 is already B3, B#3 is C4.
    expect(TONICS.map((t) => bandOctave(t, 4))).toEqual([4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3]);
    expect([bandOctave("Cb", 4), bandOctave("B#", 4), bandOctave("Gb", 2)]).toEqual([4, 3, 1]);
  });
  test("only scale names inside .scale() strings move", () => {
    expect(foldBandRegister('n("0").scale("A4:minor").s("piano") // A4:minor')).toBe(
      'n("0").scale("A3:minor").s("piano") // A4:minor',
    );
    expect(foldBandRegister('n("0").scale("<C4:major G4:major F#2:harmonic:minor>")')).toBe(
      'n("0").scale("<C4:major G3:major F#1:harmonic:minor>")',
    );
  });
});

describe("every band, flavour and stage keeps its register in all twelve keys", () => {
  const cases: { id: string; flavour: string; staged: boolean; code: string; bars: number }[] = [];
  for (const b of bands)
    for (const flavour of Object.keys(b.code))
      for (const staged of [false, true]) {
        if (staged && !BAND_STAGES[b.id]?.[flavour as keyof (typeof BAND_STAGES)[string]]?.length) continue;
        cases.push({ id: b.id, flavour, staged, code: bandCodeAt(b, flavour, () => staged), bars: b.bars });
      }
  test("there is something to check", () => {
    expect(cases.length).toBeGreaterThan(10);
    expect(cases.some((c) => c.staged)).toBe(true);
  });
  for (const c of cases)
    test(`${c.id} × ${c.flavour}${c.staged ? " (latest stage)" : ""}`, async () => {
      const inC = await rangeOf(bandCodeFor(setupOf(c.code, "C"), ctx("C", "")), c.bars);
      expect(Object.keys(inC).length).toBeGreaterThan(0);
      const wrong: string[] = [];
      let unfoldedTooHigh = false;
      for (const tonic of TONICS) {
        const r = await rangeOf(bandCodeFor(setupOf(c.code, tonic), ctx(tonic, "")), c.bars);
        for (const [track, [lo, hi]] of Object.entries(r)) {
          const [cLo, cHi] = inC[track] as [number, number];
          // Within a tritone below to a fourth above the Band in C, every track, every key.
          if (lo < cLo - 6 || hi > cHi + 5) wrong.push(`${tonic} ${track} ${lo}..${hi} (C: ${cLo}..${cHi})`);
        }
        const raw = await rangeOf(setupOf(c.code, tonic).code, c.bars);
        if (Object.entries(raw).some(([t, [, hi]]) => hi > (inC[t]?.[1] ?? 0) + 5)) unfoldedTooHigh = true;
      }
      expect(wrong).toEqual([]);
      // The fold is what keeps it there: read literally, some key rises more than a fourth.
      expect(unfoldedTooHigh).toBe(true);
    });
});

function ctx(tonic: string, learnerCode: string) {
  return { key: { tonic, mode: "major" } as never, defaultBpm: 90, learnerCode };
}

describe("a Band that follows the learner's key", () => {
  const vamp = bands.find((b) => b.id === "band.two-chord-vamp");
  const code = vamp ? bandCodeAt(vamp, "flavour.pop", () => false) : "";
  test("a tune in B puts the Band in B below C, not a seventh above", async () => {
    const inC = await rangeOf(bandCodeFor(setupOf(code, "C", true), ctx("C", 'n("0").scale("C4:major")')), 2);
    const inB = await rangeOf(bandCodeFor(setupOf(code, "C", true), ctx("C", 'n("0").scale("B4:major")')), 2);
    for (const track of Object.keys(inC)) {
      const [cLo] = inC[track] as [number, number];
      const [bLo] = inB[track] as [number, number];
      expect([track, bLo - cLo]).toEqual([track, -1]);
    }
  });
  test("a patterned key plan moves the Band bar by bar, each key in its register", async () => {
    const learner = 'mel: n("0 2 4 2").scale("<C4:major G4:major D4:major>")';
    const band = bandCodeFor(setupOf(code, "C", true), ctx("C", learner));
    expect(band).toContain('.scale("<C4:major G3:major D4:major>")');
    const r = await evalHeadless(`setcpm(90/4)\n${learner}\n${band}`, 3);
    const keysOf = (track: string) =>
      [0, 1, 2].map((cycle) => [
        ...new Set(
          r.events.filter((e) => e.track === track && Math.floor(e.onset) === cycle).map((e) => e.scale),
        ),
      ]);
    expect(keysOf("chords")).toEqual([["C4 major"], ["G3 major"], ["D4 major"]]);
    expect(keysOf("bass")).toEqual([["C4 major"], ["G3 major"], ["D4 major"]]);
    // The learner's line is untouched.
    expect(keysOf("mel")).toEqual([["C4 major"], ["G4 major"], ["D4 major"]]);
  });
  test("without a patterned key, the Band keeps one key and the step key folds", () => {
    const band = bandCodeFor(setupOf(code, "A", true), ctx("A", 's("bd")'));
    expect(band).toContain('.scale("A3:major")');
    expect(band).not.toContain("A4:major");
  });
});
