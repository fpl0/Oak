import { describe, expect, test } from "bun:test";
import { milestones } from "../../../content/milestones.ts";
import {
  albumStripSlotsAB,
  ledger,
  ledgerCounts,
  milestonesReached,
  milestoneTimeline,
} from "./progress-model.ts";

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

describe("Wave 7: the album strip goes on with Side B once Side A is complete", () => {
  const ids = ["C0", "C1", "C2", "X1", "C3", "C4", "C5", "X2", "C6", "C7", "CF-T", "CF-A"];
  const b = ["JC1", "JC2", "JC3", "JC4", "RC1", "RC2", "AC1", "AC2"];
  const caps = [...ids, ...b].map((id) => ({ id }));
  const order = [...ids.map((id) => `${id}.S1`)];
  test("Side A unfinished, or Side B not begun: Side A as before; then released Side B in release order, then the next", () => {
    expect(albumStripSlotsAB(caps, order, new Set(["C0"]), new Map(), b, 3).map((c) => c.id)).toEqual([
      "C0",
      "C1",
      "C2",
    ]);
    const released = new Set([...ids, "RC1", "JC1"]);
    const at = new Map([
      ["RC1", "2027-01-02T00:00:00Z"],
      ["JC1", "2027-02-01T00:00:00Z"],
    ]);
    expect(albumStripSlotsAB(caps, order, released, at, b, 3).map((c) => c.id)).toEqual([
      "RC1",
      "JC1",
      "JC2",
    ]);
    // Side A complete, nothing on Side B yet: the record's last tracks, never three empty optional slots.
    expect(albumStripSlotsAB(caps, order, new Set(ids), new Map(), b, 3).map((c) => c.id)).toEqual([
      "C7",
      "CF-T",
      "CF-A",
    ]);
  });
});
