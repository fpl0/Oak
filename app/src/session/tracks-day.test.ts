import { describe, expect, test } from "bun:test";
import type { NextSession, SessionPlan, TrackOffer, TrackState } from "@oak/api";
import { syllabus } from "../../../content/syllabus.ts";
import { lessonTitles, titleOf as rawTitle } from "../lib/content-model.ts";
import {
  capstoneGateLine,
  doneOf,
  monthAfter,
  nextLine,
  offerPlan,
  offersFromTracks,
  opensAfter,
  requirementName,
  sessionLabel,
  trackDay,
  trackProgress,
  waitingLines,
} from "./tracks-day.ts";
import { trackRows } from "./tracks-model.ts";

const titles = lessonTitles(syllabus);
const titleOf = (id: string) => rawTitle(id, titles);

const next = (over: Partial<NextSession> = {}): NextSession => ({
  kind: "lesson",
  mapItemId: "J1.L03" as NextSession["mapItemId"],
  title: "The Major ii–V–I",
  goal: "ii7–V7–Imaj7 as one gesture.",
  estMinutes: 20,
  trackId: "J",
  slot: null,
  day: "tomorrow",
  ...over,
});

const offer = (
  trackId: "J" | "R" | "A",
  over: Partial<NextSession> = {},
  done = 2,
  total = 34,
): TrackOffer => ({
  trackId,
  title: { J: "Jazz Harmony", R: "Advanced Rhythm", A: "Arrangement & Sound" }[trackId],
  next: next({ trackId, day: "today", ...over }),
  sessionsDone: done,
  sessionsTotal: total,
  note: "",
});

const plan = (over: Partial<SessionPlan> = {}): SessionPlan => ({
  day: "2026-11-15",
  targetMinutes: 20,
  kind: "lesson",
  mapItemId: "U15.L02" as SessionPlan["mapItemId"],
  title: "U15.L02",
  note: null,
  warmup: { items: [], plannedSec: 0, moreAvailable: false } as unknown as SessionPlan["warmup"],
  main: { resumeStep: null, splitPart: null, light: null, estMinutes: 20 },
  returning: null,
  alternatives: [],
  tutorNote: null,
  ...over,
});

describe("gates, said as one line each", () => {
  test("requirements are named for what they are", () => {
    expect(requirementName("A.CP", titleOf)).toBe("the sound checkpoint");
    expect(requirementName("J.CP1", titleOf)).toBe("the first jazz checkpoint");
    expect(requirementName("U14.CP", titleOf)).toBe("the U14 checkpoint");
    expect(requirementName("J3.L04", titleOf)).toBe("Walking Bass");
    expect(requirementName("Z9.L01", titleOf)).toBe("Z9.L01");
  });
  test("AC2's three-way gate names exactly what is missing (contracts §4.3)", () => {
    const none = () => false;
    expect(capstoneGateLine("AC2", none, titleOf)).toBe(
      "AC2 Neo-Soul Ballad opens after the sound checkpoint, Walking Bass and Displacement & Laid-Back Feel.",
    );
    expect(capstoneGateLine("AC2", (r) => r === "A.CP" || r === "J3.L04", titleOf)).toBe(
      "AC2 Neo-Soul Ballad opens after Displacement & Laid-Back Feel.",
    );
    expect(capstoneGateLine("AC2", () => true, titleOf)).toBeNull();
    expect(capstoneGateLine("JC1", none, titleOf)).toBe(
      "JC1 ii–V Ballad opens after the first jazz checkpoint.",
    );
    expect(capstoneGateLine("JC2", none, titleOf)).toBe(
      "JC2 Jazz Blues in F opens after Reading a Standard.",
    );
    expect(capstoneGateLine("AC1", (r) => r === "U11.CP", titleOf)).toBe(
      "AC1 One Tune, Two Genres opens after the sound checkpoint.",
    );
    expect(capstoneGateLine("C3", none, titleOf)).toBeNull();
  });
  test("a line never counts what is missing", () => {
    const line = opensAfter("J5", ["U17.CP"], () => false, titleOf);
    expect(line).toBe("J5 opens after the U17 checkpoint.");
    expect(line).not.toMatch(/\d+ (lessons|sessions)|left|remaining/);
  });
});

const jazz = (over: Partial<TrackState> = {}): TrackState => ({
  trackId: "J",
  title: "Jazz Harmony",
  status: "open",
  openedAt: null,
  gates: [
    {
      gateId: "J.main",
      trackId: "J",
      opens: "J1, J2.L01–L03, J3",
      requires: [{ ref: "U13.CP", kind: "checkpoint", label: "U13 checkpoint passed", met: true }],
      open: true,
      openedAt: null,
      lessonsAuthored: 8,
      lessonsTotal: 12,
    },
    {
      gateId: "J.chord-scales",
      trackId: "J",
      opens: "J2.L04",
      requires: [{ ref: "U14.CP", kind: "checkpoint", label: "the U14 checkpoint", met: false }],
      open: false,
      openedAt: null,
      lessonsAuthored: 1,
      lessonsTotal: 1,
    },
    {
      gateId: "J.forms",
      trackId: "J",
      opens: "J4",
      requires: [{ ref: "U15.L06", kind: "lesson", label: "U15.L06", met: false }],
      open: false,
      openedAt: null,
      lessonsAuthored: 4,
      lessonsTotal: 4,
    },
  ],
  sessionsDone: 9,
  sessionsTotal: 34,
  next: null,
  note: "Next: J.CP1 Jazz checkpoint 1.",
  ...over,
});

describe("what a track's gates hold back", () => {
  test("J2.L04 waits for U14.CP, named as waiting and never as a failure; J4 opens after U15.L06", () => {
    const lines = waitingLines(jazz(), titleOf);
    expect(lines[0]).toBe(
      "J2.L04 Chord-Scales waits for the U14 checkpoint. The track goes on without it, and it is offered as soon as that is passed.",
    );
    expect(lines[1]).toBe(`J4 opens after ${titleOf("U15.L06")}.`);
    for (const l of lines) expect(l).not.toMatch(/fail|locked|missed|behind/i);
  });
  test("a locked track has no waiting lines (its note says what opens it); met gates say nothing", () => {
    expect(waitingLines(jazz({ status: "locked" }), titleOf)).toEqual([]);
    const open = jazz();
    for (const g of open.gates) {
      g.open = true;
      for (const r of g.requires) r.met = true;
    }
    expect(waitingLines(open, titleOf)).toEqual([]);
  });
});

describe("Today with tracks open (wave7.md §5.2)", () => {
  test("a Wave 6 server, or no track with anything to start: no track day", () => {
    expect(trackDay(plan(), titleOf)).toBeNull();
    expect(trackDay(plan({ trackOffers: [] }), titleOf)).toBeNull();
  });
  test("core unfinished: a side lesson of Sound keeps its own calm line, not a track row; after the core it is a row", () => {
    const side = offer(
      "A",
      { mapItemId: "A1.L01" as NextSession["mapItemId"], title: "Waves & Harmonics" },
      0,
      20,
    );
    // At U03 the only offer is the first side lesson: no track day, no focus switch (Today's side line says it).
    expect(trackDay(plan({ focus: "core", core: "in-progress", trackOffers: [side] }), titleOf)).toBeNull();
    // After U13.CP: Jazz is a row; the side lesson is still the side line.
    const mid = trackDay(
      plan({ focus: "core", core: "in-progress", trackOffers: [offer("J"), side] }),
      titleOf,
    );
    expect(mid?.offers.map((o) => o.trackId)).toEqual(["J"]);
    // A track lesson of Sound (A1.L05 on) is a row like the others.
    const a5 = offer("A", { mapItemId: "A1.L05" as NextSession["mapItemId"], title: "Grit" }, 4, 20);
    expect(
      trackDay(plan({ focus: "core", trackOffers: [a5] }), titleOf)?.offers.map((o) => o.trackId),
    ).toEqual(["A"]);
    // After the core every open track is offered as a row, the side lessons included.
    const after = trackDay(
      plan({
        kind: "review",
        mapItemId: null,
        focus: "core",
        core: "complete",
        trackOffers: [offer("J"), side],
      }),
      titleOf,
    );
    expect(after?.offers.map((o) => o.trackId)).toEqual(["J", "A"]);
  });
  test("core unfinished, focus core: the core is the session; one row per open track beside it", () => {
    const day = trackDay(
      plan({
        focus: "core",
        trackOffers: [
          offer("J"),
          offer("J", { mapItemId: "J1.L04" as NextSession["mapItemId"] }),
          offer("R", { mapItemId: "R1.L03" as NextSession["mapItemId"], title: "The One" }, 2, 20),
        ],
      }),
      titleOf,
    );
    expect(day?.trackLine).toBeNull();
    expect(day?.lead).toBe("The core is today's session. The open tracks are beside it, never in its place.");
    expect(day?.offers.map((o) => [o.trackId, o.label, o.place])).toEqual([
      ["J", "J1.L03 The Major ii–V–I", "session 3 of 34"],
      ["R", "R1.L03 The One", "session 3 of 20"],
    ]);
    expect(day?.focusOptions.map((o) => [o.id, o.label, o.current])).toEqual([
      ["core", "The core", true],
      ["J", "Jazz Harmony", false],
      ["R", "Advanced Rhythm", false],
    ]);
    expect(day?.rememberPick).toBe(false);
  });
  test("a track in focus: the New block is the track's; the core's next item is one row away", () => {
    const day = trackDay(
      plan({
        mapItemId: "J1.L03" as SessionPlan["mapItemId"],
        focus: "J",
        track: { trackId: "J", sessionIndex: 3, sessionsTotal: 34 },
        alternatives: [
          { kind: "lesson", mapItemId: "U15.L02" as SessionPlan["mapItemId"], title: "U15.L02" },
        ],
        trackOffers: [
          offer("J"),
          offer("R", { mapItemId: "R1.L01" as NextSession["mapItemId"], title: "Metric Weight" }, 0, 20),
        ],
      }),
      titleOf,
    );
    expect(day?.trackLine).toBe("Jazz Harmony · session 3 of 34");
    expect(day?.lead).toBe("Today is your Jazz track; the core waits where you left it.");
    // The plan's own session is not offered again.
    expect(day?.offers.map((o) => o.trackId)).toEqual(["core", "R"]);
    expect(day?.offers[0]?.label).toBe(`U15.L02 ${titleOf("U15.L02")}`);
    expect(day?.focusOptions.find((o) => o.current)?.id).toBe("J");
  });
  test("after the core: offers beside the review day, and a pick is remembered (never locked in)", () => {
    const day = trackDay(
      plan({
        kind: "review",
        mapItemId: null,
        core: "complete",
        focus: "core",
        trackOffers: [
          offer("J", { mapItemId: "J1.L01" as NextSession["mapItemId"], title: "Swing Feel & the Ride" }, 0),
          offer("R", { mapItemId: "R1.L01" as NextSession["mapItemId"], title: "Metric Weight" }, 0, 20),
          offer("A", { mapItemId: "A1.L05" as NextSession["mapItemId"], title: "Grit" }, 4, 20),
        ],
      }),
      titleOf,
    );
    expect(day?.offers).toHaveLength(3);
    expect(day?.rememberPick).toBe(true);
    expect(day?.focusOptions[0]).toEqual({ id: "core", label: "No track", current: true });
    expect(day?.lead).toMatch(/Today remembers it; you can change it any day\.$/);
  });
  test("a focus with nothing to start falls back to the core for the day, and says so", () => {
    const day = trackDay(
      plan({
        focus: "R",
        note: "Nothing of the Rhythm track can start today; the core is today's session.",
        trackOffers: [offer("J")],
      }),
      titleOf,
    );
    expect(day?.fallback).toMatch(/Rhythm track/);
    expect(day?.focusOptions.map((o) => o.id)).toEqual(["core", "J", "R"]);
  });
  test("offerPlan starts the offer in place of the New block, with today's warm-up and nothing else changed", () => {
    const p = plan({
      alternatives: [{ kind: "lesson", mapItemId: "J1.L03" as SessionPlan["mapItemId"], title: "J1.L03" }],
    });
    const started = offerPlan(p, {
      kind: "checkpoint",
      mapItemId: "J.CP1",
      label: "J.CP1 Jazz checkpoint 1",
      estMinutes: 20,
    });
    expect(started).toMatchObject({
      kind: "checkpoint",
      mapItemId: "J.CP1",
      title: "J.CP1 Jazz checkpoint 1",
    });
    expect(started.warmup).toBe(p.warmup);
    expect(started.main?.estMinutes).toBe(20);
    expect(started.alternatives).toHaveLength(1);
  });
});

describe("the Coda's next line comes from the planner (carry f6)", () => {
  test("a track lesson, a checkpoint, a capstone session, a gym slot and a review day", () => {
    expect(nextLine(next())).toMatchObject({
      line: "Next time: J1.L03 The Major ii–V–I · Jazz Harmony",
      goal: "ii7–V7–Imaj7 as one gesture.",
      track: "Jazz Harmony",
    });
    expect(
      nextLine(
        next({
          kind: "checkpoint",
          mapItemId: "J.CP1" as NextSession["mapItemId"],
          title: "Jazz checkpoint 1",
        }),
      )?.line,
    ).toBe("Next time: J.CP1 Jazz checkpoint 1 · Jazz Harmony");
    // A track checkpoint says what passing it opens: the reason to come back.
    expect(
      nextLine(
        next({
          kind: "checkpoint",
          mapItemId: "J.CP2" as NextSession["mapItemId"],
          title: "Jazz checkpoint 2",
        }),
        titleOf,
      )?.opens,
    ).toBe("Passing it opens JC3 Rhythm-Changes Contrafact and JC4 Reharmonize a Standard.");
    expect(nextLine(next())?.opens).toBeNull();
    expect(
      nextLine(
        next({
          kind: "capstone",
          mapItemId: "JC1.S2" as NextSession["mapItemId"],
          title: "JC1 ii–V Ballad · session 2 of 2",
          goal: "Guide-tone melody; release.",
        }),
      )?.line,
    ).toBe("Next time: JC1 ii–V Ballad · session 2 of 2 · Jazz Harmony");
    expect(
      nextLine(
        next({
          kind: "gym",
          mapItemId: "GYM.18" as NextSession["mapItemId"],
          title: "Transcription Gym: ladder L8",
          trackId: null,
          slot: "gym",
          goal: "",
        }),
      ),
    ).toMatchObject({
      line: "Next time: a Transcription Gym session (ladder L8)",
      goal: null,
      track: null,
    });
    // A capstone session whose title does not say which session it is: said from its id.
    expect(
      nextLine(
        next({
          kind: "capstone",
          mapItemId: "C3.S2" as NextSession["mapItemId"],
          title: "C3 Verse–Chorus Demo",
          trackId: null,
          goal: "",
        }),
      )?.line,
    ).toBe("Next time: C3 Verse–Chorus Demo · session 2");
    // With the capstone's content at hand, its place and the session's own title.
    expect(
      nextLine(
        next({
          kind: "capstone",
          mapItemId: "C3.S4" as NextSession["mapItemId"],
          title: "C3 Verse–Chorus Demo",
          trackId: null,
          goal: "",
        }),
        titleOf,
        (id) => (id === "C3.S4" ? "C3 Verse–Chorus Demo · session 4 of 4: Take & release" : null),
      )?.line,
    ).toBe("Next time: C3 Verse–Chorus Demo · session 4 of 4: Take & release");
    expect(
      nextLine(
        next({ kind: "review", mapItemId: null, title: "Reviews, then Studio", trackId: null, goal: "" }),
      )?.line,
    ).toBe("Next time: reviews, then Studio");
    // A core lesson.
    expect(
      nextLine(next({ mapItemId: "U15.L03" as NextSession["mapItemId"], title: "Modulation", trackId: null }))
        ?.line,
    ).toBe("Next time: U15.L03 Modulation");
  });
  test("no next session (the whole course complete, nothing due) shows no line; an older server keeps its own", () => {
    expect(nextLine(null)).toBeNull();
    expect(nextLine(undefined)).toBeNull();
  });
  test("labels: the id once", () => {
    expect(sessionLabel("J1.L03", "J1.L03 The Major ii–V–I")).toBe("J1.L03 The Major ii–V–I");
    expect(sessionLabel("JC1.S2", "JC1 ii–V Ballad · session 2")).toBe("JC1 ii–V Ballad · session 2");
    expect(sessionLabel(null, "Reviews")).toBe("Reviews");
  });
});

describe("Progress: each track with its capstones and an honest pace", () => {
  test("capstones say what holds them, the server's reason first; checkpoints say where they stand", () => {
    const course = {
      lessons: [{ lessonId: "J3.L04", status: "completed" }],
      checkpoints: [{ cpId: "A.CP", status: "passed" }],
    } as unknown as Parameters<typeof doneOf>[0];
    const sound: TrackState = {
      ...jazz(),
      trackId: "A",
      title: "Arrangement & Sound",
      gates: [],
      sessionsDone: 14,
      sessionsTotal: 20,
      checkpoints: [{ cpId: "A.CP", status: "passed" }],
      capstones: [
        { capstoneId: "AC1", status: "released", lockedReason: null },
        { capstoneId: "AC2", status: "locked", lockedReason: null },
      ],
    };
    const p = trackProgress(sound, { titleOf, done: doneOf(course) });
    expect(p.capstones.map((c) => [c.id, c.line])).toEqual([
      ["AC1", "released"],
      ["AC2", "opens after Displacement & Laid-Back Feel."],
    ]);
    expect(p.checkpoints).toEqual([
      { id: "A.CP", title: "Sound & arrangement checkpoint", status: "passed", line: "passed" },
    ]);
    const withReason = trackProgress(
      { ...sound, capstones: [{ capstoneId: "AC2", status: "locked", lockedReason: "Opens after R1.L05." }] },
      { titleOf },
    );
    expect(withReason.capstones[0]?.line).toBe("Opens after R1.L05.");
    // With course progress known, the gate is said in words, not in the server's registry labels.
    const jc1 = trackProgress(
      {
        ...jazz(),
        capstones: [
          { capstoneId: "JC1", status: "locked", lockedReason: "Opens after the Jazz checkpoint 1." },
        ],
      },
      { titleOf, done: doneOf(course) },
    );
    expect(jc1.capstones[0]?.line).toBe("opens after the first jazz checkpoint.");
    // And when the app finds nothing missing, the server's reason stands.
    const allMet = trackProgress(
      {
        ...sound,
        capstones: [{ capstoneId: "AC2", status: "locked", lockedReason: "Opens after its tune." }],
      },
      { titleOf, done: () => true },
    );
    expect(allMet.capstones[0]?.line).toBe("Opens after its tune.");
  });
  test("a complete track says so, never that its next lessons are being written; no focus chip, no pace", () => {
    const done = jazz({
      sessionsDone: 34,
      sessionsTotal: 34,
      next: null,
      nextSession: null,
      focus: true,
      note: "Open. Its next lessons are still being written.",
    });
    const p = trackProgress(done, { titleOf, perWeek: 5, today: "2026-11-15" });
    expect(p.complete).toBe(true);
    expect(p.note).toBe("All 34 sessions done. Its lessons stay open to replay.");
    expect(p.focus).toBe(false);
    expect(p.pace).toBeNull();
    expect(trackRows([done])[0]?.note).toBe("All 34 sessions done. Its lessons stay open to replay.");
    // One session left: still the server's own line.
    const almost = jazz({
      sessionsDone: 33,
      sessionsTotal: 34,
      next: null,
      nextSession: null,
      note: "Open.",
    });
    expect(trackProgress(almost, { titleOf }).complete).toBe(false);
    expect(trackProgress(almost, { titleOf }).note).toBe("Open.");
  });
  test("pace: only with a measured pace and something started; says its assumption", () => {
    const p = trackProgress(jazz(), { titleOf, perWeek: 5, today: "2026-11-15", formatMonth: (m) => m });
    expect(p.pace).toBe(
      "At 5 sessions a week, all of them on this track, you would finish it around 2026-12.",
    );
    expect(
      trackProgress(jazz({ sessionsDone: 0 }), { titleOf, perWeek: 5, today: "2026-11-15" }).pace,
    ).toBeNull();
    expect(trackProgress(jazz(), { titleOf, perWeek: null, today: "2026-11-15" }).pace).toBeNull();
    expect(monthAfter("2026-11-15", 25, 5)).toBe("2026-12");
    expect(monthAfter("2026-11-15", 0, 5)).toBeNull();
  });
  test("a track checkpoint never holds a lesson: the next session is the server's, whatever the checkpoint says", () => {
    const p = trackProgress(
      jazz({
        checkpoints: [{ cpId: "J.CP1", status: "failed" }],
        nextSession: {
          kind: "lesson",
          mapItemId: "J3.L01" as never,
          title: "Rootless A/B Voicings",
          estMinutes: 20,
        },
      }),
      { titleOf },
    );
    expect(p.next).toBe("J3.L01 Rootless A/B Voicings");
    expect(p.checkpoints[0]?.line).toBe("open for a retake");
    expect([...p.waiting, ...p.capstones.map((c) => c.line)].join(" ")).not.toMatch(/J3|lesson.*locked/);
  });
});

describe("offers on a server without trackOffers (Wave 6 plan)", () => {
  test("each open track's own next lesson, never a side lesson, never a closed track", () => {
    const offers = offersFromTracks(
      [
        jazz({ next: "J1.L01" as never, sessionsDone: 0 }),
        { ...jazz(), trackId: "R", title: "Advanced Rhythm", next: "R1.L01" as never, status: "locked" },
        { ...jazz(), trackId: "A", title: "Arrangement & Sound", next: "A1.L02" as never },
      ],
      { titleOf, objectiveOf: () => "The ride pattern.", minutes: 20 },
    );
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      trackId: "J",
      next: {
        kind: "lesson",
        mapItemId: "J1.L01",
        title: "Swing Feel & the Ride",
        goal: "The ride pattern.",
      },
    });
    const day = trackDay(plan({ trackOffers: offers }), titleOf);
    expect(day?.offers[0]?.label).toBe("J1.L01 Swing Feel & the Ride");
  });
});
