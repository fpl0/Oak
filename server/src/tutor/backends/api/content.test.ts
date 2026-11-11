import { describe, expect, test } from "bun:test";
import type { BetaContentBlock, BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { message, usageOf } from "./cassettes/builders.ts";
import { hasVisibleText, normalizeFallbackBoundary, plain, servedModels } from "./content.ts";

const thinking = (t: string): BetaContentBlock => ({ type: "thinking", thinking: t, signature: "sig==" });
const text = (t: string): BetaContentBlock => ({ type: "text", text: t, citations: null });
const use = (id: string): BetaContentBlock => ({
  type: "tool_use",
  id,
  name: "get_learner_progress",
  input: {},
});
const hop = (from: string, to: string): BetaContentBlock => ({
  type: "fallback",
  from: { model: from },
  to: { model: to },
  trigger: { type: "refusal", category: null, explanation: null } as never,
});

describe("normalizeFallbackBoundary", () => {
  test("without a fallback block the content is returned as it is", () => {
    const content = [thinking("a"), text("b"), use("t1")];
    expect(normalizeFallbackBoundary(content)).toEqual(content);
  });

  test("thinking and tool calls before the LAST boundary go; text and the boundaries stay in place", () => {
    const content = [
      thinking("first"),
      text("kept text"),
      use("dropped-1"),
      hop("claude-opus-5-5", "model-b"),
      thinking("second"),
      use("dropped-2"),
      hop("model-b", "model-c"),
      thinking("third"),
      use("kept"),
    ];
    const kept = normalizeFallbackBoundary(content);
    expect(kept.map((b) => (b.type === "tool_use" ? b.id : b.type))).toEqual([
      "text",
      "fallback",
      "fallback",
      "thinking",
      "kept",
    ]);
    expect(content).toHaveLength(9);
  });
});

describe("servedModels", () => {
  const msg = (over: Partial<BetaMessage>): BetaMessage => ({ ...message("msg_x"), ...over });

  test("a plain response was served by its own model", () => {
    expect(servedModels(msg({}))).toEqual(["claude-opus-5-5"]);
  });

  test("a fallback hop in the content names both sides", () => {
    const m = msg({ model: "model-b", content: [hop("claude-opus-5-5", "model-b"), text("hi")] });
    expect(servedModels(m)).toEqual(["claude-opus-5-5", "model-b"]);
  });

  test("a fallback attempt named only in usage.iterations is counted too", () => {
    const iterations: BetaMessage["usage"]["iterations"] = [
      {
        type: "fallback_message",
        model: "model-b",
        input_tokens: 5,
        output_tokens: 5,
        cache_creation: null,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    ];
    expect(servedModels(msg({ usage: usageOf({ iterations }, 5) }))).toEqual(["claude-opus-5-5", "model-b"]);
  });
});

test("hasVisibleText: thinking and whitespace are not a reply", () => {
  expect(hasVisibleText([thinking("hm"), text("  \n")])).toBe(false);
  expect(hasVisibleText([thinking("hm"), text("Yes.")])).toBe(true);
});

test("plain: a JSON copy without what the SDK hangs on its blocks", () => {
  const block = Object.defineProperty({ type: "text", text: "x" }, "parsed_output", { value: null });
  const copy = plain([block]);
  expect(copy).toEqual([{ type: "text", text: "x" }]);
  expect(Object.getOwnPropertyNames(copy[0])).toEqual(["type", "text"]);
});
