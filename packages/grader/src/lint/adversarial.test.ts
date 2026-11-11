// Adversarial review of the safety profiles (contracts §11.3): routes that passed the lint before this
// review. Each row is the regression test of a gap that was closed.
import { describe, expect, test } from "bun:test";
import { lintBase, lintStrict } from "./oak.ts";

const ids = (diags: { id: string }[]) => [...new Set(diags.map((d) => d.id))];

describe("remote sample loading", () => {
  test("base: a remote URL anywhere inside samples()/aliasBank() arguments is refused", () => {
    for (const code of [
      'samples({ bd: "https://evil.example/bd.wav" })',
      'samples({ bd: ["https://evil.example/bd.wav"] }, "/sounds/")',
      'samples("github:someone/samples")',
      'samples("\\\\\\\\evil.example/x.json")', // `\\host` is `//host` to a browser's URL parser
      'samples("\\u0001https://evil.example/x.json")', // leading C0 controls are stripped by URL parsing
      'samples("wss://evil.example/x")',
      'aliasBank("https://evil.example/alias.json")',
      "samples(`https://evil.example/x.json`)",
    ]) {
      expect([code, ids(lintBase(code))]).toEqual([code, ["lint.base.remote-samples"]]);
    }
  });

  test("base: local paths and the learner's own maps pass", () => {
    for (const code of [
      'samples("/sounds/v1/strudel.json")',
      'samples({ bd: "bd/kick.wav" }, "/sounds/v1/")',
    ])
      expect([code, lintBase(code)]).toEqual([code, []]);
  });

  test("strict: an argument the lint cannot read (a name, a concatenation, a call) is refused", () => {
    for (const code of [
      'const u = "https://evil.example/x.json"\nsamples(u)',
      'samples("ht" + "tps://evil.example/x.json")',
      'samples(["h", "ttps://evil.example"].join(""))',
      "samples({ bd: u })",
      "aliasBank(String.fromCharCode(104))",
    ]) {
      expect([code, ids(lintStrict(code))]).toEqual([
        code,
        expect.arrayContaining(["lint.strict.construct"]),
      ]);
    }
    expect(lintStrict('samples({ bd: ["bd/kick.wav", "bd/k2.wav"] }, "/sounds/v1/")')).toEqual([]);
  });
});

describe("strict: Strudel's registration functions", () => {
  test("every function that adds methods or globals to the realm is refused", () => {
    for (const name of [
      "register",
      "registerControl",
      "registerMultiControl",
      "createParam",
      "createParams",
    ]) {
      const code = `${name}("note")`;
      expect([code, ids(lintStrict(code))]).toEqual([code, ["lint.strict.construct"]]);
    }
  });
});
