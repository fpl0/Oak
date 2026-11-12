import { describe, expect, test } from "bun:test";
import { midisOf } from "@oak/grader/testing";
import { toolbox } from "../../../content/toolbox.ts";
import {
  ARPEGGIO_LEAD_MS,
  CEREMONY_MAX_MS,
  CIRCLE_PATH,
  ceremonyTimeline,
  circleStep,
  demoBody,
  demoBpm,
  FEATURE_NOTES,
  litNotes,
  ringAngle,
  showcaseOf,
  tokenMarks,
} from "./ceremony-model.ts";

const tool = (id: string) => {
  const t = toolbox.find((x) => x.id === id);
  if (!t) throw new Error(`no tool ${id}`);
  return t;
};

describe("the showcase notes are the demos' own notes (headless Strudel)", () => {
  for (const id of Object.keys(FEATURE_NOTES))
    test(id, async () => {
      const midis = await midisOf(tool(id).catalog.demo, 2);
      expect(midis).toEqual(FEATURE_NOTES[id]?.notes.map(([m]) => m) ?? []);
    });

  test("the circle demo walks C, F, B♭, E♭ one key per bar", async () => {
    const demo = tool("tb.feature.circle").catalog.demo;
    expect(demo).toContain(`<${CIRCLE_PATH.map((k, i) => `${k}${i === 2 ? 3 : 4}:major`).join(" ")}>`);
    // Bar 1 in C major (C E G E), bar 2 in F major (F A C A).
    expect(await midisOf(demo, 2)).toEqual([60, 64, 67, 64, 65, 69, 72, 69]);
  });
});

describe("showcaseOf", () => {
  test("degree labels: a roll in C major, 1 3 5 3 | 4 2 1", () => {
    const s = showcaseOf(tool("tb.feature.degree-labels"));
    expect(s.kind).toBe("roll");
    if (s.kind !== "roll") return;
    expect(s.keyName).toBe("C major");
    expect(s.labels).toEqual(["degree"]);
    expect(s.notes.map((n) => n.degree)).toEqual(["1", "3", "5", "3", "4", "2", "1"]);
  });

  test("solfège: degrees with movable-do syllables", () => {
    const s = showcaseOf(tool("tb.feature.solfege"));
    if (s.kind !== "roll") throw new Error(s.kind);
    expect(s.labels).toEqual(["degree", "syllable"]);
    expect(s.notes.map((n) => n.syllable)).toEqual(["do", "re", "mi", "fa", "mi", "sol", "mi", "do"]);
  });

  test("key signature: D major, F♯ C♯ in written order; the notes take the signature", () => {
    const s = showcaseOf(tool("tb.feature.keysig"));
    if (s.kind !== "signature") throw new Error(s.kind);
    expect(s.keyName).toBe("D major");
    expect(s.accidentals).toEqual(["F♯", "C♯"]);
    expect(s.notes.map((n) => n.name)).toEqual(["D4", "F♯4", "A4", "C♯5", "D5", "C♯5", "A4", "B4"]);
  });

  test("circle: twelve majors, sharps clockwise from C", () => {
    const s = showcaseOf(tool("tb.feature.circle"));
    if (s.kind !== "circle") throw new Error(s.kind);
    expect(s.ring).toHaveLength(12);
    expect(s.ring[0]).toEqual({ tonic: "C", fifths: 0 });
    expect(s.ring.find((k) => k.tonic === "F")?.fifths).toBe(-1);
    expect(s.path).toEqual(["C", "F", "Bb", "Eb"]);
    expect(ringAngle(1)).toBe(30);
    expect(ringAngle(-1)).toBe(330);
  });

  test("a code tool: its demo with the tool's tokens marked", () => {
    const s = showcaseOf(tool("tb.scale"));
    if (s.kind !== "code") throw new Error(s.kind);
    expect(s.code).toBe('mel: n("0 1 2 3 4 3 2 1").scale("G4:major").s("piano")');
    expect(s.marks.map(([a, b]) => s.code.slice(a, b))).toEqual(["scale"]);
  });

  test("tokenMarks: n( but not the n in piano; a scale name inside its string", () => {
    const code = 'mel: n("0 2").scale("C4:major").s("piano")';
    expect(tokenMarks(code, { code: 'n("…")', matches: ["n"] }).map(([a, b]) => code.slice(a, b))).toEqual([
      "n",
    ]);
    expect(
      tokenMarks(code, { code: "X4:major", matches: ["major"] }).map(([a, b]) => code.slice(a, b)),
    ).toEqual(["major"]);
  });

  test("demoBody drops the tempo line", () => {
    expect(demoBody('setcpm(84/4)\n\nmel: n("0")')).toBe('mel: n("0")');
    expect(demoBpm("setcpm(84/4)\n\nx")).toBe(84);
    expect(demoBpm("x")).toBeNull();
  });
});

describe("timeline (contracts §9.3: at most 8 seconds)", () => {
  test("two bars at 84 bpm fit after the arpeggio", () => {
    const t = ceremonyTimeline("setcpm(84/4)\n\nx");
    expect(t.demoAt).toBe(ARPEGGIO_LEAD_MS);
    expect(t.demoMs).toBeCloseTo((8 * 60_000) / 84, 0);
    expect(t.totalMs).toBeLessThanOrEqual(CEREMONY_MAX_MS);
  });
  test("a slow demo is cut at the budget", () => {
    expect(ceremonyTimeline("setcpm(40/4)\n\nx").totalMs).toBe(CEREMONY_MAX_MS);
  });
  test("every toolbox demo ends inside the budget", () => {
    for (const t of toolbox)
      expect(ceremonyTimeline(t.catalog.demo).totalMs).toBeLessThanOrEqual(CEREMONY_MAX_MS);
  });
  test("labels light with the notes; the circle steps one key a bar", () => {
    const notes = [{ at: 0 }, { at: 0.25 }, { at: 0.5 }];
    expect(litNotes(notes, -0.1)).toBe(0);
    expect(litNotes(notes, 0)).toBe(1);
    expect(litNotes(notes, 0.3)).toBe(2);
    expect(litNotes(notes, 2)).toBe(3);
    expect(circleStep(4, 0.5)).toBe(0);
    expect(circleStep(4, 1.2)).toBe(1);
    // Two bars of demo: C, then F; the rest of the walk is in the caption.
    expect(circleStep(4, 9)).toBe(1);
  });
});
