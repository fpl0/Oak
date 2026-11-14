// Answers withheld on the Wave 6 step kinds (wave6.md §11; contracts §10.4, §10.5): on a seventh-quality, applied or
// borrowed numeral, mode, chromatic-degree, key-plan, pivot or push step, below hint 4 nothing a hint or chat reply
// carries may name the expected quality, numeral, mode, degree, key or shift, in any spelling ("five of five" and
// D7 for V7/V, "flat 7" and te for Mixolydian, "up a whole step" for a lift to D). Three layers are proven per kind
// and per rung:
//  1. what the model is given (context, tool results, transcript) holds none of it;
//  2. what a model that ignores the persona writes back is withheld before the learner reads it (text and cards);
//  3. what is stored holds none of it.
// Part A replays scripted turns through the executors; part B replays API cassettes through the whole composed
// server over HTTP; part C shows a transcription subject (CF-T, ladder L8) never carries the hidden source below
// the reveal. Positive controls show the scans can fail.
import { afterEach, describe, expect, test } from "bun:test";
import { answerForms, answerLeaks, WITHHELD } from "./answer-guard.ts";
import type { CassetteResponse } from "./backends/api/cassettes/builders.ts";
import { chunkJson, response, textBlock, toolUseBlock } from "./backends/api/cassettes/builders.ts";
import { cassette } from "./backends/api/cassettes/scenarios.ts";
import type { Rung, StepSource } from "./domain.ts";
import { encodeSse, type TutorEvent } from "./events.ts";
import { prepareTurn } from "./prepare.ts";
import { findLeaks, leakMarkers } from "./redaction.ts";
import { stageFacts } from "./review-facts.ts";
import { runTurn } from "./run.ts";
import { CASSETTE_KEY, type Composed, startComposed } from "./testing/composed.ts";
import { type FakePorts, makePorts } from "./testing/fakes.ts";
import { ScriptedBackend, type ScriptStep } from "./testing/scripted-backend.ts";
import {
  APPLIED_STEP,
  BORROWED_STEP,
  CFT_CHECKS,
  CFT_CODE,
  CFT_FACTS,
  CFT_HIDDEN_SOURCE,
  CFT_REVIEW,
  CFT_SECRETS,
  CFT_SOURCE,
  CHROMATIC_STEP,
  w6GradeFor as gradeFor,
  KEY_PLAN_STEP,
  L8_CHECKS,
  L8_REVIEW,
  W6_LEAKY_CARD as LEAKY_CARD,
  W6_LEAKY_TEXT as LEAKY_TEXT,
  W6_LEARNER as LEARNER,
  MODE_SCALE_STEP,
  MODE_STEP,
  PIVOT_STEP,
  PUSH_STEP,
  SEVENTH_STEP,
  W6_LESSON,
} from "./testing/wave6-fixtures.ts";
import type { ThreadKind, TurnRequest } from "./types.ts";

const never = new AbortController().signal;

const KINDS: [string, StepSource][] = [
  ["seventh qualities", SEVENTH_STEP],
  ["an applied numeral", APPLIED_STEP],
  ["a borrowed numeral", BORROWED_STEP],
  ["a mode by ear", MODE_STEP],
  ["a mode built from its parent", MODE_SCALE_STEP],
  ["a chromatic degree", CHROMATIC_STEP],
  ["a key plan", KEY_PLAN_STEP],
  ["a pivot chord in two keys", PIVOT_STEP],
  ["a push", PUSH_STEP],
];

function portsFor(step: StepSource, rung: Rung, ports: FakePorts = makePorts()): FakePorts {
  ports.lessons.lessons.set(step.lessonId, { ...W6_LESSON, id: step.lessonId });
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
      cassette: cassette("w6-leak", ...leakyCassette(step, "w")),
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

// --- C. a transcription subject: the hidden source never travels below the reveal -------------------------

describe("C. CF-T and ladder L8: the recording's own notes and chords stay hidden until a pass or a reveal", () => {
  const userTurns = (comp: Composed) =>
    JSON.stringify(
      comp.wire.map((w) => (w.body.messages as { role: string }[]).filter((m) => m.role === "user")),
    );
  const noSecret = (text: string) => {
    for (const secret of [...CFT_SECRETS, CFT_HIDDEN_SOURCE.slice(0, 40)]) expect(text).not.toContain(secret);
  };
  test("CF-T's review below the pass: every stage's score and mark, the form map included; no reference, no source", async () => {
    const ports = makePorts();
    ports.lessons.reviews.set("capstone:CF-T", CFT_SOURCE);
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette(
        "cft",
        response(
          "msg_cft1",
          [toolUseBlock(0, "toolu_cft1", "submit_capstone_review", chunkJson(CFT_REVIEW, 40))],
          "tool_use",
        ),
        response("msg_cft2", [textBlock(0, ["Done."])], "end_turn"),
      ),
    });
    const res = await c.sse("/api/tutor/reviews/capstone", {
      thread: { subjectKind: "capstone", subjectId: "CF-T" },
    });
    expect(res.events.at(-1)).toBe("done");
    const sent = userTurns(c);
    for (const line of [
      "check form: form · the whole tune · best 100% · mark 100% · passed",
      "check bass-3: bass · phrase 3 · best 91% · mark 90% · passed",
      "check changes-3: chords · phrase 3 · best 75% · mark 85% · open",
      "check changes-4: chords · phrase 4 · not checked yet · mark 85% · open",
      "check melody-1: melody · phrase 1 · not checked yet · mark 90% · locked until the checks before it pass",
    ])
      expect(sent).toContain(line);
    expect(sent).not.toContain("reference:");
    noSecret(sent);
    noSecret(res.raw);
    // The review itself says where to listen, never what the chord is.
    expect(JSON.stringify(CFT_REVIEW.revisions)).not.toContain("A7");
  });

  test.each([0, 1, 2, 3] as const)(
    "a chat on CF-T with a failed check at rung %i: where it is wrong, never what the recording plays",
    async () => {
      const ports = makePorts();
      c = startComposed({
        apiKey: CASSETTE_KEY,
        ports,
        cassette: cassette(
          "cft-chat",
          response(
            "msg_k1",
            [textBlock(0, ["Loop bars 19 and 20 at half speed and sing the bass note under each chord."])],
            "end_turn",
          ),
        ),
      });
      const res = await c.sse("/api/tutor/chat", {
        thread: { subjectKind: "capstone", subjectId: "CF-T" },
        userText: "What are the chords of the bridge?",
        learnerCode: CFT_CODE,
        graderResult: {
          status: "fail",
          score: 0.75,
          dims: { harmony: 0.75 },
          counts: { missing: 0, extra: 0, wrong: 2 },
          issues: [
            {
              where: { track: "chords", bar: 20, beat: 1, code: null },
              severity: "error",
              feedback: "harmony.wrong-chord",
              direction: null,
              concept: "the chord of the bar",
              what: "Bar 20 is not the chord the recording plays.",
              fix: "Use A7 in bar 20: E7 E7 A7 A7 D7 D7 G7 G7.",
              expected: "E7 E7 A7 A7 D7 D7 G7 G7",
              got: "D7",
            },
          ],
          warnings: [],
        },
      });
      expect(res.events.at(-1)).toBe("done");
      const sent = userTurns(c);
      expect(sent).toContain("checker: fail · score 0.75");
      expect(sent).toContain("issue 1: chords bar 20 beat 1");
      noSecret(sent);
      expect(sent).not.toContain("Use A7");
      noSecret(res.raw);
    },
  );

  const ladder = {
    tutorOpen: true,
    closedReason: null,
    title: "Ain't She Sweet (L8)",
    released: null,
    transcriptionSource: "ladder" as const,
  };
  const l8 = { ...CFT_SOURCE, revisions: 1 as const, facts: { ...CFT_FACTS, stages: stageFacts(L8_CHECKS) } };
  const oneRevision = { ...L8_REVIEW, revisions: L8_REVIEW.revisions.slice(0, 1) };

  test("a ladder L8 review below the pass: form, bass, changes, melody as stages; one revision; no source", async () => {
    const ports = makePorts();
    ports.lessons.reviews.set("transcription:tr-l8", l8);
    ports.lessons.facts.set("transcription:tr-l8", ladder);
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette(
        "l8-review",
        response(
          "msg_m1",
          [toolUseBlock(0, "toolu_m1", "submit_transcription_review", chunkJson(oneRevision, 40))],
          "tool_use",
        ),
        response("msg_m2", [textBlock(0, ["Done."])], "end_turn"),
      ),
    });
    const res = await c.sse("/api/tutor/reviews/transcription", {
      thread: { subjectKind: "transcription", subjectId: "tr-l8" },
      transcriptionVersion: 3,
    });
    expect(res.frames.find((f) => f.event === "review")?.data).toEqual({
      reviewKind: "transcription",
      review: oneRevision,
    });
    const sent = userTurns(c);
    for (const line of [
      "revisions_wanted: 1",
      "check form: form stage form · the whole tune · best 100% · mark 100% · passed",
      "check bass: bass stage bass · phrases 1-4 · best 78% · mark 90% · open",
      "check changes: chords stage changes · phrases 1-4 · not checked yet · mark 85% · locked until the checks before it pass",
    ])
      expect(sent).toContain(line);
    expect(sent).not.toContain("reference:");
    noSecret(sent);
    noSecret(res.raw);
  });

  test("positive control: once the piece has passed, the reference is in the review", async () => {
    const ports = makePorts();
    ports.lessons.reviews.set("transcription:tr-l8", { ...l8, reference: CFT_HIDDEN_SOURCE });
    ports.lessons.facts.set("transcription:tr-l8", ladder);
    c = startComposed({
      apiKey: CASSETTE_KEY,
      ports,
      cassette: cassette(
        "l8-passed",
        response(
          "msg_n1",
          [toolUseBlock(0, "toolu_n1", "submit_transcription_review", chunkJson(oneRevision, 40))],
          "tool_use",
        ),
        response("msg_n2", [textBlock(0, ["Done."])], "end_turn"),
      ),
    });
    await c.sse("/api/tutor/reviews/transcription", {
      thread: { subjectKind: "transcription", subjectId: "tr-l8" },
    });
    expect(userTurns(c)).toContain("E7 E7 A7 A7 D7 D7 G7 G7");
    expect(CFT_CHECKS.some((k) => k.layer === "form")).toBe(true);
  });
});
