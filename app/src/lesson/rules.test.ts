// The Wave 3 player rules against the real exemplar (U03.L02) and generated trials: the target roll after a
// failed check, the first wrong bar, the by-ear rule, sung labels and the Quiet fallback, the feature moment,
// staff labels, the sketch title, key-signature answers, the cadence that sets home and passive labels.
import { describe, expect, test } from "bun:test";
import { decks } from "@content/families.ts";
import type { Diagnostic, Exercise, GradeResult, LessonDef, SingEx, StepDef } from "@oak/api";
import { createRegistry, FAMILIES, generateTrial } from "@oak/drills";
import { pcOf } from "@oak/theory";
import u00l01 from "../../../content/core/U00/L01/lesson.ts";
import u03l02 from "../../../content/core/U03/L02/lesson.ts";
import { toolbox } from "../../../content/toolbox.ts";
import { NEUTRAL_PROFILE } from "./grading.ts";
import { canContinue, continueLabel } from "./model.ts";
import {
  acceptsText,
  atOrAfter,
  cadenceChords,
  failedChecks,
  fallbackCorrect,
  featureMoment,
  featuresOfStep,
  featuresUnlockedAt,
  firstWrongBar,
  isByEar,
  isSungStep,
  keySignatureResponse,
  keySignatureTokens,
  labelsBefore,
  makeTitle,
  passiveLabel,
  singFallback,
  singLabelsFor,
  staffLabelsOf,
  targetLabel,
  targetMarks,
  targetRollShown,
  workbenchStaffLabels,
} from "./rules.ts";

const step = (def: LessonDef, id: string) => def.steps.find((s) => s.id === id) as StepDef;
const ex = (def: LessonDef, id: string) => step(def, id).exercise as Exercise;
const diag = (bar: number, severity: Diagnostic["severity"] = "error"): Diagnostic => ({
  id: "melody.wrong-degree",
  severity,
  where: { bar },
  params: {},
});
const res = (status: GradeResult["status"], diagnostics: Diagnostic[] = []) => ({ status, diagnostics });

describe("course position", () => {
  test("core lessons compare by unit and lesson; later sessions count as after U03", () => {
    expect(atOrAfter("U03.L08", "U03.L08")).toBe(true);
    expect(atOrAfter("U03.L07", "U03.L08")).toBe(false);
    expect(atOrAfter("U04.L01", "U03.L08")).toBe(true);
    expect(atOrAfter("U03.CP", "U03.L02")).toBe(true);
    expect(atOrAfter("U02.CP", "U03.L02")).toBe(false);
  });
});

describe("the target roll of a modify step", () => {
  const s4 = ex(u03l02, "S4");
  test("U03.L02 S4 starts by ear and shows the roll after the first failed check", () => {
    expect(targetRollShown(s4, { failed: 0, passed: false, rung: 0 })).toBe(false);
    expect(targetRollShown(s4, { failed: 1, passed: false, rung: 0 })).toBe(true);
    expect(targetRollShown(s4, { failed: 0, passed: true, rung: 0 })).toBe(true);
    expect(targetRollShown(s4, { failed: 0, passed: false, rung: 4 })).toBe(true);
  });
  test("without revealRollAfter it never appears (S5), and other kinds have none", () => {
    expect(targetRollShown(ex(u03l02, "S5"), { failed: 3, passed: false, rung: 3 })).toBe(false);
    expect(targetRollShown(ex(u03l02, "S7"), { failed: 3, passed: false, rung: 0 })).toBe(false);
  });
  test("failed checks are the graded attempts that did not pass", () => {
    expect(failedChecks({ attempts: 2 }, false)).toBe(2);
    expect(failedChecks({ attempts: 2 }, true)).toBe(1);
    expect(failedChecks(null, false)).toBe(0);
  });
});

describe("by ear", () => {
  test("the first difference is the earliest bar with a finding; a pass has none", () => {
    expect(firstWrongBar(res("fail", [diag(3), diag(2), diag(1, "info")]))).toBe(2);
    expect(firstWrongBar(res("fail", [{ ...diag(0), where: {}, params: { bar: 4 } }]))).toBe(4);
    expect(firstWrongBar(res("pass", [diag(1)]))).toBeNull();
    expect(firstWrongBar(res("fail", []))).toBeNull();
    expect(firstWrongBar(null)).toBeNull();
  });
  test("each transposition rule says what counts, without later terms", () => {
    expect(acceptsText("any-key").title).toBe("Any key");
    expect(acceptsText("any-octave").body).toContain("octave");
    expect(acceptsText("exact").body).toContain("octave you hear");
    for (const a of ["exact", "any-octave", "any-key"] as const)
      expect(acceptsText(a).body.toLowerCase()).not.toContain("interval");
  });
  test("only dictation with byEar is a by-ear step", () => {
    expect(isByEar(ex(u03l02, "S4"))).toBe(false);
    const d = {
      kind: "dictation",
      byEar: { ab: true, rates: [1, 0.75], accepts: "any-key" },
    } as unknown as Exercise;
    expect(isByEar(d)).toBe(true);
  });
});

describe("singing", () => {
  const s8 = ex(u03l02, "S8") as SingEx;
  test("U03.L02 sings on numbers; the default turns to syllables from U03.L08", () => {
    expect(singLabelsFor(s8, "U03.L02")).toBe("numbers");
    expect(singLabelsFor({}, "U03.L02")).toBe("numbers");
    expect(singLabelsFor({}, "U03.L09")).toBe("syllables");
    expect(singLabelsFor({ labels: "numbers" }, "U04.L01")).toBe("numbers");
  });
  test("a syllable keeps its number beside it", () => {
    expect(targetLabel("5", "numbers")).toEqual({ main: "5", sub: null });
    expect(targetLabel("5", "syllables")).toEqual({ main: "sol", sub: "5" });
    expect(targetLabel("b3", "syllables")).toEqual({ main: "me", sub: "b3" });
  });
  test("per-target marks are words, a missing note is missed", () => {
    expect(targetMarks(["1", "3", "5"], [1, 0.5, null]).map((m) => m.word)).toEqual([
      "on",
      "close",
      "missed",
    ]);
    expect(targetMarks(["1"], [0]).map((m) => m.word)).toEqual(["off"]);
  });
  test("Quiet mode: S8 (fallback skip) is heard inside; an identify fallback asks for the degrees", () => {
    expect(singFallback(s8)).toEqual({ kind: "inner" });
    const id = singFallback({ ...s8, fallback: "identify" });
    expect(id).toEqual({ kind: "identify", degrees: ["1", "3", "5", "3", "1"], set: ["1", "3", "5"] });
    expect(fallbackCorrect(["1", "3", "5"], ["1", "3", "5"])).toBe(true);
    expect(fallbackCorrect(["1", "3", "5"], ["1", "5", "3"])).toBe(false);
  });
  test("a sung step never gates Continue, even when graded", () => {
    const graded = { ...step(u03l02, "S8"), graded: true };
    const none = { state: null, result: null, done: false, disputed: false };
    expect(isSungStep(graded)).toBe(true);
    expect(canContinue(graded, none)).toBe(true);
    expect(continueLabel(graded, none)).toBe("Skip");
    expect(continueLabel(graded, { ...none, done: true })).toBe("Continue");
    expect(canContinue(step(u03l02, "S4"), none)).toBe(false);
  });
});

describe("feature tools switching on", () => {
  test("degree labels unlock at U03.L02 and switch on at its first step with degree labels", () => {
    const fresh = featuresUnlockedAt(toolbox, "U03.L02");
    expect(fresh).toContain("tb.feature.degree-labels");
    expect(featuresOfStep(step(u03l02, "S1")).has("tb.feature.degree-labels")).toBe(true);
    expect(featureMoment(u03l02.steps, 0, fresh)).toEqual(["tb.feature.degree-labels"]);
    expect(featureMoment(u03l02.steps, 2, fresh)).toEqual([]);
  });
  test("the circle (no step shows it) switches on at the first step; the key signature where a staff is", () => {
    expect(featuresUnlockedAt(toolbox, "U03.L07")).toContain("tb.feature.circle");
    expect(featureMoment(u03l02.steps, 0, ["tb.feature.circle"])).toEqual(["tb.feature.circle"]);
    expect(featureMoment(u03l02.steps, 2, ["tb.feature.keysig"])).toEqual(["tb.feature.keysig"]);
    expect(featureMoment(u03l02.steps, 0, ["tb.feature.keysig"])).toEqual([]);
  });
  test("while switching on, the labels start one step down", () => {
    expect(labelsBefore("degree", ["tb.feature.degree-labels"])).toBe("none");
    expect(labelsBefore("degree+solfege", ["tb.feature.solfege"])).toBe("degree");
    expect(labelsBefore("degree", [])).toBe("degree");
  });
});

describe("staff labels and the Make", () => {
  test("a step's own staff labels win; else the unit's default where there is a staff", () => {
    expect(staffLabelsOf(step(u03l02, "S3"), "U03.L02")).toBe("degree");
    const plain = { ...step(u03l02, "S3"), ui: { panels: { roll: true, staff: "treble", keyboard: false } } };
    expect(staffLabelsOf(plain as StepDef, "U02.L04")).toBe("none");
    expect(staffLabelsOf(plain as StepDef, "U03.L05")).toBe("degree");
    expect(staffLabelsOf(plain as StepDef, "U04.L01")).toBe("degree+solfege");
    expect(staffLabelsOf(step(u03l02, "S2"), "U04.L01")).toBe("none");
    expect(workbenchStaffLabels("degree+solfege")).toBe("degree+solfege");
    expect(workbenchStaffLabels("note")).toBe("note");
  });
  test("the Make's sketch title is the exercise's own, else the lesson's", () => {
    const make = u00l01.steps.find((s) => s.kind === "make")?.exercise;
    expect(makeTitle(make, u00l01)).toBe("Sketch 001");
    expect(makeTitle(ex(u03l02, "S9"), u03l02)).toBe("Degrees in Code");
  });
});

describe("key signatures", () => {
  test("accidentals are read in order, in any common spelling", () => {
    expect(keySignatureTokens("F♯ c#")).toEqual(["F#", "C#"]);
    expect(keySignatureTokens("Bb, eb")).toEqual(["Bb", "Eb"]);
    expect(keySignatureTokens("  ")).toEqual([]);
    expect(keySignatureResponse("B♭ E♭ A♭")).toEqual({ answer: { text: ["Bb", "Eb", "Ab"] } });
  });
});

describe("the cadence that sets home", () => {
  const pcs = (c: number[]) => [...new Set(c.map((m) => ((m % 12) + 12) % 12))].sort((a, b) => a - b);
  test("ii–V–I in D major: E G B, A C♯ E, D F♯ A, ending on the tonic in the bass", () => {
    const [ii, v, i] = cadenceChords({ tonic: "D", mode: "major" });
    expect(pcs(ii as number[])).toEqual([4, 7, 11]);
    expect(pcs(v as number[])).toEqual([1, 4, 9]);
    expect(pcs(i as number[])).toEqual([2, 6, 9]);
    expect(((i as number[])[0] as number) % 12).toBe(pcOf("D"));
  });
  test("in A minor: B D F, E G♯ B, A C E; registers stay around middle C", () => {
    const chords = cadenceChords({ tonic: "A", mode: "minor" });
    expect(chords.map(pcs)).toEqual([
      [2, 5, 11],
      [4, 8, 11],
      [0, 4, 9],
    ]);
    for (const c of [...chords, ...cadenceChords({ tonic: "F#", mode: "major" })])
      for (const m of c) expect(m >= 36 && m <= 84).toBe(true);
  });
});

describe("passive listening", () => {
  test("a generated in-key pair is named by its quality and its degrees", () => {
    const reg = createRegistry(FAMILIES, decks);
    const fam = reg.family("fam.int.in-key");
    const cats = fam.def.categories.map((c) => c.id);
    for (const seed of [1, 2, 3, 42]) {
      const t = generateTrial(
        fam,
        { index: 0, family: "fam.int.in-key", level: 3, category: cats[1] as string, seed },
        NEUTRAL_PROFILE,
        cats,
      );
      const label = passiveLabel(t);
      expect(label).toMatch(/(unison|octave|(major|minor|perfect|augmented|diminished) \d+(st|nd|rd|th)) · /);
      expect(label).toContain(t.expected.degrees?.join(" → ") ?? "?");
    }
    expect(passiveLabel({ params: {}, expected: { text: ["P5"] } })).toBe("P5");
  });
});
