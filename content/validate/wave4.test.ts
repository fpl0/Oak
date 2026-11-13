// The Wave 4 additions to content CI on small known inputs: panels a step opens are unlock-checked, the
// voicing gate's second chance is checked against the toolbox, chord symbols written as data must parse,
// capstone sessions resolve their phrase checks against the song pool, and the new learner-facing texts
// (slot labels, by-ear part labels) reach the voice and term rules.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { CapstoneDef, Exercise, LessonDef } from "@oak/content-kit";
import { capstones } from "../capstones.ts";
import exemplar from "../core/U05/L01/lesson.ts";
import type { LoadedLesson } from "../lib/load.bun.ts";
import { exerciseTexts } from "./authoring.ts";
import { checkLint, checkTheory, chordSymbolsOf, gateCheckIssues } from "./checks.ts";
import { capstoneSessionSections } from "./owners.ts";

setDefaultTimeout(60_000);
const clone = <T>(x: T): T => structuredClone(x) as T;
const loaded = (def: LessonDef): LoadedLesson => ({
  def,
  mdxSource: null,
  folderId: def.id,
  dir: "",
  file: "",
  mdx: null,
  sample: false,
});
type MutableStep = LessonDef["steps"][number] & { gateCheck?: true; exercise?: Exercise };

describe("panels a step opens", () => {
  test("a panel whose toolbox row is locked at the lesson is caught; an open one passes", () => {
    const def = clone(exemplar);
    const ui = (def.steps[0] as MutableStep).ui;
    (def.steps[0] as MutableStep).ui = { ...ui, initialPanels: ["chords"] };
    expect(checkLint(loaded(def)).issues.join(" ")).toContain("the chords panel needs tb.feature.rn");
    (def.steps[0] as MutableStep).ui = { ...ui, initialPanels: ["circle", "key"] };
    expect(checkLint(loaded(def)).issues).toEqual([]);
  });
});

describe("the voicing gate's second chance", () => {
  const withGate = (id: string, exId: string, code?: string): LessonDef => {
    const def = clone(exemplar) as LessonDef & { id: string };
    def.id = id as never;
    const s = def.steps[3] as MutableStep;
    s.gateCheck = true;
    const ex = s.exercise as Exercise & { id: string; code?: { starter: string } };
    ex.id = exId;
    if (code && ex.code) ex.code.starter = code;
    return def;
  };
  test("only in U05.L08, only with a variant the toolbox names", () => {
    expect(gateCheckIssues(withGate("U05.L08", "hand-voiced-cadence-again"))).toEqual([]);
    expect(gateCheckIssues(withGate("U05.L07", "hand-voiced-cadence-again")).join(" ")).toContain(
      "belongs to the lesson that unlocks",
    );
    expect(gateCheckIssues(withGate("U05.L08", "build-bar-three")).join(" ")).toContain("not a variant");
  });
  test("the gate check may not use the tools it guards", () => {
    const def = withGate(
      "U05.L08",
      "hand-voiced-cadence-again",
      'setcpm(88/4)\n\nchords: chord("<C F G C>").voicing()',
    );
    expect(gateCheckIssues(def).join(" ")).toContain("uses a tool it guards");
  });
});

describe("chord symbols written as data", () => {
  test("staff chords, lead-sheet charts and typed chord answers are collected and parsed", () => {
    const def = clone(exemplar);
    const s = def.steps[4] as MutableStep;
    s.ui = {
      panels: { roll: false, staff: "lead", keyboard: false },
      leadSheet: {
        chords: {
          chart: [
            { bar: 1, beat: 1, symbol: "C/E" },
            { bar: 2, beat: 1, symbol: "Hm" },
          ],
        },
      },
    };
    s.exercise = {
      kind: "staff-write",
      id: "build",
      version: 1,
      prompt: "p",
      skills: [{ skill: "C01", w: 1 }],
      role: "check",
      hints: null,
      tests: [],
      answer: {
        ui: "staff-input",
        clef: "grand",
        bars: 1,
        palette: { durations: ["2"], accidentals: true, ties: false, rests: false, chords: true },
      },
      expect: { e: "chords", symbols: ["Bo", "Caug", "F#m"], spelling: "strict", bass: true },
    } as Exercise;
    expect(chordSymbolsOf(def).map((c) => c.symbol)).toEqual(["C/E", "Hm", "Bo", "Caug", "F#m"]);
    expect(checkTheory(loaded(def)).issues).toEqual(['S5 lead sheet bar 2: "Hm" is not a chord symbol']);
  });
});

describe("capstone sessions", () => {
  const x1 = capstones.find((c) => c.id === "X1") as CapstoneDef;
  const melody = {
    m: "melody",
    pitch: "key-relative",
    wPitch: 0.8,
    wRhythm: 0.2,
    rhythmTol: [1, 16],
  } as const;
  /** X1 with session 1's checks replaced and every other session's removed, over a song with no key yet. */
  const withChecks = (checks: object[]): CapstoneDef => {
    const c = clone(x1);
    for (const s of c.sessionDefs) delete (s as { checks?: object[] }).checks;
    (c.sessionDefs[0] as { checks?: object[] }).checks = checks;
    (c as { song: string[] }).song = ["song.down-by-the-riverside"];
    return c;
  };
  test("the real X1 resolves every phrase check against both songs", async () => {
    const r = await capstoneSessionSections(x1);
    expect(r.issues).toEqual([]);
  });
  test("a transcribe capstone with no checks yet is pending, not failing", async () => {
    const none = clone(x1);
    for (const s of none.sessionDefs) delete (s as { checks?: object[] }).checks;
    const r = await capstoneSessionSections(none);
    expect(r.issues).toEqual([]);
    expect(r.pending?.join(" ")).toContain("no phrase checks");
  });
  test("phrase checks: melody compares key-relative, chords go bass first; unwritten answer keys are pending", async () => {
    const ok = await capstoneSessionSections(
      withChecks([{ id: "p1", phrase: 1, layer: "melody", matcher: melody, pass: 0.85 }]),
    );
    expect(ok.issues).toEqual([]);
    expect(ok.pending?.some((p) => p.includes("no answer key yet"))).toBe(true);
    const bad = await capstoneSessionSections(
      withChecks([
        { id: "p1", phrase: 1, layer: "melody", matcher: { ...melody, pitch: "absolute" }, pass: 0.85 },
        {
          id: "c",
          phrase: [1, 2],
          layer: "chords",
          pass: 0.8,
          stages: ["quality", "rn"],
          matcher: {
            m: "harmony",
            level: "rn",
            qualityDepth: "triad",
            inversion: false,
            harmonicRhythm: "given",
          },
        },
      ]),
    );
    expect(bad.issues.join(" ")).toContain("key-relative");
    expect(bad.issues.join(" ")).toContain("bass first");
  });
});

test("slot labels and by-ear part labels are learner text", () => {
  const ex = {
    kind: "dictation",
    id: "loop",
    version: 1,
    prompt: "p",
    skills: [{ skill: "E09", w: 1 }],
    role: "practice",
    hints: null,
    tests: [],
    domain: "harmony",
    stimulus: { src: "code", code: "x", bars: 1, showCode: false },
    cue: { context: "none", countInBars: 0, click: false, replays: -1 },
    answer: {
      ui: "slot-choice",
      slots: 2,
      options: [
        { id: "a", label: "Home" },
        { id: "b", label: "Away" },
      ],
      labels: ["Bar 1", "Bar 2"],
    },
    reference: { solutions: ["x"], bars: 1 },
    matcher: { m: "pcset", perOnset: true, bass: false },
    byEar: {
      ab: true,
      rates: [1],
      accepts: "exact",
      parts: [
        { track: "bass", label: "The bass first", matcher: { m: "pcset", perOnset: true, bass: true } },
      ],
    },
  } as unknown as Exercise;
  const texts = exerciseTexts(ex, "S1").map((t) => t.text);
  expect(texts).toEqual(expect.arrayContaining(["Home", "Away", "Bar 1", "Bar 2", "The bass first"]));
});
