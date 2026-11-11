import { expect, test } from "bun:test";

test("@strudel/core imports under Bun (kabelsalat patch applied)", async () => {
  const core = await import("@strudel/core");
  expect(typeof core.evaluate).toBe("function");
  // No mini-notation registered here: a plain string is one value, so build the sequence explicitly.
  const haps = core.note(core.sequence("c4", "e4")).queryArc(0, 1);
  expect(haps.map((h: { value: { note: string } }) => h.value.note)).toEqual(["c4", "e4"]);
});

test("mini-notation + tonal evaluate headlessly", async () => {
  const core = await import("@strudel/core");
  const mini = await import("@strudel/mini");
  const tonal = await import("@strudel/tonal");
  const { transpiler } = await import("@strudel/transpiler");
  await core.evalScope(core, mini, tonal);
  const { pattern } = await core.evaluate('n("0 2 4").scale("C4:major")', transpiler);
  const notes = pattern.queryArc(0, 1).map((h: { value: { note: string } }) => h.value.note);
  expect(notes).toEqual(["C4", "E4", "G4"]);
});
