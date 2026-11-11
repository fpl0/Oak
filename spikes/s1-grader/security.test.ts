// SPIKE S1 — goal 5: security posture probe. What can evaluated code reach inside the Bun worker,
// which layer blocks what, and what is left.
//
// Layers under test:
//   L0  bare realm (code run with the global Function, nothing else)          -> baseline, shows the exposure
//   L1  env: {} on the Worker / subprocess
//   L2  parameter shadowing (allowlist complement) in the wrapper function    -> `[shadow]`
//   L3  lockDown(): Function/AsyncFunction/Generator constructors, eval, ShadowRealm neutered
//   L4  always-on dynamic-import ban (AST scan of the exact text handed to Function)
//   L5  strict acorn lint for code the learner did not type
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { GraderHost, type HostMode } from "./host.ts";
import { lintStrict } from "./lint.ts";

setDefaultTimeout(60_000);

const CANARY_FILE = new URL("./probes/canary.txt", import.meta.url).pathname;
const CANARY_TEXT = "canary-file-contents-0123\n";

type Layer = "bare" | "shadow" | "shadow-no-import-ban";

function makeProbe(host: () => GraderHost) {
  return async (code: string, layer: Layer): Promise<{ value?: unknown; threw?: string }> => {
    const res = await host().request({
      kind: "probe",
      code,
      transpile: false,
      shadow: layer !== "bare",
      importBan: layer !== "shadow-no-import-ban",
    });
    return res.ok ? { value: res.result } : { threw: `${res.error.kind}: ${res.error.message}` };
  };
}

for (const mode of ["worker", "subprocess"] as HostMode[]) {
  describe(`inside the ${mode}: full stack (env:{} + shadow + lockdown + import ban)`, () => {
    let host: GraderHost;
    let hits = 0;
    let server: ReturnType<typeof Bun.serve>;
    const probe = makeProbe(() => host);

    beforeAll(async () => {
      process.env.OAK_CANARY_SECRET = "sekrit-from-parent-env";
      server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => (hits++, new Response("pong")) });
      host = new GraderHost({ mode, allowProbe: true, timeoutMs: 3000 });
      await host.ready();
    });
    afterAll(async () => {
      delete process.env.OAK_CANARY_SECRET;
      await host.dispose();
      server.stop(true);
    });

    const TYPEOF = "return [typeof Bun, typeof process, typeof fetch, typeof require, typeof module, typeof globalThis, typeof self, typeof postMessage, typeof WebSocket, typeof Worker, typeof setTimeout].join(',')";

    test("L0 baseline: the bare realm exposes Bun, process, fetch, WebSocket, Worker, postMessage (but no `require`)", async () => {
      expect(await probe(TYPEOF, "bare")).toEqual({ value: "object,object,function,undefined,undefined,object,object,function,function,function,function" });
    });

    test("L1 env:{} — process.env / Bun.env are empty even in the bare realm; a spawned child does not get the parent's secret either", async () => {
      expect(await probe("return { n: Object.keys(process.env).length, a: process.env.OAK_CANARY_SECRET ?? null, b: Bun.env.OAK_CANARY_SECRET ?? null }", "bare")).toEqual({ value: { n: 0, a: null, b: null } });
      const child = await probe("return Bun.spawnSync(['/usr/bin/env']).stdout.toString()", "bare");
      expect(String(child.value)).not.toContain("sekrit");
    });

    test("L0 baseline: …but env isolation is NOT enough — the bare realm reads any file and reaches the network", async () => {
      expect(await probe(`return await Bun.file(${JSON.stringify(CANARY_FILE)}).text()`, "bare")).toEqual({ value: CANARY_TEXT });
      const before = hits;
      expect(await probe(`return await (await fetch('http://127.0.0.1:${server.port}/')).text()`, "bare")).toEqual({ value: "pong" });
      expect(hits).toBe(before + 1);
    });

    test("L2 shadowing: every host global is `undefined` for evaluated code", async () => {
      expect(await probe(TYPEOF, "shadow")).toEqual({ value: "undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined" });
      expect(await probe("return [typeof ShadowRealm, typeof WebAssembly, typeof navigator, typeof prompt, typeof alert, typeof Reflect, typeof Proxy, typeof crypto, typeof Buffer, typeof performance, typeof addEventListener, typeof queueMicrotask, typeof evaluate, typeof evalScope, typeof strudelScope, typeof repl].join(',')", "shadow")).toEqual({
        value: Array(16).fill("undefined").join(","),
      });
      expect((await probe(`return await Bun.file(${JSON.stringify(CANARY_FILE)}).text()`, "shadow")).threw).toContain("undefined is not an object");
      const before = hits;
      expect((await probe(`return await (await fetch('http://127.0.0.1:${server.port}/')).text()`, "shadow")).threw).toContain("fetch is not a function");
      expect(hits).toBe(before);
      // Strudel and the safe builtins are still there
      expect(await probe("return [typeof note, typeof stack, typeof Math, typeof JSON, typeof console.log, typeof silence].join(',')", "shadow")).toEqual({ value: "function,function,object,object,function,object" });
    });

    test("`this` never leaks the global object (everything is strict; Bun timers bind a Timeout object)", async () => {
      for (const layer of ["bare", "shadow"] as Layer[]) {
        expect(await probe("return [typeof this, typeof (function(){ return this })(), typeof [0].map(function(){ return this })[0]].join(',')", layer)).toEqual({ value: "undefined,undefined,undefined" });
      }
      expect(await probe("return await new Promise(res => setTimeout(function(){ res(this === globalThis ? 'GLOBAL' : (this && this.constructor && this.constructor.name)) }, 0))", "bare")).toEqual({ value: "Timeout" });
      // Strudel callbacks get no receiver either
      expect(await probe("let t = 'unset'; pure(1).withValue(function(){ t = typeof this; return 1 }).queryArc(0, 1); return t", "shadow")).toEqual({ value: "undefined" });
    });

    test("L3 lockdown: every route to a Function constructor throws — in BOTH the bare and the shadowed realm", async () => {
      const routes = [
        "return (()=>{}).constructor('return typeof Bun')()",
        "return [].constructor.constructor('return typeof process')()",
        "return ''.constructor.constructor('return 1')()",
        "return await (async()=>{}).constructor('return typeof Bun')()",
        "return (function*(){}).constructor('yield 1')().next().value",
        "return (async function*(){}).constructor('yield 1')",
        "return eval('typeof Bun')",
        "return (0, eval)('this')",
        "return new Function('return 1')()",
        "return note.constructor('return 1')()", // a Strudel function
        "return console.log.constructor('return 1')()", // our own safe console
        "const k = 'con' + 'structor'; return (()=>{})[k]('return 1')()", // computed, string built at runtime
      ];
      for (const code of routes) {
        for (const layer of ["bare", "shadow"] as Layer[]) {
          const r = await probe(code, layer);
          expect(r.value).toBeUndefined();
          expect(r.threw).toBeDefined();
        }
      }
      // property-descriptor reflection finds only the neutered stub
      expect(await probe("return Object.values(Object.getOwnPropertyDescriptors(Object.getPrototypeOf(()=>1))).map(d => d.value && d.value.name).filter(Boolean).join('|')", "shadow")).toEqual({
        value: "toString|apply|call|bind|blockedConstructor",
      });
      // Strudel's own evaluate() is dead too (it calls the global Function)
      expect((await probe("return (await evaluate('1')).pattern", "bare")).threw).toContain("code generation from strings is disabled");
    });

    test("L3 lockdown: ShadowRealm (ships in Bun 1.4.4) is gone", async () => {
      expect(await probe("return typeof ShadowRealm", "bare")).toEqual({ value: "undefined" });
    });

    test("Error.prepareStackTrace call sites expose neither `this` nor function objects", async () => {
      const code = "const old = Error.prepareStackTrace; Error.prepareStackTrace = (e, s) => s; let sites; try { sites = new Error('x').stack } finally { Error.prepareStackTrace = old } return sites.map(s => typeof s.getThis() + ':' + typeof s.getFunction()).join(',')";
      const r = await probe(code, "shadow");
      expect(String(r.value).split(",").every((x) => x === "undefined:undefined")).toBe(true);
    });

    test("L4 import ban: `import()` is the one thing shadowing + lockdown cannot stop — the AST scan does", async () => {
      const readFs = `const fs = await import('node:fs'); return fs.readFileSync(${JSON.stringify(CANARY_FILE)}, 'utf8')`;
      // without the ban: full escape (file system, the `bun` module with spawn/file/env)
      expect(await probe(readFs, "shadow-no-import-ban")).toEqual({ value: CANARY_TEXT });
      expect(await probe(`const b = await import('bun'); return [typeof b.spawn, typeof b.file, typeof b.serve].join(',')`, "shadow-no-import-ban")).toEqual({ value: "function,function,function" });
      // with it
      expect((await probe(readFs, "shadow")).threw).toContain("dynamic import()");
      expect((await probe("return typeof import.meta", "shadow")).threw).toBeDefined();
      for (const sneaky of [
        "const f = async (m) => await import(m); return typeof (await f('node:' + 'fs')).readFileSync",
        "return typeof (await import(/* c */ 'node:fs')).readFileSync",
        "return typeof (await import\n('node:fs')).readFileSync",
        "const x = { import: 1 }; return typeof (await import('node:fs'))",
      ]) {
        expect((await probe(sneaky, "shadow")).threw).toContain("dynamic import()");
      }
      // a property merely NAMED import is fine
      expect(await probe("const x = { import: 1 }; return x.import", "shadow")).toEqual({ value: 1 });
      // and through the normal analyze path
      expect(await host.analyze("const fs = await import('node:fs')\ns('bd')")).toMatchObject({ ok: false, error: { kind: "eval" } });
    });

    test("REMAINS: builtin prototypes are shared by all requests in one realm (poisoning persists until respawn)", async () => {
      expect(await probe("Array.prototype.oakPoison = 'left behind'; return 1", "shadow")).toEqual({ value: 1 });
      expect(await probe("return [].oakPoison ?? null", "shadow")).toEqual({ value: "left behind" });
      // a fresh backend is clean — respawn costs ~35 ms (worker) / ~65 ms (subprocess)
      const fresh = new GraderHost({ mode, allowProbe: true });
      try {
        expect(await makeProbe(() => fresh)("return [].oakPoison ?? null", "shadow")).toEqual({ value: null });
      } finally {
        await fresh.dispose();
      }
      expect(await probe("delete Array.prototype.oakPoison; return [].oakPoison ?? null", "shadow")).toEqual({ value: null });
    });

    test("REMAINS: information that needs no global — source paths in Error().stack", async () => {
      const r = await probe("return new Error('x').stack", "shadow");
      expect(String(r.value)).toContain("runtime.ts"); // absolute path of the server's source tree
    });

    test("the realm keeps the native SyntaxError (mini's peggy SyntaxError is filtered out of evalScope)", async () => {
      expect(await probe("return String(SyntaxError).includes('[native code]')", "shadow")).toEqual({ value: true });
    });
  });
}

describe("without lockdown the shadowing alone is one line away from a full escape", () => {
  let host: GraderHost;
  beforeAll(async () => {
    host = new GraderHost({ mode: "worker", allowProbe: true, lockdown: false });
    await host.ready();
  });
  afterAll(async () => {
    await host.dispose();
  });
  test("Function-constructed code runs in the global scope, outside the shadowing parameters", async () => {
    const probe = makeProbe(() => host);
    expect(await probe("return typeof Bun", "shadow")).toEqual({ value: "undefined" });
    expect(await probe("return (()=>{}).constructor('return typeof Bun + \",\" + typeof process + \",\" + typeof fetch')()", "shadow")).toEqual({ value: "object,object,function" });
    expect(await probe(`return await (()=>{}).constructor('return Bun.file(${JSON.stringify(CANARY_FILE)}).text()')()`, "shadow")).toEqual({ value: CANARY_TEXT });
    // ShadowRealm: a second realm with Bun inside and a working Function constructor
    expect(await probe("return (()=>{}).constructor('return new ShadowRealm().evaluate(\"typeof Bun\")')()", "shadow")).toEqual({ value: "object" });
  });
});

describe("L5 strict lint (acorn) — for code the learner did not type", () => {
  const rules = (code: string) => [...new Set(lintStrict(code).map((d) => d.rule))];

  test("lesson-shaped code passes", () => {
    for (const code of [
      'setcpm(120/4)\ndrums: s("bd*4, [~ sd]*2, hh*8").bank("RolandTR909")\nchords: chord("<C Am F G>").voicing().s("piano")\nmel: n("0 2 4 <6 7>").scale("C4:major")',
      'const prog = "<C^7 Am7 Dm7 G7>"\nbass: n("0").chord(prog).rootNotes(2).note()\nkeys: chord(prog).dict("lefthand").voicing()',
      'note("c4 e4 g4").off(1/8, x => x.add(note(12))).jux(rev).every(4, x => x.fast(2))',
      'let melody = n("0 1 2 3")\nmelody = melody.scale("C:minor")\nmel: melody.swingBy(1/3, 4)',
      "const xs = [0, 2, 4]\nn(xs[0]).scale('C:major')",
      'arrange([4, s("bd*4")], [4, s("hh*8")])',
      "mel: note(`c4 e4\n g4 b4`)",
    ]) {
      expect(lintStrict(code)).toEqual([]);
    }
  });

  test("every escape ingredient is rejected", () => {
    const table: [string, string][] = [
      ["Bun.file('/etc/passwd')", "banned-identifier"],
      ["process.env", "banned-identifier"],
      ["require('fs')", "banned-identifier"],
      ["globalThis.fetch", "banned-identifier"],
      ["fetch('http://x')", "banned-identifier"],
      ["new WebSocket('ws://x')", "banned-identifier"],
      ["new Worker('x')", "banned-identifier"],
      ["await import('node:fs')", "no-ImportExpression"],
      ["import.meta.url", "syntax"], // not even parseable in script mode
      ["this", "no-ThisExpression"],
      ["(function(){ return this })()", "no-ThisExpression"],
      ["(()=>{}).constructor('x')", "banned-property"],
      ["(()=>{})['constructor']('x')", "computed-member"],
      ["(()=>{})['con'+'structor']", "computed-member"],
      ["const k = 'constructor'; s('bd')", "banned-string"],
      ["s('con\\x73tructor')", "banned-string"], // escapes are cooked before the check
      ["const {constructor: c} = s; c", "banned-property"],
      ["const {['a']: c} = s; c", "computed-member"],
      ["x.__proto__", "banned-property"],
      ["x.__lookupGetter__('a')", "banned-property"],
      ["x.prototype.y = 1", "banned-property"],
      ["x[y]", "computed-member"],
      ["x[`a`]", "computed-member"],
      ["({[k]: 1})", "computed-member"],
      ["Reflect.get(f, k)", "banned-identifier"],
      ["Object.getOwnPropertyDescriptors(f)", "banned-identifier"],
      ["new Proxy({}, {})", "banned-identifier"],
      ["eval('1')", "banned-identifier"],
      ["new Function('x')", "banned-identifier"],
      ["setTimeout(() => {}, 0)", "banned-identifier"],
      ["evaluate('1')", "banned-identifier"],
      ["register('note', () => silence)", "banned-identifier"],
      ["note = 5", "global-assign"],
      ["note++", "global-assign"],
      ["class A {}", "no-ClassDeclaration"],
      ["String.raw`x`", "no-TaggedTemplateExpression"],
      ["/a/.exec('a')", "no-regex"],
    ];
    for (const [code, rule] of table) {
      expect([code, rules(code)]).toEqual([code, expect.arrayContaining([rule])]);
    }
  });

  test("numeric index access is allowed; diagnostics carry source offsets", () => {
    expect(lintStrict("const xs = [1, 2]\nn(xs[1])")).toEqual([]);
    expect(lintStrict("s('bd')\nfetch('x')")).toEqual([{ rule: "banned-identifier", message: 'identifier "fetch" is not allowed', start: 8, end: 13 }]);
  });

  test("KNOWN LIMIT: strings assembled at runtime pass the lint (harmless alone: no computed access, no reflection API left to use them with)", () => {
    expect(lintStrict("const k = `${'constr'}uctor`\ns('bd')")).toEqual([]);
    expect(lintStrict("const k = 'proto' + 'type'\ns('bd')")).toEqual([]);
  });

  test("the lint runs inside the realm when asked: lint error => no evaluation", async () => {
    const host = new GraderHost({ mode: "worker" });
    try {
      const res = await host.analyze("console.log('evaluated!')\nglobalThis\ns('bd')", { lint: "strict" });
      expect(res).toMatchObject({ ok: false, error: { kind: "lint" }, logs: [] });
    } finally {
      await host.dispose();
    }
  });
});
