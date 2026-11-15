// The Wave 7 gallery examples are music too: the voicings are the shapes their prompts name, the tension is what
// the J2 spec says, the numerals spell the turnaround and bracket it, the groupings are the meter's own, the
// Euclidean numbers make the rhythms named, the two lanes are 3 against 2, the sliders' answers are the feel they
// describe, the A/B cards differ the way the answer says and the register map's parts sit where it says. Every
// example checks right with its answer and wrong with its sample. Checked with @oak/theory, content-kit and
// headless Strudel.
import { describe, expect, test } from "bun:test";
import { CLAVE_OPTIONS, isDropTwo, METER_GROUPINGS } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { chordOfRoman, euclidIdentity, onsetsOf, toLeadSheet } from "@oak/theory";
import { jazzReading, rnBrackets, tensionOf, voicingReadout } from "../jazz.ts";
import { claveCells, euclidCells, laybackWords, swingWords } from "../rhythm7.ts";
import { bandsOf, comparePairOf } from "../sound7.ts";
import { demoCheck, FIXTURES } from "./fixtures.ts";
import {
  BRIGHT_A,
  BRIGHT_B,
  BUSY_A,
  BUSY_B,
  CLOSE_G7,
  CUTOFF_TARGET,
  cutoffCode,
  LANE_THREE,
  LANE_TWO,
  LANES_LATE,
  LANES_RIGHT,
  REGISTER_NOTES,
  ROOTLESS_G7,
  SHELL_DM7,
  TRIAD_DM,
  TURNAROUND,
  TURNAROUND_SUB,
  WAVE7_FIXTURES,
} from "./fixtures-wave7.ts";

const C = { tonic: "C", mode: "major" } as const;
const byId = (id: string) => WAVE7_FIXTURES.find((f) => f.id === id);

describe("Wave 7 gallery examples", () => {
  test("every example checks right with its answer and wrong with its sample", () => {
    for (const f of WAVE7_FIXTURES) {
      expect(`${f.id}: ${demoCheck(f, f.expected).state}`).toBe(`${f.id}: correct`);
      expect(`${f.id}: ${demoCheck(f, f.sample).state}`).toBe(`${f.id}: wrong`);
    }
    expect(FIXTURES.filter((f) => byId(f.id)).length).toBe(WAVE7_FIXTURES.length);
  });

  test("jazz symbols: the answers read as the chords the prompts describe", () => {
    expect(jazzReading("G7(♭9)")).toMatchObject({ leadSheet: "G7♭9" });
    expect(jazzReading("G7")).toMatchObject({ leadSheet: "G7" });
    expect(jazzReading("D–9")).toMatchObject({ leadSheet: "Dm9", glyph: "D–9" });
  });

  test("the voicings are the shapes named, and the samples are not", () => {
    expect(voicingReadout(SHELL_DM7, "Dm7")?.shape).toBe("shell");
    expect(voicingReadout(TRIAD_DM, "Dm7")?.shape).toBeNull();
    expect(voicingReadout(ROOTLESS_G7, "G7")?.shape).toBe("rootless-a");
    expect(voicingReadout(CLOSE_G7, "G7")?.shape).toBe("close");
    expect(isDropTwo([55, 60, 64, 71])).toBe(true);
    expect(isDropTwo([60, 64, 67, 71])).toBe(false);
  });

  test("the tension: G over Fm7 is the 9th; the sample's 11th is B♭, not G", () => {
    expect(tensionOf("G4", "Fm7")?.id).toBe("9");
  });

  test("the turnaround is Em7 A7 Dm7 G7 and brackets as two ii–Vs; the sample ends on the tritone sub", () => {
    expect(TURNAROUND.map((rn) => toLeadSheet(chordOfRoman(rn, C) as never))).toEqual([
      "Em7",
      "A7",
      "Dm7",
      "G7",
    ]);
    expect(rnBrackets(TURNAROUND, C).map((b) => b.kind)).toEqual(["ii–V", "ii–V"]);
    expect(toLeadSheet(chordOfRoman(TURNAROUND_SUB[3] as string, C) as never)).toBe("D♭7");
    expect(rnBrackets(TURNAROUND_SUB, C).map((b) => b.kind)).toEqual(["ii–V", "ii–♭II"]);
  });

  test("groupings are the meter's own", () => {
    expect(METER_GROUPINGS["7/8"]).toContainEqual([2, 2, 3]);
    expect(METER_GROUPINGS["7/8"]).toContainEqual([3, 2, 2]);
    expect(METER_GROUPINGS["5/4"]).toContainEqual([3, 2]);
  });

  test("Euclid: (3,8) is the tresillo and (5,16,10) the bossa rim, as Strudel plays them", async () => {
    expect(onsetsOf(euclidCells({ k: 3, n: 8, r: 0 }))).toEqual([0, 3, 6]);
    const rim = onsetsOf(euclidCells({ k: 5, n: 16, r: 10 }));
    expect(euclidIdentity(rim, 16)?.rotation).toBe(10);
    const r = await evalHeadless('s("rim(5,16,10)")', 1);
    expect(r.events.map((e) => Math.round(e.onset * 16))).toEqual(rim);
  });

  test("clave: the answer is the son clave 2-3, the two-side first", () => {
    const cells = claveCells("son 2-3") as boolean[];
    expect(cells.slice(0, 8).filter(Boolean)).toHaveLength(2);
    expect(cells.slice(8).filter(Boolean)).toHaveLength(3);
    expect(CLAVE_OPTIONS.map((o) => o.id)).toContain("son 2-3");
  });

  test("two lanes: three and two even pulses in each bar, the sample's last 2 150 ms late", () => {
    expect(LANE_THREE.map((x) => +x.toFixed(4))).toEqual([0, 0.3333, 0.6667, 1, 1.3333, 1.6667]);
    expect(LANE_TWO).toEqual([0, 0.5, 1, 1.5]);
    expect(LANES_RIGHT.voices).toEqual(LANES_LATE.voices);
    expect(LANES_RIGHT.voices.filter((v) => v === 1)).toHaveLength(4);
    const lastTwo = (t: { taps: number[]; voices: number[] }) =>
      t.taps.filter((_, i) => t.voices[i] === 1).at(-1);
    expect(((lastTwo(LANES_LATE) as number) - (lastTwo(LANES_RIGHT) as number)).toFixed(3)).toBe("0.150");
  });

  test("the sliders' answers are the feels the prompts name", () => {
    expect(swingWords(byId("slider-swing-play")?.expected as number).feel).toBe("triplet swing");
    expect(laybackWords(byId("slider-layback")?.expected as number, 90).feel).toBe("laid back");
    expect(laybackWords(byId("slider-layback")?.sample as number, 90).feel).toBe("laid back");
  });

  test("A/B: card A is brighter (a higher cutoff) and busier (more onsets)", async () => {
    const lpf = (code: string) => Number(/lpf\((\d+)\)/.exec(code)?.[1]);
    expect(lpf(BRIGHT_A)).toBeGreaterThan(lpf(BRIGHT_B));
    const count = async (code: string) => (await evalHeadless(code, 1)).events.length;
    expect(await count(BUSY_A)).toBeGreaterThan(await count(BUSY_B));
    const bright = byId("compare-bright")?.spec as { options?: never } | undefined;
    expect(comparePairOf(bright?.options ?? [])?.a.id).toBe("brighter");
    expect(cutoffCode(CUTOFF_TARGET)).toBe('note("c2 c3").s("sawtooth").lpf(1200)');
  });

  test("the register map's answer is where each part's notes sit", () => {
    const want = byId("register-map")?.expected as string[];
    REGISTER_NOTES.forEach((notes, i) => {
      for (const m of notes) expect(bandsOf(m)).toContain(want[i] as never);
    });
  });
});
