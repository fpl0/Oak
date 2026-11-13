// Wave 4 pieces of the capstone flow that are pure: bar anchors read from the harmony rules' detail lines, the
// registry merged with capstone folder files, and "Try the revision" building a copy (never the released code).
import { describe, expect, test } from "bun:test";
import type { CapstoneDef, RubricRule } from "@oak/api";
import { capstones } from "../../../content/capstones.ts";
import { anchorFromText, anchorsOf } from "./anchors.ts";
import { checklistOf } from "./checklist.ts";
import { mergeCapstones } from "./content.ts";
import { revisionCopyCode, revisionCopyTitle } from "./revision-code.ts";
import { starterOf } from "./sessions.ts";

describe("bar anchors from a rule's detail line", () => {
  test("bar, bars n–m, bars n-m; out-of-piece bars are ignored", () => {
    expect(anchorFromText("bar 3 is a cluster, not a triad", 8)).toEqual({ from: 3, to: 3 });
    expect(anchorFromText("bars 7–8 end on V, not I", 8)).toEqual({ from: 7, to: 8 });
    expect(anchorFromText("chords go I V vi IV in bars 1-4; bar 6 is F", 8)).toEqual({ from: 1, to: 6 });
    expect(anchorFromText("bar 40 is far away", 8)).toBeNull();
    expect(anchorFromText("every chord has its root lowest", 8)).toBeNull();
    expect(anchorFromText(null)).toBeNull();
  });

  test("anchorsOf falls back to the detail line for rules the events cannot place", () => {
    const rules = [
      { id: "schema", label: "s", required: true, skills: [], rule: "progression", schema: "schema.axis" },
      { id: "range", label: "r", required: true, skills: [], rule: "range", track: "@melody", maxSpan: 19 },
    ] as unknown as RubricRule[];
    const a = anchorsOf(rules, new Set(["schema"]), null, 8, { schema: "bar 5 is G, the loop wants Am" });
    expect(a).toEqual({ schema: { from: 5, to: 5 }, range: null });
  });
});

describe("the C2 brief as content states it", () => {
  const c2 = capstones.find((c) => c.id === "C2") as CapstoneDef;
  test("two sessions; the last one offers the review and releases", () => {
    expect(c2.sessionDefs.map((s) => s.id)).toEqual(["C2.S1", "C2.S2"]);
    expect(c2.sessionDefs.at(-1)?.release).toBe(true);
    expect(c2.sessionDefs.at(-1)?.review).toBe(true);
  });
  test("the checklist lists the required rules of contracts §6.6 and the ends-on-1 suggestion", () => {
    const rows = checklistOf(c2.brief?.rubric ?? [], null);
    expect(rows.filter((r) => r.required).length).toBeGreaterThanOrEqual(7);
    expect(rows.find((r) => r.id === "ends-home")?.required).toBe(false);
    expect(rows.every((r) => r.state === "unchecked")).toBe(true);
  });
  test("a session starter wins over the brief's", () => {
    const def = {
      ...c2,
      sessionDefs: [{ ...c2.sessionDefs[0], starter: "// mine" }, c2.sessionDefs[1]],
    } as CapstoneDef;
    expect(starterOf(def, 0)).toBe("// mine");
    expect(starterOf(def, 1)).toBe(starterOf(c2, 1));
  });
});

describe("mergeCapstones", () => {
  test("a folder file replaces its registry entry; a new one is added", () => {
    const a = { id: "C2", title: "registry" } as unknown as CapstoneDef;
    const b = { id: "X1", title: "registry" } as unknown as CapstoneDef;
    const folderX1 = { id: "X1", title: "folder" } as unknown as CapstoneDef;
    const folderX9 = { id: "X9", title: "folder" } as unknown as CapstoneDef;
    const out = mergeCapstones([a, b], [folderX1, folderX9]);
    expect(out.map((c) => `${c.id}:${c.title}`)).toEqual(["C2:registry", "X1:folder", "X9:folder"]);
  });
});

describe("try the revision", () => {
  const rev = {
    title: "Let bar 7 breathe",
    bars: [7, 8] as [number, number],
    why: "The cadence arrives with every part moving at once; leave the melody on a long note so the chord change is heard.",
    tryCode: 'mel: n("<... [4@4] [0@4]>")',
    skills: [],
  };
  const code = 'setcpm(96/4)\nmel: n("0 2 4").s("piano")';
  test("the copy keeps the piece unchanged below the revision, which arrives as comments", () => {
    const out = revisionCopyCode(code, rev);
    expect(out.endsWith(code)).toBe(true);
    const head = out.slice(0, out.length - code.length);
    expect(
      head
        .split("\n")
        .filter((l) => l.trim())
        .every((l) => l.startsWith("//")),
    ).toBe(true);
    expect(head).toContain("bars 7–8");
    expect(head).toContain('//   mel: n("<... [4@4] [0@4]>")');
    expect(head).toContain("The released version on your album is unchanged.");
  });
  test("a single bar reads as one; the title is capped at 120 characters", () => {
    expect(revisionCopyCode(code, { ...rev, bars: [3, 3], tryCode: "" })).toContain("(bar 3)");
    expect(revisionCopyTitle("Four-Chord Song", rev)).toBe("Four-Chord Song · trying “Let bar 7 breathe”");
    expect(revisionCopyTitle("x".repeat(200), rev).length).toBe(120);
  });
});
