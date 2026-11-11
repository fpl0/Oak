// Test harness: a prepared turn run through the core turn runner on the real backend, with the
// cassette transport underneath. What a test sees is what production does, minus the network.
// Test code only.
import type { TutorEvent } from "../../../events.ts";
import { type PreparedTurn, prepareTurn } from "../../../prepare.ts";
import { type RunResult, runTurn } from "../../../run.ts";
import { runReview } from "../../../run-review.ts";
import { type FakePorts, makePorts, type Overrides, override } from "../../../testing/fakes.ts";
import { GRADE, LEARNER_CODE, LESSON_ID, REVIEW_SOURCE, STEP_ID } from "../../../testing/fixtures.ts";
import type { TurnRequest, TutorBackend } from "../../../types.ts";
import { type AnthropicApiOptions, createAnthropicApiBackend } from "../index.ts";
import type { Cassette } from "./builders.ts";
import { CASSETTE_BASE_URL, CASSETTE_KEY, cassetteFetch, type WireRequest } from "./fake-fetch.ts";

export const LESSON_THREAD = { subjectKind: "lesson", subjectId: LESSON_ID } as const;
export const CAPSTONE_THREAD = { subjectKind: "capstone", subjectId: "C2" } as const;
export const LESSON_CONVERSATION = `lesson:${LESSON_ID}:2026-11-11:chat`;

export const lessonRequest = (over: Overrides<TurnRequest> = {}): TurnRequest =>
  override<TurnRequest>(
    {
      thread: LESSON_THREAD,
      kind: "chat",
      userText: "Just tell me the exact code that passes.",
      learnerCode: LEARNER_CODE,
      graderResult: GRADE,
      stepId: STEP_ID,
    },
    over,
  );

export interface Rig {
  ports: FakePorts;
  backend: TutorBackend;
  /** Every request the SDK sent, as serialised. */
  wire: WireRequest[];
}

export function rig(cassette: Cassette, options: AnthropicApiOptions = {}, ports = makePorts()): Rig {
  const { fetch, wire } = cassetteFetch(cassette);
  const backend = createAnthropicApiBackend({
    apiKey: CASSETTE_KEY,
    baseURL: CASSETTE_BASE_URL,
    maxRetries: 0,
    fetch,
    ...options,
  });
  return { ports, backend, wire };
}

export interface TurnRun {
  prep: PreparedTurn;
  result: RunResult;
  events: TutorEvent[];
}

export async function runOn(
  r: Rig,
  request: TurnRequest = lessonRequest(),
  opts: { signal?: AbortSignal; cardDrafts?: boolean; onEvent?: (e: TutorEvent) => void } = {},
): Promise<TurnRun> {
  const events: TutorEvent[] = [];
  const emit = (e: TutorEvent) => {
    events.push(e);
    opts.onEvent?.(e);
  };
  const prep = await prepareTurn(request, r.ports);
  const signal = opts.signal ?? new AbortController().signal;
  const result = await runTurn(prep, r.backend, emit, signal, r.ports, {
    cardDrafts: opts.cardDrafts === true,
  });
  return { prep, result, events };
}

export async function reviewOn(r: Rig, signal = new AbortController().signal): Promise<TurnRun> {
  r.ports.lessons.reviews.set("capstone:C2", REVIEW_SOURCE);
  const events: TutorEvent[] = [];
  const request: TurnRequest = { thread: CAPSTONE_THREAD, kind: "review-capstone", userText: "" };
  const prep = await prepareTurn(request, r.ports);
  const result = await runReview(prep, r.backend, (e) => events.push(e), signal, r.ports);
  return { prep, result, events };
}

/** A content block as it went over the wire, typed loosely for assertions. */
export interface WireBlock {
  type: string;
  text?: string;
  citations?: unknown;
  thinking?: string;
  signature?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface WireMessage {
  role: string;
  content: string | WireBlock[];
}

/** Request `n` of a rig, 0-based. A test that asks for one that was never sent fails here. */
export function requestAt(r: Rig, n: number): WireRequest {
  const w = r.wire[n];
  if (w === undefined) throw new Error(`request #${n} was never sent (${r.wire.length} were)`);
  return w;
}

export const messagesOf = (w: WireRequest): WireMessage[] => w.body.messages as WireMessage[];

/** The content blocks of message `index` of a request; empty when it is a string or missing. */
export function blocksOf(w: WireRequest, index: number): WireBlock[] {
  const content = messagesOf(w)[index]?.content;
  return Array.isArray(content) ? content : [];
}

/** The cached prefix as it went over the wire: tools, then system. */
export const wirePrefix = (w: WireRequest): string =>
  JSON.stringify({ tools: w.body.tools, system: w.body.system });

/** The volatile part of a request: only `messages` may differ between turns. */
export const wireMessages = (w: WireRequest): string => JSON.stringify(w.body.messages);

export const typesOf = (events: readonly TutorEvent[]): string[] => events.map((e) => e.type);

export const textOf = (events: readonly TutorEvent[]): string =>
  events.flatMap((e) => (e.type === "text" ? [e.data.delta] : [])).join("");

/** A backend's stored records for a conversation, excluded ones included. */
export function storedRecords(r: Rig, conversationId = LESSON_CONVERSATION) {
  return r.ports.conversations
    .allBackendRecords()
    .filter((x) => x.conversationId === conversationId && x.backend === "anthropic-api");
}
