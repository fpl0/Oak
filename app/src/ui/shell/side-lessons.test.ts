import { describe, expect, test } from "bun:test";
import type { SideLessons } from "@oak/api";
import type { SyllabusDef, ToolEntry } from "@oak/content-kit";
import { syllabus } from "../../../../content/syllabus.ts";
import { toolbox } from "../../../../content/toolbox.ts";
import { type SideLessonContext, sideLessonHint } from "./side-lessons.ts";

const S = syllabus as unknown as SyllabusDef;
const T = toolbox as unknown as ToolEntry[];
const gate = S.units.flatMap((u) => u.lessons).find((l) => l.id === "U03.L02")?.title as string;
const sites = (t: ToolEntry) => (Array.isArray(t.unlock.at) ? t.unlock.at : [t.unlock.at]);
const rowsAt = (id: string) => T.filter((t) => sites(t).includes(id)).map((t) => t.id as string);
const ctx = (over: Partial<SideLessonContext> = {}): SideLessonContext => ({
  state: undefined,
  unlocked: new Set(),
  ready: true,
  toolbox: T,
  syllabus: S,
  ...over,
});
const state = (status: "locked" | "open" | "in_progress" | "done"): SideLessons => ({
  open: status !== "locked",
  next: status === "open" ? "A1.L01" : null,
  items: [{ lessonId: "A1.L01", title: "Waves & Harmonics", status, estMinutes: 14.6, completedAt: null }],
});

describe("side lessons in the palette", () => {
  test("a core lesson has no hint", () => {
    expect(sideLessonHint("U03.L02", false, ctx())).toBeNull();
  });
  test("A1.L01–L04 are side lessons in the syllabus, and U03.L02 grants toolbox rows (the gate's proxy)", () => {
    const a1 = S.units.find((u) => u.id === "A1");
    expect(a1?.lessons.slice(0, 4).every((l) => l.side === true)).toBe(true);
    expect(rowsAt("U03.L02").length).toBeGreaterThan(0);
  });
  test("the server's answer wins: each state reads calmly; locked names the gate lesson", () => {
    expect(sideLessonHint("A1.L01", true, ctx({ state: state("locked") }))).toBe(
      `Side lesson · opens after ${gate}`,
    );
    expect(sideLessonHint("A1.L01", true, ctx({ state: state("open") }))).toBe(
      "Optional side lesson · about 15 min",
    );
    expect(sideLessonHint("A1.L01", true, ctx({ state: state("in_progress") }))).toBe(
      "Side lesson · in progress",
    );
    expect(sideLessonHint("A1.L01", true, ctx({ state: state("done") }))).toBe("Side lesson · done");
  });
  test("without it, the unlock list says: before the gate, after it, and done", () => {
    expect(sideLessonHint("A1.L01", true, ctx())).toBe(`Side lesson · opens after ${gate}`);
    const afterGate = new Set(rowsAt("U03.L02"));
    expect(sideLessonHint("A1.L01", true, ctx({ unlocked: afterGate }))).toBe("Optional side lesson");
    const own = T.filter((t) => sites(t).length === 1 && sites(t)[0] === "A1.L01").map((t) => t.id as string);
    expect(own.length).toBeGreaterThan(0);
    expect(sideLessonHint("A1.L01", true, ctx({ unlocked: new Set([...afterGate, ...own]) }))).toBe(
      "Side lesson · done",
    );
  });
  test("before the unlock list loads it says only optional", () => {
    expect(sideLessonHint("A1.L02", true, ctx({ ready: false }))).toBe("Optional side lesson");
  });
});
