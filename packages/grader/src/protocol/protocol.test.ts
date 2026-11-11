import { describe, expect, test } from "bun:test";
import { barsToQuery } from "../runtime/caps.ts";
import { decodeWire, encodeWire, isReady, isResponse, modeOf } from "./wire.ts";

describe("wire", () => {
  test("a lint context's Set survives the NDJSON transport", () => {
    const msg = {
      id: "a-1",
      kind: "lint",
      code: "s('bd')",
      ctx: { profile: "graded", unlocked: new Set(["tb.s", "snd.drum.bd"]) },
    };
    const back = decodeWire<typeof msg>(encodeWire(msg));
    expect(back.ctx.unlocked).toBeInstanceOf(Set);
    expect([...back.ctx.unlocked]).toEqual(["tb.s", "snd.drum.bd"]);
    expect(encodeWire(msg)).not.toContain("\n");
  });
  test("message kinds and request modes", () => {
    expect(isReady({ kind: "ready", initMs: 1, scopeSize: 2, stubbedMethods: [] })).toBe(true);
    expect(isResponse({ id: "x", ok: true, kind: "ping", ms: 0 })).toBe(true);
    expect(isResponse({ kind: "ready" })).toBe(false);
    expect(modeOf({ kind: "analyze", code: "", opts: { mode: "capstone", bars: 1, lint: null } })).toBe(
      "capstone",
    );
    expect(modeOf({ kind: "compare", req: {} as never })).toBe("tutor");
    expect(modeOf({ kind: "ping" })).toBe("lesson");
  });
});

describe("barsToQuery (contracts §6.4)", () => {
  test("lesson: min(64, max(reference bars, min(16, period of the answer)))", () => {
    expect(barsToQuery("lesson", 4, 2)).toBe(4);
    expect(barsToQuery("lesson", 4, 8)).toBe(8);
    expect(barsToQuery("lesson", 4, 32)).toBe(16);
    expect(barsToQuery("lesson", 100, 1)).toBe(64);
  });
  test("capstone: the whole piece up to 128; tutor: at most 16", () => {
    expect(barsToQuery("capstone", 96, 4)).toBe(96);
    expect(barsToQuery("capstone", 200, 4)).toBe(128);
    expect(barsToQuery("capstone", 8, 64)).toBe(64);
    expect(barsToQuery("tutor", 40, 4)).toBe(16);
  });
});
