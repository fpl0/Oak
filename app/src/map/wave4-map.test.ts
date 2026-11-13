// The Oak for Wave 4: the chord, harmony and melody strands as U05–U07 light them up (every new leaf has a plain
// blurb and a face label that fits, the unit rows stack without overlap), X1's sessions as the next item, and
// drill families shown honestly — graduated into a mixed review, resting there, or a mixed review holding them.
import { describe, expect, test } from "bun:test";
import type { FamilyDef, FamilyState } from "@oak/api";
import { families } from "../../../content/families.ts";
import { skills } from "../../../content/skills.ts";
import { syllabus } from "../../../content/syllabus.ts";
import { skillGraphFromDefs } from "../lib/content-model.ts";
import { faceLabel, SKILL_BLURBS } from "./blurbs.ts";
import { familyStatus, isComposite } from "./family-status.ts";
import { buildMapGraph } from "./graph.ts";
import { familiesOf, whatsNext } from "./guide.ts";
import { layoutOak, overlaps } from "./layout.ts";

/** A rough width of a label in average letters: narrow glyphs count 0.6, m and w 1.3. */
const labelWidth = (t: string): number =>
  [...t].reduce((w, c) => w + (/[ijltfr.,'\-/ &]/.test(c) ? 0.6 : /[mwMW]/.test(c) ? 1.3 : 1), 0);

const graph = buildMapGraph(skillGraphFromDefs(skills), syllabus);
const layout = layoutOak(graph);
const W4 = skills.filter((s) => /^U0[5-7]\./.test(s.introducedBy ?? ""));

describe("the U05–U07 strands", () => {
  test("U05–U07 introduce the chords, harmony and melody leaves", () => {
    const ids = W4.map((s) => s.id);
    for (const id of [
      "C01",
      "C02",
      "C03",
      "C04",
      "C05",
      "H01",
      "H02",
      "H03",
      "H04",
      "H06",
      "M02",
      "M03",
      "M10",
      "E08",
      "E09",
    ])
      expect(ids, id).toContain(id);
  });

  test("every new leaf has a plain blurb and a face label that fits the 128 px leaf", () => {
    for (const s of W4) {
      expect(SKILL_BLURBS[s.id]?.what.length ?? 0, s.id).toBeGreaterThan(10);
      // What the 128 px leaf holds next to its icon, in rough letter widths ("Four-chord songs", 14.4,
      // overflowed it; "Phrase & section", 14.0, fits).
      expect(labelWidth(faceLabel(s.id, s.name)), s.id).toBeLessThanOrEqual(14.1);
    }
  });

  test("their unit rows hold every new leaf, in its strand, without overlap", () => {
    for (const u of ["U05", "U06", "U07"]) {
      const row = layout.rows.find((r) => r.unit === u);
      expect(row, u).toBeDefined();
      const nodes = layout.nodes.filter((n) => n.unit === u);
      for (const n of nodes) {
        expect(n.y).toBeGreaterThanOrEqual(row?.y ?? 0);
        expect(n.y + n.h).toBeLessThanOrEqual((row?.y ?? 0) + (row?.h ?? 0));
      }
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++)
          expect(overlaps(nodes[i] as never, nodes[j] as never), `${nodes[i]?.id} ${nodes[j]?.id}`).toBe(
            false,
          );
    }
    // U06's harmony leaves sit in the Chords & Harmony strand, U07's melody leaves in Melody & Form.
    const col = (id: string) => layout.byId.get(id)?.region;
    expect(["H01", "H02", "H03", "H04", "H06"].map(col)).toEqual(Array(5).fill("chords-harmony"));
    expect(["M02", "M03", "M10"].map(col)).toEqual(Array(3).fill("melody-form"));
  });

  test("X1's sessions are the next item by their capstone (not the raw session id)", () => {
    const p = whatsNext({ next: "X1.S1" as never }, syllabus, graph);
    expect(p.kind).toBe("capstone");
    expect(p.title).toBe("X1 · X1 Folk Transcription");
    const cp = whatsNext({ next: "U07.CP" as never }, syllabus, graph);
    expect(p.targets.sort()).toEqual(cp.targets.sort());
    expect(whatsNext({ next: "C2.S2" as never }, syllabus, graph).title).toBe("C2 · C2 Four-Chord Song");
  });
});

describe("families, honestly", () => {
  const def = (id: string) => families.find((f) => f.id === id) as FamilyDef;
  const fstate = (id: string, over: Partial<FamilyState> = {}): FamilyState => ({
    familyId: id as FamilyState["familyId"],
    level: 1,
    promoDay: null,
    categoryStats: {},
    confusion: {},
    blockedRemaining: 0,
    compositeId: null,
    graduatedAt: null,
    openCategories: [],
    maxOpenLevel: 1,
    restingSince: null,
    ...over,
  });
  const quality = def("fam.chd.quality-triad");
  const mix = def("fam.mix.harmony");
  const lessonStatus = new Map([["U05.L02", "completed"]]);

  test("the harmony composite is the mixed review the triad-quality family joins", () => {
    expect(isComposite(mix)).toBe(true);
    expect(quality.mix).toBe("harmony");
    expect(familiesOf("E08", families).map((f) => f.id)).toContain("fam.chd.quality-triad");
  });

  test("active, graduated, resting: never 'mastered', never lost", () => {
    const base = { states: new Map<string, FamilyState>(), lessonStatus };
    expect(familyStatus(quality, { ...base, card: "active", state: fstate(quality.id) }).text).toBe(
      "in your reviews",
    );
    const graduated = fstate(quality.id, {
      level: quality.masteryLevel,
      graduatedAt: "2026-11-01T10:00:00.000Z",
      compositeId: "fam.mix.harmony" as never,
    });
    expect(familyStatus(quality, { ...base, card: "graduated", state: graduated })).toMatchObject({
      kind: "graduated",
      text: "graduated into mixed practice",
    });
    const resting = { ...graduated, level: 1, restingSince: "2026-11-02" };
    const st = familyStatus(quality, { ...base, card: "graduated", state: resting });
    expect(st).toMatchObject({ kind: "resting", text: "resting in mixed practice" });
    expect(st.help).toContain("returns to its own sets");
    // Graduated below its mastery level (a gated ladder; the "C2 released" seed's melodic dictation at 3 of 5):
    // in mixed practice for now, never "solid".
    const dictation = def("fam.mel.dictation");
    const below = fstate(dictation.id, {
      level: 3,
      graduatedAt: "2026-10-01T10:00:00.000Z",
      compositeId: "fam.mix.pitch" as never,
    });
    const b = familyStatus(dictation, { ...base, card: "graduated", state: below });
    expect(b).toMatchObject({ kind: "resting", text: "in mixed practice for now" });
    expect(b.help).toContain(`below level ${dictation.masteryLevel} where it counts as mastered`);
  });

  test("a mixed review says how many families it holds now, graduated and resting", () => {
    const states = new Map<string, FamilyState>([
      [
        "fam.chd.quality-triad",
        fstate("fam.chd.quality-triad", {
          graduatedAt: "x",
          compositeId: "fam.mix.harmony" as never,
          level: 9,
        }),
      ],
      [
        "fam.har.bass",
        fstate("fam.har.bass", {
          graduatedAt: "x",
          compositeId: "fam.mix.harmony" as never,
          restingSince: "2026-11-02",
        }),
      ],
    ]);
    const st = familyStatus(mix, { card: "active", state: undefined, states, lessonStatus });
    expect(st).toMatchObject({ kind: "mixed", text: "mixed review of 2 families" });
    expect(st.help).toContain("1 graduated, 1 resting");
    expect(
      familyStatus(mix, { card: "active", state: undefined, states: new Map(), lessonStatus }).text,
    ).toBe("in your reviews");
  });

  test("a family whose lesson is not open says which lesson opens it", () => {
    const fam = def("fam.har.cadence");
    const st = familyStatus(fam, { card: undefined, state: undefined, states: new Map(), lessonStatus });
    expect(st).toMatchObject({ kind: "locked", text: `opens with ${fam.unlock.lesson}` });
  });
});
