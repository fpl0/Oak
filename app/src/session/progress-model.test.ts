import { describe, expect, test } from "bun:test";
import { milestones } from "../../../content/milestones.ts";
import { ledger, ledgerCounts, milestonesReached, milestoneTimeline } from "./progress-model.ts";

const rows = milestones.map((m) => ({
  id: m.id,
  title: m.title,
  description: m.description,
  reachedAt: null as string | null,
}));

describe("milestones (ux §5.5, defined in content)", () => {
  test("nothing reached: the first one is next, the rest are later", () => {
    const t = milestoneTimeline(rows);
    expect(t.reached).toEqual([]);
    expect(t.next?.id).toBe("ms.01");
    expect(t.next?.title).toBe("You can make a beat.");
    expect(t.ahead).toHaveLength(milestones.length - 1);
  });

  test("C0 and C1 released: both reached in date order; the next is the first one still open", () => {
    const r = rows.map((m) =>
      m.id === "ms.02"
        ? { ...m, reachedAt: "2026-11-09T10:00:00.000Z" }
        : m.id === "ms.01"
          ? { ...m, reachedAt: "2026-10-30T10:00:00.000Z" }
          : m,
    );
    const t = milestoneTimeline(r);
    expect(t.reached.map((m) => m.id)).toEqual(["ms.01", "ms.02"]);
    expect(t.next?.id).toBe("ms.03");
  });

  test("the Coda banner: only milestones reached since the session started", () => {
    const r = rows.map((m) =>
      m.id === "ms.02"
        ? { ...m, reachedAt: "2026-11-11T09:20:00.000Z" }
        : m.id === "ms.01"
          ? { ...m, reachedAt: "2026-10-30T10:00:00.000Z" }
          : m,
    );
    expect(milestonesReached(r, "2026-11-11T09:00:00.000Z").map((m) => m.id)).toEqual(["ms.02"]);
    expect(milestonesReached(r, "2026-11-12T09:00:00.000Z")).toEqual([]);
  });
});

describe("ledger counts are honest", () => {
  test("shown = any evidence (fading included); solid = solid or strong now", () => {
    const at = (d: number) => `2026-11-0${d}T10:00:00.000Z`;
    const entry = (candoId: string, status: "emerging" | "solid" | "strong" | "fading", d: number) => ({
      candoId: candoId as never,
      status,
      evidenceKind: "lesson" as const,
      evidenceId: "U01.L01",
      at: at(d),
    });
    const l = ledger([
      entry("a", "emerging", 1),
      entry("a", "solid", 3),
      entry("b", "fading", 2),
      entry("c", "strong", 2),
    ]);
    expect(l.get("a")?.latest.status).toBe("solid");
    expect(l.get("a")?.firstAt).toBe(at(1));
    expect(ledgerCounts([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], l)).toEqual({
      total: 4,
      shown: 3,
      solid: 2,
    });
  });
});
