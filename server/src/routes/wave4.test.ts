// The Wave 4 endpoints over HTTP (docs/design/wave4.md §5) on the real course, each started from a dev seed:
// multi-session capstones with their checks and gate, album versions and reviews, transcription settings, the
// ladder graded exactly by the real grader, the gym plan, the voicing gate and sung statistics, backup → restore.
import { beforeAll, describe, expect, test } from "bun:test";
import type {
  AlbumTrackDetail,
  AlbumTrackVersion,
  CapstoneGate,
  CapstoneSessions,
  DevSeedResult,
  FamilyState,
  GymPlan,
  LadderItem,
  LadderState,
  LadderSubmitResult,
  ReviewRecord,
  SessionPlan,
  StepAttemptResult,
  Transcription,
  TranscriptionDetail,
  Unlock,
  VoicingGate,
} from "@oak/api";
import type { CapstoneDef, Exercise, GradeResult, LessonDef, PhraseCheck } from "@oak/content-kit";
import { gradeExercise } from "@oak/grader";
import { loadContent } from "../content/loader.ts";
import type { ContentSource } from "../content/types.ts";
import { CONTENT_DIR, standInLesson } from "../testing/course.ts";
import { gradeResult, type Harness, harness } from "../testing/harness.ts";

let real: ContentSource;
beforeAll(async () => {
  real = await loadContent({ contentDir: CONTENT_DIR });
});

const NOW = "2026-11-11T12:00:00.000Z";
const DAY = 86_400_000;

async function seeded(
  point: string,
  content: ContentSource = real,
): Promise<{ h: Harness; seed: DevSeedResult }> {
  const h = await harness({ dev: true, content, now: NOW });
  await h.json("PUT", "/api/profile", { timezone: "UTC" });
  const r = await h.json<DevSeedResult>("POST", "/api/dev/seed", { point });
  if (r.status !== 200) throw new Error(`seed ${point}: ${r.status} ${JSON.stringify(r.body)}`);
  return { h, seed: r.body };
}
async function ok<T>(h: Harness, method: string, path: string, body?: unknown): Promise<T> {
  const r = await h.json<T>(method, path, body);
  if (r.status < 200 || r.status >= 300)
    throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}
async function newSketch(h: Harness, code: string, origin = { kind: "capstone", id: "C2" }) {
  const r = await ok<{ sketch: { id: string; currentVersion: number } }>(h, "POST", "/api/sketches", {
    title: "Draft",
    originKind: origin.kind,
    originId: origin.id,
    code,
    bpm: 96,
    meter: "4/4",
    key: { tonic: "C", mode: "major" },
    analysis: null,
    note: null,
    tutorAssisted: false,
    band: null,
    flags: { lockedTools: [], previewTools: [] },
    ranOk: true,
    sessionId: null,
  });
  return r.sketch;
}
/** The learner host grades with the real grader, in process (ladder answers are graded exactly). */
function realGrader(h: Harness): void {
  (h.learner as unknown as { grade: (req: never) => Promise<GradeResult> }).grade = (req) =>
    gradeExercise(req);
}

/** The real course with X1's phrase checks written (author:songs writes them; this test pins the server side). */
function withX1Checks(c: ContentSource): ContentSource {
  const melody = (id: string, phrase: number): PhraseCheck => ({
    id,
    phrase,
    layer: "melody",
    matcher: { m: "melody", pitch: "key-relative", wPitch: 0.6, wRhythm: 0.4, rhythmTol: [1, 16] } as never,
    pass: 0.85,
  });
  const capstones = c.capstones.map((cap): CapstoneDef => {
    if (cap.id !== "X1") return cap;
    const defs = cap.sessionDefs.map((s, i) => ({
      ...s,
      ...(i === 0 ? { checks: [melody("phrase-1", 1), melody("phrase-2", 2)] } : {}),
      ...(i === 1 ? { checks: [melody("phrase-3", 3), melody("phrase-4", 4)] } : {}),
      ...(i === 2
        ? {
            checks: [
              {
                id: "chords",
                phrase: [1, 4] as [number, number],
                layer: "chords" as const,
                matcher: { m: "harmony", level: "rn", qualityDepth: "triad" } as never,
                pass: 0.8,
                stages: ["bass", "quality", "rn"] as ("bass" | "quality" | "rn")[],
              },
            ],
          }
        : {}),
    }));
    return { ...cap, sessionDefs: defs };
  });
  const song = {
    id: "song.aura-lee",
    title: "Aura Lee",
    year: 1861,
    status: "US-PD",
    provenance: { source: "test", year: 1861 },
    verifiedBy: "test",
    key: { tonic: "C", mode: "major" },
    meter: "4/4",
    bpm: 80,
    form: "AABA",
    answerKey: {
      bars: 16,
      code: 'setcpm(80/4)\n\nmelody: n("<[0 1 2 3]>").scale("C4:major").s("piano")',
      layers: { melody: 'setcpm(80/4)\n\nmelody: n("<[0 1 2 3]>").scale("C4:major").s("piano")' },
    },
  } as unknown as ContentSource["songs"][number];
  return { ...c, capstones, songs: c.songs.some((s) => s.id === song.id) ? c.songs : [...c.songs, song] };
}

/** The real course with U05.L07 and U05.L08 written as minimal lessons carrying the gate exercise and its variant. */
function withGateLessons(c: ContentSource): ContentSource {
  const lessons: LessonDef[] = [];
  for (const [id, exId] of [
    ["U05.L07", "hand-voiced-cadence"],
    ["U05.L08", "hand-voiced-cadence-again"],
  ] as const) {
    if (c.lessons.some((l) => l.id === id)) continue;
    const unit = c.syllabus.units.find((u) => u.lessons.some((l) => l.id === id));
    const meta = unit?.lessons.find((l) => l.id === id);
    if (unit === undefined || meta === undefined) throw new Error(`no syllabus row ${id}`);
    const lesson = standInLesson(meta, unit);
    lesson.steps = lesson.steps.map((st) =>
      st.id === "S2"
        ? {
            ...st,
            exercise: { ...(st.exercise as Exercise), id: exId } as Exercise,
            ...(id === "U05.L08" ? { gateCheck: true as const } : {}),
          }
        : st,
    );
    lessons.push(lesson);
  }
  return { ...c, lessons: [...c.lessons, ...lessons] };
}

describe("multi-session capstones (wave4.md §5.1)", () => {
  test("C2: sessions, drafts (the session's Make), completion, the gate, never a check without one", async () => {
    const { h } = await seeded("C2 open");
    try {
      let ss = await ok<CapstoneSessions>(h, "GET", "/api/capstones/C2/sessions");
      expect(ss).toMatchObject({ capstoneId: "C2", current: "C2.S1" });
      expect(ss.sessions.map((s) => s.status)).toEqual(["open", "locked"]);
      expect((await h.json("GET", "/api/capstones/C9/sessions")).status).toBe(404);
      const gate = await ok<CapstoneGate>(h, "GET", "/api/capstones/C2/gate");
      expect(gate).toMatchObject({ open: true, gymSetsToOpen: null, message: null });
      expect(gate.conditions).toEqual([
        {
          kind: "checkpoint",
          ref: "U07.CP",
          label: expect.stringContaining("passed"),
          met: true,
          have: null,
          need: null,
        },
      ]);
      const ses = await ok<{ id: string }>(h, "POST", "/api/session/start", {
        kind: "capstone",
        mapItemId: "C2.S1",
        targetMinutes: 20,
      });
      ss = await ok<CapstoneSessions>(h, "GET", "/api/capstones/C2/sessions");
      expect(ss.sessions[0]).toMatchObject({ status: "open", sessionId: ses.id });
      const sk = await newSketch(h, 's("bd sd")');
      // A draft for a session that is not open yet, an unknown sketch version: refused.
      const locked = await h.json("POST", "/api/capstones/C2/drafts", {
        capstoneSessionId: "C2.S2",
        sessionId: ses.id,
        sketchId: sk.id,
        sketchVersion: 1,
      });
      expect(locked.status).toBe(409);
      expect(
        (
          await h.json("POST", "/api/capstones/C2/drafts", {
            capstoneSessionId: "C2.S1",
            sessionId: ses.id,
            sketchId: sk.id,
            sketchVersion: 9,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await h.json("POST", "/api/capstones/C2/drafts", {
            capstoneSessionId: "X1.S1",
            sessionId: ses.id,
            sketchId: sk.id,
            sketchVersion: 1,
          })
        ).status,
      ).toBe(404);
      ss = await ok<CapstoneSessions>(h, "POST", "/api/capstones/C2/drafts", {
        capstoneSessionId: "C2.S1",
        sessionId: ses.id,
        sketchId: sk.id,
        sketchVersion: 1,
      });
      expect(ss.sessions[0]).toMatchObject({
        status: "in_progress",
        draft: { sketchId: sk.id, sketchVersion: 1 },
      });
      // The saved draft is a saved sketch for the week.
      const streak = await ok<{ days: { day: string; sketchSaved: boolean }[] }>(h, "GET", "/api/streak");
      expect(streak.days.find((d) => d.day === "2026-11-11")?.sketchSaved).toBe(true);
      // C2 is a composition: it has no phrase checks.
      const nocheck = await h.json("POST", "/api/capstones/C2/checks/phrase-1", {
        capstoneSessionId: "C2.S1",
        stage: null,
        sketchId: sk.id,
        sketchVersion: 1,
        result: gradeResult({ exerciseId: "C2/phrase-1" }),
      });
      expect(nocheck.status).toBe(404);
      await ok(h, "POST", "/api/capstones/C2/sessions", {
        sessionId: null,
        capstoneSessionId: "C2.S1",
        sketchId: sk.id,
        flavour: null,
      });
      ss = await ok<CapstoneSessions>(h, "GET", "/api/capstones/C2/sessions");
      expect(ss.sessions.map((s) => s.status)).toEqual(["done", "open"]);
      expect(ss.sessions[0]?.completedAt).not.toBeNull();
      expect(ss.current).toBe("C2.S2");
    } finally {
      await h.close();
    }
  }, 90_000);

  test("X1: phrase checks graded in the browser, stages in order, reveals named, release on the checks", async () => {
    const content = withX1Checks(real);
    const { h } = await seeded("X1 open", content);
    try {
      const gate = await ok<CapstoneGate>(h, "GET", "/api/capstones/X1/gate");
      expect(gate.open).toBe(true);
      await ok<{ id: string }>(h, "POST", "/api/session/start", {
        kind: "capstone",
        mapItemId: "X1.S1",
        targetMinutes: 20,
      });
      const sk = await newSketch(h, 'setcpm(80/4)\n\nmelody: n("0 1 2 3").scale("C4:major").s("piano")', {
        kind: "capstone",
        id: "X1",
      });
      const check = (
        checkId: string,
        capstoneSessionId: string,
        result: GradeResult,
        stage: string | null = null,
        key?: string,
      ) =>
        h.json<CapstoneSessions>("POST", `/api/capstones/X1/checks/${checkId}`, {
          capstoneSessionId,
          stage,
          sketchId: sk.id,
          sketchVersion: 1,
          result,
          ...(key === undefined ? {} : { idempotencyKey: key }),
        });
      let ss = await ok<CapstoneSessions>(h, "GET", "/api/capstones/X1/sessions");
      expect(ss.sessions[0]?.checks.map((c) => [c.checkId, c.open, c.attempts])).toEqual([
        ["phrase-1", true, 0],
        ["phrase-2", true, 0],
      ]);
      expect(ss.sessions[2]?.checks.map((c) => [c.stage, c.open])).toEqual([
        ["bass", false],
        ["quality", false],
        ["rn", false],
      ]);
      // A first try below the pass mark, then a pass: the best score is kept; the same key counts once.
      const low = await check(
        "phrase-1",
        "X1.S1",
        gradeResult({ exerciseId: "X1/phrase-1", score: 0.6, mode: "capstone" }),
        null,
        "key-phrase-1-a",
      );
      expect(low.status).toBe(200);
      const again = await check(
        "phrase-1",
        "X1.S1",
        gradeResult({ exerciseId: "X1/phrase-1", score: 0.6, mode: "capstone" }),
        null,
        "key-phrase-1-a",
      );
      expect(again.body.sessions[0]?.checks[0]?.attempts).toBe(1);
      ss = (
        await check(
          "phrase-1",
          "X1.S1",
          gradeResult({ exerciseId: "X1/phrase-1", score: 0.9, mode: "capstone" }),
        )
      ).body;
      expect(ss.sessions[0]?.checks[0]).toMatchObject({
        score: 0.9,
        passed: true,
        revealed: false,
        attempts: 2,
      });
      expect(ss.sessions[0]?.status).toBe("in_progress");
      // 0.84 is not a pass at X1's 0.85; a revealed phrase is not a pass either and is remembered.
      ss = (
        await check(
          "phrase-2",
          "X1.S1",
          gradeResult({ exerciseId: "X1/phrase-2", score: 0.84, mode: "capstone" }),
        )
      ).body;
      expect(ss.sessions[0]?.checks[1]).toMatchObject({ passed: false });
      const revealed = gradeResult({ exerciseId: "X1/phrase-2", score: 1, mode: "capstone" });
      revealed.assist = { ...revealed.assist, rung: 4, revealed: true };
      ss = (await check("phrase-2", "X1.S1", revealed)).body;
      expect(ss.sessions[0]?.checks[1]).toMatchObject({ passed: false, revealed: true });
      // Wrong check, stage given where there is none, a session not open yet.
      expect((await check("phrase-9", "X1.S1", gradeResult({ exerciseId: "X1/x" }))).status).toBe(404);
      expect((await check("phrase-1", "X1.S1", gradeResult({ exerciseId: "X1/x" }), "bass")).status).toBe(
        400,
      );
      expect((await check("phrase-3", "X1.S2", gradeResult({ exerciseId: "X1/x" }))).status).toBe(409);
      await ok(h, "POST", "/api/capstones/X1/sessions", {
        sessionId: null,
        capstoneSessionId: "X1.S1",
        sketchId: sk.id,
        flavour: null,
      });
      for (const id of ["phrase-3", "phrase-4"])
        await ok(h, "POST", `/api/capstones/X1/checks/${id}`, {
          capstoneSessionId: "X1.S2",
          stage: null,
          sketchId: sk.id,
          sketchVersion: 1,
          result: gradeResult({ exerciseId: `X1/${id}`, score: 0.95, mode: "capstone" }),
        });
      await ok(h, "POST", "/api/capstones/X1/sessions", {
        sessionId: null,
        capstoneSessionId: "X1.S2",
        sketchId: sk.id,
        flavour: null,
      });
      // Chords bass first: quality before bass is refused; a stage needs its name.
      expect(
        (await check("chords", "X1.S3", gradeResult({ exerciseId: "X1/chords" }), "quality")).status,
      ).toBe(409);
      expect((await check("chords", "X1.S3", gradeResult({ exerciseId: "X1/chords" }))).status).toBe(400);
      const release = {
        sessionId: null,
        sketchId: sk.id,
        sketchVersion: 1,
        title: "Aura Lee",
        flavour: null,
        linerNotesMd: "Aura Lee, by ear.",
        theoryTags: [],
        includeReviewNote: false,
      };
      // Not every stage is checked yet: no release.
      expect((await h.json("POST", "/api/capstones/X1/release", release)).status).toBe(409);
      for (const stage of ["bass", "quality", "rn"])
        ss = (
          await check(
            "chords",
            "X1.S3",
            gradeResult({ exerciseId: "X1/chords", score: 0.82, mode: "capstone" }),
            stage,
          )
        ).body;
      expect(ss.sessions[2]?.checks.every((c) => c.passed && c.open)).toBe(true);
      const out = await ok<{ track: AlbumTrackDetail }>(h, "POST", "/api/capstones/X1/release", release);
      const v1 = out.track.versions[0] as AlbumTrackVersion;
      expect(v1.linerNotesMd).toContain("Aura Lee, by ear.");
      expect(v1.linerNotesMd).toContain("Phrase 2 was revealed with a hint");
      ss = await ok<CapstoneSessions>(h, "GET", "/api/capstones/X1/sessions");
      expect(ss.current).toBeNull();
      expect(ss.sessions.map((s) => s.status)).toEqual(["done", "done", "done"]);
    } finally {
      await h.close();
    }
  }, 90_000);

  test("X1's gate: 'Two more gym sets open X1', one fewer after a strong set; Today schedules a gym day", async () => {
    const { h } = await seeded("C2 released");
    try {
      let gate = await ok<CapstoneGate>(h, "GET", "/api/capstones/X1/gate");
      expect(gate).toMatchObject({ open: false, gymSetsToOpen: 2, message: "Two more gym sets open X1" });
      expect(gate.conditions.find((c) => c.kind === "family-level")).toMatchObject({
        have: 3,
        need: 4,
        met: false,
      });
      const plan = await ok<SessionPlan>(h, "GET", "/api/session/today");
      expect(plan).toMatchObject({ kind: "gym", note: "Two more gym sets open X1" });
      expect(
        (
          await h.json("POST", "/api/session/start", {
            kind: "capstone",
            mapItemId: "X1.S1",
            targetMinutes: 20,
          })
        ).status,
      ).toBe(409);
      // One strong set of melodic dictation in the gym (≥ 0.90): one more to go.
      const row = h.server.deps.repos.srs.family("fam.mel.dictation");
      if (row === null) throw new Error("fam.mel.dictation is not seeded");
      h.server.deps.repos.srs.saveFamily({ ...row, promoDay: "2026-11-10" });
      gate = await ok<CapstoneGate>(h, "GET", "/api/capstones/X1/gate");
      expect(gate).toMatchObject({ gymSetsToOpen: 1, message: "One more gym set opens X1" });
      const gym = await ok<GymPlan>(h, "GET", "/api/gym");
      expect(gym.x1?.message).toBe("One more gym set opens X1");
    } finally {
      await h.close();
    }
  }, 90_000);
});

describe("the album: versions, liner notes, reviews (wave4.md §5.2)", () => {
  test("patch a version's liner notes; attach an accepted review; tutor.reviews lists it with its version", async () => {
    const { h, seed } = await seeded("C2 released");
    try {
      const trackId = seed.trackId as string;
      let v = await ok<AlbumTrackVersion>(h, "PATCH", `/api/album/tracks/${trackId}/versions/1`, {
        linerNotesMd: "Loop, then land.",
      });
      expect(v).toMatchObject({ linerNotesMd: "Loop, then land.", includeReviewNote: false });
      expect((await h.json("PATCH", `/api/album/tracks/${trackId}/versions/1`, {})).status).toBe(400);
      expect(
        (await h.json("PATCH", `/api/album/tracks/${trackId}/versions/7`, { includeReviewNote: true }))
          .status,
      ).toBe(404);
      const repos = h.server.deps.repos;
      const review = {
        strengths: [{ text: "The landing in bar 8 feels earned.", bars: [7, 8] }],
        revisions: [
          {
            title: "Vary bar 5",
            bars: [5, 5],
            why: "Bar 5 repeats bar 1 exactly.",
            tryCode: 'n("2 4 5 4")',
            skills: ["M02"],
          },
        ],
        listeningQuestion: "Where does the loop stop looping?",
        linerNote: "A four-chord loop that knows where home is.",
      };
      const conv = (id: string, subjectKind: string, subjectId: string, lane: "review" | "chat") =>
        repos.tutor.createConversation({
          id,
          key: { subjectKind, subjectId, day: "2026-11-11", lane } as never,
          effort: "medium" as never,
          prefixVersion: "t",
          model: "fake",
          at: "2026-11-11T12:00:00.000Z",
        });
      conv("conv-review", "capstone", "C2", "review");
      conv("conv-other", "capstone", "C1", "review");
      repos.tutor.append(
        "conv-review",
        {
          role: "assistant",
          kind: "review",
          text: "",
          learnerCode: null,
          cardIds: [],
          review,
          stepId: null,
          rung: null,
          summary: null,
          backend: null,
          excluded: false,
          errorKind: null,
        } as never,
        new Date("2026-11-11T12:01:00.000Z"),
      );
      const attach = (conversationId: string, r: unknown) =>
        h.json<AlbumTrackVersion>("PUT", `/api/album/tracks/${trackId}/versions/1/review`, {
          conversationId,
          review: r,
          includeReviewNote: true,
        });
      expect((await attach("nope", review)).status).toBe(404);
      expect((await attach("conv-other", review)).status).toBe(409);
      expect((await attach("conv-review", { ...review, linerNote: "Something else." })).status).toBe(409);
      const attached = await attach("conv-review", review);
      expect(attached.status).toBe(200);
      v = attached.body;
      expect(v).toMatchObject({ review, includeReviewNote: true });
      const list = await ok<{ items: ReviewRecord[] }>(
        h,
        "GET",
        "/api/tutor/reviews?subjectKind=capstone&subjectId=C2",
      );
      expect(list.items as unknown[]).toEqual([
        {
          kind: "capstone",
          subject: { subjectKind: "capstone", subjectId: "C2" },
          conversationId: "conv-review",
          track: { trackId, version: 1 },
          review,
          at: expect.any(String),
        },
      ]);
      expect(
        (
          await ok<{ items: ReviewRecord[] }>(
            h,
            "GET",
            "/api/tutor/reviews?subjectKind=lesson&subjectId=U05.L01",
          )
        ).items,
      ).toEqual([]);
      // The tutor's own path: an accepted review on a turn naming the version lands on that version.
      expect(h.server.deps.services.library.saveCapstoneReview("C2", review, { trackId, version: 2 })).toBe(
        false,
      );
      expect(
        h.server.deps.services.library.saveCapstoneReview("C2", review, {
          trackId,
          version: 1,
          conversationId: "conv-review",
        }),
      ).toBe(true);
    } finally {
      await h.close();
    }
  }, 90_000);
});

describe("transcription projects (wave4.md §5.3)", () => {
  test("settings are remembered and validated; a machine draft is stored without a grade; self-reported evidence", async () => {
    const { h } = await seeded("own-audio project");
    try {
      const own = (await ok<{ items: Transcription[] }>(h, "GET", "/api/transcriptions")).items.find(
        (t) => t.sourceKind === "own-audio",
      ) as Transcription;
      let t = await ok<Transcription>(h, "PUT", `/api/transcriptions/${own.id}/settings`, {
        rate: 0.5,
        fineTuneCents: -20,
      });
      expect(t.settings).toEqual({
        rate: 0.5,
        semitones: 0,
        fineTuneCents: -20,
        loop: { startS: 3, endS: 6 },
        notes: "The hook starts on 5.",
      });
      expect(t.fineTuneCents).toBe(-20);
      for (const bad of [
        { rate: 1.5 },
        { rate: 0.1 },
        { semitones: 13 },
        { fineTuneCents: 60 },
        {},
        { loop: { startS: 4, endS: 2 } },
      ])
        expect((await h.json("PUT", `/api/transcriptions/${own.id}/settings`, bad)).status).toBe(400);
      expect((await h.json("PUT", "/api/transcriptions/tr_none/settings", { rate: 0.5 })).status).toBe(404);
      t = (await ok<TranscriptionDetail>(h, "GET", `/api/transcriptions/${own.id}`)) as Transcription;
      expect(t.settings?.rate).toBe(0.5);
      // Hum it, Oak drafts it: the draft gives no evidence and keeps no grade until corrected and checked.
      const d = await ok<TranscriptionDetail>(h, "POST", `/api/transcriptions/${own.id}/versions`, {
        sessionId: null,
        code: 'n("0 2 4").scale("G4:major")',
        result: gradeResult({ exerciseId: "x", score: 1 }),
        ranOk: true,
        machineDraft: true,
      });
      expect(d.currentVersion).toBe(2);
      expect(h.server.deps.repos.transcriptions.versions(own.id).at(-1)).toMatchObject({
        machineDraft: true,
        result: null,
      });
      // The checklist is self-reported evidence at 0.3 for the layer each item describes.
      await ok(h, "PATCH", `/api/transcriptions/${own.id}`, {
        checklist: { contour: 2, rhythm: 2, landing: 1, bass: 1 },
      });
      const ev = h.server.deps.repos.db
        .query("SELECT score, weight, source_kind FROM evidence WHERE source_id LIKE ? ORDER BY id")
        .all(`${own.id}/%`) as { score: number; weight: number; source_kind: string }[];
      expect(ev.length).toBeGreaterThan(0);
      expect(ev.every((e) => e.weight === 0.3 && e.source_kind === "self-transcription")).toBe(true);
      // A pattern source keeps no fine-tune (contracts §6.12).
      const item = await ok<LadderItem>(h, "POST", "/api/ladder/items", {
        sessionId: null,
        gymId: null,
        seed: 3,
      });
      t = await ok<Transcription>(h, "PUT", `/api/transcriptions/${item.itemId}/settings`, {
        fineTuneCents: 30,
        semitones: -2,
      });
      expect(t.settings).toMatchObject({ fineTuneCents: 0, semitones: -2 });
    } finally {
      await h.close();
    }
  }, 90_000);
});

describe("the ladder, graded exactly on the server (wave4.md §5.4)", () => {
  test("next → submit: the hidden code never leaves; wrong answers fail, the answer key passes; idempotent", async () => {
    const { h } = await seeded("after U07.L03 (gym due)");
    try {
      realGrader(h);
      const ladder = await ok<LadderState>(h, "GET", "/api/ladder");
      expect(ladder).toMatchObject({
        level: 1,
        realism: 0,
        history: [],
        levelUp: null,
        gradedPasses: { "1": 0, "2": 0, "3": 0, "4": 0 },
      });
      const item = await ok<LadderItem>(h, "POST", "/api/ladder/items", {
        sessionId: null,
        gymId: null,
        seed: 11,
      });
      expect(item).toMatchObject({ level: 1, realism: 0, seed: 11, stages: null, given: { meter: "4/4" } });
      const stored = h.server.deps.repos.transcriptions.get(item.itemId);
      const hidden = stored?.hiddenCode as string;
      expect(hidden.length).toBeGreaterThan(10);
      expect(JSON.stringify(item)).not.toContain(hidden);
      expect(JSON.stringify(item)).not.toContain('"ladder"');
      expect(JSON.stringify(await ok(h, "GET", "/api/transcriptions"))).not.toContain(hidden);
      expect(item.project.stimulus?.events.length).toBeGreaterThan(0);
      // The generator's performance hints travel with the stimulus (the player's R2 swing, R3 target, R4 lead);
      // they say nothing about the answer.
      expect(item.project.stimulus?.performance).toEqual({ target: "kick", swung: false, vocalLead: null });
      expect(
        (await ok<LadderItem["project"]>(h, "GET", `/api/transcriptions/${item.itemId}`)).stimulus
          ?.performance,
      ).toEqual({ target: "kick", swung: false, vocalLead: null });
      // Same seed, same item.
      const twin = await ok<LadderItem>(h, "POST", "/api/ladder/items", {
        sessionId: null,
        gymId: null,
        seed: 11,
      });
      expect(h.server.deps.repos.transcriptions.get(twin.itemId)?.hiddenCode).toBe(hidden);
      const answer = h.server.deps.services.ladder.answerOf(item.itemId, null) as string;
      const wrong = await ok<LadderSubmitResult>(h, "POST", `/api/ladder/items/${item.itemId}/submissions`, {
        sessionId: null,
        code: 'drums: s("bd*4")',
        rung: 0,
      });
      expect(wrong).toMatchObject({ passed: false, gradedPass: false, version: 1 });
      const right = await h.json<LadderSubmitResult>("POST", `/api/ladder/items/${item.itemId}/submissions`, {
        sessionId: null,
        code: answer,
        rung: 0,
        idempotencyKey: "ladder-answer-1",
      });
      expect(right.body).toMatchObject({ passed: true, gradedPass: true, version: 2 });
      expect(right.body.result.status).toBe("pass");
      const replay = await ok<LadderSubmitResult>(h, "POST", `/api/ladder/items/${item.itemId}/submissions`, {
        sessionId: null,
        code: answer,
        rung: 0,
        idempotencyKey: "ladder-answer-1",
      });
      expect(replay.version).toBe(2);
      expect(h.server.deps.repos.transcriptions.versions(item.itemId)).toHaveLength(2);
      const after = await ok<LadderState>(h, "GET", "/api/ladder");
      expect(after.gradedPasses["1"]).toBe(1);
      expect(after.history).toEqual([
        { level: 1, realism: 0, score: 1, passed: true, day: "2026-11-11", gymId: null },
      ]);
      // A revealed answer passes but is no graded pass.
      const other = await ok<LadderItem>(h, "POST", "/api/ladder/items", {
        sessionId: null,
        gymId: null,
        seed: 12,
      });
      const shown = await ok<LadderSubmitResult>(h, "POST", `/api/ladder/items/${other.itemId}/submissions`, {
        sessionId: null,
        code: h.server.deps.services.ladder.answerOf(other.itemId, null),
        rung: 4,
      });
      expect(shown).toMatchObject({ passed: true, gradedPass: false });
      // Not a ladder item; levels not open; no stage on an unstaged item.
      const own = await h.json("POST", "/api/ladder/items/tr_none/submissions", {
        sessionId: null,
        code: "x",
        rung: 0,
      });
      expect(own.status).toBe(404);
      expect(
        (await h.json("POST", "/api/ladder/items", { sessionId: null, gymId: null, level: 2 })).status,
      ).toBe(409);
      expect((await h.json("PUT", "/api/ladder", { level: 3 })).status).toBe(409);
      expect(
        (
          await h.json("POST", `/api/ladder/items/${item.itemId}/submissions`, {
            sessionId: null,
            code: answer,
            rung: 0,
            stage: "bass",
          })
        ).status,
      ).toBe(400);
    } finally {
      await h.close();
    }
  }, 90_000);

  test("realism: up after two sessions ≥ 0.9, down after one below 0.6; the level-up is offered, taken, refused", async () => {
    const { h } = await seeded("after U07.L03 (gym due)");
    try {
      realGrader(h);
      const lad = h.server.deps.services.ladder;
      const day = async (code: (id: string) => string, seed: number) => {
        const it = await ok<LadderItem>(h, "POST", "/api/ladder/items", {
          sessionId: null,
          gymId: null,
          seed,
        });
        const r = await ok<LadderSubmitResult>(h, "POST", `/api/ladder/items/${it.itemId}/submissions`, {
          sessionId: null,
          code: code(it.itemId),
          rung: 0,
        });
        h.clock.advance(DAY);
        return r;
      };
      const exact = (id: string) => lad.answerOf(id, null) as string;
      expect((await day(exact, 21)).realismChange).toBeNull();
      expect((await day(exact, 22)).realismChange).toEqual({ from: 0, to: 1 });
      expect((await ok<LadderState>(h, "GET", "/api/ladder")).realism).toBe(1);
      const bad = await day(() => 'drums: s("hh*2")', 23);
      expect(bad.realismChange).toEqual({ from: 1, to: 0 });
      // Up to R2, then two graded passes at R2 on two days offer L2.
      for (const seed of [24, 25, 26, 27]) await day(exact, seed);
      let state = await ok<LadderState>(h, "GET", "/api/ladder");
      expect(state.realism).toBeGreaterThanOrEqual(2);
      for (const seed of [28, 29]) await day(exact, seed);
      state = await ok<LadderState>(h, "GET", "/api/ladder");
      expect(state.levelUp).toMatchObject({ to: 2 });
      expect((await h.json("PUT", "/api/ladder", { level: 4 })).status).toBe(409);
      state = await ok<LadderState>(h, "PUT", "/api/ladder", { level: 2 });
      expect(state).toMatchObject({ level: 2, realism: 0, levelUp: null });
      const l2 = await ok<LadderItem>(h, "POST", "/api/ladder/items", {
        sessionId: null,
        gymId: null,
        seed: 30,
      });
      expect(l2.level).toBe(2);
      const pass = await ok<LadderSubmitResult>(h, "POST", `/api/ladder/items/${l2.itemId}/submissions`, {
        sessionId: null,
        code: exact(l2.itemId),
        rung: 0,
      });
      expect(pass).toMatchObject({ passed: true, gradedPass: true });
      // Down a level any time.
      expect((await ok<LadderState>(h, "PUT", "/api/ladder", { level: 1 })).level).toBe(1);
    } finally {
      await h.close();
    }
  }, 120_000);

  test("L3 is staged bass → quality → rn; the graded pass needs every stage", async () => {
    const { h } = await seeded("ladder L3");
    try {
      realGrader(h);
      const lad = h.server.deps.services.ladder;
      const item = await ok<LadderItem>(h, "POST", "/api/ladder/items", {
        sessionId: null,
        gymId: null,
        seed: 5,
      });
      expect(item).toMatchObject({ level: 3, realism: 1, stages: ["bass", "quality", "rn"] });
      const submit = (stage: string | undefined, code: string) =>
        h.json<LadderSubmitResult>("POST", `/api/ladder/items/${item.itemId}/submissions`, {
          sessionId: null,
          code,
          rung: 0,
          ...(stage === undefined ? {} : { stage }),
        });
      expect((await submit(undefined, "x")).status).toBe(400);
      expect((await submit("quality", lad.answerOf(item.itemId, "quality") as string)).status).toBe(409);
      const bass = await submit("bass", lad.answerOf(item.itemId, "bass") as string);
      expect(bass.body).toMatchObject({ passed: true, gradedPass: false });
      const quality = await submit("quality", lad.answerOf(item.itemId, "quality") as string);
      expect(quality.body).toMatchObject({ passed: true, gradedPass: false });
      const rn = await submit("rn", lad.answerOf(item.itemId, "rn") as string);
      expect(rn.body).toMatchObject({ passed: true, gradedPass: true });
      expect(rn.body.ladder.gradedPasses["3"]).toBe(1);
    } finally {
      await h.close();
    }
  }, 90_000);
});

describe("the gym (contracts §2.5, wave4.md §5.5)", () => {
  test("the slot is due at 4; GYM.nn ordinals; an even slot without audio is a ladder one realism level up", async () => {
    const { h } = await seeded("after U07.L03 (gym due)");
    try {
      let gym = await ok<GymPlan>(h, "GET", "/api/gym");
      expect(gym).toMatchObject({ active: true, sinceLast: 4, slotDue: true, history: [] });
      expect(gym.next).toEqual({
        gymId: "GYM.01",
        kind: "ladder",
        ladderLevel: 1,
        realism: 0,
        ownAudioFallback: false,
        transcriptionId: null,
      });
      const ses = await ok<{ id: string }>(h, "POST", "/api/session/start", {
        kind: "gym",
        mapItemId: "GYM.01",
        targetMinutes: 20,
      });
      const g1 = await ok<{ gymId: string; ladderLevel: number; realism: number }>(
        h,
        "POST",
        "/api/gym/sessions",
        { sessionId: ses.id, kind: "ladder", transcriptionId: null },
      );
      expect(g1).toMatchObject({ gymId: "GYM.01", ladderLevel: 1, realism: 0 });
      const item = await ok<LadderItem>(h, "POST", "/api/ladder/items", {
        sessionId: ses.id,
        gymId: "GYM.01",
      });
      expect(item.project.gymId).toBe("GYM.01");
      expect((await h.json("POST", "/api/ladder/items", { sessionId: ses.id, gymId: "GYM.09" })).status).toBe(
        404,
      );
      gym = await ok<GymPlan>(h, "GET", "/api/gym");
      expect(gym).toMatchObject({ sinceLast: 0, slotDue: false });
      expect(gym.history.map((x) => x.gymId)).toEqual(["GYM.01"]);
      expect(gym.next).toMatchObject({ gymId: "GYM.02", kind: "ladder", realism: 1, ownAudioFallback: true });
      const g2 = await ok<{ gymId: string; realism: number }>(h, "POST", "/api/gym/sessions", {
        sessionId: null,
        kind: "ladder",
        transcriptionId: null,
      });
      expect(g2).toMatchObject({ gymId: "GYM.02", realism: 1 });
      const l2 = await ok<LadderItem>(h, "POST", "/api/ladder/items", { sessionId: null, gymId: "GYM.02" });
      expect(l2.realism).toBe(1);
    } finally {
      await h.close();
    }
  }, 90_000);

  test("before U07.L01 the rule does not run", async () => {
    const { h } = await seeded("after U06.L05");
    try {
      const gym = await ok<GymPlan>(h, "GET", "/api/gym");
      expect(gym).toMatchObject({ active: false, sinceLast: 0, slotDue: false, next: null });
      const plan = await ok<SessionPlan>(h, "GET", "/api/session/today");
      expect(plan.kind).not.toBe("gym");
      expect(plan.alternatives.some((a) => a.kind === "gym")).toBe(false);
    } finally {
      await h.close();
    }
  }, 90_000);
});

describe("the voicing gate (contracts §3.1 rule 6, wave4.md §5.6)", () => {
  test("typed, unrevealed ≥ 0.9 on the gate exercise or its variant; tutor code and reveals never count", async () => {
    const content = withGateLessons(real);
    const { h } = await seeded("after U05.L06", content);
    try {
      let gate = await ok<VoicingGate>(h, "GET", "/api/gates/voicing");
      expect(gate).toMatchObject({
        exerciseId: "U05.L07/hand-voiced-cadence",
        variants: ["U05.L08/hand-voiced-cadence-again"],
        minScore: 0.9,
        best: null,
        passed: false,
        attempts: 0,
      });
      expect(gate.holds).toEqual(
        expect.arrayContaining(["tb.voicing", "tb.chord", "snd.rhodes", "snd.organ"]),
      );
      const attempt = (
        lesson: string,
        exId: string,
        score: number,
        over: { tutorAssisted?: boolean; revealed?: boolean } = {},
      ) => {
        const result = gradeResult({ exerciseId: `${lesson}/${exId}`, score });
        if (over.revealed) result.assist = { ...result.assist, rung: 4, revealed: true };
        const stepId = content.lessons
          .find((l) => l.id === lesson)
          ?.steps.find((st) => st.exercise?.id === exId)?.id;
        return h.json<StepAttemptResult>("POST", `/api/lessons/${lesson}/steps/${stepId}/attempts`, {
          sessionId: null,
          exerciseId: exId,
          exerciseVersion: 1,
          seriesNo: 0,
          params: null,
          response: { code: 'chords: note("<[c3,e3,g3] [c3,f3,a3] [b2,d3,g3] [c3,e3,g3]>")' },
          result,
          extraReplays: 0,
          activeMs: 1000,
          tutorAssisted: over.tutorAssisted ?? false,
        });
      };
      const first = await attempt("U05.L07", "hand-voiced-cadence", 0.97, { tutorAssisted: true });
      expect({ status: first.status, body: first.status === 200 ? null : first.body }).toEqual({
        status: 200,
        body: null,
      });
      expect((await attempt("U05.L07", "hand-voiced-cadence", 1, { revealed: true })).status).toBe(200);
      expect((await attempt("U05.L07", "hand-voiced-cadence", 0.86)).status).toBe(200);
      gate = await ok<VoicingGate>(h, "GET", "/api/gates/voicing");
      expect(gate).toMatchObject({ passed: false, best: 0.86, attempts: 2 });
      // U05.L07 is completed without the gate; U05.L08 cannot be until the gate passes.
      const sk = await newSketch(h, 's("bd sd")', { kind: "lesson-make", id: "U05.L07" });
      const done = { sessionId: null, sketchId: sk.id, lessonVersion: 1, contentHash: "x", splitPart: null };
      expect((await h.json("POST", "/api/lessons/U05.L07/complete", done)).status).toBe(200);
      expect((await h.json("POST", "/api/lessons/U05.L08/complete", done)).status).toBe(409);
      const ids = () =>
        h
          .json<{ items: Unlock[] }>("GET", "/api/unlocks")
          .then((r) => r.body.items.map((u) => u.itemId as string));
      expect(await ids()).not.toContain("tb.voicing");
      // The regenerated variant in U05.L08's gate-check step counts: usable in the lesson at once, granted on completion.
      const pass = await attempt("U05.L08", "hand-voiced-cadence-again", 0.93);
      expect(pass.body.unlocked.map((u) => u.itemId)).toEqual(
        expect.arrayContaining(["tb.voicing", "snd.rhodes"]),
      );
      gate = await ok<VoicingGate>(h, "GET", "/api/gates/voicing");
      expect(gate).toMatchObject({ passed: true, best: 0.93, attempts: 3 });
      expect(gate.passedAt).not.toBeNull();
      expect((await h.json("POST", "/api/lessons/U05.L08/complete", done)).status).toBe(200);
      expect(await ids()).toEqual(
        expect.arrayContaining(["tb.voicing", "tb.chord", "snd.rhodes", "snd.organ"]),
      );
    } finally {
      await h.close();
    }
  }, 90_000);
});

describe("sung statistics (wave4.md §5.6)", () => {
  test("FET families report per-category sung resolutions; skipped and Quiet ones are left out", async () => {
    const { h } = await seeded("after U07.L03 (gym due)");
    try {
      const fam = real.families.find((f) => f.generator === "degree-id");
      if (fam === undefined) throw new Error("no degree-id family");
      const set = await ok<{ id: string }>(h, "POST", "/api/drills/sessions", {
        sessionId: null,
        purpose: "practice",
        familyIds: [fam.id],
        warmupItemId: null,
      });
      const sr = (passed: boolean, extra: { skipped?: boolean; quiet?: boolean } = {}) => ({
        path: ["4", "3"],
        order: "play-first",
        notes: [],
        credit: passed ? 1 : 0,
        passed,
        skipped: extra.skipped ?? false,
        quiet: extra.quiet ?? false,
        tolCents: 50,
      });
      const trial = (idx: number, category: string, sungResolution: unknown) => ({
        idx,
        familyId: fam.id,
        seed: idx,
        level: 1,
        category,
        params: {},
        response: { answer: null, taps: null, sung: null, skipped: false },
        credit: 1,
        correct: true,
        rtMs: 1000,
        replays: 0,
        confusion: null,
        centsError: null,
        at: "2026-11-11T12:00:00.000Z",
        sungResolution,
      });
      await ok(h, "POST", `/api/drills/sessions/${set.id}/trials`, {
        trials: [
          trial(0, "deg.7", sr(true)),
          trial(1, "deg.7", sr(false)),
          trial(2, "deg.4", sr(true)),
          trial(3, "deg.4", sr(true, { skipped: true })),
          trial(4, "deg.2", sr(true, { quiet: true })),
          trial(5, "deg.5", null),
        ],
      });
      const state = await ok<FamilyState>(h, "GET", `/api/drills/difficulty/${fam.id}`);
      expect(state.sungStats).toEqual({ "deg.7": { n: 2, hits: 1 }, "deg.4": { n: 1, hits: 1 } });
      const other = real.families.find((f) => f.generator !== "degree-id" && f.unlock.lesson < "U03");
      if (other !== undefined) {
        const s2 = await h.json<FamilyState>("GET", `/api/drills/difficulty/${other.id}`);
        if (s2.status === 200) expect(s2.body.sungStats).toBeUndefined();
      }
    } finally {
      await h.close();
    }
  }, 90_000);
});

describe("backup → restore keeps Wave 4 state (contracts §11.10)", () => {
  test("ladder, gym, capstone sessions, album recording and own audio survive; the plan is identical", async () => {
    const { h, seed } = await seeded("own-audio project");
    const fresh = await harness({ dev: true, content: real, now: NOW });
    try {
      const before = {
        ladder: await ok(h, "GET", "/api/ladder"),
        gym: await ok(h, "GET", "/api/gym"),
        plan: await ok(h, "GET", "/api/session/today"),
        projects: await ok(h, "GET", "/api/transcriptions"),
        voicing: await ok(h, "GET", "/api/gates/voicing"),
      };
      const exp = await h.req("GET", "/api/backup/export");
      expect(exp.status).toBe(200);
      const archive = new Uint8Array(await exp.arrayBuffer());
      fresh.clock.set(h.clock.now().toISOString());
      const imp = await fresh.destructive("POST", "/api/backup/import", "backup.import", "*", archive);
      expect(imp.status).toBe(200);
      const after = {
        ladder: await ok(fresh, "GET", "/api/ladder"),
        gym: await ok(fresh, "GET", "/api/gym"),
        plan: await ok(fresh, "GET", "/api/session/today"),
        projects: await ok(fresh, "GET", "/api/transcriptions"),
        voicing: await ok(fresh, "GET", "/api/gates/voicing"),
      };
      expect(after).toEqual(before);
      const own = (after.projects as { items: Transcription[] }).items.find(
        (t) => t.sourceKind === "own-audio",
      );
      expect((await fresh.req("GET", `/api/audio/${own?.audioId}`)).status).toBe(200);
      void seed;
    } finally {
      await h.close();
      await fresh.close();
    }
  }, 120_000);
});
