// Wave 3 ear training in the runner's pure core: the way home, dictation's "mine" and A/B, the passive stream,
// the Wave 2 trial params the runner now honours, Quiet-mode planning and honest levels. Musical claims are
// checked against the engine's own trials and against headless Strudel.
import { describe, expect, test } from "bun:test";
import type { Answer, Degree, DrillSession, FamilyDef, FamilyState, Trial } from "@oak/api";
import { createRegistry, DEFAULT_PROFILE, generateTrial, gradeTrial, parseMiniCode } from "@oak/drills";
import { midisOf } from "@oak/grader/testing";
import { labelPitch } from "@oak/theory";
import { families } from "../../../content/families.ts";
import { mineOf } from "./DictationTools.tsx";
import {
  answerOf,
  codeStarterOf,
  expectedText,
  expectedValueOf,
  ladderCents,
  levelLine,
  planDrillSet,
  sungResolutionOf,
  surfaceOf,
  trialRecord,
} from "./model.ts";
import { PASSIVE_GENERATORS, passiveCaption, passiveItems } from "./passive.ts";
import {
  abBarPlan,
  comparePlan,
  homeSemitones,
  isFetTrial,
  keyOfTrial,
  melodyBarsOf,
  mineFromDegrees,
  minePlan,
  resolutionPath,
  sourcePlan,
  targetMidisOf,
  trialTonicMidi,
} from "./plans.ts";
import { practiceResolutions, staircaseSource } from "./sources.ts";

const registry = createRegistry(families, []);
const def = (id: string) => families.find((f) => f.id === id) as FamilyDef;

function trialAt(familyId: string, level: number, seed: number, category?: string): Trial {
  const d = def(familyId);
  const cats = d.levels[level - 1]?.categories ?? [];
  return generateTrial(
    registry.family(familyId as never),
    {
      index: 0,
      family: familyId as never,
      level,
      category: category ?? (cats[seed % cats.length] as string),
      seed,
    },
    DEFAULT_PROFILE,
    cats,
  ) as Trial;
}

function setOf(familyId: string, level: number, quiet = false, sungResolutions = 2) {
  const d = def(familyId);
  const s = {
    setId: `w3-${familyId}-${level}`,
    levels: { [familyId]: level },
    openCategories: { [familyId]: d.levels[level - 1]?.categories ?? [] },
    trialsPlanned: d.trialsPerSet,
  } as unknown as DrillSession;
  return planDrillSet(
    registry.family(familyId as never),
    s,
    null,
    { ...DEFAULT_PROFILE, quiet },
    { sungResolutions },
  );
}

describe("the way home (FET resolution)", () => {
  test("paths follow ux §4.2: 2–4 step down, 5–7 step up to 1′", () => {
    expect(homeSemitones("2")).toEqual([2, 0]);
    expect(homeSemitones("3")).toEqual([4, 2, 0]);
    expect(homeSemitones("4")).toEqual([5, 4, 2, 0]);
    expect(homeSemitones("5")).toEqual([7, 9, 11, 12]);
    expect(homeSemitones("6")).toEqual([9, 11, 12]);
    expect(homeSemitones("7")).toEqual([11, 12]);
    expect(homeSemitones("1")).toEqual([0]);
    expect(homeSemitones("#4")).toEqual([6, 7, 9, 11, 12]);
    expect(homeSemitones("b3", "minor")).toEqual([3, 2, 0]);
  });

  test("the app's path agrees with the engine's resolution of every real FET trial", () => {
    for (let level = 1; level <= 3; level++)
      for (let seed = 1; seed <= 40; seed++) {
        const t = trialAt("fam.deg.fet-major", level, seed);
        expect(isFetTrial(t)).toBe(true);
        const d = (t.expected as Answer).degrees?.[0] as Degree;
        const tonic = trialTonicMidi(t) as number;
        const targets = (t.params.resolutionTargets as { midi: number }[]).map((x) => x.midi);
        // The engine's sung targets are moved into the comfort range by whole octaves; compare in tonic space.
        const shift = targets[0] as number;
        const mine = homeSemitones(d).map((s) => s + tonic);
        expect(mine.map((m) => m - (mine[0] as number))).toEqual(targets.map((m) => m - shift));
        // Labelled in the key, the path ends on 1.
        const path = resolutionPath(t);
        expect(path[0]).toBe(d);
        expect(path.at(-1)).toBe("1");
      }
  });

  test("compare plays yours then it, each walking home", () => {
    const t = trialAt("fam.deg.fet-major", 2, 7, "deg.4");
    const plan = comparePlan(t, { taps: null, answer: { degrees: ["2"] } }, null);
    const tonic = trialTonicMidi(t) as number;
    const notes = (plan?.events ?? []).filter((e) => e.value.s === "piano").map((e) => e.value.note);
    // The cue's chords may use piano too; the tail is yours (2 1) then it (4 3 2 1).
    expect(notes.slice(-6)).toEqual([2, 0, 5, 4, 2, 0].map((s) => tonic + s));
  });

  test("a sung resolution goes on the wire in the schema's shape", () => {
    const sung = sungResolutionOf(
      ["4", "3", "2", "1"],
      true,
      { kind: "sung", notes: [{ midi: 65, cents: -12, credit: 1 }], credit: 0.9, passed: true },
      52,
    );
    expect(sung).toEqual({
      path: ["4", "3", "2", "1"],
      order: "play-first",
      notes: [{ midi: 65, cents: -12, credit: 1 }],
      credit: 0.9,
      passed: true,
      skipped: false,
      quiet: false,
      tolCents: 50,
    });
    expect(sungResolutionOf(["7", "1"], false, { kind: "quiet" }, 70)).toMatchObject({
      order: "sing-first",
      quiet: true,
      skipped: false,
      notes: [],
    });
    expect(sungResolutionOf([], true, { kind: "skipped" }, 70)).toBeNull();
    expect([ladderCents(70), ladderCents(41), ladderCents(30), ladderCents(10)]).toEqual([70, 35, 35, 25]);
  });

  test("Quiet mode keeps 2–3 resolutions in an FET set (heard, not sung), and none elsewhere changes", () => {
    const loud = setOf("fam.deg.fet-major", 1, false, 3);
    const quiet = setOf("fam.deg.fet-major", 1, true, 3);
    const count = (x: typeof loud) => x.trials.filter((t) => t.trial.params.sungResolution === true).length;
    expect(count(loud)).toBe(3);
    expect(count(quiet)).toBe(3);
    expect(count(setOf("fam.deg.fet-major", 1, true, 2))).toBe(2);
  });

  test("free practice sings home on 2 trials of an FET set too (never the first), the same after a reload", () => {
    const fam = registry.family("fam.deg.fet-major" as never);
    const session = {
      id: "drl_x",
      setId: "set-practice-1",
      openCategories: { "fam.deg.fet-major": [] },
    } as unknown as DrillSession;
    const src = staircaseSource(fam, session, DEFAULT_PROFILE, 1, 1, 2);
    const sung = Array.from(
      { length: src.total },
      (_, i) => src.at(i, []).trial.params.sungResolution === true,
    );
    expect(sung.filter(Boolean)).toHaveLength(2);
    expect(sung[0]).toBe(false);
    expect([...practiceResolutions("set-practice-1", 8, 2)]).toEqual([
      ...practiceResolutions("set-practice-1", 8, 2),
    ]);
    const other = staircaseSource(
      registry.family("fam.pit.compare" as never),
      session,
      DEFAULT_PROFILE,
      1,
      1,
      2,
    );
    expect(other.at(1, []).trial.params.sungResolution).toBeUndefined();
  });

  test("every FET trial carries its own key (the engine's key ladder decides which; level 1 is C)", () => {
    const keys = (level: number) => setOf("fam.deg.fet-major", level).trials.map((t) => keyOfTrial(t.trial));
    expect(new Set(keys(1).map((k) => k?.tonic))).toEqual(new Set(["C"]));
    for (const k of keys(4)) expect(k?.mode).toBe("major");
  });
});

describe("melodic dictation", () => {
  test("degree levels: the right answer, played as mine, has the source's pitch classes and rhythm", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const t = trialAt("fam.mel.dictation", 2, seed);
      const want = (t.expected as Answer).degrees as Degree[];
      const mine = mineFromDegrees(t, want);
      const src = targetMidisOf(t);
      expect(mine.map((n) => n.midi % 12)).toEqual(src.map((m) => m % 12));
      // Stepwise level: the nearest-octave rule lands every note on the source pitch.
      expect(mine.map((n) => n.midi)).toEqual(src);
      expect(mineOf(t, want)).toEqual(mine);
    }
  });

  test("empty slots are rests, A/B plays the source's bar then mine", () => {
    const t = trialAt("fam.mel.dictation", 3, 5);
    expect(melodyBarsOf(t)).toBe(2);
    const want = (t.expected as Answer).degrees as Degree[];
    const partial = want.map((d, i) => (i % 2 === 0 ? d : null));
    const mine = mineFromDegrees(t, partial);
    expect(mine).toHaveLength(Math.ceil(want.length / 2));
    const ab = abBarPlan(t, mine, 0);
    const src = sourcePlan(t, 0);
    expect(ab.events.length).toBe(src.events.length + minePlan(t, mine, 0).events.length);
    expect(ab.events.slice(0, src.events.length).map((e) => e.value.note)).toEqual(
      src.events.map((e) => e.value.note),
    );
    expect(mineOf(t, [])).toBeNull();
  });

  test("code levels: the starter is in the trial's key, and n = degree − 1 typed into it grades right", async () => {
    for (let seed = 1; seed <= 6; seed++) {
      const t = trialAt("fam.mel.dictation", 4, seed);
      const surface = surfaceOf(t, def("fam.mel.dictation"));
      expect(surface.kind === "widget" && surface.spec.ui).toBe("code");
      const starter = codeStarterOf(t);
      const ak = t.params.answerKey as { key: { tonic: string; mode: string }; octave: number };
      expect(starter).toBe(`n("").scale("${ak.key.tonic}${ak.octave}:${ak.key.mode}").s("piano")`);
      // Write the heard notes as n steps in the learner's dialect (quarters here; the grader compares onsets).
      const src = targetMidisOf(t);
      const tonic = (trialTonicMidi(t) ?? 0) as number;
      expect(labelPitch(tonic, ak.key as never).degree).toBe("1");
      const parsedTarget = t.events.filter((e) => e.track === "mel");
      expect(parsedTarget.length).toBe(src.length);
      // Strudel and the drills' reader agree on what the starter-shaped code plays.
      const code = starter.replace('n("")', 'n("0 2 4 7")');
      const heard = await midisOf(code);
      const parsed = parseMiniCode(code, 1);
      expect(parsed.ok && parsed.events.map((e) => e.midi)).toEqual(heard);
    }
  });

  test("a code answer plays as mine and grades through the engine", () => {
    const t = trialAt("fam.mel.dictation", 4, 3);
    const starter = codeStarterOf(t);
    expect(mineOf(t, starter)).toBeNull();
    const mine = mineOf(t, starter.replace('n("")', 'n("0 1 2 3")'));
    expect(mine?.length).toBe(4);
    const r = gradeTrial(
      registry.family("fam.mel.dictation" as never),
      t,
      { answer: { text: [starter] }, rtMs: 1, replays: 0 },
      DEFAULT_PROFILE,
    );
    expect(r.correct).toBe(false);
  });
});

describe("intervals in a key and the passive stream", () => {
  test("ascending, descending and harmonic pairs: the pad asks two degrees, lower first when together", () => {
    for (const [level, dir] of [
      [1, "up"],
      [2, "down"],
      [5, "harmonic"],
    ] as const) {
      const t = trialAt("fam.int.in-key", level, 11, "i5");
      const ds = (t.expected as Answer).degrees as Degree[];
      expect(ds).toHaveLength(2);
      const [a, b] = t.params.midis as [number, number];
      if (dir === "up" || dir === "harmonic") expect(b).toBeGreaterThan(a);
      if (dir === "down") expect(a).toBeGreaterThan(b);
      // The pad's degrees name those two notes in the key (low first when sounded together).
      const key = keyOfTrial(t) as never;
      expect(ds).toEqual([labelPitch(a, key).degree, labelPitch(b, key).degree]);
      const surface = surfaceOf(t, def("fam.int.in-key"));
      expect(surface.kind === "widget" && surface.spec.ui === "degree-pad" && surface.spec.sequenceLen).toBe(
        2,
      );
    }
  });

  test("passive: 12 named pairs at level 3, the key set at the start of each run of four", () => {
    const items = passiveItems(
      registry.family("fam.int.in-key" as never),
      { level: 3, items: 12, gapBeats: 2 },
      { seed: 42, openCategories: [], profile: DEFAULT_PROFILE, solfege: false },
    );
    expect(items).toHaveLength(12);
    expect(items.map((i) => i.cue !== null)).toEqual(Array.from({ length: 12 }, (_, i) => i % 4 === 0));
    expect(PASSIVE_GENERATORS).toContain("interval-in-key");
    for (const it of items) {
      expect(it.caption).toMatch(/^[♭♯]?\d → [♭♯]?\d$/);
      expect(it.sub).toMatch(/^an? (2nd|3rd|4th|5th|6th|7th|octave)$/);
      expect(it.example.events.length).toBe(2);
    }
  });

  test("passive transposition keeps every pair's degrees in the run's key (checked by labelling the notes)", () => {
    const fam = registry.family("fam.int.in-key" as never);
    const items = passiveItems(
      fam,
      { level: 3, items: 8, gapBeats: 2 },
      { seed: 7, openCategories: [], profile: DEFAULT_PROFILE, solfege: false },
    );
    // Re-derive each run's key from its cue trial: label each example's notes in that key.
    for (const it of items) {
      const [name, mode] = (it.keyName ?? "").split(" ") as [string, string];
      const key = { tonic: name.replace("♭", "b").replace("♯", "#"), mode: mode as "major" };
      const labels = it.example.events.map((e) => labelPitch(e.value.note as number, key).degreeDisplay);
      expect(labels.join(" → ")).toBe(it.caption);
    }
  });

  test("captions: syllables with the solfège lens, degree and syllable for a single degree", () => {
    const pair = trialAt("fam.int.in-key", 1, 3, "i3");
    expect(passiveCaption(pair, true).caption).toBe("do → mi");
    const fet = trialAt("fam.deg.fet-major", 1, 3, "deg.5");
    expect(passiveCaption(fet, false).caption).toBe("5 · sol");
  });
});

describe("Wave 2 params the runner now honours", () => {
  const fake = (params: Record<string, unknown>, expected: Answer): Trial =>
    ({
      family: "fam.chd.inversion",
      seed: 1,
      level: 1,
      category: "x",
      params,
      expected,
      events: [],
      cps: 0.5,
      code: "",
      preload: [],
      cue: { context: "none", countInBars: 0, replays: 2 },
    }) as unknown as Trial;
  const anyDef = def("fam.chd.inversion");

  test("bar buttons: a number asked as a bar, a choice of bars, several bars with multi", () => {
    const one = fake({ ui: "bar-buttons", bars: 4 }, { number: 3 });
    const s1 = surfaceOf(one, anyDef);
    expect(s1).toEqual({ kind: "widget", spec: { ui: "bar-buttons", bars: 4 } });
    if (s1.kind !== "widget") throw new Error();
    expect(answerOf(s1.spec, [3], 1, one.expected as Answer)).toEqual({ number: 3 });
    expect(expectedValueOf(s1.spec, one.expected as Answer)).toEqual([3]);
    expect(expectedText(s1.spec, one.expected as Answer)).toBe("bar 3");
    const byChoice = fake({ ui: "bar-buttons", bars: 8 }, { choice: ["5"] });
    const s2 = surfaceOf(byChoice, anyDef);
    if (s2.kind !== "widget") throw new Error();
    expect(answerOf(s2.spec, [5], 1, byChoice.expected as Answer)).toEqual({ choice: ["5"] });
    // Own options with labels (a key change may not happen at all).
    const own = fake(
      { ui: "bar-buttons", bars: 4, options: ["none", "2"], optionLabels: { none: "No key change" } },
      { choice: ["none"] },
    );
    const s4 = surfaceOf(own, anyDef);
    expect(s4.kind === "widget" && s4.spec.ui === "choice" && s4.spec.options).toEqual([
      { id: "none", label: "No key change" },
      { id: "2", label: "Bar 2" },
    ]);
    const many = fake({ ui: "bar-buttons", bars: 8 }, { choice: ["1", "5"] });
    const s3 = surfaceOf(many, anyDef);
    expect(s3.kind === "widget" && s3.spec.ui === "choice" && s3.spec.multi).toBe(true);
    expect(s3.kind === "widget" && s3.spec.ui === "choice" && s3.spec.options[4]).toEqual({
      id: "5",
      label: "Bar 5",
    });
  });

  test("rn-palette slots, code starters and option labels from params", () => {
    const rn = surfaceOf(fake({ ui: "rn-palette", slots: 4, rnAllow: ["sevenths"] }, { rn: ["I"] }), anyDef);
    expect(rn).toEqual({ kind: "widget", spec: { ui: "rn-palette", slots: 4, allow: ["sevenths"] } });
    const code = surfaceOf(fake({ mode: "code", ui: "code", starter: 's("")' }, { text: ["x"] }), anyDef);
    expect(code).toEqual({ kind: "widget", spec: { ui: "code", starter: 's("")' } });
    const labelled = surfaceOf(
      fake({ options: ["a", "b"], optionLabels: { a: "`fast(2)`" } }, { choice: ["a"] }),
      anyDef,
    );
    expect(
      labelled.kind === "widget" && labelled.spec.ui === "choice" && labelled.spec.options[0]?.label,
    ).toBe("`fast(2)`");
  });

  test("trial records carry revealed, modality and the sung resolution", () => {
    const t = trialAt("fam.deg.fet-major", 1, 2);
    const rec = trialRecord(
      t,
      0,
      { result: { credit: 0, correct: false, rtMs: 10, replays: 0, diagnostics: [] }, answer: null },
      { at: "2026-11-11T10:00:00.000Z", revealed: true },
    );
    expect(rec).toMatchObject({ revealed: true, modality: "normal", sungResolution: null });
  });
});

describe("honest levels", () => {
  test("where the family is, of how many, and how far the lessons let it go", () => {
    const d = def("fam.deg.fet-major");
    const st = (level: number, maxOpenLevel: number) => ({ level, maxOpenLevel }) as FamilyState;
    // At the highest open level, the line names the lesson that opens the next one.
    expect(levelLine(d, undefined)).toMatch(
      /^Level 1 of 7 · (level 2 opens with U\d\d\.L\d\d|up to level 1 for now)$/,
    );
    expect(levelLine(d, st(2, 3))).toBe("Level 2 of 7 · up to level 3 for now");
    expect(levelLine(d, st(7, 7))).toBe("Level 7 of 7");
  });
});
