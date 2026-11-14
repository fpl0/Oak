import { describe, expect, test } from "bun:test";
import type { SyllabusDef, ToolEntry } from "@oak/content-kit";
import { syllabus } from "../../../../content/syllabus.ts";
import { toolbox } from "../../../../content/toolbox.ts";
import { WORKBENCH_LENS_SHORTCUTS } from "../../workbench/shortcuts.ts";
import { opensWith, rowLock, WORKBENCH_KEY_ANY_UNLOCKS, WORKBENCH_KEY_UNLOCKS } from "./locks.ts";

const S = syllabus as unknown as SyllabusDef;
const T = toolbox as unknown as ToolEntry[];
const ids = new Set(T.map((t) => t.id as string));

describe("locked rows in the shortcut sheet", () => {
  test("every Workbench lens and panel key that needs a tool names a real toolbox row", () => {
    for (const [keys] of WORKBENCH_LENS_SHORTCUTS) {
      const need = WORKBENCH_KEY_UNLOCKS[keys];
      if (need) expect({ keys, known: ids.has(need) }).toEqual({ keys, known: true });
    }
    // The Wave 5 keys are all covered.
    for (const k of ["Shift+O", "Shift+E", "Shift+B", "Shift+U", "Shift+W", "Shift+Y", "Shift+P"])
      expect(WORKBENCH_KEY_UNLOCKS[k]).toBeDefined();
  });

  test("Wave 6: the music-lens keys are listed by the Workbench and each names real toolbox rows", () => {
    const listed = new Set(WORKBENCH_LENS_SHORTCUTS.map(([k]) => k));
    for (const [keys, needs] of Object.entries(WORKBENCH_KEY_ANY_UNLOCKS)) {
      expect({ keys, listed: listed.has(keys) }).toEqual({ keys, listed: true });
      expect(needs.length).toBeGreaterThan(0);
      for (const n of needs) expect({ keys, n, known: ids.has(n) }).toEqual({ keys, n, known: true });
      // A key is in one table only.
      expect(WORKBENCH_KEY_UNLOCKS[keys]).toBeUndefined();
    }
    expect(Object.keys(WORKBENCH_KEY_ANY_UNLOCKS).sort()).toEqual(["Shift+I", "Shift+J", "Shift+V"]);
  });

  test("Wave 6: a music lens opens with any one of its tools, and a locked one names the first", () => {
    const none = new Set<string>();
    expect(rowLock("workbench", "Shift+I", none, true, T, S)).toEqual({
      locked: true,
      note: "Opens with U12 · Seventh Chords",
    });
    expect(rowLock("workbench", "Shift+I", new Set(["chord.seventh"]), true, T, S)).toBeNull();
    // The beat grid: compound meter (U13.L04) or .ply() (U13.L05); either one opens it.
    expect(rowLock("workbench", "Shift+V", none, true, T, S)?.note).toBe("Opens with U13 · Rhythm II");
    expect(rowLock("workbench", "Shift+V", new Set(["tb.ply"]), true, T, S)).toBeNull();
    expect(rowLock("workbench", "Shift+V", new Set(["tb.meter.compound"]), true, T, S)).toBeNull();
    // The key ribbon's tool is the patterned .scale() of U03: locked only before it.
    expect(rowLock("workbench", "Shift+J", none, true, T, S)?.note).toMatch(/^Opens with U03 · /);
    expect(rowLock("workbench", "Shift+J", new Set(["tb.scale.patterned"]), true, T, S)).toBeNull();
    expect(rowLock("workbench", "Shift+J", none, false, T, S)).toBeNull();
  });

  test("where a row opens, in the course's words", () => {
    expect(opensWith("tb.lens.form", T, S)).toBe("U09 · Form");
    expect(opensWith("scale.blues", T, S)).toBe("U11 · Pentatonic & Blues");
    expect(opensWith("tb.scope", T, S)).toMatch(/^the side lesson /);
    expect(opensWith("tb.nothing", T, S)).toBeNull();
  });

  test("a locked key says when it opens; an unlocked one, another section or an unloaded list is not marked", () => {
    const none = new Set<string>();
    expect(rowLock("workbench", "Shift+O", none, true, T, S)).toEqual({
      locked: true,
      note: "Opens with U09 · Form",
    });
    expect(rowLock("workbench", "Shift+O", new Set(["tb.lens.form"]), true, T, S)).toBeNull();
    expect(rowLock("workbench", "Shift+O", none, false, T, S)).toBeNull();
    expect(rowLock("editor", "Mod+Enter", none, true, T, S)).toBeNull();
    expect(rowLock("workbench", "L", none, true, T, S)).toBeNull();
    expect(rowLock("workbench", "Shift+W", none, true, T, S)?.note).toMatch(/^Opens with the side lesson /);
  });
});
