import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createServer } from "./app.ts";
import { testConfig } from "./config.ts";
import { fixtureContent } from "./content/fixture.ts";
import { BROWSER, FakeHost, gradeResult, type Harness, harness } from "./testing/harness.ts";
import { toGradeSnapshot } from "./tutor-adapters/grader.ts";
import { analysisText, keyText } from "./tutor-adapters/lessons.ts";

let h: Harness;
beforeEach(async () => {
  h = await harness({ tutor: { idleTimeout: "best-effort", heartbeatMs: 50 } });
  h.server.deps.repos.profile.patch({ timezone: "UTC" });
});
afterEach(async () => {
  await h.close();
});
const ports = () => {
  const t = h.server.deps.tutor;
  if (t === null) throw new Error("tutor not wired");
  return t.ports;
};

describe("LessonContextPort", () => {
  test("a lesson step is given unredacted: solutions, the four hints, known wrong variants", async () => {
    const step = await ports().lessons.step("U01.L02", "S2");
    expect(step).toMatchObject({
      lessonId: "U01.L02",
      id: "S2",
      grading: "graded",
      exerciseRef: "U01.L02/rest-on-three",
      starterCode: 'setcpm(96/4)\n\ndrums: s("bd bd bd bd")',
      solutions: ['setcpm(96/4)\n\ndrums: s("bd bd ~ bd")'],
    });
    expect(step?.hints).toEqual([
      "Listen again.",
      "Look at beat 3.",
      "Use `~`.",
      'setcpm(96/4)\n\ndrums: s("bd bd ~ bd")',
    ]);
    expect(step?.knownMistakes).toEqual([
      {
        feedback: "rhythm.displaced",
        description: "rest on beat 2",
        variantCode: 'setcpm(96/4)\n\ndrums: s("bd ~ bd bd")',
      },
    ]);
    const make = await ports().lessons.step("U01.L02", "S9");
    expect(make).toMatchObject({ grading: "make", solutions: [] });
    expect(make?.rubric).toEqual([
      { label: "Uses at least one rest", required: true },
      { label: "Something lands on beat 1", required: false },
    ]);
  });

  test("checkpoint items and drills are never given to the tutor", async () => {
    expect(await ports().lessons.step("U01.CP", "S1")).toBeNull();
    expect(await ports().lessons.subject({ subjectKind: "checkpoint", subjectId: "U01.CP" })).toMatchObject({
      tutorOpen: false,
    });
    expect(await ports().lessons.subject({ subjectKind: "drill", subjectId: "fam.rhy.read" })).toMatchObject({
      tutorOpen: false,
    });
    expect(await ports().lessons.subject({ subjectKind: "lesson", subjectId: "U01.L02" })).toMatchObject({
      tutorOpen: true,
      title: "Count to four",
    });
  });

  test("exercise refs resolve to their lesson step; prefix sources come from content", async () => {
    expect(await ports().lessons.resolveExercise("U01.L02/rest-on-three")).toEqual({
      lessonId: "U01.L02",
      stepId: "S2",
    });
    expect(await ports().lessons.resolveExercise("U01.CP/cp-rest")).toBeNull();
    expect(await ports().lessons.prefixSources()).toEqual({
      syllabus: "SYLLABUS (fixture)",
      catalog: "CATALOG (fixture)",
    });
    expect(await ports().lessons.lesson("U01.L02")).toMatchObject({ key: "C major", meter: "4/4", bpm: 96 });
  });

  test("helpers", () => {
    expect(keyText({ tonic: "Eb", mode: "minor" })).toBe("Eb minor");
    expect(analysisText(null)).toBe("No analysis yet.");
  });
});

describe("ProgressPort", () => {
  test("advanceHintRung is the Hint button with a cap, and counts a tutor hint", async () => {
    const s = h.server.deps.services;
    const sk = s.library.createSketch({
      title: "m",
      originKind: "free",
      originId: null,
      sessionId: null,
      code: "x",
      bpm: null,
      meter: null,
      key: null,
      analysis: null,
      note: null,
      tutorAssisted: false,
      band: null,
      flags: { lockedTools: [], previewTools: [] },
      ranOk: false,
    });
    await s.course.complete("U01.L01", {
      sessionId: null,
      sketchId: sk.sketch.id,
      lessonVersion: 1,
      contentHash: "h",
      splitPart: null,
    });
    expect(await ports().progress.advanceHintRung("U01.L02", "S2", 2)).toBe(1);
    expect(await ports().progress.advanceHintRung("U01.L02", "S2", 2)).toBe(2);
    expect(await ports().progress.advanceHintRung("U01.L02", "S2", 2)).toBe(2);
    expect(h.server.deps.repos.lessons.stepState("U01.L02", "S2")).toMatchObject({ rung: 2, tutorHints: 2 });
    // A step without hints keeps its rung.
    expect(await ports().progress.advanceHintRung("U01.L02", "S1", 3)).toBe(0);
    expect(await ports().progress.stepState("U01.L02", "S2")).toMatchObject({
      rung: 2,
      passed: false,
      attempts: 0,
      rubricMet: null,
    });
    const snap = await ports().progress.snapshot();
    expect(snap.current.lesson).toBe("U01.L02");
    expect(snap.unlocked.count).toBe(2);
    expect(await ports().progress.termsIntroduced()).toEqual({ count: 1, recent: ["pulse"] });
  });
});

describe("ConversationStore over SQLite", () => {
  test("create, find, append, read back exactly; excluded entries and records are left out", async () => {
    const c = ports().conversations;
    const key = {
      subjectKind: "lesson" as const,
      subjectId: "U01.L02",
      day: "2026-11-11",
      lane: "chat" as const,
    };
    expect(await c.find(key)).toBeNull();
    const conv = await c.create({
      id: "lesson:U01.L02:2026-11-11:chat",
      key,
      effort: "medium",
      prefixVersion: "p1",
    });
    expect(await c.find(key)).toEqual(conv);
    await expect(c.create({ id: "dup", key, effort: "medium", prefixVersion: "p1" })).rejects.toThrow();
    const base = {
      learnerCode: null,
      cardIds: [],
      review: null,
      stepId: null,
      rung: null,
      summary: null,
      backend: null,
      errorKind: null,
    };
    const e1 = await c.append(conv.id, {
      ...base,
      role: "user",
      kind: "chat",
      text: "why?",
      excluded: false,
    });
    await c.append(conv.id, {
      ...base,
      role: "assistant",
      kind: "chat",
      text: "failed",
      excluded: true,
      errorKind: "overloaded",
    });
    expect(e1.seq).toBe(1);
    expect((await c.entries(conv.id)).map((e) => e.text)).toEqual(["why?"]);
    expect((await c.entries(conv.id, { includeExcluded: true })).map((e) => e.seq)).toEqual([1, 2]);
    expect(
      (await c.subjectDay({ subjectKind: "lesson", subjectId: "U01.L02" }, "2026-11-11")).map((e) => e.text),
    ).toEqual(["why?"]);
    await c.appendBackendRecords(
      conv.id,
      "anthropic-api",
      [{ role: "user", content: [{ type: "text", text: "why?" }] }],
      { excluded: false },
    );
    await c.appendBackendRecords(conv.id, "anthropic-api", [{ broken: true }], { excluded: true });
    await c.appendBackendRecords(conv.id, "claude-cli", [{ session: "x" }], { excluded: false });
    expect(await c.backendRecords(conv.id, "anthropic-api")).toEqual([
      { role: "user", content: [{ type: "text", text: "why?" }] },
    ]);
    const card = await c.saveCard({
      conversationId: conv.id,
      toolUseId: "tu",
      kind: "variation",
      title: "t",
      code: "c",
      explanation: "e",
      bars: 2,
      apply: "applicable",
      applyAllowed: true,
      lockedTools: [],
    });
    expect(card.applied).toBe(false);
    await c.markCardApplied(card.cardId);
    expect((await c.card(card.cardId))?.applied).toBe(true);
  });

  test("notes, usage, settings", async () => {
    const p = ports();
    const n = await p.notes.add({
      day: "2026-11-11",
      subjectKind: "sketch",
      subjectId: "sk1",
      source: "listening",
      text: "Good groove.",
      skillId: null,
    });
    expect(await p.notes.recent({ subjectKind: "sketch", subjectId: "sk1" }, 5)).toEqual([n]);
    await p.notes.retract(n.id, "2026-11-11T13:00:00.000Z");
    expect(await p.notes.recent({ subjectKind: "sketch", subjectId: "sk1" }, 5)).toEqual([]);
    const usage = {
      backend: "anthropic-api" as const,
      requests: 1,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 900,
      cacheCreationInputTokens: 0,
      cacheCreation1hInputTokens: 0,
      cacheCreation5mInputTokens: 0,
      costUsd: 0.25,
      includedInPlan: false,
      servedBy: ["m"],
    };
    await p.usage.record({
      at: "2026-11-11T12:00:00.000Z",
      day: "2026-11-11",
      conversationId: "c",
      kind: "chat",
      lane: "chat",
      usage,
    });
    await p.usage.record({
      at: "2026-10-31T12:00:00.000Z",
      day: "2026-10-31",
      conversationId: "c",
      kind: "chat",
      lane: "chat",
      usage,
    });
    expect(await p.usage.month("2026-11")).toEqual({
      costUsd: 0.25,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 900,
      cacheCreationInputTokens: 0,
    });
    expect((await p.settings.tutor()).softMonthlyUsd).toBe(25);
    await p.settings.markSoftWarned("2026-11");
    expect((await p.settings.tutor()).softWarnedMonth).toBe("2026-11");
    expect(p.clock.timeZone()).toBe("UTC");
    const report = await h.json<{
      costUsd: number;
      byLane: { lane: string; requests: number }[];
      cacheHitRatio: number;
    }>("GET", "/api/tutor/usage?month=2026-11");
    expect(report.status).toBe(200);
    expect(report.body.costUsd).toBe(0.25);
    expect(report.body.cacheHitRatio).toBeCloseTo(0.9, 10);
    expect(report.body.byLane.find((l) => l.lane === "chat")?.requests).toBe(1);
  });
});

describe("GraderPort", () => {
  test("a GradeResult becomes the tutor's snapshot", () => {
    const snap = toGradeSnapshot(
      gradeResult({
        exerciseId: "U01.L02/rest-on-three",
        score: 0.5,
        status: "fail",
        dims: { rhythm: { score: 0.5, weight: 1 } },
        diagnostics: [
          {
            id: "rhythm.displaced" as never,
            severity: "error",
            where: { bar: 1, beat: 3, track: "drums", code: [{ from: 20, to: 22 }] },
            params: { expected: "beat 3", got: "beat 2" },
          },
        ],
      }),
    );
    expect(snap.status).toBe("fail");
    expect(snap.dims).toEqual({ rhythm: 0.5 });
    expect(snap.issues[0]).toMatchObject({
      where: { track: "drums", bar: 1, beat: 3, code: { from: 20, to: 22 } },
      feedback: "rhythm.displaced",
      expected: "beat 3",
      got: "beat 2",
    });
  });

  test("tutor code is linted with the tutor-card profile against the learner's unlocked set", async () => {
    const r = await ports()
      .grader.evaluate(
        { code: 's("bd")', fromBar: 1, bars: 4, key: "C major", origin: "tutor" },
        new AbortController().signal,
      )
      .catch((e: unknown) => e);
    const lint = h.tutorHost.calls.find((c) => c.op === "lint")?.arg as {
      ctx: { profile: string; key: unknown };
    };
    expect(lint.ctx.profile).toBe("tutor-card");
    expect(lint.ctx.key).toEqual({ tonic: "C", mode: "major" });
    // The learner host is never used for tutor code.
    expect(h.learner.calls).toEqual([]);
    void r;
  });
});

describe("the tutor over HTTP", () => {
  test("contract routes: timeline, notes, card applied (preview refused), retract, warm", async () => {
    const repos = h.server.deps.repos;
    repos.tutor.createConversation({
      id: "k",
      key: { subjectKind: "lesson", subjectId: "U01.L02", day: "2026-11-11", lane: "chat" },
      effort: "medium",
      prefixVersion: "p",
      model: "m",
      at: "t",
    });
    repos.tutor.saveCard({
      cardId: "c-prev",
      conversationId: "k",
      toolUseId: "1",
      kind: "fix",
      title: "t",
      code: "c",
      explanation: "e",
      bars: 1,
      apply: "preview_only",
      applyAllowed: false,
      lockedTools: ["tb.fast"],
      createdAt: "t",
    });
    repos.tutor.saveCard({
      cardId: "c-ok",
      conversationId: "k",
      toolUseId: "2",
      kind: "fix",
      title: "t",
      code: "c",
      explanation: "e",
      bars: 1,
      apply: "applicable",
      applyAllowed: true,
      lockedTools: [],
      createdAt: "t",
    });
    repos.tutor.addNote({
      id: "n1",
      day: "2026-11-11",
      subjectKind: "lesson",
      subjectId: "U01.L02",
      source: "observation",
      text: "x",
      skillId: null,
      conversationId: null,
      at: "t",
    });
    const tl = await h.json<{ cards: { cardId: string }[]; notes: unknown[]; tutorOpen: boolean }>(
      "GET",
      "/api/tutor/timeline?subjectKind=lesson&subjectId=U01.L02",
    );
    expect(tl.status).toBe(200);
    expect(tl.body.cards.map((c) => c.cardId).sort()).toEqual(["c-ok", "c-prev"]);
    expect(tl.body.notes).toHaveLength(1);
    expect(
      (await h.json("POST", "/api/tutor/cards/c-prev/applied", { sketchId: null, toNewSketch: false }))
        .status,
    ).toBe(409);
    const ok = await h.json<{ applied: boolean }>("POST", "/api/tutor/cards/c-ok/applied", {
      sketchId: null,
      toNewSketch: true,
    });
    expect(ok.body.applied).toBe(true);
    expect(
      (await h.json("POST", "/api/tutor/cards/nope/applied", { sketchId: null, toNewSketch: false })).status,
    ).toBe(404);
    const r = await h.json<{ retractedAt: string }>("POST", "/api/tutor/notes/n1/retract");
    expect(r.body.retractedAt).not.toBeNull();
    expect(
      (await h.json<{ items: unknown[] }>("GET", "/api/tutor/notes?subjectKind=lesson&subjectId=U01.L02"))
        .body.items,
    ).toEqual([]);
    h.server.deps.repos.settings.put(
      "tutor",
      { backend: "off", softMonthlyUsd: 25, softWarnedMonth: null },
      "t",
    );
    expect((await h.json<{ ok: boolean; warmed: boolean }>("POST", "/api/tutor/warm")).body).toEqual({
      ok: true,
      warmed: false,
    });
  });

  test("a turn streams over Bun.serve and ends with one terminal event (tutor switched off)", async () => {
    const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
    const port = probe.port as number;
    await probe.stop(true);
    const dir = h.dir;
    const learner = new FakeHost();
    const server = await createServer({
      config: testConfig(`${dir}/turn`, { port }),
      content: fixtureContent(),
      graders: { learner: () => learner, tutor: () => learner },
      env: {},
      log: () => {},
      tutor: { heartbeatMs: 50 },
    });
    server.deps.repos.settings.put(
      "tutor",
      { backend: "off", softMonthlyUsd: 25, softWarnedMonth: null },
      "t",
    );
    const bun = Bun.serve({ hostname: "127.0.0.1", port, fetch: (req, srv) => server.app.fetch(req, srv) });
    try {
      const headers = {
        ...BROWSER,
        host: `127.0.0.1:${port}`,
        origin: `http://127.0.0.1:${port}`,
        "content-type": "application/json",
      };
      const health = (await (await fetch(`http://127.0.0.1:${port}/api/health`, { headers })).json()) as {
        tutor: string;
        tutorBackend: null;
      };
      expect(health.tutorBackend).toBeNull();
      const res = await fetch(`http://127.0.0.1:${port}/api/tutor/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          thread: { subjectKind: "general", subjectId: "oak" },
          kind: "chat",
          userText: "What is a rest?",
        }),
      });
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const text = await res.text();
      const events = [...text.matchAll(/^event: (\w+)/gm)].map((m) => m[1]);
      const terminal = events.filter((e) => e === "done" || e === "error");
      expect(terminal).toHaveLength(1);
      expect(text).not.toMatch(/sk-ant/);
      // Cross-origin turns are refused before the tutor sees them.
      const evil = await fetch(`http://127.0.0.1:${port}/api/tutor/chat`, {
        method: "POST",
        headers: { ...headers, origin: "https://evil.example" },
        body: "{}",
      });
      expect(evil.status).toBe(403);
    } finally {
      await bun.stop(true);
      await server.close();
    }
  });
});
