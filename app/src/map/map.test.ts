import { describe, expect, test } from "bun:test";
import type { CourseProgress, FamilyDef, SkillState } from "@oak/api";
import { freshness, nodeFreshness } from "@oak/srs";
import { skills } from "../../../content/skills.ts";
import { syllabus } from "../../../content/syllabus.ts";
import { skillGraphFromDefs } from "../lib/content-model.ts";
import { blurbOf, faceLabel, SKILL_BLURBS } from "./blurbs.ts";
import { ancestorsOf, buildMapGraph, unitOfSession } from "./graph.ts";
import { edgeKey, familiesOf, practiseTarget, unitProgress, whatsNext } from "./guide.ts";
import { layoutOak, overlaps } from "./layout.ts";
import { clampView, ensureVisible, fitAll, fitWidth, neighbour, zoomAt } from "./nav.ts";
import { countLeaves, freshnessLabel, leafView } from "./state.ts";

const graph = buildMapGraph(skillGraphFromDefs(skills), syllabus);
const layout = layoutOak(graph);

const state = (id: string, over: Partial<SkillState> = {}): SkillState => ({
  skillId: id as SkillState["skillId"],
  P: 0.5,
  R: null,
  D: 0,
  M: 0,
  level: "available",
  debt: false,
  debtReason: null,
  provisional: false,
  paused: false,
  freshness: 1,
  drying: false,
  updatedAt: "2026-11-11T12:00:00.000Z",
  ...over,
});

describe("graph", () => {
  test("every live skill is on the map, once", () => {
    const live = skills.filter((s) => !s.retired);
    expect(graph.nodes.length).toBe(live.length);
    expect(new Set(graph.nodes.map((n) => n.id)).size).toBe(live.length);
  });

  test("units follow the course: U00, U01, U02 first, tracks after the core", () => {
    const ids = graph.units.map((u) => u.id);
    expect(ids.slice(0, 3)).toEqual(["U00", "U01", "U02"]);
    const firstTrack = ids.findIndex((u) => !u.startsWith("U"));
    expect(ids.slice(firstTrack).every((u) => !u.startsWith("U"))).toBe(true);
  });

  test("session ids map to units", () => {
    expect(unitOfSession("U01.L04")).toBe("U01");
    expect(unitOfSession("U01.CP")).toBe("U01");
    expect(unitOfSession("J1.L02")).toBe("J1");
    expect(unitOfSession("C0.S1")).toBeNull();
    expect(unitOfSession("GYM.01")).toBeNull();
  });

  test("ancestors walk prerequisites transitively", () => {
    const a = ancestorsOf(["R07"], graph.edges);
    expect([...a].sort()).toEqual(["R01", "R03", "R05"]);
  });
});

describe("layout", () => {
  test("no two leaves overlap", () => {
    const n = layout.nodes;
    for (let i = 0; i < n.length; i++)
      for (let j = i + 1; j < n.length; j++) {
        const a = n[i];
        const b = n[j];
        if (a && b && overlaps(a, b)) throw new Error(`${a.id} overlaps ${b.id}`);
      }
  });

  test("leaves sit inside the map and inside their strand column", () => {
    for (const p of layout.nodes) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(layout.width);
      expect(p.y + p.h).toBeLessThanOrEqual(layout.height);
      expect(layout.columns[p.col]?.region).toBe(p.region);
    }
  });

  test("is stable: the same graph in any input order gives the same picture", () => {
    const again = layoutOak(buildMapGraph(skillGraphFromDefs(skills), syllabus));
    const shuffled = layoutOak(buildMapGraph(skillGraphFromDefs([...skills].reverse()), syllabus));
    const pos = (l: typeof layout) => l.nodes.map((p) => `${p.id}@${p.x},${p.y}`).sort();
    expect(pos(again)).toEqual(pos(layout));
    expect(pos(shuffled)).toEqual(pos(layout));
    expect(again.edges.map((e) => e.d)).toEqual(layout.edges.map((e) => e.d));
    expect([layout.width, layout.height]).toEqual([shuffled.width, shuffled.height]);
  });

  test("prerequisites are never below what needs them (the course reads top to bottom)", () => {
    for (const [a, b] of graph.edges) {
      const pa = layout.byId.get(a);
      const pb = layout.byId.get(b);
      if (!pa || !pb) throw new Error(`missing ${a} or ${b}`);
      expect(pa.unitRow).toBeLessThanOrEqual(pb.unitRow);
      if (pa.col === pb.col && pa.unitRow === pb.unitRow) expect(pa.slot).toBeLessThan(pb.slot);
    }
  });

  test("fits a 1280-px window at reading size: the full width at scale ≥ 0.98", () => {
    // 1280 − 56 nav rail − 2 × 24 page padding − 2 border.
    expect(1174 / layout.width).toBeGreaterThanOrEqual(0.98);
  });

  test("cross-strand edges are marked for dashing, same-strand ones are not", () => {
    const e = layout.edges.find((x) => x.from === "R01" && x.to === "E01");
    expect(e?.crossRegion).toBe(true);
    expect(layout.edges.find((x) => x.from === "R01" && x.to === "R02")?.crossRegion).toBe(false);
  });

  test("unit rows do not overlap and keep course order", () => {
    for (let i = 1; i < layout.rows.length; i++) {
      const prev = layout.rows[i - 1];
      const cur = layout.rows[i];
      if (!prev || !cur) continue;
      expect(cur.y).toBeGreaterThan(prev.y + prev.h);
    }
  });
});

describe("keyboard navigation", () => {
  test("down and up stay in the strand", () => {
    expect(neighbour(layout, "R01", "down")).toBe("R02");
    expect(neighbour(layout, "R02", "up")).toBe("R01");
    expect(neighbour(layout, "R01", "up")).toBeNull();
  });

  test("right moves to the nearest leaf in the next strand that has one", () => {
    const r = neighbour(layout, "R01", "right");
    const from = layout.byId.get("R01");
    const to = r ? layout.byId.get(r) : undefined;
    expect(to?.col).toBe((from?.col ?? 0) + 1);
    expect(neighbour(layout, layout.nodes.find((n) => n.col === 0)?.id ?? "", "left")).toBeNull();
  });

  test("every leaf can be reached from R01 with arrows", () => {
    const seen = new Set(["R01"]);
    const queue = ["R01"];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      for (const d of ["up", "down", "left", "right"] as const) {
        const n = neighbour(layout, id, d);
        if (n && !seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(layout.nodes.length);
  });
});

describe("viewport", () => {
  test("fit width keeps reading size and starts at the top", () => {
    const v = fitWidth(layout, 1174, 600);
    expect(v.k).toBeGreaterThanOrEqual(0.98);
    expect(v.ty).toBe(0);
    expect(fitWidth(layout, 3000, 600).k).toBe(1.15);
  });

  test("zoom keeps the point under the cursor still and respects the limits", () => {
    const v = { k: 1, tx: 10, ty: 20 };
    const z = zoomAt(v, 1.5, 300, 200);
    expect((300 - z.tx) / z.k).toBeCloseTo((300 - v.tx) / v.k, 6);
    expect((200 - z.ty) / z.k).toBeCloseTo((200 - v.ty) / v.k, 6);
    expect(zoomAt(v, 100, 0, 0).k).toBe(2);
    expect(zoomAt(v, 0.001, 0, 0).k).toBe(0.1);
  });

  test("fit all shows the whole map", () => {
    const v = fitAll(layout, 1174, 600);
    expect(layout.height * v.k).toBeLessThanOrEqual(600 + 1e-6);
    expect(layout.width * v.k).toBeLessThanOrEqual(1174 + 1e-6);
  });

  test("ensureVisible pans the least and clears the panel", () => {
    const v = { k: 1, tx: 0, ty: 0 };
    const below = ensureVisible(v, { x: 100, y: 900, w: 128, h: 28 }, 1174, 600);
    expect(below.ty).toBe(600 - 24 - 928);
    const right = ensureVisible(v, { x: 1000, y: 10, w: 128, h: 28 }, 1174, 600, 24, 320);
    expect(1000 + 128 + right.tx).toBeLessThanOrEqual(1174 - 320 - 24);
    expect(ensureVisible(v, { x: 100, y: 100, w: 10, h: 10 }, 1174, 600)).toEqual(v);
  });

  test("clamping never loses the map", () => {
    const v = clampView({ k: 1, tx: -99999, ty: 99999 }, layout, 1174, 600);
    expect(v.tx + layout.width).toBeGreaterThan(0);
    expect(v.ty).toBeLessThan(600);
  });
});

describe("shading (contracts §7.10)", () => {
  test("a learner exactly on schedule sees full colour", () => {
    // At its due date a card has R ≈ ρ, so freshness is 1 for every card kind.
    const F = nodeFreshness([
      { retrievability: 0.9, desiredRetention: 0.9, weight: 1 },
      { retrievability: 0.85, desiredRetention: 0.85, weight: 2 },
      { retrievability: 0.86, desiredRetention: 0.9, weight: 1 },
    ]);
    const v = leafView(state("R01", { level: "practiced", freshness: F ?? 0 }));
    expect(v.opacity).toBe(1);
    expect(freshnessLabel(v.freshness)).toBe("On schedule");
  });

  test("fades only when genuinely overdue, to 0.35 at the floor", () => {
    expect(freshness(0.85, 0.9)).toBeCloseTo(1, 9);
    const mid = leafView(state("R01", { level: "learning", freshness: freshness(0.725, 0.9) }));
    expect(mid.opacity).toBeCloseTo(0.35 + 0.65 * 0.5, 6);
    expect(leafView(state("R01", { level: "mastered", freshness: 0 })).opacity).toBe(0.35);
  });

  test("weighted mean, never the minimum", () => {
    const F = nodeFreshness([
      { retrievability: 0.5, desiredRetention: 0.9, weight: 1 },
      { retrievability: 0.9, desiredRetention: 0.9, weight: 2 },
    ]);
    expect(F).toBeCloseTo(2 / 3, 6);
  });

  test("levels map to the five leaf states; untracked leaves are never faded", () => {
    expect(leafView(undefined).status).toBe("locked");
    expect(leafView(state("X", { level: "new", freshness: 0 })).opacity).toBe(1);
    expect(leafView(state("X", { level: "available", freshness: 0 })).opacity).toBe(1);
    expect(leafView(state("X", { level: "learning" })).status).toBe("introduced");
    expect(leafView(state("X", { level: "practiced" })).status).toBe("practising");
    expect(leafView(state("X", { level: "mastered" })).status).toBe("mastered");
  });

  test("drying is drawn only where the server says the cards are in today's warm-up", () => {
    expect(leafView(state("X", { level: "learning", freshness: 0.3, drying: false })).drying).toBe(false);
    expect(leafView(state("X", { level: "learning", freshness: 0.3, drying: true })).drying).toBe(true);
  });

  test("counts", () => {
    const states = new Map([
      ["R01", state("R01", { level: "practiced" })],
      ["R02", state("R02", { level: "mastered" })],
      ["R03", state("R03", { level: "learning", drying: true, freshness: 0.4 })],
    ]);
    const c = countLeaves(["R01", "R02", "R03", "R04"], states);
    expect(c.grown).toBe(2);
    expect(c.drying).toBe(1);
    expect(c.byStatus.locked).toBe(1);
  });
});

describe("what's next", () => {
  test("a lesson highlights what it introduces and the prerequisites feeding it", () => {
    const p = whatsNext({ next: "U01.L04" } as Pick<CourseProgress, "next">, syllabus, graph);
    expect(p.kind).toBe("lesson");
    expect(p.targets).toContain("R05");
    expect(p.feeders).toContain("R03");
    expect(p.edges.has(edgeKey("R03", "R05"))).toBe(true);
    expect(p.title.startsWith("U01.L04 · ")).toBe(true);
  });

  test("a checkpoint highlights what it tests; a capstone what the checkpoint before it tested", () => {
    const cp = whatsNext({ next: "U01.CP" }, syllabus, graph);
    expect(cp.kind).toBe("checkpoint");
    expect(cp.targets).toContain("R01");
    const cap = whatsNext({ next: "C0.S1" }, syllabus, graph);
    expect(cap.kind).toBe("capstone");
    expect(cap.targets.sort()).toEqual(cp.targets.sort());
  });

  test("nothing next, nothing highlighted", () => {
    expect(whatsNext({ next: null }, syllabus, graph).targets).toEqual([]);
    expect(whatsNext(undefined, syllabus, graph).sessionId).toBeNull();
  });
});

describe("practise this", () => {
  const fam = (id: string, skill: string, w = 1) =>
    ({ id, title: id, skills: [{ skill, w }] }) as unknown as FamilyDef;
  const families = [fam("fam.x.a", "R01", 0.5), fam("fam.x.b", "R01", 1), fam("fam.x.c", "R01/cat", 0.2)];
  const ctx = (cards: { cardId: string; status: "active" | "deferred" }[], status: [string, string][]) => ({
    families,
    cards,
    lessonStatus: new Map(status),
    lessonTitle: (id: string) => `Lesson ${id}`,
  });

  test("families are ordered by weight and match categories", () => {
    expect(familiesOf("R01", families).map((f) => f.id)).toEqual(["fam.x.b", "fam.x.a", "fam.x.c"]);
  });

  test("goes to the strongest family the learner has a live card for", () => {
    const t = practiseTarget(
      { id: "R01", introducedBy: "U01.L01" },
      ctx(
        [
          { cardId: "fam.x.b", status: "deferred" },
          { cardId: "fam.x.a", status: "active" },
        ],
        [],
      ),
    );
    expect(t).toEqual({ kind: "family", familyId: "fam.x.a", title: "fam.x.a" });
  });

  test("falls back to the open lesson, then to a locked note", () => {
    const open = practiseTarget({ id: "R01", introducedBy: "U01.L01" }, ctx([], [["U01.L01", "completed"]]));
    expect(open).toEqual({ kind: "lesson", lessonId: "U01.L01", title: "Lesson U01.L01", completed: true });
    const locked = practiseTarget({ id: "R01", introducedBy: "U01.L01" }, ctx([], []));
    expect(locked.kind).toBe("locked");
  });
});

describe("blurbs", () => {
  test("every skill has one calm sentence and a face label that fits", () => {
    for (const s of skills) {
      const b = SKILL_BLURBS[s.id];
      expect(b, s.id).toBeDefined();
      const what = blurbOf(s.id, s.name);
      expect(what.endsWith("."), s.id).toBe(true);
      expect(what.split(/\s+/).length, s.id).toBeLessThanOrEqual(24);
      expect(/[!]/.test(what), s.id).toBe(false);
      expect(faceLabel(s.id, s.name).length, s.id).toBeLessThanOrEqual(18);
    }
  });
});

describe("unit progress", () => {
  test("counts completed core lessons and marks the unit of the next item", () => {
    const p = unitProgress(
      syllabus,
      new Map([
        ["U01.L01", "completed"],
        ["U01.L02", "in_progress"],
      ]),
      "U01.L02",
    );
    const u01 = p.get("U01");
    expect(u01?.done).toBe(1);
    expect(u01?.current).toBe(true);
    expect(p.get("U02")?.current).toBe(false);
    // Capstone sessions belong to no unit.
    expect([...unitProgress(syllabus, new Map(), "C0.S1").values()].some((x) => x.current)).toBe(false);
  });
});

describe("thumbnail", () => {
  test("every leaf is a dot, no dots overlap, and it stays card-sized", async () => {
    const { glanceLayout } = await import("./glance.ts");
    for (const w of [180, 240]) {
      const g = glanceLayout(graph, w);
      expect(g.dots.length).toBe(graph.nodes.length);
      expect(g.height).toBeLessThanOrEqual(w * 1.1);
      for (let i = 0; i < g.dots.length; i++)
        for (let j = i + 1; j < g.dots.length; j++) {
          const a = g.dots[i];
          const b = g.dots[j];
          if (a && b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r);
        }
      for (const d of g.dots) {
        expect(d.x + d.r).toBeLessThanOrEqual(w);
        expect(d.y + d.r).toBeLessThanOrEqual(g.height);
      }
      expect(glanceLayout(graph, w)).toEqual(g);
    }
  });
});

describe("leaves table", () => {
  test("sorts by any column, empties last, ties in course order", async () => {
    const { leafRows, sortLeaves } = await import("./leaves.ts");
    const states = new Map([
      ["R02", state("R02", { level: "practiced", M: 0.8, R: 0.9, freshness: 1 })],
      ["R03", state("R03", { level: "learning", M: 0.4, R: 0.7, freshness: 0.5 })],
    ]);
    const rows = leafRows(graph.nodes, states);
    const regions = graph.regions as string[];
    const units = graph.units.map((u) => u.id);
    const byStrength = sortLeaves(rows, "strength", "desc", regions, units);
    expect(byStrength.slice(0, 2).map((r) => r.node.id)).toEqual(["R02", "R03"]);
    expect(byStrength.at(-1)?.strength).toBeNull();
    const asc = sortLeaves(rows, "strength", "asc", regions, units);
    expect(asc.slice(0, 2).map((r) => r.node.id)).toEqual(["R03", "R02"]);
    expect(sortLeaves(rows, "course", "asc", regions, units).map((r) => r.node.id)).toEqual(
      graph.nodes.map((n) => n.id),
    );
    const byStatus = sortLeaves(rows, "status", "desc", regions, units);
    expect(byStatus[0]?.node.id).toBe("R02");
  });
});
