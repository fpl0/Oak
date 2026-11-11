// The browser host's code path (module Worker, postMessage protocol, kill on timeout) run under Bun,
// whose Worker implements the same web API. The in-browser run is covered by the app's e2e suite.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { createBrowserGraderHost } from "./browser.dom.ts";

setDefaultTimeout(30_000);

describe("createBrowserGraderHost", () => {
  test("module Worker backend: ready, analyze, kill at the deadline, respawn", async () => {
    const host = createBrowserGraderHost({ toolbox: [], timeoutMs: 400, spare: false });
    try {
      expect(host.backend).toBe("web-worker");
      expect((await host.ready()).scopeSize).toBeGreaterThan(900);
      const r = await host.analyze('note("c4 e4")', { mode: "lesson", bars: 1, lint: null });
      expect(r.ok && r.events.map((e) => e.midi)).toEqual([60, 64]);
      expect(
        await host.analyze("while (true) {}\ns('bd')", { mode: "lesson", bars: 1, lint: null }),
      ).toMatchObject({
        ok: false,
        error: { kind: "timeout" },
      });
      expect((await host.analyze('s("bd")', { mode: "lesson", bars: 1, lint: null })).ok).toBe(true);
      expect(host.stats).toMatchObject({ backend: "web-worker", kills: 1, spawns: 2 });
    } finally {
      await host.dispose();
    }
  });
});
