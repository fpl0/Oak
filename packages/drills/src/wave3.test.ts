// Wave 3: the stage B and C families as U03–U04 teach them (content/specs/U03.md, U04.md). Golden tests
// state the expected notes; property tests walk the course lesson by lesson and check that every trial
// stays inside what the learner has met at that point (degrees, keys, intervals, syllables), that every
// trial can be answered with the options it shows, and that no option repeats.
import { describe, expect, test } from "bun:test";
import type { Answer, Degree, FamilyDef, KeySpec, Trial } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import * as theory from "@oak/theory";
import { defaultOrder } from "../../../content/syllabus.ts";
import { FAMILIES } from "./catalog/families.ts";
import {
  bindFamily,
  DEFAULT_PROFILE,
  generateTrial,
  introStage,
  maxOpenLevel,
  passiveSequence,
  planSet,
  sungResolutionTrials,
} from "./engine.ts";
import { CTX } from "./gen/common.ts";
import { tonicDistractors } from "./gen/degree.ts";
import { INTERVAL_WORDS, inKeyLow, spellInterval, spellPool } from "./gen/interval.ts";
import { CIRCLE_MAJOR } from "./gen/key.ts";
import { phraseSteps } from "./gen/melody.ts";
import { keyAccidentals, spellAs, spellMidi, stepForDegree, stepToMidi, tonicMidi } from "./kernel.ts";
import { resolutionSteps } from "./music.ts";
import { createRng, trialSeed } from "./rng.ts";
import { flattenEvents, strudelEvents } from "./testing.test-util.ts";

const fam = (id: string): FamilyDef => FAMILIES.find((f) => f.id === id) as FamilyDef;
const rank = (id: string): number => {
  const i = defaultOrder.indexOf(id as never);
  return i < 0 ? Number.POSITIVE_INFINITY : i;
};
/** What the learner has met once `lesson` is completed in the default order. */
function stateAt(def: FamilyDef, lesson: string) {
  const open = def.categories.filter((c) => rank(c.unlockAt) <= rank(lesson)).map((c) => c.id);
  const completed = defaultOrder.slice(0, rank(lesson) + 1) as string[];
  return { open, completed, maxLevel: maxOpenLevel(def, open, completed) };
}
const trial = (def: FamilyDef, level: number, category: string, open: readonly string[], i: number) =>
  generateTrial(
    bindFamily(def),
    { index: i, family: def.id, level, category, seed: trialSeed(def.id, `w3-${level}`, i) },
    DEFAULT_PROFILE,
    open,
  ) as Trial<Answer>;
const name = (midi: number, key: KeySpec) => spellMidi(midi, key).name;

// --- golden: resolutions ------------------------------------------------------------------------------

describe("golden: the way home from every degree (FET: 2–4 fall, 5–7 rise, by step)", () => {
  const C: KeySpec = { tonic: "C", mode: "major" };
  const G: KeySpec = { tonic: "G", mode: "major" };
  const F: KeySpec = { tonic: "F", mode: "major" };
  const path = (d: Degree, key: KeySpec) =>
    resolutionSteps(stepForDegree(d, key), key).map((s) => name(stepToMidi(s, key, 4), key));
  test("C major", () => {
    expect(path("1", C)).toEqual(["C4"]);
    expect(path("2", C)).toEqual(["D4", "C4"]);
    expect(path("3", C)).toEqual(["E4", "D4", "C4"]);
    expect(path("4", C)).toEqual(["F4", "E4", "D4", "C4"]);
    expect(path("5", C)).toEqual(["G4", "A4", "B4", "C5"]);
    expect(path("6", C)).toEqual(["A4", "B4", "C5"]);
    expect(path("7", C)).toEqual(["B4", "C5"]);
  });
  test("a sharp key and a flat key keep their spelling", () => {
    expect(path("7", G)).toEqual(["F#5", "G5"]);
    expect(path("4", G)).toEqual(["C5", "B4", "A4", "G4"]);
    expect(path("4", F)).toEqual(["Bb4", "A4", "G4", "F4"]);
    expect(path("7", F)).toEqual(["E5", "F5"]);
  });
  test("the resolution a trial plays is the path, as Strudel plays it", async () => {
    const def = fam("fam.deg.fet-major");
    const { open } = stateAt(def, "U03.L04");
    for (const [i, d] of (["2", "4", "5", "7"] as Degree[]).entries()) {
      const t = trial(def, 3, `deg.${d}`, open, i);
      const key = t.params.key as KeySpec;
      const res = await evalHeadless(t.resolution?.code as string, 1);
      const midis = res.events.map((e) => e.midi as number);
      const steps = resolutionSteps(stepForDegree(d, key), key);
      // The path, in the octave the trial played the degree in.
      const first = (t.params.steps as (number | string)[]).at(-1) as number | string;
      const want = resolutionSteps(first, key).map((s) => stepToMidi(s, key, t.params.octave as number));
      expect([d, midis]).toEqual([d, want]);
      expect(want).toHaveLength(steps.length);
      // Each step of the way is a scale note of the key, and the last one is home.
      expect(theory.labelPitch(want.at(-1) as number, key).degree).toBe("1");
    }
  });
});

// --- golden: trials -------------------------------------------------------------------------------------

describe("golden: trials state the notes they play", () => {
  test("U03.L02: degree 3 in C after the cadence is an E, and the trial's code plays it", async () => {
    const def = fam("fam.deg.fet-major");
    const { open } = stateAt(def, "U03.L02");
    const t = trial(def, 1, "deg.3", open, 0);
    expect(t.params.key).toEqual({ tonic: "C", mode: "major" });
    expect(t.expected.degrees).toEqual(["3"]);
    const target = t.events.filter((e) => e.track === "mel");
    expect(
      target.map((e) => name(e.midi as number, { tonic: "C", mode: "major" }).replace(/\d/, "")),
    ).toEqual(["E"]);
    const played = await strudelEvents(t.code, Number(t.params.bars));
    expect(played.flat).toEqual(flattenEvents(t.events));
  });

  test("U04.L01: from the tonic, a 5th is 1 up to 5 (C to G: 7 half steps)", () => {
    const def = fam("fam.int.in-key");
    const { open } = stateAt(def, "U04.L01");
    for (let i = 0; i < 12; i++) {
      const t = trial(def, 1, "i5", open, i);
      const [a, b] = t.params.midis as [number, number];
      const key = t.params.key as KeySpec;
      expect(t.expected.degrees).toEqual(["1", "5"]);
      expect(b - a).toBe(7);
      expect(theory.labelPitch(a, key).degree).toBe("1");
    }
  });

  test("interval spelling: a major 3rd above D is F♯, a minor 3rd below E is C♯, the tritone above F is B", () => {
    const at = (pc: string) => spellAs(tonicMidi(pc, 4), pc);
    expect(spellInterval(at("D"), "M3").pc).toBe("F#");
    expect(spellInterval(at("E"), "m3", true).pc).toBe("C#");
    expect(spellInterval(at("F"), "A4").pc).toBe("B");
    expect(spellInterval(at("B"), "d5").pc).toBe("F");
    expect(spellInterval(at("Bb"), "P5").pc).toBe("F");
  });

  test("Find home: the phrase that stops on 3 or 5 offers its last note as the near miss", () => {
    const def = fam("fam.deg.tonic");
    const { open } = stateAt(def, "U03.L01");
    for (let i = 0; i < 20; i++) {
      const t = trial(def, 2, "phrase-35", open, i);
      const key = t.params.key as KeySpec;
      const options = t.params.options as string[];
      const mel = t.events.filter((e) => e.track === "mel");
      const last = spellMidi(mel.at(-1)?.midi as number, key).pc;
      expect(options).toContain(last);
      expect(options).toContain(t.expected.choice?.[0] as string);
      expect(new Set(options).size).toBe(3);
      expect(t.expected.choice).toEqual([key.tonic]);
    }
    // The distractors: the last note, then the 5th.
    const names = ["C", "D", "E", "F", "G", "A", "B"];
    expect(tonicDistractors({ rng: createRng(1) }, names, 2)).toEqual(["E", "G"]);
    expect(tonicDistractors({ rng: createRng(1) }, names, 0)[0]).toBe("G");
  });

  test("the circle: one step clockwise is a 5th up, inside the twelve keys of the course", () => {
    const def = fam("fam.key.circle");
    const { open } = stateAt(def, "U03.L07");
    for (let i = 0; i < 40; i++) {
      const t = trial(def, 1, "dominant", open, i);
      const from = (t.params.key as KeySpec).tonic;
      const answer = t.expected.text?.[0] as string;
      const up = /clockwise \(a fifth up\)/.test(String(t.params.prompt));
      const n = theory.fifthsNeighbours({ tonic: from, mode: "major" });
      expect([from, answer]).toEqual([from, (up ? n.clockwise : n.counterclockwise).tonic]);
      expect(CIRCLE_MAJOR).toContain(answer);
    }
  });
});

// --- dictation material ---------------------------------------------------------------------------

describe("dictation, echo and sight-singing material: short diatonic phrases", () => {
  test("phrases start on 1, 3 or 5, move by step (skips only when allowed), never repeat, end on 1, 3 or 5", () => {
    for (let seed = 0; seed < 300; seed++) {
      const leapMax = [1, 2, 4][seed % 3] as number;
      const p = phraseSteps(createRng(seed), { length: 3 + (seed % 6), lowest: 0, highest: 7, leapMax });
      expect([0, 2, 4]).toContain(p[0] as number);
      expect([0, 2, 4, 7]).toContain(p.at(-1) as number);
      for (let i = 1; i < p.length; i++) {
        const m = Math.abs((p[i] as number) - (p[i - 1] as number));
        expect(m).toBeGreaterThan(0);
        expect(m).toBeLessThanOrEqual(leapMax);
      }
      // After a leap of a 4th or more the line turns back by step.
      for (let i = 2; i < p.length; i++) {
        const prev = (p[i - 1] as number) - (p[i - 2] as number);
        if (Math.abs(prev) >= 3) expect((p[i] as number) - (p[i - 1] as number)).toBe(-Math.sign(prev));
      }
      for (const x of p) expect(x >= 0 && x <= 7).toBe(true);
    }
  });

  test("generated phrases: no ties, no dots, no pickup, nothing over a bar line; Strudel plays the events", async () => {
    for (const id of ["fam.mel.dictation", "fam.mel.echo", "fam.mel.sight"]) {
      const def = fam(id);
      const { open } = stateAt(def, "U03.L10");
      for (let level = 1; level <= Math.min(5, def.levels.length); level++) {
        const lv = def.levels[level - 1] as FamilyDef["levels"][number];
        const category = lv.categories[0] as string;
        for (let i = 0; i < 6; i++) {
          const t = trial(def, level, category, open, i);
          const cueBars = Number(t.params.cueBars ?? 0);
          const mel = t.events.filter((e) => e.track === "mel");
          const durs = mel.map((e) => e.dur[0] / e.dur[1]);
          for (const d of durs) expect([0.125, 0.25, 0.5]).toContain(d);
          const onsets = mel.map((e) => e.onset[0] / e.onset[1]);
          // The first note is on the downbeat after the cue: no pickup.
          expect(onsets[0]).toBe(cueBars);
          for (const [k, on] of onsets.entries()) {
            const end = on + (durs[k] as number);
            expect(Math.floor(on + 1e-9)).toBe(Math.floor(end - 1e-9));
            // Halves sit on beat 1 or 3.
            if (durs[k] === 0.5) expect((((on * 4) % 2) + 2) % 2).toBe(0);
          }
          // Every note is a scale note of the key.
          const key = t.params.key as KeySpec;
          for (const e of mel) expect(theory.labelPitch(e.midi as number, key).chromatic).toBe(false);
          const played = await strudelEvents(t.code, Number(t.params.bars));
          expect(played.flat).toEqual(flattenEvents(t.events));
        }
      }
    }
  }, 120_000);
});

// --- the course walk ----------------------------------------------------------------------------------

const WALK = [
  "U03.L01",
  "U03.L02",
  "U03.L03",
  "U03.L04",
  "U03.L05",
  "U03.L06",
  "U03.L07",
  "U03.L08",
  "U03.L09",
  "U03.L10",
  "U03.L11",
  "U04.L01",
  "U04.L02",
  "U04.L03",
  "U04.L04",
];
const STAGE_BC = [
  "fam.deg.tonic",
  "fam.deg.fet-major",
  "fam.deg.sing",
  "fam.deg.resolve",
  "fam.deg.index",
  "fam.key.scale-spell",
  "fam.key.circle",
  "fam.mel.sight",
  "fam.mel.dictation",
  "fam.mel.echo",
  "fam.int.in-key",
  "fam.int.spell",
  "fam.int.sing",
];
/** The keys the learner has met at a lesson: C; sharp keys and flat keys open with their lessons. */
function keyMet(def: FamilyDef, open: readonly string[], key: KeySpec): boolean {
  const n = keyAccidentals(key);
  const declared = (id: string) => def.categories.some((c) => c.id === id);
  if (n > 0 && declared(CTX.sharpKeys)) return open.includes(CTX.sharpKeys);
  if (n < 0 && declared(CTX.flatKeys)) return open.includes(CTX.flatKeys);
  return true;
}

describe("the course walk: every trial stays inside what the learner has met", () => {
  for (const id of STAGE_BC) {
    test(id, () => {
      const def = fam(id);
      for (const lesson of WALK) {
        if (rank(def.unlock.lesson) > rank(lesson)) continue;
        const { open, maxLevel } = stateAt(def, lesson);
        for (let level = 1; level <= maxLevel; level++) {
          const lv = def.levels[level - 1] as FamilyDef["levels"][number];
          const cats = lv.categories.filter((c) => open.includes(c));
          expect([id, lesson, level, cats.length > 0]).toEqual([id, lesson, level, true]);
          for (let i = 0; i < 16; i++) {
            const t = trial(def, level, cats[i % cats.length] as string, open, i);
            const where = [id, lesson, level, t.category];
            expect([...where, cats.includes(t.category)]).toEqual([...where, true]);
            const key = t.params.key as KeySpec | undefined;
            if (key)
              expect([...where, key.tonic, keyMet(def, open, key)]).toEqual([...where, key.tonic, true]);
            // The degree pad shows the open degrees of the level: the answer is always among them.
            if (def.generator === "degree-id") {
              const pad = cats.map((c) => c.replace("deg.", "").replace("s", "#"));
              for (const d of t.expected.degrees ?? [])
                expect([...where, d, pad.includes(d)]).toEqual([...where, d, true]);
              // Numbers before U03.L08, syllables from it.
              const syll = rank(lesson) >= rank("U03.L08");
              expect([...where, t.params.labels]).toEqual([...where, syll ? "syllables" : "numbers"]);
            }
            // A typed answer is never given away by the prompt's format hint: no prompt carries a row of
            // note letters (the old "(C D E F G A B)" was C major's answer) or the answer itself.
            const prompt = String(t.params.prompt ?? "");
            expect([...where, /\b[A-G][#b]?(?:[ ,]+[A-G][#b]?){2,}\b/.test(prompt)]).toEqual([
              ...where,
              false,
            ]);
            const text = t.expected.text ?? [];
            if (text.length > 0 && id !== "fam.int.spell")
              expect([...where, prompt.includes(`(${text.join(", ")})`)]).toEqual([...where, false]);
            if (id === "fam.key.scale-spell")
              expect([...where, /\((?:[A-G][#b]?[ ,]*)+\)/.test(prompt)]).toEqual([...where, false]);
            // Choice options: the answer is one of them, and none repeats.
            const options = t.params.options as string[] | undefined;
            if (options) {
              expect(new Set(options).size).toBe(options.length);
              for (const c of t.expected.choice ?? []) expect(options).toContain(c);
            }
            // In-key intervals: both notes in the key, the size asked, inside about an octave and a half.
            if (id === "fam.int.in-key") {
              const [a, b] = (t.params.midis as number[]).slice().sort((x, y) => x - y) as [number, number];
              const info = theory.intervalOf(a, b, key ?? null);
              const size = Number(t.category.slice(1));
              expect([...where, info.generic]).toEqual([...where, size]);
              expect(theory.labelPitch(a, key as KeySpec).chromatic).toBe(false);
              expect(theory.labelPitch(b, key as KeySpec).chromatic).toBe(false);
            }
            // Interval spelling: the tritone only from U04.L03, and the answer is the asked interval.
            if (id === "fam.int.spell") {
              const iv = String(t.params.interval);
              if (rank(lesson) < rank("U04.L03")) expect([...where, iv]).not.toEqual([...where, "A4"]);
              if (rank(lesson) < rank("U04.L03")) expect([...where, iv]).not.toEqual([...where, "d5"]);
              // The shown code spells both notes with their octave: note("d4 f#4").
              const [first, second] = (/note\("([^"]+)"\)/.exec(t.code)?.[1] ?? "").split(" ") as [
                string,
                string,
              ];
              const below = t.params.direction === "below";
              const info = below ? theory.intervalOf(second, first) : theory.intervalOf(first, second);
              expect([...where, iv, info.name]).toEqual([...where, iv, iv]);
              expect(second.replace(/-?\d+$/, "").toLowerCase()).toBe(
                String(t.expected.text?.[0]).toLowerCase(),
              );
              expect(String(t.params.prompt)).toContain(INTERVAL_WORDS[iv] as string);
            }
          }
        }
      }
    });
  }

  test("at U03.L02–L04 the ear families stay in C; U03.L05 opens sharp keys, U03.L07 flat keys", () => {
    const def = fam("fam.deg.fet-major");
    const keysAt = (lesson: string) => {
      const { open } = stateAt(def, lesson);
      const out = new Set<number>();
      for (let i = 0; i < 60; i++)
        out.add(keyAccidentals(trial(def, 2, "deg.2", open, i).params.key as KeySpec));
      return out;
    };
    expect([...keysAt("U03.L04")]).toEqual([0]);
    const l05 = keysAt("U03.L05");
    expect([...l05].some((n) => n > 0)).toBe(true);
    expect([...l05].every((n) => n >= 0)).toBe(true);
    expect([...keysAt("U03.L07")].some((n) => n < 0)).toBe(true);
  });

  test("int.in-key levels open with the lessons that teach their shape", () => {
    const def = fam("fam.int.in-key");
    expect(stateAt(def, "U04.L01").maxLevel).toBe(1);
    expect(stateAt(def, "U04.L02").maxLevel).toBe(2);
    expect(stateAt(def, "U04.L03").maxLevel).toBe(2);
    expect(stateAt(def, "U04.L04").maxLevel).toBe(5);
    // Anywhere in the key: the lower note may start below home, the upper stays near the octave above.
    for (let s = 0; s < 200; s++)
      for (let size = 2; size <= 8; size++) {
        const low = inKeyLow("any-up", size, createRng(s));
        expect(low).toBeGreaterThanOrEqual(-2);
        expect(low + size - 1).toBeLessThanOrEqual(9);
      }
  });

  test("interval spelling pools: M and P first, every M/m/P quality next, the tritone on its own", () => {
    expect(spellPool("above-pm")).toEqual(["M2", "M3", "P4", "P5", "M6", "M7", "P8"]);
    expect(spellPool("above-all")).not.toContain("A4");
    expect(spellPool("tritone")).toEqual(["A4", "d5"]);
  });
});

// --- set planning -------------------------------------------------------------------------------------

describe("set planning for the stage B and C families", () => {
  const fet = bindFamily(fam("fam.deg.fet-major"));
  const inKey = bindFamily(fam("fam.int.in-key"));
  const base = {
    family: fet.def.id,
    setId: "s",
    level: 1,
    categoryStats: {},
    quiet: false,
  };
  test("FET level 1 is introduced as 1 against 5, then 3 against both (contracts §7.3)", () => {
    const open = stateAt(fet.def, "U03.L02").open;
    const first = planSet(fet, { ...base, openCategories: open, blockedRemaining: 2 });
    expect(new Set(first.trials.map((t) => t.category))).toEqual(new Set(["deg.1", "deg.5"]));
    const second = planSet(fet, { ...base, setId: "s2", openCategories: open, blockedRemaining: 1 });
    expect(second.blockedIntro).toBe(true);
    const cats = second.trials.map((t) => t.category);
    expect(cats.filter((_, i) => i % 2 === 0).every((c) => c === "deg.3")).toBe(true);
    expect(cats.filter((_, i) => i % 2 === 1).every((c) => c === "deg.1" || c === "deg.5")).toBe(true);
    const later = planSet(fet, { ...base, setId: "s3", openCategories: open, blockedRemaining: 0 });
    expect(later.blockedIntro).toBe(false);
    expect(introStage(fet.def.levels[0] as never, open, 0)).toBeNull();
  });

  test("in-key intervals are introduced by size: 3rd, 5th and octave, then the rest against them", () => {
    const open = stateAt(inKey.def, "U04.L01").open;
    const first = planSet(inKey, {
      ...base,
      family: inKey.def.id,
      openCategories: open,
      blockedRemaining: 2,
    });
    expect(first.trials.every((t) => ["i3", "i5", "i8"].includes(t.category))).toBe(true);
    const second = planSet(inKey, {
      ...base,
      family: inKey.def.id,
      setId: "x",
      openCategories: open,
      blockedRemaining: 1,
    });
    expect(
      second.trials
        .filter((t) => t.index % 2 === 0)
        .every((t) => ["i2", "i4", "i6", "i7"].includes(t.category)),
    ).toBe(true);
  });

  test("sung resolutions: 2–3 per set on distinct degrees, the weakest sung first, the tonic last, never every trial", () => {
    const open = stateAt(fet.def, "U03.L04").open;
    const sungStats = {
      "deg.7": { n: 10, hits: 2 },
      "deg.4": { n: 10, hits: 4 },
      "deg.2": { n: 10, hits: 9 },
    };
    for (let s = 0; s < 30; s++) {
      const plan = planSet(fet, {
        ...base,
        setId: `r${s}`,
        level: 3,
        openCategories: open,
        blockedRemaining: 0,
        sungResolutions: 3,
        sungStats,
      });
      const sung = plan.trials.filter((t) => t.sungResolution);
      expect(sung).toHaveLength(3);
      const cats = sung.map((t) => t.category);
      const nonTonic = new Set(plan.trials.map((t) => t.category).filter((c) => c !== "deg.1"));
      if (nonTonic.size >= 3) expect(new Set(cats).size).toBe(3);
      if (plan.trials.some((t) => t.category === "deg.7")) expect(cats).toContain("deg.7");
      if (plan.trials.filter((t) => t.category !== "deg.1").length >= 3) expect(cats).not.toContain("deg.1");
      const quiet = planSet(fet, {
        ...base,
        setId: `r${s}`,
        level: 3,
        openCategories: open,
        blockedRemaining: 0,
        quiet: true,
      });
      expect(quiet.trials.some((t) => t.sungResolution)).toBe(false);
    }
    // An anchor set of 4 trials never sings all of them; a 1-trial set sings none.
    const four = sungResolutionTrials(
      [0, 1, 2, 3].map((index) => ({ index, category: "deg.3" })),
      {},
      Math.min(3, 4 - 1),
    );
    expect(four).toHaveLength(3);
    const anchor = planSet(fet, {
      ...base,
      setId: "a",
      level: 2,
      openCategories: open,
      blockedRemaining: 0,
      trials: 1,
      sungResolutions: 3,
    });
    expect(anchor.trials.some((t) => t.sungResolution)).toBe(false);
  });

  test("levels 1–2 play the path first; from level 3 the learner sings first (contracts §8.3)", () => {
    const open = stateAt(fet.def, "U03.L04").open;
    expect(trial(fet.def, 2, "deg.2", open, 0).params.playPathFirst).toBe(true);
    expect(trial(fet.def, 3, "deg.6", open, 0).params.playPathFirst).toBe(false);
  });

  test("U04.L04 passive blocks: every open size heard about equally, never twice in a row, the same for a seed", () => {
    const open = stateAt(inKey.def, "U04.L04").open;
    for (const [level, items] of [
      [3, 12],
      [4, 8],
      [5, 14],
    ] as const) {
      const seq = passiveSequence(inKey, level, items, 7, open);
      expect(seq).toHaveLength(items);
      for (let i = 1; i < seq.length; i++) expect(seq[i]?.category).not.toBe(seq[i - 1]?.category);
      const counts = new Map<string, number>();
      for (const t of seq) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
      expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
      expect(passiveSequence(inKey, level, items, 7, open)).toEqual(seq);
      // Each item generates and names its interval.
      for (const spec of seq) {
        const t = generateTrial(inKey, spec, DEFAULT_PROFILE, open);
        expect(t.params.generic).toBeTruthy();
        expect(t.params.shape).toBe(["any-up", "any-down", "harmonic"][level - 3]);
      }
    }
  });
});
