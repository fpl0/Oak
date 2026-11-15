// The album beyond twelve tracks (Wave 7, wave7.md §5.5): Side B holds the eight track capstones numbered in release
// order, the whole record plays Side A then Side B, the record is complete only with all twenty; and Export: the
// request is exactly what `album.source` says the version plays, its file name is safe, and every failure says
// why in plain words and that nothing was saved.
import { describe, expect, test } from "bun:test";
import {
  ALBUM_SIDES,
  type AlbumTrack,
  type AlbumTrackDetail,
  type AlbumTrackVersion,
  OakApiError,
} from "@oak/api";
import { PieceRenderError } from "@oak/strudel/offline";
import { capstones } from "../../../content/capstones.ts";
import {
  bandOf,
  exportErrorText,
  exportProgressText,
  muteMapOf,
  renderRequestOf,
  wavFileName,
} from "../capstone/export.ts";
import { claveSteps16, planBoxes } from "../capstone/TrackCards.tsx";
import {
  albumSides,
  recordTitleLine,
  SIDE_A_ORDER,
  SIDE_B_CAPSTONES,
  sideBOrder,
  sideOfCapstone,
  sideRecord,
  trackFamilyOf,
  wholeNowPlaying,
  wholeRecord,
} from "./model.ts";

const metas = capstones.map((c) => ({
  id: c.id,
  title: c.title,
  objective: c.objective,
  sessions: c.sessions,
}));
const track = (capstoneId: string, at: string, over: Partial<AlbumTrack> = {}): AlbumTrack => ({
  id: `trk_${capstoneId}`,
  capstoneId: capstoneId as never,
  sketchId: null,
  side: sideOfCapstone(capstoneId),
  trackNo: 1,
  title: `Song ${capstoneId}`,
  flavour: "flavour.jazz-soul",
  currentVersion: 1,
  coverSeed: `seed-${capstoneId}`,
  createdAt: at,
  ...over,
});
const detail = (t: AlbumTrack, v: Partial<AlbumTrackVersion> = {}): AlbumTrackDetail => ({
  ...t,
  versions: [
    {
      trackId: t.id,
      version: 1,
      sketchId: "sk",
      sketchVersion: 1,
      hasAudio: true,
      audioMime: "audio/webm",
      durationS: 30,
      linerNotesMd: "",
      theoryTags: [],
      review: null,
      tutorAssisted: false,
      attribution: null,
      band: null,
      flags: { lockedTools: [], previewTools: [] },
      createdAt: t.createdAt,
      ...v,
    },
  ],
});

describe("Side B", () => {
  test("its eight capstones are the API's Side B, each a track of jazz, rhythm or sound", () => {
    expect([...SIDE_B_CAPSTONES]).toEqual([...(ALBUM_SIDES[1]?.capstones ?? [])]);
    expect(SIDE_B_CAPSTONES.map(trackFamilyOf)).toEqual([
      "jazz",
      "jazz",
      "jazz",
      "jazz",
      "rhythm",
      "rhythm",
      "sound",
      "sound",
    ]);
    expect(trackFamilyOf("C3")).toBeNull();
    expect(SIDE_B_CAPSTONES.every((id) => sideOfCapstone(id) === "B")).toBe(true);
  });
  test("numbered in release order: RC1 released first is track 1, then JC1; the rest wait in the course's order", () => {
    const tracks = [track("JC1", "2026-11-10T10:00:00Z"), track("RC1", "2026-11-03T10:00:00Z")];
    const b = metas.filter((c) => sideOfCapstone(c.id) === "B");
    expect(sideBOrder(b, tracks).map((c) => c.id)).toEqual([
      "RC1",
      "JC1",
      "JC2",
      "JC3",
      "JC4",
      "RC2",
      "AC1",
      "AC2",
    ]);
    const sides = albumSides(tracks, metas, []);
    const side = sides.find((s) => s.side === "B");
    expect(side?.sub).toBe("Jazz, rhythm and sound");
    expect(side?.slots.slice(0, 2).map((s) => (s.kind === "track" ? s.track.capstoneId : null))).toEqual([
      "RC1",
      "JC1",
    ]);
  });
  test("Side A keeps its running order and its twelve, the single last, whatever Side B holds", () => {
    const tracks = [track("C0", "2026-01-01T00:00:00Z"), track("JC1", "2026-11-10T10:00:00Z")];
    const a = sideRecord("A", tracks, new Map(), metas);
    expect(a.tracks.map((t) => t.capstoneId)).toEqual([...SIDE_A_ORDER]);
    const b = sideRecord("B", tracks, new Map(), metas);
    expect(b.total).toBe(8);
    expect(b.tracks[0]?.capstoneId).toBe("JC1");
  });
});

describe("the whole record", () => {
  const all = [
    ...SIDE_A_ORDER.map((id, i) => track(id, `2026-0${1 + Math.floor(i / 4)}-1${i % 10}T00:00:00Z`)),
    ...SIDE_B_CAPSTONES.map((id, i) => track(id, `2026-11-${10 + i}T00:00:00Z`)),
  ];
  const details = new Map(
    all.map((t) => [t.id, detail(t, t.capstoneId === "RC2" ? { hasAudio: false } : {})]),
  );
  test("plays Side A, then Side B; a track without a recording is skipped; complete with all twenty", () => {
    const w = wholeRecord(sideRecord("A", all, details, metas), sideRecord("B", all, details, metas));
    expect(w.total).toBe(20);
    expect(w.released).toBe(20);
    expect(w.complete).toBe(true);
    expect(w.queue).toHaveLength(19);
    expect(w.queue[0]).toMatchObject({ side: "A", capstoneId: "C0" });
    expect(w.queue[12]).toMatchObject({ side: "B", capstoneId: "JC1", no: 1 });
    expect(w.queue.some((t) => t.capstoneId === "RC2")).toBe(false);
    expect(w.seconds).toBe(19 * 30);
    expect(wholeNowPlaying(w.queue[12] as never, 8, 14)).toBe("Side B · 1 of 8 · Song JC1 · 0:14 / 0:30");
  });
  test("not complete while a Side B track is missing", () => {
    const some = all.filter((t) => t.capstoneId !== "AC2");
    const w = wholeRecord(sideRecord("A", some, details, metas), sideRecord("B", some, details, metas));
    expect(w.complete).toBe(false);
    expect(w.released).toBe(19);
  });
  test("the side's title line names its side", () => {
    expect(recordTitleLine("Oak Sessions", { released: 3, seconds: 95, playable: [{} as never] }, "B")).toBe(
      "Oak Sessions · Side B · 3 tracks · 1:35",
    );
  });
});

describe("Export", () => {
  const source = {
    trackId: "t1",
    version: 2,
    title: "Blues in F",
    code: 'setcpm(132/4)\nbass: note("f2*4")',
    band: {
      band: "band.axis-4bar",
      flavour: "flavour.jazz-soul",
      code: 'drums: s("bd")',
      followsLearnerKey: true,
      tracks: ["drums"],
    },
    key: { tonic: "F", mode: "major" } as const,
    mutes: { hats: true, bass: false },
    fileName: "oak-side-b-02-blues-in-f-v2",
  };
  test("the request is what the released version plays: its code, its Band, its key, its mutes", () => {
    const r = renderRequestOf(source);
    expect(r.code).toBe(source.code);
    expect(r.band?.band).toBe("band.axis-4bar");
    expect(r.key).toEqual({ tonic: "F", mode: "major" });
    expect([...(r.mutes?.muted ?? [])]).toEqual(["hats"]);
    expect(bandOf(null)).toBeNull();
    expect(bandOf({ band: "x" })).toBeNull();
    expect(muteMapOf({}).solo).toBeNull();
  });
  test("the file name is the server's safe name with .wav, never the raw title", () => {
    expect(wavFileName(source)).toBe("oak-side-b-02-blues-in-f-v2.wav");
    expect(wavFileName({ fileName: "../x y/z" })).toBe("..-x-y-z.wav");
    expect(wavFileName({ fileName: "" })).toBe("oak-track.wav");
  });
  test("every failure says why and that nothing was saved, with no package names", () => {
    const codes = [
      "aborted",
      "timeout",
      "silent",
      "missing-sound",
      "evaluation",
      "too-long",
      "engine",
      "invalid-request",
    ] as const;
    for (const code of codes) {
      const text = exportErrorText(
        new PieceRenderError(code, "The piece is 900 bars long (@oak/strudel limit).", ["gm_x"]),
      );
      expect(text).toEndWith("Nothing was saved.");
      expect(text).not.toContain("@oak");
    }
    expect(exportErrorText(new PieceRenderError("missing-sound", "x", ["gm_choir_aahs"]))).toContain(
      "gm_choir_aahs",
    );
    expect(exportErrorText(new OakApiError("album.source", 501, "not_implemented", "x"))).toContain(
      "not available on this server yet",
    );
    expect(exportErrorText(new Error("boom"))).toBe("The export stopped unexpectedly. Nothing was saved.");
    expect(exportProgressText(0.426)).toBe("Rendering 43%");
  });
});

describe("track cards", () => {
  test("the AABA plan is four sections of eight bars, the third the bridge", () => {
    const boxes = planBoxes("AABA", 32, null);
    expect(boxes.map((b) => [b.letter, b.from, b.to, b.bridge])).toEqual([
      ["A", 1, 8, false],
      ["A", 9, 16, false],
      ["B", 17, 24, true],
      ["A", 25, 32, false],
    ]);
  });
  test("the clave's two bars on 16 eighths: son 3-2 is 0 3 6 | 10 12, 2-3 the bars swapped", () => {
    expect(claveSteps16("son", "3-2")).toEqual([0, 3, 6, 10, 12]);
    expect(claveSteps16("son", "2-3")).toEqual([2, 4, 8, 11, 14]);
    expect(claveSteps16("rumba", "3-2")).toEqual([0, 3, 7, 10, 12]);
  });
});
