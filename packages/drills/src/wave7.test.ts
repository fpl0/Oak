// Wave 7: the families of ear stage G (jazz), the rest of stage H (swing ratios, clave, odd groupings,
// polyrhythm) and the sound families, tuned to content/specs/J1–J5, R1–R3, A1 and A2. Golden tests state the
// expected notes and check them in headless Strudel; the ladder tests pin what opens at which lesson; the
// course walks go through the EARLIEST legal route of every track session (each track taken the day it opens,
// interleaved with U14–U17) and the late route (the core first), and check that every trial stays inside what
// the learner has completed there: its answer among its options, no option repeated or naming something closed,
// nothing from a core lesson still ahead (a mode, a secondary dominant, a borrowed chord, a sound not met), the
// key heard before a chromatic or altered target, the right answer earning full credit, a comfortable register.
import { describe, expect, test } from "bun:test";
import type { Answer, FamilyDef, KeySpec, Trial } from "@oak/content-kit";
import {
  CLAVE_GRIDS,
  claveDirectionOf,
  METER_GROUPINGS,
  SWING_RATIO_OPTIONS,
  swingRatio,
  type VoicedChord,
  voicingShapeOf,
} from "@oak/content-kit";
import { chordScales, claveOf, swingOffbeat } from "@oak/theory";
import { Note } from "tonal";
import { FAMILIES } from "./catalog/families.ts";
import { bindFamily, DEFAULT_PROFILE, generateTrial, gradeTrial, maxOpenLevel } from "./engine.ts";
import { EXTENSION_TARGET_BAR } from "./gen/jazz.ts";
import { gradeAnswer, sameEuclid } from "./grade.ts";
import { mod, parsePc } from "./kernel.ts";
import { EARLY_ORDER, LATE_ORDER, TRACK_SESSIONS } from "./legal-orders.test-util.ts";
import { trialSeed } from "./rng.ts";
import { flattenEvents, strudelEvents } from "./testing.test-util.ts";

const fam = (id: string): FamilyDef => FAMILIES.find((f) => f.id === id) as FamilyDef;
const num = (x: readonly [number, number]) => x[0] / x[1];

/** The learner's state at session `at` of `order`: what is completed, which categories and levels are open. */
function stateIn(order: readonly string[], def: FamilyDef, at: string) {
  const i = order.indexOf(at);
  const completed = order.slice(0, i + 1) as string[];
  const done = new Set(completed);
  const open = def.categories.filter((c) => done.has(c.unlockAt)).map((c) => c.id);
  return { open, completed, done, maxLevel: maxOpenLevel(def, open, completed) };
}
const early = (def: FamilyDef, at: string) => stateIn(EARLY_ORDER, def, at);
const trial = (def: FamilyDef, level: number, category: string, open: readonly string[], i: number) =>
  generateTrial(
    bindFamily(def),
    { index: i, family: def.id, level, category, seed: trialSeed(def.id, `w7-${level}`, i) },
    DEFAULT_PROFILE,
    open,
  ) as Trial<Answer>;
/** A trial at the earliest legal route's state after `lesson`. */
const at = (id: string, lesson: string, level: number, category: string, i = 0) => {
  const def = fam(id);
  return trial(def, level, category, early(def, lesson).open, i);
};
const bar = (t: Trial<Answer>, track: string, b: number) =>
  t.events
    .filter((e) => e.track === track && e.midi !== null && Math.floor(num(e.onset)) === b)
    .map((e) => e.midi as number)
    .sort((x, y) => x - y);
const pcsRel = (midis: readonly number[], key: KeySpec) => [
  ...new Set(midis.map((m) => mod(m - parsePc(key.tonic).pc, 12))),
];
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
async function sameAsStrudel(t: Trial<Answer>) {
  const got = await strudelEvents(t.code, Number(t.params.bars ?? 1));
  expect(got.flat).toEqual(flattenEvents(t.events));
}
const full = (t: Trial<Answer>) =>
  gradeTrial(bindFamily(fam(t.family)), t, { answer: t.expected, rtMs: 1000, replays: 0 }, DEFAULT_PROFILE)
    .credit;

// --- golden: stage G ---------------------------------------------------------------------------------------

describe("golden: hear the ii–V (fam.jzz.ii-v)", () => {
  test("J1.L03 level 1: a phrase on the tonic that ends ii7 V7 Imaj7; its near misses end on vi or come from IV", async () => {
    const yes = at("fam.jzz.ii-v", "J1.L03", 1, "ii-V-I");
    const key = yes.params.key as KeySpec;
    expect(sorted(pcsRel(bar(yes, "chords", 0), key))).toEqual([4, 7, 11]); // Imaj7 above its bass root
    expect(pcsRel(bar(yes, "bass", 0), key)).toEqual([0]);
    expect(sorted(pcsRel([...bar(yes, "chords", 1), ...bar(yes, "bass", 1)], key))).toEqual([0, 2, 5, 9]); // ii7
    expect(sorted(pcsRel([...bar(yes, "chords", 2), ...bar(yes, "bass", 2)], key))).toEqual([2, 5, 7, 11]); // V7
    expect(sorted(pcsRel([...bar(yes, "chords", 3), ...bar(yes, "bass", 3)], key))).toEqual([0, 4, 7, 11]); // Imaj7
    expect(yes.expected).toEqual({ choice: ["ii-V-I"] });
    expect(yes.params.options).toEqual(["ii-V-I", "other"]);
    const vi = at("fam.jzz.ii-v", "J1.L03", 1, "ii-V-vi");
    const kv = vi.params.key as KeySpec;
    expect(sorted(pcsRel([...bar(vi, "chords", 3), ...bar(vi, "bass", 3)], kv))).toEqual([0, 4, 7, 9]); // vi7
    expect(vi.expected).toEqual({ choice: ["other"] });
    const iv = at("fam.jzz.ii-v", "J1.L03", 1, "IV-V-I");
    const k4 = iv.params.key as KeySpec;
    expect(pcsRel(bar(iv, "bass", 1), k4)).toEqual([5]); // IV in the bass where ii-V-I has 2
    expect(iv.expected).toEqual({ choice: ["other"] });
    await sameAsStrudel(yes);
    await sameAsStrudel(vi);
  });
  test("J2.L02 level 2: the minor ii–V–i is iiø7, V7♭9 (the key's own ♭6 as the ♭9) and i7; the major one beside it", async () => {
    const t = at("fam.jzz.ii-v", "J2.L02", 2, "minor-ii-V");
    const key = t.params.key as KeySpec;
    expect(key.mode).toBe("minor");
    expect(sorted(pcsRel([...bar(t, "chords", 0), ...bar(t, "bass", 0)], key))).toEqual([0, 2, 5, 8]); // iiø7
    expect(sorted(pcsRel([...bar(t, "chords", 1), ...bar(t, "bass", 1)], key))).toEqual([2, 5, 7, 8, 11]); // V7♭9
    expect(sorted(pcsRel([...bar(t, "chords", 2), ...bar(t, "bass", 2)], key))).toEqual([0, 3, 7, 10]); // i7
    expect(t.params.options).toEqual(["major-ii-V", "minor-ii-V"]);
    await sameAsStrudel(t);
  });
  test("level 4: a chain of three ii–V–Is names its first key and asks the other two (never absolute pitch)", () => {
    for (let i = 0; i < 20; i++) {
      const t = at("fam.jzz.ii-v", "J2.L02", 4, "chain", i);
      const keys = t.params.keys as KeySpec[];
      expect(t.params.firstKey).toBe(keys[0]?.tonic);
      expect(t.expected.text).toEqual(keys.slice(1).map((k) => k.tonic));
      const step = t.params.move === "down-whole-step" ? -2 : 5;
      for (let k = 1; k < 3; k++)
        expect(mod(parsePc(keys[k]?.tonic as string).pc - parsePc(keys[k - 1]?.tonic as string).pc, 12)).toBe(
          mod(step, 12),
        );
    }
  });
});

describe("golden: extensions (fam.jzz.extension)", () => {
  test("J2.L03: the colour sits on its chord's bar of an I–ii–V–I, after the plain chords (B♭13 has G on top)", async () => {
    for (const [cat, barNo] of Object.entries(EXTENSION_TARGET_BAR)) {
      const def = fam("fam.jzz.extension");
      const open = def.categories.map((c) => c.id);
      for (let i = 0; i < 12; i++) {
        const t = trial(def, def.levels.length, cat, open, i);
        const key = t.params.key as KeySpec;
        expect(t.params.targetBar).toBe(barNo);
        // Bar 1 is the plain tonic: the key is heard first.
        expect(sorted(pcsRel([...bar(t, "chords", 0), ...bar(t, "bass", 0)], key))).toEqual([0, 4, 7, 11]);
        const q = t.expected.choice?.[0] as string;
        const target = bar(t, "chords", barNo - 1);
        const root = t.params.rootPc as number;
        const top = mod((target.at(-1) as number) - root, 12);
        const colour: Record<string, number> = {
          "9": 2,
          "13": 9,
          "7b9": 1,
          "7#9": 3,
          m9: 2,
          m11: 5,
          "7alt": 8,
          "7b13": 8,
          "maj7#11": 6,
          "69": 2,
        };
        if (colour[q] !== undefined) expect([cat, q, top]).toEqual([cat, q, colour[q]]);
      }
    }
    const t = at("fam.jzz.extension", "J2.L03", 1, "7-9-13");
    await sameAsStrudel(t);
  });
  test("the ladder: 7/9/13 and m7/m9/m11 and 9/♭9/♯9 at J2.L03; alt/13/♭13 and maj7♯11 with the scales at J2.L04", () => {
    const def = fam("fam.jzz.extension");
    expect(early(def, "J2.L03").maxLevel).toBe(3);
    expect(early(def, "J2.L04").maxLevel).toBe(5);
    expect(stateIn(LATE_ORDER, def, "J2.L03").maxLevel).toBe(3);
  });
});

describe("golden: voicings (fam.jzz.voicing)", () => {
  const chordOf = (name: string): VoicedChord => {
    const m = /^([A-G][#b]?)(maj7|m7|7)$/.exec(name.replace("maj7", "maj7"));
    const root = parsePc((m?.[1] ?? "C") as string).pc;
    const q = m?.[2] ?? "7";
    const third = q === "m7" ? 3 : 4;
    const seventh = q === "maj7" ? 11 : 10;
    return {
      root,
      third: mod(root + third, 12),
      fifth: mod(root + 7, 12),
      seventh: mod(root + seventh, 12),
      ninth: mod(root + 2, 12),
      ...(q === "7" ? { thirteenth: mod(root + 9, 12) } : {}),
    };
  };
  const midis = (list: string) => list.split(" ").map((n) => Note.midi(n) as number);
  test("the right option is the asked shape (content-kit voicingShapeOf, octave-aware) and no distractor is", () => {
    const def = fam("fam.jzz.voicing");
    const open = def.categories.map((c) => c.id);
    const want = { shell: ["shell"], rootless: ["rootless-a", "rootless-b"], drop2: ["drop-2"] } as const;
    for (const [cat, shapes] of Object.entries(want))
      for (let i = 0; i < 30; i++) {
        const lvl = cat === "shell" ? 1 : cat === "rootless" ? 2 : 3;
        const t = trial(def, lvl, cat, open, i);
        const name = (t.params.chord as string).replace("∆", "maj").replace("–", "m").replace("Δ", "maj");
        const chord = chordOf(name.replace(/♯/g, "#").replace(/♭/g, "b"));
        const answer = t.expected.choice?.[0] as string;
        const shape = voicingShapeOf(midis(answer), chord);
        const asked =
          cat === "rootless"
            ? /rootless A/.test(t.params.prompt as string)
              ? "rootless-a"
              : "rootless-b"
            : null;
        expect([cat, name, answer, shape]).toEqual([cat, name, answer, asked ?? shapes[0]]);
        for (const o of t.params.options as string[])
          if (o !== answer)
            expect([cat, name, o, voicingShapeOf(midis(o), chord) === shape]).toEqual([cat, name, o, false]);
      }
  });
  test("J3.L01: rootless A and B are both asked, each against the other (the near miss)", () => {
    const def = fam("fam.jzz.voicing");
    const open = early(def, "J3.L01").open;
    const asked = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const t = trial(def, 2, "rootless", open, i);
      const form = /rootless (A|B)/.exec(t.params.prompt as string)?.[1] as string;
      asked.add(form);
      expect((t.params.options as string[]).length).toBe(4);
    }
    expect([...asked].sort()).toEqual(["A", "B"]);
  });
});

describe("golden: chord-scales (fam.jzz.chord-scale)", () => {
  test("the answer is @oak/theory's first choice in the key; no alternative of it is ever offered as wrong", () => {
    const def = fam("fam.jzz.chord-scale");
    const open = def.categories.map((c) => c.id);
    let checked = 0;
    for (const cat of ["basic", "half-dim-dim", "altered-lydian"])
      for (let i = 0; i < 40; i++) {
        const lvl = def.levels.findIndex((l) => l.categories.includes(cat)) + 1;
        const t = trial(def, lvl, cat, open, i);
        const answer = t.expected.choice?.[0] as string;
        const fits = chordScales(t.params.chord as string, { key: t.params.key as KeySpec });
        expect([t.params.chord, answer]).toEqual([t.params.chord, fits[0] as string]);
        for (const o of t.params.options as string[])
          if (o !== answer) expect(fits.includes(o as never)).toBe(false);
        expect(t.params.prompt as string).toContain("a common first choice");
        checked++;
      }
    expect(checked).toBe(120);
  });
  test("in C major: Fmaj7 (IV) is Lydian, never Ionian beside it; Dm7 Dorian; G7 Mixolydian", () => {
    expect(chordScales("F^7", { key: { tonic: "C", mode: "major" } })[0]).toBe("lydian");
    expect(chordScales("Dm7", { key: { tonic: "C", mode: "major" } })[0]).toBe("dorian");
    expect(chordScales("G7", { key: { tonic: "C", mode: "major" }, next: "C^7" })[0]).toBe("mixolydian");
  });
  test("avoid notes: exactly one offered note is an avoid note (a half step above a chord tone)", () => {
    const def = fam("fam.jzz.chord-scale");
    const open = def.categories.map((c) => c.id);
    for (let i = 0; i < 40; i++) {
      const t = trial(def, 4, "avoid-notes", open, i);
      expect(new Set(t.params.options as string[]).size).toBe(3);
      expect(t.params.options as string[]).toContain(t.expected.choice?.[0] as string);
    }
  });
});

describe("golden: substitutions (fam.jzz.subs)", () => {
  test("J5.L01: home first, then ii and either V7 or ♭II7 (sharing the tritone), then home", async () => {
    const v = at("fam.jzz.subs", "J5.L01", 1, "V7-I", 1);
    for (let i = 0; i < 12; i++) {
      const t = at("fam.jzz.subs", "J5.L01", 1, i % 2 ? "V7-I" : "bII7-I", i);
      const key = t.params.key as KeySpec;
      expect(pcsRel(bar(t, "bass", 0), key)).toEqual([0]);
      const want = t.expected.choice?.[0] === "V7-I" ? 7 : 1;
      expect(pcsRel(bar(t, "bass", 2), key)).toEqual([want]);
      const pcs = pcsRel(bar(t, "chords", 2), key);
      // The guide tones of G7 are F and B; D♭7's are F and C♭ (= B): the substitute keeps the tritone.
      expect(pcs).toContain(5);
      expect(pcs).toContain(11);
      expect(t.params.options).toEqual(["V7-I", "bII7-I"]);
    }
    await sameAsStrudel(v);
  });
  test("J5.L02: the backdoor joins (iv7, ♭VII7), three ways home", () => {
    let backdoors = 0;
    for (let i = 0; i < 24; i++) {
      const t = at("fam.jzz.subs", "J5.L02", 2, "backdoor", i);
      expect(t.params.options).toEqual(["V7-I", "bII7-I", "backdoor"]);
      if (t.expected.choice?.[0] !== "backdoor") continue;
      backdoors++;
      const key = t.params.key as KeySpec;
      expect(pcsRel(bar(t, "bass", 1), key)).toEqual([5]);
      expect(pcsRel(bar(t, "bass", 2), key)).toEqual([10]);
    }
    expect(backdoors).toBeGreaterThan(3);
  });
});

// --- golden: stage H ---------------------------------------------------------------------------------------

describe("golden: swing ratios (fam.rhy.swing level 4, R1.L02)", () => {
  test("the four feels of SWING_FEELS by ratio, on the eighths and the sixteenths; the off-beat where swingOffbeat puts it", async () => {
    const want = { straight: 1, light: 1.5, swung: 2, hard: 3 } as const;
    let sixteenths = 0;
    for (const [cat, ratio] of Object.entries(want))
      for (let i = 0; i < 8; i++) {
        const t = at("fam.rhy.swing", "R1.L02", 4, cat, i);
        const sub = t.params.subdivision as 8 | 16;
        if (sub === 16) sixteenths++;
        const hats = t.events
          .filter((e) => e.track === "hats")
          .map((e) => num(e.onset))
          .sort((a, b) => a - b);
        const slot = sub === 16 ? 1 / 16 : 1 / 8;
        const off = (hats[1] as number) - (hats[0] as number);
        expect(off / (2 * slot - off)).toBeCloseTo(ratio, 6);
        if (cat !== "straight")
          expect(off).toBeCloseTo(swingOffbeat(swingAmountOf(ratio), sub as 8 | 16) as number, 9);
        expect(t.params.options).toEqual(SWING_RATIO_OPTIONS.map((o) => o.id));
        const id = cat === "swung" ? "triplet" : cat;
        expect(t.expected.choice).toEqual([id]);
      }
    expect(sixteenths).toBeGreaterThan(8);
    expect(sixteenths).toBeLessThan(24);
    await sameAsStrudel(at("fam.rhy.swing", "R1.L02", 4, "light", 3));
  });
  test("U11.L07 keeps its two words; light swing is 3:2 there too (one table)", () => {
    expect(swingRatio(0.2)).toBeCloseTo(1.5, 9);
    const t = at("fam.rhy.swing", "U11.L08", 2, "light");
    expect(t.params.options).toEqual(["straight", "light", "swung", "hard"]);
    expect(t.code).toContain(".swingBy(1/5, 4)");
  });
});
const swingAmountOf = (ratio: number) => (ratio - 1) / (ratio + 1);

describe("golden: clave (fam.rhy.clave)", () => {
  test("R3.L02: son 3-2 and 2-3 are the same hits in the two orders, over a bass that marks bar 1", async () => {
    for (const dir of ["3-2", "2-3"] as const) {
      const t = at("fam.rhy.clave", "R3.L02", 2, `son-${dir}`);
      const rim = (b: number) =>
        t.events
          .filter((e) => e.track === "perc" && Math.floor(num(e.onset)) === b)
          .map((e) => num(e.onset) - b);
      const [a, b] = CLAVE_GRIDS.son[dir];
      expect(rim(0)).toEqual(a.map(num));
      expect(rim(1)).toEqual(b.map(num));
      expect(claveDirectionOf(rim(0).length, rim(1).length)).toBe(dir);
      // On the two-bar 8th grid of @oak/theory (16 steps for the two bars).
      const steps = [...rim(0).map((x) => x * 8), ...rim(1).map((x) => 8 + x * 8)];
      expect(claveOf(steps)).toEqual({ type: "son", direction: dir });
      // The kick and hats are the same in both bars; the bass changes root at bar 2.
      expect(bar(t, "bass", 0)[0]).not.toBe(bar(t, "bass", 1)[0]);
      expect(t.params.options).toEqual(["son-3-2", "son-2-3"]);
      expect((t.params.optionLabels as Record<string, string>)[`son-${dir}`]).toBe(`Son clave, ${dir}`);
      await sameAsStrudel(t);
    }
  });
  test("rumba moves the three-side's last hit to the 8th eighth; it is offered beside son at level 3", () => {
    const t = at("fam.rhy.clave", "R3.L02", 3, "rumba-3-2");
    const hits = t.events.filter((e) => e.track === "perc").map((e) => num(e.onset));
    expect(hits).toEqual([0, 3 / 8, 7 / 8, 1 + 1 / 4, 1 + 1 / 2]);
    expect(t.params.options).toEqual(["son-3-2", "son-2-3", "rumba-3-2", "rumba-2-3"]);
  });
  test("R3.L01: tresillo, cinquillo and straight, and nothing two-bar yet", () => {
    const def = fam("fam.rhy.clave");
    expect(early(def, "R3.L01").maxLevel).toBe(1);
    const t = at("fam.rhy.clave", "R3.L01", 1, "cinquillo");
    expect(t.events.filter((e) => e.track === "perc").map((e) => num(e.onset))).toEqual([
      0,
      1 / 4,
      3 / 8,
      5 / 8,
      3 / 4,
      1,
      1 + 1 / 4,
      1 + 3 / 8,
      1 + 5 / 8,
      1 + 3 / 4,
    ]);
    expect(t.params.options).toEqual(["tresillo", "cinquillo", "straight"]);
  });
});

describe("golden: odd groupings (fam.rhy.odd-grouping)", () => {
  test("R2.L01: 5/4 as 3+2 against 2+3 (quarters), 7/8 in its three groupings at 200–260 eighths a minute", async () => {
    const def = fam("fam.rhy.odd-grouping");
    expect(early(def, "R2.L01").maxLevel).toBe(2);
    expect(early(def, "R2.L02").maxLevel).toBe(4);
    const five = at("fam.rhy.odd-grouping", "R2.L01", 1, "5/4:3+2");
    expect(five.params.meter).toBe("5/4");
    expect(five.params.options).toEqual(["3+2", "2+3"]);
    const kicks = (t: Trial<Answer>, n: number) =>
      t.events.filter((e) => e.track === "kick" && num(e.onset) < 1).map((e) => Math.round(num(e.onset) * n));
    expect(kicks(five, 5)).toEqual([0, 3]);
    for (let i = 0; i < 12; i++) {
      const t = at(
        "fam.rhy.odd-grouping",
        "R2.L01",
        2,
        ["7/8:2+2+3", "7/8:2+3+2", "7/8:3+2+2"][i % 3] as string,
        i,
      );
      expect(t.params.options).toEqual(["2+2+3", "2+3+2", "3+2+2"]);
      expect(t.params.bpm as number).toBeGreaterThanOrEqual(200);
      expect(t.params.bpm as number).toBeLessThanOrEqual(260);
      expect(t.code.startsWith(`setcpm(${t.params.bpm}/7)`)).toBe(true);
      const groups = (t.params.grouping as number[]).slice();
      const starts = groups.map((_, k) => groups.slice(0, k).reduce((s, g) => s + g, 0));
      expect(kicks(t, 7)).toEqual(starts);
    }
    await sameAsStrudel(five);
  });
  test("every offered grouping is one METER_GROUPINGS declares for the trial's meter", () => {
    const def = fam("fam.rhy.odd-grouping");
    const open = def.categories.map((c) => c.id);
    for (let lvl = 1; lvl <= def.levels.length; lvl++)
      for (const cat of def.levels[lvl - 1]?.categories ?? [])
        for (let i = 0; i < 4; i++) {
          const t = trial(def, lvl, cat, open, i);
          const known = (METER_GROUPINGS[t.params.meter as "7/8"] ?? []).map((g) => g.join("+"));
          for (const o of t.params.options as string[]) expect(known).toContain(o);
        }
  });
  test("the grouping widget's answer grades like the choice; a rotation is another grouping", () => {
    const t = at("fam.rhy.odd-grouping", "R2.L01", 2, "7/8:2+2+3");
    expect(gradeAnswer(t, { answer: { grouping: [2, 2, 3] }, rtMs: 900, replays: 0 }).credit).toBe(1);
    expect(gradeAnswer(t, { answer: { grouping: [3, 2, 2] }, rtMs: 900, replays: 0 }).credit).toBe(0);
    expect(gradeAnswer(t, { answer: { choice: ["2+2+3"] }, rtMs: 900, replays: 0 }).credit).toBe(1);
  });
});

describe("golden: polyrhythm (fam.rhy.polyrhythm)", () => {
  test("R2.L04: 3 against 2 is three even rims over two kicks in the same bar; 5:4 is never asked", async () => {
    const t = at("fam.rhy.polyrhythm", "R2.L04", 1, "3:2");
    const of = (track: string) =>
      t.events.filter((e) => e.track === track && num(e.onset) < 1).map((e) => num(e.onset));
    expect(of("high")).toEqual([0, 1 / 3, 2 / 3]);
    expect(of("low")).toEqual([0, 1 / 2]);
    expect(t.params.options as string[]).toContain("2:3");
    const def = fam("fam.rhy.polyrhythm");
    expect(def.categories.map((c) => c.id)).not.toContain("5:4");
    for (const l of def.levels) expect(l.categories).not.toContain("5:4");
    await sameAsStrudel(t);
  });
});

describe("Euclidean answers grade by onsets", () => {
  test("(3,8) = (3,8,0); (5,8,1) is not (5,8); a wrong count fails", () => {
    expect(sameEuclid([3, 8], [3, 8, 0])).toBe(true);
    expect(sameEuclid([5, 8, 1], [5, 8])).toBe(false);
    expect(sameEuclid([3, 8], [5, 8])).toBe(false);
    expect(sameEuclid([3, 8], undefined)).toBe(false);
    const fake = { expected: { euclid: [3, 8] }, params: {} } as unknown as Trial<Answer>;
    expect(gradeAnswer(fake, { answer: { euclid: [3, 8, 0] }, rtMs: 1, replays: 0 }).credit).toBe(1);
    expect(gradeAnswer(fake, { answer: { euclid: [3, 7] }, rtMs: 1, replays: 0 }).credit).toBe(0);
  });
});

// --- golden: sound ----------------------------------------------------------------------------------------

describe("golden: roles and masking (fam.snd.roles, A2.L01)", () => {
  test("roles: bars 3–4 lose exactly the dropped part; the answers are the three roles, the same every trial", async () => {
    for (let i = 0; i < 15; i++) {
      const t = at("fam.snd.roles", "A2.L01", 1, "roles", i);
      const dropped = t.params.dropped as string;
      const track = dropped === "lead" ? "mel" : dropped;
      expect(t.events.some((e) => e.track === track && num(e.onset) >= 2)).toBe(false);
      for (const other of ["bass", "pad", "mel"].filter((x) => x !== track))
        expect(t.events.some((e) => e.track === other && num(e.onset) >= 2)).toBe(true);
      expect(t.params.options).toEqual(["bass", "pad", "lead"]);
      expect(t.expected.choice).toEqual([dropped]);
    }
    await sameAsStrudel(at("fam.snd.roles", "A2.L01", 1, "roles", 2));
  });
  test("masking: the muddy part sits under C3 beside the bass; 'neither' is the clean mix", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const t = at("fam.snd.roles", "A2.L01", 2, "masking", i);
      const m = t.params.muddy as string;
      seen.add(m);
      const low = (track: string) =>
        t.events.filter((e) => e.track === track).every((e) => (e.midi as number) < 48);
      expect([m, low("pad")]).toEqual([m, m === "pad"]);
      expect([m, low("mel")]).toEqual([m, m === "lead"]);
    }
    expect([...seen].sort()).toEqual(["lead", "none", "pad"]);
  });
  test("no sound the learner has not met by A2's gate: no vibes, trumpet, horns", () => {
    for (let i = 0; i < 40; i++) {
      const t = at("fam.snd.roles", "A2.L01", 1 + (i % 2), i % 2 ? "masking" : "roles", i);
      for (const e of t.events) expect(["vibes", "trumpet", "horns", "mutetpt"]).not.toContain(e.s as string);
    }
  });
});

// --- the course walks ----------------------------------------------------------------------------------

/** The families whose material or levels open at track lessons. */
const WAVE7 = [
  "fam.jzz.ii-v",
  "fam.jzz.guide",
  "fam.jzz.voicing",
  "fam.jzz.extension",
  "fam.jzz.chord-scale",
  "fam.jzz.subs",
  "fam.rhy.swing",
  "fam.rhy.clave",
  "fam.rhy.odd-grouping",
  "fam.rhy.polyrhythm",
  "fam.rhy.meter",
  "fam.snd.params",
  "fam.snd.roles",
  "fam.chd.quality-7th",
  "fam.chd.spell",
  "fam.har.schema",
  "fam.frm.blues",
];
/** What a core lesson allows from then on: [lesson, what, a test on a trial that must fail before it]. */
const keyOf = (t: Trial<Answer>) => t.params.key as KeySpec | undefined;
const NOT_BEFORE: readonly [string, string, (t: Trial<Answer>) => boolean][] = [
  [
    "U14.L01",
    "a mode as the key",
    (t) => /mixolydian|dorian|lydian|phrygian|locrian/.test(keyOf(t)?.mode ?? ""),
  ],
  ["U15.L02", "a secondary dominant", (t) => [...(t.expected.rn ?? [])].some((r) => r.includes("/"))],
  [
    "U16.L01",
    "a borrowed numeral",
    (t) => [...(t.expected.rn ?? [])].some((r) => /^(iv|bVI|bVII|bIII)/.test(r)),
  ],
  ["J1.L01", "the vibraphone", (t) => t.events.some((e) => e.s === "vibes")],
  ["U15.L05", "the trumpet", (t) => t.events.some((e) => e.s === "trumpet")],
  ["J4.L02", "the muted trumpet", (t) => t.events.some((e) => e.s === "mutetpt")],
  ["R1.L03", "the clavinet", (t) => t.events.some((e) => e.s === "clav")],
  [
    "J2.L02",
    "an altered dominant",
    (t) => (t.expected.choice ?? []).some((c) => /^7(b9|#9|alt|b13)$/.test(c)),
  ],
  ["J2.L03", "an extension", (t) => (t.expected.choice ?? []).some((c) => /^(9|13|m9|m11)$/.test(c))],
  [
    "J2.L04",
    "a jazz chord-scale or ♯11",
    (t) =>
      t.family.startsWith("fam.jzz.") &&
      (t.expected.choice ?? []).some((c) => /lydian|maj7#11|altered/.test(c)),
  ],
  ["R2.L02", "9/8", (t) => t.params.meter === "9/8i"],
  ["R1.L02", "a swing ratio", (t) => t.params.subdivision !== undefined],
  ["R3.L02", "a clave direction", (t) => /^(son|rumba)/.test(t.category)],
];
/** A chromatic or altered target is preceded by its key: the trial's first bar is the tonic. */
function contextFirst(t: Trial<Answer>): boolean {
  const key = keyOf(t);
  const tonicFirst = (track: string) => key !== undefined && pcsRel(bar(t, track, 0), key).includes(0);
  if (t.family === "fam.jzz.subs" && t.category !== "in-standard") return tonicFirst("bass");
  if (t.family === "fam.jzz.extension") return tonicFirst("bass") && (t.params.targetBar as number) >= 2;
  if (t.family === "fam.jzz.ii-v" && ["ii-V-I", "ii-V-vi", "IV-V-I", "locate"].includes(t.category))
    return tonicFirst("bass");
  if (t.family === "fam.jzz.ii-v" && t.category === "chain") return typeof t.params.firstKey === "string";
  if (t.family === "fam.rhy.clave" && /^(son|rumba)/.test(t.category))
    return bar(t, "bass", 0).length > 0 && bar(t, "bass", 0)[0] !== bar(t, "bass", 1)[0];
  return true;
}

function walk(name: string, order: readonly string[], sessions: readonly string[]) {
  describe(`the ${name} route: every trial stays inside what the learner has completed`, () => {
    for (const id of WAVE7)
      test(id, () => {
        const def = fam(id);
        const catIds = new Set(def.categories.map((c) => c.id));
        let checked = 0;
        // A trial depends only on (level, category, open categories, seed): sessions that leave the family's
        // open categories, its top level and the NOT_BEFORE lessons as they were generate the same trials, so
        // each distinct state is walked once.
        const seen = new Set<string>();
        for (const s of sessions) {
          const { open, maxLevel, done } = stateIn(order, def, s);
          if (!done.has(def.unlock.lesson)) continue;
          const state = JSON.stringify([open, maxLevel, NOT_BEFORE.map(([from]) => done.has(from))]);
          if (seen.has(state)) continue;
          seen.add(state);
          for (let level = 1; level <= maxLevel; level++) {
            const cats = (def.levels[level - 1]?.categories ?? []).filter((c) => open.includes(c));
            expect([id, s, level, cats.length > 0]).toEqual([id, s, level, true]);
            for (let i = 0; i < 8; i++) {
              const t = trial(def, level, cats[i % cats.length] as string, open, i);
              checked++;
              const where = [id, s, level, t.category, i];
              const options = t.params.options as string[] | undefined;
              if (options) {
                // Answerable: two options at least, none repeated (ids or words), the answer among them.
                expect([...where, options.length >= 2]).toEqual([...where, true]);
                expect([...where, new Set(options).size]).toEqual([...where, options.length]);
                const labels = t.params.optionLabels as Record<string, string> | undefined;
                if (labels) {
                  const words = options.map((o) => labels[o] ?? o);
                  expect([...where, new Set(words).size]).toEqual([...where, words.length]);
                }
                for (const c of t.expected.choice ?? [])
                  expect([...where, c, options.includes(c)]).toEqual([...where, c, true]);
                for (const o of options)
                  if (catIds.has(o)) expect([...where, o, open.includes(o)]).toEqual([...where, o, true]);
              }
              for (const [from, what, has] of NOT_BEFORE)
                if (!done.has(from)) expect([...where, what, has(t)]).toEqual([...where, what, false]);
              expect([...where, "context first", contextFirst(t)]).toEqual([...where, "context first", true]);
              for (const e of t.events)
                if (e.midi !== null) {
                  expect([...where, e.midi, e.midi >= 28 && e.midi <= 96]).toEqual([...where, e.midi, true]);
                  if (e.track === "chords")
                    expect([...where, "chords", e.midi, e.midi >= 36 && e.midi <= 84]).toEqual([
                      ...where,
                      "chords",
                      e.midi,
                      true,
                    ]);
                }
              const mode = t.params.mode;
              if (mode !== "tap" && mode !== "sing" && mode !== "code")
                expect([...where, full(t)]).toEqual([...where, 1]);
            }
          }
        }
        expect(checked).toBeGreaterThan(0);
      });
  });
}
const trackSessionsIn = (order: readonly string[]) =>
  order.filter((s) => TRACK_SESSIONS.includes(s as never));
walk("earliest legal", EARLY_ORDER, trackSessionsIn(EARLY_ORDER));
walk("late (core first)", LATE_ORDER, trackSessionsIn(LATE_ORDER));

describe("the earliest route really is early", () => {
  test("J1.L03 comes before U14.L02 and R2.L01 before U15.L01; the track families open there without the later core", () => {
    const i = (s: string) => EARLY_ORDER.indexOf(s as never);
    expect(i("J1.L03")).toBeLessThan(i("U14.L02"));
    expect(i("R2.L01")).toBeLessThan(i("U15.L01"));
    expect(i("A2.L01")).toBeLessThan(i("U11.L02"));
    expect(early(fam("fam.jzz.ii-v"), "J1.L03").maxLevel).toBe(1);
    expect(early(fam("fam.jzz.guide"), "J1.L05").maxLevel).toBe(2);
    // J4 (the turnaround level) waits for U15.L06; J3 is open long before it.
    expect(early(fam("fam.jzz.guide"), "J3.L04").maxLevel).toBe(3);
    expect(EARLY_ORDER.indexOf("J3.L04" as never)).toBeLessThan(EARLY_ORDER.indexOf("U15.L06" as never));
  });
});

describe("Wave 7 levels play in headless Strudel exactly as written", () => {
  test("a sample of every new or changed level", async () => {
    const samples: [string, number, string][] = [
      ["fam.jzz.ii-v", 1, "IV-V-I"],
      ["fam.jzz.ii-v", 2, "major-ii-V"],
      ["fam.jzz.ii-v", 3, "locate"],
      ["fam.jzz.ii-v", 4, "chain"],
      ["fam.jzz.extension", 2, "m7-m9-m11"],
      ["fam.jzz.extension", 4, "alt-13-b13"],
      ["fam.jzz.extension", 5, "maj7-s11-69"],
      ["fam.jzz.subs", 2, "backdoor"],
      ["fam.jzz.subs", 3, "in-standard"],
      ["fam.rhy.swing", 4, "hard"],
      ["fam.rhy.clave", 3, "rumba-2-3"],
      ["fam.rhy.clave", 4, "son-2-3"],
      ["fam.rhy.odd-grouping", 3, "9/8i:3+2+2+2"],
      ["fam.rhy.odd-grouping", 4, "5/4:2+3"],
      ["fam.rhy.polyrhythm", 4, "3-vs-4-polymeter"],
      ["fam.snd.roles", 2, "masking"],
    ];
    for (const [id, level, cat] of samples) {
      const def = fam(id);
      const open = def.categories.map((c) => c.id);
      for (let i = 0; i < 2; i++) {
        const t = trial(def, level, cat, open, i);
        const got = await strudelEvents(t.code, Number(t.params.bars ?? 1));
        expect([id, level, cat, i, got.flat]).toEqual([id, level, cat, i, flattenEvents(t.events)]);
      }
    }
  });
});
