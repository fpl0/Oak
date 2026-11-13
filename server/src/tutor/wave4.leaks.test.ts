// Answers withheld on the Wave 4 step kinds (wave4.md §5.6; contracts §10.4, §10.5): on a numeral, chord,
// voice-leading or dictation step, below hint 4 nothing a hint or chat reply carries may name the expected
// chord, numeral or notes. Three layers are proven per kind and per rung:
//  1. what the model is given (context, tool results, transcript) holds none of it;
//  2. what a model that ignores the persona writes back is withheld before the learner reads it (text and cards);
//  3. what is stored holds none of it.
// Part A replays scripted turns through the executors; part B replays API cassettes through the whole composed
// server over HTTP. Positive controls show the scans can fail.
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
  CHORD_STEP,
  DICTATION_STEP,
  gradeFor,
  LEAKY_CARD,
  LEAKY_TEXT,
  RN_STEP,
  VOICING_STEP,
  W4_LESSON,
} from "./testing/wave4-fixtures.ts";
import type { ThreadKind, TurnRequest } from "./types.ts";

const never = new AbortController().signal;

/** What the learner has typed on each step: a wrong answer, so there is something to hint about. */
const LEARNER: Record<string, string> = {
  [RN_STEP.id]: "I V VI IV",
  [CHORD_STEP.id]: "G E C D",
  [VOICING_STEP.id]: 'chords: note("<[c4,e4,g4] [g4,b4,d5] [c4,e4,g4]>").s("piano")',
  [DICTATION_STEP.id]: 'bass: n("<0 4 4 3>").scale("C2:major").s("bass")',
};

const KINDS: [string, StepSource][] = [
  ["numerals (rn-palette)", RN_STEP],
  ["chord symbols", CHORD_STEP],
  ["voice leading", VOICING_STEP],
  ["dictation (bass by ear)", DICTATION_STEP],
];

function portsFor(step: StepSource, rung: Rung, ports: FakePorts = makePorts()): FakePorts {
  ports.lessons.lessons.set(step.lessonId, { ...W4_LESSON, id: step.lessonId });
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
  test.each([1, 3] as const)("chat at rung %i", async (rung) => {
    const ports = portsFor(step, rung);
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette("w4-leak", ...leakyCassette(step, "w")),
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
