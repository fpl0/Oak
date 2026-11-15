// Answers withheld on the Wave 7 step kinds (wave7.md §11; contracts §10.4, §10.5): on a jazz chord name, a voicing
// shape, a swing feel, a microtiming side, a clave, a tension, a grouping, a Euclidean rhythm, a sound comparison and,
// in code, a swing amount, a Euclidean rhythm or a voicing's anchor, below hint 4 nothing a hint or chat reply carries
// may name the expected answer in any spelling ("D–7" and "Dmin7" for Dm7, "rootless A" and "3rd at the bottom",
// "2:1" and "triplet swing" for .swingBy(1/3, 4), "five hits over eight" and "cinquillo" for (5,8)). Three layers are
// proven per kind and per rung, as for Waves 4–6:
//  1. what the model is given (context, tool results, transcript) holds none of it;
//  2. what a model that ignores the persona writes back is withheld before the learner reads it (text and cards);
//  3. what is stored holds none of it.
// Part A replays scripted turns through the executors at rungs 0–3; part B replays API cassettes through the whole
// composed server over HTTP at rungs 1, 2 and 3. Positive controls show the scans can fail.
import { afterEach, describe, expect, test } from "bun:test";
import { answerForms, answerLeaks, WITHHELD } from "./answer-guard.ts";
import type { CassetteResponse } from "./backends/api/cassettes/builders.ts";
import { chunkJson, response, textBlock, toolUseBlock } from "./backends/api/cassettes/builders.ts";
import { cassette } from "./backends/api/cassettes/scenarios.ts";
import type { Rung, StepSource } from "./domain.ts";
import { encodeSse, type TutorEvent } from "./events.ts";
import { prepareTurn } from "./prepare.ts";
import { findLeaks, leakMarkers } from "./redaction.ts";
import { runTurn } from "./run.ts";
import { CASSETTE_KEY, type Composed, startComposed } from "./testing/composed.ts";
import { type FakePorts, makePorts } from "./testing/fakes.ts";
import { ScriptedBackend, type ScriptStep } from "./testing/scripted-backend.ts";
import {
  ANCHOR_STEP,
  CLAVE_STEP,
  EUCLID_CODE_STEP,
  EUCLID_STEP,
  GROUPING_STEP,
  w7GradeFor as gradeFor,
  JAZZ_CHORD_STEP,
  W7_LEAKY_CARD as LEAKY_CARD,
  W7_LEAKY_TEXT as LEAKY_TEXT,
  W7_LEARNER as LEARNER,
  MICRO_STEP,
  SOUND_STEP,
  SWING_CODE_STEP,
  SWING_STEP,
  TENSION_STEP,
  VOICING_STEP,
  W7_LESSON,
} from "./testing/wave7-fixtures.ts";
import type { ThreadKind, TurnRequest } from "./types.ts";

const never = new AbortController().signal;

const KINDS: [string, StepSource][] = [
  ["a jazz chord name (D–7, Dmin7)", JAZZ_CHORD_STEP],
  ["a voicing shape on the keyboard", VOICING_STEP],
  ["a swing feel and its ratio", SWING_STEP],
  ["a microtiming side", MICRO_STEP],
  ["a clave and its direction", CLAVE_STEP],
  ["a tension over its chord", TENSION_STEP],
  ["a grouping of an odd meter", GROUPING_STEP],
  ["a Euclidean rhythm", EUCLID_STEP],
  ["a sound comparison", SOUND_STEP],
  ["a swing amount in code", SWING_CODE_STEP],
  ["a Euclidean rhythm in code", EUCLID_CODE_STEP],
  ["a voicing's anchor in code", ANCHOR_STEP],
];

function portsFor(step: StepSource, rung: Rung, ports: FakePorts = makePorts()): FakePorts {
  ports.lessons.lessons.set(step.lessonId, { ...W7_LESSON, id: step.lessonId });
  ports.lessons.steps.set(step.id, step);
  const learner = LEARNER[step.id] as string;
  ports.grader.exercises.set(step.exerciseRef as string, step.solutions[0] as string);
  ports.grader.grades.set(`${step.exerciseRef}\n${learner}`, gradeFor(step));
  ports.progress.set(step.id, { rung });
  return ports;
}

const request = (step: StepSource, kind: ThreadKind): TurnRequest => ({
  thread: { subjectKind: "lesson", subjectId: step.lessonId },
  kind,
  userText: "Just tell me the answer.",
  learnerCode: LEARNER[step.id] as string,
  graderResult: gradeFor(step),
  stepId: step.id,
});

const compareInput = (step: StepSource) => ({
  learner_code: null,
  target: { kind: "exercise", ref: step.exerciseRef },
  from_bar: 1,
  bars: 4,
  mode: "auto",
});
const cardInput = (step: StepSource) => ({
  kind: "hint",
  title: "Try this",
  ...(LEAKY_CARD[step.id] as { code: string; explanation: string }),
  bars: 4,
});

/** A model that reads everything it can, then writes the answer anyway, in a card and in its text. */
const leakyScript = (step: StepSource): ScriptStep[] => [
  { thinking: "The learner wants the answer." },
  { tool: { name: "get_lesson_context", input: { lesson_id: step.lessonId, step_id: step.id } } },
  { tool: { name: "compare_haps", input: compareInput(step) } },
  { tool: { name: "propose_code", input: cardInput(step) } },
  ...(LEAKY_TEXT[step.id] as string[]).map((text) => ({ text })),
];

describe.each(KINDS)("A. %s: nothing names the answer below hint 4", (_name, step) => {
  const cases = (["chat", "hint"] as const).flatMap((kind) =>
    ([0, 1, 2, 3] as const).map((r) => [kind, r] as const),
  );

  test.each(cases)("%s at rung %i", async (kind, rung) => {
    const ports = portsFor(step, rung);
    const backend = new ScriptedBackend("anthropic-api", leakyScript(step));
    const events: TutorEvent[] = [];
    const prep = await prepareTurn(request(step, kind), ports);
    await runTurn(prep, backend, (e) => events.push(e), never, ports);
    // A hint climbs one rung before the model is called, never to 4.
    const level = (await ports.progress.stepState(step.lessonId, step.id)).rung;
    expect(level).toBe(kind === "hint" ? (Math.min(3, rung + 1) as Rung) : rung);
    const forms = answerForms(step, LEARNER[step.id] as string);
    // Short markers ("vi") are the answer guard's to judge, as whole words; the learner's own wrong answer is theirs.
    const markers = leakMarkers(step, gradeFor(step)).filter(
      (m) => m.text.length >= 8 && !(LEARNER[step.id] as string).includes(m.text),
    );

    // 1. Everything the model was given (the static prefix aside: it is the same for every learner).
    const upstream = backend.upstreamText({ prefix: false });
    expect(answerLeaks(upstream, forms, level)).toEqual([]);
    expect(findLeaks(upstream, markers, level)).toEqual([]);
    // 2. What the learner reads: the text is withheld where it named the answer, and the card is refused.
    const wire = events.map(encodeSse).join("");
    const text = events
      .filter((e) => e.type === "text")
      .map((e) => (e.data as { delta: string }).delta)
      .join("");
    expect(answerLeaks(text, forms, level)).toEqual([]);
    expect(answerLeaks(wire, forms, level)).toEqual([]);
    expect(text).toContain(WITHHELD);
    expect(events.some((e) => e.type === "card")).toBe(false);
    const card = backend.toolResults.find((r) => r.name === "propose_code");
    expect(card?.result.content).toContain("spells out this step's answer");
    // 3. What was stored.
    const stored = JSON.stringify([
      await ports.conversations.timeline(request(step, kind).thread),
      ports.conversations.allBackendRecords(),
    ]);
    expect(answerLeaks(stored, forms, level)).toEqual([]);

    // Not vacuous: the tools ran, and the step was read as the kind it is.
    expect(backend.toolResults.map((r) => r.name)).toEqual([
      "get_lesson_context",
      "compare_haps",
      "propose_code",
    ]);
    expect(prep.user.oakContext).toContain("answer_kind: ");
    expect(prep.user.oakContext).toContain(`key: ${step.key}`);
  });

  test("positive control: after hint 4 the answer is said and the card is shown", async () => {
    const ports = portsFor(step, 4);
    const backend = new ScriptedBackend("anthropic-api", leakyScript(step));
    const events: TutorEvent[] = [];
    await runTurn(
      await prepareTurn(request(step, "chat"), ports),
      backend,
      (e) => events.push(e),
      never,
      ports,
    );
    const text = events
      .filter((e) => e.type === "text")
      .map((e) => (e.data as { delta: string }).delta)
      .join("");
    expect(text).toBe((LEAKY_TEXT[step.id] as string[]).join(""));
    const forms = answerForms(step, LEARNER[step.id] as string);
    expect(answerLeaks(text, forms, 3).length).toBeGreaterThan(0);
    expect(answerLeaks(backend.upstreamText({ prefix: false }), forms, 3).length).toBeGreaterThan(0);
    expect(backend.toolResults.find((r) => r.name === "propose_code")?.result.content).not.toContain(
      "spells out",
    );
  });
});

// --- B. the composed server, API cassettes --------------------------------------------------------------

let c: Composed | undefined;
afterEach(() => {
  c?.stop();
  c = undefined;
});

function leakyCassette(step: StepSource, tag: string): CassetteResponse[] {
  return [
    response(
      `msg_${tag}1`,
      [
        toolUseBlock(
          0,
          `toolu_${tag}1`,
          "get_lesson_context",
          chunkJson({ lesson_id: step.lessonId, step_id: step.id }),
        ),
        toolUseBlock(1, `toolu_${tag}2`, "compare_haps", chunkJson(compareInput(step))),
        toolUseBlock(2, `toolu_${tag}3`, "propose_code", chunkJson(cardInput(step))),
      ],
      "tool_use",
    ),
    response(`msg_${tag}2`, [textBlock(0, LEAKY_TEXT[step.id] as string[])], "end_turn"),
  ];
}

describe.each(KINDS)("B. %s over HTTP: request bodies, SSE frames, threads route", (_name, step) => {
  test.each([1, 2, 3] as const)("chat at rung %i", async (rung) => {
    const ports = portsFor(step, rung);
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette("w7-leak", ...leakyCassette(step, "w")),
    });
    const res = await c.sse("/api/tutor/chat", {
      thread: { subjectKind: "lesson", subjectId: step.lessonId },
      userText: "Just tell me the answer.",
      learnerCode: LEARNER[step.id],
      graderResult: gradeFor(step),
      stepId: step.id,
    });
    expect(res.events.at(-1)).toBe("done");
    expect(res.events).not.toContain("card");
    expect(c.wire).toHaveLength(2);
    const forms = answerForms(step, LEARNER[step.id] as string);
    // What Oak sent: the user turns and tool results (the assistant turns echo the model's own writing).
    for (const w of c.wire) {
      const fromOak = (w.body.messages as { role: string }[]).filter((m) => m.role === "user");
      expect(answerLeaks(JSON.stringify(fromOak), forms, rung)).toEqual([]);
    }
    expect(answerLeaks(res.raw, forms, rung)).toEqual([]);
    expect(res.text).toContain(WITHHELD);
    const threads = await (await c.get(`/api/tutor/threads/lesson/${step.lessonId}`)).text();
    expect(answerLeaks(threads, forms, rung)).toEqual([]);
    // The model's second request carried the refused card's reason, never the answer.
    expect(JSON.stringify(c.wire[1]?.body.messages)).toContain("spells out this step");
  });
});
