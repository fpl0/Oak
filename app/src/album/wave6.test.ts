// The finished record (content/specs/END.md "The record"), takes (d20) and the download of every recording: Side
// A's running order with the single last, the twelve numbered 1–12, the running time without the tracks that have
// no recording, the play-through's next track, which take plays, file names, and the zip archive read back by the
// system's own `unzip`.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AlbumTrack, AlbumTrackDetail, AlbumTrackVersion } from "@oak/api";
import { capstones } from "../../../content/capstones.ts";
import { SIDE_A_ORDER as SPEC_ORDER } from "../../../content/specs/END.ts";
import {
  albumSides,
  atTrackEnd,
  currentTakeOf,
  neighbourCover,
  nextPlayable,
  nowPlayingLine,
  recordFileName,
  recordTitleLine,
  runningOrder,
  SIDE_A_ORDER,
  sideARecord,
  TRACK_GAP_MS,
  takeFileName,
  takesOf,
} from "./model.ts";
import { crc32, dosDateTime, uniqueNames, zipStore } from "./zip.ts";

const metas = capstones.map((c) => ({
  id: c.id,
  title: c.title,
  objective: c.objective,
  sessions: c.sessions,
}));
const track = (capstoneId: string, over: Partial<AlbumTrack> = {}): AlbumTrack => ({
  id: `trk_${capstoneId}`,
  capstoneId: capstoneId as never,
  sketchId: null,
  side: "A",
  trackNo: 1,
  title: `Song ${capstoneId}`,
  flavour: "flavour.pop",
  currentVersion: 1,
  coverSeed: `seed-${capstoneId}`,
  createdAt: "2026-11-01T10:00:00.000Z",
  ...over,
});
const version = (over: Partial<AlbumTrackVersion> = {}): AlbumTrackVersion => ({
  trackId: "t",
  version: 1,
  sketchId: "sk",
  sketchVersion: 1,
  hasAudio: true,
  audioMime: "audio/webm",
  durationS: 20,
  linerNotesMd: "",
  theoryTags: [],
  review: null,
  tutorAssisted: false,
  attribution: null,
  band: null,
  flags: { lockedTools: [], previewTools: [] },
  createdAt: "2026-11-01T10:00:00.000Z",
  ...over,
});
const detail = (t: AlbumTrack, v: Partial<AlbumTrackVersion> = {}): AlbumTrackDetail => ({
  ...t,
  versions: [version({ trackId: t.id, ...v })],
});

describe("Side A's running order", () => {
  test("is the spec's: the core capstones in course order, the single last", () => {
    expect([...SIDE_A_ORDER]).toEqual([...SPEC_ORDER]);
    expect(SIDE_A_ORDER).toHaveLength(12);
    expect(SIDE_A_ORDER.at(-1)).toBe("CF-A");
    expect(SIDE_A_ORDER.at(-2)).toBe("CF-T");
    const core = metas.filter((c) => !/^(JC|RC|AC)\d/.test(c.id));
    expect(runningOrder(core).map((c) => c.id)).toEqual([...SIDE_A_ORDER]);
  });

  test("the album's Side A lists its slots in that order, numbered 1 to 12", () => {
    const side = albumSides([track("CF-A"), track("CF-T")], metas, [])[0];
    expect(side?.slots.map((s) => s.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(side?.slots.slice(-2).map((s) => (s.kind === "track" ? s.track.capstoneId : null))).toEqual([
      "CF-T",
      "CF-A",
    ]);
  });
});

describe("the record", () => {
  const all = SIDE_A_ORDER.map((id) => track(id));
  const details = (skip: readonly string[] = []) =>
    new Map(
      all.map((t, i) => [
        t.id,
        detail(
          t,
          skip.includes(t.capstoneId as string)
            ? { hasAudio: false, durationS: null }
            : { durationS: 30 + i },
        ),
      ]),
    );

  test("twelve released tracks in order: complete, with its running time", () => {
    const r = sideARecord(all, details(), metas);
    expect(r.tracks.map((t) => [t.no, t.capstoneId])).toEqual(SIDE_A_ORDER.map((id, i) => [i + 1, id]));
    expect(r).toMatchObject({ released: 12, total: 12, complete: true, loading: false });
    expect(r.seconds).toBe(12 * 30 + 66);
    expect(recordTitleLine("Oak Sessions", r)).toBe("Oak Sessions · Side A · 12 tracks · 7:06");
  });

  test("a track with no recording is not counted in the time and is skipped in the play-through", () => {
    const r = sideARecord(all, details(["C1", "X1"]), metas);
    expect(r.complete).toBe(true);
    expect(r.playable.map((t) => t.capstoneId)).not.toContain("C1");
    expect(r.seconds).toBe(12 * 30 + 66 - (30 + 1) - (30 + 3));
    expect(nextPlayable(r, 1)?.capstoneId).toBe("C2");
    expect(nextPlayable(r, 3)?.capstoneId).toBe("C3");
    expect(nextPlayable(r, 12)).toBeNull();
    expect(r.tracks[1]).toMatchObject({ hasAudio: false, durationS: null, trackId: "trk_C1" });
  });

  test("before the last release it is not complete, and an unreleased slot keeps its plain title", () => {
    const eleven = all.filter((t) => t.capstoneId !== "CF-A");
    const r = sideARecord(eleven, new Map(eleven.map((t) => [t.id, detail(t)])), metas);
    expect(r).toMatchObject({ released: 11, total: 12, complete: false });
    expect(r.tracks.at(-1)).toMatchObject({ capstoneId: "CF-A", trackId: null, title: "Album Single" });
    expect(recordTitleLine("Evenings", r)).toBe("Evenings · Side A · 11 tracks · 3:40");
  });

  test("details still on their way mark the record as loading; nothing recorded prints no time", () => {
    const r = sideARecord(all, new Map(), metas);
    expect(r.loading).toBe(true);
    expect(r.playable).toEqual([]);
    expect(recordTitleLine("Oak Sessions", r)).toBe("Oak Sessions · Side A · 12 tracks");
    expect(recordTitleLine("Oak Sessions", { released: 1, seconds: 0, playable: [] })).toBe(
      "Oak Sessions · Side A · 1 track",
    );
  });

  test("the line under the button says where the record is", () => {
    const r = sideARecord(all, details(), metas);
    const third = r.tracks[2] as (typeof r.tracks)[number];
    expect(nowPlayingLine(third, r.total, 14.2)).toBe("3 of 12 · Song C2 · 0:14 / 0:32");
    expect(nowPlayingLine({ no: 1, title: "Intro", durationS: null }, 12, 0)).toBe("1 of 12 · Intro · 0:00");
    expect(TRACK_GAP_MS).toBe(1500);
  });

  test("a pause on a track's last frame is its end (integrate:surfaces: Chromium stops a WAV there without ended)", () => {
    expect(atTrackEnd({ currentTime: 20, duration: 20 })).toBe(true);
    expect(atTrackEnd({ currentTime: 19.97, duration: 20 })).toBe(true);
    expect(atTrackEnd({ currentTime: 12, duration: 20 })).toBe(false);
    expect(atTrackEnd({ currentTime: 0, duration: Number.NaN })).toBe(false);
    expect(atTrackEnd({ currentTime: 3, duration: Number.POSITIVE_INFINITY })).toBe(false);
  });

  test("Left and Right move between released covers and stop at the ends", () => {
    const some = [track("C0"), track("C2"), track("CF-A")];
    const r = sideARecord(some, new Map(some.map((t) => [t.id, detail(t)])), metas);
    expect(neighbourCover(r, 1, 1)?.capstoneId).toBe("C2");
    expect(neighbourCover(r, 3, 1)?.capstoneId).toBe("CF-A");
    expect(neighbourCover(r, 12, 1)).toBeNull();
    expect(neighbourCover(r, 1, -1)).toBeNull();
  });

  test("a recording's name in the archive carries its place on the side", () => {
    expect(recordFileName({ no: 3, title: "Four-Chord Song", version: 2, audioMime: "audio/webm" })).toBe(
      "03-four-chord-song.webm",
    );
    expect(recordFileName({ no: 12, title: "The Long Way Round", version: 1, audioMime: "audio/wav" })).toBe(
      "12-the-long-way-round.wav",
    );
  });
});

describe("d20: takes", () => {
  const take = (n: number, durationS = 20) => ({
    take: n,
    audioMime: "audio/webm",
    durationS,
    bytes: 1000,
    recordedAt: `2026-11-0${n}T10:00:00.000Z`,
  });

  test("every take is listed, oldest first; the chosen one plays, else the newest", () => {
    const two = version({ takes: [take(2), take(1)], currentTake: 2 });
    expect(takesOf(two).map((t) => t.take)).toEqual([1, 2]);
    expect(currentTakeOf(two)).toBe(2);
    expect(currentTakeOf(version({ takes: [take(1), take(2), take(3)], currentTake: 1 }))).toBe(1);
    expect(currentTakeOf(version({ takes: [take(1), take(2)] }))).toBe(2);
  });

  test("a server that lists no takes has one recording, take 1; a version without audio has none", () => {
    const old = version({});
    expect(takesOf(old)).toEqual([
      { take: 1, audioMime: "audio/webm", durationS: 20, bytes: 0, recordedAt: old.createdAt },
    ]);
    expect(currentTakeOf(old)).toBe(1);
    const silent = version({ hasAudio: false, audioMime: null, durationS: null });
    expect(takesOf(silent)).toEqual([]);
    expect(currentTakeOf(silent)).toBeNull();
  });

  test("a take's file name says which take it is only when there are several", () => {
    expect(takeFileName("Four-Chord Song", 2, 1, "audio/webm", 1)).toBe("four-chord-song-v2.webm");
    expect(takeFileName("Four-Chord Song", 2, 3, "audio/webm", 3)).toBe("four-chord-song-v2-take3.webm");
    expect(takeFileName("Verse–Chorus Demo", 1, 2, "audio/wav", 2)).toBe("verse-chorus-demo-v1-take2.wav");
  });
});

describe("the archive of every recording", () => {
  test("CRC-32 of the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  test("repeated names are told apart; DOS times count from 1980 in two-second steps", () => {
    expect(uniqueNames(["a.webm", "b.webm", "a.webm", "a.webm", "c"])).toEqual([
      "a.webm",
      "b.webm",
      "a (2).webm",
      "a (3).webm",
      "c",
    ]);
    expect(dosDateTime(new Date(2026, 10, 14, 9, 30, 21))).toEqual({
      time: (9 << 11) | (30 << 5) | 10,
      date: (46 << 9) | (11 << 5) | 14,
    });
  });

  test("the system's unzip lists and extracts what was stored, byte for byte", () => {
    const a = new Uint8Array(5000).map((_, i) => (i * 37) % 251);
    const b = new TextEncoder().encode("RIFF, a second recording");
    const zip = zipStore([
      { name: "01-intro.webm", data: a, date: new Date(2026, 10, 14, 9, 30, 20) },
      { name: "12-the-single.wav", data: b, date: new Date(2026, 10, 14, 9, 31, 0) },
    ]);
    // Local header, central directory and the end record, with the sizes the format asks for.
    expect(new DataView(zip.buffer).getUint32(0, true)).toBe(0x04034b50);
    expect(new DataView(zip.buffer).getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(new DataView(zip.buffer).getUint16(zip.length - 12, true)).toBe(2);
    const dir = mkdtempSync(join(tmpdir(), "oak-zip-"));
    try {
      const file = join(dir, "side-a.zip");
      writeFileSync(file, zip);
      const t = Bun.spawnSync(["unzip", "-t", file]);
      expect(t.exitCode).toBe(0);
      expect(t.stdout.toString()).toContain("No errors detected");
      const x = Bun.spawnSync(["unzip", "-o", "-q", file, "-d", dir]);
      expect(x.exitCode).toBe(0);
      expect(new Uint8Array(readFileSync(join(dir, "01-intro.webm")))).toEqual(a);
      expect(new Uint8Array(readFileSync(join(dir, "12-the-single.wav")))).toEqual(b);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an empty archive is still an archive", () => {
    const zip = zipStore([]);
    expect(zip.length).toBe(22);
    expect(new DataView(zip.buffer).getUint32(0, true)).toBe(0x06054b50);
  });
});
