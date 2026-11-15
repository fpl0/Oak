// The Coda after a capstone release (the track joins the album: which version, where, what you used) and /progress
// for Wave 4 (the transcription ladder's claims counted from graded passes only; can-dos by place in the course).
import { describe, expect, test } from "bun:test";
import type { AlbumTrack, AlbumTrackDetail } from "@oak/api";
import { candos } from "../../../content/candos.ts";
import { milestones } from "../../../content/milestones.ts";
import { syllabus } from "../../../content/syllabus.ts";
import { toolbox } from "../../../content/toolbox.ts";
import { capstoneOfSession, releaseOf, releaseTools, usedOnRelease } from "./coda-model.ts";
import { albumWindow, ladderRungs, ledgerNow, sourceRank, sourceUnit } from "./progress-model.ts";

const track: AlbumTrack = {
  id: "trk_c2",
  capstoneId: "C2" as never,
  sketchId: null,
  side: "A",
  trackNo: 3,
  title: "Four-Chord Song",
  flavour: null,
  currentVersion: 1,
  coverSeed: "seed",
  createdAt: "2026-11-12T10:30:00.000Z",
};
const version = (v: number, createdAt: string) => ({
  trackId: "trk_c2",
  version: v,
  sketchId: "sk",
  sketchVersion: v,
  hasAudio: true,
  audioMime: "audio/webm",
  durationS: 20,
  linerNotesMd: "",
  theoryTags: ["Four-chord schema family", "Cadences", "axis"],
  review: null,
  tutorAssisted: false,
  attribution: null,
  band: null,
  flags: { lockedTools: [], previewTools: [] },
  createdAt,
});
const detail = (versions: ReturnType<typeof version>[]): AlbumTrackDetail => ({ ...track, versions });

describe("the Coda after a capstone release", () => {
  const since = "2026-11-12T10:00:00.000Z";
  test("C2.S2 released today: version 1, Side A track 3", () => {
    const r = releaseOf("C2", [track], detail([version(1, "2026-11-12T10:30:00.000Z")]), since);
    expect(r).toMatchObject({ place: "Side A · track 3", revision: false, version: { version: 1 } });
  });
  test("a revision released today is version 2; an older release is not today's", () => {
    const d = detail([version(1, "2026-11-01T10:00:00.000Z"), version(2, "2026-11-12T10:40:00.000Z")]);
    expect(releaseOf("C2", [track], d, since)).toMatchObject({ revision: true, version: { version: 2 } });
    expect(releaseOf("C2", [track], detail([version(1, "2026-11-01T10:00:00.000Z")]), since)).toBeNull();
    // A draft saved without a release, the album still loading, another capstone: nothing to show.
    expect(releaseOf("C2", [], null, since)).toBeNull();
    expect(releaseOf("X1", [track], d, since)).toBeNull();
    expect(releaseOf(null, [track], d, since)).toBeNull();
  });
  test("AC1's first release puts both versions on the track at once: a first release, shown by version one", () => {
    const d = detail([version(1, "2026-11-12T10:40:00.000Z"), version(2, "2026-11-12T10:40:00.000Z")]);
    expect(releaseOf("C2", [track], d, since)).toMatchObject({ revision: false, version: { version: 1 } });
  });
  test("what you used names the tools learned since the last track first, never the basics or sounds", () => {
    const order = syllabus.defaultOrder as readonly string[];
    const used = [
      "tb.setcpm",
      "tb.mini.rest",
      "snd.drum.bd",
      "tb.s",
      "tb.n",
      "tb.chord",
      "tb.scale",
      "tb.chord",
    ];
    const picked = releaseTools(used, toolbox, order, "C2").map((t) => t.id);
    expect(picked).toEqual(["tb.n", "tb.chord", "tb.scale"]);
  });

  test("the capstone of a session, and what you used without repeats", () => {
    expect(capstoneOfSession({ kind: "capstone", mapItemId: "C2.S2" as never })).toBe("C2");
    expect(capstoneOfSession({ kind: "capstone", mapItemId: "X1.S3" as never })).toBe("X1");
    expect(capstoneOfSession({ kind: "gym", mapItemId: "GYM.03" as never })).toBeNull();
    const used = usedOnRelease(
      ["Cadences", "Cadences", "axis"],
      [
        { id: "tb.chord", label: "chord()", mono: true },
        { id: "tb.chord", label: "chord()", mono: true },
        { id: "tb.voicing", label: ".voicing()", mono: true },
      ],
    );
    expect(used.theory).toEqual(["Cadences", "axis"]);
    expect(used.tools.map((t) => t.id)).toEqual(["tb.chord", "tb.voicing"]);
  });
});

describe("/progress: the transcription ladder", () => {
  test("a rung is reached by a graded pass at that level or higher; 'You can now transcribe a bass line'", () => {
    const rungs = ladderRungs({ level: 3, gradedPasses: { "1": 2, "3": 1 } });
    expect(rungs.map((r) => r.reached)).toEqual([true, true, true, false]);
    expect(rungs[1]).toMatchObject({ level: 2, claim: "You can now transcribe a bass line.", passes: 0 });
    expect(rungs[2]).toMatchObject({ current: true, passes: 1 });
    expect(ladderRungs({ level: 1, gradedPasses: {} }).every((r) => !r.reached)).toBe(true);
  });
  test("the registry: C2 makes 'You can now compose a song.'; the ladder milestones count graded passes", () => {
    const ms03 = milestones.find((m) => m.id === "ms.03");
    expect(ms03?.when.capstones).toEqual(["C2"]);
    expect(milestones.filter((m) => m.when.ladder).length).toBeGreaterThan(0);
  });
});

describe("/progress: U05–U07 can-dos by place in the course", () => {
  const order = syllabus.defaultOrder as readonly string[];
  const ids = (area: string) => candos.filter((c) => c.area === area);

  test("every U05–U07 can-do has a source in the default order", () => {
    const w4 = candos.filter((c) => /^U0[5-7]\./.test(c.source) || c.source === "C2" || c.source === "X1");
    expect(w4.length).toBeGreaterThanOrEqual(20);
    for (const c of w4) expect(sourceRank(c.source, order), c.id).toBeGreaterThanOrEqual(0);
    expect(sourceUnit("U05.L03")).toBe("U05");
    expect(sourceUnit("C2")).toBe("C2");
  });

  test("after U07.L07, the U07 compose can-dos up to now are in view; C2's waits under Later", () => {
    const at = order.indexOf("U07.L07");
    const done = new Set(order.slice(0, at + 1));
    const split = ledgerNow(ids("compose"), new Set(), order, done, "GYM.02");
    expect(split.now).toContain("cd.compose.call-response");
    expect(split.now).toContain("cd.compose.chord-tones");
    expect(split.later).toContain("cd.compose.fourchord");
    expect(split.later).toContain("cd.compose.hook");
  });

  test("a statement already shown stays in view wherever its source sits", () => {
    const split = ledgerNow(ids("compose"), new Set(["cd.compose.reharm"]), order, new Set(), "U01.L01");
    expect(split.now).toContain("cd.compose.reharm");
  });

  test("C2 released: the four-chord can-do is in view", () => {
    const at = order.indexOf("C2.S2");
    const done = new Set([...order.slice(0, at + 1)]);
    const split = ledgerNow(ids("compose"), new Set(), order, done, "X1.S1");
    expect(split.now).toContain("cd.compose.fourchord");
  });
});

describe("Today's album strip", () => {
  const order = syllabus.defaultOrder as readonly string[];
  const caps = ["C3", "X1", "C0", "C2", "C1", "C4"].map((id) => ({ id }));
  const ids = (released: string[]) => albumWindow(caps, order, new Set(released)).map((c) => c.id);
  test("course order, ending with the next slot to fill (Today shows 3)", () => {
    expect(albumWindow(caps, order, new Set(["C0", "C1", "C2"]), 3).map((c) => c.id)).toEqual([
      "C1",
      "C2",
      "X1",
    ]);
    expect(ids([])).toEqual(["C0", "C1", "C2", "X1"]);
    expect(ids(["C0", "C1"])).toEqual(["C0", "C1", "C2", "X1"]);
    expect(ids(["C0", "C1", "C2", "X1"])).toEqual(["C1", "C2", "X1", "C3"]);
    expect(ids(["C0", "C1", "C2", "X1", "C3", "C4"])).toEqual(["C2", "X1", "C3", "C4"]);
  });
});
