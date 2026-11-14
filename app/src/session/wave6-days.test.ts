// Wave 6 days, as pure models: CF-T in the transcription slot (what Today says, where the learner is in the
// standard, the compose capstone that waits behind it), three- and four-session capstones as consecutive New blocks
// (C7, CF-A, and C3 since contracts 1.6), the advanced tracks as open branches with their honest note, a session
// per tab (d21), and the line under the Coda's title that names what the learner can now do in U12–U17.
import { describe, expect, test } from "bun:test";
import {
  type CapstoneSessions,
  type CourseProgress,
  type GymPlan,
  type SessionDay,
  TRACK_GATES,
  type TrackGateState,
  type TrackState,
} from "@oak/api";
import { candos } from "../../../content/candos.ts";
import { capstones } from "../../../content/capstones.ts";
import { syllabus } from "../../../content/syllabus.ts";
import {
  type CapstoneDefLike,
  capstoneDay,
  capstoneDayTitle,
  capstoneInProgress,
  keepCapstone,
} from "./capstone-day.ts";
import {
  CFT_OPENED,
  CFT_STAGES,
  cftAfterLine,
  cftDay,
  cftNextLabel,
  cftOpenedBy,
  isCftSession,
  waitingLine,
} from "./cft-day.ts";
import { canDoBelow, canNow, canNowLines, tomorrowLine } from "./coda-model.ts";
import { courseEdge } from "./edge.ts";
import { DAY, fixtureBootstrap, fixturePlan, fixtureSession } from "./fixtures.ts";
import { itemTitle } from "./titles.ts";
import { setlistRows, todayView } from "./today-model.ts";
import {
  authoredUnits,
  branches,
  deriveTracks,
  gatesCard,
  trackOfUnit,
  trackRows,
  tracksLine,
} from "./tracks-model.ts";

const boot = () => fixtureBootstrap({ day: DAY });
const titles = new Map<string, string>([
  ...syllabus.units.flatMap((u) => u.lessons.map((l) => [l.id as string, l.title] as const)),
  ...syllabus.capstones.map((c) => [c.id as string, c.title] as const),
  ...syllabus.checkpoints.map((c) => [c.id as string, c.title] as const),
]);
const titleOf = (id: string) => itemTitle(id, titles);

const defOf = (id: string): CapstoneDefLike => {
  const c = capstones.find((x) => x.id === id);
  if (!c) throw new Error(`no capstone ${id}`);
  return {
    id: c.id,
    title: c.title,
    kind: c.kind,
    sessionDefs: c.sessionDefs.map((s) => ({
      id: s.id,
      title: s.title,
      ...(s.release !== undefined ? { release: s.release } : {}),
      ...(s.review !== undefined ? { review: s.review } : {}),
    })),
  };
};

type CheckIn = {
  id: string;
  layer: "form" | "bass" | "chords" | "melody";
  passed?: boolean;
  score?: number;
  revealed?: boolean;
};
const check = (c: CheckIn) => ({
  checkId: c.id,
  phrase: 1,
  layer: c.layer,
  stage: null,
  open: true,
  score: c.score ?? (c.passed ? 0.95 : null),
  passed: c.passed ?? false,
  revealed: c.revealed ?? false,
  attempts: c.passed ? 1 : 0,
  lastAt: null,
});
const draft = (v: number) => ({ sketchId: "sk_cft", sketchVersion: v, savedAt: `${DAY}T08:00:00.000Z` });

/** CF-T's four sessions with the checks of the finale spec: a form map and four bass sections in S1, and so on. */
function cftSessions(doneThrough: number, s1: CheckIn[] | null = null): CapstoneSessions {
  const s = (n: number, checks: CheckIn[]) => ({
    capstoneSessionId: `CF-T.S${n}`,
    status: n <= doneThrough ? "completed" : n === doneThrough + 1 ? "in_progress" : "locked",
    sessionId: null,
    draft: n <= doneThrough ? draft(n) : null,
    checks: checks.map((c) => check({ ...c, passed: c.passed ?? n <= doneThrough })),
    startedAt: null,
    completedAt: null,
  });
  return {
    capstoneId: "CF-T",
    current: doneThrough >= 4 ? null : `CF-T.S${doneThrough + 1}`,
    sessions: [
      s(
        1,
        s1 ?? [
          { id: "form", layer: "form", score: 1 },
          { id: "bass-1", layer: "bass", score: 0.92 },
          { id: "bass-2", layer: "bass", score: 0.96 },
        ],
      ),
      s(2, [
        { id: "changes-1", layer: "chords", score: 0.88 },
        { id: "changes-2", layer: "chords", score: 1 },
      ]),
      s(3, [{ id: "melody-1", layer: "melody", score: 0.91 }]),
      s(4, []),
    ],
  } as CapstoneSessions;
}

const cftPlan = (n: number, slot: "cf-t" | null = "cf-t") =>
  fixturePlan({
    kind: "capstone",
    mapItemId: `CF-T.S${n}` as never,
    title: "CF-T Core Finale: Standard Transcription",
    slot: slot ? { fills: slot, sinceLast: 4 } : null,
    main: { resumeStep: null, splitPart: null, light: null, estMinutes: 15 },
  });

describe("CF-T in the transcription slot (contracts §2.5; CF.md)", () => {
  test("the five stages belong to the four sessions the contracts name", () => {
    expect(CFT_STAGES.map((s) => [s.stage, s.session])).toEqual([
      ["form", 1],
      ["bass", 1],
      ["changes", 2],
      ["melody", 3],
      ["arrange", 4],
    ]);
    expect(defOf("CF-T").sessionDefs).toHaveLength(4);
    expect(isCftSession("CF-T.S3")).toBe(true);
    expect(isCftSession("C7.S3")).toBe(false);
    expect(isCftSession("GYM.12")).toBe(false);
  });

  test("the first slot says what the slot has become and that the lessons carry on", () => {
    const d = cftDay(cftPlan(1), cftSessions(0), { cfT: null }, null);
    expect(d).not.toBeNull();
    expect(d?.fillsSlot).toBe(true);
    expect(d?.index).toBe(1);
    expect(d?.total).toBe(4);
    expect(d?.lead).toContain("Your transcription slot is now a standard from the 1920s");
    expect(d?.lead).toContain("Today you choose the song and start.");
    expect(d?.lead).toContain("Your lessons carry on in between.");
    expect(d?.steps.map((s) => s.state)).toEqual(["today", "today", "ahead", "ahead", "ahead"]);
    expect(d?.where).toBe("Today: choose the song, map its form, then write its bass.");
    expect(d?.explain[0]).toContain("Until your standard is released the slot is its next session");
    expect(d?.explain[1]).toContain(
      "the form map exact, the bass at 90%, the changes at 85% of the bars, the melody at 90%",
    );
  });

  test("session 2 names the song, what is down and what today is for; the transcription plays from the top", () => {
    const d = cftDay(cftPlan(2), cftSessions(1), null, "Five Foot Two, Eyes of Blue");
    expect(d?.steps).toEqual([
      { stage: "form", label: "Form map", state: "done", note: "passed at 100%" },
      { stage: "bass", label: "Bass", state: "done", note: "passed at 92%" },
      { stage: "changes", label: "Changes", state: "today", note: null },
      { stage: "melody", label: "Melody", state: "ahead", note: null },
      { stage: "arrange", label: "Arrange & release", state: "ahead", note: null },
    ]);
    expect(d?.where).toBe("The form map and the bass are down. Today: the changes.");
    expect(d?.lead).toBe(
      "The transcription slot: session 2 of 4 on Five Foot Two, Eyes of Blue. The form map and the bass are down. Today: the changes. Your transcription plays from the top first, so you hear where you are.",
    );
  });

  test("a stage left unfinished stays today's work, with how far it got; a revealed stage says so", () => {
    const partial = cftDay(
      cftPlan(1),
      cftSessions(0, [
        { id: "form", layer: "form", passed: true, score: 1 },
        { id: "bass-1", layer: "bass", passed: true, score: 0.93 },
        { id: "bass-2", layer: "bass", passed: false },
      ]),
      null,
      "Ain't She Sweet",
    );
    expect(partial?.steps[0]).toMatchObject({ state: "done" });
    expect(partial?.steps[1]).toEqual({
      stage: "bass",
      label: "Bass",
      state: "today",
      note: "1 of 2 sections",
    });
    expect(partial?.where).toBe("The form map is down. Today: the bass.");
    // The session started before: its draft plays from the top.
    expect(partial?.lead).toContain("session 1 of 4 on Ain't She Sweet");
    expect(partial?.lead).toContain("plays from the top first");
    const revealed = cftDay(
      cftPlan(2),
      cftSessions(1, [
        { id: "form", layer: "form", passed: true, score: 1 },
        { id: "bass-1", layer: "bass", passed: false, revealed: true },
      ]),
      null,
    );
    expect(revealed?.steps[1]).toMatchObject({ state: "done", note: "revealed" });
  });

  test("the last session is the arrangement and the release", () => {
    const d = cftDay(cftPlan(4), cftSessions(3), null, "Bye Bye Blackbird");
    expect(d?.steps.map((s) => s.state)).toEqual(["done", "done", "done", "done", "today"]);
    expect(d?.where).toBe(
      "The form map, the bass, the changes and the melody are down. Today: your own arrangement of it, and the release.",
    );
  });

  test("without the server's checks the session number says what is behind", () => {
    const d = cftDay(cftPlan(3), null, null);
    expect(d?.steps.map((s) => s.state)).toEqual(["done", "done", "done", "today", "ahead"]);
    expect(d?.total).toBe(4);
  });

  test("taken ahead of its slot (from Other ways), it says so and that it counts as the slot", () => {
    const d = cftDay(cftPlan(2, null), cftSessions(1), {
      cfT: { status: "in_progress", nextSessionId: "CF-T.S2", takesSlot: false, songId: null },
    } as Pick<GymPlan, "cfT">);
    expect(d?.fillsSlot).toBe(false);
    expect(d?.lead).toContain("taken ahead of its slot; it counts as this round's transcription session");
    // An older plan with no `slot` field: the gym plan's `takesSlot` decides.
    const viaGym = cftDay(fixturePlan({ kind: "capstone", mapItemId: "CF-T.S2" as never }), cftSessions(1), {
      cfT: { status: "in_progress", nextSessionId: "CF-T.S2", takesSlot: true, songId: null },
    } as Pick<GymPlan, "cfT">);
    expect(viaGym?.fillsSlot).toBe(true);
  });

  test("any other plan is not a CF-T day", () => {
    expect(cftDay(fixturePlan({ kind: "capstone", mapItemId: "C6.S1" as never }), null, null)).toBeNull();
    expect(cftDay(fixturePlan({ kind: "gym", mapItemId: "GYM.15" as never }), null, null)).toBeNull();
    expect(cftDay(fixturePlan(), null, null)).toBeNull();
  });

  test("Today: the heading, the Transcribe row with the song, and Start as on any day", () => {
    const plan = cftPlan(2);
    const day = capstoneDay(plan, defOf("CF-T"), cftSessions(1), {
      sketchId: "sk_cft",
      sessionsDone: 1,
      sessionsTotal: 4,
    });
    const cft = cftDay(plan, cftSessions(1), null, "Five Foot Two, Eyes of Blue");
    const v = todayView({ plan, boot: boot(), lastEnded: null, titleOf, capstone: day, cft });
    expect(v.state).toBe("capstone");
    expect(v.heading).toBe("Transcription slot: your standard");
    expect(v.lead).toBe(cft?.lead ?? "");
    expect(v.cft?.index).toBe(2);
    expect(v.primary).toEqual({ action: "start", label: "Start session" });
    const row = v.rows.find((r) => r.key === "new");
    expect(row?.label).toBe("Transcribe");
    expect(row?.detail).toBe(
      "Standard Transcription · session 2 of 4: Changes · Five Foot Two, Eyes of Blue · the saved draft is the Make",
    );
    // CF-T's section checks are drawn stage by stage, never listed one by one under the setlist.
    expect(day?.checksLine).toBeNull();
    expect(day?.resume).toBe(true);
  });

  test("it never collides with a capstone in progress: C6 waits, and a gym slot never takes CF-T's place", () => {
    const course = {
      capstones: [
        {
          capstoneId: "C6",
          status: "in_progress",
          lockedReason: null,
          sessionsDone: 1,
          sessionsTotal: 2,
          sketchId: "sk6",
          trackId: null,
        },
        {
          capstoneId: "CF-T",
          status: "in_progress",
          lockedReason: null,
          sessionsDone: 1,
          sessionsTotal: 4,
          sketchId: "sk_cft",
          trackId: null,
        },
      ],
    } as unknown as Pick<CourseProgress, "capstones">;
    const inProgress = capstoneInProgress(course);
    // CF-T is the slot itself: the capstone a slot must not interrupt is C6.
    expect(inProgress).toEqual({ capstoneId: "C6", nextSession: "C6.S2", sessionsDone: 1, sessionsTotal: 2 });
    // A CF-T slot day stays CF-T's (its sessions ARE the slot), and Today says where C6 stands.
    const plan = cftPlan(2);
    expect(keepCapstone(plan, inProgress, titleOf)).toBe(plan);
    expect(waitingLine(inProgress, titleOf)).toBe(
      "C6 Modal Vamp waits where you left it: session 2 of 2 is next.",
    );
    const v = todayView({
      plan,
      boot: boot(),
      lastEnded: null,
      titleOf,
      cft: cftDay(plan, cftSessions(1), null),
      waiting: waitingLine(inProgress, titleOf),
    });
    expect(v.waiting).toContain("C6 Modal Vamp waits");
    // A plain gym slot on a day C6 is under way still gives way to C6 (contracts §2.5), as before.
    const gym = fixturePlan({ kind: "gym", mapItemId: "GYM.16" as never, title: "Transcription Gym" });
    expect(keepCapstone(gym, inProgress, titleOf)).toMatchObject({ kind: "capstone", mapItemId: "C6.S2" });
    // With only CF-T under way nothing is "in progress" for the slot rule: CF-T never waits behind itself.
    const onlyCft = { capstones: [course.capstones[1]] } as unknown as Pick<CourseProgress, "capstones">;
    expect(capstoneInProgress(onlyCft)).toBeNull();
    expect(waitingLine(null, titleOf)).toBeNull();
  });

  test("the Coda names CF-T's next session when it holds the slot that is due", () => {
    const sessionTitle = (id: string) => defOf("CF-T").sessionDefs.find((s) => s.id === id)?.title ?? null;
    const gym = {
      active: true,
      slotDue: true,
      cfT: { status: "in_progress", nextSessionId: "CF-T.S2", takesSlot: true, songId: "song.five-foot-two" },
    } as Pick<GymPlan, "active" | "slotDue" | "cfT">;
    const label = cftNextLabel(gym, sessionTitle);
    expect(label).toBe("your standard, session 2 of 4: changes");
    expect(tomorrowLine(null, { id: "U15.L04", title: "U15.L04 Tonicization" }, label)).toBe(
      "Next time: your standard, session 2 of 4: changes. Then U15.L04 Tonicization",
    );
    expect(cftNextLabel({ ...gym, slotDue: false }, sessionTitle)).toBeNull();
    expect(cftNextLabel({ ...gym, cfT: { ...gym.cfT, takesSlot: false } } as never, sessionTitle)).toBeNull();
    expect(cftNextLabel({ ...gym, cfT: null }, sessionTitle)).toBeNull();
  });

  test("the card that opens CF-T is the U15 spec's, shown by the session that completed U15.L01 and only then", () => {
    expect(CFT_OPENED.title).toBe("The core finale has opened: part one");
    expect(CFT_OPENED.body).toContain("Four sessions.");
    expect(CFT_OPENED.body).toContain("Five Foot Two, Ain't She Sweet or Bye Bye Blackbird");
    expect(CFT_OPENED.body).toContain("Nothing waits for it: your lessons carry on in between.");
    expect(`${CFT_OPENED.title} ${CFT_OPENED.body}`).not.toMatch(/!|final exam|left|countdown/i);
    const lesson = fixtureSession({ kind: "lesson", mapItemId: "U15.L01" as never });
    const open = { status: "open", sessionsDone: 0 };
    expect(cftOpenedBy(lesson, true, open, "U15.L01")).toBe(true);
    expect(cftOpenedBy(lesson, false, open, "U15.L01")).toBe(false);
    expect(cftOpenedBy(lesson, true, { status: "in_progress", sessionsDone: 1 }, "U15.L01")).toBe(false);
    expect(cftOpenedBy(lesson, true, { status: "locked", sessionsDone: 0 }, "U15.L01")).toBe(false);
    expect(cftOpenedBy(fixtureSession({ mapItemId: "U15.L02" as never }), true, open, "U15.L01")).toBe(false);
  });
});

describe("capstones over three and four sessions", () => {
  const sessionsOf = (id: string, total: number, done: number): CapstoneSessions =>
    ({
      capstoneId: id,
      current: done >= total ? null : `${id}.S${done + 1}`,
      sessions: Array.from({ length: total }, (_, i) => ({
        capstoneSessionId: `${id}.S${i + 1}`,
        status: i < done ? "completed" : i === done ? "open" : "locked",
        sessionId: null,
        draft:
          i < done ? { sketchId: `sk_${id}`, sketchVersion: i + 1, savedAt: `${DAY}T08:00:00.000Z` } : null,
        checks: [],
        startedAt: null,
        completedAt: null,
      })),
    }) as CapstoneSessions;
  const day = (id: string, n: number, total: number) =>
    capstoneDay(
      fixturePlan({ kind: "capstone", mapItemId: `${id}.S${n}` as never, title: id }),
      defOf(id),
      sessionsOf(id, total, n - 1),
      { sketchId: n > 1 ? `sk_${id}` : null, sessionsDone: n - 1, sessionsTotal: total },
    );

  test("the finale's two parts read by what they are, every other capstone by its own title", () => {
    expect(capstoneDayTitle("CF-A Core Finale: Album Single")).toBe("Album Single");
    expect(capstoneDayTitle("CF-T Core Finale: Standard Transcription")).toBe("Standard Transcription");
    expect(capstoneDayTitle("C7 Chromatic Colour")).toBe("C7 Chromatic Colour");
  });

  test("CF-A is four consecutive New blocks: the first starts, the middle two resume the draft, the last releases", () => {
    const def = defOf("CF-A");
    expect(def.sessionDefs).toHaveLength(4);
    const days = [1, 2, 3, 4].map((n) => day("CF-A", n, 4));
    expect(days.map((d) => d?.detail)).toEqual(
      def.sessionDefs.map((s, i) => `Album Single · session ${i + 1} of 4: ${s.title}`),
    );
    expect(days[0]?.resume).toBe(false);
    expect(days[0]?.lead).toContain("The first of 4 sessions on one piece for your album");
    for (const d of days.slice(1)) {
      expect(d?.resume).toBe(true);
      expect(d?.lead).toContain("plays from the top first");
      // The draft that plays is the latest one an earlier session saved.
      expect(d?.draft).toEqual({ sketchId: "sk_CF-A", sketchVersion: (d?.index ?? 0) - 1 });
    }
    expect(days[1]?.lead).toContain("carries on from where the draft stands");
    expect(days[2]?.releases).toBe(false);
    expect(days[3]?.releases).toBe(true);
    expect(days[3]?.lead).toContain("The last session: finish the piece, then release it to your album.");
    // The setlist's New row is the capstone session, one block, with the draft as the Make.
    const rows = setlistRows(fixturePlan({ kind: "capstone", mapItemId: "CF-A.S3" as never }), titleOf, {
      capstone: days[2] ?? null,
    });
    expect(rows.find((r) => r.key === "new")?.detail).toBe(
      `Album Single · session 3 of 4: ${def.sessionDefs[2]?.title} · the draft is the Make`,
    );
  });

  test("C7 is three sessions, the last the key lift and the release", () => {
    const def = defOf("C7");
    expect(def.sessionDefs).toHaveLength(3);
    const d2 = day("C7", 2, 3);
    const d3 = day("C7", 3, 3);
    expect(d2?.detail).toBe(`C7 Chromatic Colour · session 2 of 3: ${def.sessionDefs[1]?.title}`);
    expect(d2?.resume).toBe(true);
    expect(d2?.releases).toBe(false);
    expect(d3?.releases).toBe(true);
    expect(d3?.resume).toBe(true);
  });

  test("d13: C3 has four sessions; C3.S3 no longer releases, C3.S4 does, and a draft from S2 resumes in S3", () => {
    const def = defOf("C3");
    expect(def.sessionDefs.map((s) => s.id)).toEqual(["C3.S1", "C3.S2", "C3.S3", "C3.S4"]);
    const s3 = day("C3", 3, 4);
    expect(s3?.total).toBe(4);
    expect(s3?.releases).toBe(false);
    expect(s3?.resume).toBe(true);
    expect(s3?.lead).toContain("carries on from where the draft stands");
    const s4 = day("C3", 4, 4);
    expect(s4?.releases).toBe(true);
    expect(s4?.detail).toBe(`C3 Verse–Chorus Demo · session 4 of 4: ${def.sessionDefs[3]?.title}`);
    // A learner part-way through the old three-session C3 (two done, S3 under way) is in progress, never sent back.
    expect(
      capstoneInProgress({
        capstones: [
          {
            capstoneId: "C3",
            status: "in_progress",
            lockedReason: null,
            sessionsDone: 2,
            sessionsTotal: 4,
            sketchId: "sk3",
            trackId: null,
          },
        ],
      } as unknown as Pick<CourseProgress, "capstones">),
    ).toMatchObject({ nextSession: "C3.S3" });
  });
});

describe("the advanced tracks as open branches (contracts §2.6, §4.3)", () => {
  const gate = (gateId: string, open: boolean, authored = 0): TrackGateState => {
    const g = TRACK_GATES.find((x) => x.gateId === gateId);
    if (!g) throw new Error(gateId);
    return {
      gateId,
      trackId: g.trackId,
      opens: g.opens,
      requires: g.requires.map((ref) => ({
        ref,
        kind: /\.CP/.test(ref) ? "checkpoint" : "lesson",
        label: /\.CP/.test(ref) ? `${ref.slice(0, 3)} checkpoint passed` : `${ref} completed`,
        met: open,
      })),
      open,
      openedAt: open ? `${DAY}T09:20:00.000Z` : null,
      lessonsAuthored: authored,
      lessonsTotal: 10,
    };
  };
  const UNWRITTEN = "Open. Its first lessons are still being written.";
  const state = (
    trackId: "J" | "R" | "A",
    open: boolean,
    gates: TrackGateState[],
    note: string,
  ): TrackState => ({
    trackId,
    title: trackId === "J" ? "Jazz Harmony" : trackId === "R" ? "Advanced Rhythm" : "Arrangement & Sound",
    status: open ? "open" : "locked",
    openedAt: null,
    gates,
    sessionsDone: 0,
    sessionsTotal: trackId === "J" ? 34 : 20,
    next: null,
    note,
  });

  test("after U13.CP: one card for both tracks, honest that their lessons are not written", () => {
    const card = gatesCard([gate("J.main", true), gate("R.main", true)]);
    expect(card?.title).toBe("The Jazz and Rhythm tracks are open");
    expect(card?.body).toBe(
      "Two branches grow from here: Jazz Harmony and Advanced Rhythm. Their first lessons are still being written. The core stays your path, and nothing in it waits on them.",
    );
    expect(card?.tracks).toEqual(["J", "R"]);
    expect(`${card?.title} ${card?.body}`).not.toMatch(/!|start now|required|behind/i);
  });

  test("a later gate opens more of a track that is already open", () => {
    const card = gatesCard([gate("J.forms", true)]);
    expect(card?.title).toBe("More of the Jazz track is open: J4");
    expect(card?.body).toBe(
      "J4 is open on the Oak. Its lessons are still being written; the core stays your path.",
    );
    expect(gatesCard([])).toBeNull();
    expect(gatesCard(undefined)).toBeNull();
    expect(gatesCard([gate("J.main", false)])).toBeNull();
  });

  test("once lessons exist behind a gate the card says where they are offered, and promises no more", () => {
    const card = gatesCard([gate("J.main", true, 3), gate("R.main", true, 2)]);
    expect(card?.body).toContain("Today offers their lessons beside the core, never in its place.");
    expect(card?.body).not.toContain("still being written");
  });

  test("Today's line is the server's own; nothing is said before a gate is met", () => {
    expect(tracksLine(fixturePlan())).toBeNull();
    expect(tracksLine(fixturePlan({ tracks: null }))).toBeNull();
    expect(tracksLine(fixturePlan({ tracks: { open: [], lessonsAuthored: false, note: "x" } }))).toBeNull();
    const note = "The Jazz and Rhythm tracks are open. Their first lessons are still being written.";
    const plan = fixturePlan({
      mapItemId: "U14.L02" as never,
      tracks: { open: ["J", "R"], lessonsAuthored: false, note },
    });
    expect(tracksLine(plan)).toBe(note);
    const v = todayView({ plan, boot: boot(), lastEnded: null, titleOf });
    // The core stays the default path: the plan is the lesson, the tracks are one line.
    expect(v.state).toBe("normal");
    expect(v.rows.find((r) => r.key === "new")?.detail).toBe(titleOf("U14.L02"));
    expect(v.tracksLine).toBe(note);
    expect(v.primary?.label).toBe("Start session");
  });

  test("rows for Progress and the Oak: open tracks with the units their gates open, locked ones with what opens them", () => {
    const rows = trackRows([
      state(
        "J",
        true,
        [gate("J.main", true), gate("J.chord-scales", true), gate("J.forms", false)],
        UNWRITTEN,
      ),
      state("R", true, [gate("R.main", true)], UNWRITTEN),
      state(
        "A",
        true,
        [gate("A.side", true, 4)],
        "Its side lessons are open. The rest is still being written.",
      ),
    ]);
    expect(rows.map((r) => r.trackId)).toEqual(["J", "R", "A"]);
    expect(rows[0]).toMatchObject({ title: "Jazz Harmony", open: true, note: UNWRITTEN, next: null });
    expect(rows[0]?.openUnits).toEqual(["J1", "J2", "J3"]);
    expect(rows[0]?.gates.map((g) => g.met)).toEqual([true, true, false]);
    expect(rows[1]?.openUnits).toEqual(["R1", "R2", "R3"]);
    expect(branches(rows).map((b) => [b.trackId, b.state, b.line])).toEqual([
      ["J", "open", UNWRITTEN],
      ["R", "open", UNWRITTEN],
      ["A", "open", "Its side lessons are open. The rest is still being written."],
    ]);
    expect(trackRows(null)).toEqual([]);
    expect(trackOfUnit("J3")).toBe("J");
    expect(trackOfUnit("A1")).toBe("A");
    expect(trackOfUnit("U13")).toBeNull();
  });

  test("with no track states from the server, the same gates are read from course progress", () => {
    const course = (lessons: string[], cps: string[]) =>
      ({
        lessons: lessons.map((lessonId) => ({ lessonId, status: "completed" })),
        checkpoints: cps.map((cpId) => ({ cpId, status: "passed" })),
      }) as unknown as Pick<CourseProgress, "lessons" | "checkpoints">;
    const units = authoredUnits(["U13.L01", "A1.L01", "A1.L02"]);
    expect([...units].sort()).toEqual(["A1", "U13"]);
    const before = deriveTracks(course(["U03.L02"], ["U12.CP"]), units);
    expect(before.map((t) => [t.trackId, t.status])).toEqual([
      ["J", "locked"],
      ["R", "locked"],
      ["A", "open"],
    ]);
    expect(before[0]?.note).toBe("Opens with the U13 checkpoint.");
    expect(before[2]?.note).toBe("Its side lessons are open. The rest is still being written.");
    const after = deriveTracks(course(["U03.L02", "U15.L06"], ["U13.CP"]), units);
    expect(after.map((t) => [t.trackId, t.status, t.note])).toEqual([
      ["J", "open", UNWRITTEN],
      ["R", "open", UNWRITTEN],
      ["A", "open", "Its side lessons are open. The rest is still being written."],
    ]);
    // J.forms needs U15.L06 only; J.chord-scales still waits for U14.CP.
    const j = trackRows(after)[0];
    expect(j?.gates.map((g) => [g.gateId, g.met])).toEqual([
      ["J.main", true],
      ["J.chord-scales", false],
      ["J.forms", true],
      ["J.reharmonization", false],
    ]);
    expect(j?.openUnits).toEqual(["J1", "J2", "J3", "J4"]);
    // A soft pass meets a checkpoint requirement.
    const soft = deriveTracks(
      { lessons: [], checkpoints: [{ cpId: "U13.CP", status: "soft-passed" }] } as never,
      units,
    );
    expect(soft[0]?.status).toBe("open");
    expect(deriveTracks(null, units)).toEqual([]);
  });
});

describe("a session per tab (d21)", () => {
  const TAB = "tab_00000000000000bb";
  const OTHER = "tab_00000000000000aa";
  const dayWith = (over: Partial<SessionDay>): SessionDay => ({
    day: DAY,
    open: null,
    ended: [],
    doneForToday: false,
    summarySessionId: null,
    ...over,
  });
  const theirs = fixtureSession({
    id: "ses_other",
    tabId: OTHER,
    mapItemId: "U12.L02" as never,
    phase: "main",
  });
  const mine = fixtureSession({ id: "ses_mine", tabId: TAB, mapItemId: "U12.L02" as never, phase: "warmup" });
  const plan = fixturePlan({ mapItemId: "U12.L02" as never });

  test("another tab's open session is never resumed here: this tab offers to start its own, and says so", () => {
    const v = todayView({
      plan,
      boot: fixtureBootstrap({ day: DAY, openSession: theirs }),
      lastEnded: null,
      titleOf,
      tab: TAB,
      server: dayWith({ open: null, openSessions: [theirs] }),
    });
    expect(v.state).toBe("normal");
    expect(v.primary).toEqual({ action: "start", label: "Start session" });
    expect(v.otherTabs).toBe(1);
    // Both tabs plan the same next lesson while neither has finished it.
    expect(v.rows.find((r) => r.key === "new")?.detail).toBe(titleOf("U12.L02"));
  });

  test("this tab's own open session is resumed, whatever else is open", () => {
    const v = todayView({
      plan,
      boot: fixtureBootstrap({ day: DAY, openSession: theirs }),
      lastEnded: null,
      titleOf,
      tab: TAB,
      server: dayWith({ open: mine, openSessions: [theirs, mine] }),
    });
    expect(v.state).toBe("in-session");
    expect(v.primary?.action).toBe("resume");
    expect(v.otherTabs).toBe(1);
  });

  test("a lesson finished in the other tab shows as done here after a reload; the day counts once", () => {
    const v = todayView({
      plan: fixturePlan({ mapItemId: "U12.L03" as never }),
      boot: boot(),
      lastEnded: null,
      titleOf,
      tab: TAB,
      server: dayWith({ doneForToday: true, summarySessionId: "ses_other", openSessions: [] }),
    });
    expect(v.state).toBe("done");
    expect(v.otherTabs).toBe(0);
  });

  test("while the day's sessions load, the bootstrap's open session counts only when it is this tab's (or untagged)", () => {
    const base = { plan, lastEnded: null, titleOf, tab: TAB, server: null };
    expect(todayView({ ...base, boot: fixtureBootstrap({ day: DAY, openSession: theirs }) }).state).toBe(
      "normal",
    );
    expect(todayView({ ...base, boot: fixtureBootstrap({ day: DAY, openSession: mine }) }).state).toBe(
      "in-session",
    );
    const untagged = fixtureSession({ id: "ses_old" });
    expect(todayView({ ...base, boot: fixtureBootstrap({ day: DAY, openSession: untagged }) }).state).toBe(
      "in-session",
    );
  });

  test("a server that lists no openSessions (older): its one open session is the tab's, as before", () => {
    const v = todayView({
      plan,
      boot: boot(),
      lastEnded: null,
      titleOf,
      tab: TAB,
      server: dayWith({ open: fixtureSession({ id: "ses_any" }) }),
    });
    expect(v.state).toBe("in-session");
    expect(v.otherTabs).toBe(0);
  });
});

describe("the Coda says what the learner can now do (U12–U17 specs: 'The Coda says: you can now …')", () => {
  test("the statement turns to the second person", () => {
    expect(canNow("I can build the V of V and say where it resolves.")).toBe(
      "You can now build the V of V and say where it resolves.",
    );
    expect(canNow("I can now hear it.")).toBe("You can now hear it.");
    expect(canNow("Something else.")).toBe("Something else.");
  });

  test("every lesson of U12–U17 has a line, and each line is its own registry statement", () => {
    const lessons = syllabus.units
      .filter((u) => /^U1[2-7]$/.test(u.id))
      .flatMap((u) => u.lessons.filter((l) => !l.optional).map((l) => l.id as string));
    expect(lessons).toHaveLength(33);
    for (const id of lessons) {
      const lines = canNowLines({ id, completed: true }, candos);
      expect({ id, n: lines.length }).not.toEqual({ id, n: 0 });
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const l of lines) {
        expect(l.text).toMatch(/^You can now .+\.$/);
        expect(l.text).not.toMatch(/!/);
        expect(candos.find((c) => c.id === l.candoId)?.source).toBe(id as never);
      }
    }
  });

  test("six days of the long stretch read as something a song does, the thing written before the thing heard", () => {
    const first = (id: string) => canNowLines({ id, completed: true }, candos)[0]?.text;
    expect(first("U12.L01")).toBe(
      "You can now write major seventh and minor seventh chords by name and hear what the 7th adds.",
    );
    expect(first("U13.L01")).toBe(
      "You can now push a chord or a note ahead of the beat with .early() and lay it back with .late().",
    );
    expect(first("U14.L02")).toBe("You can now write a Mixolydian riff over I, ♭VII and IV.");
    expect(first("U15.L02")).toBe("You can now build the V of V and say where it resolves.");
    expect(first("U16.L01")).toBe("You can now darken a major-key progression with the minor iv.");
    expect(first("U17.L02")).toBe("You can now lift a chorus into a new key with a patterned .scale().");
    // U15.L01 teaches a way to write and a way to hear: the written one is said first.
    expect(canNowLines({ id: "U15.L01", completed: true }, candos).map((l) => l.candoId)).toEqual([
      "cd.code.chromatic-degrees",
      "cd.hear.chromatic-degrees",
    ]);
  });

  test("a release says what the track shows; a lesson left part-way, a checkpoint and a gym day say nothing", () => {
    expect(canNowLines({ id: "C7.S3", completed: true }, candos)[0]?.text).toBe(
      "You can now colour a song with secondary dominants, borrowed chords and a key lift.",
    );
    expect(canNowLines({ id: "CF-A.S4", completed: true }, candos)[0]?.text).toBe(
      "You can now finish a two-minute song with a bridge.",
    );
    expect(canNowLines({ id: "U15.L02", completed: false }, candos)).toEqual([]);
    expect(canNowLines({ id: "GYM.15", completed: true }, candos)).toEqual([]);
    expect(canNowLines({ id: null, completed: true }, candos)).toEqual([]);
  });

  test("first evidence already said under the title is not repeated in the card; a status move still is", () => {
    const said = canNowLines({ id: "U15.L02", completed: true }, candos);
    const changes = [
      {
        candoId: "cd.write.secondary-dominant",
        statement: "s",
        area: "write",
        from: null,
        to: "emerging" as const,
      },
      {
        candoId: "cd.code.loop",
        statement: "t",
        area: "code",
        from: "emerging" as const,
        to: "solid" as const,
      },
    ];
    expect(canDoBelow(changes, said).map((c) => c.candoId)).toEqual(["cd.code.loop"]);
    const moved = [{ ...changes[0], from: "emerging" as const, to: "solid" as const }];
    expect(canDoBelow(moved as never, said)).toHaveLength(1);
  });
});

describe("after the core, nothing is 'still being written' on the path the learner walked", () => {
  test("a complete core is never the edge of the written course", () => {
    const done = { next: null, core: "complete" } as never;
    expect(courseEdge(done, syllabus, new Set(["U01.L01"]), null)).toBeNull();
    expect(
      courseEdge({ next: null } as never, syllabus, new Set(["U01.L01"]), {
        mapItemId: null,
        core: "complete",
      }),
    ).toBeNull();
    // Before it, the edge is still told (the written course may end before the core does).
    expect(courseEdge({ next: null } as never, syllabus, new Set(["U01.L01"]), null)).not.toBeNull();
  });

  test("a review day after the core is an ordinary day with its own words", () => {
    const plan = fixturePlan({
      kind: "review",
      mapItemId: null,
      title: "Review",
      main: null,
      core: "complete",
    });
    const v = todayView({
      plan,
      boot: boot(),
      lastEnded: null,
      titleOf,
      edge: { nextId: null, nextUnit: null, doneUnit: null },
    });
    expect(v.state).toBe("review");
    expect(v.heading).toBe("Review day");
    expect(v.lead).toBe(
      "Reviews keep what you know fresh and the Oak green. Studio is open when they are done.",
    );
    expect(v.primary?.label).toBe("Start session");
  });
});

describe("titles of the finale's sessions", () => {
  test("a finale session reads by what it is wherever a map item is named (Today's 'Next time', the Coda)", () => {
    expect(titleOf("CF-T.S2")).toBe("Standard Transcription · session 2");
    expect(titleOf("CF-A.S1")).toBe("Album Single");
    expect(titleOf("CF-A")).toBe("Album Single");
    expect(titleOf("C7.S3")).toBe("C7 Chromatic Colour · session 3");
    expect(titleOf("U17.L02")).toBe("Truck-Driver & Direct Modulation");
  });
});

describe("the Coda after a CF-T session says when the standard comes back (RETURN)", () => {
  test("after sessions 1–3: the next slot, and what the next session asks", () => {
    expect(cftAfterLine("CF-T.S1", false)).toBe(
      "Your standard goes on in your next transcription slot, about five sessions from now, or any day from Today: session 2 of 4, the changes.",
    );
    expect(cftAfterLine("CF-T.S2", false)).toMatch(/session 3 of 4, the melody\.$/);
    expect(cftAfterLine("CF-T.S3", false)).toMatch(/session 4 of 4, the arrangement and the release\.$/);
  });
  test("never after the last session, once released, or after anything else", () => {
    expect(cftAfterLine("CF-T.S4", false)).toBeNull();
    expect(cftAfterLine("CF-T.S2", true)).toBeNull();
    expect(cftAfterLine("C6.S1", false)).toBeNull();
    expect(cftAfterLine("U15.L02", false)).toBeNull();
    expect(cftAfterLine(null, false)).toBeNull();
  });
});
