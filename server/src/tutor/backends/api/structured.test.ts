import { describe, expect, test } from "bun:test";
import { CAPSTONE_REVIEW } from "../../testing/fixtures.ts";
import type { StructuredTurn } from "../../types.ts";
import { rateLimited, runaway } from "./cassettes/failure-scenarios.ts";
import { cassetteClient } from "./cassettes/fake-fetch.ts";
import {
  blocksOf,
  messagesOf,
  requestAt,
  reviewOn,
  rig,
  typesOf,
  type WireBlock,
} from "./cassettes/harness.ts";
import {
  reviewAccepted,
  reviewAfterReminder,
  reviewNeverDelivered,
  reviewRejectedTwice,
  reviewResubmitted,
} from "./cassettes/review-scenarios.ts";
import { runStructuredTurn, StructuredTurnError } from "./structured.ts";

const REVIEW_CONVERSATION = "capstone:C2:2026-11-11:review";
const records = (r: ReturnType<typeof rig>) =>
  r.ports.conversations.allBackendRecords().filter((x) => x.conversationId === REVIEW_CONVERSATION);

describe("a review is delivered through its submit tool", () => {
  test("accepted on the first call: one request, no forced tool choice, no output format", async () => {
    const r = rig(reviewAccepted());
    const { events, result } = await reviewOn(r);
    expect(result).toMatchObject({ ok: true, review: CAPSTONE_REVIEW });
    // Accepted is final: no further model call is made just to hear the model say goodbye.
    expect(r.wire).toHaveLength(1);
    const body = r.wire[0]?.body as { tool_choice: unknown; output_config: Record<string, unknown> };
    expect(body.tool_choice).toEqual({ type: "auto" });
    expect(body.output_config).toEqual({ effort: "high" });
    expect(typesOf(events)).toEqual(["meta", "tool_start", "review", "tool_result", "done"]);
    expect(events.find((e) => e.type === "review")).toMatchObject({
      data: { reviewKind: "capstone", review: CAPSTONE_REVIEW },
    });
    expect(result.usage).toMatchObject({ requests: 1, inputTokens: 800, outputTokens: 400 });
    expect(r.ports.usage.rows).toHaveLength(1);
  });

  test("the stored turn is complete: the tool call and its result, so it can be replayed", async () => {
    const r = rig(reviewAccepted());
    await reviewOn(r);
    const stored = records(r);
    expect(stored.map((x) => [(x.record as { role: string }).role, x.excluded])).toEqual([
      ["user", false],
      ["assistant", false],
      ["user", false],
    ]);
    const result = (stored[2]?.record as { content?: WireBlock[] } | undefined)?.content?.[0];
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "toolu_v1" });
    expect(JSON.parse(result?.content ?? "")).toEqual({ accepted: true, problems: [] });
  });

  test("the review context is in the request: brief, analysis and the learner's code", async () => {
    const r = rig(reviewAccepted());
    const { prep } = await reviewOn(r);
    const sent = JSON.stringify(messagesOf(requestAt(r, 0)));
    expect(sent).toContain("revisions_wanted: 1");
    expect(sent).toContain("An eight-bar groove on two chords");
    expect(sent).toContain("<learner_code>");
    expect(prep.ctx.effort).toBe("high");
  });

  test("a rejected review gets the problems back and one more try", async () => {
    const r = rig(reviewResubmitted());
    const { events, result } = await reviewOn(r);
    expect(result).toMatchObject({ ok: true, review: CAPSTONE_REVIEW });
    expect(r.wire).toHaveLength(2);
    const feedback = blocksOf(requestAt(r, 1), 2)[0];
    const parsed = JSON.parse(feedback?.content ?? "") as { accepted: boolean; problems: string[] };
    expect(parsed.accepted).toBe(false);
    expect(parsed.problems.length).toBeGreaterThan(0);
    expect(typesOf(events).filter((t) => t === "review")).toHaveLength(1);
    expect(result.usage.requests).toBe(2);
  });

  test("rejected twice: no third model call; the caller falls back to liner notes", async () => {
    const r = rig(reviewRejectedTwice());
    const { events, result } = await reviewOn(r);
    expect(result).toMatchObject({ ok: false, review: null, error: { kind: "iteration_limit" } });
    expect(r.wire).toHaveLength(2);
    expect(typesOf(events)).not.toContain("review");
    expect(records(r).every((x) => x.excluded)).toBe(true);
  });

  test("a turn that ends without submitting gets exactly one reminder, in Oak's voice", async () => {
    const r = rig(reviewAfterReminder());
    const { result } = await reviewOn(r);
    expect(result).toMatchObject({ ok: true, review: CAPSTONE_REVIEW });
    const second = messagesOf(requestAt(r, 1));
    expect(second.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    const reminder = blocksOf(requestAt(r, 1), 2)[0]?.text ?? "";
    expect(reminder).toStartWith('<oak_context v="1">\n');
    expect(reminder).toContain("Deliver the review now as one CapstoneReview object.");
    expect(reminder).toEndWith("\n</oak_context>");
  });

  test("a second turn without a submission fails; nothing is invented", async () => {
    const r = rig(reviewNeverDelivered());
    const { result } = await reviewOn(r);
    expect(result).toMatchObject({ ok: false, review: null, error: { kind: "iteration_limit" } });
    expect(r.wire).toHaveLength(2);
    expect(records(r).every((x) => x.excluded)).toBe(true);
  });

  test("an upstream failure surfaces with its kind", async () => {
    const r = rig(rateLimited());
    const { result, events } = await reviewOn(r);
    expect(result).toMatchObject({ ok: false, error: { kind: "rate_limit", retryAfterSec: 17 } });
    expect(events.at(-1)).toMatchObject({ type: "error", data: { kind: "rate_limit" } });
  });
});

test("a failed structured turn throws an error that still carries what the calls cost", async () => {
  const { client } = cassetteClient(runaway(8));
  const input = {
    conversationId: "c",
    kind: "review-capstone",
    lane: "review",
    model: "claude-opus-5-5",
    effort: "high",
    limits: { maxTokens: 32_000, maxIterations: 2 },
    prefix: { persona: "p", syllabus: "s", catalog: "c" },
    prefixVersion: "v",
    tools: [],
    executeTool: async () => ({ content: "{}", isError: false }),
    transcript: [],
    continuity: { records: [], commit: async () => {} },
    user: { oakContext: '<oak_context v="1">\n</oak_context>', learnerCode: null, text: "Review this." },
    isFirstTurn: true,
    schemaName: "CapstoneReview",
    jsonSchema: {},
    submitTool: "submit_capstone_review",
    validate: async () => ({ ok: false, problems: ["unused"] }),
    accepted: () => undefined,
    maxResubmits: 1,
    reminder: "Deliver the review now.",
  } satisfies StructuredTurn<unknown>;
  const thrown = await runStructuredTurn(client, input, new AbortController().signal).catch(
    (e: unknown) => e,
  );
  expect(thrown).toBeInstanceOf(StructuredTurnError);
  const err = thrown as StructuredTurnError;
  expect(err.kind).toBe("iteration_limit");
  expect(err.usage.requests).toBe(2);
  expect(err.calls).toHaveLength(2);
});
