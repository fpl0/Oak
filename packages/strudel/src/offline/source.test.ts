import { expect, test } from "bun:test";
import { PieceRenderError } from "./errors.ts";
import { validateSource } from "./source.ts";

test("source checks preserve full editor syntax and apply the shared base/strict profiles", () => {
  const code = 'setcpm(100/4)\nconst melVerse = note("c4 e4").s("piano")\nmel: arrange([8, melVerse])';
  expect(() => validateSource(code)).not.toThrow();
  expect(() => validateSource(code, true)).not.toThrow();
  for (const invalid of ['fetch("/api/state")', 'window.parent.postMessage("bad", "*")', "const ="])
    expect(() => validateSource(invalid)).toThrow(PieceRenderError);
  expect(() => validateSource('const x = "s"; note("c4")[x]("piano")')).not.toThrow();
  expect(() => validateSource('const x = "s"; note("c4")[x]("piano")', true)).toThrow(PieceRenderError);
});
