// Scripted failures: stop reasons that end a turn, upstream errors, a stream that goes silent.
// Test code only.
import {
  type Cassette,
  chunkJson,
  delay,
  messageEnd,
  messageStart,
  response,
  textBlock,
  thinkingBlock,
  toolUseBlock,
} from "./builders.ts";
import { CARD_INPUT, cassette } from "./scenarios.ts";

export function refusal(): Cassette {
  return cassette(
    "refusal",
    response("msg_r1", [textBlock(0, ["I can"])], "refusal", {
      output: 1,
      details: {
        type: "refusal",
        category: "general_harms",
        explanation: "declined",
        fallback_credit_token: null,
        fallback_has_prefill_claim: null,
        recommended_model: null,
      },
    }),
  );
}

export function maxTokensMidTool(): Cassette {
  return cassette(
    "max-tokens-mid-tool",
    response(
      "msg_m1",
      [
        textBlock(0, ["Let me draft a card."]),
        toolUseBlock(1, "toolu_m1", "propose_code", chunkJson(CARD_INPUT).slice(0, 9)),
      ],
      "max_tokens",
      { output: 4000 },
    ),
  );
}

export function maxTokensText(): Cassette {
  return cassette(
    "max-tokens-text",
    response("msg_n1", [textBlock(0, ["A long answer that stops mid"])], "max_tokens"),
  );
}

export function maxTokensWhileThinking(): Cassette {
  return cassette(
    "max-tokens-thinking",
    response("msg_k1", [thinkingBlock(0, ["Still working it out"])], "max_tokens"),
  );
}

export function overloadedMidStream(): Cassette {
  return cassette("overloaded-mid-stream", {
    steps: [
      messageStart("msg_o1"),
      ...textBlock(0, ["Partial "]).slice(0, 2),
      { kind: "error", errorType: "overloaded_error", message: "Overloaded" },
    ],
  });
}

export function rateLimited(): Cassette {
  return cassette("rate-limited", {
    httpError: {
      status: 429,
      type: "rate_limit_error",
      message: "slow down",
      headers: { "retry-after": "17" },
    },
    steps: [],
  });
}

/** The upstream error body echoes a credential, as a proxy or a careless server might. */
export function unauthorized(echo: string): Cassette {
  return cassette("unauthorized", {
    httpError: { status: 401, type: "authentication_error", message: `invalid x-api-key: ${echo}` },
    steps: [],
  });
}

export function unreachable(): Cassette {
  return cassette("unreachable", { networkError: "fetch failed: ECONNREFUSED", steps: [] });
}

/** One text delta, a long silence, then the rest: for the abort test. */
export function silentGap(gapMs: number): Cassette {
  return cassette("silent-gap", {
    steps: [
      messageStart("msg_s1"),
      ...textBlock(0, ["before-gap"]).slice(0, 2),
      delay(gapMs),
      ...textBlock(0, ["after-gap"]).slice(1),
      ...messageEnd("end_turn", 4),
    ],
  });
}

/** Every response asks for another tool call: exercises the iteration cap. */
export function runaway(n: number): Cassette {
  return cassette(
    "runaway",
    ...Array.from({ length: n }, (_, i) =>
      response(`msg_w${i}`, [toolUseBlock(0, `toolu_w${i}`, "get_learner_progress", ["{}"])], "tool_use"),
    ),
  );
}
