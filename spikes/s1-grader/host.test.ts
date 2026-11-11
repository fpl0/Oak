// SPIKE S1 — goal 4: the grader behind a request/response protocol in a Bun Worker (and the subprocess fallback),
// timeout kill path, hap/work cap, cold-start + latency measurements.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { GraderHost, type HostMode } from "./host.ts";
import { analyze, type AnalyzeResult } from "./runtime.ts";

// bun's default per-test timeout is 5 s (the root bunfig `[test] timeout = 20000` is NOT applied by Bun 1.4.4);
// the kill-path tests legitimately take seconds, more on a loaded machine.
setDefaultTimeout(60_000);

const LESSON =
  'setcpm(120/4)\ndrums: s("bd*4, [~ sd]*2, hh*8").bank("RolandTR909")\nchords: chord("<C Am F G>").voicing()\nmel: n("0 2 4 <6 7>").scale("C4:major")';
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] as number;
const f1 = (x: number) => x.toFixed(1);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (const mode of ["worker", "subprocess"] as HostMode[]) {
  describe(`GraderHost [${mode}]`, () => {
    let host: GraderHost;
    let coldMs = 0;

    beforeAll(async () => {
      const t0 = performance.now();
      host = new GraderHost({ mode, timeoutMs: 1500, allowProbe: true });
      await host.ready();
      coldMs = performance.now() - t0;
    });
    afterAll(async () => {
      await host.dispose();
    });

    test("cold start: spawn -> realm ready (import Strudel, evalScope, stubs, lockdown)", () => {
      const ready = host.lastReady;
      console.log(`[measure][${mode}] cold start ${f1(coldMs)} ms (in-realm init ${f1(ready?.initMs ?? 0)} ms)`);
      expect(ready?.lockdown?.failed).toEqual([]);
      expect(ready?.lockdown?.neutered).toEqual([
        "Function.prototype.constructor",
        "AsyncFunction.prototype.constructor",
        "GeneratorFunction.prototype.constructor",
        "AsyncGeneratorFunction.prototype.constructor",
        "globalThis.Function",
        "globalThis.eval",
        "globalThis.ShadowRealm",
      ]);
      expect(coldMs).toBeLessThan(3000);
    });

    test("ping + analyze round trip; result is identical to the in-process runtime (lockdown breaks nothing)", async () => {
      expect(await host.request({ kind: "ping" })).toMatchObject({ ok: true, result: "pong" });
      const codes = [
        LESSON,
        '$: s("bd")\n_$: s("cp")\nS$: s("hh*2")',
        'chord("<C^7 Am7 Dm7 G7>").dict("lefthand").voicing()',
        'n("3# 6b 2b").scale("C4:major")',
        's("hh*8").swingBy(1/3, 4)',
        'arrange([2, note("c4")], [2, note("e4 g4")]).transpose(2)',
        'note("c4 e4").off(1/8, x => x.add(note(7))).jux(rev).every(2, x => x.fast(2)).pianoroll()',
        'chord("<Cmaj7 C>").voicing()',
      ];
      for (const code of codes) {
        const res = await host.analyze(code, { bars: 4 });
        if (!res.ok) throw new Error(`${code}: ${JSON.stringify(res.error)}`);
        const remote = res.result as AnalyzeResult;
        const local = await analyze(code, { bars: 4 });
        expect(remote.events).toEqual(local.events);
        expect(remote.tracks).toEqual(local.tracks);
        expect(remote.cps).toBe(local.cps);
        expect(remote.logs).toEqual(local.logs);
        expect(remote.miniLocations).toEqual(local.miniLocations);
      }
    });

    test("errors come back as typed responses, not exceptions", async () => {
      expect(await host.analyze('note("c4 [e4")')).toMatchObject({ ok: false, error: { kind: "eval" } });
      expect(await host.analyze('note("c4").scaleTranspose(1)')).toMatchObject({ ok: false, error: { kind: "query" } });
      expect(await host.analyze("42")).toMatchObject({ ok: false, error: { kind: "not-a-pattern" } });
      const lint = await host.analyze("fetch('http://localhost')\ns('bd')", { lint: "strict" });
      expect(lint).toMatchObject({ ok: false, error: { kind: "lint" } });
      expect(!lint.ok && lint.error.lint?.[0]).toMatchObject({ rule: "banned-identifier", start: 0, end: 5 });
    });

    test("per-evaluation latency (warm)", async () => {
      const round: number[] = [];
      const inside: number[] = [];
      for (let i = 0; i < 200; i++) {
        const t0 = performance.now();
        const r = await host.analyze(LESSON, { bars: 8 });
        round.push(performance.now() - t0);
        inside.push(r.ms);
        if (!r.ok) throw new Error(JSON.stringify(r.error));
      }
      console.log(
        `[measure][${mode}] analyze(3 tracks, 8 bars, 198 events) x200: round trip p50 ${pct(round, 0.5).toFixed(2)} ms, p95 ${pct(round, 0.95).toFixed(2)} ms, max ${Math.max(...round).toFixed(2)} ms | in-realm p50 ${pct(inside, 0.5).toFixed(2)} ms`,
      );
      expect(pct(round, 0.5)).toBeLessThan(50);
    });

    test("KILL PATH: `while(true){}` is terminated at the 1.5 s deadline and a fresh backend serves the next request", async () => {
      const before = { ...host.stats, killMs: [...host.stats.killMs] };
      const t0 = performance.now();
      const res = await host.analyze('while (true) {}\ns("bd")');
      const wall = performance.now() - t0;
      expect(res).toMatchObject({ ok: false, error: { kind: "timeout" } });
      expect(wall).toBeGreaterThanOrEqual(1490);
      expect(wall).toBeLessThan(1500 + 1000); // deadline + kill; generous for a loaded CI machine (measured: +5…30 ms)
      expect(host.stats.kills).toBe(before.kills + 1);
      expect(host.stats.spawns).toBe(before.spawns + 1);

      const t1 = performance.now();
      const next = await host.analyze('s("bd sd")', { bars: 1 });
      const recover = performance.now() - t1;
      expect(next.ok && (next.result as AnalyzeResult).events.map((e) => e.s)).toEqual(["bd", "sd"]);
      console.log(
        `[measure][${mode}] while(true): response after ${f1(wall)} ms (timeout 1500); kill took ${f1(host.stats.killMs.at(-1) ?? 0)} ms; next request on the fresh backend answered in ${f1(recover)} ms`,
      );
      expect(recover).toBeLessThan(1000);

      // the killed realm is really gone: this process burns no CPU while idle
      const c0 = process.cpuUsage();
      await sleep(300);
      const c = process.cpuUsage(c0);
      console.log(`[measure][${mode}] CPU in the 300 ms after the kill: user ${f1(c.user / 1000)} ms`);
      expect(c.user / 1000).toBeLessThan(150);
    });

    test("KILL PATH also covers microtask starvation and tail-call recursion", async () => {
      expect(await host.analyze("const f = async () => { for (;;) await null }\nawait f()\ns('bd')", { timeoutMs: 300 })).toMatchObject({ ok: false, error: { kind: "timeout" } });
      // JSC does proper tail calls in strict mode: this never overflows the stack, it just spins
      expect(await host.analyze("const f = () => f()\nf()\ns('bd')", { timeoutMs: 300 })).toMatchObject({ ok: false, error: { kind: "timeout" } });
      expect(await host.analyze("s('bd')")).toMatchObject({ ok: true });
    });

    test("kill + respawn 20 times in a row (100 ms timeout): every kill works, every next request is served", async () => {
      const walls: number[] = [];
      const kills0 = host.stats.kills;
      for (let i = 0; i < 20; i++) {
        const t0 = performance.now();
        const dead = await host.analyze("for (;;) {}\ns('bd')", { timeoutMs: 100 });
        expect(dead).toMatchObject({ ok: false, error: { kind: "timeout" } });
        const alive = await host.analyze("s('bd')", { bars: 1 });
        expect(alive.ok).toBe(true);
        walls.push(performance.now() - t0);
      }
      expect(host.stats.kills).toBe(kills0 + 20);
      console.log(
        `[measure][${mode}] 20x (kill at 100 ms + next request): wall min ${f1(Math.min(...walls))} / p50 ${f1(pct(walls, 0.5))} / max ${f1(Math.max(...walls))} ms; kill p50 ${f1(pct(host.stats.killMs, 0.5))} ms, max ${f1(Math.max(...host.stats.killMs))} ms; respawn p50 ${f1(pct(host.stats.spawnMs, 0.5))} ms`,
      );
      expect(Math.max(...walls)).toBeLessThan(2000);
    });

    test('HAP CAP: s("bd*1000000") aborts inside the realm (no kill needed), quickly', async () => {
      const kills0 = host.stats.kills;
      const t0 = performance.now();
      const res = await host.analyze('s("bd*1000000")', { bars: 4 });
      const ms = performance.now() - t0;
      console.log(`[measure][${mode}] s("bd*1000000") -> ${!res.ok && res.error.kind} in ${f1(ms)} ms`);
      expect(res).toMatchObject({ ok: false, error: { kind: "too-much-work" } });
      expect(ms).toBeLessThan(1400); // measured 170–210 ms idle, up to ~760 ms at load average 19
      expect(await host.analyze('s("bd*64")', { bars: 4, hapCap: 100 })).toMatchObject({ ok: false, error: { kind: "too-many-events" } });
      expect(host.stats.kills).toBe(kills0);
    });

    test("without the fuel budget the same pattern needs the kill path (1M haps do not fit in 1.5 s)", async () => {
      const kills0 = host.stats.kills;
      const res = await host.analyze('s("bd*1000000")', { bars: 4, fuel: 1e15 });
      expect(res).toMatchObject({ ok: false, error: { kind: "timeout" } });
      expect(host.stats.kills).toBe(kills0 + 1);
      expect(await host.analyze("s('bd')")).toMatchObject({ ok: true });
    });

    test("FIFO queue: requests behind a stuck one are still answered, in order", async () => {
      const order: string[] = [];
      const track = <T>(label: string, p: Promise<T>) => p.then((v) => (order.push(label), v));
      const [a, b, c, d] = await Promise.all([
        track("a", host.analyze('s("bd")', { bars: 1 })),
        track("b", host.analyze("while (true) {}\ns('bd')", { timeoutMs: 200 })),
        track("c", host.analyze('note("c4 e4")', { bars: 1 })),
        track("d", host.analyze('s("hh*4")', { bars: 1 })),
      ]);
      expect(order).toEqual(["a", "b", "c", "d"]);
      expect(a.ok && b.ok === false && c.ok && d.ok).toBe(true);
      expect(c.ok && (c.result as AnalyzeResult).events.map((e) => e.midi)).toEqual([60, 64]);
    });

    test("the realm has an empty environment (env: {})", async () => {
      process.env.OAK_CANARY_SECRET = "sekrit";
      const fresh = new GraderHost({ mode, allowProbe: true });
      try {
        const res = await fresh.request({
          kind: "probe",
          shadow: false, // bare realm: look at the real process object
          transpile: false,
          code: "return { keys: Object.keys(process.env).length, canary: process.env.OAK_CANARY_SECRET ?? null, bun: Bun.env.OAK_CANARY_SECRET ?? null }",
        });
        expect(res).toMatchObject({ ok: true, result: { keys: 0, canary: null, bun: null } });
      } finally {
        delete process.env.OAK_CANARY_SECRET;
        await fresh.dispose();
      }
    });
  });
}
