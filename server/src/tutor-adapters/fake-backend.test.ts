import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type OakServer } from "../app.ts";
import { testConfig } from "../config.ts";
import { fixtureContent } from "../content/fixture.ts";
import { BROWSER, FakeHost } from "../testing/harness.ts";
import {
  type BackendTurn,
  type StructuredTurn,
  type TutorEvent,
  validateCapstoneReview,
  validateTranscriptionReview,
} from "../tutor/index.ts";
import {
  chunksOf,
  errorKindIn,
  FakeTutorBackend,
  fakeCapstoneReview,
  fakeTranscriptionReview,
  markersIn,
  replyFor,
  rungIn,
} from "./fake-backend.ts";

function turn(over: Partial<BackendTurn> & { text: string; oakContext?: string }): {
  input: BackendTurn;
  tools: { name: string; input: unknown }[];
  commits: unknown[];
} {
  const tools: { name: string; input: unknown }[] = [];
  const commits: unknown[] = [];
  const input = {
    conversationId: "lesson:U01.L02:2026-11-11:chat",
    kind: "chat",
    lane: "chat",
    model: "claude-opus-5-5",
    effort: "medium",
    limits: { maxTokens: 16_000, maxIterations: 6 },
    prefix: { persona: "", syllabus: "", catalog: "" },
    prefixVersion: "v",
    tools: [],
    executeTool: async (call: { name: string; input: unknown }) => {
      tools.push({ name: call.name, input: call.input });
      return { content: "{}", isError: false };
    },
    transcript: [],
    continuity: { records: [], commit: async (r: readonly unknown[]) => void commits.push(...r) },
    user: { oakContext: over.oakContext ?? "", learnerCode: null, text: over.text },
    isFirstTurn: true,
    ...over,
  } as unknown as BackendTurn;
  return { input, tools, commits };
}

const fast = () => new FakeTutorBackend({ delayMs: 0, slowDelayMs: 5, slowWords: 400 });

describe("markers and canned replies", () => {
  test("markers, error kinds and the rung are read from the turn", () => {
    expect([...markersIn("Show me #CARD and #tool please")]).toEqual(["#card", "#tool"]);
    expect(errorKindIn("#error")).toBe("rate_limit");
    expect(errorKindIn("#error:overloaded")).toBe("overloaded");
    expect(errorKindIn("#error:nonsense")).toBe("rate_limit");
    expect(rungIn("step: S2 · hint_rung: 2 of 4 · answer_policy: x")).toBe(2);
    expect(rungIn("hint_rung: n/a")).toBeNull();
  });

  test("hints differ by rung and never reveal; tokens stay whole when chunked", () => {
    const at = (rung: number) =>
      replyFor(
        { kind: "hint", user: { oakContext: `hint_rung: ${rung} of 4`, learnerCode: null, text: "" } },
        new Set(),
      );
    expect(new Set([at(1), at(2), at(3)]).size).toBe(3);
    for (const r of [1, 2, 3]) expect(at(r)).not.toContain("[[reveal]]");
    const chunks = chunksOf("Bar [[bars:3-4]] lands on [[deg:5]] today.", 1);
    expect(chunks).toContain("[[bars:3-4]]");
    expect(chunks.join("")).toBe("Bar [[bars:3-4]] lands on [[deg:5]] today.");
  });

  test("#sections names the verse and the chorus and a bar range (Wave 5 section chips)", () => {
    const text = replyFor(
      { kind: "chat", user: { oakContext: "", learnerCode: null, text: "#sections" } },
      markersIn("Compare my sections #sections"),
    );
    expect(text).toContain("verse");
    expect(text).toContain("chorus");
    expect(text).toContain("[[bars:8-9]]");
    expect(text).not.toContain("[[reveal]]");
  });

  test("the canned reviews pass the tutor's own validators (counts, words, bars, strict lint of tryCode)", () => {
    for (const revisions of [1, 2] as const) {
      expect(
        validateCapstoneReview(fakeCapstoneReview(revisions, 8), { revisions, totalBars: 8 }),
      ).toMatchObject({
        ok: true,
      });
      expect(
        validateTranscriptionReview(fakeTranscriptionReview(revisions, 8), { revisions, totalBars: 8 }),
      ).toMatchObject({ ok: true });
    }
    expect(validateCapstoneReview(fakeCapstoneReview(1, 2), { revisions: 1, totalBars: 2 }).ok).toBe(true);
  });
});

describe("FakeTutorBackend.runTurn", () => {
  test("chat streams thinking and text, then completes", async () => {
    const events: TutorEvent[] = [];
    const { input, commits } = turn({ text: "What does n mean?" });
    const out = await fast().runTurn(input, (e) => events.push(e), new AbortController().signal);
    expect(out.status).toBe("completed");
    const types = new Set(events.map((e) => e.type));
    expect([...types]).toEqual(["status", "thinking", "text"]);
    const text = events.flatMap((e) => (e.type === "text" ? [e.data.delta] : [])).join("");
    expect(text).toContain("n` = degree − 1");
    expect(commits).toHaveLength(1);
  });

  test("#tool and #card go through executeTool, like a model's tool calls", async () => {
    const { input, tools } = turn({ text: "#tool #card please" });
    const out = await fast().runTurn(input, () => {}, new AbortController().signal);
    expect(out).toMatchObject({ status: "completed", iterations: 3 });
    expect(tools.map((t) => t.name)).toEqual(["get_learner_progress", "propose_code"]);
    expect(tools[1]?.input).toMatchObject({ bars: 4, title: "Four bars in C major" });
  });

  test("#error fails with the kind asked for; #slow stops on abort", async () => {
    const err = await fast().runTurn(
      turn({ text: "#error:overloaded" }).input,
      () => {},
      new AbortController().signal,
    );
    expect(err).toMatchObject({ status: "failed", error: { kind: "overloaded" } });
    const ac = new AbortController();
    const words: string[] = [];
    setTimeout(() => ac.abort(), 30);
    const slow = await fast().runTurn(
      turn({ text: "#slow" }).input,
      (e) => e.type === "text" && words.push(e.data.delta),
      ac.signal,
    );
    expect(slow).toMatchObject({ status: "failed", error: { kind: "aborted" } });
    expect(words.length).toBeGreaterThan(0);
    expect(words.length).toBeLessThan(400);
  });
});

describe("FakeTutorBackend.runStructured", () => {
  test("a review resubmits like a model until Oak's validator accepts it", async () => {
    const backend = fast();
    const structured = {
      ...turn({ text: "", conversationId: "capstone:C5:2026-11-11:review", kind: "review-capstone" }).input,
      maxResubmits: 2,
      // C5 needs 2 revisions and the piece is 2 bars long: the first submission is refused on both counts.
      validate: async (raw: unknown) => validateCapstoneReview(raw, { revisions: 2, totalBars: 2 }),
    } as unknown as StructuredTurn<unknown>;
    const out = await backend.runStructured(structured, new AbortController().signal);
    expect(out.value).toMatchObject({ revisions: [{ bars: [2, 2] }, { bars: [2, 2] }] });
  });
});

describe("over HTTP (OAK_TUTOR_FAKE=1 in dev)", () => {
  let server: OakServer;
  let bun: ReturnType<typeof Bun.serve>;
  let port = 0;
  let dir = "";
  beforeAll(async () => {
    const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
    port = probe.port as number;
    await probe.stop(true);
    dir = mkdtempSync(join(tmpdir(), "oak-fake-tutor-"));
    const host = new FakeHost();
    server = await createServer({
      config: testConfig(dir, { port, dev: true, tutorFake: true, devPorts: [5173, 5208] }),
      content: fixtureContent(),
      graders: { learner: () => host, tutor: () => host },
      env: {},
      log: () => {},
      tutor: { heartbeatMs: 50 },
    });
    bun = Bun.serve({ hostname: "127.0.0.1", port, fetch: (req, srv) => server.app.fetch(req, srv) });
  });
  afterAll(async () => {
    await bun.stop(true);
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const post = async (body: unknown, viaPort = port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/tutor/chat`, {
      method: "POST",
      headers: {
        ...BROWSER,
        host: `127.0.0.1:${viaPort}`,
        origin: `http://127.0.0.1:${viaPort}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, text: await res.text() };
  };
  const events = (text: string) => [...text.matchAll(/^event: (\w+)/gm)].map((m) => m[1]);

  test("health reports the tutor ready on the fake backend", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { ...BROWSER, host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}` },
    });
    expect(await res.json()).toMatchObject({ tutor: "ready", tutorBackend: "claude-cli", dev: true });
  });

  test("a chat turn streams meta, text and one done; the Vite port of the stack is allowed", async () => {
    const r = await post(
      { thread: { subjectKind: "general", subjectId: "general" }, kind: "chat", userText: "What is a rest?" },
      5208,
    );
    expect(r.status).toBe(200);
    const ev = events(r.text);
    expect(ev[0]).toBe("meta");
    expect(ev).toContain("text");
    expect(ev.filter((e) => e === "done" || e === "error")).toEqual(["done"]);
  });

  test("#error ends with an error event; #tool shows the tool call", async () => {
    const thread = { subjectKind: "general", subjectId: "general" };
    const bad = await post({ thread, kind: "chat", userText: "#error" });
    expect(events(bad.text).at(-1)).toBe("error");
    expect(bad.text).toContain('"kind":"rate_limit"');
    const tool = await post({ thread, kind: "chat", userText: "#tool" });
    expect(events(tool.text)).toEqual(expect.arrayContaining(["tool_start", "tool_result", "done"]));
  });
});
