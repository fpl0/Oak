// The "re-run the quiet check" suggestion a take leaves behind (ux §4.7; Wave 2 known gap 9).
import { describe, expect, test } from "bun:test";
import type { PitchFrame } from "@oak/pitch";
import {
  BLEED_ADVICE,
  clearRecheck,
  noisyShare,
  recheckNow,
  reportBleed,
  reportTake,
  takeAdvice,
} from "./recheck.ts";

const frames = (n: number, f: Partial<PitchFrame>): PitchFrame[] =>
  Array.from({ length: n }, (_, i) => ({ t: i * 0.0107, hz: 220, clarity: 0.97, rms: 0.05, ...f }));

describe("takeAdvice", () => {
  test("no voice with a high stored floor: the quiet check was probably spoilt", () => {
    const a = takeAdvice({ diagnostics: [{ id: "sing.no-voice" }], floorDb: -38 });
    expect(a?.kind).toBe("high-floor");
    expect(a?.body).toMatch(/-38 dBFS/);
  });
  test("no voice in a quiet room: check the mic", () => {
    expect(takeAdvice({ diagnostics: [{ id: "sing.no-voice" }], floorDb: -62 })?.kind).toBe("no-voice");
    expect(takeAdvice({ diagnostics: [{ id: "sing.no-voice" }], floorDb: null })?.kind).toBe("no-voice");
  });
  test("a noisy take: most loud frames without a clear pitch", () => {
    const noisy = frames(100, { clarity: 0.4, hz: 0 });
    expect(noisyShare(noisy, -60)).toBe(1);
    expect(takeAdvice({ diagnostics: [], frames: noisy, floorDb: -60 })?.kind).toBe("noisy");
    expect(takeAdvice({ diagnostics: [], frames: frames(100, {}), floorDb: -60 })).toBeNull();
    // Quiet frames are not judged at all.
    expect(noisyShare(frames(100, { clarity: 0.2, rms: 1e-4 }), -60)).toBe(0);
  });
  test("the tracker's reason decides: noise is the noisy advice, short blips leave none", () => {
    const nv = (reason: string) => [{ id: "sing.no-voice", params: { db: -50, reason } }];
    expect(takeAdvice({ diagnostics: nv("noisy"), floorDb: -62 })?.kind).toBe("noisy");
    expect(takeAdvice({ diagnostics: nv("short"), floorDb: -62 })).toBeNull();
    expect(takeAdvice({ diagnostics: nv("none"), floorDb: -62 })?.kind).toBe("no-voice");
  });
  test("a good take says nothing", () => {
    expect(takeAdvice({ diagnostics: [{ id: "sing.sharp" }], floorDb: -60 })).toBeNull();
  });
});

test("reportTake keeps the suggestion until the quiet check is run again", () => {
  clearRecheck();
  expect(recheckNow()).toBeNull();
  reportTake({ diagnostics: [{ id: "sing.no-voice" }], floorDb: -40 });
  expect(recheckNow()?.kind).toBe("high-floor");
  reportTake({ diagnostics: [], floorDb: -40 });
  expect(recheckNow()?.kind).toBe("high-floor"); // a good take does not erase it
  clearRecheck();
  expect(recheckNow()).toBeNull();
});

test("sing.bleed (contracts §8.6) leaves the bleed hint with its fallback; so does a live trip of the session", () => {
  clearRecheck();
  expect(takeAdvice({ diagnostics: [{ id: "sing.bleed", params: { ms: 900 } }], floorDb: -60 })).toEqual(
    BLEED_ADVICE,
  );
  // Bleed wins over "no voice": the mic heard something, and it was the playback.
  expect(
    takeAdvice({ diagnostics: [{ id: "sing.bleed" }, { id: "sing.no-voice" }], floorDb: -30 })?.kind,
  ).toBe("bleed");
  expect(BLEED_ADVICE.body.startsWith("The mic hears the playback; use wired headphones.")).toBe(true);
  reportBleed();
  expect(recheckNow()?.kind).toBe("bleed");
  clearRecheck();
});
