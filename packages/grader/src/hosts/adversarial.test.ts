// Adversarial review of the grader hosts (contracts §11.4): resource exhaustion (memory, respawn storms,
// protocol flooding, log flooding) and the extended escape probe list (S1's, plus console stdin,
// prompt/alert, stack-trace reflection, Strudel's registration doors and realm poisoning).
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { MAX_LOG_LINES } from "../runtime/console.ts";
import { initRealm } from "../runtime/realm.ts";
import type { EvalOptions, GraderReady } from "../types.ts";
import { createBunGraderHost } from "./bun.bun.ts";
import { type Backend, backendShell, HostCore } from "./core.ts";
import { maxRssBytes } from "./limits.ts";

setDefaultTimeout(60_000);

const CANARY_FILE = new URL("./canary.test-data.txt", import.meta.url).pathname;
const opts = (o: Partial<EvalOptions> = {}): EvalOptions => ({ mode: "lesson", bars: 1, lint: null, ...o });

async function probe(host: HostCore, body: string): Promise<unknown> {
  const code = `const __r = await (async () => { ${body} })().then((v) => 'V:' + JSON.stringify(v), (e) => 'T:' + String(e && e.message))\ns(__r)`;
  const r = await host.analyze(code, opts());
  if (!r.ok) return `FAILED: ${r.error.kind}: ${r.error.message}`;
  const s = r.events[0]?.s ?? "";
  return s.startsWith("V:") ? (JSON.parse(s.slice(2)) as unknown) : `THREW: ${s.slice(2)}`;
}

describe("the subprocess memory limit", () => {
  test("the flag parses; anything else means no limit", () => {
    expect(maxRssBytes(["bun", "proc.bun.ts", "--oak-max-rss-mb=512"])).toBe(512 * 1024 * 1024);
    expect(maxRssBytes(["bun", "proc.bun.ts"])).toBeNull();
    expect(maxRssBytes(["--oak-max-rss-mb=abc"])).toBeNull();
    expect(maxRssBytes(["--oak-max-rss-mb=-5"])).toBeNull();
  });

  test("an allocation bomb is killed at the memory limit, long before the wall clock, and the next request is served", async () => {
    const host = createBunGraderHost({
      backend: "bun-subprocess",
      toolbox: [],
      maxRssMb: 400,
      timeoutMs: 20_000,
    });
    try {
      await host.ready();
      const t0 = performance.now();
      const r = await host.analyze(
        "const hog = Array.from({ length: 64 }, (_, i) => new Array(4_000_000).fill(i + 0.5))\ns('bd')",
        opts(),
      );
      const ms = performance.now() - t0;
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.kind).toBe("crashed");
        expect(r.error.message).toContain("memory limit");
      }
      expect(ms).toBeLessThan(15_000);
      expect((await host.analyze("s('bd hh')", opts())).ok).toBe(true);
    } finally {
      await host.dispose();
    }
  });
});

describe("respawn storms", () => {
  const ready: GraderReady = { kind: "ready", initMs: 1, scopeSize: 1, stubbedMethods: [] };

  test("a realm that cannot boot is not respawned for every request; the host recovers after the pause", async () => {
    let broken = true;
    let spawns = 0;
    const spawn = (): Backend => {
      spawns++;
      const { backend, handlers } = backendShell(
        (msg) => {
          if (msg.kind === "init") {
            setTimeout(() => (broken ? handlers.crashed("boot failed") : handlers.ready(ready)), 1);
          } else {
            setTimeout(() => handlers.message({ id: msg.id, ok: true, kind: "ping", ms: 0 }), 1);
          }
        },
        async () => {},
      );
      return backend;
    };
    const host = new HostCore("bun-subprocess", spawn, {
      toolbox: [],
      spare: true,
      bootFailureLimit: 3,
      bootCooldownMs: 300,
    });
    const results = [];
    for (let i = 0; i < 40; i++) results.push(await host.ping());
    expect(results.every((r) => !r.ok)).toBe(true);
    // Without the guard: two spawns per request (current + spare), 80 in all.
    expect(spawns).toBeLessThanOrEqual(5);
    const last = results.at(-1);
    expect(last !== undefined && !last.ok && last.error.message).toContain("failed to start");
    broken = false;
    await new Promise((r) => setTimeout(r, 350));
    expect((await host.ping()).ok).toBe(true);
    await host.dispose();
  });
});

for (const backend of ["bun-worker", "bun-subprocess"] as const) {
  describe(`extended escape probes [${backend}]`, () => {
    let host: HostCore;
    beforeAll(async () => {
      await initRealm({ toolbox: [], lockdown: false });
      host = createBunGraderHost({ backend, toolbox: [] });
      await host.ready();
    });
    afterAll(async () => {
      await host.dispose();
    });

    test("console is not stdin; prompt, alert, confirm and the other host extras are not reachable", async () => {
      expect(await probe(host, "return typeof console[Symbol.asyncIterator]")).toBe("undefined");
      expect(await probe(host, "return Object.keys(console).sort().join(',')")).toBe("error,info,log,warn");
      expect(
        await probe(
          host,
          "return [typeof prompt, typeof alert, typeof confirm, typeof Atomics, typeof SharedArrayBuffer, typeof WeakRef, typeof FinalizationRegistry, typeof Loader, typeof HTMLRewriter, typeof crypto, typeof Blob, typeof Response, typeof URL, typeof performance, typeof Iterator].join(',')",
        ),
      ).toBe(Array(15).fill("undefined").join(","));
      expect(String(await probe(host, "return console.log.call(undefined, 'x') ?? 'ok'"))).toBe("ok");
    });

    test("stack-trace reflection gives neither `this` nor functions of host frames", async () => {
      const body =
        "Error.prepareStackTrace = (e, cs) => cs.map(c => [typeof c.getThis(), typeof c.getFunction()].join(':')); try { return new Error('a').stack } finally { Error.prepareStackTrace = undefined }";
      const frames = (await probe(host, body)) as string[];
      expect(Array.isArray(frames)).toBe(true);
      for (const f of frames) expect(f).toBe("undefined:undefined");
    });

    test("Strudel's own doors back into the realm are shadowed or inert", async () => {
      expect(
        await probe(
          host,
          "return [typeof evaluate, typeof evalScope, typeof strudelScope, typeof repl, typeof worklet].join(',')",
        ),
      ).toBe("undefined,undefined,undefined,undefined,undefined");
      // samples() is a no-op here (no network): a remote URL is never fetched by the grader.
      expect(await probe(host, "await samples('https://127.0.0.1:9/never.json'); return 'inert'")).toBe(
        "inert",
      );
    });

    test("prototype pollution through Strudel's registration functions is healed before the next request", async () => {
      expect(
        await probe(host, "register('oakPoisonA', (x, pat) => pat); return typeof note('c').oakPoisonA"),
      ).toBe("function");
      expect(await probe(host, "return typeof note('c').oakPoisonA")).toBe("undefined");
    });

    test("no route reads the canary file (Bun.file through any door)", async () => {
      for (const body of [
        `return await Bun.file('${CANARY_FILE}').text()`,
        `return await (globalThis.Bun || {}).file('${CANARY_FILE}').text()`,
        `return await fetch('file://${CANARY_FILE}').then(r => r.text())`,
        `return (await import('node:fs')).readFileSync('${CANARY_FILE}', 'utf8')`,
        `return process.binding('fs')`,
        `return require('fs').readFileSync('${CANARY_FILE}', 'utf8')`,
      ]) {
        const out = String(await probe(host, body));
        expect([body, out.includes("canary-file-contents")]).toEqual([body, false]);
      }
    });

    test("a request that logs without end keeps a bounded log", async () => {
      const r = await host.analyze(
        "Array.from({ length: 5000 }, (_, i) => console.log('line ' + i + ' ' + 'x'.repeat(5000)))\ns('bd')",
        opts(),
      );
      expect(r.ok).toBe(true);
      expect(r.logs.length).toBeLessThanOrEqual(MAX_LOG_LINES + 1);
      expect(r.logs.at(-1)?.message).toContain("more log lines not shown");
      for (const l of r.logs) expect(l.message.length).toBeLessThanOrEqual(2001);
    });
  });
}
