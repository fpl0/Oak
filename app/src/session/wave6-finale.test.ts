// The end of the core as pure models (content/specs/END.md "Acceptance", the session model's lines): the road
// line drops a zero clause and never prints a comparison; the evidence wording per kind; the can-do lines (one per
// area in the spec's order, never emerging or fading, "new today"); the Oak lines from counts, the third dropped at
// zero; the order and notes of "what is open" in both worlds (no track lesson written; a track with a next lesson);
// Today from the next day on; the line that stays on Progress; and that no sentence of the ending holds an
// exclamation mark or the word "Congratulations". (Side A's running order is the album area's: album/model.ts.)
import { describe, expect, test } from "bun:test";
import type { CanDoEntry, CoreCompletion } from "@oak/api";
import { candos } from "../../../content/candos.ts";
import { capstones } from "../../../content/capstones.ts";
import { milestoneById } from "../../../content/milestones.ts";
import { syllabus } from "../../../content/syllabus.ts";
import {
  afterCore,
  canDoClosing,
  dayMonth,
  evidenceWording,
  FINALE_AREAS,
  FINALE_COPY,
  finaleCanDo,
  isEnding,
  leftToRelease,
  longDate,
  oakLines,
  openList,
  progressEnding,
  roadLine,
} from "./finale-model.ts";
import { fixturePlan, fixtureSummary } from "./fixtures.ts";
import { albumStripSlots, sourceRank } from "./progress-model.ts";

const L = "en-GB";
const TRACKS_NOTE = "Open. Its first lessons are still being written.";

const open = (over: Partial<CoreCompletion["open"][number]>[] = []): CoreCompletion["open"] => [
  { kind: "review", id: null, title: "Reviews", note: "14 due. They keep the Oak green.", available: true },
  {
    kind: "gym",
    id: null,
    title: "Transcription Gym",
    note: "Ladder L8: Ain't She Sweet, form to tune. Every fifth session, or any day from Today.",
    available: true,
  },
  {
    kind: "studio",
    id: null,
    title: "Studio",
    note: "Your sketchbook. Start the next song.",
    available: true,
  },
  {
    kind: "side-lesson",
    id: "A1.L03",
    title: "Side lessons: sound",
    note: "Envelopes is next, about 15 minutes.",
    available: true,
  },
  { kind: "track", id: "J", title: "Jazz Harmony", note: TRACKS_NOTE, available: false },
  { kind: "track", id: "R", title: "Advanced Rhythm", note: TRACKS_NOTE, available: false },
  {
    kind: "track",
    id: "A",
    title: "Arrangement & Sound",
    note: "Its side lessons are open. The rest is still being written.",
    available: false,
  },
  ...(over as CoreCompletion["open"]),
];

const completion = (over: Partial<CoreCompletion> = {}): CoreCompletion => ({
  stage: "complete",
  completedAt: "2026-11-14T19:42:00.000Z",
  sessionsDone: 185,
  sessionsTotal: 185,
  remaining: [],
  milestone: {
    id: "ms.07",
    title: milestoneById.get("ms.07")?.title ?? "",
    description: milestoneById.get("ms.07")?.description ?? "",
    reachedAt: "2026-11-14T19:42:00.000Z",
  },
  stats: {
    firstDay: "2026-03-03",
    days: 172,
    sessions: 185,
    activeMinutes: 58 * 60 + 12,
    lessons: 125,
    tracksReleased: 12,
    transcriptions: 3,
    sketches: 140,
  },
  canDo: [
    {
      candoId: "cd.compose.album-single",
      text: "I can finish a two-minute song with a bridge.",
      status: "solid",
    },
    {
      candoId: "cd.transcribe.standard",
      text: "I can transcribe a standard's form, bass, changes and melody.",
      status: "strong",
    },
    { candoId: "cd.hear.key-change", text: "I can hear where a song changes key.", status: "solid" },
  ] as CoreCompletion["canDo"],
  album: { released: 12, total: 12, latestTrackId: "trk_cfa" },
  open: open(),
  ...over,
});

describe("the heading and the road", () => {
  test("the heading is the milestone's own sentence, word for word", () => {
    expect(FINALE_COPY.heading).toBe(milestoneById.get("ms.07")?.title ?? "");
    expect(FINALE_COPY.under).toBe(milestoneById.get("ms.07")?.description ?? "");
  });

  test("one line of the learner's own numbers", () => {
    expect(roadLine(completion().stats, L)).toBe(
      "Since 3 March: 185 sessions on 172 days, about 58 hours of practice. 125 lessons, 12 tracks, 3 transcriptions, 140 sketches.",
    );
    expect(dayMonth("2026-03-03", L)).toBe("3 March");
    expect(longDate("2026-11-14T19:42:00.000Z", L)).toBe("14 November 2026");
  });

  test("a value of zero drops its clause; singulars read right; nothing is compared with anything", () => {
    const s = { ...completion().stats, transcriptions: 0, sketches: 1, tracksReleased: 1, lessons: 1 };
    expect(roadLine(s, L)).toBe(
      "Since 3 March: 185 sessions on 172 days, about 58 hours of practice. 1 lesson, 1 track, 1 sketch.",
    );
    expect(roadLine({ ...s, firstDay: null, activeMinutes: 40, days: 0, sessions: 1 }, L)).toBe(
      "1 session, about 40 minutes of practice. 1 lesson, 1 track, 1 sketch.",
    );
    expect(
      roadLine(
        {
          firstDay: null,
          days: 0,
          sessions: 0,
          activeMinutes: 0,
          lessons: 0,
          tracksReleased: 0,
          transcriptions: 0,
          sketches: 0,
        },
        L,
      ),
    ).toBe("");
    expect(roadLine(completion().stats, L)).not.toMatch(/schedule|behind|ahead|missed|week|plan|average|%/i);
  });
});

describe("what you can now do", () => {
  const names = {
    trackTitle: (id: string) => (id === "trk_cfa" ? "Album Single" : null),
    songTitle: (id: string) => (id === "tr_five" ? "Five Foot Two" : null),
    itemTitle: (id: string) => (id === "U17.L03" ? "Hearing Key Changes" : id),
    locale: L,
  };
  const areaOf = (id: string) => candos.find((c) => c.id === id)?.area ?? null;
  const entry = (
    candoId: string,
    status: CanDoEntry["status"],
    kind: CanDoEntry["evidenceKind"],
    evidenceId: string,
    at: string,
  ) => ({ candoId, status, evidenceKind: kind, evidenceId, at }) as CanDoEntry;

  test("evidence is worded by kind", () => {
    const at = "2026-11-14T19:40:00.000Z";
    expect(evidenceWording({ evidenceKind: "track", evidenceId: "trk_cfa", at }, names)).toBe(
      "from Album Single, released 14 November",
    );
    expect(evidenceWording({ evidenceKind: "transcription", evidenceId: "tr_five", at }, names)).toBe(
      "from Five Foot Two, by ear",
    );
    expect(evidenceWording({ evidenceKind: "checkpoint", evidenceId: "U17.CP", at }, names)).toBe(
      "the U17 checkpoint",
    );
    expect(evidenceWording({ evidenceKind: "lesson", evidenceId: "U17.L03", at }, names)).toBe(
      "Hearing Key Changes",
    );
    expect(evidenceWording({ evidenceKind: "set", evidenceId: "set_1", at }, names)).toBe(
      "review sets, last on 14 November",
    );
    // Unknown names fall back to the plain kind, never to a raw id.
    expect(evidenceWording({ evidenceKind: "track", evidenceId: "trk_x", at }, names)).toBe(
      "from an album track, released 14 November",
    );
    expect(evidenceWording({ evidenceKind: "lesson", evidenceId: "U99.L01", at }, names)).toBe("a lesson");
    expect(evidenceWording({ evidenceKind: "transcription", evidenceId: "tr_x", at }, names)).toBe(
      "from a transcription, by ear",
    );
  });

  test("the areas are the spec's seven, in its order", () => {
    expect([...FINALE_AREAS]).toEqual(["compose", "transcribe", "hear", "write", "read", "code", "sing"]);
  });

  test("the lines keep the order of the areas, carry their evidence, and mark what changed today", () => {
    const since = "2026-11-14T19:00:00.000Z";
    const ledger = [
      entry("cd.compose.album-single", "solid", "track", "trk_cfa", "2026-11-14T19:40:00.000Z"),
      entry("cd.transcribe.standard", "solid", "transcription", "tr_five", "2026-10-30T18:00:00.000Z"),
      entry("cd.transcribe.standard", "strong", "set", "set_9", "2026-11-12T18:00:00.000Z"),
      entry("cd.hear.key-change", "solid", "lesson", "U17.L03", "2026-11-02T18:00:00.000Z"),
    ];
    // The server's list in another order: the page still reads compose, transcribe, hear.
    const chosen = [...completion().canDo].reverse();
    const lines = finaleCanDo(chosen, ledger, areaOf, names, since);
    expect(lines.map((l) => l.candoId)).toEqual([
      "cd.compose.album-single",
      "cd.transcribe.standard",
      "cd.hear.key-change",
    ]);
    expect(lines[0]).toEqual({
      candoId: "cd.compose.album-single",
      text: "I can finish a two-minute song with a bridge.",
      status: "solid",
      evidence: "from Album Single, released 14 November",
      newToday: true,
    });
    expect(lines[1]?.evidence).toBe("review sets, last on 12 November");
    expect(lines[1]?.newToday).toBe(false);
    expect(lines[2]?.evidence).toBe("Hearing Key Changes");
    // Reopened later (no session to compare with): nothing is "new today".
    expect(finaleCanDo(chosen, ledger, areaOf, names, null).some((l) => l.newToday)).toBe(false);
  });

  test("never emerging or fading, at most seven, an area with nothing solid simply absent", () => {
    const many = [
      ...completion().canDo,
      { candoId: "cd.hear.modes", text: "x", status: "emerging" },
      { candoId: "cd.code.key-lift", text: "y", status: "fading" },
      ...Array.from({ length: 8 }, (_, i) => ({
        candoId: `cd.code.extra-${i}`,
        text: `z${i}`,
        status: "solid",
      })),
    ] as CoreCompletion["canDo"];
    const lines = finaleCanDo(many, [], areaOf, names, null);
    expect(lines).toHaveLength(7);
    expect(lines.every((l) => l.status === "solid" || l.status === "strong")).toBe(true);
    expect(lines.some((l) => l.candoId === "cd.hear.modes" || l.candoId === "cd.code.key-lift")).toBe(false);
    // No sung line for a learner in Quiet mode, and no line that says so.
    expect(lines.some((l) => areaOf(l.candoId) === "sing")).toBe(false);
    expect(finaleCanDo([], [], areaOf, names, null)).toEqual([]);
    // No ledger entry to name: the line stands without evidence text.
    expect(lines[0]?.evidence).toBeNull();
  });

  test("the closing line counts the core's statements; the second sentence goes when nothing is settling", () => {
    const order = syllabus.defaultOrder as readonly string[];
    const coreIds = candos.filter((c) => sourceRank(c.source, order) >= 0).map((c) => c.id as string);
    expect(coreIds.length).toBeGreaterThan(80);
    const at = "2026-11-10T10:00:00.000Z";
    const ledger = coreIds.map((id, i) =>
      entry(
        id,
        i < 96 ? "solid" : i < 100 ? "strong" : i < 108 ? "emerging" : "fading",
        "lesson",
        "U01.L01",
        at,
      ),
    );
    const c = canDoClosing(coreIds, ledger);
    expect(c.total).toBe(coreIds.length);
    expect(c.solid + c.settling).toBe(coreIds.length);
    expect(c.line).toBe(
      `${c.solid} of ${coreIds.length} statements are solid or strong. ${c.settling} are still settling; reviews firm them up.`,
    );
    const all = canDoClosing(
      coreIds,
      coreIds.map((id) => entry(id, "strong", "lesson", "U01.L01", at)),
    );
    expect(all.line).toBe(`${coreIds.length} of ${coreIds.length} statements are solid or strong.`);
    expect(canDoClosing(["a", "b"], [entry("a", "emerging", "set", "s", at)]).line).toBe(
      "0 of 2 statements are solid or strong. 1 is still settling; reviews firm them up.",
    );
  });
});

describe("your Oak", () => {
  test("three lines from the counts; pale leaves are counted as what they are", () => {
    expect(oakLines({ mastered: 61, practising: 48, introduced: 9, drying: 6 })).toEqual([
      "Every limb of the core is at full length: 61 leaves mastered, 48 practising, 9 still settling.",
      "The crown and the deep roots are still to grow: they are the jazz, rhythm and arrangement tracks.",
      "6 leaves are in your next warm-up.",
    ]);
  });
  test("the third line is dropped when no leaf is in the next warm-up; nothing settling drops its clause", () => {
    const lines = oakLines({ mastered: 1, practising: 117, introduced: 0, drying: 0 });
    expect(lines).toEqual([
      "Every limb of the core is at full length: 1 leaf mastered, 117 practising.",
      FINALE_COPY.oakCrown,
    ]);
    expect(oakLines({ mastered: 2, practising: 3, introduced: 1, drying: 1 })[2]).toBe(
      "1 leaf is in your next warm-up.",
    );
  });
});

describe("what is open now", () => {
  test("no track lesson written: reviews are tomorrow, the tracks are quiet rows with no link", () => {
    const l = openList(open());
    expect(l.tomorrow).toBe("Tomorrow: reviews. 14 due. They keep the Oak green.");
    expect(l.startable.map((r) => [r.kind, r.title, r.to?.to ?? null])).toEqual([
      ["review", "Reviews", "/"],
      ["gym", "Transcription Gym", "/"],
      ["studio", "Studio", "/studio"],
      ["side-lesson", "Side lessons: sound", "/learn/$lessonId"],
    ]);
    expect(l.startable[3]?.to).toEqual({ to: "/learn/$lessonId", params: { lessonId: "A1.L03" } });
    expect(l.waiting.map((r) => [r.title, r.note, r.to])).toEqual([
      ["Jazz Harmony", TRACKS_NOTE, null],
      ["Advanced Rhythm", TRACKS_NOTE, null],
      ["Arrangement & Sound", "Its side lessons are open. The rest is still being written.", null],
    ]);
  });

  test("a track with a next lesson (a later wave) comes first, and tomorrow's line names it", () => {
    const later: CoreCompletion["open"] = [
      {
        kind: "track",
        id: "J1.L01",
        title: "Jazz Harmony",
        note: "Next: J1.L01 Swing Feel & the Ride.",
        available: true,
      },
      ...open().filter((e) => !(e.kind === "track" && e.id === "J")),
    ];
    const l = openList(later);
    expect(l.tomorrow).toBe("Tomorrow: Jazz Harmony. Next: J1.L01 Swing Feel & the Ride.");
    expect(l.startable[0]?.to).toEqual({ to: "/learn/$lessonId", params: { lessonId: "J1.L01" } });
    expect(l.waiting.map((r) => r.title)).toEqual(["Advanced Rhythm", "Arrangement & Sound"]);
  });

  test("nothing startable: no line for tomorrow is invented; every side lesson done: that row is simply gone", () => {
    expect(openList(open().filter((e) => !e.available)).tomorrow).toBeNull();
    expect(openList(open().filter((e) => e.kind !== "side-lesson")).startable.map((r) => r.kind)).toEqual([
      "review",
      "gym",
      "studio",
    ]);
    expect(openList([]).startable).toEqual([]);
    expect(
      openList([{ kind: "gym", id: null, title: "Transcription Gym", note: "n.", available: true }]).tomorrow,
    ).toBe("Tomorrow: the Transcription Gym. n.");
  });
});

describe("the ending is on one summary only", () => {
  test("a summary with coreComplete at stage complete is the ending; every other is not", () => {
    expect(isEnding(fixtureSummary({ coreComplete: completion() }))).toBe(true);
    expect(isEnding(fixtureSummary({ coreComplete: null }))).toBe(false);
    expect(isEnding(fixtureSummary())).toBe(false);
    expect(isEnding(fixtureSummary({ coreComplete: completion({ stage: "lessons-done" }) }))).toBe(false);
    expect(isEnding(null)).toBe(false);
  });
});

describe("Today, from the next day on", () => {
  const today = (day: string) => ({ day, timezone: "Europe/Dublin", rolloverHour: 4 });
  const review = fixturePlan({
    kind: "review",
    mapItemId: null,
    title: "Review",
    main: null,
    core: "complete",
  });

  test("the day after: an ordinary review day, the list of what is open without the session itself, and one line back to the record", () => {
    const a = afterCore(review, completion(), today("2026-11-15"));
    expect(a?.stage).toBe("complete");
    expect(a?.firstDay).toBe(true);
    expect(a?.left).toBeNull();
    // Reviews are today's own session: not listed again under it.
    expect(a?.open.map((r) => r.kind)).toEqual(["gym", "studio", "side-lesson"]);
    expect(a?.waiting.map((r) => r.title)).toEqual([
      "Jazz Harmony",
      "Advanced Rhythm",
      "Arrangement & Sound",
    ]);
  });

  test("the line back to the record is said on the first day only", () => {
    expect(afterCore(review, completion(), today("2026-11-14"))?.firstDay).toBe(false);
    expect(afterCore(review, completion(), today("2026-11-16"))?.firstDay).toBe(false);
    expect(afterCore(review, completion(), today("2026-12-24"))?.firstDay).toBe(false);
    // A session ended after midnight and before the 04:00 rollover belongs to the day before.
    const late = completion({ completedAt: "2026-11-15T01:30:00.000Z" });
    expect(afterCore(review, late, today("2026-11-15"))?.firstDay).toBe(true);
  });

  test("a slot day after the core: the gym is the session, reviews are in the list", () => {
    const gym = fixturePlan({ kind: "gym", mapItemId: "GYM.18" as never, core: "complete" });
    expect(afterCore(gym, completion(), today("2026-11-20"))?.open.map((r) => r.kind)).toEqual([
      "review",
      "studio",
      "side-lesson",
    ]);
  });

  test("lessons-done: the track left to release is today's session and one line says what is left", () => {
    const c = completion({
      stage: "lessons-done",
      completedAt: null,
      remaining: [
        { kind: "capstone", id: "CF-A", title: "Album Single" },
        { kind: "capstone", id: "X1", title: "Folk Transcription" },
      ],
      open: [
        {
          kind: "capstone",
          id: "CF-A",
          title: "Album Single",
          note: "Session 4 of 4 is next.",
          available: true,
        },
        { kind: "capstone", id: "X1", title: "Folk Transcription", note: "Open.", available: true },
        ...open(),
      ],
    });
    const plan = fixturePlan({ kind: "capstone", mapItemId: "CF-A.S4" as never, core: "lessons-done" });
    const a = afterCore(plan, c, today("2026-11-13"));
    expect(a?.stage).toBe("lessons-done");
    expect(a?.firstDay).toBe(false);
    expect(a?.left).toBe(
      "The lessons of the core are done. Left to release: Album Single and Folk Transcription.",
    );
    // Today's own capstone is not listed again; the other one left open is.
    expect(a?.open.map((r) => r.id ?? r.kind)).toEqual(["X1", "review", "gym", "studio", "A1.L03"]);
    expect(
      leftToRelease({
        stage: "lessons-done",
        remaining: [{ kind: "capstone", id: "CF-A", title: "Album Single" }],
        open: [],
      }),
    ).toBe("The lessons of the core are done. Left to release: Album Single.");
    expect(leftToRelease(completion())).toBeNull();
  });

  test("while the core is in progress, or before the completion has loaded, Today is as it was", () => {
    expect(afterCore(fixturePlan(), completion({ stage: "in-progress" }), today("2026-11-15"))).toBeNull();
    expect(afterCore(fixturePlan({ core: "in-progress" }), completion(), today("2026-11-15"))).toBeNull();
    expect(afterCore(review, null, today("2026-11-15"))).toBeNull();
  });
});

describe("the line that stays on Progress", () => {
  test("from the day the core is complete: the milestone's title, the date, the road", () => {
    expect(progressEnding(completion(), L)).toEqual({
      title: "You finished the core. Side A is complete.",
      dateLine: "14 November 2026",
      road: "Since 3 March: 185 sessions on 172 days, about 58 hours of practice. 125 lessons, 12 tracks, 3 transcriptions, 140 sketches.",
    });
    expect(progressEnding(completion({ stage: "lessons-done", completedAt: null }), L)).toBeNull();
    expect(progressEnding(null, L)).toBeNull();
    expect([...FINALE_COPY.progressLinks]).toEqual(["Open the ending", "Play Side A", "Open the Oak"]);
  });
});

describe("never", () => {
  test("no sentence of the ending holds an exclamation mark, praise or a comparison", () => {
    const copy = [
      ...Object.values(FINALE_COPY).flat(),
      roadLine(completion().stats, L),
      ...oakLines({ mastered: 61, practising: 48, introduced: 9, drying: 6 }),
      openList(open()).tomorrow ?? "",
      canDoClosing(["a"], []).line,
      leftToRelease(completion({ stage: "lessons-done", remaining: [], open: [] })) ?? "",
    ];
    for (const s of copy) {
      expect(s).not.toMatch(/!/);
      expect(s).not.toMatch(/congratulations|well done|amazing|great job|you're done|course complete/i);
      expect(s).not.toMatch(/on schedule|behind|sessions left|days missed|countdown/i);
    }
  });
});

describe("Today's album strip keeps the two finale tracks (Side A's running order)", () => {
  const ids = (released: string[]) =>
    albumStripSlots(capstones, syllabus.defaultOrder as readonly string[], new Set(released), 3).map(
      (c) => c.id,
    );
  const through = (last: string) => {
    const all = ["C0", "C1", "C2", "X1", "C3", "C4", "C5", "X2", "C6", "C7", "CF-T", "CF-A"];
    return all.slice(0, all.indexOf(last) + 1);
  };
  test("after X2 the next track to fill is C6: CF-T is track 11, not placed by its first session", () => {
    expect(ids(through("X2"))).toEqual(["C5", "X2", "C6"]);
  });
  test("with C7 out, the standard and then the single are next", () => {
    expect(ids(through("C7"))).toEqual(["C6", "C7", "CF-T"]);
    expect(ids([...through("C7"), "CF-T"])).toEqual(["C7", "CF-T", "CF-A"]);
  });
  test("after the core the last three tracks end on the single", () => {
    expect(ids(through("CF-A"))).toEqual(["C7", "CF-T", "CF-A"]);
  });
});
