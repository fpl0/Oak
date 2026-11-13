// The Oak for Wave 5: the bass, form, minor and blues strands as U08–U11 light them up, and the sound-design branch
// the side lessons A1.L01–L04 open (every new leaf has a plain blurb and a face label that fits, each unit row holds
// its leaves without overlap, the sound leaves sit in their own strand and track), "what's next" past unwritten
// lessons, and "Practise this" never sending a skill to a mixed review that only touches it in passing.
import { describe, expect, test } from "bun:test";
import { families } from "../../../content/families.ts";
import { skills } from "../../../content/skills.ts";
import { syllabus } from "../../../content/syllabus.ts";
import { skillGraphFromDefs } from "../lib/content-model.ts";
import { blurbOf, faceLabel, SKILL_BLURBS } from "./blurbs.ts";
import { buildMapGraph } from "./graph.ts";
import { familiesOf, practiseTarget, whatsNext } from "./guide.ts";
import { layoutOak, overlaps } from "./layout.ts";

const labelWidth = (t: string): number =>
  [...t].reduce((w, c) => w + (/[ijltfr.,'\-/ &]/.test(c) ? 0.6 : /[mwMW]/.test(c) ? 1.3 : 1), 0);

const graph = buildMapGraph(skillGraphFromDefs(skills), syllabus);
const layout = layoutOak(graph);
const W5 = skills.filter((s) => /^(U(08|09|10|11)|A1)\.L/.test(s.introducedBy ?? ""));

describe("the U08–U11 strands and the sound branch", () => {
  test("U08–U11 introduce the bass, form, minor and blues leaves; A1.L01–L04 the sound leaves", () => {
    const ids = new Set(W5.map((s) => s.id as string));
    for (const id of [
      "B01",
      "B02",
      "B03",
      "B04",
      "F02",
      "F05",
      "S05",
      "S06",
      "S07",
      "S08",
      "H08",
      "S11",
      "H10",
    ])
      expect(ids.has(id), id).toBe(true);
    for (const id of ["D02", "D03", "D04"]) expect(ids.has(id), id).toBe(true);
  });

  test("every new leaf has a sound-first blurb and a face label that fits the 128 px leaf", () => {
    for (const s of W5) {
      expect(SKILL_BLURBS[s.id]?.what.length ?? 0, s.id).toBeGreaterThan(10);
      expect(blurbOf(s.id, s.name)).not.toBe(`${s.name}.`);
      expect(labelWidth(faceLabel(s.id, s.name)), `${s.id} ${faceLabel(s.id, s.name)}`).toBeLessThanOrEqual(
        14.1,
      );
    }
  });

  test("each unit row holds its leaves, in their strands, without overlap", () => {
    for (const u of ["U08", "U09", "U10", "U11", "A1"]) {
      const row = layout.rows.find((r) => r.unit === u);
      expect(row, u).toBeDefined();
      const nodes = layout.nodes.filter((n) => n.unit === u);
      expect(nodes.length, u).toBeGreaterThan(0);
      for (const n of nodes) {
        expect(n.y, n.id).toBeGreaterThanOrEqual(row?.y ?? 0);
        expect(n.y + n.h, n.id).toBeLessThanOrEqual((row?.y ?? 0) + (row?.h ?? 0));
      }
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++)
          expect(overlaps(nodes[i] as never, nodes[j] as never), `${nodes[i]?.id} ${nodes[j]?.id}`).toBe(
            false,
          );
    }
    const col = (id: string) => layout.byId.get(id)?.region;
    expect(["S05", "S06", "S07", "S08", "S09", "S10", "S11"].map(col)).toEqual(Array(7).fill("keys-scales"));
    expect(["H07", "H08", "H09", "H10"].map(col)).toEqual(Array(4).fill("chords-harmony"));
    expect(["D02", "D03", "D04", "D05"].map(col)).toEqual(Array(4).fill("sound"));
    // The sound branch is track A: its row comes after the core units, never between them.
    const a1 = layout.rows.find((r) => r.unit === "A1");
    expect(a1?.track).toBe("A");
    const u11 = layout.rows.find((r) => r.unit === "U11");
    expect((a1?.y ?? 0) > (u11?.y ?? 0)).toBe(true);
  });

  test("what's next past an unwritten lesson is named and never opened; U11.CP is a checkpoint", () => {
    const authored = new Set(["U11.L05"]);
    const p = whatsNext({ next: "U11.L07" as never }, syllabus, graph, authored);
    expect(p).toMatchObject({ kind: "lesson", written: false, title: "U11.L07 · Shuffle" });
    expect(p.targets).toContain("R13");
    const cp = whatsNext({ next: "U11.CP" as never }, syllabus, graph, authored);
    expect(cp.kind).toBe("checkpoint");
    expect(cp.written).toBe(true);
    const x2 = whatsNext({ next: "X2.S1" as never }, syllabus, graph, authored);
    expect(x2).toMatchObject({ kind: "capstone", title: "X2 · X2 Blues Transcription" });
  });
});

describe("Practise this, honestly", () => {
  const ctx = (live: string[], status: [string, string][] = [], authored: string[] = []) => ({
    families,
    cards: live.map((cardId) => ({ cardId, status: "active" as const })),
    lessonStatus: new Map(status),
    lessonTitle: (id: string) => id,
    authored: new Set(authored),
  });

  test("a mixed review that only touches a skill in passing is not its practice", () => {
    expect(familiesOf("D03", families).map((f) => f.id)).toEqual(["fam.snd.params", "fam.mix.harmony"]);
    // Only the mixed review is in the learner's reviews: the filter skill goes to its lesson, not to Mixed harmony.
    const t = practiseTarget(
      { id: "D03", introducedBy: "A1.L02" },
      ctx(["fam.mix.harmony"], [["A1.L02", "available"]], ["A1.L02"]),
    );
    expect(t).toEqual({ kind: "lesson", lessonId: "A1.L02", title: "A1.L02", completed: false });
    // Its own family, once in the reviews, is the practice.
    expect(
      practiseTarget({ id: "D03", introducedBy: "A1.L02" }, ctx(["fam.snd.params", "fam.mix.harmony"])),
    ).toMatchObject({
      kind: "family",
      familyId: "fam.snd.params",
    });
  });

  test("a skill whose own family joined a mixed review still goes to a family that trains it in earnest", () => {
    const own = familiesOf("E08", families)[0];
    expect(own).toBeDefined();
    const t = practiseTarget({ id: "E08", introducedBy: "U05.L02" }, ctx([own?.id as string]));
    expect(t).toMatchObject({ kind: "family", familyId: own?.id });
  });
});
