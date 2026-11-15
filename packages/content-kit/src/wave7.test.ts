// The Wave 7 schema additions (the advanced tracks): the canonical timing fixtures and voicing shapes compute
// what the tracks teach, every new shape parses where it belongs and is refused where it does not, the
// structural rules of `checkExercise` and `defineCapstone` catch an author's slips, the planned custom rules
// refuse misspelt params, and `unimplementedIn` keeps a lesson off a shape until the Build lands it.
import { describe, expect, test } from "bun:test";
import { checkExercise, schemaIssues } from "./define.ts";
import { ladder } from "./fixtures.test-data.ts";
import {
  IMPLEMENTED,
  PLANNED,
  SCHEMA_FEATURES,
  unimplementedIn,
  unimplementedInCapstoneSessions,
} from "./implemented.ts";
import {
  AVAILABLE_TENSIONS,
  type CapstoneDef,
  CLAVE_GRIDS,
  CLAVE_OPTIONS,
  claveDirectionOf,
  claveMini,
  type Exercise,
  FEEL_MS,
  groupStarts,
  isClose,
  isDropTwo,
  JAZZ_DEVICES,
  lateCycles,
  lateMs,
  METER_GROUPINGS,
  MICROTIMING_OPTIONS,
  polymeterPeriodBars,
  SWING_FEELS,
  SWING_RATIO_OPTIONS,
  swingAmount,
  swingRatio,
  TENSION_OPTIONS,
  TRACK_CUSTOM_RULES,
  trackCustomParamIssues,
  VOICING_SHAPES,
  voicingShapeOf,
} from "./schema/index.ts";
import { CapstoneDefSchema, ExerciseSchema, RubricRuleSchema, TestResponseSchema } from "./zod.ts";

const base = { version: 1, prompt: "p", skills: [{ skill: "J08", w: 1 }], role: "practice", tests: [] };
const parses = (x: unknown) => schemaIssues(ExerciseSchema, x).length === 0;
const rules = (x: unknown) => checkExercise(x as Exercise, "ex").map((i) => i.rule);
const rule = (body: object) => ({ id: "r", label: "l", required: true, skills: ["R18"], ...body });
const ruleParses = (body: object) => schemaIssues(RubricRuleSchema, rule(body)).length === 0;
const make = (r: object) => ({
  ...base,
  kind: "code-make",
  id: "m",
  hints: ladder,
  code: { starter: 'setcpm(120/4)\n\ndrums: s("bd sd")' },
  bars: [4, 8],
  saveAs: "sketch",
  rubric: [rule(r)],
});

describe("timing fixtures", () => {
  test("swing amount ↔ long:short ratio, as R1.L02 names it", () => {
    expect(swingRatio(0)).toBe(1);
    expect(swingRatio(0.2)).toBeCloseTo(1.5, 10);
    expect(swingRatio(1 / 3)).toBeCloseTo(2, 10);
    expect(swingRatio(0.5)).toBeCloseTo(3, 10);
    expect(swingRatio(0.1)).toBeCloseTo(11 / 9, 10);
    for (const f of SWING_FEELS) expect(swingRatio(f.amount)).toBeCloseTo(f.ratio, 10);
    for (const r of [1, 1.5, 2, 3]) expect(swingRatio(swingAmount(r))).toBeCloseTo(r, 10);
    expect(() => swingRatio(1)).toThrow(RangeError);
    expect(SWING_RATIO_OPTIONS.map((o) => o.id)).toEqual(["straight", "light", "triplet", "hard"]);
  });
  test("microtiming is tempo-aware: .late(1/32) is a displacement at 76 BPM, 20 ms is a feel", () => {
    expect(lateMs(1 / 32, 76)).toBeCloseTo(98.68, 1);
    expect(lateMs(1 / 32, 96)).toBeCloseTo(78.125, 3);
    expect(lateCycles(20, 90)).toBeCloseTo(0.0075, 10);
    expect(lateMs(lateCycles(30, 76), 76)).toBeCloseTo(30, 10);
    expect(lateMs(1 / 32, 76)).toBeGreaterThan(FEEL_MS[1]);
    expect(lateMs(lateCycles(20, 76), 76)).toBeLessThan(FEEL_MS[1]);
    expect(MICROTIMING_OPTIONS.map((o) => o.id)).toEqual(["ahead", "on", "behind"]);
  });
  test("the two-bar clave grids and how a direction is read", () => {
    expect(CLAVE_GRIDS.son["3-2"]).toEqual([
      [
        [0, 1],
        [3, 8],
        [3, 4],
      ],
      [
        [1, 4],
        [1, 2],
      ],
    ]);
    expect(CLAVE_GRIDS.son["2-3"][0]).toEqual(CLAVE_GRIDS.son["3-2"][1]);
    expect(CLAVE_GRIDS.rumba["3-2"][0][2]).toEqual([7, 8]);
    expect(claveMini("son", "3-2")).toBe("<[rim ~ ~ rim ~ ~ rim ~] [~ ~ rim ~ rim ~ ~ ~]>");
    expect(claveMini("rumba", "2-3", "cb")).toBe("<[~ ~ cb ~ cb ~ ~ ~] [cb ~ ~ cb ~ ~ ~ cb]>");
    expect(claveDirectionOf(3, 2)).toBe("3-2");
    expect(claveDirectionOf(2, 3)).toBe("2-3");
    expect(claveDirectionOf(3, 3)).toBeNull();
    expect(CLAVE_OPTIONS).toHaveLength(4);
  });
  test("polymeter period and odd-meter groupings", () => {
    expect(polymeterPeriodBars(3, 4)).toBe(3);
    expect(polymeterPeriodBars(5, 8)).toBe(5);
    expect(polymeterPeriodBars(4, 4)).toBe(1);
    expect(polymeterPeriodBars(6, 4)).toBe(3);
    expect(() => polymeterPeriodBars(0, 4)).toThrow(RangeError);
    expect(groupStarts([2, 2, 3])).toEqual([
      [0, 1],
      [2, 7],
      [4, 7],
    ]);
    expect(groupStarts([3, 2])).toEqual([
      [0, 1],
      [3, 5],
    ]);
    expect(groupStarts([2, 2, 2, 3]).map(([n, d]) => n / d)).toEqual([0, 2 / 9, 4 / 9, 6 / 9]);
    for (const [meter, gs] of Object.entries(METER_GROUPINGS)) {
      const units = ({ "5/4": 5, "5/8": 5, "7/8": 7, "9/8i": 9 } as Record<string, number>)[meter];
      for (const g of gs ?? [])
        expect<unknown>([meter, g.reduce((a, b) => a + b, 0)]).toEqual([meter, units]);
    }
    expect(METER_GROUPINGS["9/8"]).toBeUndefined();
  });
});

describe("voicing shapes, octave-aware", () => {
  const Dm7 = { root: 2, third: 5, fifth: 9, seventh: 0, ninth: 4 };
  const G7 = { root: 7, third: 11, fifth: 2, seventh: 5, ninth: 9, thirteenth: 4 };
  const Cmaj7 = { root: 0, third: 4, fifth: 7, seventh: 11, ninth: 2 };
  test("shells: root lowest, then 3rd and 7th in either order", () => {
    expect(voicingShapeOf([50, 53, 60], Dm7)).toBe("shell"); // D3 F3 C4
    expect(voicingShapeOf([43, 53, 59], G7)).toBe("shell"); // G2 F3 B3: root–7–3
    expect(voicingShapeOf([53, 50, 60], Dm7)).toBe("shell"); // any written order
    expect(voicingShapeOf([53, 62, 72], Dm7)).toBeNull(); // F3 D4 C5: the 3rd lowest
    expect(voicingShapeOf([50, 57, 60], Dm7)).toBeNull(); // D A C: the 5th for the 3rd
  });
  test("close and drop-2: G3 C4 E4 B4 is C4 E4 G4 B4 with the second-highest dropped", () => {
    expect(isClose([60, 64, 67, 71])).toBe(true);
    expect(isDropTwo([55, 60, 64, 71])).toBe(true);
    expect(voicingShapeOf([60, 64, 67, 71], Cmaj7)).toBe("close");
    expect(voicingShapeOf([55, 60, 64, 71], Cmaj7)).toBe("drop-2");
    expect(isDropTwo([60, 64, 67, 71])).toBe(false); // close is not drop-2
    expect(isDropTwo([48, 64, 67, 71])).toBe(false); // the lowest an octave and more below: a spread
    expect(isDropTwo([52, 60, 67, 71])).toBe(false); // E3 C4 G4 B4: drop-3 of C E G B, not drop-2
  });
  test("rootless A and B: no root, 3rd or 7th lowest, 9th in", () => {
    expect(voicingShapeOf([53, 57, 60, 64], Dm7)).toBe("rootless-a"); // F A C E
    expect(voicingShapeOf([48, 52, 53, 57], Dm7)).toBe("rootless-b"); // C E F A
    expect(voicingShapeOf([59, 64, 65, 69], G7)).toBe("rootless-a"); // B E F A: 3 13 7 9
    expect(voicingShapeOf([53, 57, 59, 64], G7)).toBe("rootless-b"); // F A B E
    expect(voicingShapeOf([50, 53, 57, 60], Dm7)).toBe("close"); // D F A C: the root is in
    expect(voicingShapeOf([53, 57, 60, 62], Dm7)).toBe("close"); // F A C D: Dm7 with its root on top
    expect(voicingShapeOf([53, 57, 60, 67], Dm7)).toBeNull(); // F A C G: no root, and G is no 9th
  });
  test("the shapes the tracks name", () =>
    expect([...VOICING_SHAPES]).toEqual(["shell", "close", "drop-2", "rootless-a", "rootless-b"]));
});

describe("tensions", () => {
  test("each quality's tensions and avoid notes are disjoint and away from its chord tones", () => {
    for (const [q, t] of Object.entries(AVAILABLE_TENSIONS)) {
      for (const x of t?.tensions ?? []) expect([q, t?.chordTones.includes(x)]).toEqual([q, false]);
      for (const x of t?.avoid ?? []) expect([q, t?.tensions.includes(x)]).toEqual([q, false]);
    }
  });
  test("the natural 11 is the avoid note over maj7 and 7; ♭9 over m7; the altered collection has no ♮9", () => {
    expect(AVAILABLE_TENSIONS.maj7?.avoid).toEqual([5]);
    expect(AVAILABLE_TENSIONS["7"]?.avoid).toEqual([5]);
    expect(AVAILABLE_TENSIONS.m7?.avoid).toEqual([1]);
    expect(AVAILABLE_TENSIONS["7alt"]?.tensions).not.toContain(2);
    expect(AVAILABLE_TENSIONS["7alt"]?.avoid).toContain(2);
    expect(TENSION_OPTIONS.map((o) => o.id)).toContain("avoid");
    expect(JAZZ_DEVICES).toEqual(["tritone sub", "secondary ii–V", "backdoor", "diminished passing"]);
  });
});

describe("planned custom rules", () => {
  test("every track rule is implemented (Wave 7 Build, grader), and none is planned again", () => {
    expect([...PLANNED.customRules]).toEqual([]);
    for (const r of Object.keys(TRACK_CUSTOM_RULES)) expect(IMPLEMENTED.customRules).toContain(r);
    for (const [name, r] of Object.entries(TRACK_CUSTOM_RULES)) {
      expect([name, r.doc.length > 40]).toEqual([name, true]);
      expect([name, r.usedBy.length > 0]).toEqual([name, true]);
    }
  });
  test("params are checked: known, typed, required", () => {
    expect(trackCustomParamIssues("walking-bass", { rootOnOne: 0.75, approachOnFour: 0.5 })).toEqual([]);
    expect(trackCustomParamIssues("walking-bass", { minRoot: 0.75 })[0]).toContain("unknown param `minRoot`");
    expect(trackCustomParamIssues("walking-bass", { rootOnOne: 75 })[0]).toContain("share between 0 and 1");
    expect(trackCustomParamIssues("ii-v-chain", {})[0]).toContain("`minKeys` is required");
    expect(trackCustomParamIssues("voicing-shape", { track: "chords", shape: ["drop-3"] })[0]).toContain(
      "a list of",
    );
    expect(
      trackCustomParamIssues("voicing-shape", { track: "chords", shape: ["shell"], alsoUses: ["tb.note"] }),
    ).toEqual([]);
    expect(
      trackCustomParamIssues("same-tune-two-ways", { a: { section: "ballad" }, b: "first" })[0],
    ).toContain("a section");
    expect(trackCustomParamIssues("stabs", { maxDur: [2, 0] })[0]).toContain("fraction");
    expect(trackCustomParamIssues("silent-beat", { anything: 1 })).toEqual([]); // not a track rule
  });
  test("a lesson Make that misspells a planned rule's param is refused", () => {
    expect(rules(make({ rule: "custom", fn: "allowed-tensions", params: { min: 0.85 } }))).toContain(
      "rubric.custom-params",
    );
    expect(rules(make({ rule: "custom", fn: "allowed-tensions", params: { minRatio: 0.85 } }))).not.toContain(
      "rubric.custom-params",
    );
  });
  test("a rule not implemented keeps a lesson off it; an implemented one does not", () => {
    const planned = {
      ...IMPLEMENTED,
      customRules: IMPLEMENTED.customRules.filter((f) => f !== "walking-bass"),
    };
    const uses = unimplementedIn(
      make({ rule: "custom", fn: "walking-bass" }) as unknown as Exercise,
      planned,
    );
    expect(uses).toEqual([{ what: "custom-rule", name: "walking-bass", exercise: "m" }]);
    expect(unimplementedIn(make({ rule: "custom", fn: "walking-bass" }) as unknown as Exercise)).toEqual([]);
  });
});

describe("rule fields", () => {
  test("clave coverage, simultaneous polyrhythm, the top voice, jazz devices parse", () => {
    expect(ruleParses({ rule: "clave", track: "perc", type: "son", direction: "3-2", minBars: 8 })).toBe(
      true,
    );
    expect(ruleParses({ rule: "polyrhythm", a: "perc2", b: "drums", ratio: [3, 2], minBars: 4 })).toBe(true);
    expect(
      ruleParses({ rule: "voice-leading", track: "chords", maxMovePerVoice: 2, voice: "top", minRatio: 0.8 }),
    ).toBe(true);
    expect(
      ruleParses({
        rule: "reharmonize",
        melody: "mel",
        reference: { solutions: ["x"], bars: 4 },
        min: 1,
        devices: ["tritone sub"],
      }),
    ).toBe(true);
    expect(
      ruleParses({
        rule: "reharmonize",
        melody: "mel",
        reference: { solutions: ["x"], bars: 4 },
        min: 1,
        devices: ["tritone"],
      }),
    ).toBe(false);
  });
  test("structural slips are refused", () => {
    expect(
      rules(make({ rule: "clave", track: "perc", type: "son", direction: "3-2", minBars: 3 })),
    ).toContain("rubric.clave");
    expect(rules(make({ rule: "polyrhythm", a: "a", b: "b", ratio: [2, 2] }))).toContain("rubric.polyrhythm");
    expect(
      rules(make({ rule: "voice-leading", track: "chords", maxMovePerVoice: 2, minRatio: 0.8 })),
    ).toContain("voice-leading.top");
  });
  test("each field reports its feature", () => {
    const feats = (r: object) =>
      unimplementedIn(make(r) as unknown as Exercise, {
        ...IMPLEMENTED,
        features: (IMPLEMENTED.features ?? []).filter(
          (f) => !["clave.coverage", "polyrhythm.together", "voice-leading.top"].includes(f),
        ),
      })
        .filter((u) => u.what === "feature")
        .map((u) => u.name);
    expect(feats({ rule: "clave", track: "perc", type: "son", direction: "3-2", minBars: 8 })).toEqual([
      "clave.coverage",
    ]);
    expect(feats({ rule: "polyrhythm", a: "a", b: "b", ratio: [3, 2], minBars: 2 })).toEqual([
      "polyrhythm.together",
    ]);
    expect(
      feats({ rule: "voice-leading", track: "c", maxMovePerVoice: 2, voice: "top", minRatio: 0.8 }),
    ).toEqual(["voice-leading.top"]);
  });
});

describe("answers", () => {
  const identify = (answer: object, correct: object) => ({
    ...base,
    kind: "identify",
    id: "x",
    hints: ladder,
    stimulus: {
      src: "code",
      code: 'setcpm(140/7)\n\ndrums: s("bd ~ sd ~ bd ~ sd")',
      bars: 2,
      showCode: false,
    },
    cue: { context: "none", countInBars: 0, click: false, replays: -1 },
    answer,
    correct,
  });
  test("grouping: one of the meter's groupings", () => {
    const ok = identify({ ui: "grouping", meter: "7/8" }, { grouping: [2, 2, 3] });
    expect(parses(ok)).toBe(true);
    expect(rules(ok)).toEqual([]);
    expect(rules(identify({ ui: "grouping", meter: "7/8" }, { grouping: [3, 3, 1] }))).toContain(
      "grouping.correct",
    );
    expect(rules(identify({ ui: "grouping", meter: "4/4" }, { grouping: [2, 2] }))).toContain(
      "grouping.meter",
    );
    // Wave 7 integration: rendered and graded, so `IMPLEMENTED` (it was planned until the answers widget landed).
    expect(unimplementedIn(ok as Exercise)).toEqual([]);
  });
  test("euclid: hits, steps and an optional rotation", () => {
    const ok = identify({ ui: "euclid", maxSteps: 16, rotation: true }, { euclid: [5, 8, 1] });
    expect(parses(ok)).toBe(true);
    expect(rules(ok)).toEqual([]);
    expect(rules(identify({ ui: "euclid", maxSteps: 8, rotation: false }, { euclid: [3, 8, 2] }))).toContain(
      "euclid.correct",
    );
    expect(rules(identify({ ui: "euclid", maxSteps: 8, rotation: false }, { euclid: [9, 8] }))).toContain(
      "euclid.correct",
    );
  });
  test("jazz chord text answers report their feature", () => {
    const ex = {
      ...base,
      kind: "fact",
      id: "glyph",
      hints: ladder,
      stimulus: {
        src: "code",
        code: 'setcpm(90/4)\n\nchords: chord("Dm7").voicing().s("piano")',
        bars: 1,
        showCode: false,
      },
      answer: { ui: "text", normalize: "chord", jazz: true },
      correct: { text: ["Dm7"] },
      spelling: "enharmonic",
      order: "set",
    };
    expect(schemaIssues(ExerciseSchema, ex)).toEqual([]);
    // Wave 7 integration: `text.jazz-chord` is graded and rendered (answers JazzChord.tsx): implemented.
    expect(unimplementedIn(ex as Exercise).map((u) => u.name)).toEqual([]);
  });
  test("build this voicing on the keyboard: a chord, octave-aware", () => {
    const kb = (answer: object, pitchMode: string) => ({
      ...base,
      kind: "keyboard",
      id: "shell",
      hints: ladder,
      answer,
      expect: { voicing: { shape: "shell", symbol: "Dm7" } },
      pitchMode,
    });
    const ok = kb({ ui: "keyboard", range: ["c2", "c5"], mode: "chord" }, "absolute");
    expect(parses(ok)).toBe(true);
    expect(rules(ok)).toEqual([]);
    // Wave 7 integration: `keyboard.voicing` is graded and rendered (answers VoicingLine.tsx): implemented.
    expect(unimplementedIn(ok as Exercise).map((u) => u.name)).toEqual([]);
    expect(rules(kb({ ui: "keyboard", range: ["c2", "c5"], mode: "chord" }, "octave-free"))).toContain(
      "keyboard.voicing",
    );
    expect(rules(kb({ ui: "keyboard", range: ["c2", "c5"], mode: "single" }, "absolute"))).toContain(
      "keyboard.voicing",
    );
  });
  test("two-lane taps: two tracks, two labels; tests answer per lane", () => {
    const tap = (lanes: object[]) => ({
      ...base,
      kind: "tap",
      id: "three-two",
      hints: ladder,
      mode: "along",
      stimulus: {
        src: "code",
        code: 'setcpm(80/4)\n\nkick: s("bd*3")\nsnare: s("sd*2")',
        bars: 2,
        showCode: false,
      },
      cue: { context: "none", countInBars: 1, click: false, replays: -1 },
      bars: 2,
      target: "beat",
      tol: { windowMs: "auto", tempo: "locked", forgiveOffset: true, passF1: 0.8, passTiming: 0.6 },
      lanes,
    });
    const ok = tap([
      { label: "Left hand: the three", track: "kick" },
      { label: "Right hand: the two", track: "snare" },
    ]);
    expect(parses(ok)).toBe(true);
    expect(rules(ok)).toEqual([]);
    // Wave 7 integration (closer): rendered, accepted by the API and graded by the host and the harness.
    expect(unimplementedIn(ok as Exercise).map((u) => u.name)).toEqual([]);
    expect(IMPLEMENTED.features as readonly string[]).toContain("tap.lanes");
    expect(
      rules(
        tap([
          { label: "a", track: "kick" },
          { label: "b", track: "kick" },
        ]),
      ),
    ).toContain("tap.lanes");
    expect(parses(tap([{ label: "a", track: "kick" }]))).toBe(false);
    expect(schemaIssues(TestResponseSchema, { lanes: [[0, 1], [0.5]] })).toEqual([]);
  });
});

describe("two-version capstones (AC1)", () => {
  const ac = (versions: unknown, kind = "compose"): CapstoneDef =>
    ({
      id: "AC1",
      title: "AC1 One Tune, Two Genres",
      objective: "o",
      sessions: 3,
      opensAfter: { checkpoints: ["A.CP", "U11.CP"] },
      kind,
      version: 1,
      meter: "4/4",
      sessionDefs: [1, 2, 3].map((i) => ({
        id: `AC1.S${i}`,
        title: "t",
        goal: "g",
        ...(i === 3 ? { release: true } : {}),
      })),
      reviewRevisions: 2,
      canDo: [],
      versions,
    }) as unknown as CapstoneDef;
  const V = [
    { id: "a", label: "Version one", startsIn: "AC1.S1" },
    { id: "b", label: "Version two", startsIn: "AC1.S2" },
  ];
  test("the shape parses and reports its feature", () => {
    expect(schemaIssues(CapstoneDefSchema, ac(V))).toEqual([]);
    expect(schemaIssues(CapstoneDefSchema, ac([V[0]])).length).toBeGreaterThan(0);
    // Wave 7 integration (closer): rendered by the capstone workspace (Versions.tsx).
    expect(unimplementedInCapstoneSessions(ac(V)).map((u) => u.name)).toEqual([]);
    expect(IMPLEMENTED.features as readonly string[]).toContain("capstone.versions");
  });
  test("the grader-only Wave 7 fields are implemented; the rendered ones wait for their renderer", () => {
    const graderOnly = ["clave.coverage", "polyrhythm.together", "voice-leading.top", "reharmonize.devices"];
    const rendered = [
      "text.jazz-chord",
      "keyboard.voicing",
      "staff-expect.voicing",
      "tap.lanes",
      "capstone.versions",
    ];
    for (const f of [...graderOnly, ...rendered]) expect(SCHEMA_FEATURES as readonly string[]).toContain(f);
    for (const f of graderOnly) expect(IMPLEMENTED.features as readonly string[]).toContain(f);
    for (const f of rendered)
      expect([
        f,
        (PLANNED.features as readonly string[]).includes(f) ||
          (IMPLEMENTED.features as readonly string[]).includes(f),
      ]).toEqual([f, true]);
    // Wave 7 Build (grader): the five whole rules moved into IMPLEMENTED with their golden tests.
    expect(PLANNED.rubricRules).toEqual([]);
    for (const ui of ["grouping", "euclid"] as const)
      expect([ui, PLANNED.answerUis.includes(ui) || IMPLEMENTED.answerUis.includes(ui)]).toEqual([ui, true]);
  });
});

describe("Wave 7 integration additions", () => {
  test("a test case may name the song and the other version it grades against; nothing else", async () => {
    const { TestCaseSchema } = await import("./zod.ts");
    const base = { name: "a 16-bar version", response: { code: "x" }, expect: "pass" };
    expect(
      TestCaseSchema.safeParse({ ...base, context: { song: "song.sweet-georgia-brown", otherVersion: "y" } })
        .success,
    ).toBe(true);
    expect(TestCaseSchema.safeParse({ ...base, context: { song: "sweet-georgia-brown" } }).success).toBe(
      false,
    );
    expect(TestCaseSchema.safeParse({ ...base, context: { key: "C" } }).success).toBe(false);
  });
  test("the A/B sound axes include density (busier, sparser)", async () => {
    const { SOUND_COMPARE_OPTIONS } = await import("./schema/wave7.ts");
    expect(SOUND_COMPARE_OPTIONS.density.map((o) => o.id)).toEqual(["busier", "sparser"]);
  });
});
