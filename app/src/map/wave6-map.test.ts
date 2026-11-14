// The Oak for Wave 6: the seventh-chord, rhythm, mode and chromatic strands as U12–U17 light them up (every new leaf
// has a plain blurb and a face label that fits; each unit row holds its leaves without overlap; "what's next" says
// whether the next lesson grows a new leaf or deepens one that exists, since 18 of the 33 lessons deepen), and the
// advanced tracks as open branches: their unit rows sit after the core's, and a row behind an open gate is one the
// map can name as open.
import { describe, expect, test } from "bun:test";
import { TRACK_GATES } from "@oak/api";
import { skills } from "../../../content/skills.ts";
import { syllabus } from "../../../content/syllabus.ts";
import { skillGraphFromDefs } from "../lib/content-model.ts";
import { deriveTracks, trackOfUnit, trackRows } from "../session/tracks-model.ts";
import { blurbOf, faceLabel } from "./blurbs.ts";
import { buildMapGraph } from "./graph.ts";
import { whatsNext } from "./guide.ts";
import { layoutOak, overlaps } from "./layout.ts";

const labelWidth = (t: string): number =>
  [...t].reduce((w, c) => w + (/[ijltfr.,'\-/ &]/.test(c) ? 0.6 : /[mwMW]/.test(c) ? 1.3 : 1), 0);

const graph = buildMapGraph(skillGraphFromDefs(skills), syllabus);
const layout = layoutOak(graph);
const W6 = skills.filter((s) => /^U1[2-7]\.L/.test(s.introducedBy ?? ""));
const lessons = syllabus.units.filter((u) => /^U1[2-7]$/.test(u.id)).flatMap((u) => u.lessons);

describe("the U12–U17 strands", () => {
  test("the leaves U12–U17 grow: sevenths, rhythm II, modes, chromatic harmony, modulation, and their ears", () => {
    const ids = new Set(W6.map((s) => s.id as string));
    for (const id of [
      "C07",
      "C08",
      "E11",
      "I04",
      "R09",
      "R10",
      "R11",
      "R12",
      "N08",
      "N09",
      "E14",
      "S12",
      "S13",
      "H11",
      "E12a",
      "H12",
      "H13",
      "E12b",
      "H14",
      "E13",
    ])
      expect(ids.has(id), id).toBe(true);
  });

  test("every one has a plain sentence and a face label that fits a 128 px leaf", () => {
    for (const s of W6) {
      const what = blurbOf(s.id, s.name);
      expect(what.length, s.id).toBeGreaterThan(20);
      expect(what, s.id).toMatch(/\.$/);
      expect(what, s.id).not.toMatch(/!/);
      const label = faceLabel(s.id, s.name);
      expect(label.length, `${s.id} ${label}`).toBeLessThanOrEqual(17);
      expect(labelWidth(label), `${s.id} ${label}`).toBeLessThanOrEqual(16);
    }
  });

  test("each strand lights up in its own column: rhythm in Groove, modes in Keys & Scales, colour chords in Chords & Harmony", () => {
    const region = (id: string) => graph.nodes.find((n) => n.id === id)?.region;
    for (const id of ["R09", "R10", "R11", "R12"]) expect(region(id), id).toBe("groove");
    for (const id of ["S12", "S13"]) expect(region(id), id).toBe("keys-scales");
    for (const id of ["C07", "C08", "H11", "H12", "H13", "H14"])
      expect(region(id), id).toBe("chords-harmony");
    for (const id of ["E11", "E12a", "E12b", "E13", "E14"]) expect(region(id), id).toBe("ears-voice");
  });

  test("the six unit rows hold their leaves without overlap, in course order", () => {
    const rows = ["U12", "U13", "U14", "U15", "U16", "U17"].map((u) => layout.rows.find((r) => r.unit === u));
    for (const r of rows) expect(r).toBeDefined();
    const ys = rows.map((r) => r?.y ?? 0);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    const placed = layout.nodes.filter((n) => /^U1[2-7]$/.test(n.unit));
    expect(placed.length).toBe(W6.length);
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++)
        expect(overlaps(placed[i] as never, placed[j] as never), `${placed[i]?.id} ${placed[j]?.id}`).toBe(
          false,
        );
  });

  test("'what's next' says whether the lesson grows a new leaf or deepens one that exists", () => {
    const grows = lessons.filter((l) => l.introduces.length > 0).map((l) => l.id as string);
    const deepens = lessons.filter((l) => l.introduces.length === 0).map((l) => l.id as string);
    expect(grows.length + deepens.length).toBe(33);
    // The long stretch: U15.L03–L06 and U16.L02–L04 all work on a leaf that is already there.
    for (const id of ["U15.L03", "U15.L04", "U15.L05", "U15.L06", "U16.L02", "U16.L03", "U16.L04"])
      expect(deepens, id).toContain(id);
    for (const id of grows) {
      const n = whatsNext({ next: id as never }, syllabus, graph);
      expect(n.kind).toBe("lesson");
      expect(n.grows, id).toBe(true);
      expect(n.targets.length, id).toBeGreaterThan(0);
    }
    for (const id of deepens) {
      const n = whatsNext({ next: id as never }, syllabus, graph);
      expect(n.grows, id).toBe(false);
      // It still points at the leaves it works on: the path is never empty for a lesson of the long stretch.
      expect(n.targets.length, id).toBeGreaterThan(0);
    }
    expect(whatsNext({ next: "U15.L03" as never }, syllabus, graph).targets).toEqual(["H12"]);
    // A checkpoint or a capstone session checks leaves; it grows none.
    expect(whatsNext({ next: "U17.CP" as never }, syllabus, graph).grows).toBe(false);
    expect(whatsNext({ next: "C7.S1" as never }, syllabus, graph).grows).toBe(false);
    expect(whatsNext({ next: null }, syllabus, graph).grows).toBe(false);
  });
});

describe("the tracks as branches on the map", () => {
  test("every track unit's row comes after the last core row, so the core reads top to bottom first", () => {
    const coreMax = Math.max(...layout.rows.filter((r) => r.track === "core").map((r) => r.y));
    const trackRowsOnMap = layout.rows.filter((r) => r.track !== "core");
    expect(trackRowsOnMap.length).toBeGreaterThan(5);
    for (const r of trackRowsOnMap) {
      expect(r.y, r.unit).toBeGreaterThan(coreMax);
      expect(trackOfUnit(r.unit), r.unit).toBe(r.track as never);
    }
  });

  test("the units a met gate opens are rows of the map; after U13.CP they are J1–J3 and R1–R3", () => {
    const units = new Set(graph.units.map((u) => u.id));
    for (const g of TRACK_GATES.filter((x) => x.trackId !== "A"))
      for (const u of g.units) expect(units.has(u), `${g.gateId} ${u}`).toBe(true);
    const rows = trackRows(
      deriveTracks(
        { lessons: [], checkpoints: [{ cpId: "U13.CP", status: "passed" }] } as never,
        new Set<string>(),
      ),
    );
    const open = new Map(
      rows.filter((r) => r.open).flatMap((r) => r.openUnits.map((u) => [u, r.trackId] as const)),
    );
    expect([...open.keys()].sort()).toEqual(["J1", "J2", "J3", "R1", "R2", "R3"]);
    // Each open unit has leaves to show as an open branch.
    for (const u of open.keys())
      expect(
        layout.nodes.some((n) => n.unit === u),
        u,
      ).toBe(true);
    // Before the checkpoint nothing of J or R is open.
    const before = trackRows(deriveTracks({ lessons: [], checkpoints: [] } as never, new Set<string>()));
    expect(before.filter((r) => r.open).map((r) => r.trackId)).toEqual([]);
  });
});
