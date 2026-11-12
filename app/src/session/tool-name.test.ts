import { expect, test } from "bun:test";
import { toolbox } from "../../../content/toolbox.ts";
import { toolName } from "./tool-name.ts";

test("a sound is named by the code the learner types, never by its sample bank", () => {
  for (const t of toolbox.filter((x) => x.kind === "sound")) {
    const n = toolName(t);
    expect(n.mono).toBe(true);
    expect(n.text).not.toContain("gm_");
  }
  const ebass = toolbox.find((t) => t.id === "snd.ebass");
  expect(ebass && toolName(ebass).text).toContain("ebass");
});

test("features keep their plain names, code keeps its code", () => {
  const f = toolbox.find((t) => t.id === "tb.feature.degree-labels");
  expect(f && toolName(f)).toEqual({
    text: "1-based degree labels and colours on roll and staff",
    mono: false,
  });
  const s = toolbox.find((t) => t.id === "tb.scale");
  expect(s && toolName(s).mono).toBe(true);
});

test("a scale row is named in words, never by its placeholder tonic", () => {
  for (const t of toolbox.filter((x) => x.kind === "scale")) {
    const n = toolName(t);
    expect(n.text).not.toContain("X4");
    expect(n.text).toMatch(/^the .+ scale$/);
  }
});
