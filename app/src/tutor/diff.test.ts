import { describe, expect, test } from "bun:test";
import { diffCode, diffStats, tokenize } from "./diff.ts";

const side = (ops: ReturnType<typeof diffCode>, keep: "add" | "del") =>
  ops
    .filter((o) => o.type === "same" || o.type === keep)
    .map((o) => o.text)
    .join("");

describe("diffCode", () => {
  test("a note change is one word, not a line", () => {
    const before = 'bass: note("<c2 g2 c2 g2>").s("ebass")';
    const after = 'bass: note("<c2 f2 g2 c2>").s("ebass")';
    const ops = diffCode(before, after);
    expect(side(ops, "del")).toBe(before);
    expect(side(ops, "add")).toBe(after);
    expect(diffStats(ops)).toEqual({ added: 1, removed: 1 });
  });

  test("round-trips multi-line code and empty sides", () => {
    const a = 'setcpm(90/4)\n\ndrums: s("bd ~ sd ~")';
    const b = 'setcpm(90/4)\n\ndrums: s("bd bd sd ~, hh*8")';
    const ops = diffCode(a, b);
    expect(side(ops, "del")).toBe(a);
    expect(side(ops, "add")).toBe(b);
    expect(diffCode("", b)).toEqual([{ type: "add", text: b }]);
    expect(diffCode(a, a)).toEqual([{ type: "same", text: a }]);
  });

  test("tokens keep note names and numbers whole", () => {
    expect(tokenize('n("0 2 4").scale("C4:major")')).toContain("C4");
    expect(tokenize("c#4 eb3")).toEqual(["c#4", " ", "eb3"]);
  });

  test("very long inputs fall back to lines", () => {
    const a = Array.from({ length: 800 }, (_, i) => `x${i} y`).join("\n");
    const b = `${a}\nadded line`;
    const ops = diffCode(a, b);
    expect(side(ops, "add")).toBe(b);
    expect(ops.at(-1)?.type).toBe("add");
    expect(ops.filter((o) => o.type !== "same").length).toBeLessThanOrEqual(2);
  });
});
