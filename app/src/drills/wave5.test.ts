// Wave 5 stage E in the runner's pure core and machine: the words of the new families (major or minor, which minor,
// modes, colours, feel, the kick lock), degrees in minor (do-based: ♭3 me, ♭6 le, ♭7 te; the way home), form by
// ear on the form widget (labels mapped back to the family's own answer and graded by @oak/drills), the twelve bars
// (numerals read from the chords, the asked bar, where a passage sits in the form), straight against swung (checked
// against Strudel's own swingBy in headless Strudel), bass-line dictation (the line as code or on the bass staff,
// octave-free; root motion first for an engine bass-line trial, through the machine), c8 (the numerals that fit the
// bass the learner found, in minor), and the Practice hub (stage E, honest levels, graduation as progress).
import { describe, expect, test } from "bun:test";
import type { Answer, Degree, DrillFinish, DrillSession, FamilyDef, FamilyState, Trial } from "@oak/api";
import { createRegistry, DEFAULT_PROFILE, generateTrial, gradeTrial } from "@oak/drills";
import { evalHeadless } from "@oak/grader/testing";
import { labelPitch } from "@oak/theory";
import { createActor, fromCallback, fromPromise, waitFor } from "xstate";
import { EAR_STAGES, families } from "../../../content/families.ts";
import { rnHasDegree } from "../answers/harmony.ts";
import { promptOf } from "./copy.ts";
import { bassPlan, isBassTrial, stagedKeyOf } from "./harmony.ts";
import { type DrillDeps, type DrillInput, drillMachine, type TrialSource } from "./machine.ts";
import {
  dictationModesOf,
  dictationSurface,
  expectedValueOf,
  gradeDrillTrial,
  groupByStage,
  levelLine,
  levelNews,
  summaryView,
  surfaceOf,
  trialAnswerOf,
} from "./model.ts";
import { expectedStaffValue, staffAnswer } from "./staff.ts";
import {
  barAt,
  bassLineCodeOf,
  bassLineTrialOf,
  bluesChartOf,
  formAnswer,
  formModeOf,
  foundBassOf,
  gradeRoots,
  gradeSections,
  graduatedLine,
  isBassLineTrial,
  noteAlonePlan,
  otherFeelEvents,
  rootsOf,
  rootsSpecOf,
  scalePlan,
  sectionPlan,
  sectionsOf,
  stageEOptionLabel,
  tracksPlan,
  wayHomeText,
  withoutSeventhPlan,
} from "./wave5.ts";

const registry = createRegistry(families, []);
const def = (id: string) => families.find((f) => f.id === id) as FamilyDef;
const PROFILE = { ...DEFAULT_PROFILE, comfLow: 50, comfHigh: 65 };
const SEEDS = Array.from({ length: 16 }, (_, i) => 500 + i * 41);

function trialAt(familyId: string, level: number, seed: number, category?: string): Trial {
  const d = def(familyId);
  const own = d.levels[level - 1]?.categories ?? [];
  const all = d.categories.map((c) => c.id);
  return generateTrial(
    registry.family(familyId as never),
    {
      index: 0,
      family: familyId as never,
      level,
      category: category ?? (own[seed % Math.max(1, own.length)] as string),
      seed,
    },
    PROFILE,
    all,
  ) as Trial;
}
const grade = (t: Trial, answer: Answer | null) =>
  gradeDrillTrial(
    registry.family(t.family),
    t,
    { ...(answer ? { answer } : {}), rtMs: 900, replays: 0 },
    PROFILE,
  );
const labelsOf = (t: Trial) => {
  const s = surfaceOf(t, def(t.family));
  return s.kind === "widget" && s.spec.ui === "choice" ? s.spec.options.map((o) => o.label) : [];
};

describe("stage E words", () => {
  test("major or minor reads as the learner's words, never an ID", () => {
    const t = trialAt("fam.key.mode", 1, 7, "minor");
    // Wave 6: the engine may name its own options ("Natural minor") and ask its own question; either way the
    // learner reads words, never an ID.
    const labels = labelsOf(t);
    expect(labels.length).toBe(2);
    expect(labels[0]).toBe("Major");
    expect(labels[1]).toMatch(/^(Minor|Natural minor)$/);
    expect(promptOf(t, def("fam.key.mode"))).toMatch(/^(Major or minor\?|Which scale is this in\?)$/);
  });

  test("a mode is a mode, never the loop of the same name", () => {
    const t = trialAt("fam.key.mode", 4, 7, "mixolydian");
    const labels = labelsOf(t);
    expect(labels.some((l) => /^Mixolydian/.test(l))).toBe(true);
    expect(labels).toContain("Major");
    expect(labels.every((l) => /^[A-Z]/.test(l) && !/^[a-z-]+$/.test(l))).toBe(true);
    expect(promptOf(t, def("fam.key.mode"))).toMatch(/\?/);
    // The loop family keeps its own word.
    expect(stageEOptionLabel("harmony-schema", "mixolydian", [])).toBeNull();
  });

  test("which minor and the scale colours take the standard option words", () => {
    const opts = ["minor", "harmonic minor", "melodic minor"];
    expect(opts.map((id) => stageEOptionLabel("key-mode", id, opts))).toEqual([
      "Natural minor (♭3 ♭6 ♭7)",
      "Harmonic minor (♭3 ♭6, raised 7)",
      "Melodic minor (♭3, raised 6 and 7)",
    ]);
    expect(stageEOptionLabel("key-mode", "blues", ["major pentatonic", "blues"])).toBe(
      "Blues (1 ♭3 4 ♭5 5 ♭7)",
    );
  });

  test("feel and the kick lock", () => {
    const t = trialAt("fam.rhy.swing", 1, 5, "swung");
    // The learner's words (the engine's own labels, or the standard feel options), never an ID.
    const feel = labelsOf(t);
    expect(feel.length).toBe(2);
    expect(feel[0]?.startsWith("Straight")).toBe(true);
    expect(feel[1]).toMatch(/^Swung/);
    expect(promptOf(t, def("fam.rhy.swing"))).toBe("Straight or swung?");
    expect(promptOf(trialAt("fam.rhy.swing", 2, 5, "light"), def("fam.rhy.swing"))).toBe(
      "Straight, or how much swing?",
    );
    expect(labelsOf(trialAt("fam.rhy.groove-lock", 1, 5, "locked"))).toEqual([
      "Locked with the kick",
      "Its own rhythm",
    ]);
  });

  test("level news names stage E material in plain words", () => {
    expect(levelNews(def("fam.har.bass"), 5)).toContain("roots in minor keys");
    expect(levelNews(def("fam.frm.blues"), 3)).toBe("the quick change, the standard form join in");
  });
});

describe("degrees in minor", () => {
  test("the key is set by a minor cadence with the raised 7 (harmonic V), and the pad offers ♭3 ♭6 ♭7", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const t = trialAt("fam.deg.fet-minor", 3, seed);
      const key = t.params.key as { tonic: string; mode: string };
      expect(key.mode).toBe("minor");
      // The cadence's middle chord is V with the leading tone (raised 7): degree 7 heard before the asked note.
      const cue = Number(t.params.cueBars);
      const cadence = t.events.filter((e) => e.midi !== null && e.onset[0] / e.onset[1] < cue);
      const degrees = new Set(cadence.map((e) => labelPitch(e.midi as number, key as never).degree));
      expect(degrees.has("7")).toBe(true);
      expect(degrees.has("b3")).toBe(true);
      const s = surfaceOf(t, def("fam.deg.fet-minor"));
      expect(s.kind === "widget" && s.spec.ui === "degree-pad" ? s.spec.set : []).toEqual([
        "1",
        "2",
        "b3",
        "4",
        "5",
        "b6",
        "b7",
      ]);
      expect(promptOf(t, def("fam.deg.fet-minor"))).toBe(
        "After the minor cadence: which degree was the last note?",
      );
    }
  });

  test("the way home is do-based: ♭3 2 1 is me re do, ♭6 5 is le sol, ♭7 is te", () => {
    const b3 = trialAt("fam.deg.fet-minor", 1, 9, "deg.b3");
    expect(wayHomeText(b3, true)).toBe("♭3 2 1 · me re do");
    expect(wayHomeText(b3, false)).toBe("♭3 2 1");
    const b6 = trialAt("fam.deg.fet-minor", 3, 9, "deg.b6");
    expect(wayHomeText(b6, true)).toMatch(/^♭6 .* · le .*do$/);
    const b7 = trialAt("fam.deg.fet-minor", 3, 9, "deg.b7");
    expect(wayHomeText(b7, true)).toMatch(/^♭7 .*· te .*do$/);
    // The asked note alone is the trial's own last note.
    const alone = noteAlonePlan(b3);
    const asked = (b3.params.resolutionTargets as { midi: number }[])[0]?.midi as number;
    expect((((Number(alone?.events[0]?.value.note) - asked) % 12) + 12) % 12).toBe(0);
  });

  test("every minor trial's expected answer grades right through the pad, and a major 3 is wrong", () => {
    for (const seed of SEEDS) {
      const t = trialAt("fam.deg.fet-minor", 4, seed);
      const s = surfaceOf(t, def("fam.deg.fet-minor"));
      if (s.kind !== "widget") throw new Error("pad expected");
      const v = expectedValueOf(s.spec, t.expected as Answer);
      expect(grade(t, trialAnswerOf(t, s.spec, v as never)).correct).toBe(true);
    }
    const t = trialAt("fam.deg.fet-minor", 1, 3, "deg.b3");
    expect(grade(t, { degrees: ["3" as Degree] }).correct).toBe(false);
  });

  test("the scale of a minor key trial is 1 2 ♭3 4 5 ♭6 ♭7 8, up and back", () => {
    const t = trialAt("fam.key.mode", 1, 11, "minor");
    const plan = scalePlan(t);
    const notes = plan?.events.map((e) => Number(e.value.note)) ?? [];
    const tonic = notes[0] as number;
    expect(notes.slice(0, 8).map((n) => n - tonic)).toEqual([0, 2, 3, 5, 7, 8, 10, 12]);
    expect(notes.at(-1)).toBe(tonic);
    expect(labelPitch(tonic, t.params.key as never).degree).toBe("1");
  });
});

describe("form by ear on the form widget", () => {
  test("a which-form trial becomes one letter per section, mapped back to its own answer", () => {
    for (const cat of ["AABA", "verse-chorus"]) {
      const t = trialAt("fam.frm.sections", 1, 21, cat);
      const mode = formModeOf(t);
      expect(mode?.spec).toMatchObject({ ui: "form", sections: 4, vocabulary: "letters", input: "label" });
      expect(mode?.expected.join("")).toBe(cat === "AABA" ? "AABA" : "ABAB");
      expect(promptOf(t, def("fam.frm.sections"))).toBe(
        "Label the sections: the same music gets the same letter.",
      );
      const s = surfaceOf(t, def("fam.frm.sections"));
      expect(s.kind === "widget" && s.spec.ui).toBe("form");
      // Any letters with the same shape are right: B B A B is AABA.
      const shape = cat === "AABA" ? ["B", "B", "A", "B"] : ["C", "D", "C", "D"];
      const answer = formAnswer(mode as never, shape);
      expect(answer.choice).toEqual([cat]);
      expect(grade(t, answer).correct).toBe(true);
      // A shape no option has is wrong (and never crashes).
      expect(grade(t, formAnswer(mode as never, ["A", "B", "B", "A"])).correct).toBe(false);
    }
  });

  test("the sections are where the music says: four bars each, and the A sections sound the same", () => {
    const t = trialAt("fam.frm.sections", 1, 21, "AABA");
    const ws = sectionsOf(t);
    expect(ws.map((w) => [w.letter, w.bars])).toEqual([
      ["A", 4],
      ["A", 4],
      ["B", 4],
      ["A", 4],
    ]);
    // The same harmony (bass and chord pitch classes in time); the voicing may open a section differently.
    const notesOf = (i: number) =>
      sectionPlan(t, i)
        ?.events.filter((e) => e.value.note !== undefined && /bass|upright|ebass/.test(String(e.value.s)))
        .map((e) => `${Math.round(e.at * 100)}:${((Number(e.value.note) % 12) + 12) % 12}`)
        .join(" ");
    expect(notesOf(0)).toBe(notesOf(1));
    expect(notesOf(0)).toBe(notesOf(3));
    expect(notesOf(2)).not.toBe(notesOf(0));
  });

  test("phrase-length questions stay a choice", () => {
    expect(formModeOf(trialAt("fam.frm.sections", 2, 21, "phrase-4"))).toBeNull();
  });

  test("an engine trial that asks for sections is graded on its shape", () => {
    const base = trialAt("fam.frm.sections", 1, 21, "AABA");
    const t = { ...base, expected: { sections: ["verse", "chorus", "verse", "chorus"] } } as Trial;
    expect(formModeOf(t)?.expected).toEqual(["A", "B", "A", "B"]);
    expect(gradeSections(t, { sections: ["A", "B", "A", "B"] }, 1, 0).correct).toBe(true);
    const wrong = gradeSections(t, { sections: ["A", "A", "B", "A"] }, 1, 0);
    expect(wrong.correct).toBe(false);
    expect(wrong.credit).toBe(0.25);
  });
});

describe("the twelve bars", () => {
  test("the chart reads I7 IV7 V7 from the chords, and the asked bar holds the answer", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const t = trialAt("fam.frm.blues", 1, seed, "which-chord");
      const chart = bluesChartOf(t, def("fam.frm.blues"));
      expect(chart?.cells.length).toBe(12);
      const rns = chart?.cells.map((c) => c.rn?.replace(/[⁷]/g, "7")) ?? [];
      expect(rns).toEqual(["I7", "I7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"]);
      const asked = rns[(chart?.marked as number) - 1] ?? "";
      const want = (t.expected as Answer).choice?.[0] as string;
      expect(asked.replace("7", "")).toBe(want);
    }
  });

  test("a passage that starts mid-form knows where it sits", () => {
    const t = trialAt("fam.frm.blues", 2, 13, "iv-arrival");
    const chart = bluesChartOf(t, def("fam.frm.blues"));
    const start = Number(t.params.startBar);
    expect(chart?.cells[0]?.formBar).toBe(start);
    const first = (t.expected as Answer).choice?.[0] as string;
    expect(chart?.cells[Number(first) - 1]?.rn?.startsWith("IV")).toBe(true);
    expect(chart?.cells.slice(0, Number(first) - 1).every((c) => !c.rn?.startsWith("IV"))).toBe(true);
  });

  test("the bar that is playing", () => {
    expect(barAt(0, 0.5, 12)).toBe(1);
    expect(barAt(2.01, 0.5, 12)).toBe(2);
    expect(barAt(23.9, 0.5, 12)).toBe(12);
    expect(barAt(24.1, 0.5, 12)).toBeNull();
    expect(barAt(-0.1, 0.5, 12)).toBeNull();
  });
});

describe("straight or swung", () => {
  test("a straight groove swung by triplets matches Strudel's own swingBy(1/3, 4)", async () => {
    const t = trialAt("fam.rhy.swing", 1, 5, "straight");
    const swung = otherFeelEvents(t)
      .filter((e) => e.track === "hats")
      .map((e) => e.onset[0] / e.onset[1])
      .sort((a, b) => a - b);
    const hats = /hats: (.*)/.exec(t.code)?.[1] as string;
    const res = await evalHeadless(`hats: ${hats.replace('s("hh*8")', 's("hh*8").swingBy(1/3, 4)')}`, 2);
    const ref = res.events.map((e) => e.onset).sort((a, b) => a - b);
    expect(swung.length).toBe(ref.length);
    swung.forEach((x, i) => {
      expect(Math.abs(x - (ref[i] as number))).toBeLessThan(1e-6);
    });
  });

  test("a swung groove straightened puts every off-beat back on the half beat", () => {
    for (const cat of ["swung", "light", "hard"]) {
      const t = trialAt("fam.rhy.swing", 2, 5, cat);
      for (const e of otherFeelEvents(t)) {
        const x = (e.onset[0] / e.onset[1]) * 8;
        expect(Math.abs(x - Math.round(x))).toBeLessThan(1e-6);
      }
    }
  });

  test("the hats alone and the kick with the bass alone", () => {
    const sw = trialAt("fam.rhy.swing", 1, 5, "swung");
    expect(
      tracksPlan(sw, ["hats"])?.events.every((e) => String(e.value.s).endsWith("hh") || e.value.s === "hh"),
    ).toBe(true);
    const lock = trialAt("fam.rhy.groove-lock", 1, 5, "locked");
    const plan = tracksPlan(lock, ["kick", "bass"]);
    expect(plan?.events.some((e) => e.value.note !== undefined)).toBe(true);
    expect(plan?.events.some((e) => e.value.s === "bd")).toBe(true);
    expect(plan?.events.some((e) => e.value.s === "sd" || e.value.s === "hh")).toBe(false);
  });
});

describe("a seventh against its triad", () => {
  test("a dominant seventh is heard without its ♭7, then whole", () => {
    const t = trialAt("fam.chd.quality-7th", 1, 31, "7");
    const plan = withoutSeventhPlan(t);
    const first = plan?.events.filter((e) => e.at === 0).map((e) => Number(e.value.note)) ?? [];
    const midis = t.params.midis as number[];
    const rootPc = Number(t.params.rootPc);
    expect(first.some((m) => (((m - rootPc) % 12) + 12) % 12 === 10)).toBe(false);
    expect(first.length).toBe(
      midis.length - midis.filter((m) => (((m - rootPc) % 12) + 12) % 12 === 10).length,
    );
    expect(withoutSeventhPlan(trialAt("fam.chd.quality-triad", 1, 31, "maj"))).toBeNull();
  });
});

describe("bass-line dictation", () => {
  test("a bass trial is answered as roots, or as a line in code or on the bass staff", () => {
    const t = trialAt("fam.har.bass", 5, 41, "minor");
    expect(isBassTrial(t)).toBe(true);
    expect(dictationModesOf(t, def("fam.har.bass"))).toEqual(["degrees", "code", "staff"]);
    const code = dictationSurface(t, def("fam.har.bass"), "code");
    expect(code.kind === "widget" && code.spec.ui === "code" ? code.spec.starter : "").toMatch(
      /^n\("<>"\)\.scale\("[A-G][b#]?\d:minor"\)\.s\("/,
    );
    const staff = dictationSurface(t, def("fam.har.bass"), "staff");
    expect(staff.kind === "widget" && staff.spec.ui === "staff-input" ? staff.spec.clef : null).toBe("bass");
  });

  test("the line written right is right in any octave; one wrong root is wrong", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const t = trialAt("fam.har.bass", 5, seed, "minor");
      const line = bassLineTrialOf(t) as Trial;
      const code = bassLineCodeOf(t) as string;
      const key = line.params.answerKey as { key: { tonic: string; mode: string }; octave: number };
      const scale = `.scale("${key.key.tonic}${key.octave}:${key.key.mode}")`;
      expect(grade(t, { text: [`${code}${scale}`] }).correct).toBe(true);
      const up = `.scale("${key.key.tonic}${key.octave + 1}:${key.key.mode}")`;
      expect(grade(t, { text: [`${code}${up}`] }).correct).toBe(true);
      const wrong = code.replace(/<(\d)/, (_, d) => `<${(Number(d) + 1) % 7}`);
      const r = grade(t, { text: [`${wrong}${scale}`] });
      expect(r.correct).toBe(false);
      expect(r.credit).toBeCloseTo(0.75, 5);
    }
  });

  test("the code the learner would write sounds the bass line (headless Strudel), in minor too", async () => {
    const t = trialAt("fam.har.bass", 5, 77, "minor");
    const line = bassLineTrialOf(t) as Trial;
    const key = line.params.answerKey as { key: { tonic: string; mode: string }; octave: number };
    const code = `${bassLineCodeOf(t)}.scale("${key.key.tonic}${key.octave}:${key.key.mode}")`;
    const res = await evalHeadless(code, 4);
    const heard = res.events.map((e) => (((e.midi as number) % 12) + 12) % 12);
    const want = bassPlan(t)?.events.map((e) => ((Number(e.value.note) % 12) + 12) % 12) ?? [];
    expect(heard).toEqual(want);
  });

  test("the line on the bass staff, spelled from the answer, is graded right", () => {
    const t = trialAt("fam.har.bass", 5, 41, "minor");
    const line = bassLineTrialOf(t) as Trial;
    const value = expectedStaffValue(line) as string;
    expect(value).not.toBeNull();
    expect(grade(t, staffAnswer(line, value)).correct).toBe(true);
  });

  test("an engine bass-line trial: root motion first through the machine, then the line", async () => {
    // A bass line with passing notes under one chord a bar, as the engine writes a bass-line dictation.
    const base = trialAt("fam.har.bass", 2, 61, "diatonic-roots");
    const cue = Number(base.params.cueBars ?? 0);
    const bassEvs = base.events.filter((e) => e.track === "bass");
    const passing = bassEvs.map((e, i) => ({
      ...e,
      id: `${e.id}p`,
      onset: [e.onset[0] * 2 + e.onset[1], e.onset[1] * 2] as [number, number],
      dur: [1, 2] as [number, number],
      midi: (e.midi as number) + (i % 2 === 0 ? 2 : -1),
    }));
    const t = {
      ...base,
      events: [...base.events, ...passing],
      params: {
        ...base.params,
        mode: "code",
        ui: "code",
        answerTrack: "bass",
        answerFromBar: cue,
        answerBars: Number(base.params.bars) - cue,
        answerKey: { key: base.params.key, octave: 2 },
      },
    } as Trial;
    expect(isBassLineTrial(t)).toBe(true);
    expect(rootsOf(t)).toEqual((base.expected as Answer).degrees as Degree[]);
    expect(rootsSpecOf(t)?.ui).toBe("degree-pad");
    const deps: DrillDeps = {
      grade: (trial, response) => gradeDrillTrial(registry.family(trial.family), trial, response, PROFILE),
      stepsOf: (trial) => (isBassLineTrial(trial) ? ["bass", "line"] : null),
      gradeStep: (trial, _step, answer) => gradeRoots(trial, (answer.degrees ?? []).map(String)),
      gradeResolution: () => ({ credit: 0, passed: false, sung: [] }),
      sungOf: () => [],
      now: () => 1000,
      iso: () => "2026-11-13T10:00:00.000Z",
    };
    const { actor } = runMachine([t], deps);
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }));
    expect(actor.getSnapshot().context.steps).toMatchObject({ order: ["bass", "line"], at: 0 });
    actor.send({ type: "PRESENTED" });
    // The line cannot be sent before the roots.
    actor.send({ type: "SUBMIT", answer: { text: ['n("0")'] } });
    expect(actor.getSnapshot().matches({ trial: "answering" })).toBe(true);
    actor.send({ type: "STEP_CHECK", answer: { degrees: rootsOf(t) } });
    expect(actor.getSnapshot().context.steps?.at).toBe(1);
    actor.send({ type: "SUBMIT", answer: { text: ['n("<0 1 2 3>").scale("C2:major")'] } });
    await waitFor(actor, (st) => st.matches("feedback"));
    const rec = actor.getSnapshot().context.records[0];
    expect(rec?.response.answer?.stages?.bass).toEqual(rootsOf(t));
    expect(rec?.response.answer?.text).toEqual(['n("<0 1 2 3>").scale("C2:major")']);
    expect(rec?.correct).toBe(false);
  });

  test("a line of the `lines` category: roots first (one per chord), then all eight notes, as code too", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const t = trialAt("fam.har.bass", 5, seed, "lines");
      const notes = (t.expected as Answer).degrees as Degree[];
      expect(isBassLineTrial(t)).toBe(true);
      // The root of each bar is the line's beat-1 note.
      expect(rootsOf(t)).toEqual(notes.filter((_, i) => i % 2 === 0));
      expect(rootsSpecOf(t)).toMatchObject({ ui: "degree-pad", sequenceLen: 4 });
      const line = bassLineTrialOf(t) as Trial;
      const key = line.params.answerKey as { key: { tonic: string; mode: string }; octave: number };
      const code = `${bassLineCodeOf(t)}.scale("${key.key.tonic}${key.octave}:${key.key.mode}")`;
      expect(bassLineCodeOf(t)).toMatch(/^n\("<\[\d \d\] \[\d \d\] \[\d \d\] \[\d \d\]>"\)$/);
      expect(grade(t, { text: [code] }).correct).toBe(true);
      // The pad answer (all eight degrees) grades right through the engine.
      expect(grade(t, { degrees: notes }).correct).toBe(true);
    }
  });

  test("an engine bass-line trial's roots are checked chord by chord", () => {
    const t = trialAt("fam.har.bass", 1, 61);
    const roots = rootsOf(t);
    expect(gradeRoots(t, roots)).toMatchObject({ passed: true, credit: 1 });
    expect(
      gradeRoots(
        t,
        roots.map(() => "7"),
      ).passed,
    ).toBe(false);
  });
});

describe("c8: the numerals that fit the bass the learner found, in minor", () => {
  test("a passed bass step lights the numerals whose chord holds that bass (♭6 → VI in minor)", () => {
    const seeds = SEEDS.map((s) => trialAt("fam.har.progression", 4, s, "minor")).filter(
      (t) => (t.params.key as { mode: string }).mode === "minor",
    );
    expect(seeds.length).toBeGreaterThan(0);
    for (const t of seeds) {
      const k = stagedKeyOf(t);
      expect(k).not.toBeNull();
      const found = foundBassOf(
        { answer: { degrees: k?.bass as Degree[] }, passed: true, revealed: false },
        k?.bass ?? [],
      );
      expect(found).toEqual(k?.bass ?? []);
      // Every answer numeral fits the bass found under it (degrees spelled do-based: ♭3 ♭6 ♭7).
      (k?.rn ?? []).forEach((rn, i) => {
        expect(rnHasDegree(rn, found?.[i] as string, k?.key)).toBe(true);
      });
    }
    const aMinor = { tonic: "A", mode: "minor" } as const;
    expect(rnHasDegree("VI", "b6", aMinor)).toBe(true);
    expect(rnHasDegree("iv", "b6", aMinor)).toBe(true);
    expect(rnHasDegree("V", "7", aMinor)).toBe(true);
    expect(rnHasDegree("III", "b6", aMinor)).toBe(false);
  });

  test("nothing is lit before the bass step passes; a shown bass lights the answer's", () => {
    expect(foundBassOf(undefined, ["1"])).toBeNull();
    expect(foundBassOf({ answer: { degrees: ["2"] }, passed: false, revealed: false }, ["1"])).toBeNull();
    expect(foundBassOf({ answer: null, passed: false, revealed: true }, ["b6", "b7"])).toEqual(["b6", "b7"]);
  });
});

describe("the Practice hub: stage E, honest levels, graduation as progress", () => {
  test("form by ear and the kick lock are heard with stage E", () => {
    const groups = groupByStage(families, EAR_STAGES);
    const e = groups.find((g) => g.key === "E");
    expect(e?.families.map((f) => f.id)).toEqual([
      "fam.deg.fet-minor",
      "fam.chd.quality-7th",
      "fam.frm.blues",
      "fam.key.mode",
      "fam.rhy.groove-lock",
      // Wave 6: intervals by name arrive with the sevenths (U12.L06).
      "fam.int.isolated",
      "fam.frm.sections",
    ]);
    expect(e?.title).toBe("Stage E · Minor, sevenths and the blues");
  });

  test("a level its lessons have not opened is never shown", () => {
    const mode = def("fam.key.mode");
    const st = { level: 4, maxOpenLevel: 2 } as FamilyState;
    expect(levelLine(mode, st)).toBe("Level 2 of 6 · level 3 opens with U14.L03");
    // A graduated family below levels its lessons have all opened says so plainly (never "for now").
    const fetMinor = def("fam.deg.fet-minor");
    expect(levelLine(fetMinor, { ...st, familyId: "fam.deg.fet-minor", level: 3, maxOpenLevel: 6 })).toBe(
      "Level 3 of 6 · every level open",
    );
  });

  test("graduated into the composite reads as progress", () => {
    const st = {
      familyId: "fam.deg.fet-minor",
      level: 4,
      graduatedAt: "2026-11-12T10:00:00.000Z",
      compositeId: "fam.mix.pitch",
      restingSince: null,
    } as unknown as FamilyState;
    const line = graduatedLine(st, def("fam.deg.fet-minor"), "Mixed pitch", 6);
    expect(line).toBe(
      "Graduated to Mixed pitch with 6 others: it keeps its level and comes up two trials at a time.",
    );
    expect(line).not.toMatch(/slip|lost|lose|drop/i);
    expect(
      graduatedLine({ ...st, level: 2 } as FamilyState, def("fam.deg.fet-minor"), "Mixed pitch", 0),
    ).toBeNull();
    const view = summaryView({
      def: def("fam.deg.fet-minor"),
      summary: {
        family: "fam.deg.fet-minor" as never,
        trials: 8,
        meanCredit: 0.9,
        medianRtMs: 1200,
        extraReplays: 0,
        meanAbsCents: null,
        playedLevel: 3,
        perCategory: {},
        confusions: {},
        diagnostics: [],
      },
      outcomes: [],
      finish: {
        reviews: [
          {
            cardId: "fam.deg.fet-minor",
            rating: "good",
            dueAt: "2026-12-12T10:00:00.000Z",
            scheduledDays: 29,
            status: "review",
            familyState: st,
            levelChange: null,
            graduated: true,
          },
        ],
      } as unknown as DrillFinish,
      purpose: "srs",
      cardLevel: 3,
      before: null,
      profile: PROFILE,
      compositeTitle: "Mixed pitch",
    });
    expect(view.moved[0]).toBe(
      "Scale degrees (minor) graduated: it now lives in Mixed pitch, two trials at a time, at the level you reached.",
    );
    expect(view.next).toBe("Next heard in Mixed pitch.");
  });
});

describe("the machine: one part of the passage after the answer", () => {
  test("AUDITION part carries the section or bar to the audition actor", async () => {
    const t = trialAt("fam.frm.blues", 1, 5, "which-chord");
    const seen: { what: string; part: number | null | undefined }[] = [];
    const deps: DrillDeps = {
      grade: (trial, response) => gradeTrial(registry.family(trial.family), trial, response, PROFILE),
      gradeResolution: () => ({ credit: 0, passed: false, sung: [] }),
      sungOf: () => [],
      now: () => 1000,
      iso: () => "2026-11-13T10:00:00.000Z",
    };
    const { actor } = runMachine([t], deps, (input) => seen.push({ what: input.what, part: input.part }));
    await waitFor(actor, (st) => st.matches({ trial: "presenting" }));
    actor.send({ type: "PRESENTED" });
    actor.send({ type: "SUBMIT", answer: t.expected as Answer });
    await waitFor(actor, (st) => st.matches({ feedback: "idle" }));
    actor.send({ type: "AUDITION", what: "part", part: 5 });
    await waitFor(actor, (st) => st.matches({ feedback: "idle" }));
    actor.send({ type: "AUDITION", what: "alone" });
    await waitFor(actor, (st) => st.matches({ feedback: "idle" }));
    expect(seen).toEqual([
      { what: "part", part: 5 },
      { what: "alone", part: null },
    ]);
    expect(actor.getSnapshot().context.auditionPart).toBeNull();
  });
});

// --- machine harness ---------------------------------------------------------------------------------

function sessionOf(familyId: string, trials: number, level: number): DrillSession {
  const d = def(familyId);
  return {
    id: `drl_${familyId}`,
    sessionId: null,
    purpose: "practice",
    familyIds: [familyId as DrillSession["familyIds"][number]],
    setId: `w5_${familyId}`,
    levels: { [familyId]: level },
    openCategories: { [familyId]: d.levels[level - 1]?.categories ?? [] },
    focus: {},
    trialsPlanned: trials,
    startedAt: "2026-11-13T10:00:00.000Z",
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
function runMachine(
  trials: Trial[],
  deps: DrillDeps,
  onAudition?: (input: { what: string; part?: number | null }) => void,
) {
  const s = sessionOf(trials[0]?.family as string, trials.length, trials[0]?.level ?? 1);
  const machine = drillMachine.provide({
    actors: {
      start: fromPromise(async () => ({ session: s, source: fixedSource(trials) })),
      present: fromCallback(() => () => {}),
      audition: fromCallback(({ input, sendBack }) => {
        onAudition?.(input as { what: string; part?: number | null });
        sendBack({ type: "AUDITION_DONE" });
        return () => {};
      }),
      resolve: fromCallback(() => () => {}),
      singPart: fromCallback(() => () => {}),
      finish: fromPromise(async () => null),
    },
    actions: { persist: () => {}, send: () => {}, done: () => {} },
  });
  const input: DrillInput = {
    purpose: "practice",
    familyIds: s.familyIds,
    warmupItemId: null,
    sessionId: null,
    quiet: false,
    tolCents: 50,
    resume: null,
    deps,
  };
  const actor = createActor(machine, { input });
  actor.start();
  return { actor };
}

describe("the note lenses only where a pitch is labelled", () => {
  test("rhythm and form families hide them; pitch and harmony families keep them", async () => {
    const { hidesNoteLenses } = await import("./LensSwitches.tsx");
    for (const id of ["fam.rhy.swing", "fam.rhy.groove-lock", "fam.frm.blues", "fam.frm.sections"])
      expect(hidesNoteLenses(def(id))).toBe(true);
    for (const id of ["fam.deg.fet-minor", "fam.har.bass", "fam.key.mode", "fam.mel.dictation"])
      expect(hidesNoteLenses(def(id))).toBe(false);
  });
});
