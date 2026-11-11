import { describe, expect, test } from "bun:test";
import { formatLintIssues, type LintRule, lintCode, lintStrict } from "./strict.ts";

/** A template placeholder, spelled so that this file's own strings stay plain. */
const INTERPOLATION = ["$", "{b}"].join("");

const rules = (code: string, profile: "base" | "strict" = "strict"): LintRule[] => [
  ...new Set(lintCode(code, profile).map((i) => i.rule)),
];

describe("strict profile: what tutor code may contain", () => {
  const allowed = [
    'mel: n("0 2 4 7").scale("D4:dorian")',
    'drums: s("bd*2, ~ sd, hh*8").bank("RolandTR909")\nbass: n("0 ~ 0 4").scale("D2:dorian").s("sawtooth")',
    'setcpm(90/4)\nchords: chord("<C^7 Am7 Dm7 G7>").voicing()',
    'const a = n("0 2 4")\nmel: a.add(n("<0 1>")).scale("C4:major")',
    'mel: n("0 1 2 3").scale("C4:major").sometimesBy(0.3, x => x.add(n(7)))',
    'mel: note("c4 e4 g4").withValue(v => ({ ...v, gain: 0.8 }))',
    "mel: note(`c4 e4\n  g4 b4`)",
    'mel: stack(...[note("c4"), note("e4")])',
    'mel: n([0, 2, 4][0]).scale("C4:major")',
    'mel: n("0 2").scale("C4:major") // a comment mentioning constructor and fetch()',
    '$: s("bd sd")',
    'samples({ bd: "bd/BT0A0A7.wav" }, "/sounds/v1/")',
  ];
  test.each(allowed)("allows %p", (code) => {
    expect(formatLintIssues(lintStrict(code))).toEqual([]);
  });
});

describe("strict profile: the rules of contracts §11.3", () => {
  const cases: [string, LintRule][] = [
    ["x[k]", "lint.strict.computed-member"],
    ['x["a"]', "lint.strict.computed-member"],
    ["x?.[k]", "lint.strict.computed-member"],
    ["x[-1]", "lint.strict.computed-member"],
    ["({ [k]: 1 })", "lint.strict.computed-member"],
    ["const { [k]: v } = x", "lint.strict.computed-member"],
    ["this.x", "lint.strict.this"],
    ["f(() => this)", "lint.strict.this"],
    ['f("constructor")', "lint.strict.reserved-string"],
    ['f("x.__proto__.y")', "lint.strict.reserved-string"],
    ["f(`prototype`)", "lint.strict.reserved-string"],
    ['f("\\u0063onstructor")', "lint.strict.reserved-string"],
    ["new Date()", "lint.strict.construct"],
    ["class A {}", "lint.strict.construct"],
    ["function f() {}", "lint.strict.construct"],
    ["f(function () {})", "lint.strict.construct"],
    ["({ m() { return 1 } })", "lint.strict.construct"],
    ["f(() => { return 1 })", "lint.strict.construct"],
    ["f(async () => 1)", "lint.strict.construct"],
    ["for (;;) {}", "lint.strict.construct"],
    ["for (const a of b) {}", "lint.strict.construct"],
    ["while (true) {}", "lint.strict.construct"],
    ["do {} while (true)", "lint.strict.construct"],
    ["try { f() } catch {}", "lint.strict.construct"],
    ["await f()", "lint.strict.construct"],
    ["x = 1", "lint.strict.construct"],
    ["x.y = 1", "lint.strict.construct"],
    ["x += 1", "lint.strict.construct"],
    ["x++", "lint.strict.construct"],
    ["delete x.y", "lint.strict.construct"],
    ["let x = 1", "lint.strict.construct"],
    ["var x = 1", "lint.strict.construct"],
    ["f(/a+/)", "lint.strict.construct"],
    ["tag`x`", "lint.strict.construct"],
    [`f(\`a${INTERPOLATION}\`)`, "lint.strict.construct"],
    ["({ get a() { return 1 } })", "lint.strict.construct"],
    ["f(...xs)", "lint.strict.construct"],
    ["debugger", "lint.strict.construct"],
  ];
  test.each(cases)("rejects %p with %p", (code, rule) => {
    expect(rules(code)).toContain(rule);
  });
});

describe("base profile (also part of strict)", () => {
  const names =
    "globalThis self window document process Bun require module fetch XMLHttpRequest WebSocket EventSource Worker SharedWorker eval Function importScripts navigator postMessage localStorage sessionStorage indexedDB caches".split(
      " ",
    );
  test.each(names)("rejects the identifier %p", (name) => {
    expect(rules(`${name}`, "base")).toEqual(["lint.base.identifier"]);
    expect(rules(`f(${name})`, "strict")).toContain("lint.base.identifier");
  });

  test("rejects import() and import.meta", () => {
    expect(rules('import("x")', "base")).toEqual(["lint.base.import"]);
    // import.meta is a syntax error outside a module: rejected at the parser.
    expect(rules("import.meta.url", "base")).toEqual(["lint.parse"]);
    expect(rules('import x from "y"', "base")).toEqual(["lint.parse"]);
  });

  test("rejects `with`", () => {
    expect(rules("with (a) { b }", "base")).toEqual(["lint.base.with"]);
  });

  test.each(["x.constructor", "x.__proto__", "x.prototype", "x?.constructor", "({}).constructor"])(
    "rejects member access %p",
    (code) => {
      expect(rules(code, "base")).toEqual(["lint.base.member"]);
    },
  );

  test("rejects remote samples in every spelling", () => {
    for (const code of [
      'samples("https://evil.example/pack.json")',
      'samples("//evil.example/pack.json")',
      'samples("github:someone/pack")',
      'samples({ bd: "http://evil.example/bd.wav" })',
      'samples({ bd: ["a.wav", "https://evil.example/b.wav"] })',
      'samples({ bd: "bd.wav" }, "https://evil.example/")',
      "samples(url)",
      'samples("ht" + "tps://evil.example")',
      "x.samples(url)",
    ]) {
      expect(rules(code, "base")).toContain("lint.base.remote-samples");
    }
    expect(rules('samples({ bd: "bd/a.wav" }, "/sounds/v1/")', "base")).toEqual([]);
  });

  test("the learner's own code may use what only the strict profile forbids", () => {
    expect(
      rules("let x = 1; for (let i = 0; i < 2; i++) { x += i }\nfunction f() { return this }", "base"),
    ).toEqual([]);
  });
});

describe("bypass attempts", () => {
  const attacks: [string, string][] = [
    ["the classic", '(() => 0).constructor("return process")()'],
    ["optional chaining", '(() => 0)?.constructor?.("return 1")'],
    ["string key", '(() => 0)["constructor"]("return 1")'],
    ["concatenated key", '(() => 0)["con" + "structor"]("return 1")'],
    ["key from a variable", 'const k = "con" + "structor"\nf((() => 0)[k])'],
    ["key from String.fromCharCode", "f((() => 0)[String.fromCharCode(99, 111)])"],
    ["key from a join", 'f((() => 0)[["con", "structor"].join("")])'],
    ["key from a template", `f((() => 0)[\`con${INTERPOLATION}\`])`],
    ["destructuring", "const { constructor: C } = () => 0\nC('return 1')()"],
    ["destructuring with a string key", 'const { "constructor": C } = () => 0'],
    ["destructuring with a computed key", 'const k = "x"\nconst { [k]: C } = f'],
    ["unicode escape in an identifier", "x.\\u0063onstructor"],
    ["unicode escape in a string", 'f("\\x63onstructor")'],
    ["__proto__ in an object literal", "f({ __proto__: x })"],
    ["Reflect.get with a built string", 'Reflect.get(() => 0, "con" + "structor")'],
    ["Object.getPrototypeOf", "Object.getPrototypeOf(() => 0)"],
    ["descriptors of a prototype", "f(x => x.getOwnPropertyDescriptors(x.getPrototypeOf(() => 0)))"],
    ["__lookupGetter__", 'f.__lookupGetter__("__pro" + "to__")'],
    ["indirect eval", "(0, eval)('1')"],
    ["eval through an alias", "const e = eval"],
    ["Function by name", "Function('return 1')()"],
    ["globalThis property", "globalThis.fetch"],
    ["fetch as a method name", "x.fetch('/api/settings/anthropic-key')"],
    ["process env", "f(process.env)"],
    ["Bun file", "Bun.file('/etc/hosts')"],
    ["require", "require('node:fs')"],
    ["dynamic import", "import('node:fs')"],
    ["import in an arrow", "f(() => import('x'))"],
    ["new Function", "new Function('return 1')"],
    ["this at top level", "f(this)"],
    ["this inside an arrow", "f(() => this.process)"],
    ["getter", "({ get a() { return 1 } })"],
    ["tagged template", "f`x`"],
    ["spread a non-literal into a call", "f(...g())"],
    ["timer", "setTimeout(() => 0, 0)"],
    ["Strudel's own evaluate", "evaluate('fetch(1)')"],
    ["html comment trick", "x <!-- y\nfetch(1)"],
    ["async arrow", "f(async x => await x)"],
    ["class with a static block", "class A { static { f() } }"],
    ["label named like a global", "process: s('bd')"],
    ["arguments", "f(arguments)"],
    ["proxy", "f(Proxy)"],
    ["remote samples through a variable", 'const u = "https://evil.example"\nsamples(u)'],
    ["samples through an alias", 'const load = samples\nload("github:someone/pack")'],
    ["samples through a comma expression", '(0, samples)("https://evil.example")'],
    ["samples through .call", 'samples.call(null, "https://evil.example")'],
    ["samples out of an array", '[samples][0]("https://evil.example")'],
    ["samples passed along", "f(samples)"],
    ["optional call of eval", 'eval?.("1")'],
    ["parenthesised eval", '(eval)("1")'],
    ["braced unicode escape in a member name", "x.\\u{63}onstructor"],
    ["unicode escape in a global's name", "glob\\u0061lThis.x"],
    ["line continuation inside a string", 'f("constr\\\nuctor")'],
    ["comma expression as a key", "x[(0, k)]"],
    ["numeric key followed by a computed one", "x[0][k]"],
    ["bigint key", "x[0n]"],
    ["optional chaining with a template key", "x?.[`constructor`]"],
    ["destructured parameter", "(({ constructor }) => constructor)(f)"],
    ["shorthand property", "f({ constructor })"],
    ["label named like a reserved member", 'constructor: s("bd")'],
    ["with inside an arrow body", "f(() => { with (x) { y } })"],
    ["setter", "f({ set a(v) { } })"],
    ["tagged template with a member tag", "String.raw`x`"],
    ["new.target", "f(() => new.target)"],
    // A line-leading `-->` and `<!--` are comments in a script and operators in a module.
    ["html close comment hiding a call", 'f(x => x\n--> fetch("/api/settings")\n)'],
    ["html close comment after a statement", "const a = 1\na\n--> a"],
    ["html open comment", "x <!-- y"],
    ["html close comment on the first line", "--> x"],
  ];
  test.each(attacks)("%s is rejected", (_name, code) => {
    expect(lintStrict(code).length).toBeGreaterThan(0);
  });

  test("html-style comments are refused in the base profile too, ordinary comments are not", () => {
    expect(rules("x <!-- y", "base")).toEqual(["lint.parse"]);
    expect(rules("const a = 1\na\n--> a", "base")).toEqual(["lint.parse"]);
    expect(rules('mel: n("<0 2>") // a comment\n/* and --> another */', "strict")).toEqual([]);
    expect(rules('mel: s("bd --> sd <!-- hh")', "strict")).toEqual([]);
  });

  test("samples may only be called directly, in both profiles", () => {
    expect(rules('const load = samples\nload("x")', "base")).toEqual(["lint.base.remote-samples"]);
    expect(rules('x.samples({ bd: "bd/a.wav" })', "base")).toEqual([]);
  });

  test("code that does not parse is rejected, with its line", () => {
    const issues = lintStrict('mel: n("0 2"\n  .scale(');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.rule).toBe("lint.parse");
  });

  test("code too deep to analyse is rejected, not passed", () => {
    const deep = `${"(".repeat(20_000)}1${")".repeat(20_000)}`;
    expect(lintStrict(deep).map((i) => i.rule)).toEqual(["lint.parse"]);
  });

  test("issues carry a line number the model can act on", () => {
    const issues = lintStrict('mel: n("0")\nbass: n("1")[k]');
    expect(issues[0]?.line).toBe(2);
    expect(formatLintIssues(issues)[0]).toStartWith("line 2: lint.strict.computed-member");
  });
});
