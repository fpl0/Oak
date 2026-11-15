// Wave 7 Build (grader): the answers the advanced tracks add, graded by what they mean and never by string, with
// a miss that says what the learner's own answer is (never the answer). The Euclid numbers are checked against the
// rhythm real Strudel plays for them; the voicings against content-kit's octave-aware shapes.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { AnswerUi, ExerciseOf, GradeResult, NEvent, TapLane } from "@oak/content-kit";
import { rat } from "@oak/content-kit";
import { euclid } from "@oak/theory";
import { headlessDeps, strudel } from "../analyze/__support__/fixtures.ts";
import { renderFeedback } from "../feedback/catalog.ts";
import type { GradeContext, MatchResult } from "../types.ts";
import { gradeAnswer } from "./answers.ts";
import {
  combineLanePerformances,
  euclidCheck,
  groupingCheck,
  jazzChordText,
  keyboardVoicingCheck,
  parseJazzChord,
  tapLaneTargets,
} from "./answers-wave7.ts";
import { gradeWith } from "./index.ts";
import { staffChordsCheck } from "./staff-chords.ts";

setDefaultTimeout(30_000);
const said = (ds: { id: string; params: Record<string, unknown> }[]): string =>
  ds.map((d) => renderFeedback(d as never)).join(" ");

describe("grouping (R2.L01–L02)", () => {
  test("the group sizes in order; a rotation is another grouping", () => {
    expect(groupingCheck([2, 2, 3], [2, 2, 3]).score).toBe(1);
    const rot = groupingCheck([2, 2, 3], [3, 2, 2]);
    expect(rot.score).toBe(0.5);
    expect(rot.diagnostics[0]?.id).toBe("id.grouping-order");
    expect(groupingCheck([2, 2, 3], [2, 3, 3]).diagnostics[0]?.id).toBe("id.grouping-count");
    expect(groupingCheck([3, 2], [2, 3]).score).toBe(0.5);
    const ui: AnswerUi = { ui: "grouping", meter: "7/8" };
    expect(gradeAnswer(ui, { grouping: [2, 2, 3] }, { grouping: [2, 2, 3] }).score).toBe(1);
    // The miss names the learner's grouping, never the right one.
    const m = gradeAnswer(ui, { grouping: [2, 2, 3] }, { grouping: [3, 2, 2] });
    expect(said(m.diagnostics)).toContain("3+2+2");
    expect(said(m.diagnostics)).not.toContain("2+2+3");
  });
});

describe("euclid (R3.L01–L03)", () => {
  const ui = (rotation: boolean): Extract<AnswerUi, { ui: "euclid" }> => ({
    ui: "euclid",
    maxSteps: 16,
    rotation,
  });
  test("graded by the onsets the numbers make, as Strudel plays them", async () => {
    // E(3,8) is the tresillo Strudel plays for `x(3,8)`; E(5,8,1) its rotated cinquillo.
    const tres = (await strudel('perc: s("rim(3,8)")', 1)).all.map((e) => e.onset[0] * (8 / e.onset[1]));
    expect(euclid(3, 8).flatMap((b, i) => (b ? [i] : []))).toEqual(tres);
    const rot = (await strudel('perc: s("rim(5,8,1)")', 1)).all.map((e) => e.onset[0] * (8 / e.onset[1]));
    expect(euclid(5, 8, 1).flatMap((b, i) => (b ? [i] : []))).toEqual(rot);
    expect(euclidCheck(ui(false), [3, 8], [3, 8]).score).toBe(1);
    expect(euclidCheck(ui(true), [5, 8, 1], [5, 8, 1]).score).toBe(1);
    // Without rotation in the widget, r is not part of the answer.
    expect(euclidCheck(ui(false), [3, 8], [3, 8, 2]).score).toBe(1);
    // Two spellings of one rhythm are one answer: E(1,4) on 4 steps.
    expect(euclidCheck(ui(true), [1, 4, 0], [1, 4]).score).toBe(1);
  });
  test("a wrong count or a wrong rotation says what the learner's numbers make", () => {
    const wrong = euclidCheck(ui(false), [3, 8], [5, 8]);
    expect(wrong.score).toBe(0);
    expect(said(wrong.diagnostics)).toContain("(5,8) makes 5 hits over 8 steps");
    expect(said(wrong.diagnostics)).not.toContain("(3,8)");
    const rot = euclidCheck(ui(true), [5, 8, 1], [5, 8, 3]);
    expect(rot.score).toBe(0.5);
    expect(rot.diagnostics[0]?.id).toBe("id.euclid-rotation");
    expect(gradeAnswer(ui(true), { euclid: [5, 8, 1] }, { euclid: [5, 8, 1] }).score).toBe(1);
  });
});

describe("jazz chord text (J1.L02, feature text.jazz-chord)", () => {
  test("glyphs and extensions read as chords", () => {
    const same: [string, string][] = [
      ["D–7", "Dm7"],
      ["D-7", "Dmin7"],
      ["Cø7", "Cm7b5"],
      ["Cø", "Cm7♭5"],
      ["C∆7", "Cmaj7"],
      ["C∆", "Cmaj7"],
      ["C∆9", "Cmaj9"],
      ["G7(♭9)", "G7b9"],
      ["G7(♯9)", "G7#9"],
      ["Galt", "G7alt"],
      ["C°7", "Cdim7"],
      ["B♭13", "Bb13"],
      ["C6/9", "C69"],
      ["C–∆7", "CmMaj7"],
    ];
    for (const [a, b] of same) {
      const x = parseJazzChord(a);
      const y = parseJazzChord(b);
      expect([a, x?.rootPc, x?.quality]).toEqual([a, y?.rootPc, y?.quality]);
      expect(x).not.toBeNull();
    }
    expect(jazzChordText("D–7")).toBe("Dm7");
  });
  test("graded on root, quality and extensions, never as a string", () => {
    const ui: AnswerUi = { ui: "text", normalize: "chord", jazz: true };
    expect(
      gradeAnswer(ui, { text: ["Dm7", "G7b9", "Cmaj9"] }, { text: ["D–7", "G7(♭9)", "C∆9"] }).score,
    ).toBe(1);
    // The right root with another quality is wrong (a plain G7 is not G7♭9).
    const m = gradeAnswer(ui, { text: ["G7b9"] }, { text: ["G7"] });
    expect(m.score).toBe(0);
    expect(m.diagnostics[0]?.id).toBe("id.chord-quality");
    // `Galt` (no 7 written) is read as the altered dominant only with `jazz`.
    expect(gradeAnswer(ui, { text: ["G7alt"] }, { text: ["Galt"] }).score).toBe(1);
  });
});

describe("voicings (feature keyboard.voicing, staff-expect.voicing)", () => {
  test("the shape, octave-aware, in any register; the dictionary's notes are not asked", () => {
    expect(keyboardVoicingCheck({ shape: "shell", symbol: "Dm7" }, [50, 53, 60]).score).toBe(1);
    expect(keyboardVoicingCheck({ shape: "shell", symbol: "Dm7" }, [38, 48, 53]).score).toBe(1);
    expect(
      keyboardVoicingCheck({ shape: ["rootless-a", "rootless-b"], symbol: "G7" }, [53, 57, 59, 64]).score,
    ).toBe(1);
    expect(keyboardVoicingCheck({ shape: "drop-2", symbol: "C∆7" }, [55, 60, 64, 71]).score).toBe(1);
    // The right notes in the wrong shape: close is not drop-2, the root on top is no shell.
    const close = keyboardVoicingCheck({ shape: "drop-2", symbol: "Cmaj7" }, [60, 64, 67, 71]);
    expect(close.score).toBe(0);
    expect(said(close.diagnostics)).toContain("That is a close voicing");
    expect(keyboardVoicingCheck({ shape: "shell", symbol: "Dm7" }, [53, 60, 62]).score).toBe(0);
    expect(keyboardVoicingCheck({ shape: "rootless-a", symbol: "Dm7" }, [50, 53, 57, 60]).score).toBe(0);
  });
  test("through gradeExercise: a keyboard step with expect.voicing", async () => {
    const ex = {
      kind: "keyboard",
      id: "kv",
      version: 1,
      prompt: "",
      skills: [],
      role: "check",
      hints: null,
      tests: [],
      answer: { ui: "keyboard", range: ["C2", "C6"], mode: "chord" },
      expect: { voicing: { shape: ["rootless-a"], symbol: "Dm7" } },
      pitchMode: "absolute",
    } as unknown as ExerciseOf<"keyboard">;
    const ctx = {
      exerciseGlobalId: "J3.L01/kv",
      mode: "lesson",
      meter: "4/4",
      params: {},
      attemptNo: 1,
      firstAttempt: true,
      rung: 0,
      tutorHints: 0,
      extraReplays: 0,
      lint: { profile: "graded", unlocked: new Set(), allowPreview: false, meter: "4/4", key: null },
    } as unknown as GradeContext;
    const pass: GradeResult = await gradeWith(
      { exercise: ex, response: { answer: { midi: [53, 57, 60, 64] } }, ctx },
      headlessDeps(),
    );
    expect(pass.status).toBe("pass");
    const fail = await gradeWith(
      { exercise: ex, response: { answer: { midi: [50, 53, 57, 60] } }, ctx },
      headlessDeps(),
    );
    expect(fail.status).toBe("fail");
    expect(fail.messages.map((f) => f.text).join(" ")).not.toMatch(/F3|A3|C4|E4/);
  });
  test("chords written on the staff in the asked shape", () => {
    const note = (midi: number, at: number): NEvent => ({
      id: `${midi}|${at}`,
      track: "staff",
      onset: rat(at),
      dur: rat(1),
      midi,
      pitchSource: "note-str",
      gain: 0.8,
      locs: [],
    });
    const shells = [note(50, 0), note(53, 0), note(60, 0), note(43, 1), note(53, 1), note(59, 1)];
    const expect1 = {
      symbols: ["Dm7", "G7"],
      spelling: "enharmonic" as const,
      bass: false,
      voicing: "shell" as const,
    };
    expect(staffChordsCheck(expect1, shells, { key: null, meter: "4/4" }).score).toBe(1);
    // A full Dm7 triad stack is the chord, not a shell.
    const stack = [note(50, 0), note(53, 0), note(57, 0), note(60, 0), note(43, 1), note(53, 1), note(59, 1)];
    const r = staffChordsCheck(expect1, stack, { key: null, meter: "4/4" });
    expect(r.score).toBeLessThan(1);
    expect(r.diagnostics[0]?.id).toBe("harmony.voicing-shape");
  });
});

describe("two-lane taps (feature tap.lanes, R2.L04)", () => {
  test("each lane's targets from its track; the weaker lane decides", async () => {
    const n = await strudel('a: s("rim*3")\nb: s("bd*2")', 1);
    const lanes: TapLane[] = [
      { label: "Left hand: the 3", track: "a", key: "f" },
      { label: "Right hand: the 2", track: "b", key: "j" },
    ];
    const t = tapLaneTargets(lanes, n, 1, "4/4");
    expect(t.map((x) => x.length)).toEqual([3, 2]);
    expect(t[1]?.[1]).toBeCloseTo(1, 9); // the second "2" half a cycle in, at 0.5 cps
    const good: MatchResult = { score: 0.95, dims: { rhythm: { score: 0.95, weight: 1 } }, diagnostics: [] };
    const weak: MatchResult = {
      score: 0.4,
      dims: { rhythm: { score: 0.4, weight: 1 } },
      diagnostics: [{ id: "tap.missed", severity: "error", params: { i: 2 } } as never],
    };
    const both = combineLanePerformances(lanes, [good, weak]);
    expect(both.score).toBe(0.4);
    expect(both.diagnostics[0]?.where?.track).toBe("Right hand: the 2");
    expect(combineLanePerformances(lanes, [good, good]).score).toBe(0.95);
  });
});
