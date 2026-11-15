// The rhythm track's answer logic (rhythm7.ts) and the sound track's (sound7.ts); timing claims run in headless
// Strudel (`evalHeadless`), so what the sliders play and say is what the code they name plays.
import { describe, expect, test } from "bun:test";
import { CLAVE_OPTIONS, lateMs, METER_GROUPINGS, R, rat, SOUND_COMPARE_OPTIONS } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { claveOf, euclidIdentity, onsetsOf, polyrhythm } from "@oak/theory";
import { NEUTRAL_PROFILE } from "./env.tsx";
import {
  addGroup,
  clampEuclid,
  claveCells,
  dropGroup,
  euclidCells,
  euclidMini,
  euclidSpoken,
  flipGroup,
  groupingCells,
  groupingComplete,
  groupingCount,
  groupingHits,
  groupingUnits,
  isClaveChoice,
  lanesReport,
  laybackHits,
  laybackWords,
  sameEuclid,
  splitLanes,
  swingHits,
  swingWords,
} from "./rhythm7.ts";
import {
  bandsOf,
  cardOf,
  comparePairOf,
  fromLog,
  hzText,
  isRegisterChoice,
  registerBands,
  snapLog,
  toLog,
} from "./sound7.ts";

describe("grouping", () => {
  test("units: eighths in /8 meters, quarters in 5/4; every legal grouping fills its bar", () => {
    expect(groupingUnits("7/8")).toEqual({ units: 7, word: "eighth" });
    expect(groupingUnits("9/8i")).toEqual({ units: 9, word: "eighth" });
    expect(groupingUnits("5/8")).toEqual({ units: 5, word: "eighth" });
    expect(groupingUnits("5/4")).toEqual({ units: 5, word: "quarter" });
    for (const [meter, gs] of Object.entries(METER_GROUPINGS))
      for (const g of gs ?? []) expect(groupingComplete(g, groupingUnits(meter as never).units)).toBe(true);
  });

  test("building a bar of 7/8 from 2s and 3s", () => {
    let v: number[] = [];
    v = addGroup(v, 2, 7);
    v = addGroup(v, 2, 7);
    expect(groupingComplete(v, 7)).toBe(false);
    // A 2 and then a 2 would overfill: nothing changes.
    expect(addGroup([2, 2, 2], 2, 7)).toEqual([2, 2, 2]);
    v = addGroup(v, 3, 7);
    expect(v).toEqual([2, 2, 3]);
    expect(groupingComplete(v, 7)).toBe(true);
    expect(groupingCount(v)).toBe("1 2 | 1 2 | 1 2 3");
    expect(dropGroup(v)).toEqual([2, 2]);
    // A click on a group swaps 2 and 3 only when the bar still fits.
    expect(flipGroup([2, 2], 0, 7)).toEqual([3, 2]);
    expect(flipGroup([2, 2, 3], 0, 7)).toEqual([2, 2, 3]);
    expect(groupingComplete([2, 2, 2, 1], 7)).toBe(false);
  });

  test("cells and the accents a playback puts on the group starts", () => {
    const cells = groupingCells([3, 2], 7);
    expect(cells.map((c) => c.count).join(" ")).toBe("1 2 3 1 2  ");
    expect(cells.filter((c) => c.start).map((c) => c.unit)).toEqual([0, 3]);
    const hits = groupingHits([2, 2, 3], 7, 240, 1);
    expect(hits.filter((h) => h.accent).map((h) => h.at)).toEqual([0, 0.5, 1]);
    expect(hits).toHaveLength(7);
  });
});

describe("Euclid", () => {
  const strudel = async (mini: string) => {
    const r = await evalHeadless(`s("${mini}")`, 1);
    return r.events.map((e) => e.begin);
  };
  for (const [k, n, r] of [
    [3, 8, 0],
    [5, 8, 1],
    [5, 16, 10],
    [3, 16, 0],
  ] as const)
    test(`the ring of (${k},${n},${r}) is what bd(${k},${n},${r}) plays`, async () => {
      const ours = onsetsOf(euclidCells({ k, n, r })).map((i) => R.str(rat(i, n)));
      expect(ours).toEqual(await strudel(`bd(${k},${n},${r})`));
    });

  test("two spellings of one rhythm are one answer; rotation counts", () => {
    expect(sameEuclid([3, 8], [3, 8, 0])).toBe(true);
    expect(sameEuclid([3, 8], [3, 8, 1])).toBe(false);
    // The bossa rim (5,16,10) is 3+3+4+3+3.
    const rim = onsetsOf(euclidCells({ k: 5, n: 16, r: 10 }));
    expect(rim.map((x, i) => (rim[i + 1] ?? 16) - x)).toEqual([3, 3, 4, 3, 3]);
    expect(euclidIdentity(rim, 16)).toEqual({ pulses: 5, steps: 16, rotation: 10 });
  });

  test("numbers stay a rhythm, and read back as code and words", () => {
    expect(clampEuclid({ k: 9, n: 8, r: 9 }, 16)).toEqual({ k: 8, n: 8, r: 1 });
    expect(clampEuclid({ k: 0, n: 40, r: -1 }, 16)).toEqual({ k: 1, n: 16, r: 15 });
    expect(euclidMini({ k: 3, n: 8, r: 0 }, true)).toBe("x(3,8)");
    expect(euclidMini({ k: 5, n: 8, r: 1 }, true, "rim")).toBe("rim(5,8,1)");
    expect(euclidSpoken({ k: 3, n: 8, r: 0 })).toBe("3 hits in 8 steps, on steps 1, 4 and 7");
  });
});

describe("clave", () => {
  test("every clave option draws theory's own grid, which reads back as that clave", () => {
    expect(isClaveChoice(CLAVE_OPTIONS)).toBe(true);
    expect(isClaveChoice([{ id: "son 3-2" }, { id: "straight" }])).toBe(false);
    for (const o of CLAVE_OPTIONS) {
      const cells = claveCells(o.id) as boolean[];
      const [type, direction] = o.id.split(" ");
      expect(claveOf(onsetsOf(cells))).toEqual({ type: type as "son", direction: direction as "3-2" });
    }
  });
  test("son 3-2 is the clave Strudel plays from content-kit's grid", async () => {
    const r = await evalHeadless('s("<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>")', 2);
    const cells = claveCells("son 3-2") as boolean[];
    expect(r.events.map((e) => Math.round(e.onset * 8))).toEqual(onsetsOf(cells));
  });
});

describe("two lanes", () => {
  test("a 3 against 2 take: each lane graded on its own, marks per lane", () => {
    const bar = 2;
    const { a, b } = polyrhythm(3, 2);
    const tA = a.map((x) => 10 + R.toNum(x) * bar);
    const tB = b.map((x) => 10 + R.toNum(x) * bar);
    // Beat 1 is played by both hands at once: a tap on each key.
    const take = [...tA.map((t) => [t, 0] as const), ...tB.map((t) => [t, 1] as const)].sort(
      (x, y) => x[0] - y[0],
    );
    const [la, lb] = splitLanes(
      take.map((x) => x[0]),
      take.map((x) => x[1]),
    );
    expect(la).toHaveLength(3);
    expect(lb).toHaveLength(2);
    const r = lanesReport([la, lb], [tA, tB], ["Left hand: the 3", "Right hand: the 2"], NEUTRAL_PROFILE);
    expect(r.pass).toBe(true);
    expect(r.feedback.state).toBe("correct");
    const parts = r.feedback.state === "correct" ? (r.feedback.marks ?? []).map((m) => m.part) : [];
    expect(parts).toEqual(["0:0", "0:1", "0:2", "1:0", "1:1"]);
  });
  test("one lane right is not enough; the message names each lane by its label", () => {
    const r = lanesReport(
      [[10, 10.667, 11.333], []],
      [
        [10, 10.667, 11.333],
        [10, 11],
      ],
      ["Left", "Right"],
      NEUTRAL_PROFILE,
    );
    expect(r.pass).toBe(false);
    expect(r.feedback).toMatchObject({ state: "wrong", message: "Left: 3 of 3. Right: 0 of 2." });
  });
});

describe("swing and lay-back", () => {
  test("the swing slider's groove is what swingBy(amount, 4) plays", async () => {
    for (const amount of [0, 0.2, 1 / 3, 0.5]) {
      const r = await evalHeadless(`setcpm(120/4)\nhh: s("hh*8").swingBy(${amount}, 4)`, 1);
      const strudel = r.events.map((e) => +(e.onset / r.cps).toFixed(4));
      const ours = swingHits(amount, 120, 1)
        .filter((h) => h.s === "hh")
        .map((h) => +h.at.toFixed(4));
      expect(ours).toEqual(strudel);
    }
  });
  test("swing words: the ratio content-kit gives", () => {
    expect(swingWords(0)).toEqual({ amount: ".00", ratio: "1:1", feel: "straight" });
    expect(swingWords(0.2)).toEqual({ amount: ".20", ratio: "1.50:1", feel: "light swing" });
    expect(swingWords(1 / 3)).toEqual({ amount: ".33", ratio: "2:1", feel: "triplet swing" });
    expect(swingWords(0.5)).toEqual({ amount: ".50", ratio: "3:1", feel: "hard swing" });
  });
  test("the lay-back: the snare late by the milliseconds the code says, at the piece's tempo", async () => {
    const w = laybackWords(20, 90);
    expect(w).toEqual({ ms: "20 ms behind", code: ".late(0.0075) at 90 BPM", feel: "laid back" });
    const r = await evalHeadless('setcpm(90/4)\nsnare: s("~ sd ~ sd").late(0.0075)', 1);
    const strudelMs = r.events.map((e) => Math.round((e.onset / r.cps) * 1000));
    const ours = laybackHits(20, 90, 1)
      .filter((h) => h.s === "sd")
      .map((h) => Math.round(h.at * 1000));
    expect(ours).toEqual(strudelMs);
    expect(lateMs(0.0075, 90)).toBeCloseTo(20, 6);
    // 1/32 at 76 BPM is a displacement, not a feel.
    expect(laybackWords(lateMs(1 / 32, 76), 76).feel).toBe("late enough to hear as a rhythm");
    expect(laybackWords(0, 90)).toMatchObject({ ms: "0 ms", code: "on the grid", feel: "on the beat" });
  });
});

describe("sound picks", () => {
  test("an A/B pair from content-kit's options, A first", () => {
    for (const [axis, opts] of Object.entries(SOUND_COMPARE_OPTIONS)) {
      const p = comparePairOf(opts as never);
      expect(p?.axis).toBe(axis);
      expect(p?.a.id).toBe(opts[0].id);
      expect(cardOf(p as never, [opts[1].id])).toBe("B");
    }
    expect(comparePairOf(SOUND_COMPARE_OPTIONS.brightness as never)?.question).toBe("Which is brighter?");
    expect(
      comparePairOf([
        { id: "busier", label: "Busier" },
        { id: "sparser", label: "Sparser" },
      ])?.axis,
    ).toBe("density");
    expect(
      comparePairOf([
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ]),
    ).toBeNull();
  });
  test("register bands are theory's, low to high, with their note ranges", () => {
    const bands = registerBands();
    expect(bands.map((b) => b.id)).toEqual(["sub", "bass", "low-mid", "mid", "high"]);
    expect(bands[0]?.range).toBe("C1–E2");
    expect(isRegisterChoice(bands.map((b) => ({ id: b.id })))).toBe(true);
    expect(isRegisterChoice([{ id: "verse" }, { id: "mid" }])).toBe(false);
    expect(bandsOf(40)).toEqual(["sub", "bass"]);
    expect(bandsOf(84)).toEqual(["high"]);
  });
  test("a log scale for a cutoff", () => {
    expect(fromLog(0, 100, 10000)).toBeCloseTo(100);
    expect(fromLog(0.5, 100, 10000)).toBeCloseTo(1000);
    expect(toLog(1000, 100, 10000)).toBeCloseTo(0.5);
    expect(snapLog(1234)).toBe(1200);
    expect(hzText(800)).toBe("800 Hz");
    expect(hzText(2400)).toBe("2.4 kHz");
  });
});
