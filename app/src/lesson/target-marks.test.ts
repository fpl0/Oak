import { describe, expect, test } from "bun:test";
import type { EditorHandle } from "@oak/strudel";
import { editorOf, insideAny } from "./target-marks.ts";

const handle = (id: string, disposed = false) => ({ id, disposed }) as unknown as EditorHandle;

describe("the starter's regions", () => {
  test("the editor of a Workbench is found by its oak_…_n_ id, not the Workbench's own id", () => {
    // Regression: the Make looked up `l-s6-make` in a map keyed `oak_l-s6-make_0_`, so its box never appeared.
    const eds = new Map([["oak_l-s6-make_0_", handle("oak_l-s6-make_0_")]]);
    expect(editorOf(eds, "l-s6-make")?.id).toBe("oak_l-s6-make_0_");
    const second = new Map([["oak_l-s4-1_2_", handle("oak_l-s4-1_2_")]]);
    expect(editorOf(second, "l-s4-1")?.id).toBe("oak_l-s4-1_2_");
    expect(editorOf(new Map([["oak_l-s6-make_0_", handle("x", true)]]), "l-s6-make")).toBeNull();
    expect(editorOf(eds, "l-s6")).toBeNull();
  });
  test("a caret at either end of a region is inside it", () => {
    const r = [{ from: 20, to: 27 }];
    expect(insideAny(r, 20)).toBe(true);
    expect(insideAny(r, 27)).toBe(true);
    expect(insideAny(r, 0)).toBe(false);
    expect(insideAny(r, 28)).toBe(false);
  });
});
