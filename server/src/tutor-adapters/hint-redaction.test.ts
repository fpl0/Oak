// The tutor's adapters over a REAL lesson (U01.L01 "Heartbeat"), end to end through the HTTP hint route and
// the scripted fake backend (OAK_TUTOR_FAKE). The fake's `#echo` marker is a worst-case model: it repeats
// everything it was given — the oak_context block and the get_lesson_context tool result at the turn's
// rung. So whatever the echo does not contain, no model could have said. Contracts §10.4, §10.5, §10.8.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type OakServer } from "../app.ts";
import { testConfig } from "../config.ts";
import type { ContentSource } from "../content/types.ts";
import { realCourse } from "../testing/course.ts";
import { BROWSER, FakeHost, gradeResult } from "../testing/harness.ts";
import { decodeNested, leakMarkers, normalizeWs } from "../tutor/leak-markers.ts";
import { stepSource } from "./lessons.ts";

let server: OakServer;
let bun: ReturnType<typeof Bun.serve>;
let port = 0;
let dir = "";
let course: ContentSource;

beforeAll(async () => {
  course = await realCourse();
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
  port = probe.port as number;
  await probe.stop(true);
  dir = mkdtempSync(join(tmpdir(), "oak-hint-redaction-"));
  const host = new FakeHost();
  server = await createServer({
    config: testConfig(dir, { port, dev: true, tutorFake: true }),
    content: course,
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

const headers = () => ({
  ...BROWSER,
  host: `127.0.0.1:${port}`,
  origin: `http://127.0.0.1:${port}`,
  "content-type": "application/json",
});
async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: headers(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return JSON.parse(text) as T;
}
/** The streamed reply text of one tutor turn (SSE `text` deltas joined). */
async function turn(route: string, body: unknown): Promise<{ text: string; raw: string }> {
  const res = await fetch(`http://127.0.0.1:${port}/api/tutor/${route}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  expect(res.status).toBe(200);
  const text = [...raw.matchAll(/^event: text\ndata: (.*)$/gm)]
    .map((m) => (JSON.parse(m[1] as string) as { delta: string }).delta)
    .join("");
  return { text, raw };
}

const LESSON = "U01.L01";

describe("hints on a real lesson through the fake backend", () => {
  test("a rung-1 hint cannot contain the solution, the later hints or the wrong variants; the reveal can", async () => {
    await api("POST", "/api/dev/seed", { point: "after U00.L02" });
    const def = course.lessons.find((l) => l.id === LESSON);
    const step = def?.steps.find((s) => s.graded === true && s.exercise?.kind === "code-modify");
    expect(step).toBeDefined();
    if (step === undefined || step.exercise === undefined) return;
    const source = stepSource(LESSON, step);
    expect(source.solutions.length).toBeGreaterThan(0);
    const markers = leakMarkers(source);
    const thread = { subjectKind: "lesson", subjectId: LESSON };
    const req = (userText: string) => ({
      thread,
      kind: "hint",
      userText,
      lessonId: LESSON,
      stepId: step.id,
      learnerCode: source.starterCode ?? "",
    });

    // The hint route advances the server's rung by one: this turn is at rung 1.
    const r1 = await turn("hint", req("#echo I am stuck"));
    const s1 = await api<{ rung: number }>("GET", `/api/lessons/${LESSON}/steps/${step.id}`);
    expect(s1.rung).toBe(1);
    const said1 = normalizeWs(decodeNested(r1.text));
    expect(said1).toContain("hint_rung: 1 of 4");
    expect(said1).toContain("answer_policy: socratic");
    // A known mistake that is the unchanged starter is shown anyway (it is the starter).
    const shown = normalizeWs(`${source.starterCode ?? ""} ${source.prompt}`);
    // The step context really was fetched at this rung (the echo holds the tool result).
    expect(said1).toContain('"answer_policy":"socratic"');
    expect(said1).toContain('"solution":null');
    for (const m of markers) {
      if (m.minLevel <= 1 || shown.includes(m.text)) continue;
      expect({ label: m.label, leaked: said1.includes(m.text) }).toEqual({ label: m.label, leaked: false });
    }
    // The rung-1 nudge itself is allowed and is there.
    if (source.hints !== null) expect(said1).toContain(normalizeWs(source.hints[0]));
    // Nothing above the rung reaches the browser either (the whole SSE stream).
    const raw1 = normalizeWs(decodeNested(r1.raw));
    for (const m of markers.filter((m) => m.label === "solution" || m.label === "hint-reveal"))
      expect(raw1.includes(m.text)).toBe(false);

    // Two graded attempts open the reveal; hint 4 is the only way to rung 4.
    for (const score of [0.3, 0.4])
      await api("POST", `/api/lessons/${LESSON}/steps/${step.id}/attempts`, {
        sessionId: null,
        exerciseId: step.exercise.id,
        exerciseVersion: step.exercise.version,
        seriesNo: 0,
        params: null,
        response: { code: source.starterCode ?? "" },
        result: gradeResult({ exerciseId: `${LESSON}/${step.exercise.id}`, score }),
        extraReplays: 0,
        activeMs: 1000,
        tutorAssisted: false,
      });
    // A tutor hint never goes past rung 3 by itself.
    await turn("hint", req("still stuck"));
    await turn("hint", req("still stuck"));
    await turn("hint", req("still stuck"));
    expect((await api<{ rung: number }>("GET", `/api/lessons/${LESSON}/steps/${step.id}`)).rung).toBe(3);
    await api("POST", `/api/lessons/${LESSON}/steps/${step.id}/hints`, { reveal: true });
    const r4 = await turn("hint", req("#echo show me"));
    const said4 = normalizeWs(decodeNested(r4.text));
    expect(said4).toContain("hint_rung: 4 of 4");
    expect(said4).toContain(normalizeWs(source.solutions[0] as string));
  });

  test("the context names introduced terms by ID, so introduced terms are not badged as previews", async () => {
    const ports = server.deps.tutor?.ports;
    expect(ports).toBeDefined();
    const terms = await ports?.progress.termsIntroduced();
    expect(terms?.count).toBeGreaterThan(0);
    for (const id of terms?.recent ?? []) expect(id).toMatch(/^term\./);
    const r = await turn("chat", {
      thread: { subjectKind: "lesson", subjectId: LESSON },
      kind: "chat",
      userText: "#echo what is this?",
    });
    expect(r.text).toContain(`terms_introduced: ${terms?.count}`);
  });

  test("ear and predict steps with a fixed answer are socratic below the reveal", () => {
    const predict = course.lessons
      .flatMap((l) => l.steps.map((s) => ({ l, s })))
      .find(
        ({ s }) =>
          s.exercise?.kind === "predict" && Array.isArray((s.exercise as { correct?: unknown }).correct),
      );
    expect(predict).toBeDefined();
    if (predict === undefined) return;
    const src = stepSource(predict.l.id, predict.s);
    expect(src.solutions.length).toBeGreaterThan(0);
    // The answer is the choice's label, as the learner sees it, not its ID.
    const ex = predict.s.exercise as { choices?: { id: string; label: string }[]; correct: string[] };
    const label = ex.choices?.find((c) => c.id === ex.correct[0])?.label;
    if (label !== undefined) expect(src.solutions[0]).toContain(label);
  });
});
