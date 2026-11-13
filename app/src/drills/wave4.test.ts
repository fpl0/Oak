// Wave 4 stage D in the runner's pure core and machine: the key every harmony trial is heard in (the reference
// cadence), the chords a trial sounds read with @oak/theory and checked against the engine's own answers, the
// after-answer listening, the staged chord dictation (bass → quality → numerals) and the sung bass line, melodic
// dictation as degrees, code or staff from level 4, honest level news, and the hub's stage D. Music is checked
// against the engine's trials (their expected answers) and @oak/theory, never against a local table.
import { describe, expect, test } from "bun:test";
import type { Answer, Degree, DrillFinish, DrillSession, FamilyDef, Trial } from "@oak/api";
import { createRegistry, DEFAULT_PROFILE, generateTrial, gradeTrial } from "@oak/drills";
import { midisOf } from "@oak/grader/testing";
import { labelPitch, readChord, romanParts, romanText } from "@oak/theory";
import { createActor, fromCallback, fromPromise, waitFor } from "xstate";
import { EAR_STAGES, families } from "../../../content/families.ts";
import {
  alignNotes,
  arpeggioPlan,
  bassAloneWhileAnswering,
  bassDegreeOf,
  bassPlan,
  bassSingTargets,
  chordComparePlan,
  chordSlotsOf,
  chordsOnlyPlan,
  contextKeyOf,
  contextPlan,
  gradeStep,
  harmonyCuePlan,
  isBassTrial,
  isHarmonyTrial,
  isStagedTrial,
  revoice,
  singCuePlan,
  slotLabels,
  slotSymbol,
  stagedKeyOf,
  stepExpected,
  stepSpecOf,
  sungBassDegrees,
  tonicPc,
  withBass,
} from "./harmony.ts";
import {
  type DrillDeps,
  type DrillInput,
  drillMachine,
  replaysWithHelp,
  stagesAnswer,
  type TrialSource,
} from "./machine.ts";
import {
  categoryLabel,
  dictationModesOf,
  dictationSurface,
  gradeDrillTrial,
  groupByStage,
  levelChangeText,
  levelLine,
  levelNews,
  nextLevelLesson,
  optionLabel,
  planDrillSet,
} from "./model.ts";
import { comparePlan, cuePlan, stagingOf } from "./plans.ts";

const registry = createRegistry(families, []);
const def = (id: string) => families.find((f) => f.id === id) as FamilyDef;
const PROFILE = { ...DEFAULT_PROFILE, comfLow: 50, comfHigh: 65 };

function trialAt(familyId: string, level: number, seed: number, category?: string): Trial {
  const d = def(familyId);
  const cats = d.levels.slice(0, level).flatMap((l) => l.categories);
  const own = d.levels[level - 1]?.categories ?? [];
  const pool = own.length > 0 ? own : cats;
  return generateTrial(
    registry.family(familyId as never),
    {
      index: 0,
      family: familyId as never,
      level,
      category: category ?? (pool[seed % pool.length] as string),
      seed,
    },
    PROFILE,
    cats,
  ) as Trial;
}
const SEEDS = Array.from({ length: 24 }, (_, i) => 1000 + i * 37);
const pcsOf = (midis: readonly number[]) => [...new Set(midis.map((m) => ((m % 12) + 12) % 12))];

describe("the key every harmony trial is heard in", () => {
  test("stage D trials are harmony trials; silent concept trials and melody are not", () => {
    expect(isHarmonyTrial(trialAt("fam.chd.quality-triad", 1, 3))).toBe(true);
    expect(isHarmonyTrial(trialAt("fam.har.schema", 1, 3))).toBe(true);
    expect(isHarmonyTrial(trialAt("fam.har.rn", 1, 3))).toBe(false);
    expect(isHarmonyTrial(trialAt("fam.deg.fet-major", 1, 3))).toBe(false);
  });

  test("a lone chord is placed in a key it belongs to: its numeral there is diatonic (no ♭ or ♯)", () => {
    for (const q of ["maj", "min", "dim", "aug"] as const)
      for (const seed of SEEDS.slice(0, 8)) {
        const t = trialAt("fam.chd.quality-triad", 4, seed, q);
        const key = contextKeyOf(t);
        expect(key).not.toBeNull();
        const reading = readChord(t.params.midis as number[], (t.params.midis as number[])[0] as number);
        expect(reading?.quality).toBe(q);
        const rn = romanText(reading?.chord as never, key as never);
        if (q === "aug") {
          // III+ of harmonic minor: the root a minor third above the tonic.
          expect(key?.mode).toBe("minor");
          expect(((((t.params.rootPc as number) - tonicPc(key as never)) % 12) + 12) % 12).toBe(3);
        } else expect(romanParts(rn, key as never)?.alt).toBe(0);
        // The same seed places it the same way (a reload hears the same key).
        expect(contextKeyOf(t)).toEqual(key);
      }
  });

  test("every harmony trial opens with the reference cadence I–IV–V–I in its key", () => {
    for (const id of [
      "fam.chd.quality-triad",
      "fam.chd.inversion",
      "fam.har.bass",
      "fam.har.schema",
      "fam.har.cadence",
    ]) {
      const t = trialAt(id, 1, 77);
      const key = contextKeyOf(t);
      const cue = harmonyCuePlan(t);
      expect(cue).not.toBeNull();
      const notes = cue?.events.map((e) => Number(e.value.note)) ?? [];
      const first = notes.slice(0, 4);
      // The first and last chords are the tonic triad with the tonic in the bass.
      expect(pcsOf(first)).toContain(tonicPc(key as never));
      expect(((Math.min(...first) % 12) + 12) % 12).toBe(tonicPc(key as never));
      // The stimulus waits for it, with a breath after.
      const st = stagingOf(t, PROFILE);
      expect(st.cue).toBe(st.cue);
      expect(st.stimulusAt).toBeGreaterThan(cue?.durationSec ?? 0);
      expect(cuePlan(t, PROFILE)?.events.length).toBe(cue?.events.length);
    }
  });

  test("a sung trial hears the reference cadence with its tonic in the comfortable range", () => {
    const t = trialAt("fam.deg.sing", 1, 41);
    expect(t.params.mode).toBe("sing");
    const st = stagingOf(t, PROFILE);
    const ref = singCuePlan(t, PROFILE);
    expect(ref).not.toBeNull();
    expect(st.cue?.events.length).toBe(ref?.events.length);
    // The tonic (the lowest note of the last chord but one octave up: the chord root on top) is in range.
    const key = t.params.key as { tonic: string; mode: string };
    const tonics = (ref?.events ?? [])
      .map((e) => Number(e.value.note))
      .filter((m) => ((m % 12) + 12) % 12 === tonicPc(key as never));
    expect(tonics.some((m) => m >= PROFILE.comfLow && m <= PROFILE.comfHigh)).toBe(true);
  });
});

describe("the chords a trial sounds", () => {
  test("chord dictation: one slot per numeral, and @oak/theory reads every slot as the engine's numeral", () => {
    for (const level of [1, 2, 3])
      for (const seed of SEEDS) {
        const t = trialAt("fam.har.progression", level, seed);
        const want = (t.expected as Answer).rn as string[];
        const slots = chordSlotsOf(t);
        expect(slots).toHaveLength(want.length);
        const key = t.params.key as never;
        slots.forEach((s, i) => {
          expect(s.reading).not.toBeNull();
          const got = romanParts(romanText(s.reading?.chord as never, key), key);
          const exp = romanParts(want[i] as string, key);
          expect(got).toEqual(exp);
        });
      }
  });

  test("bass-degree trials: the bass of each slot is the engine's degree", () => {
    for (const level of [1, 2, 3, 4])
      for (const seed of SEEDS.slice(0, 12)) {
        const t = trialAt("fam.har.bass", level, seed);
        const key = t.params.key as never;
        const got = chordSlotsOf(t).map((s) => bassDegreeOf(s, key));
        expect(got).toEqual((t.expected as Answer).degrees as Degree[]);
        expect(isBassTrial(t)).toBe(true);
      }
  });

  test("a cadence phrase reads its chords without the melody; a lone chord reads as one chord", () => {
    const t = trialAt("fam.har.cadence", 1, 5, "PAC");
    const slots = chordSlotsOf(t);
    expect(slots).toHaveLength(4);
    const key = t.params.key as never;
    expect(romanParts(romanText(slots[3]?.reading?.chord as never, key), key)?.degree).toBe(1);
    expect(romanParts(romanText(slots[2]?.reading?.chord as never, key), key)?.degree).toBe(5);
    const lone = trialAt("fam.chd.quality-triad", 5, 9, "min");
    expect(chordSlotsOf(lone)).toHaveLength(1);
    expect(chordSlotsOf(lone)[0]?.reading?.quality).toBe("min");
  });

  test("the answer in context labels follow the chord lenses; the bass degree is always there", () => {
    const t = trialAt("fam.har.schema", 1, 12, "axis");
    const off = slotLabels(t, { chordSymbols: false, romanNumerals: false });
    expect(off.map((l) => l.degree)).toEqual(["1", "5", "6", "4"]);
    expect(off.every((l) => l.symbol === null && l.rn === null)).toBe(true);
    const on = slotLabels(t, { chordSymbols: true, romanNumerals: true });
    expect(on.map((l) => l.rn)).toEqual(["I", "V", "vi", "IV"]);
    expect(on.every((l) => typeof l.symbol === "string" && (l.symbol as string).length > 0)).toBe(true);
  });
});

describe("listening after the answer", () => {
  test("the bass alone plays one note per chord, the lowest one", () => {
    const t = trialAt("fam.har.bass", 1, 21);
    const plan = bassPlan(t);
    const slots = chordSlotsOf(t);
    expect(plan?.events.map((e) => e.value.note)).toEqual(slots.map((s) => s.bass));
    expect(plan?.events.map((e) => e.at)).toEqual(slots.map((s) => s.at / t.cps));
  });

  test("the chords broken: every chord's notes from the bass up, one at a time", () => {
    const t = trialAt("fam.har.progression", 1, 8);
    const plan = arpeggioPlan(t);
    const slots = chordSlotsOf(t);
    expect(plan?.events).toHaveLength(slots.reduce((a, s) => a + s.midis.length, 0));
    const firstChord = plan?.events.slice(0, slots[0]?.midis.length).map((e) => Number(e.value.note));
    expect(firstChord).toEqual([...(slots[0]?.midis ?? [])].sort((a, b) => a - b));
    const ats = plan?.events.map((e) => e.at) ?? [];
    expect([...ats].sort((a, b) => a - b)).toEqual(ats);
  });

  test("in context: the cadence, the passage, and for a lone chord the way home", () => {
    const loop = trialAt("fam.har.schema", 1, 4);
    const ctx = contextPlan(loop);
    const cue = harmonyCuePlan(loop);
    expect(ctx?.durationSec).toBeGreaterThan((cue?.durationSec ?? 0) + 4 / loop.cps - 0.01);
    const lone = trialAt("fam.chd.quality-triad", 1, 4);
    const ctx2 = contextPlan(lone);
    const last = ctx2?.events.slice(-4).map((e) => Number(e.value.note)) ?? [];
    expect(pcsOf(last)).toContain(tonicPc(contextKeyOf(lone) as never));
  });

  test("yours, then it: your quality on the same voicing (verified as that quality), then the chord", () => {
    const c = [48, 52, 55, 60];
    expect(revoice(c, 0, "min")).toEqual([48, 51, 55, 60]);
    expect(revoice(c, 0, "aug")).toEqual([48, 52, 56, 60]);
    expect(readChord(revoice([52, 55, 60], 0, "dim") as number[], 51)?.quality).toBe("dim");
    expect(withBass([48, 52, 55, 60], 0, "maj", "first")?.[0]).toBe(40);
    for (const seed of SEEDS.slice(0, 6)) {
      const t = trialAt("fam.chd.quality-triad", 4, seed);
      const exp = (t.expected as Answer).qualities?.[0];
      const other = exp === "maj" ? "min" : "maj";
      const plan = chordComparePlan(t, { qualities: [other] });
      const notes = plan?.events.map((e) => Number(e.value.note)) ?? [];
      const yours = notes.slice(0, notes.length / 2);
      expect(readChord(yours, Math.min(...yours))?.quality).toBe(other);
      expect(notes.slice(notes.length / 2)).toEqual(t.params.midis as number[]);
      expect(chordComparePlan(t, { qualities: [exp as never] })).toBeNull();
      expect(comparePlan(t, { taps: null, answer: { qualities: [other] } }, null)).not.toBeNull();
    }
  });

  test("the chords and the bass, evaluated by Strudel, are the notes the slots read", async () => {
    const t = trialAt("fam.har.bass", 1, 33);
    const heard = (await midisOf(t.code, Number(t.params.bars ?? 4))).filter((m): m is number => m !== null);
    const read = chordSlotsOf(t).flatMap((s) => s.midis);
    expect([...heard].sort((a, b) => a - b)).toEqual([...read].sort((a, b) => a - b));
  });
});

describe("staged chord dictation", () => {
  const t = trialAt("fam.har.progression", 2, 1004);
  const k = stagedKeyOf(t);

  test("bass, quality and numerals come from the chords themselves", () => {
    expect(isStagedTrial(t)).toBe(true);
    expect(k).not.toBeNull();
    const key = t.params.key as never;
    const slots = chordSlotsOf(t);
    expect(k?.bass).toEqual(slots.map((s) => labelPitch(s.bass, key).degree));
    expect(k?.quality).toEqual(slots.map((s) => s.reading?.quality));
    expect(k?.rn).toEqual((t.expected as Answer).rn);
  });

  test("each step is answered with the answers registry's widgets", () => {
    expect(stepSpecOf(t, "bass")).toMatchObject({ ui: "degree-pad", sequenceLen: k?.rn.length });
    expect(stepSpecOf(t, "quality")).toMatchObject({ ui: "quality-pad", set: ["maj", "min", "dim"] });
    expect(stepSpecOf(t, "rn")).toMatchObject({
      ui: "rn-palette",
      slots: k?.rn.length,
      allow: t.params.rnAllow,
    });
  });

  test("a step passes at 0.8: three of four chords is not yet enough", () => {
    const right = stepExpected(t, "bass") as Answer;
    expect(gradeStep(t, "bass", right)).toMatchObject({ credit: 1, passed: true });
    const one = [...(right.degrees ?? [])];
    one[1] = one[1] === "1" ? "2" : "1";
    const r = gradeStep(t, "bass", { degrees: one });
    expect(r.passed).toBe(false);
    expect(r.marks).toEqual([true, false, true, true]);
    expect(r.credit).toBe(0.75);
  });

  test("numerals are compared by degree, quality and inversion, never by string", () => {
    const key = { tonic: "C", mode: "major" } as const;
    expect(romanParts("vii°", key)).toEqual(romanParts("viio", key));
    const rn = (stepExpected(t, "rn") as Answer).rn as string[];
    expect(gradeStep(t, "rn", { rn: rn.map((x) => x.replace(/o$/, "°")) }).passed).toBe(true);
    // The inversion counts: a root-position numeral where the chord is inverted is wrong.
    const inv = rn.findIndex((x) => /6/.test(x));
    if (inv >= 0) {
      const flat = [...rn];
      flat[inv] = (flat[inv] as string).replace(/6.*$/, "");
      expect(gradeStep(t, "rn", { rn: flat }).marks[inv]).toBe(false);
    }
  });
});

describe("the sung bass line", () => {
  test("one target per root, in the learner's range, in time with the chords", () => {
    const t = trialAt("fam.har.bass", 1, 52);
    const targets = bassSingTargets(t, PROFILE);
    const slots = chordSlotsOf(t);
    expect(targets).toHaveLength(slots.length);
    for (const [i, x] of targets.entries()) {
      expect(Math.abs(x.midi - (PROFILE.comfLow + PROFILE.comfHigh) / 2)).toBeLessThanOrEqual(6);
      expect((((x.midi - (slots[i]?.bass ?? 0)) % 12) + 12) % 12).toBe(0);
      expect(x.off).toBeGreaterThan(x.on);
      if (i > 0) expect(x.on).toBeGreaterThan(targets[i - 1]?.on ?? 0);
    }
    // While the roots are sung the chords play without their bass.
    expect(
      chordsOnlyPlan(t).events.every(
        (e) => !slots.some((s) => s.bass === e.value.note && e.value.s === s.sounds.bass),
      ),
    ).toBe(true);
    // The reference cadence before it sits in the octave of the sung notes.
    expect(
      singCuePlan(
        t,
        PROFILE,
        "singTargets",
        targets.map((x) => x.midi),
      ),
    ).not.toBeNull();
  });

  test("sung notes read as degrees, one per chord; a missed one stays empty and is kept as a miss", () => {
    const t = trialAt("fam.har.bass", 1, 52);
    const key = t.params.key as never;
    const targets = bassSingTargets(t, PROFILE);
    const notes = alignNotes(
      targets.slice(0, 3).map((x) => ({ midi: x.midi, cents: 5, credit: 1 })),
      targets.length,
    );
    expect(notes).toHaveLength(targets.length);
    expect(notes[3]).toEqual({ midi: null, cents: null, credit: 0 });
    const degrees = sungBassDegrees(t, notes);
    expect(degrees.slice(0, 3)).toEqual(((t.expected as Answer).degrees as Degree[]).slice(0, 3));
    expect(degrees[3]).toBeNull();
    expect(labelPitch(targets[0]?.midi ?? 0, key).degree).toBe((t.expected as Answer).degrees?.[0]);
  });
});

describe("melodic dictation up to X1's level", () => {
  test("from level 4 the tune may be written as degrees, code or on the staff", () => {
    const d = def("fam.mel.dictation");
    expect(dictationModesOf(trialAt("fam.mel.dictation", 2, 3), d)).toEqual([]);
    for (const level of [4, 5, 6]) {
      const t = trialAt("fam.mel.dictation", level, 11);
      expect(dictationModesOf(t, d)).toEqual(["code", "staff", "degrees"]);
      const pad = dictationSurface(t, d, "degrees");
      expect(pad.kind === "widget" && pad.spec.ui).toBe("degree-pad");
      expect(dictationSurface(t, d, "staff").kind === "widget").toBe(true);
    }
  });

  test("a degree answer to a code level is graded slot by slot on the degrees", () => {
    const t = trialAt("fam.mel.dictation", 4, 19);
    const family = registry.family("fam.mel.dictation" as never);
    const want = (t.expected as Answer).degrees as Degree[];
    const right = gradeDrillTrial(family, t, { answer: { degrees: want }, rtMs: 1000, replays: 0 }, PROFILE);
    expect(right).toMatchObject({ correct: true, credit: 1 });
    const wrong = gradeDrillTrial(
      family,
      t,
      { answer: { degrees: want.map(() => "1" as Degree) }, rtMs: 1000, replays: 0 },
      PROFILE,
    );
    expect(wrong.correct).toBe(false);
    // Code still goes to the code grader.
    const code = gradeDrillTrial(
      family,
      t,
      { answer: { text: ['n("0")'] }, rtMs: 1000, replays: 0 },
      PROFILE,
    );
    expect(code.correct).toBe(false);
  });
});

describe("honest levels and the hub", () => {
  test("a promotion says what the next level adds; a step back is calm", () => {
    // Read against the catalog as it stands (the engine owns the ladders): every level that adds a quality
    // names it, a level that turns inversions on says so, and a level that adds nothing nameable says nothing.
    const q = def("fam.chd.quality-triad");
    for (let level = 2; level <= q.levels.length; level++) {
      const cur = q.levels[level - 1];
      const prev = q.levels[level - 2];
      const added = (cur?.categories ?? []).filter((c) => !(prev?.categories ?? []).includes(c));
      const news = levelNews(q, level);
      for (const c of added)
        expect(news).toContain(
          ({ maj: "major", min: "minor", dim: "diminished", aug: "augmented" } as Record<string, string>)[
            c
          ] ?? c,
        );
      if (cur?.inversions === true && prev?.inversions !== true)
        expect(news).toContain("chords in any inversion");
      if (added.length === 0 && cur?.inversions === prev?.inversions && cur?.arpeggiate === prev?.arpeggiate)
        expect(news).toBeNull();
    }
    const withDim = q.levels.findIndex(
      (l, i) => l.categories.includes("dim") && !q.levels[i - 1]?.categories.includes("dim"),
    );
    if (withDim > 0)
      expect(levelChangeText("promoted", withDim + 1, q.levels.length, q)).toMatch(
        new RegExp(`^Level ${withDim + 1} of ${q.levels.length} opens next time: .*diminished`),
      );
    expect(levelChangeText("demoted", 1, 5, q)).toMatch(/^Next time starts at level 1 of 5\. /);
    const sc = def("fam.har.schema");
    const second = levelNews(sc, 2);
    for (const c of (sc.levels[1]?.categories ?? []).filter(
      (c) => !(sc.levels[0]?.categories ?? []).includes(c),
    ))
      expect(second).toContain(optionLabel(c));
    expect(categoryLabel("two-per-bar")).toBe("Two chords a bar");
    expect(optionLabel("minor")).toBe("minor");
    expect(optionLabel("dim")).toBe("Diminished");
  });

  test("stage D holds the chord work, chord dictation included; concepts stay with the facts", () => {
    const groups = groupByStage(families, EAR_STAGES);
    const d = groups.find((g) => g.key === "D");
    const ids = d?.families.map((f) => f.id) ?? [];
    expect(ids.slice(0, 5)).toEqual([...EAR_STAGES.D]);
    expect(ids).toContain("fam.har.progression");
    expect(ids).toContain("fam.har.function");
    const concepts = groups.find((g) => g.key === "concepts")?.families.map((f) => f.id) ?? [];
    expect(concepts).toContain("fam.har.rn");
    expect(concepts).not.toContain("fam.har.progression");
  });

  test("an FET set sings the way home on the weakest sung degrees (the server's sungStats)", () => {
    const id = "fam.deg.fet-major";
    const d = def(id);
    const level = 3;
    const s = {
      setId: "w4-sung",
      levels: { [id]: level },
      openCategories: { [id]: d.levels.slice(0, level).flatMap((l) => l.categories) },
      trialsPlanned: 8,
    } as unknown as DrillSession;
    const cats = d.levels.slice(0, level).flatMap((l) => l.categories);
    const strong = Object.fromEntries(cats.map((c) => [c, { n: 20, hits: 20 }]));
    const weak = cats.find((c) => c !== "deg.1") as string;
    const sungStats = { ...strong, [weak]: { n: 10, hits: 0 } };
    const { trials } = planDrillSet(
      registry.family(id as never),
      s,
      { categoryStats: strong, blockedRemaining: 0, sungStats },
      PROFILE,
      { sungResolutions: 2 },
    );
    const sung = trials.filter((t) => t.trial.params.sungResolution === true).map((t) => t.trial.category);
    if (trials.some((t) => t.trial.category === weak)) expect(sung).toContain(weak);
  });
});

// --- the machine ---------------------------------------------------------------------------------

function sessionOf(familyId: string, trials: number, level: number): DrillSession {
  const d = def(familyId);
  return {
    id: `drl_${familyId}`,
    sessionId: null,
    purpose: "practice",
    familyIds: [familyId as DrillSession["familyIds"][number]],
    setId: `w4_${familyId}`,
    levels: { [familyId]: level },
    openCategories: { [familyId]: d.levels[level - 1]?.categories ?? [] },
    focus: {},
    trialsPlanned: trials,
    startedAt: "2026-11-12T10:00:00.000Z",
    finishedAt: null,
  };
}

function fixedSource(trials: Trial[]): TrialSource {
  return {
    total: trials.length,
    at: (i) => ({
      spec: {
        index: i,
        family: trials[i]?.family as never,
        level: trials[i]?.level ?? 1,
        category: "",
        seed: 0,
      },
      trial: trials[i] as Trial,
    }),
  };
}

const sungTake = [
  { midi: 55, cents: 10, credit: 1 },
  { midi: 52, cents: -8, credit: 1 },
];
const deps: DrillDeps = {
  grade: (trial, response) => gradeTrial(registry.family(trial.family), trial, response, PROFILE),
  stepsOf: (trial) => (isStagedTrial(trial) ? ["bass", "quality", "rn"] : null),
  gradeStep: (trial, step, answer) => gradeStep(trial, step, answer),
  hasSungPart: (trial) => isBassTrial(trial),
  gradeSungPart: (trial) => ({ notes: sungTake, degrees: sungBassDegrees(trial, sungTake) }),
  gradeResolution: () => ({ credit: 0, passed: false, sung: [] }),
  sungOf: () => [],
  now: () => 1000,
  iso: () => "2026-11-12T10:01:00.000Z",
};

function runMachine(trials: Trial[], quiet = false) {
  const s = sessionOf(trials[0]?.family as string, trials.length, trials[0]?.level ?? 1);
  const sent: number[] = [];
  let singing = 0;
  const machine = drillMachine.provide({
    actors: {
      start: fromPromise(async () => ({ session: s, source: fixedSource(trials) })),
      present: fromCallback(() => () => {}),
      audition: fromCallback(({ sendBack }) => {
        sendBack({ type: "AUDITION_DONE" });
        return () => {};
      }),
      resolve: fromCallback(() => () => {}),
      singPart: fromCallback(() => {
        singing++;
        return () => {};
      }),
      finish: fromPromise(
        async () =>
          ({
            session: s,
            meanCredit: 1,
            medianRtMs: 1,
            reviews: [],
            evidence: [],
            streak: {},
          }) as unknown as DrillFinish,
      ),
    },
    actions: {
      persist: () => {},
      send: (_, p) => sent.push(p.record.idx),
      done: () => {},
    },
  });
  const input: DrillInput = {
    purpose: "practice",
    familyIds: s.familyIds,
    warmupItemId: null,
    sessionId: null,
    quiet,
    tolCents: 50,
    resume: null,
    deps,
  };
  const actor = createActor(machine, { input });
  actor.start();
  return { actor, sent, singing: () => singing };
}

describe("drill machine: staged chord dictation", () => {
  test("bass, then quality, then numerals; a step opens only when the one before passes or is shown", async () => {
    const t = trialAt("fam.har.progression", 1, 2001);
    const { actor, sent } = runMachine([t]);
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }));
    expect(actor.getSnapshot().context.steps).toMatchObject({ order: ["bass", "quality", "rn"], at: 0 });
    actor.send({ type: "PRESENTED" });
    // The numerals cannot be submitted before the bass and the quality.
    actor.send({ type: "SUBMIT", answer: stepExpected(t, "rn") as Answer });
    expect(actor.getSnapshot().matches({ trial: "answering" })).toBe(true);
    // A wrong bass stays on the bass step, marked chord by chord.
    const bass = (stepExpected(t, "bass") as Answer).degrees as Degree[];
    actor.send({ type: "STEP_CHECK", answer: { degrees: bass.map(() => "7" as Degree) } });
    let steps = actor.getSnapshot().context.steps;
    expect(steps?.at).toBe(0);
    expect(steps?.results.bass).toMatchObject({ passed: false, tries: 1 });
    // Then right: the quality opens.
    actor.send({ type: "STEP_CHECK", answer: { degrees: bass } });
    steps = actor.getSnapshot().context.steps;
    expect(steps?.at).toBe(1);
    expect(steps?.results.bass).toMatchObject({ passed: true, tries: 2, credit: 1 });
    // The quality is shown, not found: help.
    actor.send({ type: "STEP_REVEAL" });
    steps = actor.getSnapshot().context.steps;
    expect(steps?.at).toBe(2);
    expect(steps?.results.quality?.revealed).toBe(true);
    // A STEP_CHECK on the last step is not a step check: the numerals are the answer.
    actor.send({ type: "STEP_CHECK", answer: stepExpected(t, "rn") as Answer });
    expect(actor.getSnapshot().context.steps?.at).toBe(2);
    actor.send({ type: "SUBMIT", answer: stepExpected(t, "rn") as Answer });
    const snap = actor.getSnapshot();
    expect(snap.matches("feedback")).toBe(true);
    const rec = snap.context.records[0];
    expect(rec?.correct).toBe(true);
    expect(rec?.response.answer?.stages).toEqual({
      bass,
      quality: [],
      rn: (t.expected as Answer).rn,
    });
    // One step shown: the replays report it as help past the limit.
    expect(rec?.replays).toBe(t.cue.replays + 1);
    expect(sent).toEqual([0]);
  });

  test("helpers: shown steps count as replays past the limit; stages are listed per step", () => {
    expect(replaysWithHelp(2, 6, 0)).toBe(2);
    expect(replaysWithHelp(2, 6, 1)).toBe(7);
    expect(replaysWithHelp(9, 6, 1)).toBe(9);
    expect(
      stagesAnswer(
        {
          order: ["bass", "quality", "rn"],
          at: 2,
          results: {
            bass: {
              answer: { degrees: ["1", "4"] },
              credit: 1,
              passed: true,
              marks: [],
              revealed: false,
              tries: 1,
            },
            quality: {
              answer: { qualities: ["maj", "maj"] },
              credit: 1,
              passed: true,
              marks: [],
              revealed: false,
              tries: 1,
            },
          },
        },
        { rn: ["I", "IV"] },
      ),
    ).toEqual({ bass: ["1", "4"], quality: ["maj", "maj"], rn: ["I", "IV"] });
  });

  test("a trial with one answer has no steps, and a wrong numeral answer is graded as such", async () => {
    const t = trialAt("fam.har.schema", 1, 2003);
    const { actor } = runMachine([t]);
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }));
    expect(actor.getSnapshot().context.steps).toBeNull();
    actor.send({ type: "STEP_CHECK", answer: { choice: ["axis"] } });
    expect(actor.getSnapshot().matches({ trial: "presenting" })).toBe(true);
    const exp = (t.expected as Answer).choice?.[0];
    actor.send({ type: "SUBMIT", answer: { choice: [exp === "axis" ? "three-chord" : "axis"] } });
    expect(actor.getSnapshot().context.records[0]?.correct).toBe(false);
    actor.send({ type: "AUDITION", what: "context" });
    await waitFor(actor, (st) => st.matches({ feedback: "idle" }));
  });
});

describe("drill machine: the bass alone before the answer (review:journey)", () => {
  test("offered on a bass trial and on a staged trial's bass step only", () => {
    expect(bassAloneWhileAnswering(trialAt("fam.har.bass", 1, 3101), null)).toBe(true);
    const staged = trialAt("fam.har.progression", 1, 3102);
    expect(bassAloneWhileAnswering(staged, "bass")).toBe(true);
    expect(bassAloneWhileAnswering(staged, "quality")).toBe(false);
    expect(bassAloneWhileAnswering(staged, "rn")).toBe(false);
    expect(bassAloneWhileAnswering(trialAt("fam.chd.inversion", 2, 3103), null)).toBe(false);
  });

  test("plays the bass line, keeps the answer open, and counts as a replay", async () => {
    const t = trialAt("fam.har.bass", 1, 3104);
    expect(bassPlan(t)?.events.length).toBe(chordSlotsOf(t).length);
    const { actor } = runMachine([t]);
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }));
    actor.send({ type: "PRESENTED" });
    actor.send({ type: "BASS_ALONE" });
    await waitFor(actor, (st) => st.matches({ trial: "answering" }));
    expect(actor.getSnapshot().context.replays).toBe(1);
    actor.send({ type: "SUBMIT", answer: { degrees: (t.expected as Answer).degrees as Degree[] } });
    expect(actor.getSnapshot().context.records[0]).toMatchObject({ correct: true, replays: 1 });
  });

  test("a staged trial past its bass step does not take it", async () => {
    const t = trialAt("fam.har.progression", 1, 3105);
    const { actor } = runMachine([t]);
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }));
    actor.send({ type: "PRESENTED" });
    actor.send({ type: "STEP_CHECK", answer: stepExpected(t, "bass") as Answer });
    expect(actor.getSnapshot().context.steps?.at).toBe(1);
    actor.send({ type: "BASS_ALONE" });
    expect(actor.getSnapshot().context.replays).toBe(0);
    expect(actor.getSnapshot().matches({ trial: "answering" })).toBe(true);
  });
});

describe("drill machine: the sung bass line", () => {
  test("sing the roots, the pad is prefilled, the pick is graded and the notes are recorded", async () => {
    const t = trialAt("fam.har.bass", 1, 3001);
    const { actor, singing } = runMachine([t]);
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }));
    actor.send({ type: "PRESENTED" });
    actor.send({ type: "SING_PART" });
    expect(actor.getSnapshot().matches({ trial: "singingPart" })).toBe(true);
    expect(singing()).toBe(1);
    actor.send({ type: "CAPTURED", frames: [] });
    const snap = actor.getSnapshot();
    expect(snap.matches({ trial: "answering" })).toBe(true);
    expect(snap.context.sungPart?.notes).toEqual(sungTake);
    // One degree per chord: the two sung notes, then two empty slots.
    expect(snap.context.sungPart?.degrees).toHaveLength(chordSlotsOf(t).length);
    expect(snap.context.sungPart?.degrees.slice(2)).toEqual([null, null]);
    actor.send({ type: "SUBMIT", answer: { degrees: (t.expected as Answer).degrees as Degree[] } });
    const rec = actor.getSnapshot().context.records[0];
    expect(rec?.correct).toBe(true);
    expect(rec?.response.sung).toEqual(sungTake);
    expect(rec?.modality).toBe("normal");
  });

  test("skipping the sung part records nothing sung and costs nothing", async () => {
    const t = trialAt("fam.har.bass", 1, 3002);
    const { actor } = runMachine([t]);
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }));
    actor.send({ type: "PRESENTED" });
    actor.send({ type: "SING_PART" });
    actor.send({ type: "SKIP_SUNG" });
    expect(actor.getSnapshot().matches({ trial: "answering" })).toBe(true);
    expect(actor.getSnapshot().context.sungPart?.skipped).toBe(true);
    actor.send({ type: "SUBMIT", answer: { degrees: (t.expected as Answer).degrees as Degree[] } });
    expect(actor.getSnapshot().context.records[0]).toMatchObject({ correct: true, response: { sung: null } });
  });

  test("Quiet mode never starts the sung part; switching Quiet on mid-take stops it", async () => {
    const t = trialAt("fam.har.bass", 1, 3003);
    const quiet = runMachine([t], true);
    await waitFor(quiet.actor, (st) => st.matches({ trial: "presenting" }));
    quiet.actor.send({ type: "PRESENTED" });
    quiet.actor.send({ type: "SING_PART" });
    expect(quiet.actor.getSnapshot().matches({ trial: "answering" })).toBe(true);
    expect(quiet.singing()).toBe(0);
    const loud = runMachine([t]);
    await waitFor(loud.actor, (st) => st.matches({ trial: "presenting" }));
    loud.actor.send({ type: "PRESENTED" });
    loud.actor.send({ type: "SING_PART" });
    loud.actor.send({ type: "QUIET", quiet: true });
    const snap = loud.actor.getSnapshot();
    expect(snap.matches({ trial: "answering" })).toBe(true);
    expect(snap.context.input.quiet).toBe(true);
    expect(snap.context.sungPart?.skipped).toBe(true);
  });

  test("other trials have no sung part", async () => {
    const t = trialAt("fam.chd.quality-triad", 1, 3004);
    const { actor, singing } = runMachine([t]);
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }));
    actor.send({ type: "PRESENTED" });
    actor.send({ type: "SING_PART" });
    expect(actor.getSnapshot().matches({ trial: "answering" })).toBe(true);
    expect(singing()).toBe(0);
  });
});

describe("the level line names what opens the next level", () => {
  test("at the highest open level, the lesson that opens the next one", () => {
    const cad = def("fam.har.cadence");
    const gate3 = nextLevelLesson(cad, 3);
    expect(gate3).toBe("U06.L07");
    expect(levelLine(cad, { level: 2, maxOpenLevel: 2 } as never)).toBe(
      `Level 2 of ${cad.levels.length} · level 3 opens with U06.L07`,
    );
    expect(levelLine(cad, { level: 1, maxOpenLevel: 2 } as never)).toBe(
      `Level 1 of ${cad.levels.length} · up to level 2 for now`,
    );
  });
});

describe("chord symbols are spelled in the key", () => {
  test("vii° of D major is C♯°, and every lone chord's symbol names its own root in the key", () => {
    const slot = {
      at: 0,
      dur: 1,
      midis: [61, 64, 67],
      bass: 61,
      reading: readChord([61, 64, 67], 61),
      sounds: { chords: "piano", bass: null },
    };
    expect(slotSymbol([slot], 0, { tonic: "D", mode: "major" })).toBe("C♯°");
    for (const seed of SEEDS.slice(0, 10)) {
      const t = trialAt("fam.chd.quality-triad", 4, seed);
      const key = contextKeyOf(t) as never;
      const sym = slotSymbol(chordSlotsOf(t), 0, key) as string;
      const letter = sym[0] as string;
      // The symbol's letter is the scale letter of the chord's root in the key.
      expect(
        labelPitch(
          (t.params.midis as number[]).find(
            (m) => (((m - (t.params.rootPc as number)) % 12) + 12) % 12 === 0,
          ) as number,
          key,
        ).name[0],
      ).toBe(letter);
    }
  });
});
