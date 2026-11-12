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
import { answerPolicy, disclosureLevel, lessonContextView } from "../tutor/redaction.ts";
import { responseText, stepSource } from "./lessons.ts";

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

describe("Wave 3 step kinds: the answer is known to the tutor and withheld below the reveal", () => {
  const ui = { panels: { roll: false, staff: true, keyboard: false } } as const;
  const lesson = { id: "U03.L99", title: "Fixture", objective: "", key: "G major", meter: "4/4", bpm: 90 };
  const staffStep = (expect: unknown, tests: unknown[] = []) =>
    ({
      id: "S4",
      kind: "notate",
      title: "Write it",
      minutes: 1,
      graded: true,
      ui,
      exercise: {
        kind: "staff-write",
        id: "write-it",
        version: 1,
        role: "check",
        prompt: "Write what you hear on the staff.",
        skills: [{ skill: "N03", w: 1 }],
        hints: [
          { text: "Start on the line." },
          { text: "Count the steps." },
          { text: "Two sharps." },
          "auto",
        ],
        tests,
        answer: {
          ui: "staff-input",
          clef: "treble",
          bars: 1,
          palette: { durations: ["4"], accidentals: true, ties: false, rests: true },
          key: { tonic: "D", mode: "major" },
        },
        expect,
      },
    }) as unknown as Parameters<typeof stepSource>[1];

  /** The `get_lesson_context` view at `rung` holds no marker that needs a higher rung. */
  function leaksAt(source: ReturnType<typeof stepSource>, rung: 1 | 2 | 3): string[] {
    const state = { rung, passed: false, attempts: 2, rubricMet: null, matchedMistakes: [] };
    const view = normalizeWs(
      JSON.stringify(lessonContextView(lesson, source, state, disclosureLevel(state))),
    );
    return leakMarkers(source)
      .filter((m) => m.minLevel > rung && m.text.length >= 2 && view.includes(m.text))
      .map((m) => `${m.label}: ${m.text}`);
  }

  test("staff writing: the notes to write and a known wrong note list", () => {
    const src = stepSource(
      "U03.L99",
      staffStep({ e: "pitches", spelled: ["F#4", "A4", "D5"], order: "sequence", withOctave: true }, [
        {
          name: "F natural",
          response: { staff: "F4:4 A4:4 D5:4 r:4" },
          expect: "fail",
          feedback: ["spell.wrong"],
        },
      ]),
    );
    expect(src.solutions).toEqual(["F#4 A4 D5"]);
    expect(src.knownMistakes[0]?.variantCode).toBe("F4:4 A4:4 D5:4 r:4");
    expect(answerPolicy(src, 1)).toBe("socratic");
    for (const rung of [1, 2, 3] as const) expect(leaksAt(src, rung)).toEqual([]);
    const state = { rung: 4 as const, passed: false, attempts: 2, rubricMet: null, matchedMistakes: [] };
    expect(lessonContextView(lesson, src, state, 4).step?.solution).toBe("F#4 A4 D5");
  });

  test("a key signature: the accidentals in written order", () => {
    const sharp = stepSource(
      "U03.L99",
      staffStep({ e: "key-signature", key: { tonic: "D", mode: "major" }, order: "sequence" }),
    );
    expect(sharp.solutions).toEqual(["F# C#"]);
    const flat = stepSource(
      "U03.L99",
      staffStep({ e: "key-signature", key: { tonic: "Eb", mode: "major" } }),
    );
    expect(flat.solutions).toEqual(["Bb Eb Ab"]);
    for (const rung of [1, 2, 3] as const) expect(leaksAt(sharp, rung)).toEqual([]);
  });

  test("by-ear transcription: the hidden source and the reference stay hidden until the reveal", () => {
    const hidden = 'setcpm(80/4)\n\nmel: n("<[0 0 4 4] [5 5 4 ~]>").scale("C4:major").s("piano")';
    const step = {
      id: "S6",
      kind: "dictation",
      title: "By ear",
      minutes: 3,
      graded: true,
      ui,
      exercise: {
        kind: "dictation",
        id: "by-ear",
        version: 1,
        role: "check",
        prompt: "Write the tune you hear in n() over C major.",
        skills: [{ skill: "E07", w: 1 }],
        hints: [
          { text: "Start on 1." },
          { text: "The second bar climbs." },
          { text: "It ends on 5." },
          "auto",
        ],
        tests: [],
        domain: "melody",
        stimulus: { src: "code", code: hidden, bars: 2, showCode: false },
        cue: { context: "none" },
        answer: { ui: "code", starter: 'mel: n("~").scale("C4:major").s("piano")' },
        reference: { solutions: [hidden] },
        matcher: { kind: "melody", pitch: "transposition-invariant" },
        byEar: { ab: true, rates: [1, 0.75], accepts: "any-key" },
      },
    } as unknown as Parameters<typeof stepSource>[1];
    const src = stepSource("U03.L99", step);
    expect(src.solutions).toEqual([hidden]);
    expect(answerPolicy(src, 1)).toBe("socratic");
    for (const rung of [1, 2, 3] as const) expect(leaksAt(src, rung)).toEqual([]);
    // The literal of the tune is a marker on its own: a model quoting only the mini-notation is caught too.
    expect(
      leakMarkers(src).some((m) => m.label === "solution-literal" && m.text === "<[0 0 4 4] [5 5 4 ~]>"),
    ).toBe(true);
  });

  test("a typed answer variant reads as the learner would have typed it", () => {
    expect(responseText({ answer: { text: ["F#", "C#"] } } as never)).toBe("F# C#");
    expect(responseText({ answer: { degrees: ["5", "4", "3"] } } as never)).toBe("5 4 3");
    expect(responseText({ order: ["b", "a"] } as never)).toBe("b a");
    expect(responseText({ taps: [0, 0.5] } as never)).toBeNull();
  });
});
