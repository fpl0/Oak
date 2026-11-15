import { describe, expect, test } from "bun:test";
import { capstones } from "../../../../content/capstones.ts";
import { OAK_ANCHORS, OAK_CAPSTONE_UNITS } from "../../../../content/oak.layout.ts";
import { skills } from "../../../../content/skills.ts";
import { REGION_ORDER } from "../../lib/content-model.ts";
import type { MapGraph } from "../graph.ts";
import { overlaps } from "../layout.ts";
import { fixtureGraph } from "./fixtures.ts";
import { layoutIllustratedOak } from "./layout.ts";
import { treeNeighbour } from "./navigation.ts";

const layout = layoutIllustratedOak(fixtureGraph);
const directions = ["up", "down", "left", "right"] as const;

describe("authored oak geometry", () => {
  test("every registered skill, including all advanced and unwritten units, has exactly one place", () => {
    expect(layout.nodes.map((n) => n.id).sort()).toEqual(
      skills
        .filter((s) => !s.retired)
        .map((s) => s.id)
        .sort(),
    );
    expect(layout.nodes).toHaveLength(143);
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.x + n.w).toBeLessThanOrEqual(1600);
      expect(n.y + n.h).toBeLessThanOrEqual(1000);
      expect(n.limb).toBe(OAK_ANCHORS[n.unit]?.limb);
      expect(n.stem).toStartWith("M");
    }
  });
  test("no rotated leaf or mastery ring overlaps another at zoom one", () => {
    for (let i = 0; i < layout.nodes.length; i++)
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        if (a && b) expect(overlaps(a, b), `${a.id} / ${b.id}`).toBe(false);
      }
  });
  test("deterministic under repeated calls and arbitrary input ordering", () => {
    expect(layoutIllustratedOak(fixtureGraph)).toEqual(layout);
    expect(
      layoutIllustratedOak({
        ...fixtureGraph,
        nodes: [...fixtureGraph.nodes].reverse(),
        units: [...fixtureGraph.units].reverse(),
        regions: [...fixtureGraph.regions].reverse(),
        edges: [...fixtureGraph.edges].reverse(),
      }),
    ).toEqual(layout);
  });
  test("appending each later unit leaves every existing position untouched", () => {
    const partial: MapGraph = { nodes: [], edges: [], units: [], regions: fixtureGraph.regions };
    for (const unit of fixtureGraph.units) {
      const before = layoutIllustratedOak(partial);
      partial.nodes.push(...fixtureGraph.nodes.filter((n) => n.unit === unit.id));
      partial.units.push(unit);
      const after = layoutIllustratedOak(partial);
      for (const leaf of before.nodes) expect(after.byId.get(leaf.id)).toEqual(leaf);
    }
  });
  test("unknown future units request an explicit anchor instead of silently moving the tree", () => {
    expect(() =>
      layoutIllustratedOak({
        ...fixtureGraph,
        nodes: fixtureGraph.nodes.slice(0, 1).map((n) => ({ ...n, unit: "U18" })),
      }),
    ).toThrow("authored anchor for unit U18");
  });
  test("regions retain contract order; each region owns its twigs", () => {
    expect(layout.regions).toEqual(REGION_ORDER.filter((r) => r !== "other"));
    for (const region of layout.regions)
      expect(layout.nodes.filter((n) => n.region === region).every((n) => n.stem.length > 0)).toBe(true);
  });
  test("prerequisites advance outwards along a unit sprig, with solid internal and dashed cross-region connections", () => {
    for (const e of layout.edges) {
      const from = layout.byId.get(e.from);
      const to = layout.byId.get(e.to);
      if (!from || !to) throw new Error("Missing prerequisite endpoint");
      expect(from.rank).toBeLessThan(to.rank);
      if (from.unit === to.unit) expect(from.slot).toBeLessThan(to.slot);
      expect(e.crossRegion).toBe(from.region !== to.region);
    }
  });
  test("every capstone has an authored attachment, including track and final projects", () => {
    expect(Object.keys(OAK_CAPSTONE_UNITS).sort()).toEqual(capstones.map((c) => c.id).sort());
    expect(layout.acorns).toHaveLength(capstones.length);
    expect(layout.acorns.find((a) => a.capstoneId === "X2")?.unit).toBe("U11");
    expect(layout.acorns.find((a) => a.capstoneId === "AC2")?.unit).toBe("A2");
    const boxes = layout.acorns.map((a) => ({ x: a.x - 16, y: a.y - 12, w: 32, h: 32 }));
    for (const [index, box] of boxes.entries()) {
      expect(layout.nodes.some((n) => overlaps(box, n))).toBe(false);
      expect(boxes.slice(index + 1).some((b) => overlaps(box, b))).toBe(false);
    }
  });
});

describe("navigation in the tree", () => {
  test("every leaf can reach every other leaf with arrows", () => {
    for (const start of layout.nodes) {
      const seen = new Set([start.id]);
      const queue = [start.id];
      while (queue.length) {
        const id = queue.shift();
        if (!id) break;
        for (const direction of directions) {
          const next = treeNeighbour(layout, id, direction);
          if (next && !seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      expect(seen.size, start.id).toBe(layout.nodes.length);
    }
  });
  test("arrows select the nearest leaf in their cone; isolated aligned pairs are reversible", () => {
    let reversible = 0;
    for (const n of layout.nodes) {
      const leftId = treeNeighbour(layout, n.id, "left");
      if (!leftId) continue;
      const left = layout.byId.get(leftId);
      if (!left) throw new Error("Missing neighbour");
      const distance = (n.cx - left.cx) ** 2 + (n.cy - left.cy) ** 2;
      const closerOnReturn = layout.nodes.some(
        (p) =>
          p.cx > left.cx &&
          Math.abs(p.cy - left.cy) <= p.cx - left.cx &&
          (p.cx - left.cx) ** 2 + (p.cy - left.cy) ** 2 < distance,
      );
      if (!closerOnReturn) {
        expect(treeNeighbour(layout, left.id, "right")).toBe(n.id);
        reversible++;
      }
    }
    expect(reversible).toBeGreaterThan(30);
  });
});

describe("B-sides on the ground (promoted sketches without a capstone)", () => {
  test("twelve places under the ground line, clear of every leaf and acorn, stable as the graph grows", () => {
    expect(layout.fallen).toHaveLength(12);
    const boxes = layout.fallen.map((a) => ({ x: a.x - 14, y: a.y - 14, w: 28, h: 28 }));
    const acorns = layout.acorns.map((a) => ({ x: a.x - 16, y: a.y - 12, w: 32, h: 32 }));
    for (const [i, box] of boxes.entries()) {
      expect(layout.fallen[i]?.y).toBeGreaterThan(700);
      expect(layout.nodes.some((n) => overlaps(box, n))).toBe(false);
      expect(acorns.some((a) => overlaps(box, a))).toBe(false);
      expect(boxes.slice(i + 1).some((b) => overlaps(box, b))).toBe(false);
    }
    // Nearest the trunk first.
    const d = layout.fallen.map((a) => Math.abs(a.x - 805));
    expect(d[0]).toBeLessThanOrEqual(d.at(-1) ?? 0);
    expect(layoutIllustratedOak(fixtureGraph).fallen).toEqual(layout.fallen);
  });
});
