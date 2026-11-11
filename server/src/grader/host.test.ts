// The server's two grader hosts: learner code in a Bun Worker, model-written code in a subprocess with
// the strict tutor-card lint.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolEntry } from "@oak/content-kit";
import { createGraderHosts, type GraderHosts, loadToolbox, tutorEvalOptions } from "./host.ts";

setDefaultTimeout(60_000);

const tool = (id: string, code: string): ToolEntry => ({
  id: id as ToolEntry["id"],
  kind: id.startsWith("snd.") ? "sound" : "tool",
  code,
  unlock: { at: "U01.L01", when: "complete" },
  concept: "test",
  catalog: { signature: code, meaning: "test", demo: 'setcpm(120/4)\n\ndrums: s("bd")' },
});
const TOOLBOX = [
  tool("tb.s", 's("…")'),
  tool("tb.setcpm", "setcpm(bpm/4)"),
  tool("tb.label", "labels"),
  tool("snd.drum.bd", "`bd`"),
  tool("tb.fast", ".fast(n)"),
  tool("tb.mini.alt", "<a b>"),
  tool("tb.mini.seq", "a b"),
  tool("tb.mini.repeat", "x*n"),
];

describe("loadToolbox", () => {
  test("reads content/.generated/toolbox.json, validates it, and treats a missing file as empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "oak-toolbox-"));
    try {
      expect(loadToolbox(dir)).toEqual([]);
      mkdirSync(join(dir, ".generated"));
      writeFileSync(join(dir, ".generated", "toolbox.json"), JSON.stringify(TOOLBOX));
      expect(loadToolbox(dir).map((e) => e.id)).toEqual(TOOLBOX.map((e) => e.id));
      writeFileSync(join(dir, ".generated", "toolbox.json"), JSON.stringify([{ id: "nope" }]));
      expect(() => loadToolbox(dir)).toThrow("ToolEntry schema");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("createGraderHosts", () => {
  let hosts: GraderHosts;
  beforeAll(async () => {
    hosts = createGraderHosts({ toolbox: TOOLBOX, spare: false });
    await Promise.all([hosts.learner.ready(), hosts.tutor.ready()]);
  });
  afterAll(async () => {
    await hosts.dispose();
  });

  test("learner code runs in a Bun Worker, model-written code in a subprocess", async () => {
    expect(hosts.learner.backend).toBe("bun-worker");
    expect(hosts.tutor.backend).toBe("bun-subprocess");
    const r = await hosts.learner.analyze('setcpm(120/4)\ndrums: s("bd*2")', {
      mode: "lesson",
      bars: 1,
      lint: null,
    });
    expect(r.ok && r.events.map((e) => e.s)).toEqual(["bd", "bd"]);
  });

  test("tutor mode: a 16-bar window from fromBar, the strict lint, locked tools reported", async () => {
    const unlocked = new Set<ToolEntry["id"]>([
      "tb.s",
      "tb.setcpm",
      "tb.label",
      "snd.drum.bd",
      "tb.mini.alt",
      "tb.mini.seq",
      "tb.mini.repeat",
    ]);
    const o = tutorEvalOptions(
      { unlocked, allowPreview: false, meter: "4/4", key: null },
      { fromBar: 3, bars: 40 },
    );
    expect(o).toMatchObject({ mode: "tutor", bars: 16, fromBar: 3, lint: { profile: "tutor-card" } });
    const r = await hosts.tutor.analyze('setcpm(120/4)\n\ndrums: s("<bd bd*2>").fast(2)', o);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bars).toBe(16);
    expect(r.events[0]?.beginF).toBe(2);
    expect(r.lint?.lockedTools).toEqual(["tb.fast"]);
    const strict = await hosts.tutor.analyze('setcpm(120/4)\n\ndrums: s("bd").fmap(x => { return x })', o);
    expect(strict).toMatchObject({ ok: false, error: { kind: "lint" } });
  });
});
