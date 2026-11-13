import { describe, expect, test } from "bun:test";
import type { AlbumTrack, AlbumTrackDetail } from "@oak/api";
import { albumAudioRows, albumAudioTotal, albumRowPlace, audioShare, recordingKey } from "./album-audio.ts";

const track = (
  id: string,
  side: AlbumTrack["side"],
  trackNo: number,
  currentVersion: number,
): AlbumTrack => ({
  id,
  capstoneId: null,
  sketchId: null,
  side,
  trackNo,
  title: `Track ${id}`,
  flavour: null,
  currentVersion,
  coverSeed: id,
  createdAt: "2026-11-01T10:00:00.000Z",
});
const versions = (...v: [number, boolean, number | null][]): Pick<AlbumTrackDetail, "versions"> => ({
  versions: v.map(([version, hasAudio, durationS]) => ({ version, hasAudio, durationS }) as never),
});

describe("album recordings in Settings › Data", () => {
  const tracks = [track("b", "Bside", 1, 1), track("a2", "A", 2, 2), track("a1", "A", 1, 1)];
  const details = {
    a1: versions([1, true, 64]),
    a2: versions([1, true, 70], [2, true, 72], [3, false, null]),
    b: versions([1, false, null]),
  };

  test("one row per version with a recording, side A first, newest version first", () => {
    const rows = albumAudioRows(tracks, details, { [recordingKey("a2", 2)]: 2_000_000 });
    expect(rows.map((r) => `${r.trackId} v${r.version}${r.current ? "*" : ""}`)).toEqual([
      "a1 v1*",
      "a2 v2*",
      "a2 v1",
    ]);
    expect(rows[1]?.bytes).toBe(2_000_000);
    expect(rows[2]?.bytes).toBeNull();
    expect(rows[0]?.durationS).toBe(64);
  });

  test("tracks whose details have not loaded yet have no rows", () => {
    expect(albumAudioRows(tracks, {}, {})).toEqual([]);
  });

  test("the total is the server's when given, else the known sizes", () => {
    const rows = albumAudioRows(tracks, details, {
      [recordingKey("a1", 1)]: 100,
      [recordingKey("a2", 2)]: 200,
      [recordingKey("a2", 1)]: 300,
    });
    expect(albumAudioTotal(rows, 999)).toEqual({ files: 3, bytes: 999, known: true });
    expect(albumAudioTotal(rows, undefined)).toEqual({ files: 3, bytes: 600, known: true });
    expect(albumAudioTotal(albumAudioRows(tracks, details, {}), undefined).known).toBe(false);
  });

  test("its place on the album in words", () => {
    expect(albumRowPlace({ side: "A", trackNo: 3, version: 2 })).toBe("Side A · track 3 · v2");
    expect(albumRowPlace({ side: "Bside", trackNo: 1, version: 1 })).toBe("B-side · track 1 · v1");
  });

  test("the backup help names both shares only when each is known", () => {
    expect(audioShare(24 * 1024, 1024 * 1024)).toBe(
      " Your own recordings are 24 KB of that. The album's recordings are 1.0 MB.",
    );
    expect(audioShare(24 * 1024, null)).toBe(" Your own recordings are 24 KB of that.");
    expect(audioShare(null, 2048)).toBe(" The album's recordings are 2.0 KB of that.");
    expect(audioShare(null, null)).toBe("");
  });
});
