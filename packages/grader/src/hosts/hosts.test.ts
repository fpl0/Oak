// The Bun hosts (spike S1 host.test.ts and security.test.ts, promoted): both backends behind one
// GraderHost, the kill path, the work budget, FIFO order, and what evaluated code can reach inside a
// locked-down realm. Probes return their findings through a pattern value (`s(result)`), so they run
// through the same analyze path as learner code.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { LintContext } from "@oak/content-kit";
import { evaluateForGrading } from "../runtime/analyze.ts";
import { initRealm } from "../runtime/realm.ts";
import type { EvalOptions, EvalResult } from "../types.ts";
import { createBunGraderHost } from "./bun.bun.ts";
import type { HostCore } from "./core.ts";

setDefaultTimeout(60_000);

const CANARY_FILE = new URL("./canary.test-data.txt", import.meta.url).pathname;
const opts = (o: Partial<EvalOptions> = {}): EvalOptions => ({ mode: "lesson", bars: 1, lint: null, ...o });
const ok = (r: EvalResult) => {
  if (!r.ok) throw new Error(`${r.error.kind}: ${r.error.message}`);
  return r;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs `body` (an async function body) in the realm and returns what it returned, or `THREW: …`. */
async function probe(host: HostCore, body: string): Promise<unknown> {
  const code = `const __r = await (async () => { ${body} })().then((v) => 'V:' + JSON.stringify(v), (e) => 'T:' + String(e && e.message))\ns(__r)`;
  const r = await host.analyze(code, opts());
  if (!r.ok) return `FAILED: ${r.error.kind}: ${r.error.message}`;
  const s = r.events[0]?.s ?? "";
  return s.startsWith("V:") ? (JSON.parse(s.slice(2)) as unknown) : `THREW: ${s.slice(2)}`;
}

for (const backend of ["bun-worker", "bun-subprocess"] as const) {
  describe(`GraderHost [${backend}]`, () => {
    let host: HostCore;
    beforeAll(async () => {
      await initRealm({ toolbox: [], lockdown: false });
      host = createBunGraderHost({ backend, toolbox: [] });
      await host.ready();
    });
    afterAll(async () => {
      await host.dispose();
    });

    test("cold start: realm ready with the full scope, stubs and lockdown", async () => {
      const ready = (await host.ready()) as Awaited<ReturnType<HostCore["ready"]>> & {
        lockdown?: { neutered: string[]; failed: string[] };
      };
      expect(ready.kind).toBe("ready");
      expect(ready.scopeSize).toBeGreaterThan(900);
      expect(ready.stubbedMethods).toContain("pianoroll");
      expect(ready.lockdown?.failed).toEqual([]);
      expect(ready.lockdown?.neutered).toEqual(
        expect.arrayContaining([
          "Function.prototype.constructor",
          "globalThis.Function",
          "globalThis.eval",
          "globalThis.ShadowRealm",
          "globalThis.fetch",
        ]),
      );
      expect(host.backend).toBe(backend);
    });

    test("ping, analyze and lint round trips; the locked-down realm gives the in-process events", async () => {
      expect(await host.ping()).toMatchObject({ ok: true, kind: "ping" });
      const code =
        'setcpm(100/4)\ndrums: s("bd*2, hh*4")\nchords: chord("<C Am>").voicing()\nmel: n("0 2 4 3#").scale("D4:major").s("piano")';
      const remote = ok(await host.analyze(code, opts({ bars: 2 })));
      const local = ok(await evaluateForGrading(code, opts({ bars: 2 })));
      expect(remote.events).toEqual(local.events);
      expect(remote).toMatchObject({ cps: local.cps, bpm: 100, tracks: ["drums", "chords", "mel"] });
      const lintCtx: LintContext = {
        profile: "graded",
        unlocked: new Set(["tb.s"]),
        allowPreview: false,
        meter: "4/4",
        key: null,
      };
      const lint = await host.lint('$: s("bd")', lintCtx);
      expect(lint.diagnostics.map((d) => d.id)).toContain("code.dollar-label");
    });

    test("problems in the code come back as typed failures, never as exceptions", async () => {
      expect(await host.analyze('note("c4"', opts())).toMatchObject({ ok: false, error: { kind: "eval" } });
      expect(await host.analyze('note("c4").scaleTranspose(1)', opts())).toMatchObject({
        ok: false,
        error: { kind: "query" },
      });
      expect(await host.analyze("42", opts())).toMatchObject({ ok: false, error: { kind: "not-a-pattern" } });
    });

    test("a grade request that cannot be answered resolves to an error-status GradeResult", async () => {
      const r = await host.grade({
        exercise: { kind: "run", id: "x", version: 3 } as never,
        response: { code: 's("bd")' },
        ctx: {
          exerciseGlobalId: "U01.L01/x",
          mode: "lesson",
          attemptNo: 1,
          firstAttempt: true,
          rung: 0,
          tutorHints: 0,
          extraReplays: 0,
        } as never,
      });
      expect(r).toMatchObject({ exerciseId: expect.any(String), mode: "lesson" });
      expect(["pass", "fail", "error", "ungraded"]).toContain(r.status);
    });

    test("KILL PATH: `while(true){}` is stopped at the 1.5 s deadline and the warm spare serves the next request", async () => {
      const before = { kills: host.stats.kills, spawns: host.stats.spawns };
      const t0 = performance.now();
      const res = await host.analyze('while (true) {}\ns("bd")', opts());
      const wall = performance.now() - t0;
      expect(res).toMatchObject({ ok: false, error: { kind: "timeout" } });
      expect(wall).toBeGreaterThanOrEqual(1490);
      expect(wall).toBeLessThan(2500);
      expect(host.stats.kills).toBe(before.kills + 1);
      expect(host.stats.spawns).toBe(before.spawns + 1); // the next spare
      const t1 = performance.now();
      const next = ok(await host.analyze('s("bd sd")', opts()));
      expect(next.events.map((e) => e.s)).toEqual(["bd", "sd"]);
      expect(performance.now() - t1).toBeLessThan(1000);
      // the killed realm is gone: no CPU burnt while idle
      const c0 = process.cpuUsage();
      await sleep(300);
      expect(process.cpuUsage(c0).user / 1000).toBeLessThan(200);
    });

    test("the work budget stops a huge pattern inside the realm: no kill needed", async () => {
      const kills0 = host.stats.kills;
      const t0 = performance.now();
      expect(await host.analyze('s("bd*1000000")', opts({ bars: 4 }))).toMatchObject({
        ok: false,
        error: { kind: "too-much-work" },
      });
      expect(performance.now() - t0).toBeLessThan(1400);
      expect(await host.analyze('s("bd*64")', opts({ bars: 4, hapCap: 100 }))).toMatchObject({
        ok: false,
        error: { kind: "too-many-events" },
      });
      expect(host.stats.kills).toBe(kills0);
    });

    test("without the budget the same pattern needs the kill path", async () => {
      const kills0 = host.stats.kills;
      expect(await host.analyze('s("bd*1000000")', opts({ bars: 4, fuel: 1e15 }))).toMatchObject({
        ok: false,
        error: { kind: "timeout" },
      });
      expect(host.stats.kills).toBe(kills0 + 1);
      expect((await host.analyze("s('bd')", opts())).ok).toBe(true);
    });

    test("an un-awaited rejection in the code does not lose the next request", async () => {
      expect((await host.analyze("Promise.reject(new Error('x'))\ns('bd')", opts())).ok).toBe(true);
      await sleep(50);
      expect((await host.analyze("s('hh')", opts())).ok).toBe(true);
    });

    // --- what evaluated code can reach (all layers on: env {}, shadowing, lockdown, import ban) ----------
    test("L2 shadowing: host globals are undefined; Strudel and the safe builtins remain", async () => {
      expect(
        await probe(
          host,
          "return [typeof Bun, typeof process, typeof fetch, typeof require, typeof globalThis, typeof self, typeof postMessage, typeof WebSocket, typeof Worker, typeof setTimeout, typeof ShadowRealm, typeof WebAssembly, typeof Reflect, typeof Proxy, typeof queueMicrotask, typeof evaluate, typeof evalScope, typeof strudelScope].join(',')",
        ),
      ).toBe(Array(18).fill("undefined").join(","));
      expect(
        await probe(
          host,
          "return [typeof note, typeof stack, typeof Math, typeof JSON, typeof console.log, typeof silence].join(',')",
        ),
      ).toBe("function,function,object,object,function,object");
      expect(String(await probe(host, `return await Bun.file('${CANARY_FILE}').text()`))).toStartWith(
        "THREW:",
      );
    });

    test("`this` never leaks the global object", async () => {
      expect(
        await probe(
          host,
          "return [typeof this, typeof (function(){ return this })(), typeof [0].map(function(){ return this })[0]].join(',')",
        ),
      ).toBe("undefined,undefined,undefined");
    });

    test("L3 lockdown: every route to a Function constructor throws", async () => {
      const routes = [
        "return (()=>{}).constructor('return typeof Bun')()",
        "return [].constructor.constructor('return typeof process')()",
        "return ''.constructor.constructor('return 1')()",
        "return await (async()=>{}).constructor('return typeof Bun')()",
        "return (function*(){}).constructor('yield 1')().next().value",
        "return typeof (async function*(){}).constructor('yield 1')",
        "return eval('typeof Bun')",
        "return (0, eval)('this')",
        "return note.constructor('return 1')()",
        "return console.log.constructor('return 1')()",
        "const k = 'con' + 'structor'; return (()=>{})[k]('return 1')()",
        "return Object.getPrototypeOf(async () => {}).constructor('return 1')",
      ];
      for (const body of routes)
        expect([body, String(await probe(host, body)).slice(0, 6)]).toEqual([body, "THREW:"]);
      expect(
        await probe(
          host,
          "return Object.values(Object.getOwnPropertyDescriptors(Object.getPrototypeOf(()=>1))).map(d => d.value && d.value.name).filter(Boolean).join('|')",
        ),
      ).toBe("toString|apply|call|bind|blockedConstructor");
    });

    test("L4 import ban: import() and import.meta are refused before evaluation", async () => {
      const readFs = `const fs = await import('node:fs'); return fs.readFileSync('${CANARY_FILE}', 'utf8')`;
      expect(String(await probe(host, readFs))).toStartWith("FAILED: eval");
      for (const sneaky of [
        "const f = async (m) => await import(m); return typeof (await f('node:' + 'fs')).readFileSync",
        "return typeof (await import(/* c */ 'node:fs')).readFileSync",
        "return typeof (await import\n('node:fs')).readFileSync",
        "return typeof import.meta",
      ]) {
        expect([sneaky, String(await probe(host, sneaky)).slice(0, 12)]).toEqual([sneaky, "FAILED: eval"]);
      }
      expect(await probe(host, "const x = { import: 1 }; return x.import")).toBe(1);
    });

    test("the realm keeps the native SyntaxError", async () => {
      expect(await probe(host, "return String(SyntaxError).includes('[native code]')")).toBe(true);
    });

    test("REMAINS (documented): builtin prototypes are shared by the requests of one realm until it respawns", async () => {
      expect(await probe(host, "Array.prototype.oakPoison = 'left behind'; return 1")).toBe(1);
      expect(await probe(host, "return [].oakPoison ?? null")).toBe("left behind");
      expect(await probe(host, "delete Array.prototype.oakPoison; return [].oakPoison ?? null")).toBe(null);
    });
  });
}

describe("host behaviour", () => {
  test("FIFO: requests behind a stuck one are answered, in order", async () => {
    const host = createBunGraderHost({ backend: "bun-worker", toolbox: [], timeoutMs: 300 });
    try {
      await host.ready();
      const order: string[] = [];
      const track = <T>(label: string, p: Promise<T>) =>
        p.then((v) => {
          order.push(label);
          return v;
        });
      const [a, b, c, d] = await Promise.all([
        track("a", host.analyze('s("bd")', opts())),
        track("b", host.analyze("while (true) {}\ns('bd')", opts())),
        track("c", host.analyze('note("c4 e4")', opts())),
        track("d", host.analyze('s("hh*4")', opts())),
      ]);
      expect(order).toEqual(["a", "b", "c", "d"]);
      expect([a.ok, b.ok, c.ok, d.ok]).toEqual([true, false, true, true]);
      expect(ok(c).events.map((e) => e.midi)).toEqual([60, 64]);
    } finally {
      await host.dispose();
    }
  });

  test("microtask starvation and tail-call recursion are ended by the kill path", async () => {
    for (const backend of ["bun-worker", "bun-subprocess"] as const) {
      const host = createBunGraderHost({ backend, toolbox: [], timeoutMs: 300 });
      try {
        expect(
          await host.analyze("const f = async () => { for (;;) await null }\nawait f()\ns('bd')", opts()),
        ).toMatchObject({
          ok: false,
          error: { kind: "timeout" },
        });
        expect(await host.analyze("const f = () => f()\nf()\ns('bd')", opts())).toMatchObject({
          ok: false,
          error: { kind: "timeout" },
        });
        expect((await host.analyze("s('bd')", opts())).ok).toBe(true);
      } finally {
        await host.dispose();
      }
    }
  });

  test("kill and respawn 10 times in a row at 100 ms: every kill works, every next request is served", async () => {
    for (const backend of ["bun-worker", "bun-subprocess"] as const) {
      const host = createBunGraderHost({ backend, toolbox: [], timeoutMs: 100 });
      try {
        await host.ready();
        for (let i = 0; i < 10; i++) {
          expect(await host.analyze("for (;;) {}\ns('bd')", opts())).toMatchObject({
            ok: false,
            error: { kind: "timeout" },
          });
          expect((await host.analyze("s('bd')", opts())).ok).toBe(true);
        }
        expect(host.stats.kills).toBe(10);
        expect(host.stats.crashes).toBe(0);
      } finally {
        await host.dispose();
      }
    }
  });

  test("an aborted request kills the realm and resolves; the next request is served", async () => {
    const host = createBunGraderHost({ backend: "bun-worker", toolbox: [], timeoutMs: 5000 });
    try {
      await host.ready();
      const ac = new AbortController();
      const p = host.analyze("while (true) {}\ns('bd')", opts(), ac.signal);
      setTimeout(() => ac.abort(), 100);
      const t0 = performance.now();
      expect(await p).toMatchObject({ ok: false, error: { kind: "internal", message: "aborted" } });
      expect(performance.now() - t0).toBeLessThan(1500);
      expect((await host.analyze("s('bd')", opts())).ok).toBe(true);
    } finally {
      await host.dispose();
    }
  });

  test("timeouts follow the mode: capstone waits 5 s, lesson 1.5 s", async () => {
    const host = createBunGraderHost({ backend: "bun-worker", toolbox: [] });
    try {
      await host.ready();
      const t0 = performance.now();
      const r = await host.analyze(
        "const t = Date.now()\nwhile (Date.now() - t < 2500) {}\ns('bd')",
        opts({ mode: "capstone" }),
      );
      expect(r.ok).toBe(true);
      expect(performance.now() - t0).toBeGreaterThan(2400);
    } finally {
      await host.dispose();
    }
  });

  test("dispose stops every backend (no orphans)", async () => {
    const host = createBunGraderHost({ backend: "bun-subprocess", toolbox: [] });
    await host.ready();
    await host.dispose();
    expect(await host.analyze("s('bd')", opts())).toMatchObject({ ok: false, error: { kind: "internal" } });
  });
});
