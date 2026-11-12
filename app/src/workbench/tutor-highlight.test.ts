// A tutor reference lights the learner's notes in the bars or at the pitch it names, on a real evaluation.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { evaluateForGrading, initRealm } from "@oak/grader";
import { buildModel, type WorkbenchModel } from "./model.ts";
import { tutorHighlightEvents } from "./tutor-highlight.ts";

setDefaultTimeout(30_000);
beforeAll(async () => {
  await initRealm({ toolbox: [], lockdown: false });
});

async function model(code: string, bars: number): Promise<WorkbenchModel> {
  const result = await evaluateForGrading(code, { mode: "lesson", bars, lint: null });
  const out = buildModel(code, result, { meter: "4/4", key: { tonic: "C", mode: "major" }, staff: "auto" });
  if (!out.ok) throw new Error(out.error.message);
  return out.model;
}

describe("tutor references on the Workbench", () => {
  test("bars 2–3 light every learner event in those bars, nothing else", async () => {
    const m = await model('mel: note("<[c4 e4] [g4 a4] [f4 d4] c4>").s("piano")', 4);
    const ids = tutorHighlightEvents(m.events, { kind: "bars", from: 2, to: 3 });
    const lit = m.events.filter((e) => ids.includes(e.id)).map((e) => e.midi);
    expect(lit).toEqual([67, 69, 65, 62]);
    // Reversed or single bars read the same way; bar 4 is the last one.
    expect(tutorHighlightEvents(m.events, { kind: "bars", from: 3, to: 2 })).toEqual(ids);
    const last = tutorHighlightEvents(m.events, { kind: "bars", from: 4, to: 4 });
    expect(m.events.filter((e) => last.includes(e.id)).map((e) => e.midi)).toEqual([60]);
  });
  test("a note lights every learner event at that pitch", async () => {
    const m = await model('mel: note("c4 e4 c4 g4").s("piano")\nbass: note("c2").s("piano")', 1);
    const ids = tutorHighlightEvents(m.events, { kind: "note", midi: 60 });
    expect(ids).toHaveLength(2);
    expect(tutorHighlightEvents(m.events, { kind: "note", midi: 61 })).toEqual([]);
  });
  test("the Band's events never light", () => {
    const events = [
      { id: "a", band: false, onset: 0, midi: 60 },
      { id: "b", band: true, onset: 0, midi: 60 },
    ];
    expect(tutorHighlightEvents(events, { kind: "note", midi: 60 })).toEqual(["a"]);
    expect(tutorHighlightEvents(events, { kind: "bars", from: 1, to: 1 })).toEqual(["a"]);
  });
});
