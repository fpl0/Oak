import { describe, expect, test } from "bun:test";
import { insideRoot, isSafeSamplePath } from "./paths.ts";

describe("sound pack paths from upstream JSON", () => {
  test("ordinary sample names pass", () => {
    for (const f of [
      "bd/BT0A0D0.wav",
      "piano/C4v8.mp3",
      "RolandTR909/rolandtr909-bd/Bassdrum-01.wav",
      "a b/c%20d.wav",
    ])
      expect([f, isSafeSamplePath(f)]).toEqual([f, true]);
  });
  test("traversal, absolute paths, URLs, backslashes and NUL are refused", () => {
    for (const f of [
      "../../.bashrc",
      "bd/../../x.wav",
      "/etc/passwd",
      "C:\\x.wav",
      "bd\\..\\x",
      "https://e/x.wav",
      "bd//x.wav",
      "./x.wav",
      "x\0.wav",
      "",
    ])
      expect([f, isSafeSamplePath(f)]).toEqual([f, false]);
  });
  test("insideRoot is the last line before a write", () => {
    expect(insideRoot("/tmp/pack", "v1/bd/x.wav")).toBe("/tmp/pack/v1/bd/x.wav");
    for (const r of ["../x", "v1/../../x", "/etc/passwd", "."])
      expect(() => insideRoot("/tmp/pack", r)).toThrow();
  });
});
