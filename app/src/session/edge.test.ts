// The edge of what is written, against the real syllabus: after U04.CP the next item is U05.L01, which has no
// lesson file yet; every surface then says so instead of offering it.
import { describe, expect, test } from "bun:test";
import { syllabus } from "../../../content/syllabus.ts";
import { courseEdge, edgeLead, edgeShort, isWritten, unitTitleOf } from "./edge.ts";

const authored = new Set(
  syllabus.units
    .filter((u) => ["U00", "U01", "U02", "U03", "U04"].includes(u.id))
    .flatMap((u) => u.lessons.map((l) => l.id as string)),
);

describe("the edge of the written course", () => {
  test("written work ahead: no edge", () => {
    expect(courseEdge({ next: "U04.L02" }, syllabus, authored)).toBeNull();
    expect(courseEdge({ next: "U04.CP" }, syllabus, authored)).toBeNull();
    expect(courseEdge(null, syllabus, authored)).toBeNull();
  });

  test("the next lesson has no lesson file: the edge, named by units", () => {
    const edge = courseEdge({ next: "U05.L01" }, syllabus, authored);
    expect(edge?.nextId).toBe("U05.L01");
    expect(edge?.nextUnit?.id).toBe("U05");
    expect(edge?.doneUnit?.id).toBe("U04");
    const lead = edgeLead(edge as NonNullable<typeof edge>);
    expect(lead).toContain(`through ${edge?.doneUnit?.title}`);
    expect(lead).toContain("still being written");
    expect(lead).not.toMatch(/behind|missed|lost|fail/i);
    expect(edgeShort(edge as NonNullable<typeof edge>)).toBe(
      `${edge?.nextUnit?.title} is still being written`,
    );
  });

  test("U04.CP's day: U05.L01 comes first in the order but is not written, and the plan is the checkpoint", () => {
    expect(courseEdge({ next: "U05.L01" }, syllabus, authored, { mapItemId: "U04.CP" })).toBeNull();
    expect(courseEdge({ next: "U05.L01" }, syllabus, authored, { mapItemId: null })?.nextId).toBe("U05.L01");
  });

  test("nothing next at all: the whole course is done", () => {
    const edge = courseEdge({ next: null }, syllabus, authored);
    expect(edge?.nextUnit).toBeNull();
    expect(edgeLead(edge as NonNullable<typeof edge>)).toContain(
      "The rest of the course is still being written.",
    );
  });

  test("checkpoints, capstones and gym slots count as written; lessons only with a file", () => {
    expect(isWritten("U04.CP", authored)).toBe(true);
    expect(isWritten("C2.S1", authored)).toBe(true);
    expect(isWritten("U04.L04", authored)).toBe(true);
    expect(isWritten("U05.L01", authored)).toBe(false);
    expect(unitTitleOf(syllabus, "U05.L04")).toBe(
      syllabus.units.find((u) => u.id === "U05")?.title as string,
    );
  });
});
