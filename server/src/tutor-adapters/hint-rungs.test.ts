// Redaction at EVERY hint rung through the real wiring (contracts §10.4, §10.5, §10.8): for each graded
// step with a hint ladder in U01–U02, the fake backend's `#echo` (a worst-case model that repeats its whole
// context and tool results) is asked for a hint at rungs 1, 2 and 3. Nothing above the turn's rung may
// appear in the echoed text or anywhere in the SSE stream: not the solutions, not a later hint, not the
// wrong-answer variants the author marked for a later rung. The server's rung is checked after each turn.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LessonDef, StepDef } from "@oak/content-kit";
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
  course = await realCourse({ standInUnits: [] });
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
  port = probe.port as number;
  await probe.stop(true);
  dir = mkdtempSync(join(tmpdir(), "oak-hint-rungs-"));
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
async function turn(body: unknown): Promise<{ text: string; raw: string }> {
  const res = await fetch(`http://127.0.0.1:${port}/api/tutor/hint`, {
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

/** Graded code steps with an authored hint ladder, in U01 and U02. */
function hintedSteps(): { lesson: LessonDef; step: StepDef }[] {
  return course.lessons
    .filter((l) => /^U0[12]\.L/.test(l.id))
    .flatMap((lesson) => lesson.steps.map((step) => ({ lesson, step })))
    .filter(
      ({ step }) =>
        step.graded === true &&
        step.exercise !== undefined &&
        step.exercise.kind.startsWith("code-") &&
        step.exercise.kind !== "code-make" &&
        Array.isArray(step.exercise.hints),
    );
}

/** Passes every graded step of a lesson and completes it with a saved Make, as the player does. */
async function finish(lesson: LessonDef): Promise<void> {
  for (const step of lesson.steps) {
    const ex = step.exercise;
    if (ex === undefined) continue;
    await api("POST", `/api/lessons/${lesson.id}/steps/${step.id}/attempts`, {
      sessionId: null,
      exerciseId: ex.id,
      exerciseVersion: ex.version,
      seriesNo: 0,
      params: null,
      response: { code: "x" },
      result: gradeResult({ exerciseId: `${lesson.id}/${ex.id}`, score: 1 }),
      extraReplays: 0,
      activeMs: 1000,
      tutorAssisted: false,
    });
  }
  const sk = await api<{ sketch: { id: string } }>("POST", "/api/sketches", {
    title: `${lesson.id} Make`,
    originKind: "lesson-make",
    originId: lesson.id,
    sessionId: null,
    code: 's("bd sd")',
    bpm: 96,
    meter: "4/4",
    key: null,
    analysis: null,
    note: null,
    tutorAssisted: false,
    band: null,
    flags: { lockedTools: [], previewTools: [] },
    ranOk: true,
  });
  await api("POST", `/api/lessons/${lesson.id}/complete`, {
    sessionId: null,
    sketchId: sk.sketch.id,
    lessonVersion: lesson.version,
    contentHash: "h",
    splitPart: null,
  });
}

async function passCheckpoint(cpId: string): Promise<void> {
  const route = cpId.replace(/\.CP$/, "");
  const start = await api<{ attemptNo: number; items: { idx: number }[] }>(
    "POST",
    `/api/checkpoints/${route}/start`,
  );
  await api("POST", `/api/checkpoints/${route}/attempts`, {
    sessionId: null,
    attemptNo: start.attemptNo,
    items: start.items.map((i) => ({
      idx: i.idx,
      score: 1,
      skipped: false,
      response: { code: "" },
      result: null,
    })),
    makeSketchId: null,
    acceptSoftPass: false,
  });
}

describe("tutor hints are redacted at each rung, on every hinted code step of U01–U02", () => {
  test("rungs 1, 2 and 3: nothing above the rung reaches the echo or the stream", async () => {
    await api("POST", "/api/dev/seed", { point: "after U00.L02" });
    const order = course.lessons
      .filter((l) => /^U0[12]\.L/.test(l.id))
      .sort((a, b) => a.id.localeCompare(b.id));
    const steps = hintedSteps();
    expect(steps.length).toBeGreaterThanOrEqual(8);
    const leaks: string[] = [];
    let probed = 0;
    for (const lesson of order) {
      if (lesson.id === "U02.L03") await passCheckpoint("U01.CP");
      for (const { step } of steps.filter((s) => s.lesson.id === lesson.id)) {
        probed += 1;
        const source = stepSource(lesson.id, step);
        const markers = leakMarkers(source);
        const shown = normalizeWs(`${source.starterCode ?? ""} ${source.prompt}`);
        for (const rung of [1, 2, 3] as const) {
          const r = await turn({
            thread: { subjectKind: "lesson", subjectId: lesson.id },
            kind: "hint",
            userText: "#echo stuck",
            lessonId: lesson.id,
            stepId: step.id,
            learnerCode: source.starterCode ?? "",
          });
          const state = await api<{ rung: number }>("GET", `/api/lessons/${lesson.id}/steps/${step.id}`);
          expect({ step: `${lesson.id}/${step.id}`, rung: state.rung }).toEqual({
            step: `${lesson.id}/${step.id}`,
            rung,
          });
          const said = normalizeWs(decodeNested(r.text));
          const raw = normalizeWs(decodeNested(r.raw));
          expect(said).toContain(`hint_rung: ${rung} of 4`);
          // The author's own hints up to this rung are the learner's to see (U01.L03's third hint names
          // the kick line, a literal piece of the solution).
          const allowed = `${shown} ${normalizeWs((source.hints ?? []).slice(0, rung).join(" "))}`;
          for (const m of markers) {
            if (m.minLevel <= rung || allowed.includes(m.text)) continue;
            if (said.includes(m.text) || raw.includes(m.text))
              leaks.push(`${lesson.id}/${step.id} rung ${rung}: ${m.label} "${m.text.slice(0, 40)}"`);
          }
        }
      }
      await finish(lesson);
    }
    expect(probed).toBe(steps.length);
    expect(leaks).toEqual([]);
  }, 300_000);
});
