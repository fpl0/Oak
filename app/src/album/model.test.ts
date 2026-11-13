import { describe, expect, test } from "bun:test";
import type { AlbumTrack, CapstoneStatus } from "@oak/api";
import { albumSides, audioFileName, changeSummary, runtime, sideOfCapstone, tidyReason } from "./model.ts";

const cap = (id: string, title: string) => ({ id: id as never, title, objective: `${title}.`, sessions: 1 });
const capstones = [
  cap("C0", "C0 Intro"),
  cap("C1", "C1 First Loop"),
  cap("C2", "C2 Four-Chord Song"),
  cap("JC1", "JC1 ii–V Ballad"),
];
const status = (
  id: string,
  s: CapstoneStatus["status"],
  lockedReason: string | null = null,
): CapstoneStatus => ({
  capstoneId: id as never,
  status: s,
  lockedReason,
  sessionsDone: 0,
  sessionsTotal: 1,
  sketchId: null,
  trackId: null,
});
const track = (over: Partial<AlbumTrack>): AlbumTrack => ({
  id: "trk_1",
  capstoneId: "C0" as never,
  sketchId: null,
  side: "A",
  trackNo: 1,
  title: "Intro",
  flavour: "flavour.pop",
  currentVersion: 1,
  coverSeed: "s1",
  createdAt: "2026-11-11T10:00:00.000Z",
  ...over,
});

describe("the record", () => {
  test("side A lists every core capstone in course order; released ones fill their slot", () => {
    const sides = albumSides([track({})], capstones, [
      status("C0", "released"),
      status("C1", "open"),
      status("C2", "locked", "Opens after the U07 checkpoint"),
      status("JC1", "locked"),
    ]);
    expect(sides.map((s) => s.side)).toEqual(["A"]);
    const a = sides[0]?.slots ?? [];
    expect(a.map((s) => (s.kind === "track" ? s.track.title : s.capstone.id))).toEqual(["Intro", "C1", "C2"]);
    expect(a[2]).toMatchObject({
      kind: "empty",
      no: 3,
      status: "locked",
      lockedReason: "Opens after the U07 checkpoint",
    });
  });

  test("side B appears once an advanced capstone is open; B-sides once there is one", () => {
    const sides = albumSides(
      [track({ id: "b1", capstoneId: null, sketchId: "sk1", side: "Bside", title: "Sketch 4", trackNo: 1 })],
      capstones,
      [status("JC1", "open")],
    );
    expect(sides.map((s) => s.side)).toEqual(["A", "B", "Bside"]);
    expect(sides[2]?.slots[0]).toMatchObject({ kind: "track", no: 1 });
    expect(sideOfCapstone("C7")).toBe("A");
    expect(sideOfCapstone("CF-A")).toBe("A");
    expect(sideOfCapstone("RC2")).toBe("B");
  });

  test("locked reasons read once", () => {
    expect(tidyReason("Opens after the Melody checkpoint checkpoint.")).toBe(
      "Opens after the Melody checkpoint.",
    );
    expect(tidyReason(null)).toBeNull();
  });

  test("runtime and change summaries", () => {
    expect(runtime(null)).toBe("—");
    expect(runtime(125.4)).toBe("2:05");
    expect(changeSummary(null, "a")).toBe("First release");
    expect(changeSummary("a\nb", "a\nb")).toBe("Same code, new recording");
    expect(changeSummary("a\nb\nc", "a\nB\nc\nd")).toBe("1 line changed, 1 added");
    expect(changeSummary("a\nb\nc", "a")).toBe("2 removed");
  });
});

describe("audioFileName", () => {
  test("a slug of the title, the version and the recording's own extension", () => {
    expect(audioFileName("Four-Chord Song", 2, "audio/webm;codecs=opus")).toBe("four-chord-song-v2.webm");
    expect(audioFileName("Aura Lee (1861)", 1, "audio/ogg")).toBe("aura-lee-1861-v1.ogg");
    expect(audioFileName("!!!", 3, null)).toBe("track-v3.webm");
  });
});
