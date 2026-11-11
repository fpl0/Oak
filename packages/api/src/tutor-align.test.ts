// Proves that @oak/api's re-declared tutor protocol matches what the tutor service really emits.
// It imports server/src/tutor (owned by another session, read-only) at run time; that folder imports
// no package, so the dependency points one way only. Excluded from this package's tsconfig.
import { expect, test } from "bun:test";
import { SUBJECT_KINDS as KIT_SUBJECT_KINDS, TUTOR_THREAD_KINDS } from "@oak/content-kit";
import { ERROR_COPY, TUTOR_ERROR_KINDS as SERVER_ERROR_KINDS } from "../../../server/src/tutor/errors.ts";
import {
  encodeSse,
  TUTOR_EVENT_TYPES as SERVER_EVENT_TYPES,
  SSE_PING_INTERVAL_MS as SERVER_PING_MS,
  type TutorEvent as ServerEvent,
  SseParser as ServerSseParser,
  SSE_PING,
} from "../../../server/src/tutor/events.ts";
import {
  REVIEW_LIMITS as SERVER_LIMITS,
  CapstoneReviewSchema as ServerCapstoneReview,
  TranscriptionReviewSchema as ServerTranscriptionReview,
} from "../../../server/src/tutor/reviews.ts";
import { conversationId, parseConversationId } from "../../../server/src/tutor/threads.ts";
import {
  effortFor,
  laneFor,
  MODEL,
  BACKEND_IDS as SERVER_BACKENDS,
  LANES as SERVER_LANES,
  SUBJECT_KINDS as SERVER_SUBJECT_KINDS,
  THREAD_KINDS as SERVER_THREAD_KINDS,
} from "../../../server/src/tutor/types.ts";
import { formatTutorThreadId, parseTutorThreadId } from "./index.ts";
import * as api from "./tutor.ts";

test("constants are identical on both sides", () => {
  expect([...api.TUTOR_EVENT_TYPES]).toEqual([...SERVER_EVENT_TYPES]);
  expect([...api.TUTOR_ERROR_KINDS]).toEqual([...SERVER_ERROR_KINDS]);
  expect(api.TUTOR_ERROR_COPY).toEqual(ERROR_COPY);
  expect([...api.THREAD_KINDS]).toEqual([...SERVER_THREAD_KINDS]);
  expect([...api.LANES]).toEqual([...SERVER_LANES]);
  expect([...TUTOR_THREAD_KINDS]).toEqual([...SERVER_LANES]);
  expect([...KIT_SUBJECT_KINDS]).toEqual([...SERVER_SUBJECT_KINDS]);
  expect([...api.BACKEND_IDS]).toEqual([...SERVER_BACKENDS]);
  expect(api.TUTOR_MODEL).toBe(MODEL);
  expect(api.SSE_PING_INTERVAL_MS).toBe(SERVER_PING_MS);
  expect(api.REVIEW_LIMITS).toEqual(SERVER_LIMITS);
  for (const kind of SERVER_THREAD_KINDS) {
    expect(api.LANE_OF[kind]).toBe(laneFor(kind));
    expect(api.EFFORT_OF[api.LANE_OF[kind]]).toBe(effortFor(kind));
  }
});

const usage = {
  backend: "anthropic-api",
  requests: 2,
  inputTokens: 1200,
  outputTokens: 80,
  cacheReadInputTokens: 900,
  cacheCreationInputTokens: 0,
  cacheCreation1hInputTokens: 0,
  cacheCreation5mInputTokens: 0,
  costUsd: 0.0123,
  includedInPlan: false,
  servedBy: ["claude-opus-5-5"],
} as const;
const review = {
  strengths: [{ text: "The fill in bar 4 sets up the repeat.", bars: [4, 4] as [number, number] }],
  revisions: [],
  listeningQuestion: "Where does the groove breathe?",
  linerNote: "A four-bar intro.",
};

// One event of every type, exactly as the service builds them.
const SAMPLES: ServerEvent[] = [
  {
    type: "meta",
    data: {
      conversationId: "lesson:U03.L02:2026-11-11:hint",
      kind: "explain",
      lane: "hint",
      backend: "anthropic-api",
      model: MODEL,
      rung: 2,
      revealAllowed: true,
    },
  },
  {
    type: "meta",
    data: {
      conversationId: "general:general:2026-11-11:chat",
      kind: "chat",
      lane: "chat",
      backend: "claude-cli",
      model: MODEL,
      rung: null,
      revealAllowed: false,
    },
  },
  { type: "status", data: { phase: "tool", label: "Checking your code" } },
  { type: "text", data: { delta: "Hear how [[deg:7]] leans up." } },
  { type: "thinking", data: { delta: "The learner…" } },
  { type: "tool_start", data: { toolUseId: "tu_1", name: "evaluate_strudel" } },
  { type: "tool_input", data: { toolUseId: "tu_2", partialJson: '{"kind":"hint","ti' } },
  {
    type: "tool_result",
    data: { toolUseId: "tu_1", name: "evaluate_strudel", ok: true, summary: "2 tracks, 16 events" },
  },
  {
    type: "card",
    data: {
      cardId: "c1",
      toolUseId: "tu_2",
      kind: "next_step",
      title: "Try a rest",
      code: 'drums: s("bd ~ sd ~")',
      explanation: "Leave beat 2 empty.",
      bars: 1,
      apply: "preview_only",
      applyAllowed: false,
      lockedTools: [],
    },
  },
  { type: "review", data: { reviewKind: "capstone", review } },
  { type: "usage", data: { ...usage, servedBy: [...usage.servedBy] } },
  {
    type: "done",
    data: {
      stopReason: "end_turn",
      backend: "anthropic-api",
      iterations: 2,
      usage: { ...usage, servedBy: [...usage.servedBy] },
    },
  },
  { type: "error", data: { kind: "rate_limit", message: ERROR_COPY.rate_limit, retryAfterSec: 12 } },
  {
    type: "error",
    data: {
      kind: "max_tokens",
      message: ERROR_COPY.max_tokens,
      usage: { ...usage, servedBy: [...usage.servedBy] },
    },
  },
];

test("every event the service encodes parses with @oak/api, through @oak/api's own SSE parser", () => {
  expect(new Set(SAMPLES.map((s) => s.type))).toEqual(new Set(SERVER_EVENT_TYPES));
  const wire = SAMPLES.map((ev) => encodeSse(ev)).join(SSE_PING);
  const parser = new api.SseParser();
  const frames = [...wire].flatMap((ch) => parser.push(ch));
  expect(frames).toEqual(new ServerSseParser().push(wire));
  expect(frames.map(api.asTutorEvent)).toEqual(SAMPLES as unknown as api.TutorEvent[]);
  expect(parser.comments).toHaveLength(SAMPLES.length - 1);
  expect(parser.pending).toBe("");
});

test("review schemas accept and reject the same objects", () => {
  const transcription = {
    strengths: [{ text: "x", bars: [1, 2], layer: "bass" }],
    revisions: [{ title: "t", bars: [3, 4], layer: "form", why: "w", listenFor: "l" }],
    plausibilityFlags: [],
    listeningQuestion: "q",
    linerNote: "n",
  };
  const cases: unknown[] = [
    review,
    { ...review, revisions: [{ title: "t", bars: [1, 2], why: "w", tryCode: 'n("0")', skills: ["R04"] }] },
    { ...review, extra: 1 },
    { ...review, strengths: [{ text: "x", bars: [1] }] },
    transcription,
    { ...transcription, strengths: [{ text: "x", bars: [1, 2], layer: "vocals" }] },
    {},
  ];
  for (const c of cases) {
    expect(api.CapstoneReviewSchema.safeParse(c).success).toBe(ServerCapstoneReview.safeParse(c).success);
    expect(api.TranscriptionReviewSchema.safeParse(c).success).toBe(
      ServerTranscriptionReview.safeParse(c).success,
    );
  }
});

test("tutor thread IDs (contracts §1.2) are the service's conversation IDs", () => {
  const key = { subjectKind: "sketch", subjectId: "sk:1", day: "2026-12-02", lane: "review" } as const;
  const id = conversationId(key);
  expect(
    formatTutorThreadId({
      subjectKind: key.subjectKind,
      subjectId: key.subjectId,
      day: key.day,
      threadKind: key.lane,
    }),
  ).toBe(id);
  expect(parseTutorThreadId(id)).toEqual({
    subjectKind: "sketch",
    subjectId: "sk:1",
    day: "2026-12-02",
    threadKind: "review",
  });
  expect(parseConversationId(id)).toEqual(key);
});
