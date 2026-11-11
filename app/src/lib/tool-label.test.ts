import { describe, expect, test } from "bun:test";
import { toolbox } from "../../../content/toolbox.ts";
import { toolLabel } from "./tool-label.ts";

const of = (id: string) => {
  const t = toolbox.find((x) => x.id === id);
  if (!t) throw new Error(id);
  return toolLabel(t);
};

describe("toolLabel", () => {
  test("features drop the contract's editorial notes", () => {
    expect(of("tb.feature.band")).toEqual({ text: "Band layer", mono: false });
    expect(of("tb.feature.tuner")).toEqual({ text: "Sing panel", mono: false });
    expect(of("tb.feature.studio")).toEqual({ text: "Studio", mono: false });
    expect(of("tb.feature.transport")).toEqual({ text: "Play / Stop / Run", mono: false });
    expect(of("tb.feature.roll")).toEqual({ text: "Piano roll and drum lanes", mono: false });
  });
  test("a code row described in prose shows its signature", () => {
    expect(of("tb.label")).toEqual({ text: "label: pattern", mono: true });
    expect(of("tb.mini.seq")).toEqual({ text: '"a b c d"', mono: true });
    expect(of("tb.meter.3-4").text).toBe("setcpm(bpm/3)");
  });
  test("code rows keep their code", () => {
    expect(of("tb.setcpm")).toEqual({ text: "setcpm(bpm/4)", mono: true });
    expect(of("tb.gain")).toEqual({ text: ".gain(x)", mono: true });
    expect(of("tb.s").text).toBe('s("…") / sound("…")');
    expect(of("tb.mini.alt").text).toBe("<a b>");
  });
  test("no label is empty or carries a parenthetical note", () => {
    for (const t of toolbox) {
      const l = toolLabel(t);
      expect(l.text.length).toBeGreaterThan(0);
      if (!l.mono) expect(l.text).not.toMatch(/\)$/);
    }
  });
});
