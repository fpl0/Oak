// A silent take is never released (review): every part muted, or a bank that did not load, records silence.
import { describe, expect, test } from "bun:test";
import type { EditorHandle, OakStrudel, Recording } from "@oak/strudel";
import { isSilentTake, recordPerformance, SILENT_TAKE } from "./record.ts";

function fakes(peak: number) {
  let cancelled = 0;
  let stopped = 0;
  const take: Recording = { blob: new Blob(["x"]), mime: "audio/webm", durationS: 4 };
  const oak = {
    unlock: async () => {},
    master: { level: () => ({ rms: peak / 2, peak }) },
    recorder: {
      recording: false,
      record: () => new Promise<Recording>((r) => setTimeout(() => r(take), 120)),
      cancel: () => void cancelled++,
    },
  } as unknown as OakStrudel;
  const handle = {
    playing: false,
    disposed: false,
    evaluate: async () => ({ ok: true }),
    play: async () => {},
    stop: () => void stopped++,
  } as unknown as EditorHandle;
  return { oak, handle, take, counts: () => ({ cancelled, stopped }) };
}

describe("silent takes", () => {
  test("the threshold is −70 dBFS", () => {
    expect(isSilentTake(0)).toBe(true);
    expect(isSilentTake(Number.NaN)).toBe(true);
    expect(isSilentTake(0.0002)).toBe(true);
    expect(isSilentTake(0.001)).toBe(false);
    expect(isSilentTake(0.5)).toBe(false);
  });

  test("a silent take is refused with a way forward, and the transport stops", async () => {
    const f = fakes(0);
    await expect(recordPerformance(f.oak, f.handle, 4)).rejects.toThrow(SILENT_TAKE);
    expect(f.counts().stopped).toBe(1);
  });

  test("a take with sound is returned as recorded", async () => {
    const f = fakes(0.4);
    expect(await recordPerformance(f.oak, f.handle, 4)).toBe(f.take);
    expect(f.counts()).toEqual({ cancelled: 0, stopped: 1 });
  });
});
